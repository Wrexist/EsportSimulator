/**
 * Tests for the transfer/contract slice in isolation.
 *
 * Booting the full `useGameStore` in jest fails because game-store.ts
 * pulls in week-processor-bridge.ts which uses `import.meta.url` to
 * instantiate its Web Worker — a parse-time construct that ts-jest
 * (CommonJS target) cannot evaluate. Rather than reshape the worker
 * loader to be jest-friendly, this test reaches into the slice
 * directly with a minimal `(set, get)` harness that mirrors what the
 * immer zustand middleware does in production: each mutator callback
 * is wrapped in `immer.produce` so the slice's `state.x = y` writes
 * land on a draft and produce a new immutable state.
 *
 * What's covered:
 *   - Release-to-Free-Agency (toTeamId === "FA")
 *   - Free-agent signing (no source team)
 *   - Trade with fee + contract write
 *   - Validation failures: fee out of bounds, same-team move,
 *     destination already owns, destination roster full, source
 *     can't afford, source team has player on transfer-window
 *     conflict with next opponent.
 *   - Strategic refusal: refuses to sell to a team we play in
 *     the next 3 weeks.
 *   - Ledger entries: paired EXPENSE/INCOME on real trades.
 */

import { produce, enableMapSet } from "immer"
import { createTransferContractSlice } from "@/store/slices/transfer-contract-slice"
import type {
    PlayerSaveData, TeamSaveData, ContractSaveData,
    CompletedMatchSaveData, MatchSaveData,
} from "@/engine/save-types"
import type { StoreState } from "@/store/types"

// The store uses immer with the Map _teamIndex etc — enable Map/Set
// support so the harness can replay those operations.
enableMapSet()

function makeHarness(initial: Partial<StoreState>) {
    let state = initial as StoreState
    const set: StoreState["acceptTransferOffer"] extends never ? never : (
        (
            patch: Partial<StoreState> | ((draft: StoreState) => void)
        ) => void
    ) = (patch) => {
        if (typeof patch === "function") {
            state = produce(state, patch as (s: StoreState) => void)
        } else {
            state = { ...state, ...patch }
        }
    }
    const get = () => state
    return { state: () => state, set, get }
}

function makePlayer(id: string, nickname = id): PlayerSaveData {
    return {
        id, nickname, firstName: id, lastName: "Test",
        age: 22, nationality: "US", role: "RIFLER",
        rifle: 70, awp: 60, pistol: 65, grenades: 60, creativity: 60,
        clutch: 60, tactic: 60, leader: 55, teamwork: 65,
        reaction: 70, eyesight: 70,
        morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        skill: 70, potential: 85, productivity: 60, endurance: 70,
    } as unknown as PlayerSaveData
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

function makeBaseState(overrides: Partial<StoreState> = {}): Partial<StoreState> {
    return {
        teams: [],
        players: [],
        contracts: [],
        scheduledMatches: [] as MatchSaveData[],
        completedMatches: [] as CompletedMatchSaveData[],
        financeLedger: [],
        transferHistory: [],
        newsFeed: [],
        eventsLog: [],
        currentWeek: 10,
        playerTeamId: "player",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    }
}

describe("transferPlayer — release to free agency", () => {
    test("toTeamId === 'FA' drops the player from the source roster", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { rosterIds: ["p1", "p2"] })],
            players: [makePlayer("p1"), makePlayer("p2")],
            contracts: [
                { id: "c1", playerId: "p1", teamId: "player", salaryPerWeek: 1000, startWeek: 1, endWeek: 52, buyout: 50000 } as ContractSaveData,
            ],
        }))
        const slice = createTransferContractSlice(h.set, h.get)
        const result = slice.transferPlayer("p1", "player", "FA", 0)

        expect(result.success).toBe(true)
        expect(h.state().teams[0].rosterIds).toEqual(["p2"])
        // Contract is removed too.
        expect(h.state().contracts.find(c => c.playerId === "p1")).toBeUndefined()
    })
})

