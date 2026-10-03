/**
 * Canonical legacy-v2 series runner.
 *
 * L21 / L14.A1: instant simulation, live playback, live "skip" and a
 * resumed live checkpoint must produce the same canonical result for the
 * same seeded fixture and the same manager decisions. Before this module
 * the live hook re-implemented the round loop (no playstyle counter, no
 * stage pressure, no clutch momentum, different side rolls, no economy
 * record, staff talents dropped), so a watched match and an instant match
 * of the same fixture disagreed.
 *
 * Every path now drives `playLegacyRound`, a pure step over a serializable
 * state (`SimState` + recorded map results). Rules applied by the step:
 *
 *   - Round RNG = createMatchRNG(seed + mapIndex * 1000 + round).
 *   - Starting sides come from `resolveHomeStartsCT` (forced veto side or a
 *     seed/map hash), never from a shared stream.
 *   - Pistol rounds (1 and 13) are PISTOL for both teams; overtime rounds are
 *     FULL unless the manager calls something else; otherwise each team uses
 *     its economy style thresholds.
 *   - Manager decisions only touch the managed team: a buy call
 *     (ECO/FORCE/SEMIBUY/FULL/DOUBLE AWP) and a regroup (tactical timeout)
 *     that subtracts at most two losses from that team's tilt calculation.
 *   - Halftime (after round 12), overtime entry (12-12) and every overtime
 *     half swap sides, reset economies and clear streaks/momentum. Overtime
 *     sets are MR3 to 16/19/22; after a third tied set the next decided
 *     round wins the map.
 *
 * Opponent information is never exposed to the decision policy beyond the
 * scoreboard (see `LegacyDecisionView`).
 */

import type {
    Analyst,
    Coach,
    CustomTactics,
    MapId,
    MapResult,
    MatchResult,
    Player,
    PlayerMatchStats,
    Psychologist,
    RoundResult,
    SimState,
    Team,
} from '@/types'
import { EconomyManager } from '../economy-manager'
import { createMatchRNG, type SeededRNG } from '../rng'
import { applyRoundEconomy, getMapsToWinForFormat, resolveHomeStartsCT } from '@/lib/live-match-utils'
import { managedLoadout, regroupLossStreak, restoreTimeoutState, spendTimeout, type TimeoutState } from './manager-controls'
import { determineMapMVP, determineMVP, generateMatchStats } from './match-stats'
import type { BuyStrategy } from './buy-phase'
import type { PlayerSimulationState } from './round-outcome'
import { LEGACY_MATCH_ENGINE } from './live-checkpoint'

export type ManagerStrategy = 'ECO' | 'FORCE' | 'SEMIBUY' | 'FULL' | 'DOUBLE AWP'
export const MANAGER_STRATEGIES: readonly ManagerStrategy[] = ['ECO', 'FORCE', 'SEMIBUY', 'FULL', 'DOUBLE AWP']
export const LEGACY_SERIES_RULES = 2 as const
/** Dedicated stream for post-series statistics so they never depend on how many rounds were stepped. */
export const LEGACY_STATS_SEED_OFFSET = 7_777_777

type StaffBundle = { coach?: Coach; analyst?: Analyst; psychologist?: Psychologist }

/** Subset of SimulationEngineV2 the stepper needs (injected to avoid an import cycle). */
export interface LegacyRoundEngine {
    performBuyPhase(players: Player[], economy: Record<string, PlayerSimulationState>, strategy: BuyStrategy, isCT: boolean, rng: SeededRNG, customTactics?: CustomTactics): void
    simulateRound(
        rng: SeededRNG, homePlayers: Player[], awayPlayers: Player[], homeBaseStrength: number, awayBaseStrength: number,
        homeMapStrength: number, awayMapStrength: number, homeIsCT: boolean, homeWinStreak: number, awayWinStreak: number,
        homeLossStreak: number, awayLossStreak: number, roundNum: number,
        homeEconomy: Record<string, PlayerSimulationState>, awayEconomy: Record<string, PlayerSimulationState>,
        homeStrategy?: BuyStrategy, awayStrategy?: BuyStrategy, isHighPressure?: boolean, homeTeam?: Team, awayTeam?: Team,
        currentCTTeamId?: string, currentTTeamId?: string, customTactics?: CustomTactics,
        homeMomentumScore?: number, awayMomentumScore?: number, homeStaff?: StaffBundle, awayStaff?: StaffBundle,
        mapId?: MapId, matchStage?: string, cachedHomeStressRes?: number, cachedAwayStressRes?: number, cachedPlayerMap?: Map<string, Player>,
    ): { winner: 'HOME' | 'AWAY'; winType: RoundResult['winType']; kills: RoundResult['kills']; deaths: NonNullable<RoundResult['deaths']>; events: NonNullable<RoundResult['events']> }
}

