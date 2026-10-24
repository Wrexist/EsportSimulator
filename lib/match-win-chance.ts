/**
 * The manager's chance to win a fixture, for the match screens. Prepares the
 * series exactly as the live screen and instant simulation do (same lineups,
 * staff, playstyle counter, prep) and reads the calibrated curve in
 * engine/match/win-odds.ts. Null when the match cannot be prepared.
 */
import type { PlayerSaveData, StaffSaveData, TeamSaveData, MatchSaveData } from "@/engine/save-types"
import { prepareLegacySeries } from "@/engine/match/legacy-prepare"
import { matchWinOdds } from "@/engine/match/win-odds"
import { getActivePlayersByRosterOrder } from "@/lib/live-match-builders"

export const bestOfOf = (format?: string) => (format === "BO5" ? 5 : format === "BO3" ? 3 : 1)
export const bestOfLabel = (format?: string) => (bestOfOf(format) === 1 ? "map" : "series")

export function playerWinChance(args: {
    match: Pick<MatchSaveData, "id" | "homeTeamId" | "awayTeamId" | "format"> & Partial<MatchSaveData>
    home: TeamSaveData
    away: TeamSaveData
    players: PlayerSaveData[]
    playersById?: Map<string, PlayerSaveData>
    staff: StaffSaveData[]
    playerTeamId: string
}): number | null {
    const { match, home, away, players, playersById, staff, playerTeamId } = args
    if (playerTeamId !== home.id && playerTeamId !== away.id) return null
    try {
        const homePlayers = getActivePlayersByRosterOrder(home, players, playersById)
        const awayPlayers = getActivePlayersByRosterOrder(away, players, playersById)
        if (homePlayers.length < 5 || awayPlayers.length < 5) return null
        const ctx = prepareLegacySeries({
            match: match as never, homeTeam: home as never, awayTeam: away as never,
            homePlayers, awayPlayers, staff: staff as never, managedTeamId: playerTeamId,
        })
        const homeSeries = matchWinOdds(ctx, bestOfOf(match.format)).series
        return playerTeamId === home.id ? homeSeries : 1 - homeSeries
    } catch {
        return null
    }
}
