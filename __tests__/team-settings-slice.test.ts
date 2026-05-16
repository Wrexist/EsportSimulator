/**
 * Tests for the team-settings slice.
 *
 * Six small actions that gate team-scoped settings:
 *   - setPlaystyle / setEconomyStyle: own-team-only + valid-value gate
 *   - setTargetPlayer: own-team-only + target must be a real non-roster
 *     player
 *   - swapRosterPositions: bounds-checked swap
 *   - updateTeamBudget: bounded delta, refuses to drop below 0
 *   - treatInjury: cost gate ($5k), shaves 2 weeks off injury, logs
 *     ledger row + event + toast
 */

import { produce, enableMapSet } from "immer"
import { createTeamSettingsSlice } from "@/store/slices/team-settings-slice"
import { VALID_PLAYSTYLES, VALID_ECONOMY_STYLES } from "@/store/utils/helpers"
import type { TeamSaveData, PlayerSaveData } from "@/engine/save-types"
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

function makePlayer(id: string, overrides: Partial<PlayerSaveData> = {}): PlayerSaveData {
    return {
        id, nickname: id, firstName: id, lastName: "P",
        age: 22, nationality: "US", role: "RIFLER",
        rifle: 70, awp: 60, pistol: 65, grenades: 60, creativity: 60,
        clutch: 60, tactic: 60, leader: 55, teamwork: 65,
        reaction: 70, eyesight: 70,
        morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        skill: 70, potential: 85, productivity: 60, endurance: 70,
        ...overrides,
    } as unknown as PlayerSaveData
}

function makeBaseState(overrides: Partial<StoreState> = {}): Partial<StoreState> {
    return {
        teams: [makeTeam("player", { rosterIds: ["p1"] })],
        players: [makePlayer("p1")],
        contracts: [],
        eventsLog: [],
        financeLedger: [],
        toasts: [],
        currentWeek: 5,
        playerTeamId: "player",
        lastRngSeed: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    }
}

describe("setPlaystyle + setEconomyStyle", () => {
    test("setPlaystyle writes valid playstyle on player team", () => {
        const validPlaystyle = Array.from(VALID_PLAYSTYLES)[0]
        const h = makeHarness(makeBaseState())
        const slice = createTeamSettingsSlice(h.set, h.get)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        slice.setPlaystyle("player", validPlaystyle as any)
        expect(h.state().teams[0].playstyle).toBe(validPlaystyle)
    })

    test("setPlaystyle refuses invalid value (input sanitization)", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { playstyle: "default", rosterIds: ["p1"] })],
        }))
        const slice = createTeamSettingsSlice(h.set, h.get)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        slice.setPlaystyle("player", "MADE_UP_STYLE" as any)
        expect(h.state().teams[0].playstyle).toBe("default") // unchanged
    })

    test("setPlaystyle refuses cross-team mutation (only player team)", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { rosterIds: ["p1"] }), makeTeam("rival", { playstyle: "default" })],
        }))
        const validPlaystyle = Array.from(VALID_PLAYSTYLES)[0]
        const slice = createTeamSettingsSlice(h.set, h.get)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        slice.setPlaystyle("rival", validPlaystyle as any)
        expect(h.state().teams[1].playstyle).toBe("default") // unchanged
    })

    test("setEconomyStyle writes valid value + refuses invalid", () => {
        const valid = Array.from(VALID_ECONOMY_STYLES)[0]
        const h = makeHarness(makeBaseState())
        const slice = createTeamSettingsSlice(h.set, h.get)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        slice.setEconomyStyle("player", valid as any)
        expect(h.state().teams[0].economyStyle).toBe(valid)
        // Now try invalid
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        slice.setEconomyStyle("player", "BOGUS" as any)
        expect(h.state().teams[0].economyStyle).toBe(valid) // unchanged
    })
})

describe("setTargetPlayer", () => {
    test("clears target when given falsy id", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { rosterIds: ["p1"], targetPlayerId: "ext_p" })],
            players: [makePlayer("p1"), makePlayer("ext_p")],
        }))
        const slice = createTeamSettingsSlice(h.set, h.get)
        slice.setTargetPlayer("player", undefined)
        expect(h.state().teams[0].targetPlayerId).toBeUndefined()
    })

    test("sets target on a valid non-own-roster external player", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { rosterIds: ["p1"] })],
            players: [makePlayer("p1"), makePlayer("ext_p")],
        }))
        const slice = createTeamSettingsSlice(h.set, h.get)
        slice.setTargetPlayer("player", "ext_p")
        expect(h.state().teams[0].targetPlayerId).toBe("ext_p")
    })

    test("refuses to target a player on our own roster (would be self-target)", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { rosterIds: ["p1"], targetPlayerId: undefined })],
            players: [makePlayer("p1")],
        }))
        const slice = createTeamSettingsSlice(h.set, h.get)
        slice.setTargetPlayer("player", "p1")
        expect(h.state().teams[0].targetPlayerId).toBeUndefined()
    })

    test("refuses ghost player id (player must exist)", () => {
        const h = makeHarness(makeBaseState())
        const slice = createTeamSettingsSlice(h.set, h.get)
        slice.setTargetPlayer("player", "ghost_p")
        expect(h.state().teams[0].targetPlayerId).toBeUndefined()
    })
})

