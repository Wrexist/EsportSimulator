/**
 * Guards CLAUDE.md invariant #1 / the LEARNINGS save-builder trap:
 *
 *   `buildSaveSnapshot` (and the saveGame action) enumerate every GameSave
 *   field by hand. Load/result paths spread wholesale, so a *stateful* optional
 *   field that isn't listed in the builder round-trips everywhere EXCEPT saving
 *   — silently. `boardState` (accumulated confidence) hit exactly this.
 *
 * If you add a stateful optional field and forget the builder, the matching
 * assertion here fails. Derived fields (e.g. careerStats, rebuilt from match
 * history) are intentionally NOT required to survive and aren't asserted.
 */

import { buildSaveSnapshot, type SaveSnapshotState } from "@/store/utils/build-save-snapshot"
import { createDefaultTactics } from "@/engine/default-tactics"
import { runMigrationLadder } from "@/engine/save-migrations"

// Minimal store-state stand-in. buildSaveSnapshot defaults most arrays, so we
// only set what the assertions read plus the fields under test.
function makeState(over: Record<string, unknown> = {}) {
    return {
        saveVersion: 6,
        saveId: "save_test",
        saveName: "Test",
        gameStartDate: "2026-01-01T00:00:00.000Z",
        currentWeek: 40,
        currentDay: 1,
        timeMode: "WEEKLY",
        playerTeamId: "player",
        managerDetails: { name: "C", level: 3, xp: 100, reputation: 55, careerWins: 9, careerLosses: 4, championships: 1 },
        teams: [{ id: "player", name: "My Club" }],
        players: [],
        contracts: [],
        tournaments: [],
        staff: [],
        scheduledMatches: [],
        completedMatches: [],
        financeLedger: [],
        eventsLog: [],
        acknowledgedEventIds: [],
        lastRngSeed: 12345,
        ...over,
    } as unknown as SaveSnapshotState
}

describe("buildSaveSnapshot — stateful optional fields survive the builder", () => {
    test("custom loadouts and a mid-match checkpoint survive JSON and old careers receive isolated defaults", () => {
        const customTactics = createDefaultTactics()
        customTactics.FULL.ct.primaryWeaponId = "test-custom"
        const activeMatchState = { matchId: "match-1", timeoutsRemaining: 0, simState: { currentRound: 12 } }
        const snapshot = JSON.parse(JSON.stringify(buildSaveSnapshot(makeState({ customTactics, activeMatchId: "match-1", activeMatchState }))))
        expect(snapshot.customTactics.FULL.ct.primaryWeaponId).toBe("test-custom")
        expect(snapshot.activeMatchState).toEqual(activeMatchState)
        expect(snapshot.activeMatchId).toBe("match-1")
        for (let version = 0; version <= 7; version++) {
            const migrated = runMigrationLadder({ ...buildSaveSnapshot(makeState()), saveVersion: version })
            expect(migrated.customTactics).toEqual(createDefaultTactics())
            expect(migrated.activeMatchState).toBeNull()
            expect(migrated.activeMatchId).toBeNull()
            expect(migrated.customTactics).not.toBe(customTactics)
        }
    })
    test("boardState round-trips intact (accumulated confidence must not be dropped)", () => {
        const boardState = {
            teamId: "player",
            confidence: 38,
            seasonExpectation: "CONTEND" as const,
            expectationSetSeason: 2,
            lastReviewedSeason: 1,
            onNotice: true,
        }
        const snap = buildSaveSnapshot(makeState({ boardState }))
        expect(snap.boardState).toEqual(boardState)
    })

    test("fplData round-trips (the sibling stateful field / the pattern to mirror)", () => {
        const fplData = { season: 2, gameweek: 5 } as unknown as never
        const snap = buildSaveSnapshot(makeState({ fplData }))
        expect(snap.fplData).toBe(fplData)
    })

    test("absent board state stays undefined (no fabricated default at the boundary)", () => {
        const snap = buildSaveSnapshot(makeState())
        expect(snap.boardState).toBeUndefined()
    })

    test("reconciled builder fields survive (careerStats / difficulty / nextMarketRefreshWeek)", () => {
        const careerStats = { seasons: [{ seasonNumber: 1 }], totalWins: 12 } as unknown as never
        const snap = buildSaveSnapshot(makeState({
            careerStats, difficulty: "hard", nextMarketRefreshWeek: 17,
        }))
        expect(snap.careerStats).toBe(careerStats)
        expect(snap.difficulty).toBe("hard")
        expect(snap.nextMarketRefreshWeek).toBe(17)
        expect(typeof snap.lastPlayedAt).toBe("string")
    })

    test("game-over reason + week persist through the builder", () => {
        const snap = buildSaveSnapshot(makeState({ gameOverReason: "SACKED", gameOverWeek: 104 }))
        expect(snap.gameOverReason).toBe("SACKED")
        expect(snap.gameOverWeek).toBe(104)
    })
})


test("the committed tick and zero RNG state survive a fresh snapshot, while transient fields do not", () => {
    const state = makeState({ lastCommittedWeekTick: 39, lastRngSeed: 0, isLoading: true, error: "temporary" })
    const snapshot = JSON.parse(JSON.stringify(buildSaveSnapshot(state)))
    expect(snapshot.lastCommittedWeekTick).toBe(39)
    expect(snapshot.lastRngSeed).toBe(0)
    expect(snapshot).not.toHaveProperty("isLoading")
    expect(snapshot).not.toHaveProperty("error")
})


test("L15 finance and activity receipts survive canonical save, migration and career replacement", () => {
    const financeSettlement = { week: 40, income: 30000, expenses: 18000 }
    const state = makeState({ teams: [{ id: "player", name: "My Club", financeSettlement, weeklyActivityWeek: 40 }] })
    const disk = JSON.parse(JSON.stringify(buildSaveSnapshot(state)))
    const restored = runMigrationLadder(disk)
    expect(restored.teams[0].financeSettlement).toEqual(financeSettlement)
    expect(restored.teams[0].weeklyActivityWeek).toBe(40)
    const newCareer = buildSaveSnapshot(makeState())
    expect(newCareer.teams[0].financeSettlement).toBeUndefined()
    expect(newCareer.teams[0].weeklyActivityWeek).toBeUndefined()
})
