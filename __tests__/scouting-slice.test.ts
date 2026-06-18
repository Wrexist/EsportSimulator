/**
 * Tests for the scouting slice (mission lifecycle + watchlist).
 *
 * Same immer harness pattern as X.1-3. Coverage:
 *   - startScoutingMission: cost gate, dup guard, already-scouted
 *     guard, scout-level → duration math (L1=4wk, L2=3wk, L3=2wk,
 *     L4+=1wk), uses player team's scout when present otherwise
 *     falls back to any scout
 *   - getScoutingLevel: own-roster always ELITE; otherwise pulls
 *     from scoutedPlayers entry; otherwise NONE
 *   - isPlayerScouted: own-roster always true; otherwise check
 *     scoutedPlayers
 *   - watchlist: toggle add/remove, isPlayerWatchlisted read
 *
 * addToast is a side-effect we don't observe here — the slice's
 * `get().addToast(...)` calls are no-ops because the harness state
 * doesn't include the UI slice's addToast.
 */

import { produce, enableMapSet } from "immer"
import { createScoutingSlice } from "@/store/slices/scouting-slice"
import type { TeamSaveData, StaffSaveData } from "@/engine/save-types"
import type { StoreState } from "@/store/types"

enableMapSet()

function makeHarness(initial: Partial<StoreState>) {
    let state = initial as StoreState
    const set = (
        patch: Partial<StoreState> | ((draft: StoreState) => void)
    ) => {
        if (typeof patch === "function") {
            state = produce(state, patch as (s: StoreState) => void)
        } else {
            state = { ...state, ...patch }
        }
    }
    const get = () => state
    return { state: () => state, set, get }
}

function makeTeam(id: string, overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(),
        budget: 100_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1, leagueTier: "B_TIER",
        elo: 1500, recentForm: [],
        ...overrides,
    } as unknown as TeamSaveData
}

function makeScout(teamId: string | undefined, level: number, id = `scout_${teamId ?? "free"}`): StaffSaveData {
    return {
        id, name: id, role: "scout", teamId: teamId ?? "",
        level, xp: 0, xpToNextLevel: 1000, talentPoints: 0,
        unlockedTalentIds: [], salaryPerWeek: 1000, contractEndWeek: 100,
        stats: { development: 50, analysis: 60 },
    } as unknown as StaffSaveData
}

function makeBaseState(overrides: Partial<StoreState> = {}): Partial<StoreState> {
    return {
        teams: [makeTeam("player", { budget: 100_000, rosterIds: ["own_p1"] })],
        players: [],
        contracts: [],
        staff: [],
        scoutedPlayers: [],
        watchlistedPlayerIds: [],
        currentWeek: 5,
        playerTeamId: "player",
        toasts: [],
        addToast: () => {}, // no-op for harness
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    }
}

