"use client"

import type { UIState, UIActions, SliceCreator } from "@/store/types"
import type { PlayerSaveData, HallOfFameEntry } from "@/engine/save-types"
import { evaluatePlayer } from "@/engine/player-evaluation"

export const uiInitialState: UIState = {
  theme: "onyx",
  availableEquipment: [],
  toasts: [],
  pendingCelebration: null,
  pendingSeasonRecap: null,
  pendingLegendPick: null,
  legendaryPlayers: [],
  hallOfFame: [],
  signedLegendIds: [],
  activelyPlayingLegendIds: [],
  selectedWeeklyActivity: null,
  fplData: undefined,
}

export const createUISlice: SliceCreator<UIActions> = (set, get) => ({
  setTheme: (theme) => set({ theme }),

  addToast: (toast) =>
    set((state) => {
      const id = crypto.randomUUID()
      state.toasts.push({ ...toast, id })
    }),

  removeToast: (id) =>
    set((state) => {
      state.toasts = state.toasts.filter((t) => t.id !== id)
    }),

  clearCelebration: () =>
    set((state) => {
      state.pendingCelebration = null
    }),

  clearPendingSeasonRecap: () =>
    set((state) => {
      state.pendingSeasonRecap = null
    }),

  selectLegend: (legendId: string) =>
    set((state) => {
      if (!state.pendingLegendPick) return
      const candidates = state.pendingLegendPick.candidates
      if (!candidates.includes(legendId)) return

      // Find the legend in the players array (pre-loaded as retired)
      const legend = state.players.find((p) => p.id === legendId)
      if (!legend) return

      const myTeam = state.teams.find((t) => t.id === state.playerTeamId)
      if (!myTeam) return

      // Reactivate the legend
      legend.isRetired = false
      legend.retirementWeek = undefined

      // Add to roster (prevent duplicate roster entries)
      if (!myTeam.rosterIds.includes(legendId)) {
        myTeam.rosterIds.push(legendId)
      }

      // Remove any existing contracts for this player before creating a new one
      state.contracts = state.contracts.filter((c) => c.playerId !== legendId)

      // Create contract (high salary for legends)
      const legendSalary = Math.round(50000 + legend.skill * 500) // $50k–$100k/wk
      state.contracts.push({
        playerId: legendId,
        teamId: myTeam.id,
        salaryPerWeek: legendSalary,
        startWeek: state.currentWeek,
        endWeek: state.currentWeek + 104, // 2-year contract
        buyout: legendSalary * 52,
      })

      // Track to prevent duplicates
      if (!state.signedLegendIds) state.signedLegendIds = []
      if (!state.signedLegendIds.includes(legendId)) {
        state.signedLegendIds.push(legendId)
      }

      // Clear the pick
      state.pendingLegendPick = null
    }),

  clearLegendPick: () =>
    set((state) => {
      state.pendingLegendPick = null
    }),

  addToHallOfFame: (player: PlayerSaveData) =>
    set((state) => {
      // Mark as legendary and add to the legendary players data
      const legendaryPlayer: PlayerSaveData = {
        ...player,
        isLegendary: true,
        isRetired: true,
        retirementWeek: state.currentWeek,
      }
      state.legendaryPlayers.push(legendaryPlayer)

      // Also add a HallOfFameEntry so the player appears in the Hall of Fame UI
      const hofEntry: HallOfFameEntry = {
        id: `hof_${player.id}_${state.currentWeek}`,
        name: player.nickname || player.name || player.id,
        portraitPath: "",
        eraStart: 1,
        eraEnd: state.currentWeek,
        primaryRole: player.role || "Rifler",
        category: "INDUCTED",
        inductionReasons: [
          {
            type: "LONGEVITY",
            label: "Career Achievement",
            icon: "Award",
          },
        ],
        nationality: player.nationality || "",
      }
      state.hallOfFame.push(hofEntry)
    }),

  setWeeklyActivity: (type) =>
    set((state) => {
      state.selectedWeeklyActivity = type
    }),

  // ===== Getters / Helpers =====

  getPlayerTeam: () => {
    const state = get()
    return state.teams.find((t) => t.id === state.playerTeamId)
  },

  getUpcomingMatches: (limit = 5) => {
    const state = get()
    return state.scheduledMatches
      .filter(
        (m) =>
          m.week >= state.currentWeek &&
          !m.stage?.includes("Finished") &&
          (m.homeTeamId === state.playerTeamId || m.awayTeamId === state.playerTeamId),
      )
      // Sort by week first, then by day within the same week (Mon=0 to Sun=6)
      .sort((a, b) => {
        if (a.week !== b.week) return a.week - b.week
        // Within same week, sort by day (default to 6/Sunday if not set)
        return (a.day ?? 6) - (b.day ?? 6)
      })
      .slice(0, limit)
  },

  calculateTeamRating: () => {
    const state = get()
    const playerTeam = state.teams.find((t) => t.id === state.playerTeamId)
    if (!playerTeam) return 0

    const teamPlayers = state.players
      .filter((p) => playerTeam.rosterIds.includes(p.id))
      .map((p) => evaluatePlayer(p).overallRating)
      .sort((a, b) => b - a)
      .slice(0, 5)

    if (teamPlayers.length === 0) return 0
    const avg = teamPlayers.reduce((sum, r) => sum + r, 0) / teamPlayers.length
    return parseFloat(avg.toFixed(1))
  },

  getDateForWeek: (week: number) => {
    const state = get()
    const start = new Date(state.gameStartDate)
    const daysToAdd = (week - 1) * 7
    const date = new Date(start)
    date.setDate(date.getDate() + daysToAdd)
    return date
  },
})
