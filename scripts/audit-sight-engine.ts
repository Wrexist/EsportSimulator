/**
 * Audit the sight engine against the pro benchmarks (ESTA demos, 2026-10):
 * the same measures, computed the same way, on simulated rounds.
 *
 *   npx tsx scripts/audit-sight-engine.ts                  # 48 maps
 *   npx tsx scripts/audit-sight-engine.ts --maps 96 --json tmp/sight-audit.json
 *   npx tsx scripts/audit-sight-engine.ts --no-los         # skip the mesh raycasts (fast)
 *   npx tsx scripts/audit-sight-engine.ts --map Nuke       # one map (any baked map, in the pool or not)
 *
 * Rounds come from the production series runner (calibration fixtures, two
 * even 70-rated teams, managed and AI paths alternating). Positions are the
 * engine's own walk (RoundResult.moves), so this audits what the radar shows.
 *
 * Stand-offs follow the pro audit exactly: 2 Hz frames; an enemy pair inside
 * the radius with line of sight is "quiet" unless the pair's own kill comes
 * within the next 2.5 s (ENGAGE_GRACE); a sighting is a run of quiet frames
 * with gaps of up to 1 s. Line of sight is a raycast of the map's collision
 * mesh at standing eye height (scripts/map-world.ts), not the walk-graph bake.
 */
import { writeFileSync } from 'node:fs'
import { seriesRunnerFor } from '../engine/match/calibration/run'
import { buildSide, even } from '../engine/match/calibration/fixtures'
import { ACTIVE_MAP_POOL } from '../data/map-pool'
import { deriveSeed } from '../engine/rng'
import { getRoundMap } from '../data/round-maps'
import { navGraphFor } from '../engine/match/round-script-nav'
import { scriptFromMoves, hasMoves } from '../engine/match/round-script-moves'
import { sampleTrack } from '../engine/match/round-script-sample'
import type { Vec3 } from '../engine/spatial/types'
import type { Floor, RoundScript } from '../engine/match/round-script-types'
import type { RoundResult } from '../types'
import { DRAFTS, World } from './map-world'

const ENGAGE_GRACE = 2.5
const FRAME = 0.5
const GAP = 1
/** 4 m in map-% (1 map-% ≈ 1.3 m). */
const FOUR_M = 4 / 1.3

/** Pro values (docs/revamp/pro-benchmarks/PRO_BENCHMARKS_2026-10.md). */
const PRO = {
    ctWin: 53.8, killsPerRound: 6.53, tradeShare: 16, plantRate: 52, tWinAfterPlant: 76, tWinNoPlant: 13, tBombShare: 41.6,
    firstKillMedian: 27, plantMedian: 75.6, roundMedian: 92, killDistMedian: 12.5,
    quiet6: 0.38, quiet4m: 0.05, quiet10: 1.47, sightings3s6: 0.03, sightings3s10: 0.12,
}

interface Args { maps: number; seed: number; json?: string; los: boolean; only?: string }

function parseArgs(argv: string[]): Args {
    const a: Args = { maps: 48, seed: 20261024, los: true }
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--maps') a.maps = Number(argv[++i])
        else if (argv[i] === '--seed') a.seed = Number(argv[++i])
        else if (argv[i] === '--json') a.json = argv[++i]
        else if (argv[i] === '--no-los') a.los = false
        else if (argv[i] === '--map') a.only = argv[++i]
        else throw new Error(`unknown argument ${argv[i]}`)
    }
    return a
}

const median = (xs: number[]) => {
    if (!xs.length) return NaN
    const s = [...xs].sort((a, b) => a - b)
    return s[s.length >> 1]
}
const pct = (n: number, d: number) => (d ? 100 * n / d : NaN)

/** Line of sight between two radar points (eye to eye over any ground there), cached on a 0.25 map-% grid. */
class Sight {
    private readonly ground = new Map<string, Vec3[]>()
    constructor(private readonly W: World) {}
    private groundAt(x: number, y: number, floor: Floor): Vec3[] {
        const k = `${floor}:${Math.round(x * 4)}:${Math.round(y * 4)}`
        let g = this.ground.get(k)
        if (!g) { g = this.W.grounds(Math.round(x * 4) / 4, Math.round(y * 4) / 4, floor); this.ground.set(k, g) }
        return g
    }
    sees(a: { x: number; y: number; floor: Floor }, b: { x: number; y: number; floor: Floor }): boolean {
        const ga = this.groundAt(a.x, a.y, a.floor), gb = this.groundAt(b.x, b.y, b.floor)
        if (!ga.length || !gb.length) return true
        return ga.some(p => gb.some(q => this.W.los(p, q)))
    }
}

