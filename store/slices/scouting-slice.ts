"use client"

/**
 * Scouting slice.
 *
 * Owns mission lifecycle and watchlist actions. Extracted from
 * game-store.ts using the live (indexed) implementation, not the stale
 * pre-index draft that was deleted. All team lookups go through
 * `_teamIndex` when available with a `.find` fallback so the slice keeps
 * the O(1)-with-fallback pattern the rest of the store uses.
 */

import type { ScoutingActions, SliceCreator } from "@/store/types"

const SCOUTING_COST_BASIC = 3000

export const createScoutingSlice: SliceCreator<ScoutingActions> = (set, get) => ({
    startScoutingMission: (playerId: string) => {
        const currentState = get()
        if (currentState.activeScoutingMission) {
            get().addToast({
                message: "Already scouting a player! Wait for the current mission to finish.",
                type: "warning",
            })
            return
        }
        if (currentState.scoutedPlayers.some(s => s.playerId === playerId)) {
            get().addToast({ message: "This player has already been scouted.", type: "info" })
            return
        }
        set((state) => {
            // Prefer the team's own scout, else any scout on the global staff.
            const scoutStaff = state.staff.find(s =>
                s.role === "scout" && s.teamId === state.playerTeamId
            ) || state.staff.find(s => s.role === "scout")
            const scoutId = scoutStaff?.id || "default_scout"

            const team = state._teamIndex?.get(state.playerTeamId!)
                ?? state.teams.find(t => t.id === state.playerTeamId)
            if (!team || team.budget < SCOUTING_COST_BASIC) {
                return
            }

            // Scout level determines duration: higher level = faster scouting.
            // L1=4wk, L2=3wk, L3=2wk, L4+=1wk
            const scoutLevel = scoutStaff?.level ?? 1
            const duration = Math.max(1, 5 - scoutLevel)

            state.activeScoutingMission = {
                playerId,
                startWeek: state.currentWeek,
                completionWeek: state.currentWeek + duration,
                scoutId,
            }

            team.budget -= SCOUTING_COST_BASIC
        })
    },

    getScoutingLevel: (playerId: string) => {
        const state = get()
        // Own team players are always fully scouted.
        const team = state._teamIndex?.get(state.playerTeamId!)
            ?? state.teams.find(t => t.id === state.playerTeamId)
        if (team?.rosterIds.includes(playerId)) return "ELITE"

        const entry = state.scoutedPlayers.find(s => s.playerId === playerId)
        return entry?.scoutLevel || "NONE"
    },

    isPlayerScouted: (playerId: string) => {
        const state = get()
        const team = state._teamIndex?.get(state.playerTeamId!)
            ?? state.teams.find(t => t.id === state.playerTeamId)
        if (team?.rosterIds.includes(playerId)) return true
        return state.scoutedPlayers.some(s => s.playerId === playerId)
    },

    toggleWatchlistPlayer: (playerId: string) => {
        const state = get()
        const current = state.watchlistedPlayerIds || []
        if (current.includes(playerId)) {
            set({ watchlistedPlayerIds: current.filter(id => id !== playerId) })
        } else {
            set({ watchlistedPlayerIds: [...current, playerId] })
        }
    },

    isPlayerWatchlisted: (playerId: string) => {
        const state = get()
        return (state.watchlistedPlayerIds || []).includes(playerId)
    },
})
