/**
 * Do the shown ratings (OVR) predict match results?
 *
 *   npx tsx scripts/ratings/ovr-agreement.ts maps --samples 2000 --seed 1 --shard 0 --of 4 --out tmp/ovr/maps-0.jsonl
 *   npx tsx scripts/ratings/ovr-agreement.ts report tmp/ovr/maps-*.jsonl
 *   npx tsx scripts/ratings/ovr-agreement.ts exchange --samples 400 --attr reaction --out tmp/ovr/x-reaction.json
 *   npx tsx scripts/ratings/ovr-agreement.ts players
 *
 * maps      plays BO1 maps between the game's own clubs (fresh snapshot
 *           career, AI path: nobody managed) and writes one row per map with
 *           both clubs' team OVR (mean OVR of the five starters, as the squad
 *           and rankings pages show it) and the result. Opponents: 50% within
 *           25 places of the OVR table, 30% anyone, 20% a top-10 club against
 *           one ranked 80-130 by OVR.
 * report    how often the higher-OVR club wins, per OVR-gap bucket; the
 *           top-10 vs 80-130 record; a logistic fit of wins on the OVR gap.
 * exchange  paired seeds: one attribute +10 for all five players of the home
 *           side between two evenly matched clubs, against the same maps
 *           without it. Gives the engine's map-win value of each attribute,
 *           which is what the OVR weights are set from.
 * players   correlation of OVR with the engine's duel rating, per player and
 *           per club.
 */
import fs from 'node:fs'
import path from 'node:path'
import { SnapshotLoader } from '../../data/snapshot-loader'
import { AIManager } from '../../engine/ai-manager'
import { prepareLegacySeries } from '../../engine/match/legacy-prepare'
import { finalizeLegacySeries, runLegacySeries } from '../../engine/match/legacy-series'
import { getActivePlayersByRosterOrder } from '../../lib/live-match-builders'
import { ACTIVE_MAP_POOL } from '../../data/map-pool'
import { SeededRNG } from '../../engine/rng'
import { evaluatePlayer } from '../../engine/player-evaluation'
import { aimPoints, buildProfile } from '../../engine/match/round-sim/profile'
import { TUNING } from '../../engine/match/round-sim/tuning'
import type { GameSave, PlayerSaveData, TeamSaveData } from '../../engine/save-types'

interface Row { home: string; away: string; kind: 'near' | 'any' | 'topVsMid'; map: string; seed: number; homeOvr: number; awayOvr: number; homeDuel: number; awayDuel: number; homeRounds: number; awayRounds: number; homeWon: number }

