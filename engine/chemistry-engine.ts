/**
 * Chemistry Engine - Time-based team chemistry growth
 *
 * Chemistry grows slowly when a roster is stable (no transfers),
 * drops on roster swaps, and gets boosted by bootcamps.
 */

import type { TeamSaveData } from "./save-types"

/** Chemistry growth per stable week */
export const CHEMISTRY_GROWTH_PER_WEEK = 0.5

/** Chemistry penalty per player changed in a roster swap */
export const CHEMISTRY_PENALTY_PER_SWAP = 10

/** Maximum chemistry penalty from a single transfer event */
export const MAX_CHEMISTRY_PENALTY = 30

/** Minimum weeks of roster stability before growth kicks in */
export const STABILITY_THRESHOLD_WEEKS = 2

/** Bootcamp chemistry bonuses by activity type */
export const BOOTCAMP_CHEMISTRY_BONUS: Record<string, number> = {
    REST: 5,      // RETREAT type → mapped to "REST" in BookBootcampModal
    TRAVEL: 3,    // INTERNATIONAL type → mapped to "TRAVEL"
    BOOTCAMP: 8,  // LOCAL type → mapped to "BOOTCAMP" — intensive team-building
}

/**
 * Process weekly chemistry growth for a single team.
 * Call once per team per week tick.
 */
export function processWeeklyChemistryGrowth(
    team: TeamSaveData,
    currentWeek: number
): void {
    const lastChange = team.lastRosterChangeWeek ?? 1
    const weeksStable = currentWeek - lastChange

    if (weeksStable < STABILITY_THRESHOLD_WEEKS) return

    team.chemistry = Math.min(100, Math.max(0, (team.chemistry ?? 50) + CHEMISTRY_GROWTH_PER_WEEK))
}

/**
 * Apply chemistry penalty when a roster change occurs.
 * @param playersChanged - number of players added or removed in this transaction
 */
export function applyRosterChangePenalty(
    team: TeamSaveData,
    currentWeek: number,
    playersChanged: number = 1
): void {
    const penalty = Math.min(MAX_CHEMISTRY_PENALTY, CHEMISTRY_PENALTY_PER_SWAP * playersChanged)
    team.chemistry = Math.max(0, (team.chemistry ?? 50) - penalty)
    team.lastRosterChangeWeek = currentWeek
}

/**
 * Apply bootcamp chemistry bonus.
 * @param activityType - The activity type ("BOOTCAMP" | "REST" | "TRAVEL")
 * @returns The bonus applied
 */
export function applyBootcampChemistryBonus(
    team: TeamSaveData,
    activityType: string
): number {
    const bonus = BOOTCAMP_CHEMISTRY_BONUS[activityType] ?? 0
    if (bonus > 0) {
        team.chemistry = Math.min(100, (team.chemistry ?? 50) + bonus)
    }
    return bonus
}