interface StandOff { pairSeconds: number; sightings3s: number }

function standOffs(script: RoundScript, radius: number, sight: Sight | null): StandOff {
    const ids = Object.keys(script.tracks).filter(id => script.tracks[id].length)
    const died = new Map(script.deaths.map(d => [d.victimId, d.t]))
    const killsBetween = (a: string, b: string, t: number) => script.deaths.some(d => d.t >= t && d.t <= t + ENGAGE_GRACE
        && ((d.killerId === a && d.victimId === b) || (d.killerId === b && d.victimId === a)))
    let pairSeconds = 0, sightings3s = 0
    const run = new Map<string, { start: number; last: number }>()
    const close = (key: string) => {
        const r = run.get(key)
        if (r && r.last - r.start + FRAME >= 3) sightings3s++
        run.delete(key)
    }
    for (let t = 0; t <= script.endTime; t += FRAME) {
        const pos = new Map(ids.map(id => [id, sampleTrack(script.tracks[id], t)]))
        for (const a of ids) for (const b of ids) {
            if (a >= b || script.sides[a] === script.sides[b]) continue
            const key = a + '|' + b
            const pa = pos.get(a)!, pb = pos.get(b)!
            const quiet = (died.get(a) ?? Infinity) > t && (died.get(b) ?? Infinity) > t && pa.floor === pb.floor
                && Math.hypot(pa.x - pb.x, pa.y - pb.y) <= radius && !killsBetween(a, b, t) && (!sight || sight.sees(pa, pb))
            if (quiet) {
                pairSeconds += FRAME
                const r = run.get(key)
                if (r && t - r.last <= GAP + 1e-9) r.last = t
                else { close(key); run.set(key, { start: t, last: t }) }
            } else {
                const r = run.get(key)
                if (r && t - r.last > GAP + 1e-9) close(key)
            }
        }
    }
    for (const key of [...run.keys()]) close(key)
    return { pairSeconds, sightings3s }
}