describe("transferPlayer — validation failures", () => {
    test("rejects when destination team does not exist", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { rosterIds: ["p1"] })],
            players: [makePlayer("p1")],
        }))
        const slice = createTransferContractSlice(h.set, h.get)
        const result = slice.transferPlayer("p1", "player", "ghost_team", 10000)
        expect(result.success).toBe(false)
        expect(result.message).toContain("Target team not found")
    })

    test("rejects when fee is negative", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { rosterIds: ["p1"] }), makeTeam("buyer", { rosterIds: [] })],
            players: [makePlayer("p1")],
        }))
        const slice = createTransferContractSlice(h.set, h.get)
        const result = slice.transferPlayer("p1", "player", "buyer", -500)
        expect(result.success).toBe(false)
    })

    test("rejects when source team can't be located but player is not a free agent", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("owner", { rosterIds: ["p1"] }), makeTeam("buyer", { rosterIds: [] })],
            players: [makePlayer("p1")],
        }))
        const slice = createTransferContractSlice(h.set, h.get)
        // Pretend it's an FA signing, but the player is on "owner"'s roster.
        const result = slice.transferPlayer("p1", "FA", "buyer", 0)
        expect(result.success).toBe(false)
        expect(result.message).toContain("owner currently owns this player")
    })

    test("rejects when destination team already has the player", () => {
        const h = makeHarness(makeBaseState({
            teams: [
                makeTeam("a", { rosterIds: ["p1"] }),
                makeTeam("b", { rosterIds: ["p1"] }), // shouldn't happen but defend
            ],
            players: [makePlayer("p1")],
        }))
        const slice = createTransferContractSlice(h.set, h.get)
        const result = slice.transferPlayer("p1", "a", "b", 1000)
        expect(result.success).toBe(false)
        expect(result.message).toContain("already on the destination team")
    })

    test("rejects when destination roster is at the 7-player cap", () => {
        const h = makeHarness(makeBaseState({
            teams: [
                makeTeam("seller", { rosterIds: ["p1"] }),
                makeTeam("buyer", { rosterIds: ["p2", "p3", "p4", "p5", "p6", "p7", "p8"] }),
            ],
            players: [makePlayer("p1"), makePlayer("p2"), makePlayer("p3"), makePlayer("p4"),
                makePlayer("p5"), makePlayer("p6"), makePlayer("p7"), makePlayer("p8")],
        }))
        const slice = createTransferContractSlice(h.set, h.get)
        const result = slice.transferPlayer("p1", "seller", "buyer", 1000)
        expect(result.success).toBe(false)
        expect(result.message).toContain("roster is full")
    })

    test("rejects same-team move", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("a", { rosterIds: ["p1"] })],
            players: [makePlayer("p1")],
        }))
        const slice = createTransferContractSlice(h.set, h.get)
        const result = slice.transferPlayer("p1", "a", "a", 0)
        expect(result.success).toBe(false)
        expect(result.message).toContain("same team")
    })

    test("rejects when destination cannot afford the fee", () => {
        const h = makeHarness(makeBaseState({
            teams: [
                makeTeam("seller", { rosterIds: ["p1"] }),
                makeTeam("buyer", { rosterIds: [], budget: 5000 }),
            ],
            players: [makePlayer("p1")],
        }))
        const slice = createTransferContractSlice(h.set, h.get)
        const result = slice.transferPlayer("p1", "seller", "buyer", 100_000)
        expect(result.success).toBe(false)
        expect(result.message).toContain("cannot afford")
    })
})

describe("transferPlayer — strategic refusal", () => {
    test("refuses to sell to a team we play in the next 3 weeks", () => {
        const h = makeHarness(makeBaseState({
            currentWeek: 10,
            teams: [
                makeTeam("seller", { rosterIds: ["p1"] }),
                makeTeam("rival", { rosterIds: [] }),
            ],
            players: [makePlayer("p1")],
            scheduledMatches: [
                { id: "m1", homeTeamId: "seller", awayTeamId: "rival", week: 12 } as MatchSaveData,
            ],
        }))
        const slice = createTransferContractSlice(h.set, h.get)
        const result = slice.transferPlayer("p1", "seller", "rival", 50000)
        expect(result.success).toBe(false)
        expect(result.message).toContain("Week 12")
    })

    test("allows the move when the opponent match is beyond the 3-week window", () => {
        const h = makeHarness(makeBaseState({
            currentWeek: 10,
            teams: [
                makeTeam("seller", { rosterIds: ["p1"] }),
                makeTeam("future_rival", { rosterIds: [] }),
            ],
            players: [makePlayer("p1")],
            scheduledMatches: [
                // Week 20 → 10 weeks out, outside the 3-week strategic-refusal lookahead.
                { id: "m1", homeTeamId: "seller", awayTeamId: "future_rival", week: 20 } as MatchSaveData,
            ],
        }))
        const slice = createTransferContractSlice(h.set, h.get)
        const result = slice.transferPlayer("p1", "seller", "future_rival", 50000)
        expect(result.success).toBe(true)
    })
})

