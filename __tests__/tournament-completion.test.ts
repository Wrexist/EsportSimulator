/**
 * Tests for tournament-completion detection.
 *
 * Two exported functions — both pure — that gate whether awardPrizes
 * and closeTournament are allowed to fire. A false positive here means
 * trophies awarded mid-tournament; a false negative means a finished
 * tournament hangs unresolved forever. Both are visible bugs in the
 * trophy / leaderboard UI.
 */

import {
    isTerminalBracketStage,
    hasTerminalTournamentCompletion,
} from "@/engine/processors/tournament-completion"
import type {
    GameSave, TournamentSaveData, CompletedMatchSaveData, MatchSaveData,
} from "@/engine/save-types"

function makeTournament(overrides: Partial<TournamentSaveData> = {}): TournamentSaveData {
    return {
        id: "t1",
        name: "Test Tour",
        format: "playoff",
        tier: "B_TIER",
        startWeek: 1,
        teamIds: [],
        standings: [],
        playoffBracket: [],
        isCompleted: false,
        seriesId: "test",
        seasonNumber: 1,
        instanceId: "t1",
        currentStage: "Group Stage",
        rewardsGranted: false,
        ...overrides,
    } as unknown as TournamentSaveData
}

function makeSave(overrides: Partial<GameSave> = {}): GameSave {
    return {
        currentWeek: 10,
        playerTeamId: "player",
        teams: [],
        players: [],
        contracts: [],
        staff: [],
        marketStaff: [],
        academyPlayers: [],
        scheduledMatches: [],
        completedMatches: [],
        scheduledActivities: [],
        financeLedger: [],
        eventsLog: [],
        newsFeed: [],
        tournaments: [],
        tournamentQualifications: [],
        lastRngSeed: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    } as unknown as GameSave
}

describe("isTerminalBracketStage", () => {
    test.each([
        "Grand Final",
        "grand final",
        "GRAND FINAL",
        "Final",
        "final",
        "Finals",
        "Upper Bracket Grand Final", // contains 'grand final'
    ])("'%s' is a terminal stage", (stage) => {
        expect(isTerminalBracketStage(stage)).toBe(true)
    })

    test.each([
        "Semifinal", "Quarterfinal", "Group Stage",
        "Round 1", "Lower Bracket Round 1",
    ])("'%s' is NOT a terminal stage", (stage) => {
        expect(isTerminalBracketStage(stage)).toBe(false)
    })
})

