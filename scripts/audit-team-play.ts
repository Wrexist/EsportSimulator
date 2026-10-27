/**
 * Team play audit: how the sides react inside a round (retakes, saves,
 * rotations, the post-plant), measured the same way on simulated rounds as
 * on the pro demos (docs/revamp/team-play/pro-team-play.json, made by
 * docs/revamp/team-play/iq_pro.py from the ESTA demos).
 *
 *   npx tsx scripts/audit-team-play.ts                 # 48 maps
 *   npx tsx scripts/audit-team-play.ts --maps 96 --json tmp/team-play.json
 *
 * Rounds come from the production series runner (two even 70-rated teams,
 * managed and AI paths alternating), positions from RoundResult.moves.
 * Distances are metres (1 map-% ≈ 1.3 m on the radar, 1 unit = 1.905 cm in
 * the demos). Nuke is left out of the map measures: its sites sit on top of
 * each other.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { seriesRunnerFor } from '../engine/match/calibration/run'
import { buildSide, even } from '../engine/match/calibration/fixtures'
import { ACTIVE_MAP_POOL } from '../data/map-pool'
import { deriveSeed } from '../engine/rng'
import { getRoundMap } from '../data/round-maps'
import { scriptFromMoves, hasMoves } from '../engine/match/round-script-moves'
import { sampleTrack } from '../engine/match/round-script-sample'
import type { RoundResult } from '../types'

const M = 1.3
const HIT_M = 12, HOLD_M = 16, FAR_M = 30, RETAKE_M = 10
const FRAME = 0.5

interface Args { maps: number; seed: number; json?: string; pro: string }
function parseArgs(argv: string[]): Args {
    const a: Args = { maps: 48, seed: 20261027, pro: 'docs/revamp/team-play/pro-team-play.json' }
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--maps') a.maps = Number(argv[++i])
        else if (argv[i] === '--seed') a.seed = Number(argv[++i])
        else if (argv[i] === '--json') a.json = argv[++i]
        else if (argv[i] === '--pro') a.pro = argv[++i]
        else throw new Error(`unknown argument ${argv[i]}`)
    }
    return a
}

type Tab = Record<string, [number, number]>
export interface TeamPlay {
    rounds: number
    states: Tab
    plant: Tab
    ctSave: Tab
    tSave: [number, number]
    bombed: [number, number]
    openSite: [number, number, number]
    ctAtPlant: [number, number, number, number]
    killsPrePlant: [number, number, number, number, number]
    rotate: number[]
    rotateNever: number
    rotateDied: number
    retakeGap: number[]
    postDist: number[]
}

const bump = (tab: Tab, key: string, win: number) => {
    const e = tab[key] ?? (tab[key] = [0, 0])
    e[0]++
    e[1] += win
}
const median = (xs: number[]) => {
    if (!xs.length) return NaN
    const s = [...xs].sort((a, b) => a - b)
    return s[s.length >> 1]
}
const pct = (n: number, d: number) => (d ? 100 * n / d : NaN)
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
/** Mean of a 0..4+ histogram (the top bin counts as 4). */
const mean5 = (h: number[]) => sum(h.map((n, k) => n * k)) / Math.max(1, sum(h))
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) * M

export function emptyTeamPlay(): TeamPlay {
    return { rounds: 0, states: {}, plant: {}, ctSave: {}, tSave: [0, 0], bombed: [0, 0], openSite: [0, 0, 0], ctAtPlant: [0, 0, 0, 0], killsPrePlant: [0, 0, 0, 0, 0], rotate: [], rotateNever: 0, rotateDied: 0, retakeGap: [], postDist: [] }
}