describe("swapRosterPositions", () => {
    test("swaps two indices in rosterIds", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { rosterIds: ["a", "b", "c", "d", "e"] })],
        }))
        const slice = createTeamSettingsSlice(h.set, h.get)
        slice.swapRosterPositions("player", 0, 4)
        expect(h.state().teams[0].rosterIds).toEqual(["e", "b", "c", "d", "a"])
    })

    test("out-of-bounds indices are a no-op", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { rosterIds: ["a", "b"] })],
        }))
        const slice = createTeamSettingsSlice(h.set, h.get)
        slice.swapRosterPositions("player", 0, 99)
        expect(h.state().teams[0].rosterIds).toEqual(["a", "b"]) // unchanged
        slice.swapRosterPositions("player", -1, 0)
        expect(h.state().teams[0].rosterIds).toEqual(["a", "b"]) // unchanged
    })

    test("unknown team id is a no-op", () => {
        const h = makeHarness(makeBaseState())
        const slice = createTeamSettingsSlice(h.set, h.get)
        expect(() => slice.swapRosterPositions("ghost", 0, 1)).not.toThrow()
    })
})

describe("updateTeamBudget", () => {
    test("adds a positive delta", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 50_000, rosterIds: ["p1"] })],
        }))
        const slice = createTeamSettingsSlice(h.set, h.get)
        slice.updateTeamBudget("player", 10_000)
        expect(h.state().teams[0].budget).toBe(60_000)
    })

    test("applies a negative delta when budget can absorb it", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 50_000, rosterIds: ["p1"] })],
        }))
        const slice = createTeamSettingsSlice(h.set, h.get)
        slice.updateTeamBudget("player", -10_000)
        expect(h.state().teams[0].budget).toBe(40_000)
    })

    test("refuses to drop budget below 0 (bankruptcy should go through proper expense flow)", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 5000, rosterIds: ["p1"] })],
        }))
        const slice = createTeamSettingsSlice(h.set, h.get)
        slice.updateTeamBudget("player", -10_000)
        expect(h.state().teams[0].budget).toBe(5000) // unchanged
    })

    test("refuses cross-team mutation", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { rosterIds: ["p1"] }), makeTeam("rival", { budget: 100_000 })],
        }))
        const slice = createTeamSettingsSlice(h.set, h.get)
        slice.updateTeamBudget("rival", 50_000)
        expect(h.state().teams[1].budget).toBe(100_000) // unchanged
    })
})

describe("treatInjury", () => {
    test("debits $5000 + shaves 2 weeks + logs ledger + event + toast", () => {
        const injuredPlayer = makePlayer("p1", {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            injury: { weeksRemaining: 5, type: "wrist" } as any,
        })
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 50_000, rosterIds: ["p1"] })],
            players: [injuredPlayer],
        }))
        const slice = createTeamSettingsSlice(h.set, h.get)
        slice.treatInjury("p1")
        expect(h.state().teams[0].budget).toBe(45_000)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((h.state().players[0] as any).injury.weeksRemaining).toBe(3)
        const row = h.state().financeLedger.find(e => e.category === "FACILITIES")
        expect(row).toBeDefined()
        expect(row!.amount).toBe(5000)
        const evt = h.state().eventsLog.find(e =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (e as any).data?.title === "Medical Specialist Hired"
        )
        expect(evt).toBeDefined()
        const toast = h.state().toasts.find(t => t.message === "Treatment successful!")
        expect(toast).toBeDefined()
    })

    test("clamps weeksRemaining at 0 (can't go negative)", () => {
        const injuredPlayer = makePlayer("p1", {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            injury: { weeksRemaining: 1, type: "knock" } as any,
        })
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 50_000, rosterIds: ["p1"] })],
            players: [injuredPlayer],
        }))
        const slice = createTeamSettingsSlice(h.set, h.get)
        slice.treatInjury("p1")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((h.state().players[0] as any).injury.weeksRemaining).toBe(0)
    })

    test("refuses when budget below $5000 + surfaces a 'Insufficient funds' toast", () => {
        const injuredPlayer = makePlayer("p1", {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            injury: { weeksRemaining: 5, type: "wrist" } as any,
        })
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 3000, rosterIds: ["p1"] })],
            players: [injuredPlayer],
        }))
        const slice = createTeamSettingsSlice(h.set, h.get)
        slice.treatInjury("p1")
        expect(h.state().teams[0].budget).toBe(3000) // unchanged
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((h.state().players[0] as any).injury.weeksRemaining).toBe(5) // unchanged
        const toast = h.state().toasts.find(t => t.message.includes("Insufficient funds"))
        expect(toast).toBeDefined()
    })

    test("uninjured player is a silent no-op", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 50_000, rosterIds: ["p1"] })],
            players: [makePlayer("p1")], // no injury
        }))
        const slice = createTeamSettingsSlice(h.set, h.get)
        slice.treatInjury("p1")
        expect(h.state().teams[0].budget).toBe(50_000) // unchanged
        expect(h.state().toasts.length).toBe(0)
    })
})
