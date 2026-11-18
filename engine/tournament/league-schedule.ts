/**
 * Round-robin (league) schedule generator.
 *
 * Uses the standard "circle method" round-robin algorithm:
 *   1. If team count is odd, pad with a BYE.
 *   2. For each of (n-1) rounds, pair index i with index (n-1-i).
 *   3. After each round, rotate: take the last element and insert it
 *      at index 1, keeping index 0 fixed. This generates every pairing
 *      exactly once.
 *   4. BYE pairings are dropped (the team that would have played the
 *      BYE just skips that round).
 *
 * Match weeks are linearly distributed across the tournament's listed
 * duration (start .. endWeek), so a league ends inside the window the
 * calendar shows (COMP-10): a long league packs a few rounds into a week,
 * each on its own day (Tue/Thu/Sat/Sun), in round order.
 *
 * Extracted from tournament-manager.ts.
 */

import type { GameSave, TournamentSaveData, BracketMatchSaveData } from "../save-types"
import type { SeededRNG } from "../rng"
import {
    addBracketMatch,
    scheduleBracketMatch,
} from "./bracket-scheduling"

const BYE_MARKER = "BYE"
const MIN_DURATION_WEEKS = 1

export function setupLeagueSchedule(
    save: GameSave,
    tournament: TournamentSaveData,
    teamIds: string[],
    rng: SeededRNG,
): void {
    const teams = [...teamIds]
    if (teams.length % 2 !== 0) {
        teams.push(BYE_MARKER)
    }

    const numTeams = teams.length
    const numRounds = numTeams - 1
    const matchesPerRound = numTeams / 2
    const startWeek = tournament.startWeek
    const duration = Math.max(MIN_DURATION_WEEKS, tournament.endWeek - tournament.startWeek)

    // Round-robin via the circle method.
    const rounds: Array<Array<{ home: string; away: string }>> = []
    for (let round = 0; round < numRounds; round++) {
        const roundMatches: Array<{ home: string; away: string }> = []

        for (let i = 0; i < matchesPerRound; i++) {
            const home = teams[i]
            const away = teams[numTeams - 1 - i]
            if (home !== BYE_MARKER && away !== BYE_MARKER) {
                roundMatches.push({ home, away })
            }
        }
        rounds.push(roundMatches)

        // Rotate: keep index 0 fixed, move last to index 1, shift rest up.
        // [A, B, C, D, E, F] → [A, F, B, C, D, E]
        teams.splice(1, 0, teams.pop()!)
    }

    // Rounds are spread over the listed window (COMP-10: one round a week used
    // to stretch a 23-round "6 wk event" over 23 weeks). Each round-robin
    // round has every team play once, so the rounds that share a week go on
    // different days, in round order.
    const weekOffsetOf = (roundIndex: number) => Math.floor((roundIndex / numRounds) * duration)
    const roundsInWeek = new Map<number, number>()
    for (let r = 0; r < numRounds; r++) roundsInWeek.set(weekOffsetOf(r), (roundsInWeek.get(weekOffsetOf(r)) ?? 0) + 1)
    const slotInWeek = new Map<number, number>()

    let currentMatchIndex = 0
    rounds.forEach((roundMatches, roundIndex) => {
        const weekOffset = weekOffsetOf(roundIndex)
        const matchWeek = startWeek + weekOffset
        const slot = slotInWeek.get(weekOffset) ?? 0
        slotInWeek.set(weekOffset, slot + 1)
        const preferredDays = leagueRoundDays(roundsInWeek.get(weekOffset) ?? 1, slot)

        roundMatches.forEach(m => {
            const match: BracketMatchSaveData = {
                id: `${tournament.id}_league_${currentMatchIndex++}`,
                tournamentId: tournament.id,
                stage: "League Match",
                homeTeamId: m.home,
                awayTeamId: m.away,
                isCompleted: false,
                week: matchWeek,
                format: "BO1",
                seed: rng.int(0, 999999),
                sourceMatchIds: [],
            }

            addBracketMatch(tournament, match)
            scheduleBracketMatch(save, match, preferredDays)
        })
    })
}

/** Days the rounds of one week start from: Tue/Thu/Sat/Sun, spread evenly when there are more. */
const LEAGUE_ROUND_DAYS: Record<number, number[]> = { 2: [2, 5], 3: [1, 3, 5], 4: [1, 3, 5, 6] }

/**
 * Day preference (0 = Mon … 6 = Sun) for the `slot`-th of `count` league
 * rounds in one week: its own day first, then the days after it, then the
 * days before (a club with another match that day moves on, not back). A
 * single round a week keeps the usual weekend-first order.
 */
export function leagueRoundDays(count: number, slot: number): number[] | undefined {
    if (count <= 1) return undefined
    const anchor = LEAGUE_ROUND_DAYS[count]?.[slot] ?? Math.min(6, Math.round((slot * 6) / (count - 1)))
    const days = [anchor]
    for (let d = anchor + 1; d <= 6; d++) days.push(d)
    for (let d = anchor - 1; d >= 0; d--) days.push(d)
    return days
}
