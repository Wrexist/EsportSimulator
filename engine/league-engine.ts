/**
 * League Engine
 * Phase 19: The Ladder
 * 
 * Manages league tiers, Elo ratings, and promotion/relegation.
 * 
 * LEAGUE STRUCTURE (Elo-based tiers):
 * - S_TIER: Elite (Elo >= 1400)
 * - A_TIER: Professional (Elo 1100-1399)
 * - B_TIER: Rising (Elo < 1100)
 * Note: Tier count is dynamic based on Elo distribution, not fixed rank positions.
 * 
 * SEASON CYCLE:
 * - 52 weeks per season
 * - Top 3 in lower tier → promoted
 * - Bottom 3 in upper tier → relegated
 */

import { GameSave, TeamSaveData, GameEventSaveData } from "./save-types"
import { EventType } from "@/types"

// ===== CONSTANTS =====

export const LEAGUE_TIERS = {
    S_TIER: "S_TIER",
    A_TIER: "A_TIER",
    B_TIER: "B_TIER",
} as const

export type LeagueTier = typeof LEAGUE_TIERS[keyof typeof LEAGUE_TIERS]

// Elo thresholds for tier assignment
const ELO_THRESHOLDS = {
    S_TIER: 1400,
    A_TIER: 1100,
}

// Ranking-based modifiers for ELO calculations
const RANKING_MODIFIERS = {
    GIANT_KILLER_THRESHOLD: 15,  // Ranking positions apart for giant killer bonus
    EXPECTED_WIN_THRESHOLD: 10,  // Positions apart for expected win reduction
    CLOSE_MATCH_RANGE: 5,        // Matches within 5 ranks = normal K
    UPSET_BONUS_MAX: 0.3,        // Maximum upset bonus (30% extra) - SLOWED from 0.5
}

// Tournament tier ELO multipliers
const TOURNAMENT_ELO_MULTIPLIERS = {
    S_TIER: 1.25,  // Major tournaments
    A_TIER: 1.1,   // Premier events
    B_TIER: 1.0,   // Standard events
    SCRIM: 0.5,    // Practice matches
}

// Number of teams promoted/relegated per season
const PROMOTION_SLOTS = 3
const RELEGATION_SLOTS = 3

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
} as const

// ===== LEAGUE ENGINE =====

export class LeagueEngine {

    /**
     * Calculate dynamic K-factor based on team rankings and match context
     * Higher K = more volatile rating changes
     */
    static calculateDynamicK(
        winnerRank: number,
        loserRank: number,
        winnerElo: number,
        loserElo: number,
        tournamentTier?: string,
        winnerMatchesPlayed: number = 20,
        loserMatchesPlayed: number = 20
    ): { winnerK: number; loserK: number } {
        // Helper to get K for a team
        const getK = (rank: number, matches: number) => {
            // Calibration phase (first 10 matches) -> Moderate volatility
            if (matches < 10) return 32 // Calibration: higher volatility for new teams

            // Elite teams (Top 10) -> Moderate stability
            if (rank <= 10) return 12 // Enough to shift rankings after upsets

            // Professional teams (Rank 11-40) -> Standard
            if (rank <= 40) return 20 // Standard competitive range

            // Low tier/Amateur teams (Rank 41+) -> Higher volatility
            return 28 // Faster rank movement for lower teams
        }

        let winnerK = getK(winnerRank, winnerMatchesPlayed)
        let loserK = getK(loserRank, loserMatchesPlayed)

        // Upset bonus - lower ranked team beating higher ranked
        const rankDiff = winnerRank - loserRank
        if (rankDiff > RANKING_MODIFIERS.CLOSE_MATCH_RANGE) {
            // Scale upset bonus
            const upsetMultiplier = 1 + Math.min(
                rankDiff / (RANKING_MODIFIERS.GIANT_KILLER_THRESHOLD * 2),
                RANKING_MODIFIERS.UPSET_BONUS_MAX
            )
            // Winner gets more Elo for the upset
            winnerK *= upsetMultiplier
        }

        // Tournament multiplier affects both
        if (tournamentTier) {
            const tierKey = tournamentTier.toUpperCase().replace('-', '_') as keyof typeof TOURNAMENT_ELO_MULTIPLIERS
            const multiplier = TOURNAMENT_ELO_MULTIPLIERS[tierKey] || 1.0
            winnerK *= multiplier
            loserK *= multiplier
        }

        return {
            winnerK: Math.round(winnerK),
            loserK: Math.round(loserK)
        }
    }

