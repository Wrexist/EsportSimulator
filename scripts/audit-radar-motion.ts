/**
 * How players move on the radar, next to how pros move (ESTA demos, 2 Hz).
 *
 *   npx tsx scripts/audit-radar-motion.ts --pro <compact demo dir> [--maps 24] [--demos 200] [--json out.json] [--raw]
 *
 * --raw replays the engine's exact line (no loosening, round-script-motion.ts).
 *
 * The compact demo dir is the output of the pro-benchmark extract
 * (docs/revamp/pro-benchmarks/scripts/extract.py on the PR #65 benchmark
 * branch): one .json.gz per demo with 2 Hz frames. Pro positions go through
 * the map's registration (map-world.ts) into the game's own map-%, so both
 * sides are measured on the same picture.
 *
 * Measures, per living player and 0.5 s frame (round time 0 = freeze end):
 *  - pace: share of frames standing (< 10% of run speed), walking, running (> 60%)
 *  - off the route lines: distance to the nearest RoundMap route polyline
 *  - turning: heading change between two moving frames
 *  - nearest teammate while moving
 *  - heatmap overlap per side (2 map-% cells, Σ min of the two shares)
 *  - off the nav mesh: sim frames whose radar point has no walkable ground
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import path from 'node:path'
import { seriesRunnerFor } from '../engine/match/calibration/run'
import { buildSide, even } from '../engine/match/calibration/fixtures'
import { ACTIVE_MAP_POOL } from '../data/map-pool'
import { deriveSeed } from '../engine/rng'
import { getRoundMap } from '../data/round-maps'
import { navGraphFor } from '../engine/match/round-script-nav'
import { scriptFromMoves, hasMoves } from '../engine/match/round-script-moves'
import { sampleTrack } from '../engine/match/round-script-sample'
import { toRadar, type Vec3 } from '../engine/spatial/types'
import type { Floor, RoundMap } from '../engine/match/round-script-types'
import type { RoundResult } from '../types'
import { DRAFTS, World } from './map-world'

const FRAME = 0.5
const CELL = 2
const DEMO_MAPS: Record<string, string> = { de_mirage: 'Mirage', de_inferno: 'Inferno', de_nuke: 'Nuke', de_ancient: 'Ancient', de_overpass: 'Overpass', de_vertigo: 'Vertigo' }

interface Args { pro?: string; maps: number; demos: number; seed: number; json?: string; raw: boolean }
function parseArgs(argv: string[]): Args {
    const a: Args = { maps: 24, demos: 200, seed: 20261024, raw: false }
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--pro') a.pro = argv[++i]
        else if (argv[i] === '--maps') a.maps = Number(argv[++i])
        else if (argv[i] === '--demos') a.demos = Number(argv[++i])
        else if (argv[i] === '--seed') a.seed = Number(argv[++i])
        else if (argv[i] === '--json') a.json = argv[++i]
        else if (argv[i] === '--raw') a.raw = true
        else throw new Error(`unknown argument ${argv[i]}`)
    }
    return a
}

type P = { x: number; y: number; floor: Floor }
/** One round's positions: per player, a 2 Hz series (undefined once dead). */
interface Series { side: 'T' | 'CT'; pts: (P | undefined)[] }

/** World → game map-% (the inverse of World's registration). */
function toMap(W: World, p: Vec3): P {
    const floor: Floor = W.split !== null && p[2] < W.split ? 'lower' : 'upper'
    const [rx, ry] = toRadar(p, W.ref)
    const [a, b, c, d, e, f] = W.reg[floor]!
    const det = a * e - b * d
    const u = rx - c, v = ry - f
    return { x: (e * u - b * v) / det, y: (a * v - d * u) / det, floor }
}

/** Ground under a map-% point on its floor (strict: no search around it). */
function walkable(W: World, p: P): boolean {
    const [a, b, c, d, e, f] = W.reg[p.floor]!
    const rx = a * p.x + b * p.y + c, ry = d * p.x + e * p.y + f
    const s = W.ref.transform.scale * 10.24
    const wx = W.ref.transform.pos_x + rx * s, wy = W.ref.transform.pos_y - ry * s
    for (const g of W.nav.surfaces(wx, wy)) {
        const fl: Floor = W.split !== null && g.point[2] < W.split ? 'lower' : 'upper'
        if (fl === p.floor) return true
    }
    return false
}

/** Distance (map-%) to the nearest route polyline, on a 0.25 map-% raster. */
class RouteField {
    private readonly d = new Float32Array(400 * 400).fill(99)
    constructor(map: RoundMap) {
        const R = 6 // only distances up to this matter
        for (const r of map.routes) for (let i = 1; i < r.points.length; i++) {
            const p = r.points[i - 1], q = r.points[i]
            const x0 = Math.max(0, Math.floor((Math.min(p.x, q.x) - R) * 4)), x1 = Math.min(399, Math.ceil((Math.max(p.x, q.x) + R) * 4))
            const y0 = Math.max(0, Math.floor((Math.min(p.y, q.y) - R) * 4)), y1 = Math.min(399, Math.ceil((Math.max(p.y, q.y) + R) * 4))
            const dx = q.x - p.x, dy = q.y - p.y, l2 = dx * dx + dy * dy || 1e-9
            for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
                const x = gx / 4, y = gy / 4
                const u = Math.max(0, Math.min(1, ((x - p.x) * dx + (y - p.y) * dy) / l2))
                const dd = Math.hypot(x - p.x - dx * u, y - p.y - dy * u)
                const k = gx * 400 + gy
                if (dd < this.d[k]) this.d[k] = dd
            }
        }
    }
    at(x: number, y: number): number {
        const gx = Math.round(x * 4), gy = Math.round(y * 4)
        if (gx < 0 || gy < 0 || gx > 399 || gy > 399) return 99
        return this.d[gx * 400 + gy]
    }
}

