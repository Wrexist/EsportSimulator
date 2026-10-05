/**
 * L21.A1 paired-scenario proof for the production legacy-v2 match engine.
 *
 * Every comparison runs the SAME seeds, rosters, maps and opponent through
 * the canonical series runner used by instant, live, skip and resumed play
 * (engine/match/legacy-series.ts). Only one manager decision differs between
 * the baseline and the variant. Effects are paired differences with a normal
 * 95% confidence interval (mean +/- 1.96 * sd / sqrt(n)).
 *
 * Acceptance per decision:
 *   - measurable: the CI of the round-win share or of the decision's own
 *     economy metric excludes zero;
 *   - bounded: |match-win effect| <= 0.30 and the variant never wins or loses
 *     every paired match (no scripted outcome).
 *
 *   npx tsx scripts/launch/l21-paired-scenarios.ts [seeds]
 */
import fs from 'node:fs'
import { createLaunchFixture } from './fixtures'
import { getActivePlayersByRosterOrder } from '../../lib/live-match-builders'
import { prepareLegacySeries } from '../../engine/match/legacy-prepare'
import { runLegacySeries, finalizeLegacySeries, type LegacyDecisionPolicy, type LegacySeriesContext } from '../../engine/match/legacy-series'
import { simulationEngineV2 as engine } from '../../engine/match-simulation'
import { regroupLossStreak } from '../../engine/match/manager-controls'
import { createDefaultTactics } from '../../engine/default-tactics'
import { SeededRNG } from '../../engine/rng'
import type { GameSave } from '../../engine/save-types'
import type { CustomTactics, Player } from '../../types'

export interface MatchMetrics { roundShare: number; matchWin: number; spendPerRound: number; cashPerRound: number; rounds: number }
interface Scenario {
    id: string
    decision: string
    kind: 'pre-match' | 'live'
    note: string
    mutate?: (save: GameSave, match: GameSave['scheduledMatches'][number]) => void
    policy?: LegacyDecisionPolicy
    /** Variant loadouts; both arms otherwise use the career default loadouts. */
    tactics?: CustomTactics
    /** Which metric primarily proves the decision is not decorative. */
    primary: 'roundShare' | 'cashPerRound'
    /** Deliberately self-defeating plan: must hurt, while rounds stay winnable. */
    negativeControl?: boolean
}
export interface Effect { mean: number; low: number; high: number }
export interface ScenarioReport {
    id: string; decision: string; kind: string; note: string; seeds: number
    baseline: { matchWin: number; roundShare: number; spendPerRound: number }
    variant: { matchWin: number; roundShare: number; spendPerRound: number }
    effect: { matchWin: Effect; roundShare: Effect; spendPerRound: Effect; cashPerRound: Effect }
    measurable: boolean; bounded: boolean; verdict: 'bounded' | 'decorative' | 'absurd' | 'negative-control'
}

const MANAGED = 'team_player'
const OPPONENT_STYLE = 'balanced' as const

function ci(values: number[]): Effect {
    const n = values.length
    const mean = values.reduce((s, v) => s + v, 0) / n
    const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, n - 1))
    const half = 1.96 * sd / Math.sqrt(n)
    const r = (v: number) => Math.round(v * 10000) / 10000
    return { mean: r(mean), low: r(mean - half), high: r(mean + half) }
}

function baseSave(): GameSave {
    const save = createLaunchFixture('first-week', 3921)
    const opponent = save.teams.find(t => t.id === 'team_ai_1')!
    opponent.playstyle = OPPONENT_STYLE
    // Mirror the opponent's ratings so the baseline is an even matchup (~50%);
    // otherwise ceiling effects hide decision effects.
    const own = save.teams.find(t => t.id === MANAGED)!
    own.rosterIds.forEach((id, i) => {
        const p = save.players.find(x => x.id === id)!, o = save.players.find(x => x.id === opponent.rosterIds[i])!
        Object.assign(p, { skill: o.skill, rifle: o.rifle, awp: o.awp, pistol: o.pistol, tactic: o.tactic })
    })
    return save
}

