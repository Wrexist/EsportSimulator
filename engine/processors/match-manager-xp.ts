/**
 * Per-match manager XP + win/loss + reputation update.
 *
 * Extracted from atomic-week-processor.ts processMatches (Phase M9).
 * Runs once per simulated match. Only fires when the player team is
 * on at least one side of the match.
 *
 * Effects on save.managerDetails (player team side only):
 *   - Win:  careerWins++,  xp += 100 × multiplier, reputation += 5
 *   - Loss: careerLosses++, xp += 25 × multiplier (participation),
 *           reputation -= 1 (floored at 0)
 *
 * The XP multiplier comes from any "Demo Review" (xp_gain) analyst
 * talents on the player team. Stacked across multiple analysts,
 * hard-capped at +50% to prevent unbounded acceleration.
 *
 * Draws (homeScore === awayScore) increment nothing — neither win
 * nor loss. The original inline branch had `else if`, so a draw
 * was silently a no-op; we preserve that contract here.
 */

import type { GameSave, MatchSaveData } from "../save-types"
import type { MatchResult } from "@/types"
import { getStaffPassiveBonuses } from "../talent-trees"

const ANALYST_XP_TALENT_CAP = 50 // max +50% from stacked analyst talents
const WIN_XP_BASE = 100
const LOSS_XP_BASE = 25
const WIN_REPUTATION_BONUS = 5
const LOSS_REPUTATION_PENALTY = 1

/**
 * Compute the analyst-talent XP multiplier for the player team. Sums
 * the "xp_gain" passive bonus across every analyst on the player
 * team and caps at +ANALYST_XP_TALENT_CAP%.
 */
export function getAnalystXpMultiplier(save: GameSave, playerTeamId: string): number {
    const bonus = Math.min(
        ANALYST_XP_TALENT_CAP,
        save.staff
            .filter(s => s.teamId === playerTeamId && s.role === "analyst")
            .reduce((sum, a) => {
                const passives = getStaffPassiveBonuses("analyst", a.unlockedTalentIds || [])
                return sum + (passives["xp_gain"] || 0)
            }, 0),
    )
    return 1 + bonus / 100
}

/**
 * Apply post-match manager XP, win/loss, and reputation changes
 * when the player team is involved. No-op for AI-vs-AI matches.
 */
export function applyMatchManagerXP(
    save: GameSave,
    match: MatchSaveData,
    result: MatchResult,
    playerTeamId: string,
): void {
    if (!save.managerDetails) return

    let winnerId: string | null = null
    if (result.homeScore > result.awayScore) winnerId = match.homeTeamId
    else if (result.awayScore > result.homeScore) winnerId = match.awayTeamId
    // Draw: winnerId stays null → no XP / no W / no L (preserves original
    // `else if` contract from the inline code).

    const xpMultiplier = getAnalystXpMultiplier(save, playerTeamId)

    if (winnerId === playerTeamId) {
        save.managerDetails.careerWins++
        save.managerDetails.xp += Math.round(WIN_XP_BASE * xpMultiplier)
        save.managerDetails.reputation += WIN_REPUTATION_BONUS
    } else if (match.homeTeamId === playerTeamId || match.awayTeamId === playerTeamId) {
        // Loss OR draw where player participated.
        // (Original code's else-if path actually fires for draws too,
        // because winnerId stays null. That's marginally weird game
        // design but we preserve behavior — flagging here for future
        // attention via a test.)
        save.managerDetails.careerLosses++
        save.managerDetails.xp += Math.round(LOSS_XP_BASE * xpMultiplier)
        save.managerDetails.reputation = Math.max(0, save.managerDetails.reputation - LOSS_REPUTATION_PENALTY)
    }
}
