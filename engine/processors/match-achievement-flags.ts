/**
 * Detect comeback + underdog wins on a completed match result for
 * achievement tracking.
 *
 * Extracted from atomic-week-processor.ts processMatches (Phase M6).
 * Pure functions — no side effects, no save mutation. Caller writes
 * the returned booleans onto the CompletedMatchSaveData record.
 *
 * Definitions:
 *   - Comeback win: team was DOWN by 9+ rounds at some point during
 *     a map AND ended up winning that map. Mid-map deficit threshold
 *     captures dramatic 3-12 → 13-12 style turnarounds.
 *   - Underdog win: winning team's worldRanking is 20+ positions
 *     WORSE than the losing team's. (higher number = worse rank;
 *     missing rank defaults to 99.)
 */

import type { MatchResult } from "@/types"

interface MapResultLike {
    rounds?: Array<{ winningTeamId?: string }>
    finalScore?: { team1: number; team2: number }
}

interface MatchResultLike {
    maps?: MapResultLike[]
    homeScore: number
    awayScore: number
}

interface TeamRankLike {
    worldRanking?: number
}

/**
 * Walks each map's round sequence. Returns true if any map had a
 * moment where one team was down 9+ rounds AND that team ended up
 * winning the map.
 */
export function detectComebackWin(
    result: MatchResultLike,
    homeTeamId: string,
): boolean {
    if (!result.maps) return false

    for (const mapResult of result.maps) {
        const rounds = mapResult.rounds || []
        let homeMapScore = 0
        let awayMapScore = 0

        for (const round of rounds) {
            if (round.winningTeamId === homeTeamId) homeMapScore++
            else awayMapScore++

            const homeDown = awayMapScore - homeMapScore >= 9
            const awayDown = homeMapScore - awayMapScore >= 9
            const finalScore = mapResult.finalScore
            if (!finalScore) continue

            if (homeDown && finalScore.team1 > finalScore.team2) return true
            if (awayDown && finalScore.team2 > finalScore.team1) return true
        }
    }

    return false
}

/**
 * True if the winning team's world ranking is 20+ positions worse
 * than the loser's. Missing rank defaults to 99 (treated as unranked,
 * so unranked-vs-unranked is never an underdog match).
 */
export function detectUnderdogWin(
    result: MatchResultLike,
    homeTeam: TeamRankLike,
    awayTeam: TeamRankLike,
): boolean {
    const homeRank = homeTeam.worldRanking || 99
    const awayRank = awayTeam.worldRanking || 99
    const homeIsUnderdog = homeRank - awayRank >= 20
    const awayIsUnderdog = awayRank - homeRank >= 20

    return (
        (result.homeScore > result.awayScore && homeIsUnderdog) ||
        (result.awayScore > result.homeScore && awayIsUnderdog)
    )
}

/**
 * Convenience: compute both flags in one call. Returns the flag pair
 * the caller writes onto the CompletedMatchSaveData record.
 */
export function detectAchievementFlags(
    result: MatchResult,
    homeTeam: TeamRankLike & { id: string },
    awayTeam: TeamRankLike,
): { comebackWin: boolean; underdogWin: boolean } {
    return {
        comebackWin: detectComebackWin(result as unknown as MatchResultLike, homeTeam.id),
        underdogWin: detectUnderdogWin(result as unknown as MatchResultLike, homeTeam, awayTeam),
    }
}