export function contextFor(save: GameSave, seed: number, tactics?: CustomTactics): LegacySeriesContext {
    const match = { ...save.scheduledMatches[0], seed }
    const home = save.teams.find(t => t.id === match.homeTeamId)!
    const away = save.teams.find(t => t.id === match.awayTeamId)!
    return prepareLegacySeries({
        match, homeTeam: home, awayTeam: away,
        homePlayers: getActivePlayersByRosterOrder(home, save.players), awayPlayers: getActivePlayersByRosterOrder(away, save.players),
        staff: save.staff as never, customTactics: tactics, managedTeamId: MANAGED,
    })
}

export function playOnce(save: GameSave, seed: number, policy?: LegacyDecisionPolicy, tactics?: CustomTactics): MatchMetrics {
    const ctx = contextFor(save, seed, tactics)
    const run = runLegacySeries(ctx, policy)
    const result = finalizeLegacySeries(ctx, run.state)
    const ownIds = new Set(ctx.home.team.id === MANAGED ? ctx.home.players.map(p => p.id) : ctx.away.players.map(p => p.id))
    let own = 0, total = 0, spend = 0, cash = 0
    for (const map of result.maps) for (const round of map.rounds) {
        total++
        if (round.winningTeamId === MANAGED) own++
        for (const e of round.playerEconomy ?? []) if (ownIds.has(e.playerId)) { spend += e.spent; cash += e.remaining }
    }
    return { roundShare: own / total, matchWin: result.winnerId === MANAGED ? 1 : 0, spendPerRound: spend / total / 5, cashPerRound: cash / total / 5, rounds: total }
}

const lossStreakTimeout: LegacyDecisionPolicy = v => (v.ownLossStreak >= 3 && v.timeoutsRemaining > 0 && !v.regroupActive ? { callTimeout: true } : undefined)
const alwaysBuy: LegacyDecisionPolicy = v => (v.pistolRound ? undefined : { strategy: 'FULL' })
const alwaysSave: LegacyDecisionPolicy = v => (v.pistolRound ? undefined : { strategy: 'ECO' })
/**
 * Force-buy round 2/14 after a lost pistol round. The default now saves there
 * (ROUND_ECONOMY_TUNING), so forcing is the decision a manager can change; it
 * trades the round-3/15 full buy for a better round 2/14.
 */
const forceAfterPistolLoss: LegacyDecisionPolicy = v => (!v.isOvertime && (v.round === 2 || v.round === 14) && v.ownLossStreak === 1 ? { strategy: 'FORCE' } : undefined)
const withUtility = (utility: string[]) => {
    const t = createDefaultTactics()
    for (const k of Object.keys(t) as (keyof CustomTactics)[]) for (const side of ['ct', 't'] as const) t[k][side].playerLoadouts?.forEach(l => { if (k !== 'ECO') l.utility = [...utility] })
    return t
}

