/**
 * Regression tests for audit wave 3 fixes:
 *  - facility upgrades reach match strength (paid-but-inert P0)
 *  - retired players can't be signed; expired contracts can't be renewed
 */

import { produce, enableMapSet } from "immer"
import { calculateTeamStrength } from "@/engine/match/team-strength"
import { createTransferContractSlice } from "@/store/slices/transfer-contract-slice"
import type { StoreState } from "@/store/types"
import type { Team, Player } from "@/types"

enableMapSet()

function makeHarness(initial: Partial<StoreState>) {
    let state = initial as StoreState
    const set = (patch: Partial<StoreState> | ((draft: StoreState) => void)) => {
        state = typeof patch === "function" ? produce(state, patch as (s: StoreState) => void) : { ...state, ...patch }
    }
    return { state: () => state, set, get: () => state }
}

const simPlayer = (id: string) => ({
    id, skill: 70, energy: 100, form: 70, fatigue: 0, morale: 70, role: "RIFLER",
}) as unknown as Player

describe("facility upgrades reach match strength", () => {
    const players = ["a", "b", "c", "d", "e"].map(simPlayer)
    const baseTeam = {
        id: "t", name: "T", chemistry: 50, equipment: [],
        facilitiesLevel: 1, // legacy scalar — never mutated by upgrades
    } as unknown as Team

    test("upgraded facilities array increases strength vs level-1 (scalar was stale)", () => {
        const noUpgrades = calculateTeamStrength(baseTeam, players, {})
        const upgraded = calculateTeamStrength(
            { ...baseTeam, facilities: [{ type: "TRAINING", level: 5 }] } as unknown as Team,
            players, {},
        )
        expect(upgraded).toBeGreaterThan(noUpgrades)
    })

    test("missing/legacy-only facilities still works (no crash, scalar honored)", () => {
        const legacyOnly = calculateTeamStrength(
            { ...baseTeam, facilitiesLevel: 5 } as unknown as Team, players, {},
        )
        expect(legacyOnly).toBeGreaterThan(calculateTeamStrength(baseTeam, players, {}))
    })
})

describe("lifecycle guards", () => {
    function makeState() {
        return {
            currentWeek: 10,
            playerTeamId: "player",
            teams: [
                { id: "player", name: "P", rosterIds: [], budget: 500_000, staffIds: [], trophies: [] },
                { id: "seller", name: "S", rosterIds: ["ret1"], budget: 100_000, staffIds: [], trophies: [] },
            ],
            players: [
                { id: "ret1", nickname: "OldGuy", isRetired: true, age: 35 },
                { id: "act1", nickname: "Active", age: 24 },
            ],
            contracts: [
                { id: "c1", playerId: "ret1", teamId: "seller", salaryPerWeek: 1000, startWeek: 1, endWeek: 80, buyout: 10_000 },
                { id: "c2", playerId: "act1", teamId: "player", salaryPerWeek: 1000, startWeek: 1, endWeek: 8, buyout: 10_000 }, // expired (week 10)
            ],
            financeLedger: [], scheduledMatches: [], completedMatches: [], toasts: [], lastRngSeed: 1,
            addToast: () => {},
        } as unknown as Partial<StoreState>
    }

    test("transferPlayer refuses a retired player", () => {
        const h = makeHarness(makeState())
        const slice = createTransferContractSlice(h.set, h.get)
        const res = slice.transferPlayer("ret1", "seller", "player", 10_000, {
            salaryPerWeek: 2000, startWeek: 10, endWeek: 62, buyout: 50_000,
        })
        expect(res.success).toBe(false)
        expect(res.message).toContain("retired")
        expect(h.state().teams.find(t => t.id === "player")!.budget).toBe(500_000) // not charged
    })

    test("renewContract refuses an already-expired contract", () => {
        const h = makeHarness(makeState())
        const slice = createTransferContractSlice(h.set, h.get)
        slice.renewContract("act1") // endWeek 8 <= currentWeek 10
        const c = h.state().contracts.find(x => x.playerId === "act1")!
        expect(c.endWeek).toBe(8) // unchanged — not extended
    })
})
