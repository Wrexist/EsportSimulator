/**
 * Phase 12: Match Analyzer Engine
 * Generates narrative insights and analysis for completed matches.
 */

import { MatchResult, RoundResult } from "@/types"
import { MatchAnalysis } from "./save-types"

export class MatchAnalyzer {

    /**
     * Analyze a completed match and generate insights
     */
    static analyze(
        match: { id: string, homeTeamId: string, awayTeamId: string },
        result: MatchResult,
        homeTeamName: string,
        awayTeamName: string,
        homePlayers: { id: string }[],
        awayPlayers: { id: string }[]
    ): MatchAnalysis {
        const homeWon = result.homeScore > result.awayScore
        const winner = homeWon ? homeTeamName : awayTeamName

        // 1. Identify Team Rosters
        const homePlayerIds = new Set(homePlayers.map(p => p.id))
        const awayPlayerIds = new Set(awayPlayers.map(p => p.id))

        // 2. Aggregate Stats
        const homeStats = this.aggregateStats(result, homePlayerIds)
        const awayStats = this.aggregateStats(result, awayPlayerIds)

        // 3. Round Analysis (Pistols, Eco, etc)
        const roundAnalysis = this.analyzeRounds(match, result)

        // 4. Identify Key Factors
        const factors = this.determineKeyFactors(result, homeStats, awayStats, roundAnalysis)

        // 5. Generate narrative summary
        const summary = this.generateSummary(winner, factors, result, roundAnalysis)

        // 6. Calculate Ratings (0-100) — based on actual performance, not outcome
        const winnerStats = homeWon ? homeStats : awayStats
        const totalRounds = result.maps.reduce((sum, m) => sum + m.rounds.length, 0) || 1

        // Economy: pistol wins + economy score (how well they managed buys)
        const pistolBonus = (roundAnalysis.homePistolsWon + roundAnalysis.awayPistolsWon) > 0
            ? ((homeWon ? roundAnalysis.homePistolsWon : roundAnalysis.awayPistolsWon) / Math.max(1, result.maps.length * 2)) * 30
            : 0
        const economyRating = Math.min(99, Math.round(40 + roundAnalysis.economyScore * 3 + pistolBonus))

        // Aim: based on K/D and average HLTV rating of the winning team's players
        const kd = winnerStats.deaths > 0 ? winnerStats.kills / winnerStats.deaths : 1.5
        const aimRating = Math.min(99, Math.round(winnerStats.avgRating * 50 + kd * 15))

        // Utility: derive from assists and KAST (teams with high KAST use utility well)
        const allStats = Object.values(result.playerStats) as any[]
        const avgKast = allStats.length > 0 ? allStats.reduce((s: number, p: any) => s + (p.kast || 70), 0) / allStats.length : 70
        const avgAssists = allStats.length > 0 ? allStats.reduce((s: number, p: any) => s + (p.assists || 0), 0) / allStats.length : 2
        const utilityRating = Math.min(99, Math.round(avgKast * 0.7 + avgAssists * 5))

        // Trading: trade count relative to total rounds played
        const tradingRating = Math.min(99, Math.round(50 + (winnerStats.tradeCount / totalRounds) * 100))

        const teamPerformance = { economyRating, aimRating, utilityRating, tradingRating }

        return {
            summary,
            keyFactor: factors.primaryFactor,
            winningFactor: factors.winningReason,
            losingFactor: factors.losingReason,
            teamPerformance
        }
    }

    // === HELPER METHODS ===

    private static aggregateStats(result: MatchResult, teamPlayerIds: Set<string>) {
        let totalKills = 0
        let totalDeaths = 0
        let totalRating = 0
        let totalClutches = 0
        let tradeCount = 0 // Approximate
        let playerCount = 0

        Object.entries(result.playerStats).forEach(([playerId, stats]) => {
            if (teamPlayerIds.has(playerId)) {
                totalKills += stats.kills
                totalDeaths += stats.deaths
                totalRating += stats.rating
                totalClutches += stats.clutches

                // Approximate trades: KAST - Survival
                // This is rough but works for a prototype
                tradeCount += Math.max(0, (stats.kast - 50) / 5)

                playerCount++
            }
        })

        return {
            kills: totalKills,
            deaths: totalDeaths,
            avgRating: playerCount > 0 ? totalRating / playerCount : 0.5,
            clutches: totalClutches,
            tradeCount: tradeCount
        }
    }