export interface LegacySeriesSide {
    team: Team
    players: Player[]
    staff: StaffBundle
    /** Base strength after the playstyle counter, fixed for the series. */
    strength: number
    mapStrengths: Map<MapId, number>
    stressRes: number
}

export interface LegacySeriesContext {
    engine: LegacyRoundEngine
    seed: number
    format: string
    maps: MapId[]
    mapStartingSides?: Record<string, string>
    home: LegacySeriesSide
    away: LegacySeriesSide
    isHighPressure: boolean
    matchStage?: string
    managedTeamId?: string
    customTactics?: CustomTactics
    playerMap: Map<string, Player>
}

export type LegacyTransition = 'NONE' | 'HALFTIME' | 'OVERTIME' | 'OVERTIME_SWITCH' | 'MAP_END' | 'SERIES_END'

export interface LegacyLastRound {
    mapIndex: number
    roundNumber: number
    homeRounds: number
    awayRounds: number
    winner: 'HOME' | 'AWAY'
    transition: LegacyTransition
}

/** Serializable live state: the persisted SimState plus rule bookkeeping. */
export type LegacySimState = SimState

export interface LegacySeriesState {
    sim: LegacySimState
    maps: MapResult[]
    finished: boolean
}

export interface LegacyRoundDecision {
    /** Managed team's buy call; ignored on pistol rounds. */
    strategy?: ManagerStrategy
    /** Managed team is regrouping after a tactical timeout. */
    regroup?: boolean
    /** Current managed loadouts (the live screen may edit them between rounds). */
    customTactics?: CustomTactics
}

export interface LegacyRoundStep {
    state: LegacySeriesState
    round: RoundResult
    /** Post-buy, pre-round equipment for display. */
    preRound: { home: Record<string, PlayerSimulationState>; away: Record<string, PlayerSimulationState> }
    transition: LegacyTransition
}

/** What a manager may know between rounds: own economy and the public scoreboard only. */
export interface LegacyDecisionView {
    mapIndex: number
    map: MapId
    round: number
    pistolRound: boolean
    isOvertime: boolean
    side: 'CT' | 'T'
    ownRounds: number
    opponentRounds: number
    ownSeries: number
    opponentSeries: number
    ownLossStreak: number
    ownWinStreak: number
    ownCash: number[]
    timeoutsRemaining: number
    regroupActive: boolean
}

export interface LegacyPolicyDecision { strategy?: ManagerStrategy; callTimeout?: boolean }
export type LegacyDecisionPolicy = (view: LegacyDecisionView) => LegacyPolicyDecision | undefined

export interface LegacyDecisionRecord {
    mapIndex: number
    round: number
    strategy?: ManagerStrategy
    timeoutCalled?: boolean
    regroup?: boolean
}

// ===== playstyle counter (rock-paper-scissors) =====
type PlaystyleType = Team['playstyle']
export function playstyleCounterMod(myStyle: PlaystyleType, opponentStyle: PlaystyleType, bonus: number, penalty: number): number {
    if (!myStyle || myStyle === 'default' || !opponentStyle || opponentStyle === 'default') return 1
    const counters: Record<string, string> = { aggressive: 'structured', structured: 'balanced', balanced: 'aggressive' }
    if (counters[myStyle] === opponentStyle) return 1 + bonus
    if (counters[opponentStyle] === myStyle) return 1 - penalty
    return 1
}

