/**
 * Regression coverage for the tournament module extractions (Phases D3 + D4).
 *
 * setupLeagueSchedule (D4 — round-robin via the circle method)
 * setupSwissStage     (D3 — Swiss bucketing + round 1 generation)
 *
 * These functions used to live inside tournament-manager.ts and were never
 * directly tested. Extracting them was a win for readability — but it also
 * means a regression to either is silent (the only place that catches it
 * is the playoff bracket eventually getting stuck a few weeks later in a
 * live game). These tests pin the contract.
 */

import { setupLeagueSchedule } from "@/engine/tournament/league-schedule"
import { setupSwissStage, generateSwissRound } from "@/engine/tournament/swiss-handlers"
import { SeededRNG } from "@/engine/rng"
import type { GameSave, TournamentSaveData } from "@/engine/save-types"

function makeMinimalSave(): GameSave {
    return {
        saveVersion: 6,
        saveId: "test",
        saveName: "test",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        currentWeek: 1,
        currentDay: 0,
        timeMode: "WEEKLY",
        gameStartDate: new Date().toISOString(),
        managerDetails: {} as any,
        lastRngSeed: 1,
        playerTeamId: "team_0",
        teams: [],
        players: [],
        contracts: [],
        tournaments: [],
        staff: [],
        scheduledMatches: [],
        completedMatches: [],
        scheduledActivities: [],
        financeLedger: [],
        eventsLog: [],
        acknowledgedEventIds: [],
        hallOfFame: [],
        legendaryPlayers: [],
        weekTickState: null,
    } as unknown as GameSave
}

function makeTournament(overrides: Partial<TournamentSaveData> = {}): TournamentSaveData {
    return {
        id: "t_test",
        name: "Test Cup",
        shortName: "TC",
        tier: "A_TIER",
        region: "GLOBAL",
        teamIds: [],
        format: "League",
        currentStage: "League",
        standings: [],
        prizePool: 0,
        startWeek: 10,
        duration: 6,
        endWeek: 16,
        ...overrides,
    }
}

describe("setupLeagueSchedule (round-robin)", () => {
    test("6 teams: every team plays every other team exactly once", () => {
        const save = makeMinimalSave()
        const tournament = makeTournament()
        const teamIds = ["A", "B", "C", "D", "E", "F"]

        setupLeagueSchedule(save, tournament, teamIds, new SeededRNG(42))

        const matches = tournament.playoffBracket ?? []
        // n*(n-1)/2 unique pairings = 15
        expect(matches.length).toBe(15)

        // Every pair appears exactly once, regardless of home/away order.
        const pairSet = new Set<string>()
        for (const m of matches) {
            const pair = [m.homeTeamId!, m.awayTeamId!].sort().join(":")
            expect(pairSet.has(pair)).toBe(false)
            pairSet.add(pair)
        }
        expect(pairSet.size).toBe(15)

        // No team plays itself.
        for (const m of matches) {
            expect(m.homeTeamId).not.toBe(m.awayTeamId)
        }
    })

    test("5 teams (odd): one BYE per round means 4 fewer matches than the even count", () => {
        const save = makeMinimalSave()
        const tournament = makeTournament()
        const teamIds = ["A", "B", "C", "D", "E"]

        setupLeagueSchedule(save, tournament, teamIds, new SeededRNG(7))

        const matches = tournament.playoffBracket ?? []
        // n*(n-1)/2 = 10 pairings — same as a full round-robin since the BYE
        // just thins each round, never the total set of pairings.
        expect(matches.length).toBe(10)
        // No team listed against BYE_MARKER survives into a real match.
        for (const m of matches) {
            expect(m.homeTeamId).not.toBe("BYE")
            expect(m.awayTeamId).not.toBe("BYE")
        }
    })

    test("match weeks span the tournament window (start <= week <= end)", () => {
        const save = makeMinimalSave()
        const tournament = makeTournament({ startWeek: 10, endWeek: 16 })

        setupLeagueSchedule(save, tournament, ["A", "B", "C", "D"], new SeededRNG(1))

        const matches = tournament.playoffBracket ?? []
        for (const m of matches) {
            expect(m.week).toBeGreaterThanOrEqual(10)
            // weekOffset is floor((i / numRounds) * duration), so the
            // top of the range is duration-1 above start.
            expect(m.week).toBeLessThan(16)
        }
    })

    test("schedules into save.scheduledMatches (not just the bracket)", () => {
        const save = makeMinimalSave()
        const tournament = makeTournament()

        setupLeagueSchedule(save, tournament, ["A", "B", "C", "D"], new SeededRNG(1))

        expect(save.scheduledMatches.length).toBeGreaterThan(0)
        // Every scheduled match should reference the tournament.
        for (const m of save.scheduledMatches) {
            expect(m.tournamentId).toBe(tournament.id)
        }
    })
})