/** Adds one round to `R`. `ctIds`: the CT side's player ids. */
export function measureRound(R: TeamPlay, r: RoundResult, mapId: string, ctIds: ReadonlySet<string>): void {
    const ev = r.events ?? []
    R.rounds++
    const ctWin = r.winner === 'ct' ? 1 : 0
    const plant = ev.find(e => e.type === 'PLANT')
    const kills = ev.filter(e => e.type === 'KILL' && e.victimId).sort((a, b) => a.time - b.time)
    const alive = [5, 5]
    const got = new Set<string>()
    let atPlant: [number, number] | null = null
    for (const k of kills) {
        if (plant && !atPlant && k.time >= plant.time) atPlant = [alive[0], alive[1]]
        alive[ctIds.has(k.victimId!) ? 1 : 0]--
        const post = plant && k.time >= plant.time ? 1 : 0
        const st = `${alive[0]}-${alive[1]}-${post}`
        if (alive[0] > 0 && alive[1] > 0 && !got.has(st)) { got.add(st); bump(R.states, st, ctWin) }
    }
    if (plant && !atPlant) atPlant = [alive[0], alive[1]]
    if (plant) {
        const key = `${atPlant![0]}-${atPlant![1]}`
        bump(R.plant, key, ctWin)
        if (r.winType === 'BOMB_EXPLODED') {
            R.bombed[0]++
            const saved = alive[1] > 0 ? 1 : 0
            R.bombed[1] += saved
            bump(R.ctSave, key, saved)
        }
    } else if (ctWin) {
        R.tSave[0]++
        R.tSave[1] += alive[0] > 0 ? 1 : 0
    }
    if (!plant?.spot || mapId === 'nuke' || !hasMoves(r)) return
    const rm = getRoundMap(mapId)
    if (!rm) return
    const script = scriptFromMoves(r, mapId, rm, ctIds)
    const S = (plant.site === 'B' ? 'B' : 'A') as 'A' | 'B'
    const centre = (s: 'A' | 'B') => {
        const p = rm.sites[s]?.center
        return p ? { x: p.x, y: p.y } : null
    }
    const sc = centre(S), oc = centre(S === 'A' ? 'B' : 'A')
    if (!sc || !oc) return
    const ids = Object.keys(script.tracks).filter(id => script.tracks[id].length)
    R.killsPrePlant[Math.min(4, kills.filter(k => k.time >= plant.time - 15 && k.time < plant.time).length)]++
    const deathT = new Map(script.deaths.map(d => [d.victimId, d.t]))
    const at = (id: string, t: number) => ((deathT.get(id) ?? Infinity) > t ? sampleTrack(script.tracks[id], t) : null)
    const ts = ids.filter(id => script.sides[id] === 'T'), cts = ids.filter(id => script.sides[id] === 'CT')
    R.ctAtPlant[Math.min(3, cts.filter(id => { const p = at(id, plant.time); return p && dist(p, sc) <= HOLD_M }).length)]++
    let hit = -1
    for (let t = 0; t <= plant.time; t += FRAME) {
        if (ts.filter(id => { const p = at(id, t); return p && dist(p, sc) <= HIT_M }).length >= 2) { hit = t; break }
    }
    if (hit < 0) return
    const early = Math.max(0, hit - 10)
    const near = (c: { x: number; y: number }) => cts.filter(id => { const p = at(id, early); return p && dist(p, c) <= HOLD_M }).length
    const nS = near(sc), nO = near(oc)
    R.openSite[nS < nO ? 0 : nS === nO ? 1 : 2]++
    for (const id of cts) {
        const p0 = at(id, hit)
        if (!p0 || dist(p0, sc) <= FAR_M) continue
        let arrived = -1, died = false
        for (let t = hit + FRAME; t <= script.endTime; t += FRAME) {
            const p = at(id, t)
            if (!p) { died = true; break }
            if (dist(p, sc) <= HOLD_M) { arrived = t; break }
        }
        if (arrived >= 0) R.rotate.push(Math.round((arrived - hit) * 10) / 10)
        else if (died) R.rotateDied++
        else R.rotateNever++
    }
    const bomb = plant.spot
    const t10 = plant.time + 10
    if (t10 < script.endTime) for (const id of ts) { const p = at(id, t10); if (p) R.postDist.push(Math.round(dist(p, bomb) * 10) / 10) }
    const onSite = new Set(cts.filter(id => { const p = at(id, plant.time); return p && dist(p, bomb) <= RETAKE_M }))
    const entered: number[] = []
    for (const id of cts) {
        if (onSite.has(id)) continue
        for (let t = plant.time; t <= script.endTime; t += FRAME) {
            const p = at(id, t)
            if (!p) break
            if (dist(p, bomb) <= RETAKE_M) { entered.push(t); break }
        }
    }
    entered.sort((a, b) => a - b)
    if (atPlant && atPlant[1] >= 2 && entered.length >= 2) R.retakeGap.push(Math.round((entered[1] - entered[0]) * 10) / 10)
}

