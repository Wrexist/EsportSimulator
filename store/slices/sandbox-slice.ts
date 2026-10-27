"use client"

/**
 * Sandbox slice (C9): turn the per-save editor on and apply its edits
 * (engine/sandbox.ts). Each change is saved at once, like a transfer.
 */

import type { SliceCreator } from "@/store/types"
import { applySandboxEdit, enableSandbox, type SandboxEdit, type SandboxResult } from "@/engine/sandbox"

export interface SandboxActions {
    enableSandbox: () => void
    sandboxEdit: (edit: SandboxEdit) => SandboxResult
}

export const createSandboxSlice: SliceCreator<SandboxActions> = (set, get) => ({
    enableSandbox: () => {
        if (!get().saveId || get().sandbox) return
        set((state) => { enableSandbox(state) })
        void get().saveGame()
    },

    sandboxEdit: (edit) => {
        let result: SandboxResult = { ok: false, reason: "The sandbox editor is off for this save" }
        if (!get().sandbox) return result
        set((state) => { result = applySandboxEdit(state, edit) })
        if (result.ok) void get().saveGame()
        return result
    },
})
