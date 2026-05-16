/**
 * Per-match tactical bonus — analyst stat sum + playstyle
 * rock-paper-scissors counter.
 *
 * Extracted from atomic-week-processor.ts processMatches (Phase M5).
 * Runs twice per match (home vs away). Pure function with no side
 * effects: takes pre-indexed staff for the team + both playstyles,
 * returns a numeric bonus that the match engine applies as a tactical
 * modifier.
 *
 * Two contributions:
 *   1. Analyst stat sum: each analyst's stats.analysis (default 50)
 *      summed and rescaled — ~5pt bonus per "100 analysis" of staff.
 *   2. Strategy triangle (rock-paper-scissors):
 *        AGGRESSIVE beats STRUCTURED → +5
 *        STRUCTURED beats BALANCED  → +5
 *        BALANCED beats AGGRESSIVE  → +5
 *      "default" normalizes to "balanced".
 */

import type { StaffSaveData } from "../save-types"

export function getTacticalBonus(
    teamStaff: StaffSaveData[] | undefined,
    myStyle: string | undefined | null,
    opponentStyle: string | undefined | null,
): number {
    let bonus = 0

    // 1. Analyst stats — each analyst contributes (stats.analysis ?? 50).
    let statSum = 0
    if (teamStaff) {
        for (const s of teamStaff) {
            if (s.role === "analyst") statSum += s.stats?.analysis || 50
        }
    }
    bonus += (statSum / 100) * 5

    // 2. Strategy triangle. Normalize "default"/empty to "balanced".
    const normalize = (s: string | undefined | null) => (!s || s === "default") ? "balanced" : s
    const my = normalize(myStyle)
    const opp = normalize(opponentStyle)

    if (my === "aggressive" && opp === "structured") bonus += 5
    if (my === "structured" && opp === "balanced") bonus += 5
    if (my === "balanced" && opp === "aggressive") bonus += 5

    return bonus
}
