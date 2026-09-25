/**
 * Tournament completion detection.
 *
 * Pure functions extracted from atomic-week-processor.ts. Given a tournament
 * + save snapshot, decides whether the tournament has reached a legitimate
 * terminal state (grand final/final played with a winner, or — for round
 * robin leagues — every scheduled match for the league has been played).
 *
 * These were instance methods on AtomicWeekProcessor but neither reads
 * instance state, so they belong in a focused module that the processor
 * (and any future caller) can use.
 */

import { resolveCompletedWinner } from "../tournament/seeding-helpers"
import type { GameSave, TournamentSaveData } from "../save-types"

/**
 * Is this bracket-match stage the terminal (championship) stage?
 *
 * Recognizes "grand final" (double-elim), "final", and "finals" — case
 * insensitive — so AI-set stage strings from different generators all
 * resolve correctly.
 */
export function isTerminalBracketStage(stage: string): boolean {
    const normalized = stage.trim().toLowerCase()
    return (normalized === "grand final" || normalized === "grand final reset")
        || normalized === "final"
        || normalized === "finals"
}

/**
 * Has the tournament reached a legitimate terminal state we can award on?
 *
 * Three paths (the league check is FIRST — see below):
 *   1. Format "league" → round-robin: require that every scheduled match has
 *      been played (none remain in save.scheduledMatches) and at least one
 *      match was played. A league's champion is standings[0], not a bracket
 *      final.
 *   2. Playoff bracket present → require the latest terminal-stage match
 *      to be completed *and* present in the save's completedMatches.
 *   3. Otherwise → fall back to whether any completed match carries a
 *      terminal-stage label with a winnerId.
 *
 * The league path MUST run before the bracket path: `setupLeagueSchedule`
 * stores every round-robin match in `tournament.playoffBracket` (via
 * `addBracketMatch`), so a league always has a non-empty playoffBracket. If the
 * bracket path ran first it would search for a terminal "final" stage that a
 * league never has ("League Match" only), return false forever, and the league
 * would never complete — no champion, no prizes, no circuit points.
 *
 * Returning false here protects awardPrizes/closeTournament from firing
 * prematurely on partial tournament progressions.
 */
export function hasTerminalTournamentCompletion(save: GameSave, tournament: TournamentSaveData): boolean {
    const tournamentMatches = save.completedMatches.filter(m => m.tournamentId === tournament.id)
    if (tournamentMatches.length === 0) return false

    if (tournament.format === "league") {
        // Every league match is scheduled up front across the season, then
        // moved to completedMatches as it's played. The league is done exactly
        // when none of its matches remain scheduled — checking only
        // `week <= currentWeek` would mark it complete after the FIRST week
        // while later rounds are still pending.
        const pending = save.scheduledMatches.some(m => m.tournamentId === tournament.id)
        if (pending) return false
        if (tournament.playoffBracket?.length) {
            return tournament.playoffBracket.every(row => tournamentMatches.some(m => m.id === row.id && !!resolveCompletedWinner(m, row.homeTeamId, row.awayTeamId)))
        }
        const ids = [...new Set(tournament.teamIds)]
        if (ids.length < 2) return false
        return ids.every((home, index) => ids.slice(index + 1).every(away => tournamentMatches.some(m =>
            !!resolveCompletedWinner(m) && ((m.homeTeamId === home && m.awayTeamId === away) || (m.homeTeamId === away && m.awayTeamId === home)))))
    }

    if (tournament.playoffBracket && tournament.playoffBracket.length > 0) {
        if (tournament.playoffBracket.some(m => /3rd|third/i.test(m.stage)
            && (!m.isCompleted || !tournamentMatches.some(record => record.id === m.id && !!resolveCompletedWinner(record, m.homeTeamId, m.awayTeamId))))) return false
        const terminalMatch = tournament.playoffBracket
            .filter(m => isTerminalBracketStage(m.stage))
            .sort((a, b) => (b.week || 0) - (a.week || 0))[0]

        if (!terminalMatch || !terminalMatch.isCompleted || !terminalMatch.winnerId) {
            return false
        }
        return tournamentMatches.some(m => m.id === terminalMatch.id
            && resolveCompletedWinner(m, terminalMatch.homeTeamId, terminalMatch.awayTeamId) === terminalMatch.winnerId)
    }

    const finalByStage = tournamentMatches
        .filter(m => m.stage && isTerminalBracketStage(m.stage))
        .sort((a, b) => (b.week || 0) - (a.week || 0))[0]
    return !!finalByStage && !!resolveCompletedWinner(finalByStage)
}

/** Champion is derived from the final result; cumulative bracket wins do not decide it. */
export function terminalTournamentWinner(save: GameSave, tournament: TournamentSaveData): string | undefined {
    if (!hasTerminalTournamentCompletion(save, tournament)) return undefined
    if (tournament.format === 'league') return tournament.standings[0]?.teamId
    const terminal = save.completedMatches.filter(m => m.tournamentId === tournament.id && m.stage && isTerminalBracketStage(m.stage))
        .sort((a, b) => b.week - a.week || b.id.localeCompare(a.id))[0]
    if (terminal) return resolveCompletedWinner(terminal)
    const bracket = tournament.playoffBracket?.filter(m => isTerminalBracketStage(m.stage) && m.isCompleted)
        .sort((a, b) => b.week - a.week || b.id.localeCompare(a.id))[0]
    const record = save.completedMatches.find(m => m.id === bracket?.id && m.tournamentId === tournament.id)
    return record ? resolveCompletedWinner(record, bracket?.homeTeamId, bracket?.awayTeamId) : undefined
}
