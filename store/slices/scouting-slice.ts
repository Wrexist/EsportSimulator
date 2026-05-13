"use client"

import type { ScoutingState, ScoutingActions, SliceCreator } from "@/store/types"

export const scoutingInitialState: ScoutingState = {
  scoutedPlayers: [],
  activeScoutingMission: undefined,
  watchlistedPlayerIds: [],
}

export const createScoutingSlice: SliceCreator<ScoutingActions> = (set, get) => ({
  startScoutingMission: (playerId: string) => {
    const currentState = get()
    if (currentState.activeScoutingMission) {
      get().addToast({ message: "Already scouting a player! Wait for the current mission to finish.", type: "warning" })
      return
    }
    if (currentState.scoutedPlayers.some(s => s.playerId === playerId)) {
      get().addToast({ message: "This player has already been scouted.", type: "info" })
      return
    }
    set((state) => {

      // Find scout staff from team roster
      const scoutStaff = state.staff.find(s =>
        s.role === "scout" && s.teamId === state.playerTeamId
      ) || state.staff.find(s => s.role === "scout")
      const scoutId = scoutStaff?.id || "default_scout"

      const team = state.teams.find(t => t.id === state.playerTeamId)
      if (!team || team.budget < 3000) {
        return
      }

      // Scout level determines duration: higher level = faster scouting
      const scoutLevel = scoutStaff?.level ?? 1
      const duration = Math.max(1, 5 - scoutLevel) // L1=4wk, L2=3wk, L3=2wk, L4+=1wk

      state.activeScoutingMission = {
        playerId,
        startWeek: state.currentWeek,
        completionWeek: state.currentWeek + duration,
        scoutId,
      }

      // Deduct scouting cost
      team.budget -= 3000 // BASIC cost
    })
  },

  getScoutingLevel: (playerId: string) => {
    const state = get()
    // Own team players are always fully scouted
    const team = state.teams.find(t => t.id === state.playerTeamId)
    if (team?.rosterIds.includes(playerId)) {
      return "ELITE"
    }

    const entry = state.scoutedPlayers.find(s => s.playerId === playerId)
    return entry?.scoutLevel || "NONE"
  },

  isPlayerScouted: (playerId: string) => {
    const state = get()
    // Own team players are always scouted
    const team = state.teams.find(t => t.id === state.playerTeamId)
    if (team?.rosterIds.includes(playerId)) {
      return true
    }

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
