/**
 * League Engine
 * Phase 19: The Ladder; Phase 4.8: rank bands and a zero-sum rating.
 *
 * Elo, world ranking and league tiers. The rating rules live in
 * engine/world-ranking.ts (RANKING_TUNING): zero-sum exchanges weighted by
 * match importance, world rank = Elo order, tiers = world-rank bands.
 *
 * LEAGUE STRUCTURE (rank bands, RANKING_TUNING.TIER_BANDS; 198-club world):
 * - S_TIER: Elite, ranks 1-16
 * - A_TIER: Professional, ranks 17-48
 * - B_TIER: Rising, ranks 49-111
 * - C_TIER: Challenger, rank 112 and below (new orgs start here)
 *
 * SEASON CYCLE:
 * - 52 weeks per season
 * - At season end every club takes the tier of its final world-rank band
 *   (promotion and relegation), then ratings regress slightly to the mean.
 */

import { GameSave, TeamSaveData } from "./save-types"
import { EventType } from "@/types"
import {
    applyRatedResult,
    applyTierBands,
    compareRanking,
    regressRatingsToMean,
    refreshWorldRankings as refreshRankings,
    tierBandLimits,
    tierForRank,
} from "./world-ranking"

// ===== CONSTANTS =====

export const LEAGUE_TIERS = {
    S_TIER: "S_TIER",
    A_TIER: "A_TIER",
    B_TIER: "B_TIER",
    C_TIER: "C_TIER",
} as const

export type LeagueTier = typeof LEAGUE_TIERS[keyof typeof LEAGUE_TIERS]

const TIER_ORDER: LeagueTier[] = [LEAGUE_TIERS.S_TIER, LEAGUE_TIERS.A_TIER, LEAGUE_TIERS.B_TIER, LEAGUE_TIERS.C_TIER]

// Season length in weeks
const SEASON_LENGTH = 52


// ===== TIER DISPLAY CONFIG =====

export const TIER_DISPLAY = {
    S_TIER: {
        label: "S-Tier",
        shortLabel: "S",
        description: "Elite Division",
        color: "text-amber-400",
        bgColor: "bg-amber-500/10",
        borderColor: "border-amber-500/30",
        icon: "Crown",
    },
    A_TIER: {
        label: "A-Tier",
        shortLabel: "A",
        description: "Professional Division",
        color: "text-blue-400",
        bgColor: "bg-blue-500/10",
        borderColor: "border-blue-500/30",
        icon: "Shield",
    },
    B_TIER: {
        label: "B-Tier",
        shortLabel: "B",
        description: "Rising Division",
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/10",
        borderColor: "border-emerald-500/30",
        icon: "TrendingUp",
    },
    C_TIER: {
        label: "C-Tier",
        shortLabel: "C",
        description: "Challenger Division",
        color: "text-slate-300",
        bgColor: "bg-slate-500/10",
        borderColor: "border-slate-500/30",
        icon: "Sprout",
    },
} as const

// ===== LEAGUE ENGINE =====

export class LeagueEngine {

    /**
     * Apply a result to both clubs' Elo (zero-sum; see engine/world-ranking.ts).
     * `tournamentTier` and `context` say how much the match matters: no
     * competition or SCRIM is an unrated friendly, a league_ id is a league
     * match, otherwise the event tier (playoff stages weigh more). World
     * rankings are refreshed once per tick (ai-world-processor) and on the
     * live-match path, not here.
     */
    static updateEloAfterMatch(
        save: Pick<GameSave, "teams">,
        winnerTeamId: string,
        loserTeamId: string,
        _scoreDifferential: number = 0,
        tournamentTier?: string,
        _winnerMatches?: number,
        _loserMatches?: number,
        roundDifferential: number = 0,
        context: { tournamentId?: string | null; stage?: string | null; maps?: number } = {},
    ): { winnerChange: number; loserChange: number } | null {
        const winner = save.teams.find(t => t.id === winnerTeamId)
        const loser = save.teams.find(t => t.id === loserTeamId)
        if (!winner || !loser || winner === loser) return null
        // Callers that pass only the tier (bracket repair paths) rate an event match.
        const tournamentId = context.tournamentId !== undefined ? context.tournamentId : (tournamentTier ? "event" : null)
        const { winnerChange, loserChange } = applyRatedResult(winner, loser, {
            tournamentId,
            tournamentTier,
            stage: context.stage,
            roundDiff: roundDifferential,
            maps: context.maps,
        })
        return { winnerChange, loserChange }
    }

    /** Sort teams by Elo and assign world rankings (engine/world-ranking.ts). */
    static refreshWorldRankings(save: Pick<GameSave, "teams">): void {
        refreshRankings(save)
    }

    /** League tier of a world rank in a world of `teamCount` clubs (rank bands). */
    static getTierFromRank(rank: number, teamCount: number): LeagueTier {
        return tierForRank(rank, teamCount)
    }