describe("transferPlayer — successful trade", () => {
    test("trade transfers roster, debits buyer, credits seller, writes ledger pair", () => {
        const h = makeHarness(makeBaseState({
            teams: [
                makeTeam("seller", { rosterIds: ["p1"], budget: 500_000 }),
                makeTeam("buyer", { rosterIds: [], budget: 500_000 }),
            ],
            players: [makePlayer("p1", "Star")],
        }))
        const slice = createTransferContractSlice(h.set, h.get)
        const result = slice.transferPlayer("p1", "seller", "buyer", 80_000, {
            salaryPerWeek: 5000, startWeek: 10, endWeek: 62, buyout: 200_000,
        })
        expect(result.success).toBe(true)

        const after = h.state()
        const seller = after.teams.find(t => t.id === "seller")!
        const buyer = after.teams.find(t => t.id === "buyer")!
        expect(seller.rosterIds).toEqual([])
        expect(buyer.rosterIds).toEqual(["p1"])
        expect(seller.budget).toBe(500_000 + 80_000)
        expect(buyer.budget).toBe(500_000 - 80_000)

        // Contract is written on the buyer side.
        const contract = after.contracts.find(c => c.playerId === "p1")
        expect(contract).toBeDefined()
        expect(contract!.teamId).toBe("buyer")
        expect(contract!.salaryPerWeek).toBe(5000)

        // Ledger has paired EXPENSE (buyer) + INCOME (seller).
        const buyerLedger = after.financeLedger.filter(e => e.teamId === "buyer" && e.type === "EXPENSE")
        const sellerLedger = after.financeLedger.filter(e => e.teamId === "seller" && e.type === "INCOME")
        expect(buyerLedger.length).toBe(1)
        expect(sellerLedger.length).toBe(1)
        expect(buyerLedger[0].amount).toBe(80_000)
        expect(sellerLedger[0].amount).toBe(80_000)
    })

    test("free-agent signing (fromTeamId='FA') adds to roster and does not write a seller ledger row", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("buyer", { rosterIds: [], budget: 500_000 })],
            players: [makePlayer("p1", "FreeMan")],
        }))
        const slice = createTransferContractSlice(h.set, h.get)
        const result = slice.transferPlayer("p1", "FA", "buyer", 0, {
            salaryPerWeek: 3000, startWeek: 10, endWeek: 62, buyout: 100_000,
        })
        expect(result.success).toBe(true)
        const after = h.state()
        expect(after.teams[0].rosterIds).toEqual(["p1"])
        // No fee → no ledger rows at all (the fee=0 branch skips ledger writes).
        expect(after.financeLedger.length).toBe(0)
    })

    // Backs the NegotiationModal double-click guard: even if the UI fires the
    // action twice in one frame, the store must charge the fee exactly once.
    test("double-firing the same transfer charges the buyer exactly once", () => {
        const h = makeHarness(makeBaseState({
            teams: [
                makeTeam("seller", { rosterIds: ["p1"], budget: 100_000 }),
                makeTeam("buyer", { rosterIds: [], budget: 500_000 }),
            ],
            players: [makePlayer("p1")],
            contracts: [
                { id: "c1", playerId: "p1", teamId: "seller", salaryPerWeek: 1000, startWeek: 1, endWeek: 80, buyout: 50_000 } as ContractSaveData,
            ],
        }))
        const slice = createTransferContractSlice(h.set, h.get)
        const contract = { salaryPerWeek: 3000, startWeek: 10, endWeek: 62, buyout: 100_000 }

        const first = slice.transferPlayer("p1", "seller", "buyer", 50_000, contract)
        const second = slice.transferPlayer("p1", "seller", "buyer", 50_000, contract)

        expect(first.success).toBe(true)
        expect(second.success).toBe(false)
        expect(second.message).toContain("already on the destination team")

        const after = h.state()
        const buyer = after.teams.find(t => t.id === "buyer")!
        expect(buyer.budget).toBe(500_000 - 50_000) // charged once, not twice
        expect(buyer.rosterIds).toEqual(["p1"])     // no duplicate roster entry
        // Exactly one buyer EXPENSE row in the ledger.
        const buyerExpenses = after.financeLedger.filter(e => e.teamId === "buyer" && e.type === "EXPENSE")
        expect(buyerExpenses.length).toBe(1)
    })
})

describe("renewContract — ownership guard", () => {
    test("refuses to renew a contract owned by another team (no salary raise / extension)", () => {
        const h = makeHarness(makeBaseState({
            teams: [
                makeTeam("player", { rosterIds: ["p1"], budget: 5_000_000 }),
                makeTeam("rival", { rosterIds: ["p2"] }),
            ],
            players: [makePlayer("p1"), makePlayer("p2")],
            contracts: [
                { id: "c2", playerId: "p2", teamId: "rival", salaryPerWeek: 1000, startWeek: 1, endWeek: 52, buyout: 50000 } as ContractSaveData,
            ],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            addToast: () => {},
        } as any))
        const slice = createTransferContractSlice(h.set, h.get)
        slice.renewContract("p2") // p2 belongs to "rival", not the player team

        const contract = h.state().contracts.find(c => c.playerId === "p2")!
        expect(contract.endWeek).toBe(52)        // unchanged — not extended
        expect(contract.salaryPerWeek).toBe(1000) // unchanged — not raised
    })

    test("renews the player team's own contract (raises salary, extends term)", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { rosterIds: ["p1"], budget: 5_000_000 })],
            players: [makePlayer("p1")],
            contracts: [
                { id: "c1", playerId: "p1", teamId: "player", salaryPerWeek: 1000, startWeek: 1, endWeek: 52, buyout: 50000 } as ContractSaveData,
            ],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            addToast: () => {},
        } as any))
        const slice = createTransferContractSlice(h.set, h.get)
        slice.renewContract("p1")

        const contract = h.state().contracts.find(c => c.playerId === "p1")!
        expect(contract.endWeek).toBeGreaterThan(52)
        expect(contract.salaryPerWeek).toBeGreaterThan(1000)
    })
})
