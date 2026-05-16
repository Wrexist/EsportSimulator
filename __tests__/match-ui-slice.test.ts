/**
 * Tests for the match-UI slice — the four transient-state setters
 * the live-match shell uses.
 */

import { produce, enableMapSet } from "immer"
import { createMatchUISlice } from "@/store/slices/match-ui-slice"
import type { ActiveMatchState, TacticalStrategy } from "@/types"
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

function makeBaseState(overrides: Partial<StoreState> = {}): Partial<StoreState> {
    return {
        activeMatchId: null,
        activeMatchState: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        customTactics: {
            Dust2: { ct: "DEFAULT", t: "DEFAULT" },
            Mirage: { ct: "DEFAULT", t: "DEFAULT" },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    }
}

describe("match-ui slice", () => {
    test("setActiveMatch writes the id; null clears it", () => {
        const h = makeHarness(makeBaseState())
        const slice = createMatchUISlice(h.set, h.get)
        slice.setActiveMatch("m_42")
        expect(h.state().activeMatchId).toBe("m_42")
        slice.setActiveMatch(null)
        expect(h.state().activeMatchId).toBeNull()
    })

    test("updateActiveMatchState replaces the live mirror wholesale", () => {
        const h = makeHarness(makeBaseState())
        const slice = createMatchUISlice(h.set, h.get)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const liveState = { roundNumber: 5, score: { ct: 3, t: 2 } } as any as ActiveMatchState
        slice.updateActiveMatchState(liveState)
        expect(h.state().activeMatchState).toBe(liveState)
    })

    test("clearActiveMatchState nulls both fields together (route-leave path)", () => {
        const h = makeHarness(makeBaseState({
            activeMatchId: "m_42",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            activeMatchState: { roundNumber: 5 } as any,
        }))
        const slice = createMatchUISlice(h.set, h.get)
        slice.clearActiveMatchState()
        expect(h.state().activeMatchId).toBeNull()
        expect(h.state().activeMatchState).toBeNull()
    })

    test("updateCustomTactic writes the (map, side) → strategy slot", () => {
        const h = makeHarness(makeBaseState())
        const slice = createMatchUISlice(h.set, h.get)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        slice.updateCustomTactic("Mirage" as any, "ct", "AGGRESSIVE" as any as TacticalStrategy)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((h.state().customTactics as any).Mirage.ct).toBe("AGGRESSIVE")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((h.state().customTactics as any).Mirage.t).toBe("DEFAULT")
    })

    test("updateCustomTactic is a no-op for an unknown map id", () => {
        const h = makeHarness(makeBaseState())
        const slice = createMatchUISlice(h.set, h.get)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        slice.updateCustomTactic("GhostMap" as any, "ct", "AGGRESSIVE" as any as TacticalStrategy)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((h.state().customTactics as any).GhostMap).toBeUndefined()
    })
})