// ===== economy helpers =====
function defaultWeapon(isCT: boolean): string { return isCT ? 'usp' : 'glock' }

export function freshEconomy(players: Player[], isCT: boolean, cash: number): Record<string, PlayerSimulationState> {
    return Object.fromEntries(players.map(p => [p.id, { id: p.id, cash, weapon: defaultWeapon(isCT), hasArmor: false, hasHelmet: false, hasKit: false, utility: [] }]))
}

function cloneEconomy(players: Player[], economy: Record<string, Partial<PlayerSimulationState>> | undefined, isCT: boolean): Record<string, PlayerSimulationState> {
    return Object.fromEntries(players.map(p => {
        const e = economy?.[p.id]
        const cash = typeof e?.cash === 'number' && Number.isFinite(e.cash) ? Math.max(0, Math.min(EconomyManager.MAX_CASH, Math.floor(e.cash))) : EconomyManager.ROUND_START_CASH
        return [p.id, {
            id: p.id, cash, weapon: typeof e?.weapon === 'string' ? e.weapon : defaultWeapon(isCT),
            hasArmor: !!e?.hasArmor, hasHelmet: !!e?.hasHelmet, hasKit: !!e?.hasKit, utility: Array.isArray(e?.utility) ? [...e!.utility] : [],
        }]
    }))
}

const avgCash = (economy: Record<string, PlayerSimulationState>) => {
    const values = Object.values(economy)
    return values.length ? values.reduce((s, p) => s + p.cash, 0) / values.length : 0
}

export function overtimeMapWinThreshold(otSet: number): number {
    return 12 + 3 * (Math.max(1, Math.floor(otSet)) - 1) + 4
}

function mapShell(ctx: LegacySeriesContext, mapIndex: number): MapResult {
    const map = ctx.maps[mapIndex]
    const homeStartsCT = resolveHomeStartsCT({ mapId: map, mapStartingSides: ctx.mapStartingSides, homeTeamId: ctx.home.team.id, awayTeamId: ctx.away.team.id, seed: ctx.seed, mapIndex })
    return {
        map,
        ctStartTeamId: homeStartsCT ? ctx.home.team.id : ctx.away.team.id,
        tStartTeamId: homeStartsCT ? ctx.away.team.id : ctx.home.team.id,
        rounds: [], finalScore: { team1: 0, team2: 0 }, homeScore: 0, awayScore: 0, mvpPlayerId: '',
    }
}

function mapStartSim(ctx: LegacySeriesContext, mapIndex: number, homeSeries: number, awaySeries: number): LegacySimState {
    const homeStartsCT = resolveHomeStartsCT({ mapId: ctx.maps[mapIndex], mapStartingSides: ctx.mapStartingSides, homeTeamId: ctx.home.team.id, awayTeamId: ctx.away.team.id, seed: ctx.seed, mapIndex })
    return {
        rulesVersion: LEGACY_SERIES_RULES,
        homeEconomy: freshEconomy(ctx.home.players, homeStartsCT, EconomyManager.ROUND_START_CASH),
        awayEconomy: freshEconomy(ctx.away.players, !homeStartsCT, EconomyManager.ROUND_START_CASH),
        homeWinStreak: 0, awayWinStreak: 0, homeLossStreak: 0, awayLossStreak: 0,
        homeRounds: 0, awayRounds: 0, currentMapIndex: mapIndex, currentRound: 1,
        homeSeriesScore: homeSeries, awaySeriesScore: awaySeries,
        isOvertime: false, currentOTSet: 0, homeStartsCT, homeMomentumScore: 0, awayMomentumScore: 0,
    }
}

export function createLegacySeriesState(ctx: LegacySeriesContext): LegacySeriesState {
    if (!ctx.maps.length) throw Error('A series needs at least one map')
    return { sim: mapStartSim(ctx, 0, 0, 0), maps: ctx.maps.map((_, i) => mapShell(ctx, i)), finished: false }
}

