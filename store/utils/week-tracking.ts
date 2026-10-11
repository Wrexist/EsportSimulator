/**
 * In-week change tracking for the weekly report (Phase 4 stream 4.1).
 *
 * The week's baseline snapshot lives in `weekReports.tracker` (saved, so a
 * reload mid-week keeps it). Store actions with a known cause (a match
 * result, a drill, an event choice) are wrapped: snapshot before, run, diff
 * after, and append the attributed entries to the tracker.
 */

import { diffClubs, snapshotClub, type ChangeCause, type ClubSource } from "@/lib/week-changes"
import { appendTrackerChanges, newTracker, type WeekReportsState, type WeekTracker } from "@/lib/week-report"

export interface TrackingState extends ClubSource {
    saveId: string | null
    playerTeamId: string | null
    weekReports?: WeekReportsState | null
}

/** The tracker for the current week, or a fresh one (baseline = now) if missing or stale. */
export function currentTracker(state: TrackingState, partial = true): WeekTracker | null {
    const teamId = state.playerTeamId
    if (!teamId) return null
    const t = state.weekReports?.tracker
    if (t && t.week === state.currentWeek && t.teamId === teamId) return t
    const baseline = snapshotClub(state, teamId)
    return baseline ? newTracker(baseline, partial) : null
}

/** `weekReports` with a valid tracker for the current week (history untouched). */
export function withTracker(state: TrackingState, partial = true): WeekReportsState | null {
    const tracker = currentTracker(state, partial)
    if (!tracker) return state.weekReports ?? null
    if (state.weekReports?.tracker === tracker) return state.weekReports
    return { tracker, history: state.weekReports?.history ?? [] }
}

type SetFn = (partial: Record<string, unknown> | ((draft: TrackingState) => void)) => void

/**
 * Wrap a store action so the managed-club changes it makes are recorded with
 * `causeOf` (evaluated after the action, so it can read the result).
 * Async actions are recorded when their promise settles.
 */
export function recordWeekChanges<A extends unknown[], R>(
    get: () => TrackingState,
    set: SetFn,
    action: (...args: A) => R,
    causeOf: (state: TrackingState, ...args: A) => ChangeCause | null,
): (...args: A) => R {
    return (...args: A): R => {
        const start = get()
        const teamId = start.playerTeamId
        if (!teamId || !start.saveId) return action(...args)
        // Fix the week's baseline BEFORE the action mutates anything, else the
        // action's own effect would vanish into the baseline.
        const ensured = withTracker(start)
        if (ensured && ensured !== start.weekReports) set({ weekReports: ensured })
        const before = snapshotClub(get(), teamId)
        const finish = () => {
            const now = get()
            if (now.playerTeamId !== teamId || now.saveId !== start.saveId) return
            const cause = causeOf(now, ...args)
            if (!cause) return
            const entries = diffClubs(before, snapshotClub(now, teamId), cause)
            if (entries.length === 0) return
            set(draft => {
                const tracker = draft.weekReports?.tracker
                if (!tracker || tracker.week !== draft.currentWeek || tracker.teamId !== teamId) return
                appendTrackerChanges(tracker, entries)
            })
        }
        const out = action(...args)
        if (out && typeof (out as unknown as Promise<unknown>).then === "function") {
            return (out as unknown as Promise<unknown>).then(value => { finish(); return value }) as unknown as R
        }
        finish()
        return out
    }
}
