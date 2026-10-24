/**
 * Win-odds calibration (C1 "honest odds").
 *
 *   npx tsx scripts/odds/win-odds-calibration.ts generate --samples 1500 --seed 1 --shard 0 --of 4 --out tmp/odds/train-0.jsonl
 *   npx tsx scripts/odds/win-odds-calibration.ts fit tmp/odds/train-*.jsonl
 *   npx tsx scripts/odds/win-odds-calibration.ts evaluate tmp/odds/test-*.jsonl [--rating 0.2 --edge 6]
 *   npx tsx scripts/odds/win-odds-calibration.ts effects --samples 400 --out tmp/odds/effects.json
 *
 * generate  plays BO1 maps between the game's own clubs (snapshot career,
 *           managed path = the player's match) and writes one row per map:
 *           the win-odds inputs (engine/match/win-odds.ts) and the result.
 *           Opponents are mostly near in the world ranking (league and
 *           qualifier fixtures), sometimes anyone (cups, mismatches).
 * fit       logistic regression (no intercept: home and away are symmetric)
 *           of map wins on the inputs.
 * evaluate  reliability table (shown chance vs actual wins per 10% bucket),
 *           Brier score and log loss of the current WIN_ODDS_FIT, or of the
 *           coefficients given.
 * effects   re-measures the effect numbers the match screens print, with
 *           paired seeds: +10% team edge, and a regroup's round-win chance.
 */
import fs from 'node:fs'
import path from 'node:path'
import { SnapshotLoader } from '../../data/snapshot-loader'
import { AIManager } from '../../engine/ai-manager'
import { prepareLegacySeries } from '../../engine/match/legacy-prepare'
import { createLegacySeriesState, finalizeLegacySeries, playLegacyRound, runLegacySeries, type LegacySeriesContext } from '../../engine/match/legacy-series'
import { getActivePlayersByRosterOrder } from '../../lib/live-match-builders'
import { ACTIVE_MAP_POOL } from '../../data/map-pool'
import { SeededRNG } from '../../engine/rng'
import { mapWinChance, winOddsInputs, WIN_ODDS_FIT } from '../../engine/match/win-odds'
import { REGROUP_EDGE, REGROUP_MIN_LOSS_STREAK } from '../../engine/match/manager-controls'
import type { GameSave } from '../../engine/save-types'

interface Row { home: string; away: string; map: string; seed: number; ratingGap: number; edgeGap: number; homeRounds: number; awayRounds: number; homeWon: number }

