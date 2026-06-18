/**
 * Phase 11: Long-Term Memory - History Tracking Engine
 * Tracks match history, rivalries, and trophy data
 */

import { GameSave, TeamSaveData, RivalryData, CompletedMatchSaveData } from "./save-types"

/**
 * Get all matches between two teams
 */
export function getHeadToHead(save: GameSave, teamId1: string, teamId2: string): CompletedMatchSaveData[] {
    return save.completedMatches.filter(match =>
        (match.homeTeamId === teamId1 && match.awayTeamId === teamId2) ||
        (match.homeTeamId === teamId2 && match.awayTeamId === teamId1)
    )
}

/**
 * Get a team's recent match history
 */
export function getTeamMatchHistory(save: GameSave, teamId: string, limit: number = 10): CompletedMatchSaveData[] {
    return save.completedMatches
        .filter(match => match.homeTeamId === teamId || match.awayTeamId === teamId)
        .sort((a, b) => b.week - a.week)
        .slice(0, limit)
}

/**
 * Get win/loss record for a team
 */
export function getTeamRecord(save: GameSave, teamId: string): { wins: number; losses: number; winRate: number } {
    const matches = save.completedMatches.filter(
        match => match.homeTeamId === teamId || match.awayTeamId === teamId
    )

    let wins = 0
    let losses = 0

    for (const match of matches) {
        const isHome = match.homeTeamId === teamId
        const homeWon = match.result.homeScore > match.result.awayScore

        if ((isHome && homeWon) || (!isHome && !homeWon)) {
            wins++
        } else {
            losses++
        }
    }

    const total = wins + losses
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0

    return { wins, losses, winRate }
}

/**
 * Get trophy case for a team
 */
export function getTrophyCase(save: GameSave, teamId: string): TeamSaveData["trophies"] {
    const team = save.teams.find(t => t.id === teamId)
    return team?.trophies || []
}

/**
 * Calculate rivalry intensity based on match history
 */
function calculateRivalryIntensity(matchesPlayed: number, recentStakes: number): RivalryData["intensity"] {
    // recentStakes: higher if they've met in playoffs/finals recently
    if (matchesPlayed >= 8 || recentStakes >= 3) return "FIERCE"
    if (matchesPlayed >= 5 || recentStakes >= 2) return "HEATED"
    if (matchesPlayed >= 3) return "NEUTRAL"
    return "FRIENDLY"
}

/**
 * Update rivalries after a match is completed
 */
export function updateRivalries(save: GameSave, match: CompletedMatchSaveData): void {
    const { homeTeamId, awayTeamId, result, stage } = match

    const homeTeam = save.teams.find(t => t.id === homeTeamId)
    const awayTeam = save.teams.find(t => t.id === awayTeamId)

    if (!homeTeam || !awayTeam) return

    const homeWon = result.homeScore > result.awayScore
    const isHighStakes = (stage?.toLowerCase().includes("final") || stage?.toLowerCase().includes("semi")) ?? false

    // Update home team's rivalry with away team
    updateTeamRivalry(homeTeam, awayTeamId, homeWon, match.week, isHighStakes)

    // Update away team's rivalry with home team
    updateTeamRivalry(awayTeam, homeTeamId, !homeWon, match.week, isHighStakes)
}

function updateTeamRivalry(
    team: TeamSaveData,
    opponentId: string,
    won: boolean,
    week: number,
    isHighStakes: boolean
): void {
    if (!team.rivalries) {
        team.rivalries = []
    }

    let rivalry = team.rivalries.find(r => r.opponentTeamId === opponentId)

    if (!rivalry) {
        rivalry = {
            opponentTeamId: opponentId,
            matchesPlayed: 0,
            wins: 0,
            losses: 0,
            lastPlayed: week,
            intensity: "FRIENDLY"
        }
        team.rivalries.push(rivalry)
    }

    rivalry.matchesPlayed++
    if (won) {
        rivalry.wins++
    } else {
        rivalry.losses++
    }
    rivalry.lastPlayed = week

    // Accumulate high stakes match count
    if (isHighStakes) {
        rivalry.highStakesCount = (rivalry.highStakesCount ?? 0) + 1
    }
    rivalry.intensity = calculateRivalryIntensity(rivalry.matchesPlayed, rivalry.highStakesCount ?? 0)
}

/**
 * Get top rivalries for a team (sorted by matches played)
 */
export function getTopRivalries(team: TeamSaveData, limit: number = 5): RivalryData[] {
    if (!team.rivalries) return []

    return [...team.rivalries]
        .sort((a, b) => b.matchesPlayed - a.matchesPlayed)
        .slice(0, limit)
}

/**
 * Get rival team details with names
 */
export function getRivalriesWithNames(save: GameSave, teamId: string): Array<RivalryData & { opponentName: string }> {
    const team = save.teams.find(t => t.id === teamId)
    if (!team?.rivalries) return []

    return team.rivalries.map(rivalry => {
        const opponent = save.teams.find(t => t.id === rivalry.opponentTeamId)
        return {
            ...rivalry,
            opponentName: opponent?.name || "Unknown Team"
        }
    }).sort((a, b) => b.matchesPlayed - a.matchesPlayed)
}

/**
 * Get the biggest rival (most matches played)
 */
export function getBiggestRival(team: TeamSaveData): RivalryData | null {
    if (!team.rivalries || team.rivalries.length === 0) return null

    return team.rivalries.reduce((max, current) =>
        current.matchesPlayed > max.matchesPlayed ? current : max
    )
}

export type RivalryIntensity = RivalryData["intensity"]

/**
 * Find the rivalry record a team holds against a specific opponent (if any).
 */
export function getRivalryBetween(team: TeamSaveData, opponentTeamId: string): RivalryData | undefined {
    return team.rivalries?.find(r => r.opponentTeamId === opponentTeamId)
}

/**
 * A "derby" is an established rivalry (HEATED or FIERCE) — the only tiers that
 * carry gameplay effects (morale/fanbase stakes and pre-match framing).
 */
export function isDerby(intensity: RivalryIntensity | undefined): boolean {
    return intensity === "HEATED" || intensity === "FIERCE"
}

/**
 * Deterministic stakes multiplier for a derby result. Amplifies both the high of
 * a derby win and the sting of a derby loss (morale + fanbase swings). Returns
 * 1.0 for non-derby matches so callers can multiply unconditionally.
 */
export function derbyMultiplier(intensity: RivalryIntensity | undefined): number {
    switch (intensity) {
        case "FIERCE": return 1.6
        case "HEATED": return 1.3
        default: return 1
    }
}

/**
 * Get all-time stats for a player
 */
export function getPlayerCareerStats(save: GameSave, playerId: string) {
    const player = save.players.find(p => p.id === playerId)
    if (!player) return null

    return {
        matchesPlayed: player.matchesPlayed || 0,
        roundsPlayed: player.roundsPlayed || 0,
        avgRating: player.avgRating || 0,
        clutchSuccessRate: player.clutchSuccessRate || 0,
        majorWins: player.majorWins || 0,
        totalMVPs: player.totalMVPs || 0
    }
}
