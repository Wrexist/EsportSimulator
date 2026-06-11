/**
 * Tests for the team-facilities slice in isolation.
 *
 * Locks the contracts on five money-touching actions:
 *   - upgradeFacility (build + upgrade paths, level cap, cost gate)
 *   - signSponsor (slot cap, dedup, tier-gating by ranking + trophies)
 *   - upgradeMerchStore (cost doubling, max-level cap, ledger row)
 *   - toggleMerchItem (the bug-fixed signature from Phase R: result
 *     used to always report "Team not found" on the add branch)
 *
 * Same immer harness pattern as X.1/X.2 — no real store boot needed.
 */

import { produce, enableMapSet } from "immer"
import { createTeamFacilitiesSlice } from "@/store/slices/team-facilities-slice"
import type { TeamSaveData, SponsorSaveData } from "@/engine/save-types"
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
        elo: 1500, recentForm: [], worldRanking: 50,
        ...overrides,
    } as unknown as TeamSaveData
}

function makeBaseState(overrides: Partial<StoreState> = {}): Partial<StoreState> {
    return {
        teams: [makeTeam("player")],
        players: [],
        contracts: [],
        staff: [],
        scheduledMatches: [],
        completedMatches: [],
        tournaments: [],
        financeLedger: [],
        newsFeed: [],
        eventsLog: [],
        sponsorOffers: [],
        currentWeek: 5,
        playerTeamId: "player",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    }
}

function makeSponsor(name: string, tier: "BASIC" | "PREMIUM" | "ELITE", overrides: Partial<SponsorSaveData> = {}): SponsorSaveData {
    return {
        name, tier, contractLength: 52, weeklyPayment: 5000,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    } as SponsorSaveData
}

describe("upgradeFacility", () => {
    test("build path: brand-new facility starts at level 1 for $10k", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 100_000, facilities: [] })],
        }))
        const slice = createTeamFacilitiesSlice(h.set, h.get)
        slice.upgradeFacility("player", "TRAINING")
        const after = h.state().teams[0]
        expect(after.facilities!.length).toBe(1)
        expect(after.facilities![0].type).toBe("TRAINING")
        expect(after.facilities![0].level).toBe(1)
        expect(after.budget).toBe(100_000 - 10_000)
    })

    test("upgrade path: existing level-N facility goes to N+1 for level * $25k", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", {
                budget: 100_000,
                facilities: [{ id: "f1", type: "TRAINING", level: 2, description: "", monthlyCost: 2000 } as never],
            })],
        }))
        const slice = createTeamFacilitiesSlice(h.set, h.get)
        slice.upgradeFacility("player", "TRAINING")
        const fac = h.state().teams[0].facilities![0]
        expect(fac.level).toBe(3)
        // cost = old_level * 25k = 50k
        expect(h.state().teams[0].budget).toBe(100_000 - 50_000)
    })

    test("refuses build/upgrade silently when budget is too low", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 5000, facilities: [] })],
        }))
        const slice = createTeamFacilitiesSlice(h.set, h.get)
        slice.upgradeFacility("player", "TRAINING")
        // No facility built, budget unchanged.
        expect(h.state().teams[0].facilities!.length).toBe(0)
        expect(h.state().teams[0].budget).toBe(5000)
    })

    test("refuses upgrade past MAX_FACILITY_LEVEL=5", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", {
                budget: 10_000_000,
                facilities: [{ id: "f1", type: "TRAINING", level: 5, description: "", monthlyCost: 2000 } as never],
            })],
        }))
        const slice = createTeamFacilitiesSlice(h.set, h.get)
        slice.upgradeFacility("player", "TRAINING")
        expect(h.state().teams[0].facilities![0].level).toBe(5)
        expect(h.state().teams[0].budget).toBe(10_000_000)
    })
})