    private static analyzeRounds(match: { homeTeamId: string }, result: MatchResult) {
        let homePistolsWon = 0
        let awayPistolsWon = 0
        let economyScore = 5 // Base score

        result.maps.forEach(map => {
            // Map round 1
            if (map.rounds.length > 0) processPistol(map.rounds[0])
            // Map round 13 (second half pistol in MR12)
            if (map.rounds.length > 12) processPistol(map.rounds[12])
        })

        function processPistol(round: RoundResult) {
            // round.winner is "ct" or "t"
            // We use team IDs stored in round to verify
            const r = round as any
            const winnerId = r.winner === "ct" ? (r.ctTeam || r.ctTeamId) : (r.tTeam || r.tTeamId)

            if (winnerId === match.homeTeamId) homePistolsWon++
            else awayPistolsWon++
        }

        // Derive economy score from pistol performance (0-10 scale)
        const totalPistols = homePistolsWon + awayPistolsWon
        if (totalPistols > 0) {
            // Winning pistols is crucial for economy; score from perspective of home team
            economyScore = 5 + (homePistolsWon - awayPistolsWon) * 2
            economyScore = Math.max(1, Math.min(10, economyScore))
        }

        return {
            homePistolsWon,
            awayPistolsWon,
            economyScore
        }
    }

    private static determineKeyFactors(
        result: MatchResult,
        homeStats: any,
        awayStats: any,
        roundAnalysis: any
    ) {
        const homeWon = result.homeScore > result.awayScore
        const winnerStats = homeWon ? homeStats : awayStats
        const loserStats = homeWon ? awayStats : homeStats

        let primaryFactor: MatchAnalysis["keyFactor"] = "FIREPOWER"
        let winningReason = "Superior mechanical skill"
        let losingReason = "Lost individual duels"

        // 1. Check Clutch Factor
        const clutchDiff = winnerStats.clutches - loserStats.clutches
        if (clutchDiff >= 2) {
            primaryFactor = "CLUTCH"
            winningReason = `Capitalized on ${winnerStats.clutches} clutch situations`
            losingReason = "Threw away advantage in late rounds"
        }
        // 2. Check Pistol/Economy
        else if (homeWon && roundAnalysis.homePistolsWon > roundAnalysis.awayPistolsWon && result.homeScore < 13) {
            // If pistols were crucial in a close game
            primaryFactor = "ECONOMY"
            winningReason = "Snowballed from pistol round victories"
            losingReason = "Never recovered from pistol losses"
        }
        // 3. Check Rating Diff (Firepower)
        else if (winnerStats.avgRating > loserStats.avgRating + 0.15) {
            primaryFactor = "FIREPOWER"
            winningReason = "Complete domination in aim duels"
            losingReason = "Outclassed individually across the board"
        }
        // 4. Default to Trading/Teamwork
        else {
            primaryFactor = "TRADING"
            winningReason = "Better trade fragging and spacing"
            losingReason = "Detailed isolation plays failed"
        }

        return { primaryFactor, winningReason, losingReason }
    }

    private static generateSummary(
        winnerName: string,
        factors: any,
        result: MatchResult,
        roundAnalysis: any
    ): string {
        const score = `${Math.max(result.homeScore, result.awayScore)}-${Math.min(result.homeScore, result.awayScore)}`

        let prefix = ""
        const diff = Math.abs(result.homeScore - result.awayScore)
        if (diff > 8) prefix = "A crushing victory as "
        else if (diff > 4) prefix = "A solid performance saw "
        else prefix = "In a tightly contested battle, "

        return `${prefix}${winnerName} secure the ${score} win. The match was defined by ${factors.winningReason.toLowerCase()}.`
    }
}