class Stats {
    frames = 0; still = 0; walk = 0; run = 0
    off: number[] = []
    turn: number[] = []
    mate: number[] = []
    offMesh = 0; meshChecked = 0
    heat: Record<string, Map<string, number>> = {}
    rounds = 0
    add(map: RoundMap, field: RouteField, mapId: string, round: Series[], W: World | null) {
        this.rounds++
        const v = map.runSpeed * FRAME
        for (const s of round) {
            const key = `${mapId}:${s.side}`
            const h = this.heat[key] ??= new Map()
            for (let i = 0; i < s.pts.length; i++) {
                const p = s.pts[i]
                if (!p) continue
                this.frames++
                const cell = `${p.floor}:${Math.floor(p.x / CELL)}:${Math.floor(p.y / CELL)}`
                h.set(cell, (h.get(cell) ?? 0) + 1)
                this.off.push(field.at(p.x, p.y))
                if (W && i % 4 === 0) { this.meshChecked++; if (!walkable(W, p)) this.offMesh++ }
                const q = s.pts[i + 1]
                if (!q) continue
                const step = Math.hypot(q.x - p.x, q.y - p.y)
                if (step > v * 2) continue // teleport / floor glitch
                if (step < 0.1 * v) this.still++
                else if (step > 0.6 * v) this.run++
                else this.walk++
                const r = s.pts[i + 2]
                if (step > 0.3 * v && r) {
                    const step2 = Math.hypot(r.x - q.x, r.y - q.y)
                    if (step2 > 0.3 * v && step2 < v * 2) {
                        const a1 = Math.atan2(q.y - p.y, q.x - p.x), a2 = Math.atan2(r.y - q.y, r.x - q.x)
                        let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d
                        this.turn.push(d * 180 / Math.PI)
                    }
                    let best = 99
                    for (const o of round) if (o !== s && o.side === s.side) {
                        const m = o.pts[i]
                        if (m && m.floor === p.floor) best = Math.min(best, Math.hypot(m.x - p.x, m.y - p.y))
                    }
                    if (best < 99) this.mate.push(best)
                }
            }
        }
    }
}

const q = (xs: number[], f: number) => { if (!xs.length) return NaN; const s = Float64Array.from(xs).sort(); return s[Math.min(s.length - 1, Math.floor(f * s.length))] }
const share = (n: number, d: number) => (d ? (100 * n / d).toFixed(1) : '–')

function overlap(a: Map<string, number>, b: Map<string, number>): number {
    let ta = 0, tb = 0
    for (const v of a.values()) ta += v
    for (const v of b.values()) tb += v
    let o = 0
    for (const [k, v] of a) o += Math.min(v / ta, (b.get(k) ?? 0) / tb)
    return o
}

function proSeries(args: Args, worlds: Map<string, World>, fields: Map<string, RouteField>, maps: Map<string, RoundMap>, out: Stats): void {
    const files = readdirSync(args.pro!).filter(f => f.endsWith('.json.gz')).sort().slice(0, args.demos)
    let used = 0
    for (const f of files) {
        const d = JSON.parse(gunzipSync(readFileSync(path.join(args.pro!, f))).toString())
        const mapId = DEMO_MAPS[d.meta.mapName]
        if (!mapId || !maps.has(mapId) || !DRAFTS[mapId]) continue
        used++
        const W = worlds.get(mapId)!
        const tr = d.meta.tickRate || 128
        for (const r of d.rounds) {
            const frames = (r.frames as [number, any[], number][]).filter(fr => fr[0] >= r.fte && fr[0] <= r.end)
            if (frames.length < 20) continue
            const byId = new Map<string, Series>()
            frames.forEach(fr => {
                const k = Math.round((fr[0] - r.fte) / tr / FRAME)
                for (const p of fr[1]) {
                    let s = byId.get(String(p[0]))
                    if (!s) { s = { side: p[1] === 0 ? 'T' : 'CT', pts: [] }; byId.set(String(p[0]), s) }
                    s.pts[k] = toMap(W, [p[2], p[3], p[4]])
                }
            })
            out.add(maps.get(mapId)!, fields.get(mapId)!, mapId, [...byId.values()], W)
        }
        process.stderr.write(`\rpro ${used} demos`)
    }
    process.stderr.write('\n')
}

