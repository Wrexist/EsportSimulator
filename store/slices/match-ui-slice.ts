"use client"

/**
 * Match-UI slice.
 *
 * Holds the transient-state actions for the live match shell:
 * which match is "active" (so the route guard can warn the user about
 * leaving mid-match), the running ActiveMatchState the live-match hook
 * mirrors, per-side custom tactical loadouts, and the auto-tactics switch
 * (saved with the career at once, so a reload keeps it).
 *
 * Extracted from game-store.ts. Each action mutates a single state
 * property (setAutoTactics then saves the career).
 */

import type { SliceCreator } from "@/store/types"
import type { ActiveMatchState, CustomTactics, TacticalStrategy } from "@/types"

export interface MatchUIActions {
    setActiveMatch: (id: string | null) => void
    updateActiveMatchState: (state: ActiveMatchState) => void
    clearActiveMatchState: () => void
    updateCustomTactic: (id: keyof CustomTactics, side: "ct" | "t", strategy: TacticalStrategy) => void
    setAutoTactics: (on: boolean) => void
}

export const createMatchUISlice: SliceCreator<MatchUIActions> = (set, get) => ({
    setActiveMatch: (id) => set({ activeMatchId: id }),
    updateActiveMatchState: (newState) => set(state => {
        if (newState.playback?.saveId !== undefined && newState.playback.saveId !== state.saveId) return
        if (state.activeMatchId !== newState.matchId || !state.scheduledMatches.some(m => m.id === newState.matchId) || state.completedMatches.some(m => m.id === newState.matchId)) return
        state.activeMatchState = newState
    }),
    clearActiveMatchState: () => set({ activeMatchState: null, activeMatchId: null }),
    updateCustomTactic: (id, side, tactic) => {
        set((state) => {
            if (!state.customTactics[id]) return
            state.customTactics[id][side] = tactic
        })
    },
    setAutoTactics: (on) => {
        if (get().autoTactics === on) return
        set({ autoTactics: on })
        const s = get()
        if (s.isInitialized && s.saveId) void s.saveGame?.()?.catch(() => { /* surfaced by saveGame */ })
    },
})