function main(): void {
    const args = parseArgs(process.argv.slice(2))
    const runner = seriesRunnerFor('script-v1')
    if (!runner) throw new Error('script-v1 is not runnable')
    const home = buildSide({ id: 'HOME', skills: even(70) })
    const away = buildSide({ id: 'AWAY', skills: even(70) })
    const homeIds = new Set(home.players.map(p => p.id))
    const worlds = new Map<string, Sight | null>()

    const s = {
        rounds: 0, ct: 0, kills: 0, trades: 0, plants: 0, tWinPlant: 0, noPlant: 0, tWinNoPlant: 0, tWins: 0, tBomb: 0,
        first: [] as number[], plantT: [] as number[], len: [] as number[], dist: [] as number[], killT: [] as number[],
        quiet6: 0, quiet4m: 0, quiet10: 0, sightings6: 0, sightings10: 0, replayed: 0, ms: 0,
    }
    for (let i = 0; i < args.maps; i++) {
        const pool = args.only ? [args.only as typeof ACTIVE_MAP_POOL[number]] : ACTIVE_MAP_POOL
        const map = pool[i % pool.length]
        const input = { id: `audit-${i}`, seed: deriveSeed(args.seed, 'audit', i), map, home, away, managedTeamId: i % 2 ? undefined : 'HOME' }
        const t0 = Date.now()
        const res = i % 2 ? runner.ai(input) : runner.managed(input)
        s.ms += Date.now() - t0
        const rm = getRoundMap(map)
        if (!rm) continue
        navGraphFor(rm)
        if (!worlds.has(map)) worlds.set(map, args.los && DRAFTS[map] ? new Sight(new World(map)) : null)
        const sight = worlds.get(map)!
        for (const m of res.maps) for (const r of m.rounds as RoundResult[]) {
            s.rounds++
            if (r.winner === 'ct') s.ct++
            const ev = r.events ?? []
            const kills = ev.filter(e => e.type === 'KILL')
            s.kills += kills.length
            s.trades += kills.filter(k => k.isTrade).length
            if (kills[0]) s.first.push(kills[0].time)
            for (const k of kills) s.killT.push(k.time)
            const plant = ev.find(e => e.type === 'PLANT')
            const end = ev.find(e => e.type === 'ROUND_END')
            if (end) s.len.push(end.time - 2)
            if (plant) { s.plants++; s.plantT.push(plant.time); if (r.winner === 't') s.tWinPlant++ } else { s.noPlant++; if (r.winner === 't') s.tWinNoPlant++ }
            if (r.winner === 't') { s.tWins++; if (r.winType === 'BOMB_EXPLODED') s.tBomb++ }
            if (!hasMoves(r)) continue
            s.replayed++
            const ctIds = new Set(r.moves!.ids.filter(id => homeIds.has(id) === (r.ctTeam === 'HOME')))
            const script = scriptFromMoves(r, map, rm, ctIds)
            for (const d of script.deaths) s.dist.push(Math.hypot(d.at.x - d.from.x, d.at.y - d.from.y))
            const a = standOffs(script, 6, sight), b = standOffs(script, FOUR_M, sight), c = standOffs(script, 10, sight)
            s.quiet6 += a.pairSeconds; s.sightings6 += a.sightings3s
            s.quiet4m += b.pairSeconds
            s.quiet10 += c.pairSeconds; s.sightings10 += c.sightings3s
        }
        process.stderr.write(`\r${i + 1}/${args.maps} maps`)
    }
    process.stderr.write('\n')
    const bins = Array.from({ length: 12 }, (_, k) => pct(s.killT.filter(t => t >= k * 10 && t < (k + 1) * 10).length, s.killT.length))
    const per = (v: number) => v / Math.max(1, s.replayed)
    const rows: [string, number, number, number][] = [
        ['CT round win %', pct(s.ct, s.rounds), PRO.ctWin, 1],
        ['Kills per round', s.kills / s.rounds, PRO.killsPerRound, 2],
        ['Trade kills %', pct(s.trades, s.kills), PRO.tradeShare, 1],
        ['Plant rate %', pct(s.plants, s.rounds), PRO.plantRate, 1],
        ['T win after a plant %', pct(s.tWinPlant, s.plants), PRO.tWinAfterPlant, 1],
        ['T win without a plant %', pct(s.tWinNoPlant, s.noPlant), PRO.tWinNoPlant, 1],
        ['T wins by the bomb %', pct(s.tBomb, s.tWins), PRO.tBombShare, 1],
        ['First kill, median s', median(s.first), PRO.firstKillMedian, 1],
        ['Plant time, median s', median(s.plantT), PRO.plantMedian, 1],
        ['Round length, median s', median(s.len), PRO.roundMedian, 1],
        ['Kill distance, median map-%', median(s.dist), PRO.killDistMedian, 1],
        ['Quiet pair-s/round ≤ 4 m', per(s.quiet4m), PRO.quiet4m, 2],
        ['Quiet pair-s/round ≤ 6 map-%', per(s.quiet6), PRO.quiet6, 2],
        ['Quiet pair-s/round ≤ 10 map-%', per(s.quiet10), PRO.quiet10, 2],
        ['Sightings ≥ 3 s/round ≤ 6 map-%', per(s.sightings6), PRO.sightings3s6, 3],
        ['Sightings ≥ 3 s/round ≤ 10 map-%', per(s.sightings10), PRO.sightings3s10, 3],
    ]
    console.log(`Sight engine audit: ${args.maps} maps, ${s.rounds} rounds (${s.replayed} replayed from moves), ${(s.ms / args.maps).toFixed(0)} ms/map, line of sight ${args.los ? 'mesh raycasts' : 'off'}`)
    console.log('')
    console.log('| Measure | Sim | Pro |')
    console.log('|---|---|---|')
    for (const [label, v, pro, dp] of rows) console.log(`| ${label} | ${v.toFixed(dp)} | ${pro} |`)
    console.log('')
    console.log(`Kills by 10 s of the round (%): ${bins.map(b => b.toFixed(1)).join(' · ')}`)
    if (args.json) {
        writeFileSync(args.json, JSON.stringify({
            maps: args.maps, rounds: s.rounds, seed: args.seed, los: args.los,
            rows: rows.map(([label, sim, pro]) => ({ label, sim: Number(sim.toFixed(3)), pro })), killsBy10s: bins.map(b => Number(b.toFixed(2))),
        }, null, 2) + '\n')
    }
}

main()