function swapSides(ctx: LegacySeriesContext, sim: LegacySimState, cash: number): void {
    sim.homeStartsCT = !sim.homeStartsCT
    sim.homeEconomy = freshEconomy(ctx.home.players, sim.homeStartsCT, cash)
    sim.awayEconomy = freshEconomy(ctx.away.players, !sim.homeStartsCT, cash)
    sim.homeWinStreak = sim.awayWinStreak = sim.homeLossStreak = sim.awayLossStreak = 0
    sim.homeMomentumScore = sim.awayMomentumScore = 0
}

/**
 * Apply the between-rounds transition that follows the round just recorded
 * in `sim` (currentRound already advanced). Exported so a checkpoint written
 * by the pre-L21 live hook (which applied these at ROUND_END playback) can be
 * normalised exactly once on restore.
 */
export function applyLegacyTransition(ctx: LegacySeriesContext, sim: LegacySimState): LegacyTransition {
    const threshold = sim.isOvertime ? overtimeMapWinThreshold(sim.currentOTSet) : 13
    const suddenDeath = sim.isOvertime && sim.currentOTSet > 3 && sim.homeRounds !== sim.awayRounds
    if (sim.homeRounds >= threshold || sim.awayRounds >= threshold || suddenDeath) {
        const homeWon = sim.homeRounds > sim.awayRounds
        const homeSeries = sim.homeSeriesScore + (homeWon ? 1 : 0)
        const awaySeries = sim.awaySeriesScore + (homeWon ? 0 : 1)
        const toWin = getMapsToWinForFormat(ctx.format)
        if (homeSeries >= toWin || awaySeries >= toWin || sim.currentMapIndex + 1 >= ctx.maps.length) {
            sim.homeSeriesScore = homeSeries
            sim.awaySeriesScore = awaySeries
            return 'SERIES_END'
        }
        Object.assign(sim, mapStartSim(ctx, sim.currentMapIndex + 1, homeSeries, awaySeries))
        return 'MAP_END'
    }
    if (!sim.isOvertime && sim.homeRounds === 12 && sim.awayRounds === 12) {
        sim.isOvertime = true
        sim.currentOTSet = 1
        swapSides(ctx, sim, 10000)
        return 'OVERTIME'
    }
    if (!sim.isOvertime && sim.currentRound === 13) {
        swapSides(ctx, sim, EconomyManager.ROUND_START_CASH)
        return 'HALFTIME'
    }
    if (sim.isOvertime && sim.currentRound > 25 && (sim.currentRound - 25) % 3 === 0) {
        if ((sim.currentRound - 25) % 6 === 0) sim.currentOTSet = Math.max(1, sim.currentOTSet) + 1
        swapSides(ctx, sim, 10000)
        return 'OVERTIME_SWITCH'
    }
    return 'NONE'
}

/**
 * Normalise a restored live SimState. Checkpoints written before rules v2
 * applied halftime/overtime/map transitions when ROUND_END was played back;
 * if that ROUND_END was still pending, apply the transition exactly once.
 * v2 checkpoints are returned unchanged. Returns a new object.
 */
export function normalizeRestoredSim(ctx: LegacySeriesContext, restored: LegacySimState, roundInFlight: boolean): LegacySimState {
    const sim: LegacySimState = { ...restored }
    if (sim.rulesVersion === LEGACY_SERIES_RULES) return sim
    if (roundInFlight) {
        const before = { mapIndex: sim.currentMapIndex, homeRounds: sim.homeRounds, awayRounds: sim.awayRounds, roundNumber: sim.currentRound - 1, winner: (sim.homeWinStreak > 0 ? 'HOME' : 'AWAY') as 'HOME' | 'AWAY' }
        const transition = applyLegacyTransition(ctx, sim)
        sim.lastRound = { ...before, transition }
    }
    sim.rulesVersion = LEGACY_SERIES_RULES
    return sim
}

