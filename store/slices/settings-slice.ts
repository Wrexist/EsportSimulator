"use client"

import type { SettingsState, SettingsActions, SliceCreator } from "@/store/types"
import { soundManager } from "@/lib/sound-manager"

export const settingsInitialState: SettingsState = {
  onboardingCompleted: false,
  tutorialCompleted: false,
  showTutorialOnNewGame: true,
  manualTutorialTrigger: 0,
  soundEnabled: true,
  resolution: "1920x1080",
  masterVolume: 80,
  musicVolume: 60,
  gameSpeed: "normal",
  difficulty: "normal",
  autoSave: true,
  notifications: true,
  showBugReportButton: false,
}

export const createSettingsSlice: SliceCreator<SettingsActions> = (set, get) => ({
  completeOnboarding: () => {
    set({ onboardingCompleted: true })
  },

  completeTutorial: () =>
    set((state) => {
      state.tutorialCompleted = true
    }),

  triggerTutorial: () =>
    set((state) => {
      state.manualTutorialTrigger = Date.now()
      state.tutorialCompleted = false
      state.onboardingCompleted = false
      state.showTutorialOnNewGame = true
    }),

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

  setAutoSave: (enabled) => set({ autoSave: enabled }),

  setNotifications: (enabled) => set({ notifications: enabled }),

  setShowBugReportButton: (enabled) => set({ showBugReportButton: enabled }),
})
