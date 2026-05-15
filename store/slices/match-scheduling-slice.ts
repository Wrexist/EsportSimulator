"use client"

/**
 * Match-scheduling slice.
 *
 * Two scheduling actions for the player's calendar:
 *   - scheduleScrim — book a BO1 practice match vs another team for a
 *     specific week/day (slot capacity rules apply).
 *   - scheduleActivity — book a multi-week activity block (bootcamp,
 *     marketing, etc.) with capacity + bootcamp-fatigue gating.
 *
 * Both validate bounds via parseBoundedInt, check capacity (max 10
 * slots/week, max 2 events/day in HYBRID_DAILY mode), and refuse to
 * schedule in past days of the current week.
 *
 * Copied from the live game-store implementation. No cross-slice
 * action calls.
 */

import type { SliceCreator } from "@/store/types"
import type { ActivitySaveData } from "@/engine/save-types"
import {
    parseBoundedInt,
    nextDeterministicId,
    MAX_TRANSFER_FEE,
} from "@/store/utils/helpers"

const MAX_WEEKLY_SLOTS = 10
const MAX_DAILY_EVENTS = 2
const MAX_ACTIVITY_DURATION_WEEKS = 52
const MAX_FUTURE_WEEK = 100000
const BOOTCAMP_FATIGUE_THRESHOLD = 80

export interface MatchSchedulingActions {
    scheduleScrim: (opponentId: string, week: number, day?: number) => { success: boolean; message: string }
    scheduleActivity: (activity: ActivitySaveData) => { success: boolean; message: string }
}

export const createMatchSchedulingSlice: SliceCreator<MatchSchedulingActions> = (set, get) => ({
    scheduleScrim: (opponentId, week, day) => {
        const state = get()
        const weekValidation = parseBoundedInt(week, "Scrim week", state.currentWeek, MAX_FUTURE_WEEK)
        if (!weekValidation.ok) {
            return { success: false, message: weekValidation.message }
        }
        const normalizedWeek = weekValidation.value

        let normalizedDay: number | undefined = undefined
        if (day !== undefined) {
            const dayValidation = parseBoundedInt(day, "Scrim day", 0, 6)
            if (!dayValidation.ok) {
                return { success: false, message: dayValidation.message }
            }
            normalizedDay = dayValidation.value
        }

        // HYBRID_DAILY: refuse scheduling into a day that's already past.
        if (
            state.timeMode === "HYBRID_DAILY" &&
            normalizedWeek === state.currentWeek &&
            normalizedDay !== undefined &&
            normalizedDay < state.currentDay
        ) {
            return { success: false, message: "Cannot schedule events in past days of the current week." }
        }

        const weekActivities = state.scheduledActivities.filter(
            a => normalizedWeek >= a.week && normalizedWeek < a.week + a.duration
        )
        const weekMatches = state.scheduledMatches.filter(m => m.week === normalizedWeek)

        // Duplicate-scrim guard: same opponent, same week, same day slot.
        const duplicateScrim = weekMatches.some(m =>
            m.isScrim &&
            m.homeTeamId === state.playerTeamId &&
            m.awayTeamId === opponentId &&
            (normalizedDay === undefined || (m.day ?? undefined) === normalizedDay)
        )
        if (duplicateScrim) {
            return { success: false, message: "Scrim already scheduled for this slot" }
        }

        // Per-day capacity (HYBRID_DAILY only — without a day index this
        // check is skipped and the weekly cap below is the bound).
        if (normalizedDay !== undefined) {
            const dayMatches = weekMatches.filter(m => m.day === normalizedDay)
            if (dayMatches.length >= MAX_DAILY_EVENTS) {
                return { success: false, message: `Day schedule is full (max ${MAX_DAILY_EVENTS} events per day)` }
            }
        }

        if (weekActivities.length + weekMatches.length >= MAX_WEEKLY_SLOTS) {
            return { success: false, message: `Weekly schedule is full (max ${MAX_WEEKLY_SLOTS} slots)` }
        }

        set((state) => {
            if (!state.playerTeamId) return
            const id = nextDeterministicId(state, "scrim", normalizedWeek, opponentId)
            state.scheduledMatches.push({
                id,
                homeTeamId: state.playerTeamId,
                awayTeamId: opponentId,
                tournamentId: "SCRIM",
                stage: "Practice",
                week: normalizedWeek,
                day: normalizedDay,
                format: "BO1",
                seed: 0,
                isScrim: true,
            })
        })
        return { success: true, message: "Scrim scheduled" }
    },

    scheduleActivity: (activity) => {
        const state = get()
        const weekValidation = parseBoundedInt(activity.week, "Activity week", state.currentWeek, MAX_FUTURE_WEEK)
        if (!weekValidation.ok) {
            return { success: false, message: weekValidation.message }
        }
        const durationValidation = parseBoundedInt(activity.duration, "Activity duration", 1, MAX_ACTIVITY_DURATION_WEEKS)
        if (!durationValidation.ok) {
            return { success: false, message: durationValidation.message }
        }
        // Cost may be missing on some activity shapes; fall back to 0.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const costValidation = parseBoundedInt((activity as any).cost ?? 0, "Activity cost", 0, MAX_TRANSFER_FEE)
        if (!costValidation.ok) {
            return { success: false, message: costValidation.message }
        }

        const dayInput = activity.day
        if (dayInput !== undefined) {
            const dayValidation = parseBoundedInt(dayInput, "Activity day", 0, 6)
            if (!dayValidation.ok) {
                return { success: false, message: dayValidation.message }
            }
        }

        const normalizedActivity = {
            ...activity,
            week: weekValidation.value,
            duration: durationValidation.value,
            cost: costValidation.value,
            day: dayInput !== undefined ? Math.floor(dayInput) : undefined,
        }

        if (
            state.timeMode === "HYBRID_DAILY" &&
            normalizedActivity.week === state.currentWeek &&
            normalizedActivity.day !== undefined &&
            normalizedActivity.day < state.currentDay
        ) {
            return { success: false, message: "Cannot schedule events in past days of the current week." }
        }

        const week = normalizedActivity.week
        const weekActivities = state.scheduledActivities.filter(a => week >= a.week && week < a.week + a.duration)
        const weekMatches = state.scheduledMatches.filter(m => m.week === week)

        if (weekActivities.length + weekMatches.length >= MAX_WEEKLY_SLOTS) {
            return { success: false, message: `Weekly schedule is full (max ${MAX_WEEKLY_SLOTS} slots)` }
        }

        // Bootcamps need a rested roster — refuse if the squad is gassed.
        if (normalizedActivity.type === "BOOTCAMP" && normalizedActivity.duration >= 1) {
            const playerTeam = state._teamIndex?.get(state.playerTeamId!)
                ?? state.teams.find(t => t.id === state.playerTeamId)
            const players = state.players.filter(p => playerTeam?.rosterIds.includes(p.id))
            const avgFatigue = players.reduce((acc, p) => acc + p.fatigue, 0) / (players.length || 1)

            if (avgFatigue > BOOTCAMP_FATIGUE_THRESHOLD) {
                return {
                    success: false,
                    message: `Team is too exhausted for a bootcamp (Avg Fatigue > ${BOOTCAMP_FATIGUE_THRESHOLD})`,
                }
            }
        }

        set((state) => {
            state.scheduledActivities.push(normalizedActivity as ActivitySaveData)
        })
        return { success: true, message: "Activity scheduled" }
    },
})
