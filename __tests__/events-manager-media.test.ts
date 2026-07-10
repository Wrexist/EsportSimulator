/**
 * Tests for EventsManager.generateModernEvents — the media interview event.
 *
 * Regression: the interview message used to read the placeholder-like
 * "Pro has requested an interview about ...". It must now name a real outlet
 * and journalist and vary the framing, while staying seeded-deterministic.
 */

import { EventsManager } from "@/engine/events-manager"
import { SeededRNG } from "@/engine/rng"
import type { GameSave } from "@/engine/save-types"

function makeSave(overrides: Partial<GameSave> = {}): GameSave {
    return {
        currentWeek: 5,
        playerTeamId: "player",
        teams: [{
            id: "player", name: "Player Org", shortName: "PLR",
            budget: 100_000, rosterIds: [], staffIds: [],
            trophies: [], facilities: [], sponsors: [],
            fanbase: 0, followers: 0, playstyle: "default",
            reputation: 80, region: "EU", facilitiesLevel: 1,
            leagueTier: "B_TIER", elo: 1500, recentForm: [],
        }],
        players: [],
        contracts: [], staff: [], marketStaff: [],
        scheduledMatches: [], completedMatches: [], scheduledActivities: [],
        financeLedger: [], eventsLog: [], newsFeed: [],
        tournaments: [], tournamentQualifications: [],
        academyPlayers: [],
        gameStartDate: new Date("2024-01-01").toISOString(),
        lastRngSeed: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    } as unknown as GameSave
}

/** Find a seed whose first SeededRNG.next() satisfies the predicate. */
function findSeedForFirstRoll(predicate: (v: number) => boolean, max = 5000): number {
    for (let seed = 1; seed < max; seed++) {
        if (predicate(new SeededRNG(seed).next())) return seed
    }
    throw new Error("No suitable seed in range")
}

describe("generateModernEvents — media interview", () => {
    // media block fires when rng.bool(0.08) is true → first next() < 0.08.
    const seed = findSeedForFirstRoll(v => v < 0.08)

    function fireInterview(): GameSave {
        const save = makeSave()
        EventsManager.generateModernEvents(save, new SeededRNG(seed))
        return save
    }

    test("surfaces a media interview event when the roll fires", () => {
        const save = fireInterview()
        const evt = save.eventsLog.find(e => e.id === "media_interview_5")
        expect(evt).toBeDefined()
    })

    test("names a real outlet + journalist instead of the placeholder subject", () => {
        const save = fireInterview()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (save.eventsLog.find(e => e.id === "media_interview_5") as any).data
        expect(typeof data.outlet).toBe("string")
        expect(data.outlet.length).toBeGreaterThan(0)
        expect(typeof data.journalist).toBe("string")
        expect(data.journalist.length).toBeGreaterThan(0)

        // No more unfilled "Pro has requested..." framing.
        expect(data.message).not.toContain("Pro has requested")
        // The outlet + journalist are actually interpolated into the copy.
        expect(data.message).toContain(data.outlet)
        expect(data.message).toContain(data.journalist)
        expect(data.title).toContain(data.outlet)
        // Still communicates the reputation/prep trade-off.
        expect(data.message).toContain("reputation")
    })

    test("is deterministic for a given seed", () => {
        const a = fireInterview()
        const b = fireInterview()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msgA = (a.eventsLog.find(e => e.id === "media_interview_5") as any).data.message
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msgB = (b.eventsLog.find(e => e.id === "media_interview_5") as any).data.message
        expect(msgA).toBe(msgB)
    })
})
