"use client"

/**
 * Training slice.
 *
 * Two thin wrappers around TrainingManager for the player team:
 *   - startRoleTraining — kick off a multi-week secondary-role training
 *     session on a player. Returns the manager's success/message.
 *   - cancelRoleTraining — abort an in-progress training session
 *     without refund (matches TrainingManager semantics).
 *
 * Both refuse silently when no player team is selected. Extracted from
 * game-store.ts; immer proxy is cast to GameSave because the manager's
 * static methods expect the concrete shape.
 */

import type { SliceCreator } from "@/store/types"
import type { GameSave } from "@/engine/save-types"
import type { Role } from "@/types"
import { TrainingManager } from "@/engine/training-manager"

export interface TrainingActions {
    startRoleTraining: (playerId: string, targetRole: Role) => { success: boolean; message: string }
    cancelRoleTraining: (playerId: string) => void
}

export const createTrainingSlice: SliceCreator<TrainingActions> = (set) => ({
    startRoleTraining: (playerId, targetRole) => {
        let result = { success: false, message: "Unknown error" }
        set((state) => {
            if (!state.playerTeamId) {
                result = { success: false, message: "No team selected" }
                return
            }
            // Cast through `unknown` — immer's draft proxy type doesn't
            // exactly match GameSave but the manager only reads/mutates
            // shapes that are equivalent at runtime.
            result = TrainingManager.startRoleTraining(
                state as unknown as GameSave,
                state.playerTeamId,
                playerId,
                targetRole,
            )
        })
        return result
    },

    cancelRoleTraining: (playerId) => {
        set((state) => {
            if (!state.playerTeamId) return
            TrainingManager.cancelTraining(state as unknown as GameSave, state.playerTeamId, playerId)
        })
    },
})
