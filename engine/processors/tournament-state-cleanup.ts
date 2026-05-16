/**
 * Reset stale future-tournament state on the current save.
 *
 * Extracted from atomic-week-processor.ts processTournaments
 * (Phase M4). This runs at the start of every weekly tournament
 * processing pass to clear "phantom future state" — tournaments
 * scheduled for a future week that already have teams / standings /
 * brackets populated from legacy snapshot seeding or older saves.
 *
 * Without this cleanup, a future-week tournament could ship with
 * pre-populated participants from a prior save's snapshot, causing
 * weird bracket states when that week actually arrives.
 *
 * Pure save mutator: walks save.tournaments and resets only the
 * tournaments whose startWeek > currentWeek AND have premature
 * state (teams / standings / playoff bracket populated).
 */

import type { GameSave } from "../save-types"

export function resetStaleTournamentState(save: GameSave): void {
    save.tournaments.forEach(t => {
        if (t.startWeek > save.currentWeek) {
            const hasPrematureState =
                (t.teamIds && t.teamIds.length > 0)
                || (t.standings && t.standings.length > 0)
                || (t.playoffBracket && t.playoffBracket.length > 0)

            if (!hasPrematureState) return

            t.teamIds = []
            t.standings = []
            t.playoffBracket = []
            t.currentStage = "Registration"
            t.isCompleted = false
            t.winnerId = undefined
            t.rewardsGranted = false
        }
    })
}