describe("signSponsor", () => {
    test("happy path: BASIC sponsor signs cleanly", () => {
        const h = makeHarness(makeBaseState())
        const slice = createTeamFacilitiesSlice(h.set, h.get)
        const res = slice.signSponsor("player", makeSponsor("PixelBrand", "BASIC"))
        expect(res.success).toBe(true)
        expect(h.state().teams[0].sponsors!.length).toBe(1)
    })

    test("refuses past MAX_SPONSORS_PER_TEAM (3)", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", {
                sponsors: [
                    makeSponsor("S1", "BASIC"),
                    makeSponsor("S2", "PREMIUM"),
                    makeSponsor("S3", "ELITE"),
                ] as never,
            })],
        }))
        const slice = createTeamFacilitiesSlice(h.set, h.get)
        const res = slice.signSponsor("player", makeSponsor("S4", "BASIC", { tier: "BASIC" }))
        expect(res.success).toBe(false)
        expect(res.message).toContain("slots are full")
    })

    test("refuses re-signing a sponsor still in its lapse cooldown", () => {
        const h = makeHarness(makeBaseState({
            currentWeek: 20,
            teams: [makeTeam("player", { sponsorCooldowns: { PixelBrand: 28 } } as never)],
        }))
        const slice = createTeamFacilitiesSlice(h.set, h.get)
        const res = slice.signSponsor("player", makeSponsor("PixelBrand", "BASIC"))
        expect(res.success).toBe(false)
        expect(res.message).toContain("won't return")
        // Same brand is fine once the cooldown has elapsed.
        const h2 = makeHarness(makeBaseState({
            currentWeek: 30,
            teams: [makeTeam("player", { sponsorCooldowns: { PixelBrand: 28 } } as never)],
        }))
        const res2 = createTeamFacilitiesSlice(h2.set, h2.get).signSponsor("player", makeSponsor("PixelBrand", "BASIC"))
        expect(res2.success).toBe(true)
    })

    test("refuses duplicate tier", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { sponsors: [makeSponsor("Already", "BASIC")] as never })],
        }))
        const slice = createTeamFacilitiesSlice(h.set, h.get)
        const res = slice.signSponsor("player", makeSponsor("AnotherBasic", "BASIC"))
        expect(res.success).toBe(false)
        expect(res.message).toContain("basic sponsor")
    })

    test("refuses PREMIUM sponsor when worldRanking > 30", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { worldRanking: 80 })],
        }))
        const slice = createTeamFacilitiesSlice(h.set, h.get)
        const res = slice.signSponsor("player", makeSponsor("EliteBrand", "PREMIUM"))
        expect(res.success).toBe(false)
        expect(res.message).toContain("Top 30")
    })

    test("allows PREMIUM sponsor when ranked Top 30", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { worldRanking: 12 })],
        }))
        const slice = createTeamFacilitiesSlice(h.set, h.get)
        const res = slice.signSponsor("player", makeSponsor("EliteBrand", "PREMIUM"))
        expect(res.success).toBe(true)
    })
})

describe("toggleMerchItem", () => {
    test("add branch reports success and pushes the item (Phase R bug regression)", () => {
        // Before the fix, both branches said "Team not found" on success
        // because `result` was never updated on the add path. Now both
        // branches update result correctly.
        const h = makeHarness(makeBaseState())
        const slice = createTeamFacilitiesSlice(h.set, h.get)
        const res = slice.toggleMerchItem("player", "HOODIE")
        expect(res.success).toBe(true)
        expect(res.message).toContain("added")
        expect(h.state().teams[0].activeMerchItems).toEqual(["HOODIE"])
    })

    test("remove branch reports success and pops the item", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { activeMerchItems: ["JERSEY"] as never })],
        }))
        const slice = createTeamFacilitiesSlice(h.set, h.get)
        const res = slice.toggleMerchItem("player", "JERSEY")
        expect(res.success).toBe(true)
        expect(res.message).toContain("removed")
        expect(h.state().teams[0].activeMerchItems).toEqual([])
    })

    test("returns Team not found on unknown id", () => {
        const h = makeHarness(makeBaseState())
        const slice = createTeamFacilitiesSlice(h.set, h.get)
        const res = slice.toggleMerchItem("ghost_team", "HOODIE")
        expect(res.success).toBe(false)
        expect(res.message).toContain("Team not found")
    })
})

describe("upgradeMerchStore", () => {
    test("level 1 → 2 debits $50k and writes a ledger row", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 500_000, merchStoreLevel: 1 } as never)],
        }))
        const slice = createTeamFacilitiesSlice(h.set, h.get)
        const res = slice.upgradeMerchStore("player")
        expect(res.success).toBe(true)
        expect(h.state().teams[0].merchStoreLevel).toBe(2)
        // cost = base 50k * 2^(1-1) = 50k
        expect(h.state().teams[0].budget).toBe(500_000 - 50_000)
        const ledgerRow = h.state().financeLedger.find(e => e.category === "FACILITIES")
        expect(ledgerRow).toBeDefined()
        expect(ledgerRow!.amount).toBe(50_000)
    })

    test("refuses upgrade past max level", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 10_000_000, merchStoreLevel: 5 } as never)],
        }))
        const slice = createTeamFacilitiesSlice(h.set, h.get)
        const res = slice.upgradeMerchStore("player")
        expect(res.success).toBe(false)
        expect(res.message).toContain("maximum")
    })

    test("refuses upgrade when budget is below cost", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 10_000, merchStoreLevel: 1 } as never)],
        }))
        const slice = createTeamFacilitiesSlice(h.set, h.get)
        const res = slice.upgradeMerchStore("player")
        expect(res.success).toBe(false)
        expect(res.message).toContain("Insufficient")
    })
})
