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

    // Linearly distribute rounds across the duration window so a short
    // tournament packs multiple rounds per week and a long one spreads them.
    let currentMatchIndex = 0
    rounds.forEach((roundMatches, roundIndex) => {
        const weekOffset = Math.floor((roundIndex / numRounds) * duration)
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
