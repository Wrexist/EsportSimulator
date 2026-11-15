/**
 * Round-by-round detail in saved match records.
 *
 * Only the managed club's matches keep their rounds in save.completedMatches:
 * the result page reads them for the round-by-round view. Every other match
 * keeps its scoreboard (map scores, player stats, MVP), which is all that
 * stats pages, rankings and trophies read; its rounds were dead weight of
 * about 50-120 KB per map (Phase O.2, ENGINE-09). Careers, season tallies and
 * records are taken from the full result before it is stored.
 */
import type { MatchResult } from "@/types"

/** True when the managed club plays in this match. */
export function isManagedMatch(match: { homeTeamId: string; awayTeamId: string }, managedTeamId: string | null | undefined): boolean {
    return !!managedTeamId && (match.homeTeamId === managedTeamId || match.awayTeamId === managedTeamId)
}

/** The result as stored: unchanged for the managed club's matches, without round detail for the rest. */
export function resultForSave(result: MatchResult, match: { homeTeamId: string; awayTeamId: string }, managedTeamId: string | null | undefined): MatchResult {
    if (isManagedMatch(match, managedTeamId)) return result
    return { ...result, maps: result.maps.map(m => ({ ...m, rounds: [] })) }
}
