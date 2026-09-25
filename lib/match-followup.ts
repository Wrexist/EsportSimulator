import type { MatchResult, PlayerMatchStats } from '@/types'

export function resultLineup(result: MatchResult | undefined, teamId: string | undefined, currentRoster: string[] = []): string[] {
    return teamId ? result?.lineups?.[teamId] ?? currentRoster : []
}

/** Only recorded statistics for the managed lineup; these suggest a review, not a causal diagnosis. */
export function matchFollowup(stats: PlayerMatchStats[]): string {
    if (!stats.length) return 'Review your lineup and preparation before the next fixture.'
    const openings = stats.reduce((s, p) => s + (p.firstKills || 0), 0)
    const openingDeaths = stats.reduce((s, p) => s + (p.firstDeaths || 0), 0)
    if (openingDeaths > openings) return `Your lineup recorded ${openings} opening kills and ${openingDeaths} opening deaths. Review entry roles and trading practice.`
    const adr = Math.round(stats.reduce((s, p) => s + (p.adr || 0), 0) / stats.length)
    return `Your lineup averaged ${adr} damage per round. Review individual performances, training needs and your next opponent.`
}
