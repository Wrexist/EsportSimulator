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
 * All entity lookups go through state.teams.find() / state.players.find()
 * — see ARCHITECTURE.md on why Map-based index lookups break the
 * Immer draft graph and lose mutations.
 */

import type { UIActions, SliceCreator } from "@/store/types"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { soundManager } from "@/lib/sound-manager"
import { useSettingsStore } from "@/lib/settings-store"

// Low-value toast types suppressed when the "Notifications" setting is off.
// Meaningful types (achievement, level_up, warning, error) always show.
const LOW_PRIORITY_TOASTS = new Set(["info", "xp_gain"])

// Map a toast type → matching pre-defined SFX from lib/sound-manager.
// Most of these were already implemented in the manager but had no
// trigger. Hooking addToast wires them up consistently across the
// ~90 toast call sites without having to touch each one.
//
// NOTE: `toast.success(...)` resolves to the "achievement" store type
// (see lib/toast.ts), which covers both rare wins AND routine
// confirmations like "Facility Updated". To avoid the celebratory
// achievement SFX firing 50× per session, we play the light "success"
// SFX for the achievement type and reserve the louder one for the
// explicit "level_up" event.
function toastSoundFor(type: string): string | null {
    switch (type) {
        case "level_up":
            return "achievement"
        case "achievement":
        case "xp_gain":
            return "success"
        case "warning":
        case "error":
            return "error"
        default:
            return "notification"
    }
}

// Transient toast IDs must NOT be drawn from the deterministic game RNG.
// `nextDeterministicId` advances `state.lastRngSeed`, and `advanceWeek`
// seeds the whole week simulation from that seed — so generating toast IDs
// from the RNG meant the number of cosmetic toasts a player happened to
// trigger between ticks would shift the next week's match/transfer results
// (a real reproducibility leak found in audit). Toasts are stripped from
// persistence, so a plain monotonic counter is safe and sufficient.
let toastIdCounter = 0
const nextToastId = (): string =>
    `toast_${Date.now().toString(36)}_${(toastIdCounter++).toString(36)}`

export const createUISlice: SliceCreator<UIActions> = (set, get) => ({
    // === Setters ===

    setTheme: (theme) => set({ theme }),

    addToast: (toast) => {
        // Respect the Notifications setting: when off, drop the chatty
        // info/xp_gain toasts but never the meaningful ones.
        if (LOW_PRIORITY_TOASTS.has(toast.type) && typeof window !== "undefined") {
            try {
                if (!useSettingsStore.getState().notifications) return
            } catch { /* settings store unavailable (tests) — show the toast */ }
        }
        set((state) => {
            const id = nextToastId()
            state.toasts.push({ ...toast, id })
        })
        // Sound after the state push so a successful toast appears in
        // lockstep with its cue, not before the visual lands.
        const sound = toastSoundFor(toast.type)
        if (sound && typeof window !== "undefined") {
            soundManager.play(sound as any)
        }
    },

    removeToast: (id) => set((state) => {
        state.toasts = state.toasts.filter(t => t.id !== id)
    }),

    clearCelebration: () => set((state) => {
        state.pendingCelebration = null
    }),

    dismissWeekReveal: () => set((state) => {
        state.weekReveal = null
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
        const legend = state.players.find(p => p.id === legendId)
        if (!legend) return

        const myTeam = state.teams.find(t => t.id === state.playerTeamId)
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
        return state.teams.find(t => t.id === state.playerTeamId)
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
        const playerTeam = state.teams.find(t => t.id === state.playerTeamId)
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
