import type { MatchResult, PlayerMatchStats } from '@/types'
import { t } from '@/lib/i18n'

export function resultLineup(result: MatchResult | undefined, teamId: string | undefined, currentRoster: string[] = []): string[] {
    return teamId ? result?.lineups?.[teamId] ?? currentRoster : []
}

/** Only recorded statistics for the managed lineup; these suggest a review, not a causal diagnosis. */
export function matchFollowup(stats: PlayerMatchStats[]): string {
    if (!stats.length) return t('followup.none')
    const openings = stats.reduce((s, p) => s + (p.firstKills || 0), 0)
    const openingDeaths = stats.reduce((s, p) => s + (p.firstDeaths || 0), 0)
    if (openingDeaths > openings) return t('followup.openings', { kills: openings, deaths: openingDeaths })
    const adr = Math.round(stats.reduce((s, p) => s + (p.adr || 0), 0) / stats.length)
    return t('followup.adr', { adr })
}