    /**
     * Calculate new Elo ratings after a match
     * Enhanced with dynamic K-factors based on rankings and context
     */
    static calculateEloChange(
        winnerElo: number,
        loserElo: number,
        winnerRank: number = 50,
        loserRank: number = 50,
        tournamentTier?: string,
        winnerMatches: number = 20,
        loserMatches: number = 20,
        roundDifferential: number = 0
    ): { winnerChange: number; loserChange: number; kUsed: number } {
        // Expected score for winner
        const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400))
        const actualWinner = 1

        // Calculate dynamic K-factors
        const { winnerK, loserK } = this.calculateDynamicK(
            winnerRank,
            loserRank,
            winnerElo,
            loserElo,
            tournamentTier,
            winnerMatches,
            loserMatches
        )

        // Calculate changes separately
        // We use average K for the return value 'kUsed' just for display/debug
        let winnerChange = Math.round(winnerK * (actualWinner - expectedWinner))

        // Margin of Victory Multiplier (Round Diff)
        // 13-0 (diff 13) grants more than 13-11 (diff 2)
        // Base multiplier = 1.0
        // Max bonus = 15% at 16 round diff (e.g. 16-0) - SLOWED from 25%
        // 13-0 (13 diff) -> ~12% bonus
        // 13-11 (2 diff) -> ~2% bonus
        const movMultiplier = 1 + (Math.min(16, Math.max(0, roundDifferential)) / 16) * 0.15

        winnerChange = Math.round(winnerChange * movMultiplier)

        // Loser loses what they would have gained? Or symmetric?
        // ELO usually symmetric: Winner gains X, Loser loses X.
        // But with different K-factors, it might be asymmetric.
        const expectedLoser = 1 - expectedWinner
        const actualLoser = 0
        let loserChange = Math.round(loserK * (actualLoser - expectedLoser)) // Negative value

        // MoV only applies to the winner — loser loses the base expected amount
        // (no amplification by margin of victory)

        // Cap ELO swing: no single match can change ELO by more than ±50
        winnerChange = Math.min(50, Math.max(-50, winnerChange))
        loserChange = Math.min(50, Math.max(-50, loserChange))

        return { winnerChange, loserChange, kUsed: (winnerK + loserK) / 2 }
    }

    /**
     * Update Elo ratings after a match result
     * Enhanced with ranking-based calculations and tournament context
     */
    static updateEloAfterMatch(
        save: GameSave,
        winnerTeamId: string,
        loserTeamId: string,
        scoreDifferential: number = 0, // Map differential (e.g. 2 for 2-0)
        tournamentTier?: string,
        winnerMatches: number = 20,
        loserMatches: number = 20,
        roundDifferential: number = 0 // Net round difference
    ): { winnerChange: number; loserChange: number } | null {
        const winner = save.teams.find(t => t.id === winnerTeamId)
        const loser = save.teams.find(t => t.id === loserTeamId)

        if (!winner || !loser) return null

        // Get world rankings (default to 50 if not set)
        const winnerRank = winner.worldRanking || 50
        const loserRank = loser.worldRanking || 50

        // Calculate ELO change with dynamic K-factor
        const { winnerChange, loserChange } = this.calculateEloChange(
            winner.elo,
            loser.elo,
            winnerRank,
            loserRank,
            tournamentTier,
            winnerMatches,
            loserMatches,
            roundDifferential
        )

        // Apply dominance bonus for stomps (2-0 in BO3, 3-0 in BO5) -- KEPT for Map Stomps
        // SLOWED: Minimal bonus for stomps to stabilize rankings
        let dominanceMultiplier = 1
        if (scoreDifferential >= 2) {
            dominanceMultiplier = 1.02 // 2% bonus for 2-0 (from 1.05)
        }
        if (scoreDifferential >= 3) {
            dominanceMultiplier = 1.05 // 5% bonus for 3-0 (from 1.10)
        }

        // Apply ELO changes with minimum floor of 500
        // Dominance bonus only rewards winner - loser uses base change (no extra penalty for stomps)
        const finalWinnerChange = Math.round(winnerChange * dominanceMultiplier)
        const finalLoserChange = Math.round(loserChange)

        winner.elo = Math.max(500, winner.elo + finalWinnerChange)
        loser.elo = Math.max(500, loser.elo + finalLoserChange)

        // Refresh world rankings after every Elo change
        this.refreshWorldRankings(save)

        return { winnerChange: finalWinnerChange, loserChange: finalLoserChange }
    }

    /**
     * Sort teams by Elo and assign world rankings
     */
    static refreshWorldRankings(save: GameSave): void {
        const sortedTeams = [...save.teams].sort((a, b) => {
            if (b.elo !== a.elo) return b.elo - a.elo
            // Tiebreaker: reputation, then stable sort by team ID
            if ((b.reputation || 0) !== (a.reputation || 0)) return (b.reputation || 0) - (a.reputation || 0)
            const aNum = parseInt(a.id.replace(/\D/g, '')) || 0
            const bNum = parseInt(b.id.replace(/\D/g, '')) || 0
            return aNum - bNum
        })

        sortedTeams.forEach((team, index) => {
            team.worldRanking = index + 1
        })
    }

    /**
     * Get league tier based on Elo rating
     */
    static getTierFromElo(elo: number): LeagueTier {
        if (elo >= ELO_THRESHOLDS.S_TIER) return LEAGUE_TIERS.S_TIER
        if (elo >= ELO_THRESHOLDS.A_TIER) return LEAGUE_TIERS.A_TIER
        return LEAGUE_TIERS.B_TIER
    }

    /**
     * Get all teams in a specific tier
     */
    static getTeamsInTier(save: GameSave, tier: LeagueTier): TeamSaveData[] {
        return save.teams
            .filter(t => t.leagueTier === tier)
            .sort((a, b) => b.elo - a.elo)
    }

    /**
     * Get teams in the promotion zone (top N in tier)
     */
    static getPromotionZone(save: GameSave, tier: LeagueTier): TeamSaveData[] {
        if (tier === LEAGUE_TIERS.S_TIER) return [] // Can't promote from S-Tier

        const teamsInTier = this.getTeamsInTier(save, tier)
        return teamsInTier.slice(0, PROMOTION_SLOTS)
    }

    /**
     * Get teams in the relegation zone (bottom N in tier)
     */
    static getRelegationZone(save: GameSave, tier: LeagueTier): TeamSaveData[] {
        if (tier === LEAGUE_TIERS.B_TIER) return [] // Can't relegate from B-Tier

        const teamsInTier = this.getTeamsInTier(save, tier)
        return teamsInTier.slice(-RELEGATION_SLOTS)
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
        if (!team || team.leagueTier === LEAGUE_TIERS.B_TIER) return false

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

        // First, update all tiers based on current Elo
        // This ensures teams are in correct tier before promotion/relegation
        save.teams.forEach(team => {
            const eloBasedTier = this.getTierFromElo(team.elo)
            if (team.leagueTier !== eloBasedTier) {
                const oldTier = team.leagueTier as LeagueTier
                team.leagueTier = eloBasedTier

                // Track promotion or relegation
                const tierOrder = [LEAGUE_TIERS.S_TIER, LEAGUE_TIERS.A_TIER, LEAGUE_TIERS.B_TIER]
                const oldIndex = tierOrder.indexOf(oldTier)
                const newIndex = tierOrder.indexOf(eloBasedTier)

                if (newIndex < oldIndex) {
                    promoted.push({ teamId: team.id, from: oldTier, to: eloBasedTier })
                } else if (newIndex > oldIndex) {
                    relegated.push({ teamId: team.id, from: oldTier, to: eloBasedTier })
                }
            }
        })

        // Generate events for the player's team
        const playerTeam = save.teams.find(t => t.id === playerTeamId)

        // Check if player team was promoted
        const playerPromotion = promoted.find(p => p.teamId === playerTeamId)
        if (playerPromotion) {
            save.eventsLog.push({
                id: `promotion_${playerTeamId}_${save.currentWeek}`,
                type: EventType.MEDIA,
                week: save.currentWeek,
                data: {
                    title: "🎉 PROMOTION!",
                    message: `Congratulations! ${playerTeam?.name} has been promoted to ${TIER_DISPLAY[playerPromotion.to].label}!`,
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
                    message: `${playerTeam?.name} has been relegated to ${TIER_DISPLAY[playerRelegation.to].label}. Time to rebuild!`,
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
                playerRank: playerTeam?.worldRanking,
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

        // Assign Elo based on reputation rank
        sortedTeams.forEach((team, index) => {
            // Top teams get higher starting Elo
            // Range: 1600 (top) to 800 (bottom)
            const baseElo = 1200
            const rankBonus = Math.max(0, 400 - (index * 5))

            team.elo = baseElo + rankBonus
            team.worldRanking = index + 1

            // Assign league tier based on calculated Elo
            team.leagueTier = this.getTierFromElo(team.elo)
        })
    }

    /**
     * Get league standings summary for display
     */
    static getLeagueSummary(save: GameSave): {
        sTier: { count: number; topTeam: string | null }
        aTier: { count: number; topTeam: string | null }
        bTier: { count: number; topTeam: string | null }
        season: number
        weeksRemaining: number
    } {
        const sTierTeams = this.getTeamsInTier(save, LEAGUE_TIERS.S_TIER)
        const aTierTeams = this.getTeamsInTier(save, LEAGUE_TIERS.A_TIER)
        const bTierTeams = this.getTeamsInTier(save, LEAGUE_TIERS.B_TIER)

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