    /** Last world rank of each tier band for a world of `teamCount` clubs. */
    static getTierBands(teamCount: number): Array<{ tier: LeagueTier; maxRank: number }> {
        return tierBandLimits(teamCount)
    }

    /**
     * Get all teams in a specific tier (world-rank order)
     */
    static getTeamsInTier(save: GameSave, tier: LeagueTier): TeamSaveData[] {
        return save.teams
            .filter(t => t.leagueTier === tier)
            .sort((a, b) => (a.worldRanking ?? 999) - (b.worldRanking ?? 999) || b.elo - a.elo)
    }

    /** Teams of a tier whose current world rank would promote them if the season ended now. */
    static getPromotionZone(save: GameSave, tier: LeagueTier): TeamSaveData[] {
        const i = TIER_ORDER.indexOf(tier)
        if (i <= 0) return [] // Can't promote from S-Tier
        return this.getTeamsInTier(save, tier).filter(t => TIER_ORDER.indexOf(tierForRank(t.worldRanking ?? 999, save.teams.length)) < i)
    }

    /** Teams of a tier whose current world rank would relegate them if the season ended now. */
    static getRelegationZone(save: GameSave, tier: LeagueTier): TeamSaveData[] {
        const i = TIER_ORDER.indexOf(tier)
        if (i < 0 || i === TIER_ORDER.length - 1) return [] // Can't relegate from the bottom (C-Tier)
        return this.getTeamsInTier(save, tier).filter(t => TIER_ORDER.indexOf(tierForRank(t.worldRanking ?? 999, save.teams.length)) > i)
    }

    /**
     * Check if team is in promotion zone
     */
    static isInPromotionZone(save: GameSave, teamId: string): boolean {
        const team = save.teams.find(t => t.id === teamId)
        if (!team || team.leagueTier === LEAGUE_TIERS.S_TIER) return false

        const promotionZone = this.getPromotionZone(save, team.leagueTier as LeagueTier)
        return promotionZone.some(t => t.id === teamId)
    }

    /**
     * Check if team is in relegation zone
     */
    static isInRelegationZone(save: GameSave, teamId: string): boolean {
        const team = save.teams.find(t => t.id === teamId)
        if (!team || team.leagueTier === LEAGUE_TIERS.C_TIER) return false

        const relegationZone = this.getRelegationZone(save, team.leagueTier as LeagueTier)
        return relegationZone.some(t => t.id === teamId)
    }

    /**
     * Get current season number from week
     */
    static getCurrentSeason(week: number): number {
        return Math.floor((week - 1) / SEASON_LENGTH) + 1
    }

    /**
     * Get weeks remaining in current season
     */
    static getWeeksRemainingInSeason(week: number): number {
        return SEASON_LENGTH - ((week - 1) % SEASON_LENGTH)
    }

    /**
     * Check if it's the end of a season
     */
    static isSeasonEnd(week: number): boolean {
        return week % SEASON_LENGTH === 0
    }