/** The comparison rows: [label, sim, pro, decimals]. */
export function teamPlayRows(S: TeamPlay, P: TeamPlay): [string, number, number, number][] {
    const win = (tab: Tab, keys: string[]) => {
        let n = 0, w = 0
        for (const k of keys) { const e = tab[k]; if (e) { n += e[0]; w += e[1] } }
        return pct(w, n)
    }
    const share = (tab: Tab, which: 'up' | 'level' | 'down') => {
        let n = 0, k = 0
        for (const [key, e] of Object.entries(tab)) {
            const [t, ct] = key.split('-').map(Number)
            n += e[0]
            if ((ct > t ? 'up' : ct === t ? 'level' : 'down') === which) k += e[0]
        }
        return pct(k, n)
    }
    const st = (X: TeamPlay, t: number, ct: number, post: 0 | 1) => win(X.states, [`${t}-${ct}-${post}`])
    const rot = (X: TeamPlay) => pct(X.rotate.length, X.rotate.length + X.rotateNever + X.rotateDied)
    const rows: [string, number, number, number][] = [
        ['CT win from 4v5 (T 5 alive, CT 4), before plant %', st(S, 5, 4, 0), st(P, 5, 4, 0), 1],
        ['CT win from 5v4, before plant %', st(S, 4, 5, 0), st(P, 4, 5, 0), 1],
        ['CT win 3v2 (CT ahead), before plant %', st(S, 2, 3, 0), st(P, 2, 3, 0), 1],
        ['CT win 2v3 (CT behind), before plant %', st(S, 3, 2, 0), st(P, 3, 2, 0), 1],
        ['CT win 1v1, before plant %', st(S, 1, 1, 0), st(P, 1, 1, 0), 1],
        ['CT win retake 3v2 (CT ahead), after plant %', st(S, 2, 3, 1), st(P, 2, 3, 1), 1],
        ['CT win retake 2v2, after plant %', st(S, 2, 2, 1), st(P, 2, 2, 1), 1],
        ['CT win retake 4v3, after plant %', st(S, 3, 4, 1), st(P, 3, 4, 1), 1],
        ['CT win retake 2v1, after plant %', st(S, 1, 2, 1), st(P, 1, 2, 1), 1],
        ['CT win when the plant is 5 CT vs ≤4 T %', win(S.plant, ['1-5', '2-5', '3-5', '4-5']), win(P.plant, ['1-5', '2-5', '3-5', '4-5']), 1],
        ['CT win when CTs are up at the plant %', win(S.plant, ['1-2', '1-3', '1-4', '2-3', '2-4', '3-4', '1-5', '2-5', '3-5', '4-5']), win(P.plant, ['1-2', '1-3', '1-4', '2-3', '2-4', '3-4', '1-5', '2-5', '3-5', '4-5']), 1],
        ['CT win when level at the plant %', win(S.plant, ['1-1', '2-2', '3-3', '4-4', '5-5']), win(P.plant, ['1-1', '2-2', '3-3', '4-4', '5-5']), 1],
        ['CT win when down at the plant %', win(S.plant, ['2-1', '3-1', '3-2', '4-1', '4-2', '4-3', '5-1', '5-2', '5-3', '5-4']), win(P.plant, ['2-1', '3-1', '3-2', '4-1', '4-2', '4-3', '5-1', '5-2', '5-3', '5-4']), 1],
        ['Plants made with the CTs up in numbers %', share(S.plant, 'up'), share(P.plant, 'up'), 1],
        ['Plants made with the CTs down in numbers %', share(S.plant, 'down'), share(P.plant, 'down'), 1],
        ['Plants with no CT on the site %', pct(S.ctAtPlant[0], sum(S.ctAtPlant)), pct(P.ctAtPlant[0], sum(P.ctAtPlant)), 1],
        ['Plants with no kill in the 15 s before %', pct(S.killsPrePlant[0], sum(S.killsPrePlant)), pct(P.killsPrePlant[0], sum(P.killsPrePlant)), 1],
        ['Kills in the 15 s before a plant, mean', mean5(S.killsPrePlant), mean5(P.killsPrePlant), 2],
        ['Bombed rounds with a CT saved %', pct(S.bombed[1], S.bombed[0]), pct(P.bombed[1], P.bombed[0]), 1],
        ['… when CTs were down 2+ at the plant %', win(S.ctSave, ['3-1', '4-1', '4-2', '5-1', '5-2', '5-3']), win(P.ctSave, ['3-1', '4-1', '4-2', '5-1', '5-2', '5-3']), 1],
        ['CT wins without a plant with a T saved %', pct(S.tSave[1], S.tSave[0]), pct(P.tSave[1], P.tSave[0]), 1],
        ['Plant on the site with fewer CTs (10 s before the hit) %', pct(S.openSite[0], S.openSite[0] + S.openSite[1] + S.openSite[2]), pct(P.openSite[0], P.openSite[0] + P.openSite[1] + P.openSite[2]), 1],
        ['… on the site with more CTs %', pct(S.openSite[2], S.openSite[0] + S.openSite[1] + S.openSite[2]), pct(P.openSite[2], P.openSite[0] + P.openSite[1] + P.openSite[2]), 1],
        ['Far CTs who reach the hit site %', rot(S), rot(P), 1],
        ['Far CT rotation time, median s', median(S.rotate), median(P.rotate), 1],
        ['Far CTs who die on the way %', pct(S.rotateDied, S.rotate.length + S.rotateNever + S.rotateDied), pct(P.rotateDied, P.rotate.length + P.rotateNever + P.rotateDied), 1],
        ['Retake: gap between 1st and 2nd CT on the bomb, median s', median(S.retakeGap), median(P.retakeGap), 1],
        ['Retake: 2nd CT within 2 s of the 1st %', pct(S.retakeGap.filter(x => x <= 2).length, S.retakeGap.length), pct(P.retakeGap.filter(x => x <= 2).length, P.retakeGap.length), 1],
        ['Post-plant: T distance to the bomb at +10 s, median m', median(S.postDist), median(P.postDist), 1],
    ]
    return rows
}

