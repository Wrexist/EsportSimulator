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
 * Match weeks are linearly distributed across the tournament's
 * duration so longer leagues spread evenly and short ones pack
 * multiple rounds per week.
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

    // Each round-robin round has every team play exactly once, so placing ONE
    // round per week means no team is ever double-booked in a week. We do that
    // whenever all rounds fit inside the tournament's own season (so the league
    // can't overrun into the next season's instance); otherwise we fall back to
    // the even-compression layout (which packs multiple rounds per week — a team
    // can get several BO1s in one week, but at least nothing overruns).
    const seasonEnd = (Math.floor((startWeek - 1) / 52) + 1) * 52
    const canSpread = startWeek + (numRounds - 1) <= seasonEnd
    if (canSpread && numRounds > 0) {
        // Extend the window so completion/standings span all the spread rounds.
        tournament.endWeek = Math.max(tournament.endWeek, startWeek + (numRounds - 1))
    }

    let currentMatchIndex = 0
    rounds.forEach((roundMatches, roundIndex) => {
        const weekOffset = canSpread
            ? roundIndex
            : Math.floor((roundIndex / numRounds) * duration)
        const matchWeek = startWeek + weekOffset

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
            scheduleBracketMatch(save, match)
        })
    })
}
