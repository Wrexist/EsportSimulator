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
 * Schedule a bracket match into `save.scheduledMatches`. Idempotent: returns
 * silently if the match ID already exists. Skips self-matches with a warn
 * (they typically indicate a bracket-progression bug upstream and would
 * deadlock the bracket otherwise).
 *
 * Auto-flags `isHighPressure` when the stage label contains "Final" or
 * "Semi" so the match-engine can apply pressure modifiers downstream.
 */
export function scheduleBracketMatch(save: GameSave, match: BracketMatchSaveData): void {
    const existing = save.scheduledMatches.find((m: MatchSaveData) => m.id === match.id)
    if (existing || save.completedMatches.some(row => row.id === match.id)) return

    if (match.homeTeamId && match.awayTeamId) {
        if (match.homeTeamId === match.awayTeamId) {
            debug.warn(`[Match] SKIPPING - Team playing itself: ${match.id} (${match.homeTeamId} vs ${match.awayTeamId})`)
            return
        }

        let week = Math.max(match.week, save.currentWeek)
        let day = assignMatchDay(save, [match.homeTeamId, match.awayTeamId], week)
        while (day < 0) {
            week += 1
            day = assignMatchDay(save, [match.homeTeamId, match.awayTeamId], week)
        }
        match.week = week
        const tournament = save.tournaments.find(t => t.id === match.tournamentId)
        if (tournament) tournament.endWeek = Math.max(tournament.endWeek || week, week)

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
