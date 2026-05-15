/**
 * Coverage for engine/processors/tournament-state-cleanup.ts.
 *
 * Pins the stale-future-tournament-state cleanup extracted in Phase M4
 * from atomic-week-processor.ts. Runs at the start of every weekly
 * tournament processing pass to clear phantom state on tournaments
 * scheduled for a future week that already have populated
 * teams / standings / brackets from legacy snapshot seeding.
 */

import { resetStaleTournamentState } from "@/engine/processors/tournament-state-cleanup"
import type { GameSave, TournamentSaveData } from "@/engine/save-types"

function makeTournament(overrides: Partial<TournamentSaveData> = {}): TournamentSaveData {
    return {
        id: "t1", name: "Test", shortName: "T", tier: "A_TIER",
        region: "GLOBAL", format: "Bracket",
        teamIds: [], standings: [],
        prizePool: 0, startWeek: 1, duration: 1, endWeek: 2,
        currentStage: "Registration",
        ...overrides,
    } as TournamentSaveData
}

function makeSave(currentWeek: number, tournaments: TournamentSaveData[]): GameSave {
    return {
        saveVersion: 6, saveId: "test", saveName: "test",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        currentWeek, currentDay: 6, timeMode: "WEEKLY",
        gameStartDate: new Date().toISOString(),
        managerDetails: {} as any,
        lastRngSeed: 1, playerTeamId: "p",
        teams: [], players: [], contracts: [], staff: [],
        tournaments, scheduledMatches: [], completedMatches: [],
        scheduledActivities: [], financeLedger: [], eventsLog: [], newsFeed: [],
        acknowledgedEventIds: [], hallOfFame: [], legendaryPlayers: [],
        weekTickState: null,
    } as unknown as GameSave
}

describe("resetStaleTournamentState", () => {
    test("future tournament with premature teams gets reset", () => {
        const t = makeTournament({
            startWeek: 20,
            teamIds: ["a", "b", "c"],
            currentStage: "Quarterfinals",
            isCompleted: true,
            winnerId: "a",
        })
        const save = makeSave(10, [t])

        resetStaleTournamentState(save)

        expect(t.teamIds).toEqual([])
        expect(t.standings).toEqual([])
        expect(t.playoffBracket).toEqual([])
        expect(t.currentStage).toBe("Registration")
        expect(t.isCompleted).toBe(false)
        expect(t.winnerId).toBeUndefined()
        expect(t.rewardsGranted).toBe(false)
    })

    test("future tournament with no premature state stays untouched", () => {
        const t = makeTournament({
            startWeek: 20,
            currentStage: "Registration",
            teamIds: [],
            standings: [],
        })
        const save = makeSave(10, [t])

        // Capture a sentinel field that wouldn't be touched even if reset fired.
        ;(t as any).__sentinel = "preserved"

        resetStaleTournamentState(save)

        expect((t as any).__sentinel).toBe("preserved")
        expect(t.currentStage).toBe("Registration")
    })

    test("current-week tournament is NOT reset (startWeek === currentWeek)", () => {
        const t = makeTournament({
            startWeek: 10, // exactly current
            teamIds: ["a", "b"],
            currentStage: "Group Stage",
        })
        const save = makeSave(10, [t])

        resetStaleTournamentState(save)

        // No mutation — startWeek > currentWeek is the gate, not >=
        expect(t.teamIds).toEqual(["a", "b"])
        expect(t.currentStage).toBe("Group Stage")
    })

    test("past tournament with state is NOT reset (results are real)", () => {
        const t = makeTournament({
            startWeek: 5, // in the past
            teamIds: ["a", "b"],
            currentStage: "Final",
            isCompleted: true,
            winnerId: "a",
            rewardsGranted: true,
        })
        const save = makeSave(10, [t])

        resetStaleTournamentState(save)

        expect(t.teamIds).toEqual(["a", "b"])
        expect(t.isCompleted).toBe(true)
        expect(t.winnerId).toBe("a")
        expect(t.rewardsGranted).toBe(true)
    })

    test("future tournament with premature standings (but empty teamIds) gets reset", () => {
        const t = makeTournament({
            startWeek: 20,
            teamIds: [],
            standings: [{ teamId: "a", wins: 3, losses: 0 } as any],
        })
        const save = makeSave(10, [t])

        resetStaleTournamentState(save)

        expect(t.standings).toEqual([])
    })

    test("future tournament with premature playoffBracket gets reset", () => {
        const t = makeTournament({
            startWeek: 20,
            teamIds: [],
            standings: [],
            playoffBracket: [{ id: "m1" } as any, { id: "m2" } as any],
        })
        const save = makeSave(10, [t])

        resetStaleTournamentState(save)

        expect(t.playoffBracket).toEqual([])
    })

    test("multiple tournaments: only future + stale ones are reset", () => {
        const past = makeTournament({ id: "past", startWeek: 5, isCompleted: true, winnerId: "a", teamIds: ["a"] })
        const current = makeTournament({ id: "current", startWeek: 10, teamIds: ["b", "c"] })
        const futureStale = makeTournament({ id: "future_stale", startWeek: 30, teamIds: ["d"] })
        const futureClean = makeTournament({ id: "future_clean", startWeek: 30, teamIds: [] })
        const save = makeSave(10, [past, current, futureStale, futureClean])

        resetStaleTournamentState(save)

        expect(past.isCompleted).toBe(true)
        expect(current.teamIds).toEqual(["b", "c"])
        expect(futureStale.teamIds).toEqual([])
        expect(futureClean.teamIds).toEqual([])
    })
})
