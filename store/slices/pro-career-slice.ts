"use client"

/**
 * Pro career slice (C10): start a pro career on the loaded club
 * (engine/pro-career.ts). Saved at once, like the sandbox switch.
 */

import type { SliceCreator } from "@/store/types"
import type { GameSave } from "@/engine/save-types"
import { startProCareer, type ProStartInput } from "@/engine/pro-career"
import { newFirstSession } from "@/lib/first-session"

export interface ProCareerActions {
    startProCareer: (input: ProStartInput) => boolean
}

export const createProCareerSlice: SliceCreator<ProCareerActions> = (set, get) => ({
    startProCareer: (input) => {
        if (!get().saveId || get().proCareer) return false
        let ok = false
        set((state) => {
            ok = !!startProCareer(state as unknown as GameSave, input)
            // START-09: the first-session guide is the manager's checklist
            // (finances, signings): a pro career starts without it.
            if (ok) {
                state.firstSession = { ...newFirstSession(), status: "dismissed" }
                state.tutorialCompleted = true
            }
        })
        if (ok) void get().saveGame()
        return ok
    },
})
