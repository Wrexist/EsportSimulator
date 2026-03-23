/**
 * FPL Player Availability Service
 * Determines if a player is available to play FPL matches based on their schedule
 */

import { PlayerSaveData, TournamentSaveData, MatchSaveData, ActivitySaveData } from "./save-types"

export interface AvailabilityCheck {
    playerId: string
    isAvailable: boolean
    reasons: string[]
}

/**
 * Check if a player is available for FPL this week
 */
export function isPlayerAvailableForFPL(
    player: PlayerSaveData,
    currentWeek: number,
    tournaments: TournamentSaveData[],
    scheduledMatches: MatchSaveData[],
    scheduledActivities: ActivitySaveData[],
    playerTeamId: string | null
): AvailabilityCheck {
    const reasons: string[] = []

    // Basic checks
    if (player.isRetired) {
        reasons.push("Retired")
    }
    if (player.injury) {
        reasons.push(`Injured`)
    }
    if ((player.fatigue || 0) >= 80) {
        reasons.push("Too fatigued")
    }

    // Skip schedule checks for free agents (no team)
    if (playerTeamId) {
        // Check scheduled matches this week (covers both league and tournament matches)
        const weekMatches = scheduledMatches.filter(m =>
            m.week === currentWeek &&
            (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
        )

        if (weekMatches.length > 0) {
            reasons.push(`Has ${weekMatches.length} scheduled match(es)`)
        }

        // Check scheduled activities (bootcamps, travel, etc.)
        const blockingActivities = scheduledActivities.filter(a =>
            currentWeek >= a.week &&
            currentWeek < a.week + a.duration &&
            (a.type === "BOOTCAMP" || a.type === "TRAVEL")
        )

        if (blockingActivities.length > 0) {
            reasons.push(`Scheduled: ${blockingActivities[0].name}`)
        }
    }

    return {
        playerId: player.id,
        isAvailable: reasons.length === 0,
        reasons
    }
}

/**
 * Get all players available for FPL this week
 */
export function getAvailableFPLPlayers(
    players: PlayerSaveData[],
    currentWeek: number,
    tournaments: TournamentSaveData[],
    scheduledMatches: MatchSaveData[],
    scheduledActivities: ActivitySaveData[],
    teams: { id: string; rosterIds: string[] }[]
): PlayerSaveData[] {
    return players.filter(player => {
        // Find player's team (if any)
        const playerTeam = teams.find(t => t.rosterIds.includes(player.id))
        const playerTeamId = playerTeam?.id || null

        const check = isPlayerAvailableForFPL(
            player,
            currentWeek,
            tournaments,
            scheduledMatches,
            scheduledActivities,
            playerTeamId
        )

        return check.isAvailable
    })
}

/**
 * Get availability summary for debugging/UI
 */
export function getAvailabilitySummary(
    players: PlayerSaveData[],
    currentWeek: number,
    tournaments: TournamentSaveData[],
    scheduledMatches: MatchSaveData[],
    scheduledActivities: ActivitySaveData[],
    teams: { id: string; rosterIds: string[] }[]
): { available: number; unavailable: number; reasons: Record<string, number> } {
    const reasonCounts: Record<string, number> = {}
    let available = 0
    let unavailable = 0

    players.forEach(player => {
        const playerTeam = teams.find(t => t.rosterIds.includes(player.id))
        const playerTeamId = playerTeam?.id || null

        const check = isPlayerAvailableForFPL(
            player,
            currentWeek,
            tournaments,
            scheduledMatches,
            scheduledActivities,
            playerTeamId
        )

        if (check.isAvailable) {
            available++
        } else {
            unavailable++
            check.reasons.forEach(reason => {
                // Normalize reason for counting
                const normalizedReason = reason.startsWith("In tournament:")
                    ? "In tournament"
                    : reason.startsWith("Scheduled:")
                        ? "Scheduled activity"
                        : reason.startsWith("Has")
                            ? "Has matches"
                            : reason
                reasonCounts[normalizedReason] = (reasonCounts[normalizedReason] || 0) + 1
            })
        }
    })

    return { available, unavailable, reasons: reasonCounts }
}
