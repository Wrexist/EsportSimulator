"use client"

import { normalizeColorVision, type ColorVisionMode } from './accessibility-preferences'
import { normalizeUiLanguage } from './ui-languages'
import { normalizeWindowMode, type WindowModeChoice } from './window-mode'
import { applyUiScale, clampUiScale } from './ui-scale'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Windowed or fullscreen (START-18: "borderless" was the same as fullscreen and reads as it). */
export type WindowMode = WindowModeChoice
export type Resolution = '1920x1080' | '1600x900' | '1280x720' | '1024x768'
export type GameSpeed = 'normal' | 'fast' | 'very-fast'
export type Difficulty = 'easy' | 'normal' | 'hard' | 'legendary'
export type RenderingMode = 'performance' | 'compatibility'
/** Live match playback: key moments at speed, quiet stretches fast-forwarded; or every second. */
export type LivePacing = 'moments' | 'full'
const boundedVolume = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
/** Default levels. Lowered 2026-10-23 (80 / 45 / 80 was too loud on first load). */
export const DEFAULT_MASTER_VOLUME = 55
export const DEFAULT_MUSIC_VOLUME = 30
export const DEFAULT_SFX_VOLUME = 65
/**
 * Persisted settings version; v1 moved the old music default (0) to DEFAULT_MUSIC_VOLUME,
 * v2 moves the untouched old defaults (80 / 45 / 80 together) to the new ones.
 */
export const SETTINGS_VERSION = 2

/** One-time migration of stored device settings from an older version. */
export function migrateSettings(persisted: unknown, version: number): unknown {
    if (!persisted || typeof persisted !== 'object') return persisted
    const stored = { ...(persisted as Record<string, unknown>) }
    // v0 shipped music off (0) by default; nobody could tell a chosen 0 from the default.
    const untouchedMusic = version < 1 ? stored.musicVolume === 0 || stored.musicVolume === undefined : stored.musicVolume === 45
    if (version < 1 && untouchedMusic) stored.musicVolume = DEFAULT_MUSIC_VOLUME
    // Settings are stored whole, defaults included: exactly the old trio (80 / 45 / 80) means nobody moved a slider.
    if (version < 2 && untouchedMusic && stored.masterVolume === 80 && stored.sfxVolume === 80) {
        stored.masterVolume = DEFAULT_MASTER_VOLUME
        stored.musicVolume = DEFAULT_MUSIC_VOLUME
        stored.sfxVolume = DEFAULT_SFX_VOLUME
    }
    return stored
}

interface GameSettings {
    // Display
    windowMode: WindowMode
    resolution: Resolution
    renderingMode: RenderingMode
    colorVisionMode: ColorVisionMode
    colorVisionPreferenceSet: boolean
    setColorVisionMode: (mode: string) => void
    adoptLegacyColorVision: (mode: string | null) => void
    reducedMotion: boolean
    /** The player's chosen scale, 80-150 (used once uiScaleAuto is off). */
    uiScale: number
    /** Size the interface from the window (lib/ui-scale.ts autoUiScale) until the player picks a scale. */
    uiScaleAuto: boolean

    // Audio (the only audio settings; the game store keeps none)
    soundEnabled: boolean
    soundPreferenceSet: boolean
    masterVolume: number
    musicVolume: number
    sfxVolume: number
    uiSounds: boolean
    hoverSounds: boolean
    muteWhenUnfocused: boolean

    // Game
    autoSave: boolean
    autoSavePreferenceSet: boolean
    adoptLegacyAutoSave: (enabled?: boolean) => void
    autoSaveInterval: number // minutes
    gameSpeed: GameSpeed
    livePacing: LivePacing
    /** Live match: play only the rounds worth watching; the rest finish at once. */
    liveKeyRoundsOnly: boolean
    /** Weekly mode: open the week report after each week (off: a small notice you can open). */
    openWeekReport: boolean
    setOpenWeekReport: (enabled: boolean) => void
    notifications: boolean
    difficulty: Difficulty
    language: string
    /** The once-only Steam review ask has been shown (answered or dismissed). */
    reviewAskDone: boolean
    setReviewAskDone: () => void
    /** Demo tour stops opened on this device (lib/demo-tour.ts; demo builds only). */
    demoTourVisited: string[]
    markDemoTourVisited: (stop: string) => void
    /** One-time screen tips already dismissed on this device (components/ui/FirstVisitTip.tsx). */
    seenTips: string[]
    markTipSeen: (tip: string) => void

