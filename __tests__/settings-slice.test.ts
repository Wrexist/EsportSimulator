/**
 * Tests for the settings slice — the tutorial/display/time-mode toggles
 * persisted on the store. Audio settings (sound on/off, volumes) live only
 * in lib/settings-store.ts, never on the game store.
 *
 * Coverage:
 *   - completeOnboarding / completeTutorial: idempotent setters
 *   - triggerTutorial: resets multiple flags + bumps manualTutorialTrigger
 *   - setShowTutorialOnNewGame / setResolution / setGameSpeed /
 *     setDifficulty / setAutoSave / setNotifications /
 *     setShowBugReportButton: trivial setters
 *   - setTimeMode: HYBRID_DAILY ↔ WEEKLY behavior with currentDay
 *     transition (the only state-touching action)
 */

import { produce, enableMapSet } from "immer"
import { createSettingsSlice, settingsInitialState } from "@/store/slices/settings-slice"
import type { StoreState } from "@/store/types"

enableMapSet()

function makeHarness(initial: Partial<StoreState>) {
    let state = initial as StoreState
    const set = (
        patch: Partial<StoreState> | ((draft: StoreState) => void)
    ) => {
        if (typeof patch === "function") {
            state = produce(state, patch as (s: StoreState) => void)
        } else {
            state = { ...state, ...patch }
        }
    }
    const get = () => state
    return { state: () => state, set, get }
}

function makeBaseState(overrides: Partial<StoreState> = {}): Partial<StoreState> {
    return {
        ...settingsInitialState,
        currentDay: 6,
        timeMode: "WEEKLY",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    }
}

describe("settings — tutorial / onboarding flags", () => {
    test("completeOnboarding flips the flag (idempotent)", () => {
        const h = makeHarness(makeBaseState({ onboardingCompleted: false }))
        const slice = createSettingsSlice(h.set, h.get)
        slice.completeOnboarding()
        expect(h.state().onboardingCompleted).toBe(true)
        slice.completeOnboarding()
        expect(h.state().onboardingCompleted).toBe(true)
    })

    test("completeTutorial flips the flag", () => {
        const h = makeHarness(makeBaseState({ tutorialCompleted: false }))
        const slice = createSettingsSlice(h.set, h.get)
        slice.completeTutorial()
        expect(h.state().tutorialCompleted).toBe(true)
    })

    test("triggerTutorial restarts the career guide without changing the new-game preference", () => {
        const h = makeHarness(makeBaseState({
            isInitialized: true, playerTeamId: "qa",
            tutorialCompleted: true,
            onboardingCompleted: true,
            showTutorialOnNewGame: false,
            manualTutorialTrigger: 0,
        }))
        const slice = createSettingsSlice(h.set, h.get)
        slice.triggerTutorial()
        expect(h.state().tutorialCompleted).toBe(false)
        expect(h.state().onboardingCompleted).toBe(false)
        expect(h.state().showTutorialOnNewGame).toBe(false)
        expect(h.state().manualTutorialTrigger).toBe(0)
        expect(h.state().firstSession).toEqual({ version: 2, status: "active", reviewed: [] })
    })

    test("setShowTutorialOnNewGame respects the boolean passed in", () => {
        const h = makeHarness(makeBaseState({ showTutorialOnNewGame: true }))
        const slice = createSettingsSlice(h.set, h.get)
        slice.setShowTutorialOnNewGame(false)
        expect(h.state().showTutorialOnNewGame).toBe(false)
    })
})

describe("settings — display setters", () => {
    test("audio settings have one home: the game store carries no duplicate sound/volume fields", () => {
        const h = makeHarness(makeBaseState())
        const slice = createSettingsSlice(h.set, h.get) as Record<string, unknown>
        for (const key of ["setSoundEnabled", "setMasterVolume", "setMusicVolume"]) expect(slice[key]).toBeUndefined()
        for (const key of ["soundEnabled", "masterVolume", "musicVolume"]) expect(settingsInitialState).not.toHaveProperty(key)
    })

    test("setResolution / setGameSpeed / setDifficulty plain setters", () => {
        const h = makeHarness(makeBaseState())
        const slice = createSettingsSlice(h.set, h.get)
        slice.setResolution("2560x1440")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        slice.setGameSpeed("fast" as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        slice.setDifficulty("hard" as any)
        expect(h.state().resolution).toBe("2560x1440")
        expect(h.state().gameSpeed).toBe("fast")
        expect(h.state().difficulty).toBe("hard")
    })

    test("setAutoSave / setNotifications / setShowBugReportButton boolean toggles", () => {
        const h = makeHarness(makeBaseState({
            autoSave: true, notifications: true, showBugReportButton: false,
        }))
        const slice = createSettingsSlice(h.set, h.get)
        slice.setAutoSave(false)
        slice.setNotifications(false)
        slice.setShowBugReportButton(true)
        expect(h.state().autoSave).toBe(false)
        expect(h.state().notifications).toBe(false)
        expect(h.state().showBugReportButton).toBe(true)
    })
})

describe("setTimeMode — HYBRID_DAILY ↔ WEEKLY transitions", () => {
    test("switching to HYBRID_DAILY from WEEKLY initializes currentDay to 0", () => {
        const h = makeHarness(makeBaseState({ timeMode: "WEEKLY", currentDay: 6 }))
        const slice = createSettingsSlice(h.set, h.get)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        slice.setTimeMode("HYBRID_DAILY" as any)
        expect(h.state().timeMode).toBe("HYBRID_DAILY")
        expect(h.state().currentDay).toBe(0) // freshly entered week → start of week
    })

    test("staying within HYBRID_DAILY clamps currentDay to [0,6] but preserves user position", () => {
        const h = makeHarness(makeBaseState({ timeMode: "HYBRID_DAILY", currentDay: 3 }))
        const slice = createSettingsSlice(h.set, h.get)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        slice.setTimeMode("HYBRID_DAILY" as any)
        expect(h.state().currentDay).toBe(3) // preserved
    })

    test("switching to WEEKLY resets currentDay to 6 (end of week)", () => {
        const h = makeHarness(makeBaseState({ timeMode: "HYBRID_DAILY", currentDay: 2 }))
        const slice = createSettingsSlice(h.set, h.get)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        slice.setTimeMode("WEEKLY" as any)
        expect(h.state().timeMode).toBe("WEEKLY")
        expect(h.state().currentDay).toBe(6) // weekly mode anchors at end-of-week
    })

    test("entering HYBRID_DAILY with an out-of-range currentDay clamps it", () => {
        const h = makeHarness(makeBaseState({
            timeMode: "HYBRID_DAILY",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            currentDay: 99 as any,
        }))
        const slice = createSettingsSlice(h.set, h.get)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        slice.setTimeMode("HYBRID_DAILY" as any)
        expect(h.state().currentDay).toBe(6)
    })
})
