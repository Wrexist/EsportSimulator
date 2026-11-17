import { t } from "@/lib/i18n"
/**
 * The manager's chance to win a fixture, for the match screens. Prepares the
 * series exactly as the live screen and instant simulation do (same lineups,
 * staff, playstyle counter, prep) and reads the calibrated curve in
 * engine/match/win-odds.ts. Null when the match cannot be prepared.
 */
import type { PlayerSaveData, StaffSaveData, TeamSaveData, MatchSaveData } from "@/engine/save-types"
import { prepareLegacySeries } from "@/engine/match/legacy-prepare"
import { matchWinOdds, winOddsInputs } from "@/engine/match/win-odds"
import { mapComfort } from "@/engine/match/map-comfort"
import { getActivePlayersByRosterOrder } from "@/lib/live-match-builders"

export const bestOfOf = (format?: string) => (format === "BO5" ? 5 : format === "BO3" ? 3 : 1)
export const bestOfLabel = (format?: string) => (bestOfOf(format) === 1 ? t("prep.format.map") : t("prep.format.series"))

type WinChanceArgs = {
    match: Pick<MatchSaveData, "id" | "homeTeamId" | "awayTeamId" | "format"> & Partial<MatchSaveData>
    home: TeamSaveData
    away: TeamSaveData
    players: PlayerSaveData[]
    playersById?: Map<string, PlayerSaveData>
    staff: StaffSaveData[]
    playerTeamId: string
}

/**
 * Why the win chance is what it is (NEWPLAYER-08), all from the manager's
 * side: the curve's two inputs (duel-rating gap of the two fives, capped team
 * edge without map comfort) and, per map in play, the chance there and both
 * clubs' comfort on it.
 */
export interface WinChanceFactors {
    chance: number
    /** Mean duel rating (aim + condition) of your five minus theirs, in points. */
    ratingGap: number
    /** Capped non-player edge (staff, prep, playstyle, chemistry), yours minus theirs (0.10 = the cap). */
    edgeGap: number
    maps: { map: string; chance: number; ownComfort: number; theirComfort: number }[]
}

export function playerWinFactors(args: WinChanceArgs): WinChanceFactors | null {
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
        const odds = matchWinOdds(ctx, bestOfOf(match.format))
        const own = playerTeamId === home.id
        const otherId = own ? away.id : home.id
        const base = winOddsInputs(ctx)
        return {
            chance: own ? odds.series : 1 - odds.series,
            ratingGap: own ? base.ratingGap : -base.ratingGap,
            edgeGap: own ? base.edgeGap : -base.edgeGap,
            maps: odds.maps.map(m => ({ map: m.map, chance: own ? m.home : 1 - m.home, ownComfort: mapComfort(playerTeamId, m.map), theirComfort: mapComfort(otherId, m.map) })),
        }
    } catch {
        return null
    }
}

export function playerWinChance(args: WinChanceArgs): number | null {
    return playerWinFactors(args)?.chance ?? null
}