export const SCENARIOS: Scenario[] = [
    { id: 'playstyle-counter', decision: 'Playstyle: default -> structured (counters the scouted balanced opponent)', kind: 'pre-match', primary: 'roundShare',
        note: 'Rock-paper-scissors counter: x1.04 base strength; structured also gains +5% when chemistry > 80 (not met here).', mutate: s => { s.teams[0].playstyle = 'structured' } },
    { id: 'playstyle-countered', decision: 'Playstyle: default -> aggressive (countered by balanced)', kind: 'pre-match', primary: 'roundShare',
        note: 'Countered style: x0.97 base strength.', mutate: s => { s.teams[0].playstyle = 'aggressive' } },
    { id: 'economy-force', decision: 'Economy plan: standard -> force (buy $500 earlier)', kind: 'pre-match', primary: 'roundShare',
        note: 'Buy thresholds -$500.', mutate: s => { s.teams[0].economyStyle = 'force' } },
    { id: 'economy-eco', decision: 'Economy plan: standard -> eco (save $500 longer)', kind: 'pre-match', primary: 'cashPerRound',
        note: 'Buy thresholds +$500; banks more cash per round.', mutate: s => { s.teams[0].economyStyle = 'eco' } },
    { id: 'roles-coverage', decision: 'Roles: AWPer + 4 riflers -> IGL/entry/AWPer/support/rifler', kind: 'pre-match', primary: 'roundShare',
        note: 'Role coverage term 0.8 + unique/5 x 0.2 (2 -> 5 unique roles).',
        mutate: s => { const roles = ['IGL', 'ENTRY_FRAGGER', 'AWPER', 'SUPPORT', 'RIFLER']; s.teams[0].rosterIds.forEach((id, i) => { s.players.find(p => p.id === id)!.role = roles[i] }) } },
    { id: 'roles-no-awper', decision: 'Roles: AWPer + 4 riflers -> 5 riflers', kind: 'pre-match', primary: 'roundShare',
        note: 'Coverage 2 -> 1 unique role; AWP still bought by cash order on FULL.', mutate: s => { s.players.find(p => p.id === s.teams[0].rosterIds[0])!.role = 'RIFLER' } },
    { id: 'antistrat-target', decision: 'Anti-strat: none -> target the opponent AWPer', kind: 'pre-match', primary: 'roundShare',
        note: 'Target loses 15% equipment contribution; own tactical modifier x0.95 (tunnel vision).',
        mutate: s => { s.teams[0].targetPlayerId = s.teams[1].rosterIds[0] } },
    { id: 'vod-review', decision: 'VOD review ($2,500): tactical prep 0 -> 25', kind: 'pre-match', primary: 'roundShare',
        note: 'Adds +0.0625 to the additive strength term for this week.', mutate: (s, m) => { s.teams[0].tacticalPrep = 25; m.vodReviewed = true } },
    { id: 'mental-reset', decision: 'Mental reset ($5,000): +15 morale and match mental prep', kind: 'pre-match', primary: 'roundShare',
        note: 'Morale term (0.8 + morale/100 x 0.4) and +3% tactical modifier.',
        mutate: (s, m) => { m.mentalPrep = true; m.mentalPrepTeamId = MANAGED; s.teams[0].rosterIds.forEach(id => { const p = s.players.find(x => x.id === id)!; p.morale = Math.min(100, p.morale + 15) }) } },
    { id: 'loadout-utility', decision: 'Loadouts: default -> flash + smoke per player (non-eco buys)', kind: 'pre-match', primary: 'roundShare',
        note: 'Saturating utility power (cap 10); costs $500 per player per buy.', tactics: withUtility(['flash', 'smoke']) },
    { id: 'loadout-overbuy', decision: 'Loadouts: default -> four grenades per player', kind: 'pre-match', primary: 'cashPerRound',
        note: 'Diminishing returns: more utility power, but $1,300+ per player per buy.', tactics: withUtility(['flash', 'smoke', 'molotov', 'he']) },
    { id: 'call-full-buy', decision: 'Live call: engine default -> FULL every non-pistol round', kind: 'live', primary: 'roundShare',
        note: 'Manager overrides the managed buy each round.', policy: alwaysBuy },
    { id: 'call-force-after-pistol-loss', decision: 'Live call: force-buy after a lost pistol round', kind: 'live', primary: 'cashPerRound',
        note: 'Round 2/14 FORCE instead of the default save; spends the round-3/15 full buy.', policy: forceAfterPistolLoss },
    { id: 'timeout-on-streak', decision: 'Tactical timeout at a 3-round losing streak (max 2)', kind: 'live', primary: 'roundShare',
        note: 'Regroup subtracts up to two losses from tilt for two rounds; economy and opponent untouched.', policy: lossStreakTimeout },
    { id: 'call-save-always', decision: 'Live call: ECO every non-pistol round (negative control)', kind: 'live', primary: 'roundShare', negativeControl: true,
        note: 'Self-defeating plan; the 10% per-round floor keeps rounds winnable.', policy: alwaysSave },
]

