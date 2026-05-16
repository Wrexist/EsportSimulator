/**
 * Circuit-points + trophy awarder for tournament completions.
 *
 * Extracted from atomic-week-processor.ts (Phase M3). Called from
 * processTournaments inside the per-team loop that processes a
 * finished tournament's placement results.
 *
 * Two side effects in one function:
 *   1. Adds `points` to the team's circuit-points entry, creating
 *      the entry if it doesn't exist.
 *   2. On placement === 1 (champion), awards the trophy to team
 *      .trophies — but ONLY if the same base tournament hasn't already
 *      awarded a trophy this season. S_TIER wins also bump every
 *      roster player's majorWins counter.
 *
 * Idempotency: trophy duplicates are guarded by checking
 * (baseTournamentId, season) so a re-processed completion in the same
 * season won't add another trophy.
 */

import type { GameSave } from "../save-types"
import type { SaveIndexes } from "@/store/indexes"
import { FULL_TOURNAMENT_CALENDAR } from "@/data/tournament-calendar"

const toBaseTournamentId = (id: string) => id.replace(/_s\d+$/, "")

const getSeason = (id: string) => {
    const match = id.match(/_s(\d+)$/)
    return match ? parseInt(match[1], 10) : null
}

export function awardCircuitPoints(
    save: GameSave,
    teamId: string,
    points: number,
    tournamentName: string,
    placement: number = 0,
    idx?: SaveIndexes,
): void {
    if (!points) return

    if (!save.circuitPoints) save.circuitPoints = []

    // circuitPoints is a small array (one entry per team), so linear find is fine.
    let entry = save.circuitPoints.find(cp => cp.teamId === teamId)
    if (!entry) {
        entry = { teamId, points: 0, results: [] }
        save.circuitPoints.push(entry)
    }

    entry.points += points
    entry.results.push({
        tournamentId: FULL_TOURNAMENT_CALENDAR.find(t => t.name === tournamentName)?.id || "unknown",
        tournamentName,
        placement,
        points,
        week: save.currentWeek,
    })

    // Phase 28: Trophy awarding (placement 1 only).
    if (placement !== 1) return

    const team = idx?.teamIndex.get(teamId) ?? save.teams.find(t => t.id === teamId)
    const tournament = FULL_TOURNAMENT_CALENDAR.find(t => t.name === tournamentName)
    if (!team || !tournament) return

    const currentSeason = Math.floor((save.currentWeek - 1) / 52) + 1

    // Skip if a prior season-instance of this tournament already finalized rewards.
    const alreadyFinalizedInSeason = save.tournaments.some(
        t =>
            toBaseTournamentId(t.id) === toBaseTournamentId(tournament.id) &&
            (getSeason(t.id) ?? currentSeason) === currentSeason &&
            t.rewardsGranted,
    )
    if (alreadyFinalizedInSeason) return

    if (!team.trophies) team.trophies = []

    // Avoid duplicates within the same (base tournament, season).
    const alreadyHas = team.trophies.some(
        tr =>
            toBaseTournamentId(tr.tournamentId) === toBaseTournamentId(tournament.id) &&
            (getSeason(tr.tournamentId) ?? currentSeason) === currentSeason,
    )
    if (alreadyHas) return

    team.trophies.push({
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        week: save.currentWeek,
        trophyPath: tournament.trophyPath,
        tier: tournament.tier,
    })

    // S_TIER wins bump every roster player's majorWins count.
    if (tournament.tier === "S_TIER") {
        team.rosterIds.forEach(pid => {
            const player = idx?.playerIndex.get(pid) ?? save.players.find(p => p.id === pid)
            if (player) {
                if (!player.majorWins) player.majorWins = 0
                player.majorWins++
            }
        })
    }
}
