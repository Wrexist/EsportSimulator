"use client"

/**
 * Match-UI slice.
 *
 * Holds the four transient-state actions for the live match shell:
 * which match is "active" (so the route guard can warn the user about
 * leaving mid-match), the running ActiveMatchState the live-match hook
 * mirrors, and per-side custom tactical loadouts.
 *
 * Extracted from game-store.ts. Trivially safe — each action mutates a
 * single state property and reads nothing else.
 */

import type { SliceCreator } from "@/store/types"
import type { ActiveMatchState, CustomTactics, TacticalStrategy } from "@/types"

export interface MatchUIActions {
    setActiveMatch: (id: string | null) => void
    updateActiveMatchState: (state: ActiveMatchState) => void
    clearActiveMatchState: () => void
    updateCustomTactic: (id: keyof CustomTactics, side: "ct" | "t", strategy: TacticalStrategy) => void
}

export const createMatchUISlice: SliceCreator<MatchUIActions> = (set) => ({
    setActiveMatch: (id) => set({ activeMatchId: id }),
    updateActiveMatchState: (newState) => set({ activeMatchState: newState }),
    clearActiveMatchState: () => set({ activeMatchState: null, activeMatchId: null }),
    updateCustomTactic: (id, side, tactic) => {
        set((state) => {
            if (!state.customTactics[id]) return
            state.customTactics[id][side] = tactic
        })
    },
})
