/**
 * Where pros stand before the first fight: per map, the spots CTs set up on
 * and Ts wait on, from the ESTA pro demos (2 Hz frames, compact extract of
 * docs/revamp/pro-benchmarks/scripts/extract.py on the PR #65 benchmark
 * branch). Positions go through the map's registration (map-world.ts) into
 * the round map's own map-%.
 *
 *   npx tsx scripts/pro-spots.ts <compact demo dir> [--out tmp/pro-spots] [Map ...]
 *
 * Writes <out>/<Map>.json: { ct: Spot[], t: Spot[] }, each spot a cluster
 * centre with its share of that side's settled frames. A frame counts as
 * settled when the player moves under 0.6 map-% in the next second, between
 * 8 s into the round and the round's first kill (or 60 s).
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import path from 'node:path'
import { toRadar, type Vec3 } from '../engine/spatial/types'
import type { Floor } from '../engine/match/round-script-types'
import { DRAFTS, World } from './map-world'

const DEMO_MAPS: Record<string, string> = { de_mirage: 'Mirage', de_inferno: 'Inferno', de_nuke: 'Nuke', de_ancient: 'Ancient', de_overpass: 'Overpass', de_vertigo: 'Vertigo' }
const FROM = 8
const UNTIL = 60
const SETTLED = 0.6
/** Grid cell for the density (map-%), cluster radius and the gap kept between spots. */
const CELL = 0.5
const RADIUS = 2
const GAP = 3.5
const MAX_SPOTS = 40

export interface ProSpot { x: number; y: number; floor: Floor; share: number; frames: number }

function toMap(W: World, p: Vec3): { x: number; y: number; floor: Floor } {
    const floor: Floor = W.split !== null && p[2] < W.split ? 'lower' : 'upper'
    const [rx, ry] = toRadar(p, W.ref)
    const [a, b, c, d, e, f] = W.reg[floor]!
    const det = a * e - b * d
    const u = rx - c, v = ry - f
    return { x: (e * u - b * v) / det, y: (a * v - d * u) / det, floor }
}

class Density {
    readonly cells = new Map<string, number>()
    total = 0
    add(x: number, y: number, floor: Floor) {
        const k = `${floor}:${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`
        this.cells.set(k, (this.cells.get(k) ?? 0) + 1)
        this.total++
    }
    /** Greedy peaks: the densest disc, its weighted centre, then everything within GAP is taken. */
    spots(): ProSpot[] {
        const pts = [...this.cells].map(([k, n]) => {
            const [floor, gx, gy] = k.split(':')
            return { floor: floor as Floor, x: (Number(gx) + 0.5) * CELL, y: (Number(gy) + 0.5) * CELL, n }
        })
        const used = new Set<number>()
        const out: ProSpot[] = []
        while (out.length < MAX_SPOTS) {
            let best = -1, mass = 0
            for (let i = 0; i < pts.length; i++) {
                if (used.has(i)) continue
                let m = 0
                for (let j = 0; j < pts.length; j++) {
                    if (used.has(j) || pts[j].floor !== pts[i].floor) continue
                    if (Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y) <= RADIUS) m += pts[j].n
                }
                if (m > mass) { mass = m; best = i }
            }
            if (best < 0 || mass < this.total * 0.004) break
            const c = pts[best]
            let sx = 0, sy = 0, sn = 0
            for (let j = 0; j < pts.length; j++) {
                if (used.has(j) || pts[j].floor !== c.floor) continue
                const d = Math.hypot(pts[j].x - c.x, pts[j].y - c.y)
                if (d <= RADIUS) { sx += pts[j].x * pts[j].n; sy += pts[j].y * pts[j].n; sn += pts[j].n }
            }
            for (let j = 0; j < pts.length; j++) if (pts[j].floor === c.floor && Math.hypot(pts[j].x - c.x, pts[j].y - c.y) <= GAP) used.add(j)
            out.push({ x: +(sx / sn).toFixed(2), y: +(sy / sn).toFixed(2), floor: c.floor, share: +(mass / this.total).toFixed(4), frames: mass })
        }
        return out
    }
}

function main(): void {
    const argv = process.argv.slice(2)
    const dir = argv[0]
    let out = 'tmp/pro-spots'
    const wanted: string[] = []
    for (let i = 1; i < argv.length; i++) {
        if (argv[i] === '--out') out = argv[++i]
        else wanted.push(argv[i])
    }
    const worlds = new Map<string, World>()
    const dens = new Map<string, { ct: Density; t: Density; rounds: number }>()
    for (const f of readdirSync(dir).filter(x => x.endsWith('.json.gz')).sort()) {
        const d = JSON.parse(gunzipSync(readFileSync(path.join(dir, f))).toString())
        const mapId = DEMO_MAPS[d.meta.mapName]
        if (!mapId || !DRAFTS[mapId] || (wanted.length && !wanted.includes(mapId))) continue
        let W = worlds.get(mapId)
        if (!W) { W = new World(mapId); worlds.set(mapId, W); dens.set(mapId, { ct: new Density(), t: new Density(), rounds: 0 }) }
        const D = dens.get(mapId)!
        const tr = d.meta.tickRate || 128
        for (const r of d.rounds) {
            const firstKill = Math.min(...(r.kills as number[][]).map(k => k[0]), Infinity)
            const until = Math.min(UNTIL, (firstKill - r.fte) / tr - 1)
            const frames = (r.frames as [number, any[], number][]).map(fr => ({ t: (fr[0] - r.fte) / tr, ps: fr[1] })).filter(fr => fr.t >= 0)
            if (frames.length < 30) continue
            D.rounds++
            const byId = new Map<string, { t: number; p: { x: number; y: number; floor: Floor }; side: number }[]>()
            for (const fr of frames) for (const p of fr.ps) {
                let s = byId.get(String(p[0]))
                if (!s) byId.set(String(p[0]), s = [])
                s.push({ t: fr.t, p: toMap(W, [p[2], p[3], p[4]]), side: p[1] })
            }
            for (const s of byId.values()) for (let i = 0; i + 2 < s.length; i++) {
                const a = s[i], b = s[i + 2]
                if (a.t < FROM || a.t > until || b.t - a.t > 1.2) continue
                if (Math.hypot(b.p.x - a.p.x, b.p.y - a.p.y) > SETTLED || a.p.floor !== b.p.floor) continue
                ;(a.side === 1 ? D.ct : D.t).add(a.p.x, a.p.y, a.p.floor)
            }
        }
    }
    mkdirSync(out, { recursive: true })
    for (const [mapId, D] of dens) {
        const res = { mapId, rounds: D.rounds, ct: D.ct.spots(), t: D.t.spots() }
        writeFileSync(path.join(out, `${mapId}.json`), JSON.stringify(res, null, 1) + '\n')
        console.log(`${mapId}: ${D.rounds} rounds, CT ${res.ct.length} spots (top ${res.ct.slice(0, 3).map(s => s.share).join(', ')}), T ${res.t.length} spots`)
    }
}

main()
