/**
 * Phase 12: Match Analyzer Engine
 * Generates narrative insights and analysis for completed matches.
 */

import { MatchResult, RoundResult } from "@/types"
import { MatchAnalysis } from "./save-types"

/** A map's [home, away] rounds, when the result carries them. */
function mapScore(map: MatchResult["maps"][number]): [number, number] | null {
    return typeof map.homeScore === "number" && typeof map.awayScore === "number" ? [map.homeScore, map.awayScore] : null
}

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

        // 3. Round Analysis (Pistols, trades)
        const roundAnalysis = this.analyzeRounds(match, result, homePlayerIds, awayPlayerIds)

        // 4. Identify Key Factors
        const factors = this.determineKeyFactors(result, homeStats, awayStats, roundAnalysis)

        // 5. Generate narrative summary
        const summary = this.generateSummary(winner, factors, result)

        // MATCHENGINE-09: no per-team 0-100 ratings any more. They were never
        // shown, and wrong (trading always capped at 99, the economy rating
        // read from the home side's view for either winner).
        return {
            summary,
            keyFactor: factors.primaryFactor,
            winningFactor: factors.winningReason,
            losingFactor: factors.losingReason,
        }
    }

    // === HELPER METHODS ===

    private static aggregateStats(result: MatchResult, teamPlayerIds: Set<string>) {
        let totalKills = 0
        let totalDeaths = 0
        let totalRating = 0
        let totalClutches = 0
        let playerCount = 0

        Object.entries(result.playerStats).forEach(([playerId, stats]) => {
            if (teamPlayerIds.has(playerId)) {
                totalKills += stats.kills
                totalDeaths += stats.deaths
                totalRating += stats.rating
                totalClutches += stats.clutches
                playerCount++
            }
        })

        return {
            kills: totalKills,
            deaths: totalDeaths,
            avgRating: playerCount > 0 ? totalRating / playerCount : 0.5,
            clutches: totalClutches,
        }
    }

    private static analyzeRounds(match: { homeTeamId: string }, result: MatchResult, homePlayerIds: Set<string>, awayPlayerIds: Set<string>) {
        let homePistolsWon = 0
        let awayPistolsWon = 0
        // Trade kills from the recorded KILL events (MATCHENGINE-03).
        let homeTrades = 0
        let awayTrades = 0

        result.maps.forEach(map => {
            // Map round 1
            if (map.rounds.length > 0) processPistol(map.rounds[0])
            // Map round 13 (second half pistol in MR12)
            if (map.rounds.length > 12) processPistol(map.rounds[12])
            for (const round of map.rounds) {
                for (const e of round.events ?? []) {
                    if (e.type !== "KILL" || !e.isTrade) continue
                    const killer = e.playerId ?? e.killerId
                    if (!killer) continue
                    if (homePlayerIds.has(killer)) homeTrades++
                    else if (awayPlayerIds.has(killer)) awayTrades++
                }
            }
        })

        function processPistol(round: RoundResult) {
            // round.winner is "ct" or "t"
            // We use team IDs stored in round to verify
            const r = round as RoundResult & { ctTeam?: string; ctTeamId?: string; tTeam?: string; tTeamId?: string }
            const winnerId = r.winner === "ct" ? (r.ctTeam || r.ctTeamId) : (r.tTeam || r.tTeamId)

            if (winnerId === match.homeTeamId) homePistolsWon++
            else awayPistolsWon++
        }

        return {
            homePistolsWon,
            awayPistolsWon,
            homeTrades,
            awayTrades,
        }
    }

    private static determineKeyFactors(
        result: MatchResult,
        homeStats: ReturnType<typeof MatchAnalyzer.aggregateStats>,
        awayStats: ReturnType<typeof MatchAnalyzer.aggregateStats>,
        roundAnalysis: ReturnType<typeof MatchAnalyzer.analyzeRounds>
    ) {
        const homeWon = result.homeScore > result.awayScore
        const winnerStats = homeWon ? homeStats : awayStats
        const loserStats = homeWon ? awayStats : homeStats
        const margin = MatchAnalyzer.margin(result)

        let primaryFactor: MatchAnalysis["keyFactor"] = "FIREPOWER"
        let winningReason = "Superior mechanical skill"
        let losingReason = "Lost individual duels"
        // Noun phrase for the summary sentence ("defined by ...").
        let theme = "superior mechanical skill"

        // 1. Check Clutch Factor
        const clutchDiff = winnerStats.clutches - loserStats.clutches
        if (clutchDiff >= 2) {
            primaryFactor = "CLUTCH"
            winningReason = `Capitalized on ${winnerStats.clutches} clutch situations`
            losingReason = "Threw away advantage in late rounds"
            theme = `${winnerStats.clutches} clutch wins`
        }
        // 2. Check Pistol/Economy: the winner took more pistols in a game
        // that was not a rout (needs the maps' round scores)
        else if (
            (homeWon ? roundAnalysis.homePistolsWon > roundAnalysis.awayPistolsWon : roundAnalysis.awayPistolsWon > roundAnalysis.homePistolsWon) &&
            margin.known && margin.perMap <= 8
        ) {
            primaryFactor = "ECONOMY"
            winningReason = "Snowballed from pistol round victories"
            losingReason = "Never recovered from pistol losses"
            theme = "pistol-round snowballs"
        }
        // 3. Check Rating Diff (Firepower). A team rating gap, not every
        // player: the loser can still have the best player on the server.
        else if (winnerStats.avgRating > loserStats.avgRating + 0.15) {
            primaryFactor = "FIREPOWER"
            winningReason = "Complete domination in aim duels"
            losingReason = "Outgunned in the aim duels"
            theme = "dominance in aim duels"
        }
        // 4. Trading, only when the winner really traded more (MATCHENGINE-03)
        else if ((homeWon ? roundAnalysis.homeTrades - roundAnalysis.awayTrades : roundAnalysis.awayTrades - roundAnalysis.homeTrades) > 0) {
            primaryFactor = "TRADING"
            winningReason = "Better trade fragging and spacing"
            losingReason = "Lost the trade battle"
            theme = "better trading and spacing"
        }
        // 5. Nothing stood out: a close fight decided in the duels
        else {
            primaryFactor = "FIREPOWER"
            winningReason = "Won more of the key duels"
            losingReason = "Came up short in the key duels"
            theme = "a handful of key duels"
        }

        return { primaryFactor, winningReason, losingReason, theme }
    }

    /**
     * The winner's round margin per map played. MatchResult.homeScore /
     * awayScore count maps won (the series score); rounds live in result.maps.
     */
    private static margin(result: MatchResult): { known: boolean; perMap: number; droppedMap: boolean } {
        const homeWon = result.homeScore > result.awayScore
        const maps = (result.maps ?? []).map(mapScore).filter((m): m is [number, number] => m !== null)
        if (maps.length === 0) return { known: false, perMap: 0, droppedMap: false }
        let diff = 0
        let droppedMap = false
        for (const [home, away] of maps) {
            const mapDiff = homeWon ? home - away : away - home
            diff += mapDiff
            if (mapDiff < 0) droppedMap = true
        }
        return { known: true, perMap: diff / maps.length, droppedMap }
    }

    private static generateSummary(
        winnerName: string,
        factors: ReturnType<typeof MatchAnalyzer.determineKeyFactors>,
        result: MatchResult,
    ): string {
        const homeWon = result.homeScore > result.awayScore
        const single = result.maps?.length === 1 ? mapScore(result.maps[0]) : null
        // One map: its round score ("13-4"); a series: the maps ("2-1").
        const score = single
            ? `${homeWon ? single[0] : single[1]}-${homeWon ? single[1] : single[0]}`
            : `${Math.max(result.homeScore, result.awayScore)}-${Math.min(result.homeScore, result.awayScore)}`

        const { perMap, droppedMap } = MatchAnalyzer.margin(result)
        let prefix = ""
        if (perMap > 8 && !droppedMap) prefix = "A crushing victory as "
        else if (perMap > 4) prefix = "A solid performance saw "
        else prefix = "In a tightly contested battle, "

        return `${prefix}${winnerName} secure the ${score} win. The match was defined by ${factors.theme}.`
    }
}