/** Play exactly one round of the series. Pure: the input state is not mutated. */
export function playLegacyRound(ctx: LegacySeriesContext, input: LegacySeriesState, decision: LegacyRoundDecision = {}): LegacyRoundStep {
    if (input.finished) throw Error('The series is already finished')
    const sim: LegacySimState = { ...input.sim, rulesVersion: LEGACY_SERIES_RULES }
    const { home, away } = ctx
    const mapIndex = sim.currentMapIndex
    const mapId = ctx.maps[mapIndex]
    if (!mapId) throw Error('Round requested for a map outside the series')
    const roundNum = sim.currentRound
    const homeIsCT = sim.homeStartsCT
    const rng = createMatchRNG(ctx.seed + mapIndex * 1000 + roundNum)

    const hEcon = cloneEconomy(home.players, sim.homeEconomy, homeIsCT)
    const aEcon = cloneEconomy(away.players, sim.awayEconomy, !homeIsCT)
    const preBuyCash: Record<string, number> = {}
    for (const e of [...Object.values(hEcon), ...Object.values(aEcon)]) preBuyCash[e.id] = e.cash

    const pistol = !sim.isOvertime && (roundNum === 1 || roundNum === 13)
    const managedHome = !!ctx.managedTeamId && ctx.managedTeamId === home.team.id
    const managedAway = !!ctx.managedTeamId && ctx.managedTeamId === away.team.id
    const call = decision.strategy && MANAGER_STRATEGIES.includes(decision.strategy) ? decision.strategy : undefined
    const auto = (econ: Record<string, PlayerSimulationState>, team: Team): BuyStrategy =>
        sim.isOvertime ? 'FULL' : EconomyManager.getTeamStrategy(avgCash(econ), team.economyStyle)
    const homeStrategy: BuyStrategy = pistol ? 'PISTOL' : (managedHome && call) || auto(hEcon, home.team)
    const awayStrategy: BuyStrategy = pistol ? 'PISTOL' : (managedAway && call) || auto(aEcon, away.team)

    const tactics = decision.customTactics ?? ctx.customTactics
    ctx.engine.performBuyPhase(home.players, hEcon, homeStrategy, homeIsCT, rng, managedLoadout(tactics, home.team.id, ctx.managedTeamId))
    ctx.engine.performBuyPhase(away.players, aEcon, awayStrategy, !homeIsCT, rng, managedLoadout(tactics, away.team.id, ctx.managedTeamId))
    const preRound = { home: structuredClone(hEcon), away: structuredClone(aEcon) }

    const regroupHome = !!decision.regroup && managedHome
    const regroupAway = !!decision.regroup && managedAway
    const ctId = homeIsCT ? home.team.id : away.team.id
    const tId = homeIsCT ? away.team.id : home.team.id
    const r = ctx.engine.simulateRound(
        rng, home.players, away.players, home.strength, away.strength,
        home.mapStrengths.get(mapId) || 50, away.mapStrengths.get(mapId) || 50, homeIsCT,
        sim.homeWinStreak, sim.awayWinStreak,
        regroupLossStreak(sim.homeLossStreak, regroupHome), regroupLossStreak(sim.awayLossStreak, regroupAway),
        roundNum, hEcon, aEcon, homeStrategy, awayStrategy, ctx.isHighPressure, home.team, away.team, ctId, tId, tactics,
        sim.homeMomentumScore, sim.awayMomentumScore, home.staff, away.staff, mapId, ctx.matchStage, home.stressRes, away.stressRes, ctx.playerMap,
    )
    const homeWon = r.winner === 'HOME'

    const playerEconomy = [...home.players.map(p => ({ p, e: hEcon[p.id] })), ...away.players.map(p => ({ p, e: aEcon[p.id] }))].map(({ p, e }) => ({
        playerId: p.id, spent: (preBuyCash[p.id] || 0) - e.cash, remaining: e.cash, weapon: e.weapon, hasArmor: e.hasArmor, hasHelmet: e.hasHelmet, hasKit: e.hasKit,
    }))
    const managerCall = (managedHome || managedAway) && (call && !pistol || decision.regroup)
        ? { ...(call && !pistol ? { strategy: call } : {}), ...(decision.regroup ? { regroup: true } : {}) }
        : undefined
    const round: RoundResult = {
        roundNumber: roundNum,
        winner: homeWon === homeIsCT ? 'ct' : 't',
        winningTeamId: homeWon ? home.team.id : away.team.id,
        winType: r.winType,
        ctTeam: ctId,
        tTeam: tId,
        kills: r.kills,
        deaths: r.deaths,
        playerEconomy,
        events: r.events,
        buys: { home: homeStrategy, away: awayStrategy },
        ...(managerCall ? { managerCall } : {}),
    }

    // Economy (shared helper also covered by live-match-utils tests).
    const applied = applyRoundEconomy({
        homeEconomy: hEcon, awayEconomy: aEcon,
        roundResult: { winner: r.winner, winType: r.winType, kills: r.kills, deaths: r.deaths },
        homeIsCT, homeLossStreakBefore: sim.homeLossStreak, awayLossStreakBefore: sim.awayLossStreak,
        homePlayerIds: home.players.map(p => p.id), awayPlayerIds: away.players.map(p => p.id),
    })
    sim.homeEconomy = cloneEconomy(home.players, applied.homeEconomy as Record<string, PlayerSimulationState>, homeIsCT)
    sim.awayEconomy = cloneEconomy(away.players, applied.awayEconomy as Record<string, PlayerSimulationState>, !homeIsCT)

    // Momentum: winner +1, eco win +3, clutch +2 (cap 10); loser resets.
    const clutch = r.events.some(e => e.type === 'CLUTCH') ? 2 : 0
    const winnerStrategy = homeWon ? homeStrategy : awayStrategy
    const gain = 1 + (winnerStrategy === 'ECO' ? 3 : 0) + clutch
    sim.homeMomentumScore = homeWon ? Math.min(10, sim.homeMomentumScore + gain) : 0
    sim.awayMomentumScore = homeWon ? 0 : Math.min(10, sim.awayMomentumScore + gain)

    sim.homeRounds += homeWon ? 1 : 0
    sim.awayRounds += homeWon ? 0 : 1
    sim.homeWinStreak = homeWon ? sim.homeWinStreak + 1 : 0
    sim.awayWinStreak = homeWon ? 0 : sim.awayWinStreak + 1
    sim.homeLossStreak = homeWon ? 0 : sim.homeLossStreak + 1
    sim.awayLossStreak = homeWon ? sim.awayLossStreak + 1 : 0
    sim.currentRound = roundNum + 1

    const maps = input.maps.map((m, i) => i === mapIndex ? { ...m, rounds: [...m.rounds, round] } : m)
    const map = maps[mapIndex]
    const scoredHome = sim.homeRounds, scoredAway = sim.awayRounds
    map.finalScore = { team1: scoredHome, team2: scoredAway }
    map.homeScore = scoredHome
    map.awayScore = scoredAway

    const transition = applyLegacyTransition(ctx, sim)
    if (transition === 'MAP_END' || transition === 'SERIES_END') map.winner = scoredHome > scoredAway ? home.team.id : away.team.id
    sim.lastRound = { mapIndex, roundNumber: roundNum, homeRounds: scoredHome, awayRounds: scoredAway, winner: r.winner, transition }
    return { state: { sim, maps, finished: transition === 'SERIES_END' }, round, preRound, transition }
}

