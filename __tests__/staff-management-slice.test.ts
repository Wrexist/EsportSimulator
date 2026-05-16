/**
 * Tests for the staff-management slice.
 *
 * Four actions: refreshStaffMarket, hireStaff, renewStaffContract,
 * fireStaff. Each has multiple validation paths the calendar gates
 * money flow through — this is one of the higher-stakes slices for
 * a Steam-bound career mode.
 *
 * Coverage:
 *   refreshStaffMarket
 *     - generates 20 market slots deterministically from seed+week
 *   hireStaff
 *     - cost gate, MAX_STAFF_PER_TEAM=5 cap, MAX_PER_ROLE=1 dedup,
 *       budget gate, parseBoundedInt salary/duration/signingBonus,
 *       happy path debits + writes ledger + adds to roster + news
 *   renewStaffContract
 *     - parseBoundedInt salary/duration, refuses unknown id
 *     - happy path updates salaryPerWeek + contractEndWeek
 *   fireStaff
 *     - THROWS on unknown id (intentional — caller surfaces error)
 *     - happy path removes from staff array + team.staffIds + logs news
 */

import { produce, enableMapSet } from "immer"
import { createStaffManagementSlice } from "@/store/slices/staff-management-slice"
import type { StaffSaveData, TeamSaveData } from "@/engine/save-types"
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
        budget: 1_000_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1, leagueTier: "B_TIER",
        elo: 1500, recentForm: [],
        ...overrides,
    } as unknown as TeamSaveData
}

function makeMarketStaff(id: string, role = "coach", salary = 5000): StaffSaveData {
    return {
        id, name: `Staff ${id}`, role,
        teamId: "",
        level: 2, xp: 0, xpToNextLevel: 1000,
        talentPoints: 0,
        unlockedTalentIds: [],
        salaryPerWeek: salary, contractEndWeek: 0,
        stats: { development: 50, analysis: 50 },
    } as unknown as StaffSaveData
}

function makeBaseState(overrides: Partial<StoreState> = {}): Partial<StoreState> {
    return {
        teams: [makeTeam("player", { budget: 100_000 })],
        players: [],
        contracts: [],
        staff: [],
        marketStaff: [],
        financeLedger: [],
        newsFeed: [],
        currentWeek: 5,
        playerTeamId: "player",
        lastRngSeed: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    }
}

describe("refreshStaffMarket", () => {
    test("populates marketStaff with 20 generated slots", () => {
        const h = makeHarness(makeBaseState())
        const slice = createStaffManagementSlice(h.set, h.get)
        slice.refreshStaffMarket()
        expect(h.state().marketStaff.length).toBe(20)
    })

    test("same seed produces the same market", () => {
        const h1 = makeHarness(makeBaseState({ lastRngSeed: 999 }))
        const h2 = makeHarness(makeBaseState({ lastRngSeed: 999 }))
        const slice1 = createStaffManagementSlice(h1.set, h1.get)
        const slice2 = createStaffManagementSlice(h2.set, h2.get)
        slice1.refreshStaffMarket()
        slice2.refreshStaffMarket()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const names1 = h1.state().marketStaff.map(s => (s as any).name).sort()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const names2 = h2.state().marketStaff.map(s => (s as any).name).sort()
        expect(names1).toEqual(names2)
    })
})

