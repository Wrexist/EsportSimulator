/**
 * Way out of a live match that cannot be shown (CROSSCUT-13, 2026-11-17).
 *
 * The live screen marks its match as active (the navigation lock) before the
 * UI renders, and the lock is restored when the career loads. When that UI
 * crashes for the match state, "Resume match" crashes again, and instant
 * simulation refuses an active match (it would throw away the rounds already
 * played). This finishes the match without the live screen:
 *
 * - With a checkpoint of this match (rounds played live), the series goes on
 *   from exactly that state with the live screen's "Skip match" step (auto
 *   calls), so the rounds already played and the result they lead to are kept.
 * - Without a usable checkpoint (crash before the first round, or one that can
 *   no longer be restored), the lock is dropped and the match is simulated as
 *   a whole, which is what the live screen itself falls back to when a
 *   checkpoint cannot be restored.
 */

import { useGameStore } from "@/store/game-store"
import type { ActiveMatchState, MatchResult } from "@/types"
import { restoreLivePlayback } from "@/engine/match/live-checkpoint"
import { isEngineVersion } from "@/engine/match/engine-version"
import { finalizeLegacySeries } from "@/engine/match/legacy-series"
import { prepareLegacySeries, buildManagementRecord } from "@/engine/match/legacy-prepare"
import { restoreTimeoutState } from "@/engine/match/manager-controls"
import { commitLiveMatch } from "@/lib/live-match-commit"
import { persistCommittedMatch } from "@/lib/live-checkpoint-store"
import {
    getNormalizedSeed,
    getActivePlayersByRosterOrder,
    finishLegacySeriesFromState,
    restoreLiveSeriesState,
} from "@/lib/live-match-builders"

type StoreState = ReturnType<typeof useGameStore.getState>
type RescueSource = Pick<StoreState, "scheduledMatches" | "teams" | "players" | "staff" | "customTactics" | "playerTeamId" | "saveId">

/**
 * The result of a live match finished from its checkpoint: the rounds in the
 * checkpoint stay as they were, every remaining round is played on auto.
 * Throws when the checkpoint cannot be restored (same checks as the live screen).
 */
export function finishLiveMatchFromCheckpoint(source: RescueSource, checkpoint: ActiveMatchState): MatchResult {
    const id = checkpoint.matchId
    const match = source.scheduledMatches.find(m => m.id === id)
    if (!match) throw Error("The match is no longer on the schedule")
    const homeTeam = source.teams.find(t => t.id === match.homeTeamId)
    const awayTeam = source.teams.find(t => t.id === match.awayTeamId)
    if (!homeTeam || !awayTeam) throw Error("A team of this match is missing")
    const playerMap = new Map(source.players.map(p => [p.id, p]))
    const homePlayers = getActivePlayersByRosterOrder(homeTeam, source.players as Array<{ id: string }>, playerMap as Map<string, { id: string }>)
    const awayPlayers = getActivePlayersByRosterOrder(awayTeam, source.players as Array<{ id: string }>, playerMap as Map<string, { id: string }>)
    if (homePlayers.length < 5 || awayPlayers.length < 5) throw Error("A side has fewer than five players")

    // The live screen's restore checks (useLiveMatch initialisation).
    if (match.engineVersion && !isEngineVersion(match.engineVersion)) throw Error("Unsupported match engine")
    const playback = restoreLivePlayback(checkpoint)
    if (checkpoint.playback?.saveId !== undefined && checkpoint.playback.saveId !== source.saveId) throw Error("This match checkpoint belongs to another career")
    if (JSON.stringify(playback.homeRoster) !== JSON.stringify(homePlayers.map(p => p.id)) || JSON.stringify(playback.awayRoster) !== JSON.stringify(awayPlayers.map(p => p.id))) throw Error("The saved match roster has changed")
    const timeouts = restoreTimeoutState(checkpoint.timeoutsRemaining, checkpoint.timeoutBoostRounds)

    const seed = checkpoint.playback ? checkpoint.playback.seed : getNormalizedSeed(match.seed, match.id)
    const savedMaps = playback.maps.length ? playback.maps : Array.isArray(match.maps) && match.maps.length ? match.maps : undefined
    const ctx = prepareLegacySeries({
        match: { ...match, seed, maps: savedMaps, engineVersion: playback.engine },
        homeTeam,
        awayTeam,
        homePlayers,
        awayPlayers,
        staff: source.staff,
        customTactics: source.customTactics,
        managedTeamId: source.playerTeamId ?? undefined,
    })
    if (playback.playbookCounts && ctx.script) ctx.script.callCounts = new Map(playback.playbookCounts)

    const restored = restoreLiveSeriesState({ ctx, checkpoint, playback, homePlayers, awayPlayers, mapStartingSides: match.mapStartingSides })
    // A round in flight was already computed (and recorded): the series goes on after it.
    const start = { sim: restored.sim, maps: restored.maps, finished: restored.sim.lastRound?.transition === "SERIES_END" }
    const done = start.finished ? start : finishLegacySeriesFromState(ctx, start, { regroupRounds: timeouts.rounds, customTactics: source.customTactics }).state
    return finalizeLegacySeries(ctx, { sim: done.sim, maps: done.maps, finished: true }, buildManagementRecord({
        ctx, match, mode: "live", timeoutsUsed: 2 - timeouts.remaining, maps: done.maps,
    }))
}

/**
 * Records a result for `matchId` without the live screen and drops the match
 * lock. Resolves true when the match is recorded (now or before).
 */
export async function resolveMatchWithoutLiveScreen(matchId: string): Promise<boolean> {
    const state = useGameStore.getState()
    if (state.completedMatches.some(m => m.id === matchId)) {
        if (state.activeMatchId === matchId) state.clearActiveMatchState()
        return true
    }
    const checkpoint = state.activeMatchState?.matchId === matchId ? state.activeMatchState : null
    if (checkpoint) {
        try {
            const result = finishLiveMatchFromCheckpoint(state, structuredClone(checkpoint))
            const outcome = commitLiveMatch({
                matchId,
                ownerSaveId: state.saveId,
                isRecorded: () => useGameStore.getState().completedMatches.some(m => m.id === matchId),
                buildResult: () => result,
                saveMatchResult: useGameStore.getState().saveMatchResult,
                clearActive: useGameStore.getState().clearActiveMatchState,
                persist: (saveId, committedId) => persistCommittedMatch(saveId, committedId, useGameStore.getState().saveGame),
            })
            if (outcome !== "failed") return true
        } catch (error) {
            if (process.env.NODE_ENV !== "production") console.warn("[Match rescue] checkpoint could not be finished; simulating the whole match", error)
        }
    }
    // Nothing usable was played: release this match's lock, then simulate it.
    const now = useGameStore.getState()
    if (now.activeMatchId === matchId || now.activeMatchState?.matchId === matchId) now.clearActiveMatchState()
    return useGameStore.getState().simulateInstantMatch(matchId)
}
