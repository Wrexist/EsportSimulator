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
        const result = slice.transferPlayer("p1", "seller", "buyer", 100_000, { salaryPerWeek: 1000, startWeek: 10, endWeek: 62, buyout: 0 })
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
        const result = slice.transferPlayer("p1", "seller", "future_rival", 50000, { salaryPerWeek: 1000, startWeek: 10, endWeek: 62, buyout: 0 })
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


describe("L15 contract transaction boundaries", () => {
    const contract = { playerId: "p1", teamId: "seller", salaryPerWeek: 1000, startWeek: 1, endWeek: 62, buyout: 0 }
    function setup() {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("seller", { rosterIds: ["p1"] }), makeTeam("buyer")],
            players: [makePlayer("p1")], contracts: [contract],
            addToast: jest.fn(), playerTeamId: "seller",
        }))
        return { h, slice: createTransferContractSlice(h.set, h.get) }
    }
    test("wrong-owner release and repeated release cannot remove another contract or repeat chemistry loss", () => {
        const { h, slice } = setup()
        const before = JSON.stringify(h.state())
        expect(slice.transferPlayer("p1", "buyer", "FA", 0).success).toBe(false)
        expect(JSON.stringify(h.state())).toBe(before)
        expect(slice.transferPlayer("p1", "seller", "FA", 0).success).toBe(true)
        const released = JSON.stringify(h.state())
        expect(slice.transferPlayer("p1", "seller", "FA", 0).success).toBe(false)
        expect(JSON.stringify(h.state())).toBe(released)
    })
    test.each([undefined, { ...contract, startWeek: 11 }, { ...contract, startWeek: 9 }, { ...contract, startWeek: 10, endWeek: 10 }])("invalid terms cannot charge or move the player: %j", terms => {
        const { h, slice } = setup()
        const before = JSON.stringify(h.state())
        expect(slice.transferPlayer("p1", "seller", "buyer", 10000, terms).success).toBe(false)
        expect(JSON.stringify(h.state())).toBe(before)
    })
    test("repeated renewal stops at the enforceable remaining-term ceiling without charging cash", () => {
        const { h, slice } = setup()
        const before = h.state().teams[0].budget
        for (let i = 0; i < 20; i++) slice.renewContract("p1")
        expect(h.state().contracts[0].endWeek - 10).toBeLessThanOrEqual(520)
        expect(h.state().teams[0].budget).toBe(before)
        expect(h.state().financeLedger).toHaveLength(0)
        expect(h.state().addToast).toHaveBeenLastCalledWith(expect.objectContaining({ type: "warning" }))
    })
    test("a poor club cannot renew and a departed player cannot be renewed", () => {
        const { h, slice } = setup()
        h.set(s => { s.teams[0].budget = 1 })
        slice.renewContract("p1")
        expect(h.state().contracts[0]).toEqual(contract)
        h.set(s => { s.teams[0].budget = 100000; s.teams[0].rosterIds = [] })
        slice.renewContract("p1")
        expect(h.state().contracts[0]).toEqual(contract)
    })
})

describe("releasePlayer — the manager's paid release (roster cap dead end)", () => {
    // Eternal Flame starts with nine senior players: over the cap of seven.
    const nine = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"]
    function overCap() {
        return makeHarness(makeBaseState({
            lastRngSeed: 7,
            teams: [makeTeam("player", { rosterIds: [...nine], budget: 500_000, chemistry: 60 } as Partial<TeamSaveData>), makeTeam("ai", { rosterIds: ["a1", "a2", "a3", "a4", "a5", "a6"] })],
            players: [...nine, "a1", "a2", "a3", "a4", "a5", "a6", "fa"].map(id => makePlayer(id)),
            contracts: [
                ...nine.map(id => ({ playerId: id, teamId: "player", salaryPerWeek: 2_000, startWeek: 1, endWeek: 30, buyout: 0 })),
                { playerId: "a1", teamId: "ai", salaryPerWeek: 1_000, startWeek: 1, endWeek: 60, buyout: 0 },
            ] as ContractSaveData[],
        }))
    }

    test("signing is refused over the cap with a message that says what to do", () => {
        const h = overCap()
        const slice = createTransferContractSlice(h.set, h.get)
        const r = slice.transferPlayer("fa", null, "player", 0, { salaryPerWeek: 500, startWeek: 10, endWeek: 62, buyout: 0 })
        expect(r.success).toBe(false)
        expect(r.message).toMatch(/9 senior players, and the limit is 7/)
        expect(r.message).toMatch(/Release or sell 3 players/)
    })

    test("pays the rest of the contract, frees the player, and opens a slot once under the cap", () => {
        const h = overCap()
        const slice = createTransferContractSlice(h.set, h.get)
        for (const id of ["p9", "p8", "p7"]) {
            const r = slice.releasePlayer(id)
            expect(r.success).toBe(true)
            // 20 weeks left (week 10 → 30) at $2,000.
            expect(r.message).toContain("Paid $40,000")
        }
        const s = h.state()
        const team = s.teams.find(t => t.id === "player")!
        expect(team.rosterIds).toEqual(["p1", "p2", "p3", "p4", "p5", "p6"])
        expect(team.budget).toBe(500_000 - 3 * 40_000)
        expect(s.contracts.some(c => ["p7", "p8", "p9"].includes(c.playerId))).toBe(false)
        expect(s.financeLedger.filter(e => e.category === "WAGES_PLAYER" && e.amount === 40_000)).toHaveLength(3)
        expect(s.transferHistory.filter(t => t.type === "RELEASE")).toHaveLength(3)
        expect(team.chemistry).toBe(30) // −10 per roster change
        // Now a signing fits.
        expect(slice.transferPlayer("fa", null, "player", 0, { salaryPerWeek: 500, startWeek: 10, endWeek: 62, buyout: 0 }).success).toBe(true)
    })

    test("refuses what the club can't pay, below a starting five, and other clubs' players", () => {
        const poor = overCap()
        poor.set(draft => { draft.teams[0].budget = 39_999 })
        const r = createTransferContractSlice(poor.set, poor.get).releasePlayer("p9")
        expect(r.success).toBe(false)
        expect(r.message).toContain("costs $40,000 (20 weeks at $2,000/wk)")
        expect(poor.state().teams[0].rosterIds).toContain("p9")

        const five = overCap()
        five.set(draft => { draft.teams[0].rosterIds = ["p1", "p2", "p3", "p4", "p5"] })
        expect(createTransferContractSlice(five.set, five.get).releasePlayer("p5").success).toBe(false)

        const ai = overCap()
        const before = ai.state()
        expect(createTransferContractSlice(ai.set, ai.get).releasePlayer("a1").success).toBe(false)
        expect(ai.state().teams).toBe(before.teams)
        expect(ai.state().contracts).toBe(before.contracts)
    })
})