function main(): void {
    const args = parseArgs(process.argv.slice(2))
    const pro = JSON.parse(readFileSync(args.pro, 'utf8')) as TeamPlay
    const runner = seriesRunnerFor('script-v1')
    if (!runner) throw new Error('script-v1 is not runnable')
    const home = buildSide({ id: 'HOME', skills: even(70) })
    const away = buildSide({ id: 'AWAY', skills: even(70) })
    const homeIds = new Set(home.players.map(p => p.id))
    const S = emptyTeamPlay()
    for (let i = 0; i < args.maps; i++) {
        const map = ACTIVE_MAP_POOL[i % ACTIVE_MAP_POOL.length]
        const input = { id: `team-play-${i}`, seed: deriveSeed(args.seed, 'team-play', i), map, home, away, managedTeamId: i % 2 ? undefined : 'HOME' }
        const res = i % 2 ? runner.ai(input) : runner.managed(input)
        for (const m of res.maps) for (const r of m.rounds as RoundResult[]) {
            if (!r.moves) continue
            const ctIds = new Set(r.moves.ids.filter(id => homeIds.has(id) === (r.ctTeam === 'HOME')))
            measureRound(S, r, map, ctIds)
        }
        process.stderr.write(`\r${i + 1}/${args.maps} maps`)
    }
    process.stderr.write('\n')
    const rows = teamPlayRows(S, pro)
    console.log(`Team play audit: ${args.maps} maps, ${S.rounds} rounds (pro: ${pro.rounds} rounds)`)
    console.log('')
    console.log('| Measure | Sim | Pro |')
    console.log('|---|---|---|')
    for (const [label, v, p, dp] of rows) console.log(`| ${label} | ${v.toFixed(dp)} | ${p.toFixed(dp)} |`)
    if (args.json) writeFileSync(args.json, JSON.stringify({ rows: rows.map(([label, sim, p]) => ({ label, sim: Number(sim.toFixed(2)), pro: Number(p.toFixed(2)) })), sim: S }, null, 1))
}

if (require.main === module) main()