describe("hasTerminalTournamentCompletion — playoff bracket path", () => {
    test("returns false when no completed matches exist for this tournament", () => {
        const save = makeSave()
        const tournament = makeTournament({
            playoffBracket: [
                {
                    id: "m_final", stage: "Grand Final", isCompleted: true,
                    winnerId: "t1", week: 10,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any,
            ],
        })
        expect(hasTerminalTournamentCompletion(save, tournament)).toBe(false)
    })

    test("returns true when the latest grand final is completed AND in completedMatches", () => {
        const finalMatch = {
            id: "m_final", tournamentId: "t1", stage: "Grand Final",
            homeTeamId: "t1", awayTeamId: "t2", week: 10,
            result: { homeScore: 16, awayScore: 8, maps: [], winnerId: "t1" },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any as CompletedMatchSaveData
        const save = makeSave({ completedMatches: [finalMatch] })
        const tournament = makeTournament({
            playoffBracket: [
                {
                    id: "m_final", stage: "Grand Final", isCompleted: true,
                    winnerId: "t1", week: 10,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any,
            ],
        })
        expect(hasTerminalTournamentCompletion(save, tournament)).toBe(true)
    })

    test("returns false when grand final exists in bracket but has no winnerId", () => {
        const finalMatch = {
            id: "m_final", tournamentId: "t1", stage: "Grand Final",
            homeTeamId: "t1", awayTeamId: "t2", week: 10,
            result: { homeScore: 0, awayScore: 0, maps: [] },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any as CompletedMatchSaveData
        const save = makeSave({ completedMatches: [finalMatch] })
        const tournament = makeTournament({
            playoffBracket: [
                {
                    id: "m_final", stage: "Grand Final", isCompleted: false,
                    week: 10,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any,
            ],
        })
        expect(hasTerminalTournamentCompletion(save, tournament)).toBe(false)
    })

    test("returns false when grand final bracket exists but the actual match isn't in completedMatches", () => {
        // Some OTHER match landed in completedMatches but the final is still scheduled.
        const otherMatch = {
            id: "m_sf", tournamentId: "t1", stage: "Semifinal", week: 9,
            homeTeamId: "t1", awayTeamId: "t3",
            result: { homeScore: 16, awayScore: 8, maps: [], winnerId: "t1" },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any as CompletedMatchSaveData
        const save = makeSave({ completedMatches: [otherMatch] })
        const tournament = makeTournament({
            playoffBracket: [
                {
                    id: "m_final", stage: "Grand Final", isCompleted: true,
                    winnerId: "t1", week: 10,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any,
            ],
        })
        // Bracket says complete, but the actual final match isn't recorded yet.
        expect(hasTerminalTournamentCompletion(save, tournament)).toBe(false)
    })

    test("picks the LATEST terminal stage when multiple exist (double-elim)", () => {
        const finals = [
            {
                id: "m_final_upper", tournamentId: "t1", stage: "Upper Bracket Grand Final",
                week: 9, homeTeamId: "t1", awayTeamId: "t2",
                result: { homeScore: 16, awayScore: 8, maps: [], winnerId: "t1" },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any as CompletedMatchSaveData,
            {
                id: "m_final_real", tournamentId: "t1", stage: "Grand Final",
                week: 10, homeTeamId: "t1", awayTeamId: "t3",
                result: { homeScore: 16, awayScore: 12, maps: [], winnerId: "t1" },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any as CompletedMatchSaveData,
        ]
        const save = makeSave({ completedMatches: finals })
        const tournament = makeTournament({
            playoffBracket: [
                // Latest by week is the real grand final at week 10.
                {
                    id: "m_final_upper", stage: "Upper Bracket Grand Final", isCompleted: true,
                    winnerId: "t1", week: 9,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any,
                {
                    id: "m_final_real", stage: "Grand Final", isCompleted: true,
                    winnerId: "t1", week: 10,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any,
            ],
        })
        expect(hasTerminalTournamentCompletion(save, tournament)).toBe(true)
    })
})

describe("hasTerminalTournamentCompletion — league format path", () => {
    test("returns false when scheduled matches with week ≤ now are still pending", () => {
        const save = makeSave({
            currentWeek: 10,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            completedMatches: [{ id: "c1", tournamentId: "t1", week: 5 } as any as CompletedMatchSaveData],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            scheduledMatches: [{ id: "s1", tournamentId: "t1", week: 8 } as any as MatchSaveData],
        })
        const tournament = makeTournament({ format: "league" })
        expect(hasTerminalTournamentCompletion(save, tournament)).toBe(false)
    })

    test("returns true when zero scheduled matches remain AND at least one is completed", () => {
        const save = makeSave({
            currentWeek: 10,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            completedMatches: [{ id: "c1", tournamentId: "t1", week: 5 } as any as CompletedMatchSaveData],
            scheduledMatches: [],
        })
        const tournament = makeTournament({ format: "league" })
        expect(hasTerminalTournamentCompletion(save, tournament)).toBe(true)
    })

    test("a still-scheduled FUTURE-week match blocks completion (whole season must finish)", () => {
        // A round-robin schedules every match up front, so a remaining
        // future-week match means later rounds haven't been played yet. The
        // league must NOT complete (and award the title) early.
        const save = makeSave({
            currentWeek: 10,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            completedMatches: [{ id: "c1", tournamentId: "t1", week: 5 } as any as CompletedMatchSaveData],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            scheduledMatches: [{ id: "s1", tournamentId: "t1", week: 15 } as any as MatchSaveData],
        })
        const tournament = makeTournament({ format: "league" })
        expect(hasTerminalTournamentCompletion(save, tournament)).toBe(false)
    })

    test("a populated playoffBracket (as setupLeagueSchedule produces) does NOT block league completion", () => {
        // Regression for the dead-branch bug: leagues store every "League Match"
        // in playoffBracket, which previously routed them into the bracket path
        // (no terminal "final" → never completes). The league path must win.
        const save = makeSave({
            currentWeek: 20,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            completedMatches: [{ id: "c1", tournamentId: "t1", week: 5 } as any as CompletedMatchSaveData],
            scheduledMatches: [],
        })
        const tournament = makeTournament({
            format: "league",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            playoffBracket: [{ id: "b1", stage: "League Match", isCompleted: true, winnerId: "t1" } as any],
        })
        expect(hasTerminalTournamentCompletion(save, tournament)).toBe(true)
    })
})

describe("hasTerminalTournamentCompletion — fallback path (no bracket, non-league)", () => {
    test("returns true when any completed match carries a terminal stage with a winner", () => {
        const save = makeSave({
            completedMatches: [{
                id: "m1", tournamentId: "t1", stage: "Grand Final", week: 10,
                homeTeamId: "t1", awayTeamId: "t2",
                result: { homeScore: 16, awayScore: 8, maps: [], winnerId: "t1" },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any as CompletedMatchSaveData],
        })
        // Empty bracket + non-league format triggers the fallback branch.
        const tournament = makeTournament({ playoffBracket: [], format: "swiss" })
        expect(hasTerminalTournamentCompletion(save, tournament)).toBe(true)
    })

    test("returns false in fallback if no terminal-stage match exists", () => {
        const save = makeSave({
            completedMatches: [{
                id: "m1", tournamentId: "t1", stage: "Semifinal", week: 10,
                homeTeamId: "t1", awayTeamId: "t2",
                result: { homeScore: 16, awayScore: 8, maps: [], winnerId: "t1" },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any as CompletedMatchSaveData],
        })
        const tournament = makeTournament({ playoffBracket: [], format: "swiss" })
        expect(hasTerminalTournamentCompletion(save, tournament)).toBe(false)
    })
})
