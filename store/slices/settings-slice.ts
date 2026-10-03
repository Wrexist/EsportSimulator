"use client"

import { captureFirstSessionBaseline, newFirstSession, restoreFirstSession, reviewFirstSession, syncFirstSessionProgress } from '@/lib/first-session'
import type { SettingsState, SettingsActions, SliceCreator } from "@/store/types"
import { useSettingsStore } from "@/lib/settings-store"
import { soundManager } from "@/lib/sound-manager"

export const settingsInitialState: SettingsState = {
  onboardingCompleted: false,
  tutorialCompleted: false,
  showTutorialOnNewGame: true,
  manualTutorialTrigger: 0,
  soundEnabled: true,
  resolution: "1920x1080",
  masterVolume: 80,
  musicVolume: 0,
  gameSpeed: "normal",
  difficulty: "normal",
  autoSave: true,
  notifications: true,
  showBugReportButton: false,
}

export const createSettingsSlice: SliceCreator<SettingsActions> = (set, get) => ({
  // Only squad/budget are acknowledged explicitly (on their own pages). Decision, match and week
  // are recorded by the actions themselves or proven by career state in syncFirstSession.
  reviewGuideStep: (step) => {
    if (step !== 'squad' && step !== 'budget') return
    let changed = false
    set(state => {
      if (!state.playerTeamId) return
      const before = restoreFirstSession(state.firstSession)
      const next = reviewFirstSession(before, step)
      if (next === before) return
      state.firstSession = next; changed = true
      if (next.status === 'complete') { state.onboardingCompleted = true; state.tutorialCompleted = true }
    }); if (changed && get().isInitialized) void get().saveGame?.() },

  syncFirstSession: () => {
    let changed = false
    set(state => {
      if (!state.isInitialized || !state.playerTeamId || state.gameOverReason || state.activeMatchId) return
      const guide = restoreFirstSession(state.firstSession)
      if (guide.status !== 'active') return
      const team = state.teams.find(t => t.id === state.playerTeamId)
      if (!team) return
      const next = syncFirstSessionProgress(guide, { team, players: state.players, matches: state.scheduledMatches, completed: state.completedMatches, currentWeek: state.currentWeek })
      if (next === guide) return
      state.firstSession = next; changed = true
      if (next.status === 'complete') { state.onboardingCompleted = true; state.tutorialCompleted = true }
    }); if (changed && get().isInitialized) void get().saveGame?.() },

  completeOnboarding: () => {
    set({ onboardingCompleted: true })
  },

  completeTutorial: () => {
    set((state) => {
      state.firstSession = { ...restoreFirstSession(state.firstSession), status: "dismissed" }
      state.manualTutorialTrigger = 0
      state.tutorialCompleted = true
    }); if (get().isInitialized) void get().saveGame?.() },

  triggerTutorial: () => {
    set((state) => {
      if (!state.isInitialized || !state.playerTeamId) return
      const team = (state.teams ?? []).find(t => t.id === state.playerTeamId)
      // Baseline = the career now, so replay asks for new actions instead of completing from history.
      state.firstSession = newFirstSession(team ? captureFirstSessionBaseline({ team, completed: state.completedMatches, currentWeek: state.currentWeek }) : undefined)
      state.manualTutorialTrigger = 0
      state.tutorialCompleted = false
      state.onboardingCompleted = false
    }); if (get().isInitialized) void get().saveGame?.() },

  setShowTutorialOnNewGame: (enabled) =>
    set((state) => {
      state.showTutorialOnNewGame = enabled
    }),

  setSoundEnabled: (enabled) => {
    set({ soundEnabled: enabled })
    import("@/lib/sound-manager").then(({ soundManager }) => {
      soundManager.setEnabled(enabled)
    })
  },

  setResolution: (res) => set({ resolution: res }),

  setMasterVolume: (vol) => {
    set({ masterVolume: vol })
    soundManager.setMasterVolume(vol)
  },

  setMusicVolume: (vol) => {
    set({ musicVolume: vol })
    soundManager.setMusicVolume(vol)
  },

  setGameSpeed: (speed) => set({ gameSpeed: speed }),

  setTimeMode: (mode) =>
    set((state) => {
      const wasMode = state.timeMode
      state.timeMode = mode
      if (mode === "HYBRID_DAILY") {
        state.currentDay =
          wasMode === "HYBRID_DAILY" ? Math.max(0, Math.min(6, state.currentDay)) : 0
      } else {
        state.currentDay = 6
      }
    }),

  setDifficulty: (difficulty) => set({ difficulty }),

  // Compatibility entry point; all runtime consumers use settings-store.
  setAutoSave: (enabled) => {
    useSettingsStore.getState().setAutoSave(enabled)
    set({ autoSave: enabled })
  },

  setNotifications: (enabled) => set({ notifications: enabled }),

  setShowBugReportButton: (enabled) => set({ showBugReportButton: enabled }),
})