function simSeries(args: Args, worlds: Map<string, World>, fields: Map<string, RouteField>, maps: Map<string, RoundMap>, out: Stats): void {
    const runner = seriesRunnerFor('script-v1')
    if (!runner) throw new Error('script-v1 is not runnable')
    const home = buildSide({ id: 'HOME', skills: even(70) })
    const away = buildSide({ id: 'AWAY', skills: even(70) })
    const homeIds = new Set(home.players.map(p => p.id))
    const pool = ACTIVE_MAP_POOL.filter(m => maps.has(m))
    for (let i = 0; i < args.maps; i++) {
        const map = pool[i % pool.length]
        const input = { id: `motion-${i}`, seed: deriveSeed(args.seed, 'motion', i), map, home, away, managedTeamId: i % 2 ? undefined : 'HOME' }
        const res = i % 2 ? runner.ai(input) : runner.managed(input)
        const rm = maps.get(map)!
        navGraphFor(rm)
        for (const m of res.maps) for (const r of m.rounds as RoundResult[]) {
            if (!hasMoves(r)) continue
            const ctIds = new Set(r.moves!.ids.filter(id => homeIds.has(id) === (r.ctTeam === 'HOME')))
            const script = scriptFromMoves(r, map, rm, ctIds, { loosen: !args.raw })
            const deathT = new Map(script.deaths.map(d => [d.victimId, d.t]))
            const series: Series[] = Object.entries(script.tracks).map(([id, track]) => {
                const pts: (P | undefined)[] = []
                const end = Math.min(deathT.get(id) ?? Infinity, script.endTime)
                for (let k = 0; k * FRAME <= end && track.length; k++) {
                    const p = sampleTrack(track, k * FRAME)
                    pts[k] = { x: p.x, y: p.y, floor: p.floor }
                }
                return { side: script.sides[id], pts }
            })
            out.add(rm, fields.get(map)!, map, series, worlds.get(map) ?? null)
        }
        process.stderr.write(`\rsim ${i + 1}/${args.maps} maps`)
    }
    process.stderr.write('\n')
}

function main(): void {
    const args = parseArgs(process.argv.slice(2))
    const maps = new Map<string, RoundMap>(), worlds = new Map<string, World>(), fields = new Map<string, RouteField>()
    for (const id of Object.values(DEMO_MAPS)) {
        const rm = getRoundMap(id)
        if (!rm || !DRAFTS[id] || !ACTIVE_MAP_POOL.includes(id as never)) continue
        maps.set(id, rm); worlds.set(id, new World(id)); fields.set(id, new RouteField(rm))
    }
    const sim = new Stats(), pro = new Stats()
    simSeries(args, worlds, fields, maps, sim)
    if (args.pro) proSeries(args, worlds, fields, maps, pro)
    const row = (label: string, f: (s: Stats) => string) => console.log(`| ${label} | ${f(sim)} | ${args.pro ? f(pro) : '–'} |`)
    console.log(`Radar motion${args.raw ? ' (raw engine line)' : ''}: sim ${sim.rounds} rounds, pro ${pro.rounds} rounds (maps: ${[...maps.keys()].join(', ')})`)
    console.log('')
    console.log('| Measure | Sim | Pro |')
    console.log('|---|---|---|')
    const moving = (s: Stats) => s.still + s.walk + s.run
    row('Standing % of frames', s => share(s.still, moving(s)))
    row('Walking % of frames', s => share(s.walk, moving(s)))
    row('Running % of frames', s => share(s.run, moving(s)))
    row('Off the route lines, median map-%', s => q(s.off, 0.5).toFixed(2))
    row('Off the route lines, 90th pct map-%', s => q(s.off, 0.9).toFixed(2))
    row('Frames > 2 map-% off a route %', s => share(s.off.filter(d => d > 2).length, s.off.length))
    row('Turn per 0.5 s while moving, median °', s => q(s.turn, 0.5).toFixed(1))
    row('Turn per 0.5 s, share ≥ 45° %', s => share(s.turn.filter(t => t >= 45).length, s.turn.length))
    row('Nearest teammate while moving, median map-%', s => q(s.mate, 0.5).toFixed(2))
    row('Nearest teammate < 1.5 map-% %', s => share(s.mate.filter(d => d < 1.5).length, s.mate.length))
    row('No nav-mesh ground right under them %', s => (s.meshChecked ? share(s.offMesh, s.meshChecked) : '–'))
    if (args.pro) {
        console.log('')
        console.log('Heatmap overlap with pro (2 map-% cells, 1 = same places):')
        for (const k of Object.keys(sim.heat).sort()) if (pro.heat[k]) console.log(`  ${k}: ${overlap(sim.heat[k], pro.heat[k]).toFixed(2)}`)
    }
    if (args.json) writeFileSync(args.json, JSON.stringify({ sim: summary(sim), pro: summary(pro) }, null, 2))
}

function summary(s: Stats) {
    return { rounds: s.rounds, frames: s.frames, still: s.still, walk: s.walk, run: s.run, offMedian: q(s.off, 0.5), off90: q(s.off, 0.9), turnMedian: q(s.turn, 0.5), mateMedian: q(s.mate, 0.5), offMesh: s.offMesh, meshChecked: s.meshChecked }
}

main()
