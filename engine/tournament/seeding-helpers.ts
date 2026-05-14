/**
 * Tournament seeding & bracket-stage helpers.
 *
 * Pure functions extracted from tournament-manager.ts. None of these touch
 * GameSave or class instance state — they're reasoning purely about team
 * IDs, bracket-match shapes and stage labels. Splitting them out keeps the
 * 1,700-line manager focused on flow control and makes these helpers
 * trivially unit-testable in isolation.
 */

import type { BracketMatchSaveData, CompletedMatchSaveData } from "../save-types"

/**
 * Deterministic numeric ID for tiebreaking. Returns the first run of digits
 * inside the ID when present (so `team_42` → 42, `iem_kato_8` → 8); falls
 * back to a stable hash of the string so non-numeric IDs still produce a
 * total ordering. Used as the final tiebreaker in standings sorts.
 */
export function stableTeamIdNumber(id: string): number {
    const m = id.match(/\d+/)
    if (m) return parseInt(m[0], 10)
    let h = 0
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
    return h
}

/**
 * Resolve the winning team for a completed match. Prefers an explicit
 * `result.winnerId`; falls back to a score comparison when home/away IDs
 * are supplied; returns undefined for ties or missing data so callers can
 * decide how to handle ambiguity.
 */
export function resolveCompletedWinner(
    completed: CompletedMatchSaveData,
    homeTeamId?: string,
    awayTeamId?: string,
): string | undefined {
    if (completed.result?.winnerId) return completed.result.winnerId
    if (!completed.result) return undefined
    if (!homeTeamId || !awayTeamId) return undefined
    if (completed.result.homeScore > completed.result.awayScore) return homeTeamId
    if (completed.result.awayScore > completed.result.homeScore) return awayTeamId
    return undefined
}

/**
 * Normalize a stage label so different spellings/cases compare equal.
 * Examples:
 *   "Round of 32 Match 1" → "round of 32"
 *   "Quarter-Final 3"     → "quarter-final"
 *   "FINAL"               → "final"
 *   "3rd Place Match"     → "3rd place"
 */
export function normalizeStage(stage: string): string {
    if (!stage) return ""
    const lower = stage.toLowerCase()
    const roMatch = stage.match(/^(Round of \d+)/i)
    if (roMatch) return roMatch[1].toLowerCase()
    if (lower.includes("quarter-final")) return "quarter-final"
    if (lower.includes("semi-final")) return "semi-final"
    if (lower.includes("grand final")) return "grand final"
    if (lower === "final" || lower === "finals") return "final"
    if (lower.includes("3rd") || lower.includes("third")) return "3rd place"
    return lower
}

/**
 * Round-priority for a bracket match. Lower number = earlier round, so
 * simulating in numeric-ascending order processes round 1 before round 2,
 * Round of 32 before Round of 16, quarters before semis before final.
 *
 * Resolution order:
 *   1. Embedded `_rN_m...` pattern in the match ID (most explicit).
 *   2. "Round of X" label → log2(X) so the count of teams maps to a
 *      round number (32→5, 16→4, 8→3, …).
 *   3. Named stages on a wide spread so quarters < semis < 3rd-place ≈
 *      grand final.
 *   4. Match week as a last-resort fallback.
 */
export function getBracketRoundNumber(match: BracketMatchSaveData): number {
    const stage = match.stage.toLowerCase()
    const id = match.id.toLowerCase()

    const roundFromId = id.match(/_r(\d+)_m/i) || id.match(/^r(\d+)_/i)
    if (roundFromId) {
        return parseInt(roundFromId[1], 10)
    }

    const roundOfMatch = stage.match(/round of (\d+)/i)
    if (roundOfMatch) {
        const size = parseInt(roundOfMatch[1], 10)
        return Math.log2(size)
    }

    if (stage.includes("quarter")) return 100
    if (stage.includes("semi")) return 200
    // 3rd place plays alongside the grand final but is reported separately;
    // give it a hair-earlier number so a stable sort keeps it before final.
    if (stage.includes("3rd") || stage.includes("third")) return 299
    if (stage === "final" || stage === "finals" || stage.includes("grand final")) return 300

    return match.week || 50
}
