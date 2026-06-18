"use client"

/**
 * Scouting slice.
 *
 * Owns mission lifecycle and watchlist actions. Extracted from
 * game-store.ts. All team lookups inside set() go through
 * state.teams.find() — see ARCHITECTURE.md on why _teamIndex.get()
 * mutations don't propagate to state.teams[i] under Immer.
 */

import type { ScoutingActions, SliceCreator } from "@/store/types"
import { getSpecializationMultiplier } from "@/engine/staff-specialization"

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

            const team = state.teams.find(t => t.id === state.playerTeamId)
            if (!team || team.budget < SCOUTING_COST_BASIC) {
                return
            }

            // Scout level sets the base duration (L1=4wk … L4+=1wk); a high
            // scoutingSpeed stat (× specialist bonus) shaves up to 2 more weeks.
            // L1=4wk, L2=3wk, L3=2wk, L4+=1wk
            const scoutLevel = scoutStaff?.level ?? 1
            const scoutSpeed = scoutStaff
                ? (scoutStaff.stats?.scoutingSpeed ?? 0) * getSpecializationMultiplier(scoutStaff)
                : 0
            const speedBonus = Math.floor(scoutSpeed / 50) // 0–2 weeks faster
            const duration = Math.max(1, 5 - scoutLevel - speedBonus)

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
        const team = state.teams.find(t => t.id === state.playerTeamId)
        if (team?.rosterIds.includes(playerId)) return "ELITE"

        const entry = state.scoutedPlayers.find(s => s.playerId === playerId)
        return entry?.scoutLevel || "NONE"
    },

    isPlayerScouted: (playerId: string) => {
        const state = get()
        const team = state.teams.find(t => t.id === state.playerTeamId)
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
