/**
 * MATCHDAY-10: loadout plans are applied by role. The AWP plan (default
 * slot 0) goes to the managed team's AWPer, wherever the AWPer sits in the
 * roster; without an AWPer the plain roster order stays. Both buy paths
 * (performBuyPhase and the script-v1 buy) use the same mapping, and the
 * loadout editor shows it (it imports loadoutSlots).
 */
import { loadoutSlots, performBuyPhase } from "@/engine/match/buy-phase"
import { scriptBuyPhase } from "@/engine/match/round-sim/buy"
import { createDefaultTactics } from "@/engine/default-tactics"
import { SeededRNG } from "@/engine/rng"
import type { PlayerSimulationState } from "@/engine/match/round-outcome"
import type { CustomTactics } from "@/types"

const roster = (roles: string[]) => roles.map((role, i) => ({ id: `p${i}`, role }))
const econ = (players: { id: string }[], cash = 16000): Record<string, PlayerSimulationState> =>
    Object.fromEntries(players.map(p => [p.id, { id: p.id, cash, weapon: "usp", hasArmor: false, hasHelmet: false, hasKit: false, utility: [] }]))

describe("loadoutSlots", () => {
    const full = createDefaultTactics().FULL.ct.playerLoadouts

    test("the AWP slot goes to the AWPer, who swaps with the player who had it", () => {
        // IGL in slot 0 (where the default AWP plan is), AWPer third.
        expect(loadoutSlots(["IGL", "RIFLER", "AWPER", "SUPPORT", "ENTRY_FRAGGER"], full)).toEqual([2, 1, 0, 3, 4])
    })

    test("roster order when the AWPer already has the AWP slot, when there is no AWPer, or no plan", () => {
        expect(loadoutSlots(["AWPER", "IGL", "RIFLER", "SUPPORT", "RIFLER"], full)).toEqual([0, 1, 2, 3, 4])
        expect(loadoutSlots(["IGL", "RIFLER", "RIFLER", "SUPPORT", "ENTRY_FRAGGER"], full)).toEqual([0, 1, 2, 3, 4])
        expect(loadoutSlots(["IGL", "AWPER", "RIFLER", "SUPPORT", "RIFLER"], undefined)).toEqual([0, 1, 2, 3, 4])
    })

    test("the plan's AWP decides, not the slot hint; the hint counts when no slot plans an AWP", () => {
        const moved = full!.map(l => ({ ...l, primaryWeaponId: l.slotIndex === 3 ? "awp" : "m4a1s" }))
        expect(loadoutSlots(["IGL", "AWPER", "RIFLER", "SUPPORT", "RIFLER"], moved)).toEqual([0, 3, 2, 1, 4])
        const eco = createDefaultTactics().ECO.ct.playerLoadouts // every slot a pistol, slot 0 hinted AWPER
        expect(loadoutSlots(["IGL", "AWPER", "RIFLER", "SUPPORT", "RIFLER"], eco)).toEqual([1, 0, 2, 3, 4])
    })

    test("two AWP slots take the AWPers in roster order; one AWPer takes the first", () => {
        const double = createDefaultTactics()["DOUBLE AWP"].ct.playerLoadouts // AWPs in slots 0 and 1
        expect(loadoutSlots(["IGL", "RIFLER", "AWPER", "SUPPORT", "AWPER"], double)).toEqual([2, 4, 0, 3, 1])
        expect(loadoutSlots(["IGL", "RIFLER", "SUPPORT", "AWPER", "RIFLER"], double)).toEqual([3, 1, 2, 0, 4])
    })
})

describe("buys apply the plan by role", () => {
    const roles = ["IGL", "RIFLER", "AWPER", "SUPPORT", "ENTRY_FRAGGER"]
    const tactics: CustomTactics = createDefaultTactics()

    test.each([["performBuyPhase", performBuyPhase], ["scriptBuyPhase", scriptBuyPhase]] as const)("%s gives the AWPer the AWP, not the IGL in slot 0", (_name, buy) => {
        const players = roster(roles)
        const e = econ(players)
        buy(players, e, "FULL", true, new SeededRNG(7), tactics)
        expect(e.p2.weapon).toBe("awp")
        expect(e.p0.weapon).toBe("m4a1s")
        expect(players.filter(p => e[p.id].weapon === "awp")).toHaveLength(1)
    })

    test("without an AWPer the slot order stays (slot 0 buys the AWP)", () => {
        const players = roster(["IGL", "RIFLER", "RIFLER", "SUPPORT", "ENTRY_FRAGGER"])
        const e = econ(players)
        scriptBuyPhase(players, e, "FULL", false, new SeededRNG(7), tactics)
        expect(e.p0.weapon).toBe("awp")
    })
})
