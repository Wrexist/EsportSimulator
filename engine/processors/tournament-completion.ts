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

import type { GameSave, TournamentSaveData } from "../save-types"

/**
 * Is this bracket-match stage the terminal (championship) stage?
 *
 * Recognizes "grand final" (double-elim), "final", and "finals" — case
 * insensitive — so AI-set stage strings from different generators all
 * resolve correctly.
 */
export function isTerminalBracketStage(stage: string): boolean {
    const normalized = stage.toLowerCase()
    return normalized.includes("grand final")
        || normalized === "final"
        || normalized === "finals"
}

/**
 * Has the tournament reached a legitimate terminal state we can award on?
 *
 * Three paths:
 *   1. Playoff bracket present → require the latest terminal-stage match
 *      to be completed *and* present in the save's completedMatches.
 *   2. Format "league" → require zero pending matches whose week ≤ now,
 *      and at least one match already played.
 *   3. Otherwise → fall back to whether any completed match carries a
 *      terminal-stage label with a winnerId.
 *
 * Returning false here protects awardPrizes/closeTournament from firing
 * prematurely on partial tournament progressions.
 */
export function hasTerminalTournamentCompletion(save: GameSave, tournament: TournamentSaveData): boolean {
    const tournamentMatches = save.completedMatches.filter(m => m.tournamentId === tournament.id)
    if (tournamentMatches.length === 0) return false

    if (tournament.playoffBracket && tournament.playoffBracket.length > 0) {
        const terminalMatch = tournament.playoffBracket
            .filter(m => isTerminalBracketStage(m.stage))
            .sort((a, b) => (b.week || 0) - (a.week || 0))[0]

        if (!terminalMatch || !terminalMatch.isCompleted || !terminalMatch.winnerId) {
            return false
        }
        return tournamentMatches.some(m => m.id === terminalMatch.id)
    }

    if (tournament.format === "league") {
        const pending = save.scheduledMatches.some(
            m => m.tournamentId === tournament.id && m.week <= save.currentWeek
        )
        if (pending) return false
        return tournamentMatches.length > 0
    }

    const finalByStage = tournamentMatches
        .filter(m => m.stage && isTerminalBracketStage(m.stage))
        .sort((a, b) => (b.week || 0) - (a.week || 0))[0]
    return !!finalByStage?.result?.winnerId
}
