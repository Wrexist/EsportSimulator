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

import { buildSaveSnapshot } from "@/store/utils/build-save-snapshot"

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
    }
}

describe("buildSaveSnapshot — stateful optional fields survive the builder", () => {
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
