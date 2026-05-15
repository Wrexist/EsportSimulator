/**
 * Pure data builders for the live-match initialization path.
 *
 * Extracted from useLiveMatch.ts (Phase L5). The init useEffect builds
 * two big literal structs at the start of every fresh live match:
 *   1. A reset liveResult — copy of the baseResult shell, but with
 *      every map zeroed (no rounds played yet, no winner, scores 0-0).
 *   2. The initial SimState — all streaks/scores at zero, currentRound=1,
 *      homeStartsCT carrying the side-decision for map 0.
 *
 * Both are pure transformations of caller-provided inputs (no React,
 * no useGameStore access). Extracting them shrinks the init useEffect
 * by ~40 lines and gives the data shapes direct unit-test coverage.
 */

import type { MatchResult, SimState, LiveGameState, ActiveMatchState } from "@/types"
import { buildCanonicalResultMaps } from "@/lib/live-match-builders"

/**
 * Build the "fresh series" live result — every map result is zeroed
 * out so the live match plays them round-by-round starting from 0-0.
 * Caller supplies a baseResult (an offline simulation seed used for
 * map ordering) and the canonical map list.
 */
export function buildFreshLiveResult(args: {
    baseResult: MatchResult
    canonicalMaps: string[]
    homeTeamId: string
    awayTeamId: string
    mapStartingSides?: Record<string, string>
    seed: number
}): MatchResult {
    const { baseResult, canonicalMaps, homeTeamId, awayTeamId, mapStartingSides, seed } = args

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resetMaps = buildCanonicalResultMaps(
        baseResult.maps as any[],
        canonicalMaps as any[],
        homeTeamId,
        awayTeamId,
        mapStartingSides,
        seed,
    ).map((mapData: any) => ({
        ...mapData,
        rounds: [],
        homeScore: 0,
        awayScore: 0,
        winner: undefined,
        finalScore: { team1: 0, team2: 0 },
    }))

    return {
        ...baseResult,
        winnerId: null,
        homeScore: 0,
        awayScore: 0,
        maps: resetMaps,
    }
}

/**
 * Build the initial SimState for a brand-new live match (no restore).
 * All streak / score / momentum counters are zero. The only inputs
 * are the per-team economies (already constructed via
 * createRoundStartEconomy) and the home-side decision for map 0.
 */
export function buildInitialSimState(args: {
    homeEconomy: SimState["homeEconomy"]
    awayEconomy: SimState["awayEconomy"]
    homeStartsCT: boolean
}): SimState {
    return {
        homeEconomy: args.homeEconomy,
        awayEconomy: args.awayEconomy,
        homeWinStreak: 0,
        awayWinStreak: 0,
        homeLossStreak: 0,
        awayLossStreak: 0,
        homeRounds: 0,
        awayRounds: 0,
        currentMapIndex: 0,
        currentRound: 1,
        homeSeriesScore: 0,
        awaySeriesScore: 0,
        isOvertime: false,
        currentOTSet: 0,
        homeStartsCT: args.homeStartsCT,
        homeMomentumScore: 0,
        awayMomentumScore: 0,
    }
}

/**
 * Sanitize a restored SimState read from activeMatchState. Every
 * field defaults to zero/false if the saved value is missing or
 * invalid. currentRound is floored at 1 (zero is never a legal
 * round number in CS2 scoring). currentMapIndex is passed in
 * already clamped to canonicalMaps bounds.
 */
export function sanitizeRestoredSimState(args: {
    restoredSim: Partial<SimState> | undefined
    homeEconomy: SimState["homeEconomy"]
    awayEconomy: SimState["awayEconomy"]
    homeStartsCT: boolean
    currentMapIndex: number
}): SimState {
    const { restoredSim, homeEconomy, awayEconomy, homeStartsCT, currentMapIndex } = args
    return {
        homeEconomy,
        awayEconomy,
        homeWinStreak: restoredSim?.homeWinStreak ?? 0,
        awayWinStreak: restoredSim?.awayWinStreak ?? 0,
        homeLossStreak: restoredSim?.homeLossStreak ?? 0,
        awayLossStreak: restoredSim?.awayLossStreak ?? 0,
        homeRounds: restoredSim?.homeRounds ?? 0,
        awayRounds: restoredSim?.awayRounds ?? 0,
        currentMapIndex,
        currentRound: Math.max(1, restoredSim?.currentRound ?? 1),
        homeSeriesScore: restoredSim?.homeSeriesScore ?? 0,
        awaySeriesScore: restoredSim?.awaySeriesScore ?? 0,
        isOvertime: Boolean(restoredSim?.isOvertime ?? false),
        currentOTSet: restoredSim?.currentOTSet ?? 0,
        homeStartsCT,
        homeMomentumScore: restoredSim?.homeMomentumScore ?? 0,
        awayMomentumScore: restoredSim?.awayMomentumScore ?? 0,
    }
}

/**
 * Build the restored LiveGameState from a paused/saved match.
 * Falls back to derived values from the SimState when the saved
 * gameState fields are missing — e.g., a save with no recorded
 * gameState.round defaults to sim.currentRound-1.
 */
export function buildRestoredGameState(args: {
    savedGameState: ActiveMatchState["gameState"] | undefined
    simState: SimState
    currentMapIndex: number
}): LiveGameState {
    const { savedGameState, simState, currentMapIndex } = args
    return {
        round: savedGameState?.round ?? Math.max(1, simState.currentRound - 1),
        homeScore: savedGameState?.homeScore ?? simState.homeRounds,
        awayScore: savedGameState?.awayScore ?? simState.awayRounds,
        homeSeriesScore: simState.homeSeriesScore,
        awaySeriesScore: simState.awaySeriesScore,
        status: savedGameState?.status ?? "IN_PROGRESS",
        time: typeof savedGameState?.time === "number" ? savedGameState.time : -1,
        isPaused: Boolean(savedGameState?.isPaused ?? false),
        currentMapIndex,
    }
}
