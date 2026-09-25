"use client"

import { normalizeColorVision, SUPPORTED_UI_LANGUAGE, type ColorVisionMode } from './accessibility-preferences'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type WindowMode = 'fullscreen' | 'windowed' | 'borderless'
export type Resolution = '1920x1080' | '1600x900' | '1280x720' | '1024x768'
export type GameSpeed = 'normal' | 'fast' | 'very-fast'
export type Difficulty = 'easy' | 'normal' | 'hard' | 'legendary'
export type RenderingMode = 'performance' | 'compatibility'
const boundedVolume = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0

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
    uiScale: number // 80-120, default 100

    // Audio
    masterVolume: number
    musicVolume: number
    sfxVolume: number

    // Game
    autoSave: boolean
    autoSavePreferenceSet: boolean
    adoptLegacyAutoSave: (enabled?: boolean) => void
    autoSaveInterval: number // minutes
    gameSpeed: GameSpeed
    notifications: boolean
    difficulty: Difficulty
    language: string

    // Actions
    setWindowMode: (mode: WindowMode) => void
    setResolution: (res: Resolution) => void
    setRenderingMode: (mode: RenderingMode) => void
    setReducedMotion: (enabled: boolean) => void
    setUiScale: (scale: number) => void
    setMasterVolume: (vol: number) => void
    setMusicVolume: (vol: number) => void
    setSfxVolume: (vol: number) => void
    setAutoSave: (enabled: boolean) => void
    setAutoSaveInterval: (interval: number) => void
    setGameSpeed: (speed: GameSpeed) => void
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
            renderingMode: 'performance',
            colorVisionMode: 'off',
            colorVisionPreferenceSet: false,
            setColorVisionMode: mode => set({ colorVisionMode: normalizeColorVision(mode), colorVisionPreferenceSet: true }),
            adoptLegacyColorVision: mode => { if (!get().colorVisionPreferenceSet) set({ colorVisionMode: normalizeColorVision(mode), colorVisionPreferenceSet: true }) },
            reducedMotion: false,
            uiScale: 100,
            masterVolume: 80,
            musicVolume: 70,
            sfxVolume: 80,
            autoSave: true,
            autoSavePreferenceSet: false,
            autoSaveInterval: 10,
            gameSpeed: 'normal',
            notifications: true,
            difficulty: 'normal',
            language: 'en',

            // Setters
            setWindowMode: (mode) => set({ windowMode: mode }),
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
            setUiScale: (scale) => {
                const bounded = Number.isFinite(scale) ? Math.max(80, Math.min(120, scale)) : 100
                set({ uiScale: bounded })
                if (typeof document !== 'undefined') {
                    document.documentElement.style.fontSize = `${bounded}%`
                }
            },
            setMasterVolume: (vol) => set({ masterVolume: boundedVolume(vol) }),
            setMusicVolume: (vol) => set({ musicVolume: boundedVolume(vol) }),
            setSfxVolume: (vol) => set({ sfxVolume: boundedVolume(vol) }),
            setAutoSave: (enabled) => set({ autoSave: enabled, autoSavePreferenceSet: true }),
            adoptLegacyAutoSave: (enabled) => {
                if (!get().autoSavePreferenceSet) {
                    set({ autoSave: typeof enabled === 'boolean' ? enabled : get().autoSave, autoSavePreferenceSet: true })
                }
            },
            setAutoSaveInterval: (interval) => set({ autoSaveInterval: Number.isFinite(interval) ? Math.max(1, Math.min(30, interval)) : 10 }),
            setGameSpeed: (speed) => set({ gameSpeed: speed }),
            setNotifications: (enabled) => set({ notifications: enabled }),
            setDifficulty: (diff) => set({ difficulty: diff }),
            setLanguage: (_lang) => set({ language: SUPPORTED_UI_LANGUAGE }),

            // Apply window settings via Electron IPC or Browser API
            applyWindowSettings: () => {
                const { windowMode, resolution } = get()

                if (typeof window === 'undefined') return

                // Check if we're in Electron
                const electronBridge = (window as any).electron || (window as any).electronAPI
                if (electronBridge?.window) {
                    const api = electronBridge.window

                    // Set fullscreen via Electron
                    if (windowMode === 'fullscreen' || windowMode === 'borderless') {
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
            merge: (persisted, current) => {
                const stored = persisted as Partial<GameSettings> | undefined
                return {
                    ...current,
                    windowMode: ['windowed', 'fullscreen', 'borderless'].includes(stored?.windowMode ?? '') ? stored!.windowMode! : current.windowMode,
                    resolution: ['1920x1080', '1600x900', '1280x720', '1024x768'].includes(stored?.resolution ?? '') ? stored!.resolution! : current.resolution,
                    renderingMode: stored?.renderingMode === 'compatibility' ? 'compatibility' : 'performance',
                    reducedMotion: typeof stored?.reducedMotion === 'boolean' ? stored.reducedMotion : current.reducedMotion,
                    autoSave: typeof stored?.autoSave === 'boolean' ? stored.autoSave : current.autoSave,
                    autoSaveInterval: typeof stored?.autoSaveInterval === 'number' && Number.isFinite(stored.autoSaveInterval) ? Math.max(1, Math.min(30, stored.autoSaveInterval)) : 10,
                    gameSpeed: ['normal', 'fast', 'very-fast'].includes(stored?.gameSpeed ?? '') ? stored!.gameSpeed! : current.gameSpeed,
                    notifications: typeof stored?.notifications === 'boolean' ? stored.notifications : current.notifications,
                    difficulty: ['easy', 'normal', 'hard', 'legendary'].includes(stored?.difficulty ?? '') ? stored!.difficulty! : current.difficulty,
                    language: SUPPORTED_UI_LANGUAGE,
                    colorVisionMode: normalizeColorVision(stored?.colorVisionMode),
                    colorVisionPreferenceSet: typeof stored?.colorVisionMode === 'string',
                    masterVolume: boundedVolume(stored?.masterVolume ?? current.masterVolume),
                    musicVolume: boundedVolume(stored?.musicVolume ?? current.musicVolume),
                    sfxVolume: boundedVolume(stored?.sfxVolume ?? current.sfxVolume),
                    uiScale: typeof stored?.uiScale === 'number' && Number.isFinite(stored.uiScale) ? Math.max(80, Math.min(120, stored.uiScale)) : 100,
                    // A value already stored by this settings surface wins over
                    // the deprecated game-store preference, including false.
                    autoSavePreferenceSet: typeof stored?.autoSave === 'boolean',
                }
            },
        }
    )
)
