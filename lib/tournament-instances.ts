/**
 * Season instances of a calendar event (e.g. `iem_katowice` → `iem_katowice_s1`,
 * `iem_katowice_s2`). Shared by the Tournaments list and the event page so
 * both pick the same instance, and never mix in a different series whose id
 * merely starts with the same text (`iem_katowice_open_s1` is the qualifier,
 * not Winter Open Katova itself).
 */
import { getTournamentById, type TournamentDefinition } from "@/data/tournament-calendar"
import { getSeasonFromTournamentId, getSeasonFromWeek, getSeriesIdFromTournamentId, buildInstanceId } from "@/engine/circuit-engine"
import { getDynamicTournamentName } from "@/lib/utils-extended"

type InstanceLike = { id: string; seriesId?: string; seasonNumber?: number; startWeek?: number; isCompleted?: boolean }

/** Series of a saved tournament row. */
export function instanceSeriesId(t: InstanceLike): string {
    return t.seriesId || getSeriesIdFromTournamentId(t.id)
}

/** Season of a saved tournament row (id suffix first, then the stored number). */
export function instanceSeason(t: InstanceLike): number {
    return getSeasonFromTournamentId(t.id) ?? t.seasonNumber ?? getSeasonFromWeek(t.startWeek ?? 1)
}

/** All saved instances of one series, latest season first. */
export function instancesOfSeries<T extends InstanceLike>(tournaments: T[], seriesId: string): T[] {
    return tournaments
        .filter(t => instanceSeriesId(t) === seriesId)
        .sort((a, b) => instanceSeason(b) - instanceSeason(a))
}

/** Absolute start week of a calendar event in a given season. */
export function seasonStartWeek(definition: Pick<TournamentDefinition, "startWeek">, season: number): number {
    return (Math.max(1, season) - 1) * 52 + definition.startWeek
}

/**
 * This season's instance of a calendar event, if it has been created yet.
 * Never falls back to last season's instance: that one's status and teams
 * belong to a different event.
 */
export function currentSeasonInstance<T extends InstanceLike>(tournaments: T[], seriesId: string, currentWeek: number): T | undefined {
    const id = buildInstanceId(seriesId, getSeasonFromWeek(currentWeek))
    return tournaments.find(t => t.id === id)
}

/**
 * Weeks of the event a stored record (trophy, circuit-points result) belongs
 * to, for naming it with the right year. Falls back to the record's own week
 * when the id carries no season.
 */
export function eventWeeksFor(tournamentId: string | null | undefined, fallbackWeek: number): { startWeek: number; duration: number } {
    const definition = tournamentId ? getTournamentById(tournamentId) : undefined
    const season = tournamentId ? getSeasonFromTournamentId(tournamentId) : null
    if (definition && season !== null && tournamentId !== definition.id) {
        return { startWeek: seasonStartWeek(definition, season), duration: definition.duration }
    }
    return { startWeek: fallbackWeek, duration: 1 }
}

/** Display name of a stored record's event, with the year it was played in. */
export function recordEventName(name: string, tournamentId: string | null | undefined, recordWeek: number, gameStartDate?: string | null): string {
    const { startWeek, duration } = eventWeeksFor(tournamentId, recordWeek)
    return getDynamicTournamentName(name, startWeek, gameStartDate, duration)
}
