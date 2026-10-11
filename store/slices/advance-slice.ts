"use client"

/**
 * Advance slice (Phase 4 stream 4.1): "Continue to next decision" and the
 * weekly report's UI state.
 *
 * continueToNextDecision runs the existing advance actions (advanceDay in
 * daily mode, advanceWeek in weekly mode) one step at a time and checks the
 * stop conditions (lib/advance-stops.ts) before every step. It stops on the
 * first signal the manager has not seen yet and says why; a playable match
 * always stops it. Every guard of the underlying actions still applies (no
 * career, game over, loading, the forfeit rules of an unplayable fixture).
 */

import { CONTINUE_WEEK_CAP, nextStop, type AdvanceStop, type StopSource } from "@/lib/advance-stops"
import type { WeekReportsState } from "@/lib/week-report"

export interface ContinueRunState {
    startedWeek: number
    weeksDone: number
    daysDone: number
    cancelRequested: boolean
}

export interface AdvanceStopNotice extends AdvanceStop {
    week: number
    day: number
}

export interface AdvanceState {
    /** Last weekly reports + this week's tracker (saved, compact). */
    weekReports: WeekReportsState | null
    /** Transient: a Continue run in progress. */
    continueRun: ContinueRunState | null
    /** Transient: why the last Continue stopped. */
    advanceStop: AdvanceStopNotice | null
    /** Transient: stop keys already shown (Continue passes them next time). */
    advanceSeenKeys: string[]
    /** Transient: week whose report is open in the modal. */
    weekReportOpen: number | null
    /** Transient: week whose report is offered by the compact (daily mode) toast. */
    weekReportToast: number | null
}

export interface AdvanceActions {
    continueToNextDecision: () => Promise<void>
    cancelContinue: () => void
    dismissAdvanceStop: () => void
    openWeekReport: (week?: number) => void
    closeWeekReport: () => void
    dismissWeekReportToast: () => void
}

/** What the slice needs from the rest of the store. */
interface AdvanceHost extends StopSource {
    saveId: string | null
    isLoading: boolean
    error: string | null
    gameOverReason: string | null
    timeMode: "WEEKLY" | "HYBRID_DAILY"
    currentDay: number
    advanceDay: () => Promise<void>
    advanceWeek: () => Promise<void>
}

type Store = AdvanceHost & AdvanceState & AdvanceActions
type SetFn = (partial: Partial<Store> | ((draft: Store) => void)) => void

/** Pause between day steps so the date visibly ticks and Cancel can land. */
const DAY_STEP_MS = 140
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

let stepping = false
/**
 * True while a Continue run is executing one of its own steps. The advance
 * actions refuse other callers (e.g. the Space hotkey) during a run so a
 * stray key press cannot advance past a stop.
 */
export function isContinueStepping(): boolean { return stepping }

export const initialAdvanceState: AdvanceState = {
    weekReports: null,
    continueRun: null,
    advanceStop: null,
    advanceSeenKeys: [],
    weekReportOpen: null,
    weekReportToast: null,
}

export const createAdvanceSlice = (set: SetFn, get: () => Store): AdvanceActions => ({
    continueToNextDecision: async () => {
        const start = get()
        if (start.continueRun || start.isLoading || start.gameOverReason || !start.saveId || !start.playerTeamId) return
        const saveId = start.saveId
        set({ continueRun: { startedWeek: start.currentWeek, weeksDone: 0, daysDone: 0, cancelRequested: false }, advanceStop: null, weekReportToast: null })

        const seen = new Set(start.advanceSeenKeys)
        let stop: AdvanceStop | null = null
        let lastCompletedWeek: number | null = null
        try {
            // Hard bound well above the week cap (7 days per week in daily mode).
            for (let step = 0; step < (CONTINUE_WEEK_CAP + 1) * 8; step++) {
                const s = get()
                if (s.saveId !== saveId) return
                stop = nextStop(s, seen)
                if (stop) break
                const run = s.continueRun
                if (!run || run.cancelRequested) { stop = { key: "cancelled", kind: "cancelled", reason: "Paused" }; break }
                if (run.weeksDone >= CONTINUE_WEEK_CAP) {
                    stop = { key: "cap", kind: "cap", reason: `${CONTINUE_WEEK_CAP} weeks passed with nothing needing you` }
                    break
                }

                const week = s.currentWeek, day = s.currentDay
                stepping = true
                try {
                    if (s.timeMode === "HYBRID_DAILY") await s.advanceDay()
                    else await s.advanceWeek()
                } finally {
                    stepping = false
                }

                const after = get()
                if (after.saveId !== saveId) return
                const movedWeek = after.currentWeek !== week
                if (!movedWeek && after.currentDay === day) {
                    stop = { key: "error", kind: "error", reason: after.error ? `The week could not advance: ${after.error}` : "The calendar could not advance" }
                    break
                }
                if (movedWeek) lastCompletedWeek = week
                set(draft => {
                    if (!draft.continueRun) return
                    draft.continueRun.daysDone += 1
                    if (movedWeek) draft.continueRun.weeksDone += 1
                })
                await pause(s.timeMode === "HYBRID_DAILY" && !movedWeek ? DAY_STEP_MS : 0)
            }
        } finally {
            if (get().saveId === saveId) {
                const end = get()
                const notice = stop ? { ...stop, week: end.currentWeek, day: end.currentDay } : null
                set(draft => {
                    draft.continueRun = null
                    draft.advanceStop = notice
                    if (stop && stop.kind !== "match" && stop.kind !== "cancelled" && stop.kind !== "cap" && stop.kind !== "error" && !draft.advanceSeenKeys.includes(stop.key)) {
                        draft.advanceSeenKeys.push(stop.key)
                        if (draft.advanceSeenKeys.length > 200) draft.advanceSeenKeys.splice(0, draft.advanceSeenKeys.length - 200)
                    }
                    if (lastCompletedWeek != null && draft.weekReports?.history.some(r => r.week === lastCompletedWeek)) {
                        draft.weekReportOpen = lastCompletedWeek
                    }
                })
            }
        }
    },

    cancelContinue: () => set(draft => { if (draft.continueRun) draft.continueRun.cancelRequested = true }),

    dismissAdvanceStop: () => set({ advanceStop: null }),

    openWeekReport: (week) => {
        const history = get().weekReports?.history ?? []
        const target = week ?? history[0]?.week
        if (target == null || !history.some(r => r.week === target)) return
        set({ weekReportOpen: target, weekReportToast: null })
    },

    closeWeekReport: () => set({ weekReportOpen: null }),

    dismissWeekReportToast: () => set({ weekReportToast: null }),
})