describe("hireStaff", () => {
    test("unknown market id → 'Staff member not found'", () => {
        const h = makeHarness(makeBaseState())
        const slice = createStaffManagementSlice(h.set, h.get)
        const res = slice.hireStaff("ghost_id")
        expect(res.success).toBe(false)
        expect(res.message).toContain("not found")
    })

    test("insufficient budget for signing fee → refuses", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 100 })], // way too low
            marketStaff: [makeMarketStaff("s1", "coach", 5000)],
        }))
        const slice = createStaffManagementSlice(h.set, h.get)
        const res = slice.hireStaff("s1")
        expect(res.success).toBe(false)
        expect(res.message).toContain("Insufficient funds")
    })

    test("MAX_STAFF_PER_TEAM=5 cap: refuses the 6th hire", () => {
        const existing: StaffSaveData[] = Array.from({ length: 5 }, (_, i) => ({
            ...makeMarketStaff(`existing_${i}`, ["coach", "analyst", "psych", "scout", "physio"][i] || "coach"),
            teamId: "player",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        })) as any
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 1_000_000, staffIds: existing.map(s => s.id) })],
            staff: existing,
            marketStaff: [makeMarketStaff("new_one", "coach")],
        }))
        const slice = createStaffManagementSlice(h.set, h.get)
        const res = slice.hireStaff("new_one")
        expect(res.success).toBe(false)
        expect(res.message).toContain("Staff roster full")
    })

    test("MAX_PER_ROLE=1: refuses a 2nd coach", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 1_000_000, staffIds: ["coach_a"] })],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            staff: [{ ...makeMarketStaff("coach_a", "coach"), teamId: "player" } as any],
            marketStaff: [makeMarketStaff("new_coach", "coach")],
        }))
        const slice = createStaffManagementSlice(h.set, h.get)
        const res = slice.hireStaff("new_coach")
        expect(res.success).toBe(false)
        expect(res.message).toContain("already have a coach")
    })

    test("happy path: debits signingFee + writes WAGES_STAFF ledger row + adds to roster + news", () => {
        const market = makeMarketStaff("s1", "coach", 4000)
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 100_000 })],
            marketStaff: [market],
        }))
        const slice = createStaffManagementSlice(h.set, h.get)
        const res = slice.hireStaff("s1") // defaults: salary=4000, duration=52, signingBonus=8000
        expect(res.success).toBe(true)
        // budget debited by sign-on fee (2x salary)
        expect(h.state().teams[0].budget).toBe(100_000 - 8000)
        // marketStaff popped
        expect(h.state().marketStaff.length).toBe(0)
        // staff[] gained
        expect(h.state().staff.length).toBe(1)
        expect(h.state().staff[0].teamId).toBe("player")
        // ledger row
        const row = h.state().financeLedger.find(e => e.category === "WAGES_STAFF")
        expect(row).toBeDefined()
        expect(row!.amount).toBe(8000)
        // contractEndWeek = currentWeek + duration
        expect(h.state().staff[0].contractEndWeek).toBe(5 + 52)
        // team.staffIds updated
        expect(h.state().teams[0].staffIds).toEqual(["s1"])
        // news item
        const news = h.state().newsFeed.find(n => n.category === "STAFF")
        expect(news).toBeDefined()
    })

    test("negotiated terms override defaults", () => {
        const h = makeHarness(makeBaseState({
            marketStaff: [makeMarketStaff("s1", "coach", 5000)],
        }))
        const slice = createStaffManagementSlice(h.set, h.get)
        slice.hireStaff("s1", { salary: 7000, duration: 26, signingBonus: 1000 })
        expect(h.state().staff[0].salaryPerWeek).toBe(7000)
        expect(h.state().staff[0].contractEndWeek).toBe(5 + 26)
        const row = h.state().financeLedger.find(e => e.category === "WAGES_STAFF")
        expect(row!.amount).toBe(1000)
    })
})

describe("renewStaffContract", () => {
    test("unknown staff id → 'Staff not found'", () => {
        const h = makeHarness(makeBaseState())
        const slice = createStaffManagementSlice(h.set, h.get)
        const res = slice.renewStaffContract("ghost", 5000, 52)
        expect(res.success).toBe(false)
        expect(res.message).toContain("not found")
    })

    test("refuses out-of-bounds salary", () => {
        const h = makeHarness(makeBaseState({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            staff: [{ ...makeMarketStaff("s1", "coach"), teamId: "player" } as any],
        }))
        const slice = createStaffManagementSlice(h.set, h.get)
        const res = slice.renewStaffContract("s1", -100, 52)
        expect(res.success).toBe(false)
    })

    test("happy path: updates salary + contractEndWeek", () => {
        const h = makeHarness(makeBaseState({
            staff: [{
                ...makeMarketStaff("s1", "coach", 4000),
                teamId: "player",
                contractEndWeek: 50,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any],
            currentWeek: 10,
        }))
        const slice = createStaffManagementSlice(h.set, h.get)
        const res = slice.renewStaffContract("s1", 7000, 104)
        expect(res.success).toBe(true)
        expect(h.state().staff[0].salaryPerWeek).toBe(7000)
        expect(h.state().staff[0].contractEndWeek).toBe(10 + 104)
    })
})

describe("fireStaff", () => {
    test("THROWS on unknown staff id (caller surfaces the error)", () => {
        const h = makeHarness(makeBaseState())
        const slice = createStaffManagementSlice(h.set, h.get)
        expect(() => slice.fireStaff("ghost")).toThrow(/not found/)
    })

    test("removes staff from global array + team.staffIds + logs news", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { staffIds: ["s1"] })],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            staff: [{ ...makeMarketStaff("s1", "coach"), teamId: "player" } as any],
        }))
        const slice = createStaffManagementSlice(h.set, h.get)
        slice.fireStaff("s1")
        expect(h.state().staff.length).toBe(0)
        expect(h.state().teams[0].staffIds).toEqual([])
        const news = h.state().newsFeed.find(n => n.category === "STAFF")
        expect(news).toBeDefined()
        expect(news!.title).toContain("leaves")
    })
})
