"use client"

/**
 * Draft Cup slice (G7): settles a finished run once (score kept on the save
 * and in the device's best-runs list).
 */

import type { SliceCreator } from "@/store/types"
import { draftCupOutcome } from "@/engine/draft-cup"
import { updateStandings } from "@/engine/processors/standings-processor"
import type { GameSave } from "@/engine/save-types"
import { recordDraftCupRun } from "@/lib/draft-cup-runs"

export interface DraftCupActions {
    /** Stores the finished run's outcome on the save (idempotent); false while the run is still going. */
    settleDraftCup: () => Promise<boolean>
}

export const createDraftCupSlice: SliceCreator<DraftCupActions> = (set, get) => ({
    settleDraftCup: async () => {
        const state = get()
        const cup = state.draftCup
        if (!cup) return false
        if (cup.result) return true
        const outcome = draftCupOutcome(state as never)
        if (!outcome) return false
        const team = state.teams.find(t => t.id === cup.teamId)
        set((s) => {
            // The run ends with the cup, so no week tick follows to hand out
            // the trophy, prize money and title contract bonuses: settle the
            // cup's rewards now (deduped, so a later tick never pays twice).
            updateStandings(s as unknown as GameSave, undefined, undefined, undefined, cup.tournamentId)
            if (s.draftCup) s.draftCup = { ...s.draftCup, result: { ...outcome, finishedWeek: s.currentWeek } }
        })
        recordDraftCupRun({
            saveId: state.saveId ?? "",
            teamName: team?.name ?? "Draft side",
            difficulty: cup.difficulty,
            finish: outcome.finish,
            score: outcome.score,
            at: new Date().toISOString(),
        })
        try { await get().saveGame() } catch { /* the result is also re-derived from the bracket on load */ }
        return true
    },
})
