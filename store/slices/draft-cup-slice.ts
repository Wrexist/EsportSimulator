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
import { evaluatePostTickAchievements } from "@/engine/processors/post-tick-achievements"
import { isOpenDecision } from "@/engine/decision-deadlines"

/**
 * Audit 17 MODES-04: the run is over and Continue is locked, so a decision
 * still waiting could never be answered: each one lapses (no effects).
 */
export function closeDraftCupDecisions(save: Pick<GameSave, "eventsLog" | "acknowledgedEventIds" | "currentWeek">): number {
    let n = 0
    for (const e of save.eventsLog) {
        if (!isOpenDecision(e)) continue
        e.selectedChoiceId = "expired"
        e.acknowledged = true
        e.data = { ...e.data, resolvedWeek: save.currentWeek }
        if (!save.acknowledgedEventIds.includes(e.id)) save.acknowledgedEventIds.push(e.id)
        n++
    }
    return n
}

export interface DraftCupActions {
    /** Stores the finished run's outcome on the save (idempotent); false while the run is still going. */
    settleDraftCup: () => Promise<boolean>
}

export const createDraftCupSlice: SliceCreator<DraftCupActions> = (set, get) => ({
    settleDraftCup: async () => {
        const state = get()
        const cup = state.draftCup
        if (!cup) return false
        if (cup.result) {
            // A run settled before MODES-04 may still hold an open decision.
            if (state.eventsLog.some(isOpenDecision)) {
                set((s) => { closeDraftCupDecisions(s as unknown as GameSave) })
                try { await get().saveGame() } catch { /* closed again on the next load */ }
            }
            return true
        }
        const outcome = draftCupOutcome(state as never)
        if (!outcome) return false
        const team = state.teams.find(t => t.id === cup.teamId)
        set((s) => {
            // The run ends with the cup, so no week tick follows to hand out
            // the trophy, prize money and title contract bonuses: settle the
            // cup's rewards now (deduped, so a later tick never pays twice).
            updateStandings(s as unknown as GameSave, undefined, undefined, undefined, cup.tournamentId)
            if (s.draftCup) s.draftCup = { ...s.draftCup, result: { ...outcome, finishedWeek: s.currentWeek } }
            closeDraftCupDecisions(s as unknown as GameSave)
        })
        // No week tick follows the final, so the cup's title counts for
        // the achievements here ("Champion", MODES-03).
        try { evaluatePostTickAchievements(get() as unknown as GameSave) } catch { /* achievements never block the result */ }
        recordDraftCupRun({
            saveId: state.saveId ?? "",
            teamName: team?.name ?? "Draft side",
            difficulty: cup.difficulty,
            finish: outcome.finish,
            score: outcome.score,
            at: new Date().toISOString(),
            // Audit 17 MODES-10: a run with the editor on is marked in the list.
            ...(state.sandbox ? { sandbox: true } : {}),
        })
        try { await get().saveGame() } catch { /* the result is also re-derived from the bracket on load */ }
        return true
    },
})