export function decisionView(ctx: LegacySeriesContext, sim: LegacySimState, timeouts: TimeoutState): LegacyDecisionView | null {
    const managedHome = ctx.managedTeamId === ctx.home.team.id
    if (!managedHome && ctx.managedTeamId !== ctx.away.team.id) return null
    const own = managedHome ? sim.homeEconomy : sim.awayEconomy
    const ownIsCT = managedHome ? sim.homeStartsCT : !sim.homeStartsCT
    return {
        mapIndex: sim.currentMapIndex, map: ctx.maps[sim.currentMapIndex], round: sim.currentRound,
        pistolRound: !sim.isOvertime && (sim.currentRound === 1 || sim.currentRound === 13), isOvertime: sim.isOvertime,
        side: ownIsCT ? 'CT' : 'T',
        ownRounds: managedHome ? sim.homeRounds : sim.awayRounds, opponentRounds: managedHome ? sim.awayRounds : sim.homeRounds,
        ownSeries: managedHome ? sim.homeSeriesScore : sim.awaySeriesScore, opponentSeries: managedHome ? sim.awaySeriesScore : sim.homeSeriesScore,
        ownLossStreak: managedHome ? sim.homeLossStreak : sim.awayLossStreak, ownWinStreak: managedHome ? sim.homeWinStreak : sim.awayWinStreak,
        ownCash: Object.values(own as Record<string, { cash: number }>).map(e => e.cash),
        timeoutsRemaining: timeouts.remaining, regroupActive: timeouts.rounds > 0,
    }
}

