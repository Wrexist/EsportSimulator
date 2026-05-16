"use client"

/**
 * UI slice.
 *
 * Holds the UI-facing setters/getters that don't belong in a domain
 * slice: theme, transient toasts, celebration / season-recap /
 * legend-pick modal clearers, weekly-activity selector, and four
 * read-only getters used by UI components.
 *
 * `selectLegend` is the only non-trivial action — it pulls a legend out
 * of the (pre-loaded as retired) players array, reactivates them, signs
 * them to a 2-year high-salary contract, and tracks them in
 * signedLegendIds so they aren't offered again.
 *
 * Copied verbatim from the live game-store implementation. All entity
 * lookups go through `_teamIndex`/`_playerIndex` with the same `.find`
 * fallback the rest of the store uses.
 */

import type { UIActions, SliceCreator } from "@/store/types"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { nextDeterministicId } from "@/store/utils/helpers"

export const createUISlice: SliceCreator<UIActions> = (set, get) => ({
    // === Setters ===

    setTheme: (theme) => set({ theme }),

    addToast: (toast) => set((state) => {
        const id = nextDeterministicId(state, "toast")
        state.toasts.push({ ...toast, id })
    }),

    removeToast: (id) => set((state) => {
        state.toasts = state.toasts.filter(t => t.id !== id)
    }),

    clearCelebration: () => set((state) => {
        state.pendingCelebration = null
    }),

    clearPendingSeasonRecap: () => set((state) => {
        state.pendingSeasonRecap = null
    }),

    clearLegendPick: () => set((state) => {
        state.pendingLegendPick = null
    }),

    setWeeklyActivity: (type) => set((state) => {
        state.selectedWeeklyActivity = type
    }),

    selectLegend: (legendId: string) => set((state) => {
        if (!state.pendingLegendPick) return
        const candidates = state.pendingLegendPick.candidates
        if (!candidates.includes(legendId)) return

        // Legends are pre-loaded into the players array as retired.
        const legend = state._playerIndex?.get(legendId)
            ?? state.players.find(p => p.id === legendId)
        if (!legend) return

        const myTeam = state._teamIndex?.get(state.playerTeamId!)
            ?? state.teams.find(t => t.id === state.playerTeamId)
        if (!myTeam) return

        // Reactivate the legend.
        legend.isRetired = false
        legend.retirementWeek = undefined

        // Add to roster — guard against double-add if state is stale.
        if (!myTeam.rosterIds.includes(legendId)) {
            myTeam.rosterIds.push(legendId)
        }

        // Drop any leftover contracts for this player before creating the
        // new one so we never end up with two active contracts on the
        // same player ID (would corrupt wage calculations).
        state.contracts = state.contracts.filter(c => c.playerId !== legendId)

        // High salary baseline for legends: $50k floor + $500/skill.
        // Maxes out around $99.5k/week for a 99-skill legend.
        const legendSalary = Math.round(50000 + legend.skill * 500)
        state.contracts.push({
            playerId: legendId,
            teamId: myTeam.id,
            salaryPerWeek: legendSalary,
            startWeek: state.currentWeek,
            endWeek: state.currentWeek + 104, // 2-year contract
            buyout: legendSalary * 52,
        })

        if (!state.signedLegendIds) state.signedLegendIds = []
        state.signedLegendIds.push(legendId)

        // Clear the pick modal trigger.
        state.pendingLegendPick = null
    }),

    // === Getters ===

    getPlayerTeam: () => {
        const state = get()
        return state._teamIndex?.get(state.playerTeamId!)
            ?? state.teams.find(t => t.id === state.playerTeamId)
    },

    getUpcomingMatches: (limit = 5) => {
        const state = get()
        return state.scheduledMatches
            .filter(m =>
                m.week >= state.currentWeek &&
                !m.stage?.includes("Finished") &&
                (m.homeTeamId === state.playerTeamId || m.awayTeamId === state.playerTeamId)
            )
            // Sort by week, then by day (Mon=0..Sun=6, default 6 if unset).
            .sort((a, b) => {
                if (a.week !== b.week) return a.week - b.week
                return (a.day ?? 6) - (b.day ?? 6)
            })
            .slice(0, limit)
    },

    calculateTeamRating: () => {
        const state = get()
        const playerTeam = state._teamIndex?.get(state.playerTeamId!)
            ?? state.teams.find(t => t.id === state.playerTeamId)
        if (!playerTeam) return 0

        // Top-5 overall ratings, averaged. Returns 1-decimal float.
        const teamPlayers = state.players
            .filter(p => playerTeam.rosterIds.includes(p.id))
            .map(p => evaluatePlayer(p).overallRating)
            .sort((a, b) => b - a)
            .slice(0, 5)

        if (teamPlayers.length === 0) return 0
        const avg = teamPlayers.reduce((sum, r) => sum + r, 0) / teamPlayers.length
        return parseFloat(avg.toFixed(1))
    },

    getDateForWeek: (week) => {
        const state = get()
        const start = new Date(state.gameStartDate)
        const daysToAdd = (week - 1) * 7
        const date = new Date(start)
        date.setDate(date.getDate() + daysToAdd)
        return date
    },
})
