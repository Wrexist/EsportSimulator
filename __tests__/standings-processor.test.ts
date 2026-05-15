/**
 * Coverage for engine/processors/standings-processor.ts.
 *
 * updateStandings recomputes every tournament's standings from
 * completedMatches every tick. If a regression silently broke the
 * tiebreakers or the points-from-wins math, playoffs would seat the
 * wrong teams — a save-corrupting bug with no obvious symptom until
 * the bracket gets stuck. Pin the contract here.
 */

import { updateStandings } from "@/engine/processors/standings-processor"
import type { GameSave, TournamentSaveData, CompletedMatchSaveData, TournamentStandingSaveData } from "@/engine/save-types"

function makeStanding(teamId: string): TournamentStandingSaveData {
    return {
        teamId, matchesPlayed: 0, wins: 0, losses: 0,
        mapsWon: 0, mapsLost: 0, points: 0, mapDiff: 0, roundDiff: 0,
    }
}

function makeCompletedMatch(
    homeId: string, awayId: string, homeScore: number, awayScore: number,
    tournamentId = "t1", id?: string,
): CompletedMatchSaveData {
    return {
        id: id ?? `m_${homeId}_${awayId}`,
        homeTeamId: homeId,
        awayTeamId: awayId,
        tournamentId,
        stage: "Group Stage",
        week: 1,
        day: 5,
        format: "BO3",
        seed: 1,
        result: {
            homeScore, awayScore,
            winnerId: homeScore > awayScore ? homeId : awayId,
            maps: [],
        },
    } as unknown as CompletedMatchSaveData
}

function makeTournament(teamIds: string[]): TournamentSaveData {
    return {
        id: "t1",
        name: "Test League",
        shortName: "TL",
        tier: "A_TIER",
        region: "GLOBAL",
        teamIds,
        format: "League",
        currentStage: "League",
        standings: teamIds.map(makeStanding),
        prizePool: 100_000,
        startWeek: 1,
        duration: 8,
        endWeek: 9,
    } as TournamentSaveData
}

function makeSave(tournament: TournamentSaveData, matches: CompletedMatchSaveData[]): GameSave {
    return {
        saveVersion: 6,
        saveId: "test", saveName: "test",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        currentWeek: 5,
        currentDay: 6,
        timeMode: "WEEKLY",
        gameStartDate: new Date().toISOString(),
        managerDetails: {} as any,
        lastRngSeed: 1,
        playerTeamId: "team_a",
        teams: tournament.teamIds.map(id => ({ id, name: id, rosterIds: [], staffIds: [], reputation: 50, fanbase: 1000, trophies: [], facilities: [], sponsors: [], followers: 1000 })) as any,
        players: [], contracts: [], staff: [],
        tournaments: [tournament],
        scheduledMatches: [],
        completedMatches: matches,
        scheduledActivities: [],
        financeLedger: [],
        eventsLog: [],
        newsFeed: [],
        acknowledgedEventIds: [],
        hallOfFame: [],
        legendaryPlayers: [],
        weekTickState: null,
    } as unknown as GameSave
}

describe("updateStandings", () => {
    test("recomputes wins/losses/points from completed matches", () => {
        const tournament = makeTournament(["A", "B", "C", "D"])
        const matches = [
            makeCompletedMatch("A", "B", 2, 0),
            makeCompletedMatch("A", "C", 2, 1),
            makeCompletedMatch("B", "C", 0, 2),
            makeCompletedMatch("D", "A", 1, 2),
        ]
        const save = makeSave(tournament, matches)

        updateStandings(save)

        const a = tournament.standings.find(s => s.teamId === "A")!
        expect(a.matchesPlayed).toBe(3)
        expect(a.wins).toBe(3)
        expect(a.losses).toBe(0)
        expect(a.points).toBe(9)

        const b = tournament.standings.find(s => s.teamId === "B")!
        expect(b.matchesPlayed).toBe(2)
        expect(b.wins).toBe(0)
        expect(b.losses).toBe(2)
        expect(b.points).toBe(0)
    })

    test("computes map differential correctly", () => {
        const tournament = makeTournament(["A", "B"])
        const matches = [
            makeCompletedMatch("A", "B", 2, 1, "t1", "m1"),
            makeCompletedMatch("B", "A", 2, 0, "t1", "m2"),
        ]
        const save = makeSave(tournament, matches)

        updateStandings(save)

        const a = tournament.standings.find(s => s.teamId === "A")!
        expect(a.mapsWon).toBe(2)  // 2 + 0
        expect(a.mapsLost).toBe(3) // 1 + 2
        expect(a.mapDiff).toBe(-1)

        const b = tournament.standings.find(s => s.teamId === "B")!
        expect(b.mapsWon).toBe(3)
        expect(b.mapsLost).toBe(2)
        expect(b.mapDiff).toBe(1)
    })

    test("matches from other tournaments don't leak into this tournament's standings", () => {
        const tournament = makeTournament(["A", "B"])
        const matches = [
            makeCompletedMatch("A", "B", 2, 0, "t1"),
            // This match belongs to a different tournament — must be ignored.
            makeCompletedMatch("A", "B", 0, 2, "OTHER_TOURNAMENT", "other_m"),
        ]
        const save = makeSave(tournament, matches)

        updateStandings(save)

        const a = tournament.standings.find(s => s.teamId === "A")!
        expect(a.matchesPlayed).toBe(1)
        expect(a.wins).toBe(1)
    })

    test("empty completed matches leaves all standings at zero", () => {
        const tournament = makeTournament(["A", "B", "C"])
        const save = makeSave(tournament, [])

        updateStandings(save)

        for (const s of tournament.standings) {
            expect(s.matchesPlayed).toBe(0)
            expect(s.wins).toBe(0)
            expect(s.losses).toBe(0)
            expect(s.points).toBe(0)
            expect(s.mapDiff).toBe(0)
        }
    })

    test("idempotent: running twice produces the same standings", () => {
        const tournament = makeTournament(["A", "B", "C"])
        const matches = [
            makeCompletedMatch("A", "B", 2, 1),
            makeCompletedMatch("A", "C", 2, 0),
            makeCompletedMatch("B", "C", 2, 1),
        ]
        const save = makeSave(tournament, matches)

        updateStandings(save)
        const snapshot = JSON.parse(JSON.stringify(tournament.standings))
        updateStandings(save)

        expect(tournament.standings).toEqual(snapshot)
    })
})
