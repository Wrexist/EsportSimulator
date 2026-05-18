/**
 * Tournament Stats Calculation Utilities
 * Pro-style aggregation of player and team stats across tournament matches
 */

import { CompletedMatchSaveData, PlayerSaveData, TeamSaveData } from "./save-types"
import { TournamentPlayerStats, TournamentTeamStats, TournamentMVP } from "@/types/match"

/**
 * Calculate top players for a tournament
 */
export function getTournamentTopPlayers(
    completedMatches: CompletedMatchSaveData[],
    tournamentId: string,
    players: PlayerSaveData[],
    teams: TeamSaveData[],
    limit: number = 10
): TournamentPlayerStats[] {
    // Filter matches for this tournament (including seasonal variants)
    const tournamentMatches = completedMatches.filter(m =>
        m.tournamentId === tournamentId ||
        m.tournamentId?.startsWith(tournamentId + "_s") ||
        tournamentId?.startsWith(m.tournamentId + "_s")
    )

    if (tournamentMatches.length === 0) return []

    // Aggregate stats per player
    const playerStatsMap: Record<string, {
        kills: number
        deaths: number
        assists: number
        adr: number
        rating: number
        kast: number
        headshots: number
        clutches: number
        firstKills: number
        firstDeaths: number
        mapsPlayed: number
        wins: number
        losses: number
    }> = {}

    tournamentMatches.forEach(match => {
        if (!match.result?.playerStats) return

        Object.entries(match.result.playerStats).forEach(([playerId, stats]) => {
            if (!playerStatsMap[playerId]) {
                playerStatsMap[playerId] = {
                    kills: 0, deaths: 0, assists: 0,
                    adr: 0, rating: 0, kast: 0,
                    headshots: 0, clutches: 0, firstKills: 0, firstDeaths: 0,
                    mapsPlayed: 0, wins: 0, losses: 0
                }
            }

            const p = playerStatsMap[playerId]
            p.kills += stats.kills || 0
            p.deaths += stats.deaths || 0
            p.assists += stats.assists || 0
            p.adr += stats.adr || 0
            p.rating += stats.rating || 0
            p.kast += stats.kast || 0
            p.headshots += stats.headshots || 0
            p.clutches += stats.clutches || 0
            p.firstKills += stats.firstKills || 0
            p.firstDeaths += stats.firstDeaths || 0
            p.mapsPlayed += stats.mapsPlayed || 1

            // Track wins
            const playerTeam = teams.find(t => t.rosterIds?.includes(playerId))
            if (playerTeam && match.result.winnerId === playerTeam.id) {
                p.wins++
            } else {
                p.losses++
            }
        })
    })

    // Convert to array and calculate derived stats
    return Object.entries(playerStatsMap)
        .map(([playerId, stats]) => {
            const player = players.find(p => p.id === playerId)
            const team = teams.find(t => t.rosterIds?.includes(playerId))

            return {
                playerId,
                playerName: player?.nickname || player?.name || 'Unknown',
                teamId: team?.id || '',
                teamName: team?.name || 'Unknown',
                nationality: player?.nationality || 'Unknown',
                portraitPath: player?.portraitPath,

                mapsPlayed: stats.mapsPlayed,
                kills: stats.kills,
                deaths: stats.deaths,
                assists: stats.assists,
                adr: stats.mapsPlayed > 0 ? Math.round(stats.adr / stats.mapsPlayed) : 0,
                rating: stats.mapsPlayed > 0 ? parseFloat((stats.rating / stats.mapsPlayed).toFixed(2)) : 0,
                kast: stats.mapsPlayed > 0 ? Math.round(stats.kast / stats.mapsPlayed) : 0,
                headshots: stats.headshots,
                clutches: stats.clutches,
                firstKills: stats.firstKills,
                firstDeaths: stats.firstDeaths,

                kdRatio: stats.deaths > 0 ? parseFloat((stats.kills / stats.deaths).toFixed(2)) : stats.kills,
                winRate: (stats.wins + stats.losses) > 0
                    ? parseFloat((stats.wins / (stats.wins + stats.losses)).toFixed(2))
                    : 0,
                impactRating: calculateImpact(stats)
            }
        })
        .filter(p => p.mapsPlayed >= 1) // Minimum 1 map played
        .sort((a, b) => b.rating - a.rating)
        .slice(0, limit)
}

/**
 * Calculate top teams for a tournament
 */