function arg(name: string, fallback?: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`)
    return i >= 0 ? process.argv[i + 1] : fallback
}

async function career(): Promise<GameSave> {
    const loader = new SnapshotLoader(path.join(process.cwd(), 'public/data/snapshot'))
    const loaded = await loader.loadSnapshot()
    if (!loaded.success) throw Error(loaded.error)
    const save = loader.createCareerFromSnapshot('win odds calibration', loader.getSnapshot()!.teams[0].id, 1)!
    AIManager.initializeTeamData(save)
    return save
}

function contextFor(save: GameSave, homeId: string, awayId: string, map: string, seed: number, id: string): LegacySeriesContext {
    const home = save.teams.find(t => t.id === homeId)!
    const away = save.teams.find(t => t.id === awayId)!
    return prepareLegacySeries({
        match: { id, seed, format: 'BO1', maps: [map], engineVersion: 'script-v1' } as never,
        homeTeam: home as never, awayTeam: away as never,
        homePlayers: getActivePlayersByRosterOrder(home as never, save.players as never) as never,
        awayPlayers: getActivePlayersByRosterOrder(away as never, save.players as never) as never,
        staff: save.staff as never,
        managedTeamId: homeId,
    })
}

async function generate(): Promise<void> {
    const samples = Number(arg('samples', '1000'))
    const baseSeed = Number(arg('seed', '1'))
    const shard = Number(arg('shard', '0')), of = Number(arg('of', '1'))
    const out = arg('out')!
    const save = await career()
    const teams = save.teams
        .filter(t => getActivePlayersByRosterOrder(t as never, save.players as never).length >= 5)
        .sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0))
    fs.mkdirSync(path.dirname(out), { recursive: true })
    const rows: string[] = []
    const t0 = Date.now()
    for (let i = shard; i < samples; i += of) {
        const rng = new SeededRNG(baseSeed * 1_000_003 + i)
        const a = rng.int(0, teams.length - 1)
        // 60%: an opponent within 25 ranking places; 40%: anyone.
        const b = rng.next() < 0.6
            ? Math.max(0, Math.min(teams.length - 1, a + rng.int(-25, 25)))
            : rng.int(0, teams.length - 1)
        if (a === b) continue
        const map = ACTIVE_MAP_POOL[rng.int(0, ACTIVE_MAP_POOL.length - 1)]
        const seed = rng.int(1, 0x7ffffffe)
        const ctx = contextFor(save, teams[a].id, teams[b].id, map, seed, `odds_${baseSeed}_${i}`)
        const inputs = winOddsInputs(ctx)
        const result = finalizeLegacySeries(ctx, runLegacySeries(ctx).state)
        const m = result.maps[0]
        const row: Row = { home: teams[a].id, away: teams[b].id, map, seed, ...inputs, homeRounds: m.homeScore ?? 0, awayRounds: m.awayScore ?? 0, homeWon: result.winnerId === teams[a].id ? 1 : 0 }
        rows.push(JSON.stringify(row))
        if (rows.length % 50 === 0) {
            fs.writeFileSync(out, rows.join('\n') + '\n')
            process.stderr.write(`shard ${shard}: ${rows.length} maps, ${((Date.now() - t0) / rows.length).toFixed(0)} ms/map\n`)
        }
    }
    fs.writeFileSync(out, rows.join('\n') + '\n')
}

function readRows(files: string[]): Row[] {
    return files.flatMap(f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as Row))
}

/** Logistic regression without intercept, Newton-Raphson. */
function fitLogistic(rows: Row[]): { rating: number; edge: number } {
    let w = [0, 0]
    for (let iter = 0; iter < 50; iter++) {
        const g = [0, 0], H = [[0, 0], [0, 0]]
        for (const r of rows) {
            const x = [r.ratingGap, r.edgeGap]
            const p = 1 / (1 + Math.exp(-(w[0] * x[0] + w[1] * x[1])))
            for (let i = 0; i < 2; i++) {
                g[i] += (r.homeWon - p) * x[i]
                for (let j = 0; j < 2; j++) H[i][j] -= p * (1 - p) * x[i] * x[j]
            }
        }
        const det = H[0][0] * H[1][1] - H[0][1] * H[1][0]
        if (Math.abs(det) < 1e-12) break
        const step = [(H[1][1] * g[0] - H[0][1] * g[1]) / det, (-H[1][0] * g[0] + H[0][0] * g[1]) / det]
        w = [w[0] - step[0], w[1] - step[1]]
        if (Math.abs(step[0]) + Math.abs(step[1]) < 1e-9) break
    }
    return { rating: w[0], edge: w[1] }
}

export function reliability(rows: Row[], predict: (r: Row) => number) {
    // Bucket from the favourite's side so 30% and 70% are one claim seen from both ends.
    const buckets = Array.from({ length: 10 }, (_, i) => ({ lo: i * 10, hi: i * 10 + 10, n: 0, shown: 0, won: 0 }))
    let brier = 0, logLoss = 0
    for (const r of rows) {
        const p = Math.min(1 - 1e-6, Math.max(1e-6, predict(r)))
        brier += (p - r.homeWon) ** 2
        logLoss -= r.homeWon ? Math.log(p) : Math.log(1 - p)
        const b = buckets[Math.min(9, Math.floor(p * 10))]
        b.n++; b.shown += p; b.won += r.homeWon
    }
    const table = buckets.filter(b => b.n > 0).map(b => ({ bucket: `${b.lo}–${b.hi}%`, maps: b.n, shown: +(100 * b.shown / b.n).toFixed(1), actual: +(100 * b.won / b.n).toFixed(1) }))
    // Expected calibration error, weighted by bucket size (percentage points).
    const ece = table.reduce((s, b) => s + b.maps * Math.abs(b.shown - b.actual), 0) / rows.length
    return { maps: rows.length, brier: +(brier / rows.length).toFixed(4), logLoss: +(logLoss / rows.length).toFixed(4), ece: +ece.toFixed(2), table }
}

function evaluate(files: string[]): void {
    const rows = readRows(files)
    const fit = { rating: Number(arg('rating', String(WIN_ODDS_FIT.rating))), edge: Number(arg('edge', String(WIN_ODDS_FIT.edge))) }
    const report = {
        fit,
        model: reliability(rows, r => mapWinChance(r, fit)),
        coinFlip: reliability(rows, () => 0.5),
    }
    console.log(JSON.stringify(report, null, 2))
}

/** Paired effect measurements for the numbers the match screens print. */
async function effects(): Promise<void> {
    const samples = Number(arg('samples', '300'))
    const save = await career()
    const teams = save.teams.filter(t => getActivePlayersByRosterOrder(t as never, save.players as never).length >= 5).sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0))
    let edgeRounds = 0, baseRounds = 0, totalRounds = 0, edgeMaps = 0, baseMaps = 0
    let regroupWins = 0, regroupBase = 0, regroupN = 0
    for (let i = 0; i < samples; i++) {
        const rng = new SeededRNG(777_001 + i)
        // Two clubs of similar strength with level team edges, so the effect is measured near 50/50.
        const a = rng.int(0, teams.length - 2), b = a + 1
        const map = ACTIVE_MAP_POOL[rng.int(0, ACTIVE_MAP_POOL.length - 1)]
        const seed = rng.int(1, 0x7ffffffe)
        const play = (bonus: number) => {
            const ctx = contextFor(save, teams[a].id, teams[b].id, map, seed, `fx_${i}`)
            // Level the two edges first, so the +10% is never cut by the ±10% cap.
            ctx.script!.home.edge = { ...ctx.script!.home.edge, total: ctx.script!.away.edge.total + bonus }
            const r = finalizeLegacySeries(ctx, runLegacySeries(ctx).state).maps[0]
            return { home: r.homeScore ?? 0, away: r.awayScore ?? 0 }
        }
        const base = play(0), plus = play(0.1)
        baseRounds += base.home; edgeRounds += plus.home; totalRounds += (base.home + base.away + plus.home + plus.away) / 2
        baseMaps += base.home > base.away ? 1 : 0; edgeMaps += plus.home > plus.away ? 1 : 0

        // Regroup: at the first round the home side starts on a 2+ loss streak,
        // play that round with and without the regroup from the same state.
        const ctx = contextFor(save, teams[a].id, teams[b].id, map, seed, `fx_${i}`)
        let state = createLegacySeriesState(ctx)
        while (!state.finished) {
            if (state.sim.homeLossStreak >= REGROUP_MIN_LOSS_STREAK && !(state.sim.currentRound === 1 || state.sim.currentRound === 13)) {
                const off = playLegacyRound(ctx, state, {})
                const on = playLegacyRound(contextFor(save, teams[a].id, teams[b].id, map, seed, `fx_${i}`), state, { regroup: true })
                regroupBase += off.round.winningTeamId === teams[a].id ? 1 : 0
                regroupWins += on.round.winningTeamId === teams[a].id ? 1 : 0
                regroupN++
                state = off.state
                continue
            }
            state = playLegacyRound(ctx, state, {}).state
        }
        if ((i + 1) % 25 === 0) process.stderr.write(`effects ${i + 1}/${samples}\n`)
    }
    const report = {
        samples,
        teamEdgePlus10: {
            roundShareGainPts: +((100 * (edgeRounds - baseRounds)) / totalRounds).toFixed(2),
            mapWinGainPts: +((100 * (edgeMaps - baseMaps)) / samples).toFixed(1),
        },
        regroup: { rounds: regroupN, withoutPct: +(100 * regroupBase / regroupN).toFixed(1), withPct: +(100 * regroupWins / regroupN).toFixed(1), gainPts: +(100 * (regroupWins - regroupBase) / regroupN).toFixed(2), shownPts: REGROUP_EDGE * 100 },
    }
    const out = arg('out')
    if (out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2)) }
    console.log(JSON.stringify(report, null, 2))
}

async function main() {
    const [cmd, ...rest] = process.argv.slice(2)
    const files = rest.filter(a => !a.startsWith('--') && fs.existsSync(a))
    if (cmd === 'generate') await generate()
    else if (cmd === 'fit') console.log(JSON.stringify(fitLogistic(readRows(files)), null, 2))
    else if (cmd === 'evaluate') evaluate(files)
    else if (cmd === 'effects') await effects()
    else throw Error('usage: generate | fit <files> | evaluate <files> | effects')
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1) })