    // Actions
    setWindowMode: (mode: WindowMode) => void
    setResolution: (res: Resolution) => void
    setRenderingMode: (mode: RenderingMode) => void
    setReducedMotion: (enabled: boolean) => void
    setUiScale: (scale: number) => void
    setUiScaleAuto: (enabled: boolean) => void
    setMasterVolume: (vol: number) => void
    setMusicVolume: (vol: number) => void
    setSfxVolume: (vol: number) => void
    setSoundEnabled: (enabled: boolean) => void
    /** Adopt the pre-Phase-5 game-store sound switch once, unless this store already has one. */
    adoptLegacySoundEnabled: (enabled?: boolean) => void
    setUiSounds: (enabled: boolean) => void
    setHoverSounds: (enabled: boolean) => void
    setMuteWhenUnfocused: (enabled: boolean) => void
    setAutoSave: (enabled: boolean) => void
    setAutoSaveInterval: (interval: number) => void
    setGameSpeed: (speed: GameSpeed) => void
    setLivePacing: (pacing: LivePacing) => void
    setLiveKeyRoundsOnly: (enabled: boolean) => void
    setNotifications: (enabled: boolean) => void
    setDifficulty: (diff: Difficulty) => void
    setLanguage: (lang: string) => void
    applyWindowSettings: () => void
}