export function getTournamentTopTeams(
    completedMatches: CompletedMatchSaveData[],
    tournamentId: string,
    teams: TeamSaveData[],
    limit: number = 10
): TournamentTeamStats[] {
    const tournamentMatches = completedMatches.filter(m =>
        m.tournamentId === tournamentId ||
        m.tournamentId?.startsWith(tournamentId + "_s") ||
        tournamentId?.startsWith(m.tournamentId + "_s")
    )

    if (tournamentMatches.length === 0) return []

    const teamStatsMap: Record<string, {
        mapsWon: number
        mapsLost: number
        roundsWon: number
        roundsLost: number
        totalRating: number
        ratingCount: number
    }> = {}

    tournamentMatches.forEach(match => {
        if (!match.result) return

        const homeTeamId = match.homeTeamId
        const awayTeamId = match.awayTeamId

        // Initialize if needed
        ;[homeTeamId, awayTeamId].forEach(teamId => {
            if (!teamStatsMap[teamId]) {
                teamStatsMap[teamId] = {
                    mapsWon: 0, mapsLost: 0,
                    roundsWon: 0, roundsLost: 0,
                    totalRating: 0, ratingCount: 0
                }
            }
        })

        // Count maps
        teamStatsMap[homeTeamId].mapsWon += match.result.homeScore || 0
        teamStatsMap[homeTeamId].mapsLost += match.result.awayScore || 0
        teamStatsMap[awayTeamId].mapsWon += match.result.awayScore || 0
        teamStatsMap[awayTeamId].mapsLost += match.result.homeScore || 0

        // Count rounds from maps
        match.result.maps?.forEach(mapResult => {
            if (mapResult.finalScore) {
                teamStatsMap[homeTeamId].roundsWon += mapResult.finalScore.team1 || 0
                teamStatsMap[homeTeamId].roundsLost += mapResult.finalScore.team2 || 0
                teamStatsMap[awayTeamId].roundsWon += mapResult.finalScore.team2 || 0
                teamStatsMap[awayTeamId].roundsLost += mapResult.finalScore.team1 || 0
            }
        })

        // Calculate team rating from player stats
        if (match.result.playerStats) {
            const homeTeam = teams.find(t => t.id === homeTeamId)
            const awayTeam = teams.find(t => t.id === awayTeamId)

            let homeRating = 0, homeCount = 0
            let awayRating = 0, awayCount = 0

            Object.entries(match.result.playerStats).forEach(([playerId, stats]) => {
                if (homeTeam?.rosterIds?.includes(playerId)) {
                    homeRating += stats.rating || 0
                    homeCount++
                } else if (awayTeam?.rosterIds?.includes(playerId)) {
                    awayRating += stats.rating || 0
                    awayCount++
                }
            })

            if (homeCount > 0) {
                teamStatsMap[homeTeamId].totalRating += homeRating / homeCount
                teamStatsMap[homeTeamId].ratingCount++
            }
            if (awayCount > 0) {
                teamStatsMap[awayTeamId].totalRating += awayRating / awayCount
                teamStatsMap[awayTeamId].ratingCount++
            }
        }
    })

    return Object.entries(teamStatsMap)
        .map(([teamId, stats]) => {
            const team = teams.find(t => t.id === teamId)
            const mapsPlayed = stats.mapsWon + stats.mapsLost

            return {
                teamId,
                teamName: team?.name || 'Unknown',
                logoPath: team?.logoPath,
                mapsPlayed,
                mapsWon: stats.mapsWon,
                mapsLost: stats.mapsLost,
                roundsWon: stats.roundsWon,
                roundsLost: stats.roundsLost,
                avgRating: stats.ratingCount > 0
                    ? parseFloat((stats.totalRating / stats.ratingCount).toFixed(2))
                    : 1.0,
                mapWinRate: mapsPlayed > 0
                    ? parseFloat((stats.mapsWon / mapsPlayed).toFixed(2))
                    : 0,
                roundDiff: stats.roundsWon - stats.roundsLost
            }
        })
        .filter(t => t.mapsPlayed >= 1)
        .sort((a, b) => b.avgRating - a.avgRating)
        .slice(0, limit)
}

/**
 * Get tournament MVP (best performing player)
 */
export function getTournamentMVP(
    completedMatches: CompletedMatchSaveData[],
    tournamentId: string,
    players: PlayerSaveData[],
    teams: TeamSaveData[]
): TournamentMVP | null {
    const topPlayers = getTournamentTopPlayers(completedMatches, tournamentId, players, teams, 1)

    if (topPlayers.length === 0) return null

    const topPlayer = topPlayers[0]

    // Count MVP maps
    const tournamentMatches = completedMatches.filter(m =>
        m.tournamentId === tournamentId ||
        m.tournamentId?.startsWith(tournamentId + "_s") ||
        tournamentId?.startsWith(m.tournamentId + "_s")
    )

    let mvpMaps = 0
    tournamentMatches.forEach(match => {
        if (match.result?.mvpPlayerId === topPlayer.playerId) mvpMaps++
        match.result?.maps?.forEach(map => {
            if (map.mvpPlayerId === topPlayer.playerId) mvpMaps++
        })
    })

    return {
        playerId: topPlayer.playerId,
        playerName: topPlayer.playerName,
        teamId: topPlayer.teamId,
        teamName: topPlayer.teamName,
        nationality: topPlayer.nationality,
        portraitPath: topPlayer.portraitPath,
        avgRating: topPlayer.rating,
        totalKills: topPlayer.kills,
        mapsPlayed: topPlayer.mapsPlayed,
        mvpMaps
    }
}

/**
 * Calculate impact rating for a player
 */
function calculateImpact(stats: {
    kills: number
    deaths: number
    firstKills: number
    firstDeaths: number
    clutches: number
    assists: number
    mapsPlayed: number
}): number {
    const kd = stats.deaths > 0 ? stats.kills / stats.deaths : stats.kills
    const fkfd = stats.firstDeaths > 0 ? stats.firstKills / stats.firstDeaths : stats.firstKills
    const clutchImpact = stats.clutches * 0.5
    const assistsPerMap = stats.assists / Math.max(1, stats.mapsPlayed)

    return parseFloat((kd * 0.4 + fkfd * 0.3 + clutchImpact * 0.2 + assistsPerMap * 0.1).toFixed(2))
}

/**
 * Get all player stats for a tournament (for detailed stats view)
 */
export function getAllTournamentPlayerStats(
    completedMatches: CompletedMatchSaveData[],
    tournamentId: string,
    players: PlayerSaveData[],
    teams: TeamSaveData[]
): TournamentPlayerStats[] {
    return getTournamentTopPlayers(completedMatches, tournamentId, players, teams, 999)
}
