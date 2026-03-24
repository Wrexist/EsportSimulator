"use client"

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type WindowMode = 'fullscreen' | 'windowed' | 'borderless'
export type Resolution = '1920x1080' | '1600x900' | '1280x720' | '1024x768'
export type GameSpeed = 'normal' | 'fast' | 'very-fast'

interface GameSettings {
    // Display
    windowMode: WindowMode
    resolution: Resolution
    vsync: boolean
    fpsLimit: number

    // Audio
    masterVolume: number
    musicVolume: number
    sfxVolume: number

    // Game
    autoSave: boolean
    autoSaveInterval: number // minutes
    gameSpeed: GameSpeed
    notifications: boolean

    // Actions
    setWindowMode: (mode: WindowMode) => void
    setResolution: (res: Resolution) => void
    setVsync: (enabled: boolean) => void
    setFpsLimit: (limit: number) => void
    setMasterVolume: (vol: number) => void
    setMusicVolume: (vol: number) => void
    setSfxVolume: (vol: number) => void
    setAutoSave: (enabled: boolean) => void
    setAutoSaveInterval: (interval: number) => void
    setGameSpeed: (speed: GameSpeed) => void
    setNotifications: (enabled: boolean) => void
    applyWindowSettings: () => void
}

export const useSettingsStore = create<GameSettings>()(
    persist(
        (set, get) => ({
            // Default values
            windowMode: 'windowed',
            resolution: '1280x720',
            vsync: true,
            fpsLimit: 60,
            masterVolume: 80,
            musicVolume: 70,
            sfxVolume: 80,
            autoSave: true,
            autoSaveInterval: 10,
            gameSpeed: 'normal',
            notifications: true,

            // Setters
            setWindowMode: (mode) => set({ windowMode: mode }),
            setResolution: (res) => set({ resolution: res }),
            setVsync: (enabled) => set({ vsync: enabled }),
            setFpsLimit: (limit) => set({ fpsLimit: limit }),
            setMasterVolume: (vol) => set({ masterVolume: vol }),
            setMusicVolume: (vol) => set({ musicVolume: vol }),
            setSfxVolume: (vol) => set({ sfxVolume: vol }),
            setAutoSave: (enabled) => set({ autoSave: enabled }),
            setAutoSaveInterval: (interval) => set({ autoSaveInterval: interval }),
            setGameSpeed: (speed) => set({ gameSpeed: speed }),
            setNotifications: (enabled) => set({ notifications: enabled }),

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
        }
    )
)