describe("startScoutingMission", () => {
    test("debits $3000 and sets activeScoutingMission with L1 scout → 4-week duration", () => {
        const h = makeHarness(makeBaseState({
            staff: [makeScout("player", 1)],
        }))
        const slice = createScoutingSlice(h.set, h.get)
        slice.startScoutingMission("p_target")
        expect(h.state().teams[0].budget).toBe(100_000 - 3000)
        expect(h.state().activeScoutingMission).toBeDefined()
        expect(h.state().activeScoutingMission!.playerId).toBe("p_target")
        expect(h.state().activeScoutingMission!.completionWeek).toBe(5 + 4)
        expect(h.state().activeScoutingMission!.scoutId).toBe("scout_player")
    })

    test("a high scoutingSpeed scout finishes faster (stat wired)", () => {
        const fastScout = { ...makeScout("player", 1), stats: { scoutingSpeed: 100 } }
        const h = makeHarness(makeBaseState({ staff: [fastScout as never] }))
        const slice = createScoutingSlice(h.set, h.get)
        slice.startScoutingMission("p_target")
        // base L1 = 4wk; speed 100 → floor(100/50)=2 weeks faster → 2wk.
        expect(h.state().activeScoutingMission!.completionWeek).toBe(5 + 2)
    })

    test("L4 scout → 1-week duration (max(1, 5-level) floor at 1)", () => {
        const h = makeHarness(makeBaseState({
            staff: [makeScout("player", 4)],
        }))
        const slice = createScoutingSlice(h.set, h.get)
        slice.startScoutingMission("p_target")
        expect(h.state().activeScoutingMission!.completionWeek).toBe(5 + 1)
    })

    test("L99 scout still clamps to 1-week minimum duration", () => {
        const h = makeHarness(makeBaseState({
            staff: [makeScout("player", 99)],
        }))
        const slice = createScoutingSlice(h.set, h.get)
        slice.startScoutingMission("p_target")
        expect(h.state().activeScoutingMission!.completionWeek).toBe(5 + 1)
    })

    test("no scout on staff falls back to default_scout id", () => {
        const h = makeHarness(makeBaseState({ staff: [] }))
        const slice = createScoutingSlice(h.set, h.get)
        slice.startScoutingMission("p_target")
        expect(h.state().activeScoutingMission!.scoutId).toBe("default_scout")
    })

    test("scout on a different team is used as fallback when player team has none", () => {
        const h = makeHarness(makeBaseState({
            staff: [makeScout("rival", 3)],
        }))
        const slice = createScoutingSlice(h.set, h.get)
        slice.startScoutingMission("p_target")
        // 5 - 3 = 2-week duration
        expect(h.state().activeScoutingMission!.completionWeek).toBe(5 + 2)
        expect(h.state().activeScoutingMission!.scoutId).toBe("scout_rival")
    })

    test("active mission already exists → silent no-op", () => {
        const h = makeHarness(makeBaseState({
            activeScoutingMission: {
                playerId: "existing", startWeek: 1, completionWeek: 5, scoutId: "default_scout",
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
            staff: [makeScout("player", 1)],
        }))
        const slice = createScoutingSlice(h.set, h.get)
        slice.startScoutingMission("new_target")
        // Mission unchanged, budget untouched.
        expect(h.state().activeScoutingMission!.playerId).toBe("existing")
        expect(h.state().teams[0].budget).toBe(100_000)
    })

    test("player already scouted → silent no-op", () => {
        const h = makeHarness(makeBaseState({
            scoutedPlayers: [{ playerId: "p_target", scoutedWeek: 1, scoutLevel: "EXPERT" } as never],
            staff: [makeScout("player", 1)],
        }))
        const slice = createScoutingSlice(h.set, h.get)
        slice.startScoutingMission("p_target")
        expect(h.state().activeScoutingMission).toBeUndefined()
        expect(h.state().teams[0].budget).toBe(100_000) // not debited
    })

    test("insufficient budget → silent no-op (no mission, no debit)", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 2999 })],
            staff: [makeScout("player", 1)],
        }))
        const slice = createScoutingSlice(h.set, h.get)
        slice.startScoutingMission("p_target")
        expect(h.state().activeScoutingMission).toBeUndefined()
        expect(h.state().teams[0].budget).toBe(2999)
    })
})

describe("getScoutingLevel + isPlayerScouted", () => {
    test("own-roster player always returns ELITE / true", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { rosterIds: ["own_p1"] })],
        }))
        const slice = createScoutingSlice(h.set, h.get)
        expect(slice.getScoutingLevel("own_p1")).toBe("ELITE")
        expect(slice.isPlayerScouted("own_p1")).toBe(true)
    })

    test("scouted external player returns their recorded scoutLevel", () => {
        const h = makeHarness(makeBaseState({
            scoutedPlayers: [{ playerId: "ext_p", scoutedWeek: 1, scoutLevel: "EXPERT" } as never],
        }))
        const slice = createScoutingSlice(h.set, h.get)
        expect(slice.getScoutingLevel("ext_p")).toBe("EXPERT")
        expect(slice.isPlayerScouted("ext_p")).toBe(true)
    })

    test("unknown player returns NONE / false", () => {
        const h = makeHarness(makeBaseState())
        const slice = createScoutingSlice(h.set, h.get)
        expect(slice.getScoutingLevel("ghost")).toBe("NONE")
        expect(slice.isPlayerScouted("ghost")).toBe(false)
    })
})

describe("watchlist", () => {
    test("toggleWatchlistPlayer adds and removes the player id", () => {
        const h = makeHarness(makeBaseState({ watchlistedPlayerIds: [] }))
        const slice = createScoutingSlice(h.set, h.get)
        slice.toggleWatchlistPlayer("p1")
        expect(h.state().watchlistedPlayerIds).toEqual(["p1"])
        slice.toggleWatchlistPlayer("p1")
        expect(h.state().watchlistedPlayerIds).toEqual([])
    })

    test("isPlayerWatchlisted reflects current set membership", () => {
        const h = makeHarness(makeBaseState({ watchlistedPlayerIds: ["p1", "p2"] }))
        const slice = createScoutingSlice(h.set, h.get)
        expect(slice.isPlayerWatchlisted("p1")).toBe(true)
        expect(slice.isPlayerWatchlisted("ghost")).toBe(false)
    })

    test("watchlistedPlayerIds=undefined is treated as empty (legacy save)", () => {
        const h = makeHarness(makeBaseState({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            watchlistedPlayerIds: undefined as any,
        }))
        const slice = createScoutingSlice(h.set, h.get)
        // Should not crash on undefined list.
        expect(slice.isPlayerWatchlisted("anything")).toBe(false)
    })
})