export function runScenario(scenario: Scenario, seeds: number, firstSeed = 20_000): ScenarioReport {
    const diffs = { matchWin: [] as number[], roundShare: [] as number[], spendPerRound: [] as number[], cashPerRound: [] as number[] }
    const base = { matchWin: 0, roundShare: 0, spendPerRound: 0 }, vari = { matchWin: 0, roundShare: 0, spendPerRound: 0 }
    const baselineSave = baseSave()
    const variantSave = baseSave()
    scenario.mutate?.(variantSave, variantSave.scheduledMatches[0])
    const defaults = createDefaultTactics()
    for (let i = 0; i < seeds; i++) {
        const seed = firstSeed + i
        const b = playOnce(baselineSave, seed, undefined, defaults)
        const v = playOnce(variantSave, seed, scenario.policy, scenario.tactics ?? defaults)
        for (const k of Object.keys(diffs) as (keyof typeof diffs)[]) diffs[k].push(v[k] - b[k])
        for (const k of Object.keys(base) as (keyof typeof base)[]) { base[k] += b[k] / seeds; vari[k] += v[k] / seeds }
    }
    const effect = { matchWin: ci(diffs.matchWin), roundShare: ci(diffs.roundShare), spendPerRound: ci(diffs.spendPerRound), cashPerRound: ci(diffs.cashPerRound) }
    const p = effect[scenario.primary]
    const measurable = p.low > 0 || p.high < 0 || effect.roundShare.low > 0 || effect.roundShare.high < 0
    const bounded = Math.abs(effect.matchWin.mean) <= 0.30 && vari.matchWin > 0 && vari.matchWin < 1
    const r = (o: typeof base) => ({ matchWin: Math.round(o.matchWin * 1000) / 1000, roundShare: Math.round(o.roundShare * 1000) / 1000, spendPerRound: Math.round(o.spendPerRound) })
    const verdict: ScenarioReport['verdict'] = scenario.negativeControl
        ? (effect.roundShare.high < 0 && vari.roundShare > 0.05 ? 'negative-control' : 'absurd')
        : !bounded ? 'absurd' : measurable ? 'bounded' : 'decorative'
    return { id: scenario.id, decision: scenario.decision, kind: scenario.kind, note: scenario.note, seeds, baseline: r(base), variant: r(vari), effect, measurable, bounded, verdict }
}

/** Round-level paired check of the regroup rule at a fixed losing streak (no divergence between arms). */
export function regroupRoundProbe(seeds = 400) {
    const save = baseSave()
    const ctx = contextFor(save, 1)
    const econ = (players: Player[], ct: boolean) => Object.fromEntries(players.map(p => [p.id, { id: p.id, cash: 8000, weapon: ct ? 'usp' : 'glock', hasArmor: false, hasHelmet: false, hasKit: false, utility: [] as string[] }]))
    let baseline = 0, regroup = 0, unchanged = 0
    for (let seed = 1; seed <= seeds; seed++) {
        const run = (loss: number, active: boolean) => engine.simulateRound(new SeededRNG(seed), ctx.home.players, ctx.away.players, 50, 50, 50, 50, true, 0, 0,
            regroupLossStreak(loss, active), 0, 5, econ(ctx.home.players, true), econ(ctx.away.players, false))
        unchanged += Number(JSON.stringify(run(0, false)) === JSON.stringify(run(0, true)))
        baseline += Number(run(5, false).winner === 'HOME')
        regroup += Number(run(5, true).winner === 'HOME')
    }
    return { seeds, lossStreak: 5, baselineWins: baseline, regroupWins: regroup, noStreakIdentical: unchanged }
}

export function runAll(seeds = 200) {
    return { generatedBy: 'scripts/launch/l21-paired-scenarios.ts', engine: 'legacy-v2 (canonical series runner)', format: 'BO1', fixture: 'first-week 3921, managed team_player (home) vs team_ai_1 (balanced)', seeds, scenarios: SCENARIOS.map(s => runScenario(s, seeds)), regroupRoundProbe: regroupRoundProbe() }
}

if (require.main === module) {
    const seeds = Number(process.argv[2] || 200)
    const t0 = Date.now()
    const report = runAll(seeds)
    fs.writeFileSync('docs/launch-readiness/evidence/L21-paired-scenarios.json', JSON.stringify(report, null, 2) + '\n')
    for (const s of report.scenarios) {
        const f = (e: Effect, pct = true) => pct ? `${(e.mean * 100).toFixed(1)} [${(e.low * 100).toFixed(1)}, ${(e.high * 100).toFixed(1)}]` : `${e.mean.toFixed(0)} [${e.low.toFixed(0)}, ${e.high.toFixed(0)}]`
        console.log(`${s.verdict.padEnd(16)} ${s.id.padEnd(26)} win ${(s.baseline.matchWin * 100).toFixed(1)}->${(s.variant.matchWin * 100).toFixed(1)}  dWin ${f(s.effect.matchWin)}  dRound ${f(s.effect.roundShare)}  dCash ${f(s.effect.cashPerRound, false)}`)
    }
    console.log(JSON.stringify(report.regroupRoundProbe), `${((Date.now() - t0) / 1000).toFixed(1)}s`)
}