describe("setupSwissStage", () => {
    test("initialises per-team standings at zero and generates round-1 pairings", () => {
        const save = makeMinimalSave()
        const tournament = makeTournament({ format: "Swiss", currentStage: "Swiss" })
        const teamIds = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"]

        setupSwissStage(save, tournament, teamIds, new SeededRNG(123))

        // Standings: one row per team, all stats zero.
        expect(tournament.standings.length).toBe(8)
        for (const s of tournament.standings) {
            expect(s.wins).toBe(0)
            expect(s.losses).toBe(0)
            expect(s.matchesPlayed).toBe(0)
            expect(s.mapDiff).toBe(0)
        }

        // Round 1: 8 teams in the 0-0 bucket → 4 matches.
        const r1 = (tournament.playoffBracket ?? []).filter(m => m.id.includes("_swiss_r1_"))
        expect(r1.length).toBe(4)
        // Round-1 stage label uses the "0-0" bucket key.
        for (const m of r1) {
            expect(m.stage).toContain("0-0")
            expect(m.format).toBe("BO1")
        }
    })
})

describe("generateSwissRound bucketing", () => {
    test("only pairs teams with equal W-L records", () => {
        const save = makeMinimalSave()
        const tournament = makeTournament({ format: "Swiss", currentStage: "Swiss" })

        // 6 teams: 4 at 1-0, 2 at 0-1.
        tournament.standings = [
            { teamId: "W1", wins: 1, losses: 0, matchesPlayed: 1, mapsWon: 0, mapsLost: 0, points: 0, mapDiff: 0, roundDiff: 0 },
            { teamId: "W2", wins: 1, losses: 0, matchesPlayed: 1, mapsWon: 0, mapsLost: 0, points: 0, mapDiff: 0, roundDiff: 0 },
            { teamId: "W3", wins: 1, losses: 0, matchesPlayed: 1, mapsWon: 0, mapsLost: 0, points: 0, mapDiff: 0, roundDiff: 0 },
            { teamId: "W4", wins: 1, losses: 0, matchesPlayed: 1, mapsWon: 0, mapsLost: 0, points: 0, mapDiff: 0, roundDiff: 0 },
            { teamId: "L1", wins: 0, losses: 1, matchesPlayed: 1, mapsWon: 0, mapsLost: 0, points: 0, mapDiff: 0, roundDiff: 0 },
            { teamId: "L2", wins: 0, losses: 1, matchesPlayed: 1, mapsWon: 0, mapsLost: 0, points: 0, mapDiff: 0, roundDiff: 0 },
        ]

        generateSwissRound(save, tournament, 2, new SeededRNG(99))

        const r2 = (tournament.playoffBracket ?? []).filter(m => m.id.includes("_swiss_r2_"))
        // 4 in one bucket → 2 matches; 2 in the other → 1 match. Total = 3.
        expect(r2.length).toBe(3)

        const winSet = new Set(["W1", "W2", "W3", "W4"])
        const loseSet = new Set(["L1", "L2"])

        for (const m of r2) {
            const home = m.homeTeamId!
            const away = m.awayTeamId!
            const homeInWins = winSet.has(home)
            const awayInWins = winSet.has(away)
            const homeInLosses = loseSet.has(home)
            const awayInLosses = loseSet.has(away)
            // Either both winners or both losers — never crossed.
            expect(homeInWins && awayInWins || homeInLosses && awayInLosses).toBe(true)
        }
    })
})