/**
 * Run the whole series. A policy (pre-match plan or a recorded live log)
 * may call the managed team's buy and spend timeouts under the same rules
 * as the live screen: two per series, between rounds, no stacking, two
 * rounds of regroup each.
 */
export function runLegacySeries(ctx: LegacySeriesContext, policy?: LegacyDecisionPolicy, start?: { state: LegacySeriesState; timeouts?: TimeoutState }): { state: LegacySeriesState; decisions: LegacyDecisionRecord[]; timeouts: TimeoutState } {
    let state = start?.state ?? createLegacySeriesState(ctx)
    let timeouts = start?.timeouts ?? restoreTimeoutState()
    const decisions: LegacyDecisionRecord[] = []
    let guard = 0
    while (!state.finished) {
        if (++guard > 500) throw Error('Series did not finish')
        const view = policy ? decisionView(ctx, state.sim, timeouts) : null
        const choice = view ? policy!(view) : undefined
        let timeoutCalled = false
        if (choice?.callTimeout) {
            const next = spendTimeout(timeouts, true, 'IN_PROGRESS')
            if (next) { timeouts = next; timeoutCalled = true }
        }
        const regroup = timeouts.rounds > 0
        const step = playLegacyRound(ctx, state, { strategy: choice?.strategy, regroup })
        if (timeouts.rounds > 0) timeouts = { ...timeouts, rounds: timeouts.rounds - 1 }
        if (choice?.strategy || timeoutCalled || regroup) decisions.push({ mapIndex: state.sim.currentMapIndex, round: state.sim.currentRound, ...(choice?.strategy ? { strategy: choice.strategy } : {}), ...(timeoutCalled ? { timeoutCalled } : {}), ...(regroup ? { regroup } : {}) })
        state = step.state
    }
    return { state, decisions, timeouts }
}

/** Canonical result from a finished (or forfeited mid-way) series state. */
export function finalizeLegacySeries(ctx: LegacySeriesContext, state: LegacySeriesState, management?: MatchResult['management']): MatchResult {
    const played = state.maps.filter(m => m.rounds.length > 0).map(m => ({ ...m, mvpPlayerId: determineMapMVP(m.rounds, ctx.home.players, ctx.away.players) }))
    const homeScore = state.sim.homeSeriesScore
    const awayScore = state.sim.awaySeriesScore
    const homeWon = homeScore > awayScore
    const playerStats: Record<string, PlayerMatchStats> = generateMatchStats(createMatchRNG(ctx.seed + LEGACY_STATS_SEED_OFFSET), ctx.home.players, ctx.away.players, played, homeWon)
    return {
        engineVersion: LEGACY_MATCH_ENGINE,
        lineups: { [ctx.home.team.id]: ctx.home.players.map(p => p.id), [ctx.away.team.id]: ctx.away.players.map(p => p.id) },
        homeScore, awayScore, maps: played,
        mvpPlayerId: determineMVP(playerStats, homeWon ? ctx.home.players : ctx.away.players),
        playerStats,
        winnerId: homeWon ? ctx.home.team.id : ctx.away.team.id,
        ...(management ? { management } : {}),
    }
}
