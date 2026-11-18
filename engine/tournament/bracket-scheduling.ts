/**
 * Bracket scheduling helpers.
 *
 * Three free functions extracted from tournament-manager.ts. All operate
 * on GameSave + a bracket match descriptor; none read TournamentManager
 * instance state. Grouping them here keeps the manager focused on flow
 * control (Swiss progression, double-elim routing) instead of low-level
 * day assignment and match-row pushing.
 */

import type { GameSave, TournamentSaveData, BracketMatchSaveData, MatchSaveData } from "../save-types"
import { debug } from "@/lib/debug-logger"
import { getTournamentById } from "@/data/tournament-calendar"
import { buildInstanceId, getSeasonFromTournamentId, getSeasonFromWeek } from "../circuit-engine"

/** Append a bracket match to the tournament's playoff bracket (init lazily). */
export function addBracketMatch(tournament: TournamentSaveData, match: BracketMatchSaveData): void {
    if (!tournament.playoffBracket) tournament.playoffBracket = []
    if (!tournament.playoffBracket.some(row => row.id === match.id)) tournament.playoffBracket.push(match)
}

/**
 * Assign a day-of-week index (0=Mon … 6=Sun) for a match, preferring weekend
 * dates and avoiding double-booking either team within the same week.
 *
 * Returns the first non-conflicting day, or -1 when the week is full.
 * The scheduling boundary advances a full week instead of double-booking.
 */
export function assignMatchDay(
    save: GameSave,
    teamIds: string[],
    week: number,
    preferredDays: number[] = [5, 6, 4, 3, 2, 1, 0], // Sat, Sun, Fri, Thu, Wed, Tue, Mon
): number {
    const existingDaysUsed = [...save.scheduledMatches, ...save.completedMatches]
        .filter(m => m.week === week &&
            (teamIds.includes(m.homeTeamId) || teamIds.includes(m.awayTeamId)))
        .map(m => m.day)
        .filter((d): d is number => d !== undefined)

    for (const day of preferredDays) {
        if (week === save.currentWeek && save.timeMode === 'HYBRID_DAILY' && day < save.currentDay) continue
        if (Number.isInteger(day) && day >= 0 && day <= 6 && !existingDaysUsed.includes(day)) return day
    }
    return -1
}

/**
 * Last week a qualifier may play in: the week before the event it feeds
 * starts (that event's field is built on its first week). Undefined for
 * events that feed nothing.
 */
export function qualifierDeadlineWeek(save: GameSave, tournamentId: string): number | undefined {
    const tournament = save.tournaments.find(t => t.id === tournamentId)
    const target = tournament?.tier === "QUALIFIER" ? getTournamentById(tournament.id)?.qualifierFor : undefined
    const targetDef = target ? getTournamentById(target) : undefined
    if (!tournament || !targetDef) return undefined
    const season = tournament.seasonNumber ?? getSeasonFromTournamentId(tournament.id) ?? getSeasonFromWeek(tournament.startWeek)
    const start = save.tournaments.find(t => t.id === buildInstanceId(targetDef.id, season))?.startWeek ?? ((season - 1) * 52 + targetDef.startWeek)
    return start - 1
}

/**
 * Schedule a bracket match into `save.scheduledMatches`. Idempotent: returns
 * silently if the match ID already exists. Skips self-matches with a warn
 * (they typically indicate a bracket-progression bug upstream and would
 * deadlock the bracket otherwise).
 *
 * Auto-flags `isHighPressure` when the stage label contains "Final" or
 * "Semi" so the match-engine can apply pressure modifiers downstream.
 */
export function scheduleBracketMatch(save: GameSave, match: BracketMatchSaveData, preferredDays?: number[]): void {
    const existing = save.scheduledMatches.find((m: MatchSaveData) => m.id === match.id)
    if (existing || save.completedMatches.some(row => row.id === match.id)) return

    if (match.homeTeamId && match.awayTeamId) {
        if (match.homeTeamId === match.awayTeamId) {
            debug.warn(`[Match] SKIPPING - Team playing itself: ${match.id} (${match.homeTeamId} vs ${match.awayTeamId})`)
            return
        }

        let week = Math.max(match.week, save.currentWeek)
        let day = assignMatchDay(save, [match.homeTeamId, match.awayTeamId], week, preferredDays)
        // A qualifier never spills into the week its event starts (its winners
        // would miss the field, COMP-01): in its last week a club may play a
        // second match on Sunday instead.
        const deadline = qualifierDeadlineWeek(save, match.tournamentId)
        while (day < 0) {
            if (week === deadline) {
                day = 6
                break
            }
            week += 1
            day = assignMatchDay(save, [match.homeTeamId, match.awayTeamId], week, preferredDays)
        }
        match.week = week
        const tournament = save.tournaments.find(t => t.id === match.tournamentId)
        // endWeek is the week after the last one (start + duration), as when
        // the event was created; a match played later moves it (COMP-14).
        if (tournament) tournament.endWeek = Math.max(tournament.endWeek || week + 1, week + 1)

        const scheduledMatch: MatchSaveData = {
            id: match.id,
            homeTeamId: match.homeTeamId,
            awayTeamId: match.awayTeamId,
            tournamentId: match.tournamentId,
            stage: match.stage,
            week: match.week,
            day,
            format: match.format,
            seed: match.seed,
            isHighPressure: match.stage.includes("Final") || match.stage.includes("Semi"),
        }

        save.scheduledMatches.push(scheduledMatch)
    }
}