    /**
     * Process end of season - promotions and relegations
     */
    static processSeasonEnd(save: GameSave, playerTeamId: string): {
        promoted: { teamId: string; from: LeagueTier; to: LeagueTier }[]
        relegated: { teamId: string; from: LeagueTier; to: LeagueTier }[]
    } {
        const promoted: { teamId: string; from: LeagueTier; to: LeagueTier }[] = []
        const relegated: { teamId: string; from: LeagueTier; to: LeagueTier }[] = []

        // Promotion and relegation: every club takes the tier of its final
        // world-rank band (this week's results included), then ratings move
        // slightly toward the pool mean for the new season.
        const finalOrder = [...save.teams].sort(compareRanking)
        for (const move of applyTierBands(save)) {
            const from = move.from as LeagueTier
            const oldIndex = TIER_ORDER.indexOf(from)
            const newIndex = TIER_ORDER.indexOf(move.to)
            if (oldIndex < 0 || newIndex < oldIndex) promoted.push({ teamId: move.teamId, from, to: move.to })
            else if (newIndex > oldIndex) relegated.push({ teamId: move.teamId, from, to: move.to })
        }
        regressRatingsToMean(save)

        // Generate events for the player's team
        const playerTeam = save.teams.find(t => t.id === playerTeamId)
        const finalRank = finalOrder.findIndex(t => t.id === playerTeamId) + 1
        const bandOf = (tier: LeagueTier) => {
            const bands = tierBandLimits(save.teams.length)
            const i = bands.findIndex(b => b.tier === tier)
            return i < 0 ? `below #${bands[bands.length - 1].maxRank}` : `${i === 0 ? 1 : bands[i - 1].maxRank + 1}-${bands[i].maxRank}`
        }

        // Check if player team was promoted
        const playerPromotion = promoted.find(p => p.teamId === playerTeamId)
        if (playerPromotion) {
            save.eventsLog.push({
                id: `promotion_${playerTeamId}_${save.currentWeek}`,
                type: EventType.MEDIA,
                week: save.currentWeek,
                data: {
                    title: "🎉 PROMOTION!",
                    message: `Congratulations! ${playerTeam?.name} finished the season #${finalRank} in the world (${TIER_DISPLAY[playerPromotion.to].label}: ranks ${bandOf(playerPromotion.to)}) and has been promoted to ${TIER_DISPLAY[playerPromotion.to].label}!`,
                    from: playerPromotion.from,
                    to: playerPromotion.to,
                    isPromotion: true,
                },
                acknowledged: false,
            })
        }

        // Check if player team was relegated
        const playerRelegation = relegated.find(r => r.teamId === playerTeamId)
        if (playerRelegation) {
            save.eventsLog.push({
                id: `relegation_${playerTeamId}_${save.currentWeek}`,
                type: EventType.MEDIA,
                week: save.currentWeek,
                data: {
                    title: "📉 Relegated",
                    message: `${playerTeam?.name} finished the season #${finalRank} in the world (${TIER_DISPLAY[playerRelegation.to].label}: ranks ${bandOf(playerRelegation.to)}) and has been relegated to ${TIER_DISPLAY[playerRelegation.to].label}. Time to rebuild!`,
                    from: playerRelegation.from,
                    to: playerRelegation.to,
                    isRelegation: true,
                },
                acknowledged: false,
            })
        }

        // Season summary event
        const season = this.getCurrentSeason(save.currentWeek)
        save.eventsLog.push({
            id: `season_end_${save.currentWeek}`,
            type: EventType.MEDIA,
            week: save.currentWeek,
            data: {
                title: `Season ${season} Complete`,
                message: `Season ${season} has concluded. ${promoted.length} teams promoted, ${relegated.length} teams relegated.`,
                promoted: promoted.length,
                relegated: relegated.length,
                playerRank: finalRank || playerTeam?.worldRanking,
                playerTier: playerTeam?.leagueTier,
            },
            acknowledged: false,
        })

        return { promoted, relegated }
    }

    /**
     * Initialize team Elo ratings based on reputation
     * Called when starting a new game
     */
    static initializeTeamElo(teams: TeamSaveData[]): void {
        // Sort by reputation to determine initial rankings
        const sortedTeams = [...teams].sort((a, b) =>
            (b.reputation || 0) - (a.reputation || 0)
        )

        // Range: 1600 (top) down to 1200
        sortedTeams.forEach((team, index) => {
            team.elo = 1200 + Math.max(0, 400 - (index * 5))
        })
        refreshRankings({ teams })
        applyTierBands({ teams })
    }

    /**
     * Get league standings summary for display
     */
    static getLeagueSummary(save: GameSave): {
        sTier: { count: number; topTeam: string | null }
        aTier: { count: number; topTeam: string | null }
        bTier: { count: number; topTeam: string | null }
        cTier: { count: number; topTeam: string | null }
        season: number
        weeksRemaining: number
    } {
        const sTierTeams = this.getTeamsInTier(save, LEAGUE_TIERS.S_TIER)
        const aTierTeams = this.getTeamsInTier(save, LEAGUE_TIERS.A_TIER)
        const bTierTeams = this.getTeamsInTier(save, LEAGUE_TIERS.B_TIER)
        const cTierTeams = this.getTeamsInTier(save, LEAGUE_TIERS.C_TIER)

        return {
            sTier: {
                count: sTierTeams.length,
                topTeam: sTierTeams[0]?.name || null
            },
            aTier: {
                count: aTierTeams.length,
                topTeam: aTierTeams[0]?.name || null
            },
            bTier: {
                count: bTierTeams.length,
                topTeam: bTierTeams[0]?.name || null
            },
            cTier: {
                count: cTierTeams.length,
                topTeam: cTierTeams[0]?.name || null
            },
            season: this.getCurrentSeason(save.currentWeek),
            weeksRemaining: this.getWeeksRemainingInSeason(save.currentWeek),
        }
    }

    /**
     * Get team's position within their tier
     */
    static getTierPosition(save: GameSave, teamId: string): {
        position: number
        total: number
        tier: LeagueTier
        isPromotionZone: boolean
        isRelegationZone: boolean
    } | null {
        const team = save.teams.find(t => t.id === teamId)
        if (!team) return null

        const tier = team.leagueTier as LeagueTier
        const teamsInTier = this.getTeamsInTier(save, tier)
        const position = teamsInTier.findIndex(t => t.id === teamId) + 1

        return {
            position,
            total: teamsInTier.length,
            tier,
            isPromotionZone: this.isInPromotionZone(save, teamId),
            isRelegationZone: this.isInRelegationZone(save, teamId),
        }
    }
}

// Export for use in other modules
export default LeagueEngine