export const useSettingsStore = create<GameSettings>()(
    persist(
        (set, get) => ({
            // Default values
            windowMode: 'windowed',
            resolution: '1280x720',
            renderingMode: 'compatibility',
            colorVisionMode: 'off',
            colorVisionPreferenceSet: false,
            setColorVisionMode: mode => set({ colorVisionMode: normalizeColorVision(mode), colorVisionPreferenceSet: true }),
            adoptLegacyColorVision: mode => { if (!get().colorVisionPreferenceSet) set({ colorVisionMode: normalizeColorVision(mode), colorVisionPreferenceSet: true }) },
            reducedMotion: false,
            uiScale: 100,
            uiScaleAuto: true,
            soundEnabled: true,
            soundPreferenceSet: false,
            masterVolume: DEFAULT_MASTER_VOLUME,
            musicVolume: DEFAULT_MUSIC_VOLUME,
            sfxVolume: DEFAULT_SFX_VOLUME,
            uiSounds: true,
            hoverSounds: false,
            muteWhenUnfocused: true,
            autoSave: true,
            autoSavePreferenceSet: false,
            autoSaveInterval: 10,
            gameSpeed: 'normal',
            livePacing: 'moments',
            liveKeyRoundsOnly: false,
            openWeekReport: true,
            setOpenWeekReport: (enabled) => set({ openWeekReport: enabled !== false }),
            notifications: true,
            difficulty: 'normal',
            language: 'en',
            reviewAskDone: false,
            setReviewAskDone: () => set({ reviewAskDone: true }),
            demoTourVisited: [],
            markDemoTourVisited: (stop) => set(state => state.demoTourVisited.includes(stop) ? state : { demoTourVisited: [...state.demoTourVisited, stop].slice(-20) }),
            seenTips: [],
            markTipSeen: (tip) => set(state => state.seenTips.includes(tip) ? state : { seenTips: [...state.seenTips, tip].slice(-50) }),

            // Setters
            setWindowMode: (mode) => set({ windowMode: normalizeWindowMode(mode, get().windowMode) }),
            setResolution: (res) => set({ resolution: res }),
            setRenderingMode: (mode) => {
                set({ renderingMode: mode })
                // Apply via Electron IPC if available
                if (typeof window !== 'undefined' && (window as any).electron?.gpu?.setMode) {
                    (window as any).electron.gpu.setMode(mode)
                }
            },
            setReducedMotion: (enabled) => {
                set({ reducedMotion: enabled })
                if (typeof document !== 'undefined') {
                    document.documentElement.classList.toggle('reduce-motion', enabled || (typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches))
                }
            },
            // A scale the player picks sticks; the automatic size stops following the window.
            // (GameShell applies the automatic one, since it needs the window size.)
            setUiScale: (scale) => {
                const bounded = clampUiScale(scale)
                set({ uiScale: bounded, uiScaleAuto: false })
                applyUiScale(bounded)
            },
            setUiScaleAuto: (enabled) => set({ uiScaleAuto: enabled === true }),
            setMasterVolume: (vol) => set({ masterVolume: boundedVolume(vol) }),
            setMusicVolume: (vol) => set({ musicVolume: boundedVolume(vol) }),
            setSfxVolume: (vol) => set({ sfxVolume: boundedVolume(vol) }),
            setSoundEnabled: (enabled) => set({ soundEnabled: enabled, soundPreferenceSet: true }),
            adoptLegacySoundEnabled: (enabled) => {
                if (!get().soundPreferenceSet && typeof enabled === 'boolean') set({ soundEnabled: enabled, soundPreferenceSet: true })
            },
            setUiSounds: (enabled) => set({ uiSounds: enabled }),
            setHoverSounds: (enabled) => set({ hoverSounds: enabled }),
            setMuteWhenUnfocused: (enabled) => set({ muteWhenUnfocused: enabled }),
            setAutoSave: (enabled) => set({ autoSave: enabled, autoSavePreferenceSet: true }),
            adoptLegacyAutoSave: (enabled) => {
                if (!get().autoSavePreferenceSet) {
                    set({ autoSave: typeof enabled === 'boolean' ? enabled : get().autoSave, autoSavePreferenceSet: true })
                }
            },
            setAutoSaveInterval: (interval) => set({ autoSaveInterval: Number.isFinite(interval) ? Math.max(1, Math.min(30, interval)) : 10 }),
            setGameSpeed: (speed) => set({ gameSpeed: speed }),
            setLivePacing: (pacing) => set({ livePacing: pacing === 'full' ? 'full' : 'moments' }),
            setLiveKeyRoundsOnly: (enabled) => set({ liveKeyRoundsOnly: enabled === true }),
            setNotifications: (enabled) => set({ notifications: enabled }),
            setDifficulty: (diff) => set({ difficulty: diff }),
            setLanguage: (lang) => set({ language: normalizeUiLanguage(lang) }),

            // Apply window settings via Electron IPC or Browser API
            applyWindowSettings: () => {
                const { windowMode, resolution } = get()

                if (typeof window === 'undefined') return

                // Check if we're in Electron
                const electronBridge = (window as any).electron || (window as any).electronAPI
                if (electronBridge?.window) {
                    const api = electronBridge.window

                    // Set fullscreen via Electron
                    if (windowMode === 'fullscreen') {
                        api.setFullscreen?.(true)
                    } else {
                        api.setFullscreen?.(false)

                        // Set resolution
                        const [width, height] = resolution.split('x').map(Number)
                        if (api.setSize) {
                            api.setSize(width, height)
                        } else {
                            api.setWindowSize?.(width, height)
                        }
                    }
                } else {
                    // Browser fallback using Fullscreen API
                    const docEl = document.documentElement

                    if (windowMode === 'fullscreen') {
                        // Request fullscreen
                        if (docEl.requestFullscreen) {
                            docEl.requestFullscreen().catch((err) => {
                                console.warn('Fullscreen request failed:', err)
                            })
                        } else if ((docEl as any).webkitRequestFullscreen) {
                            (docEl as any).webkitRequestFullscreen()
                        } else if ((docEl as any).msRequestFullscreen) {
                            (docEl as any).msRequestFullscreen()
                        }
                    } else {
                        // Exit fullscreen if we're in fullscreen
                        if (document.fullscreenElement) {
                            document.exitFullscreen().catch(() => { })
                        } else if ((document as any).webkitExitFullscreen) {
                            (document as any).webkitExitFullscreen()
                        } else if ((document as any).msExitFullscreen) {
                            (document as any).msExitFullscreen()
                        }

                        // For windowed mode in browser, we can't resize the window directly
                        // But we can update CSS to simulate a resolution container
                        if (windowMode === 'windowed') {
                            const [width, height] = resolution.split('x').map(Number)
                            document.documentElement.style.setProperty('--game-width', `${width}px`)
                            document.documentElement.style.setProperty('--game-height', `${height}px`)
                            // Resolution set logged via debug in dev mode only
                        }
                    }

                    // Settings change applied
                }
            }
        }),
        {
            name: 'game-settings',
            version: SETTINGS_VERSION,
            migrate: (persisted, version) => migrateSettings(persisted, version) as GameSettings,
            merge: (persisted, current) => {
                const stored = persisted as Partial<GameSettings> | undefined
                return {
                    ...current,
                    windowMode: normalizeWindowMode(stored?.windowMode, current.windowMode),
                    resolution: ['1920x1080', '1600x900', '1280x720', '1024x768'].includes(stored?.resolution ?? '') ? stored!.resolution! : current.resolution,
                    renderingMode: stored?.renderingMode === 'performance' ? 'performance' : 'compatibility',
                    reducedMotion: typeof stored?.reducedMotion === 'boolean' ? stored.reducedMotion : current.reducedMotion,
                    autoSave: typeof stored?.autoSave === 'boolean' ? stored.autoSave : current.autoSave,
                    autoSaveInterval: typeof stored?.autoSaveInterval === 'number' && Number.isFinite(stored.autoSaveInterval) ? Math.max(1, Math.min(30, stored.autoSaveInterval)) : 10,
                    gameSpeed: ['normal', 'fast', 'very-fast'].includes(stored?.gameSpeed ?? '') ? stored!.gameSpeed! : current.gameSpeed,
                    livePacing: stored?.livePacing === 'full' ? 'full' : 'moments',
                    liveKeyRoundsOnly: stored?.liveKeyRoundsOnly === true,
                    openWeekReport: stored?.openWeekReport !== false,
                    notifications: typeof stored?.notifications === 'boolean' ? stored.notifications : current.notifications,
                    difficulty: ['easy', 'normal', 'hard', 'legendary'].includes(stored?.difficulty ?? '') ? stored!.difficulty! : current.difficulty,
                    language: normalizeUiLanguage(stored?.language),
                    colorVisionMode: normalizeColorVision(stored?.colorVisionMode),
                    colorVisionPreferenceSet: typeof stored?.colorVisionMode === 'string',
                    masterVolume: boundedVolume(stored?.masterVolume ?? current.masterVolume),
                    musicVolume: boundedVolume(stored?.musicVolume ?? current.musicVolume),
                    sfxVolume: boundedVolume(stored?.sfxVolume ?? current.sfxVolume),
                    soundEnabled: typeof stored?.soundEnabled === 'boolean' ? stored.soundEnabled : current.soundEnabled,
                    soundPreferenceSet: typeof stored?.soundEnabled === 'boolean',
                    uiSounds: typeof stored?.uiSounds === 'boolean' ? stored.uiSounds : current.uiSounds,
                    hoverSounds: typeof stored?.hoverSounds === 'boolean' ? stored.hoverSounds : current.hoverSounds,
                    muteWhenUnfocused: typeof stored?.muteWhenUnfocused === 'boolean' ? stored.muteWhenUnfocused : current.muteWhenUnfocused,
                    uiScale: clampUiScale(stored?.uiScale),
                    // Settings saved before the automatic scale: a scale other than the old
                    // default 100 was the player's choice and stays; 100 means untouched.
                    uiScaleAuto: typeof stored?.uiScaleAuto === 'boolean' ? stored.uiScaleAuto : !(typeof stored?.uiScale === 'number' && Number.isFinite(stored.uiScale) && stored.uiScale !== 100),
                    // A value already stored by this settings surface wins over
                    // the deprecated game-store preference, including false.
                    autoSavePreferenceSet: typeof stored?.autoSave === 'boolean',
                    reviewAskDone: stored?.reviewAskDone === true,
                    demoTourVisited: Array.isArray(stored?.demoTourVisited) ? stored.demoTourVisited.filter((v): v is string => typeof v === 'string').slice(-20) : [],
                    seenTips: Array.isArray(stored?.seenTips) ? stored.seenTips.filter((v): v is string => typeof v === 'string').slice(-50) : [],
                }
            },
        }
    )
)
