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
 * Stored name of a season instance (COMP-15): a name with an edition number
 * counts on per season ("Global Pro League Season 22 Finals"); every other
 * event carries the year it is played in, as the Majors do ("Winter Open
 * Katova 2027", "Northern Major Asia RMR 2028"). Inbox messages, trophies and
 * the prize ledger copy this name, so it must already be right when stored.
 */
export function instanceName(definition: Pick<TournamentDefinition, "name" | "startWeek" | "duration"> & { qualifierFor?: string }, season: number, gameStartDate?: string | null): string {
    const edition = /\bSeason (\d+)\b/.exec(definition.name)
    if (edition) return definition.name.replace(edition[0], `Season ${Number(edition[1]) + Math.max(1, season) - 1}`)
    const yeared = /\b20\d{2}\b/.test(definition.name) ? definition.name : `${definition.name} 2025`
    // A qualifier carries the year of the event it leads to ("Winter Open
    // Katova Open Qualifier 2027" for Winter Open Katova 2027).
    let dated: Pick<TournamentDefinition, "startWeek" | "duration"> & { qualifierFor?: string } = definition
    for (let hops = 0; dated.qualifierFor && hops < 4; hops++) {
        const next = getTournamentById(dated.qualifierFor)
        if (!next) break
        dated = next
    }
    return getDynamicTournamentName(yeared, seasonStartWeek(dated, season), gameStartDate, dated.duration)
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

/**
 * Name of a match's event on its result screen: the saved instance's name
 * (which carries the year it is played in) before the calendar entry's data
 * name, which still says the data's year ("Winter Open Katova 2025").
 */
export function matchEventName(storedName: string | null | undefined, definitionName: string | null | undefined, tournamentId: string | null | undefined, matchWeek: number, gameStartDate?: string | null): string | undefined {
    if (storedName) return storedName
    return definitionName ? recordEventName(definitionName, tournamentId, matchWeek, gameStartDate) : undefined
}