function arg(name: string, fallback?: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`)
    return i >= 0 ? process.argv[i + 1] : fallback
}

async function career(): Promise<GameSave> {
    const loader = new SnapshotLoader(path.join(process.cwd(), 'public/data/snapshot'))
    const loaded = await loader.loadSnapshot()
    if (!loaded.success) throw Error(loaded.error)
    const save = loader.createCareerFromSnapshot('ovr agreement', loader.getSnapshot()!.teams[0].id, 1)!
    AIManager.initializeTeamData(save)
    return save
}

const starters = (save: GameSave, t: TeamSaveData) => getActivePlayersByRosterOrder(t as never, save.players as never).slice(0, 5) as unknown as PlayerSaveData[]
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
/** The engine's duel rating in skill points: aim with the role's main weapon (as the Draft Cup prices it). */
const duel = (p: PlayerSaveData) => { const prof = buildProfile(p as never); return aimPoints(prof, prof.role === 'awp' ? 'awp' : 'rifle') / TUNING.AIM_PER_SKILL }
const teamOvr = (ps: PlayerSaveData[]) => mean(ps.map(p => evaluatePlayer(p).overallRating))
const teamDuel = (ps: PlayerSaveData[]) => mean(ps.map(duel))

function clubs(save: GameSave) {
    return save.teams
        .map(t => ({ team: t, players: starters(save, t) }))
        .filter(c => c.players.length >= 5)
        .map(c => ({ ...c, ovr: teamOvr(c.players), duel: teamDuel(c.players) }))
        .sort((a, b) => b.ovr - a.ovr || a.team.id.localeCompare(b.team.id))
}

function play(save: GameSave, home: TeamSaveData, away: TeamSaveData, hp: PlayerSaveData[], ap: PlayerSaveData[], map: string, seed: number, id: string) {
    const ctx = prepareLegacySeries({
        match: { id, seed, format: 'BO1', maps: [map], engineVersion: 'script-v1' },
        homeTeam: home as never, awayTeam: away as never,
        homePlayers: hp, awayPlayers: ap,
        staff: save.staff as never,
    })
    const result = finalizeLegacySeries(ctx, runLegacySeries(ctx).state)
    const m = result.maps[0]
    return { homeRounds: m.homeScore ?? 0, awayRounds: m.awayScore ?? 0, homeWon: result.winnerId === home.id ? 1 : 0 }
}

async function maps(): Promise<void> {
    const samples = Number(arg('samples', '1000'))
    const baseSeed = Number(arg('seed', '1'))
    const shard = Number(arg('shard', '0')), of = Number(arg('of', '1'))
    const out = arg('out')!
    const save = await career()
    const cs = clubs(save)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    const rows: string[] = []
    for (let i = shard; i < samples; i += of) {
        const rng = new SeededRNG(baseSeed * 1_000_003 + i)
        const roll = rng.next()
        let a: number, b: number, kind: Row['kind']
        if (roll < 0.5) { a = rng.int(0, cs.length - 1); b = Math.max(0, Math.min(cs.length - 1, a + rng.int(-25, 25))); kind = 'near' }
        else if (roll < 0.8) { a = rng.int(0, cs.length - 1); b = rng.int(0, cs.length - 1); kind = 'any' }
        else { a = rng.int(0, 9); b = rng.int(80, Math.min(129, cs.length - 1)); kind = 'topVsMid' }
        if (a === b) continue
        // Random home/away so side order carries no bias.
        if (rng.next() < 0.5) [a, b] = [b, a]
        const map = ACTIVE_MAP_POOL[rng.int(0, ACTIVE_MAP_POOL.length - 1)]
        const seed = rng.int(1, 0x7ffffffe)
        const h = cs[a], w = cs[b]
        const r = play(save, h.team, w.team, h.players, w.players, map, seed, `ovr_${baseSeed}_${i}`)
        const row: Row = { home: h.team.id, away: w.team.id, kind, map, seed, homeOvr: +h.ovr.toFixed(2), awayOvr: +w.ovr.toFixed(2), homeDuel: +h.duel.toFixed(2), awayDuel: +w.duel.toFixed(2), ...r }
        rows.push(JSON.stringify(row))
        if (rows.length % 100 === 0) { fs.writeFileSync(out, rows.join('\n') + '\n'); process.stderr.write(`shard ${shard}: ${rows.length}\n`) }
    }
    fs.writeFileSync(out, rows.join('\n') + '\n')
}

function fit1(xs: number[], ys: number[]): number {
    let w = 0
    for (let it = 0; it < 50; it++) {
        let g = 0, h = 0
        for (let i = 0; i < xs.length; i++) { const p = 1 / (1 + Math.exp(-w * xs[i])); g += (ys[i] - p) * xs[i]; h -= p * (1 - p) * xs[i] * xs[i] }
        const step = g / h; w -= step
        if (Math.abs(step) < 1e-10) break
    }
    return w
}

export function summarize(rows: Row[]) {
    const decided = rows.filter(r => Math.abs(r.homeOvr - r.awayOvr) >= 0.5)
    const favWon = (r: Row) => (r.homeOvr > r.awayOvr) === (r.homeWon === 1)
    const buckets = [[0.5, 2], [2, 5], [5, 10], [10, 20], [20, 99]].map(([lo, hi]) => {
        const rs = decided.filter(r => { const g = Math.abs(r.homeOvr - r.awayOvr); return g >= lo && g < hi })
        return { ovrGap: `${lo}–${hi}`, maps: rs.length, higherOvrWins: rs.length ? +(100 * rs.filter(favWon).length / rs.length).toFixed(1) : null }
    })
    const top = rows.filter(r => r.kind === 'topVsMid')
    const topWins = top.filter(favWon).length
    const k = fit1(rows.map(r => r.homeOvr - r.awayOvr), rows.map(r => r.homeWon))
    let ll = 0
    for (const r of rows) { const p = Math.min(1 - 1e-6, Math.max(1e-6, 1 / (1 + Math.exp(-k * (r.homeOvr - r.awayOvr))))); ll -= r.homeWon ? Math.log(p) : Math.log(1 - p) }
    return {
        maps: rows.length,
        higherOvrWinsAll: +(100 * decided.filter(favWon).length / decided.length).toFixed(1),
        byGap: buckets,
        top10VsRank80to130: { maps: top.length, top10Wins: +(100 * topWins / Math.max(1, top.length)).toFixed(1) },
        logOddsPerOvrPoint: +k.toFixed(4),
        /** Map-win chance the fit gives a 5 and a 10 OVR edge. */
        fitAt5: +(100 / (1 + Math.exp(-5 * k))).toFixed(1),
        fitAt10: +(100 / (1 + Math.exp(-10 * k))).toFixed(1),
        logLoss: +(ll / rows.length).toFixed(4),
        coinFlipLogLoss: +Math.log(2).toFixed(4),
    }
}

function report(files: string[]): void {
    const rows = files.flatMap(f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as Row))
    console.log(JSON.stringify(summarize(rows), null, 2))
}

async function exchange(): Promise<void> {
    const samples = Number(arg('samples', '400'))
    const attr = arg('attr', 'skill')!
    const delta = Number(arg('delta', '10'))
    /** Only players whose sim role is this (awp, entry, igl, support, rifler); "other" = everyone but the AWPer. */
    const role = arg('role')
    const hit = (p: PlayerSaveData) => { if (!role) return true; const r = buildProfile(p as never).role; return role === 'other' ? r !== 'awp' : r === role }
    const save = await career()
    // Evenly matched pairs by engine strength, so the effect is measured near 50/50.
    const cs = clubs(save).sort((a, b) => b.duel - a.duel || a.team.id.localeCompare(b.team.id))
    let base = 0, plus = 0, baseRounds = 0, plusRounds = 0, total = 0
    for (let i = 0; i < samples; i++) {
        const rng = new SeededRNG(424_242 + i)
        const a = rng.int(0, cs.length - 2), b = a + 1
        const map = ACTIVE_MAP_POOL[rng.int(0, ACTIVE_MAP_POOL.length - 1)]
        const seed = rng.int(1, 0x7ffffffe)
        const boosted = cs[a].players.map(p => !hit(p) ? p : ({ ...p, [attr]: Math.min(99, Math.max(1, ((p as unknown as Record<string, number>)[attr] ?? 50) + delta)) }))
        const r0 = play(save, cs[a].team, cs[b].team, cs[a].players, cs[b].players, map, seed, `x_${i}`)
        const r1 = play(save, cs[a].team, cs[b].team, boosted as never, cs[b].players, map, seed, `x_${i}`)
        base += r0.homeWon; plus += r1.homeWon
        baseRounds += r0.homeRounds; plusRounds += r1.homeRounds; total += (r0.homeRounds + r0.awayRounds + r1.homeRounds + r1.awayRounds) / 2
    }
    const res = { attr, delta, ...(role ? { role } : {}), samples, mapWinGainPts: +(100 * (plus - base) / samples).toFixed(2), roundShareGainPts: +(100 * (plusRounds - baseRounds) / total).toFixed(2) }
    console.log(JSON.stringify(res))
    const out = arg('out')
    if (out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(res)) }
}

function corr(xs: number[], ys: number[]): number {
    const mx = mean(xs), my = mean(ys)
    let sxy = 0, sxx = 0, syy = 0
    for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2 }
    return sxy / Math.sqrt(sxx * syy)
}

async function players(): Promise<void> {
    const save = await career()
    const rostered = new Set(save.teams.flatMap(t => t.rosterIds))
    const ps = save.players.filter(p => rostered.has(p.id)) as PlayerSaveData[]
    const cs = clubs(save)
    const top10 = cs.slice(0, 10)
    const byDuel = [...cs].sort((a, b) => b.duel - a.duel)
    console.log(JSON.stringify({
        players: ps.length,
        corrPlayerOvrVsDuel: +corr(ps.map(p => evaluatePlayer(p).overallRating), ps.map(duel)).toFixed(3),
        clubs: cs.length,
        corrClubOvrVsDuel: +corr(cs.map(c => c.ovr), cs.map(c => c.duel)).toFixed(3),
        top10ByOvr: top10.map(c => ({ club: c.team.name, ovr: +c.ovr.toFixed(1), duel: +c.duel.toFixed(1), duelRank: byDuel.indexOf(c) + 1 })),
        top5ByDuel: byDuel.slice(0, 5).map(c => ({ club: c.team.name, ovr: +c.ovr.toFixed(1), duel: +c.duel.toFixed(1), ovrRank: cs.indexOf(c) + 1 })),
    }, null, 2))
}

const cmd = process.argv[2]
if (cmd === 'maps') void maps()
else if (cmd === 'report') report(process.argv.slice(3).filter(a => !a.startsWith('--')))
else if (cmd === 'exchange') void exchange()
else if (cmd === 'players') void players()
else console.error('usage: maps | report <files> | exchange | players')
