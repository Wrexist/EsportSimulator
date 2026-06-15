"use client"

import { Sidebar } from "./Sidebar"
import { TopBar } from "./TopBar"
import { ErrorBoundary } from "./ErrorBoundary"

import { usePathname, useRouter } from "next/navigation"
import { useGameStore } from "@/store/game-store"
import { useEffect, useRef, useState, useCallback } from "react"
import { useShallow } from "zustand/react/shallow"
import type { ExitDialogVariant } from "./ExitConfirmDialog"
import dynamic from "next/dynamic"
import { soundManager } from "@/lib/sound-manager"
import { debouncedStorage } from "@/engine/storage-adapter"
import { NUMBER_KEY_ROUTES } from "@/lib/keyboard-shortcuts"
import { logger } from "@/lib/logger"
import { MotionConfig } from "framer-motion"

const ExitConfirmDialog = dynamic(() => import("./ExitConfirmDialog").then(mod => mod.ExitConfirmDialog), { ssr: false })
const MatchNavigationGuard = dynamic(() => import("./MatchNavigationGuard").then(mod => mod.MatchNavigationGuard), { ssr: false })
const TournamentWinCelebration = dynamic(() => import("../celebration/TournamentWinCelebration").then(mod => mod.TournamentWinCelebration), { ssr: false })
const ToastNotifications = dynamic(() => import("../ui/ToastNotifications").then(mod => mod.ToastNotifications), { ssr: false })
const LegendPickModal = dynamic(() => import("../celebration/LegendPickModal").then(mod => mod.LegendPickModal), { ssr: false })
const BugReportButton = dynamic(() => import("../ui/BugReportButton").then(mod => mod.BugReportButton), { ssr: false })
const DevTools = dynamic(() => import("../debug/DevTools").then(mod => mod.DevTools), { ssr: false })
const WeekProcessingOverlay = dynamic(() => import("../ui/WeekProcessingOverlay").then(mod => mod.WeekProcessingOverlay), { ssr: false })
const KeyboardShortcutsModal = dynamic(() => import("../ui/KeyboardShortcutsModal").then(mod => mod.KeyboardShortcutsModal), { ssr: false })
const HelpSystem = dynamic(() => import("../ui/help-system").then(mod => mod.HelpSystem), { ssr: false })
// Mounted globally (was previously only on /desktop) so onboarding fires
// regardless of which page the player lands on after a new game.
const TutorialOverlay = dynamic(() => import("../ui/TutorialOverlay").then(mod => mod.TutorialOverlay), { ssr: false })


export function GameShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const { theme, pendingCelebration, clearCelebration, pendingLegendPick, selectLegend, initAchievements, showBugReportButton, timeMode, advanceDay, advanceWeek } = useGameStore(useShallow(state => ({
        theme: state.theme,
        pendingCelebration: state.pendingCelebration,
        clearCelebration: state.clearCelebration,
        pendingLegendPick: state.pendingLegendPick,
        selectLegend: state.selectLegend,
        initAchievements: state.initAchievements,
        showBugReportButton: state.showBugReportButton,
        timeMode: state.timeMode,
        advanceDay: state.advanceDay,
        advanceWeek: state.advanceWeek,
    })))

    // Keyboard shortcuts modal state
    const [shortcutsOpen, setShortcutsOpen] = useState(false)

    // Exit confirmation dialog state
    const [exitDialog, setExitDialog] = useState<{ open: boolean; variant: ExitDialogVariant } | null>(null)
    const exitResolverRef = useRef<((confirmed: boolean) => void) | null>(null)
    const isExitInProgressRef = useRef(false)

    const showExitConfirmRef = useRef<(variant: ExitDialogVariant) => Promise<boolean>>()
    showExitConfirmRef.current = (variant: ExitDialogVariant): Promise<boolean> => {
        return new Promise<boolean>((resolve) => {
            exitResolverRef.current = resolve
            setExitDialog({ open: true, variant })
        })
    }

    const handleExitConfirm = useCallback(() => {
        exitResolverRef.current?.(true)
        exitResolverRef.current = null
        setExitDialog(null)
    }, [])

    const handleExitCancel = useCallback(() => {
        exitResolverRef.current?.(false)
        exitResolverRef.current = null
        isExitInProgressRef.current = false
        setExitDialog(null)
    }, [])

    // Sync sound manager with persisted settings on mount
    useEffect(() => {
        const settings = (window as any).__settingsStore
        if (!settings) {
            // Dynamic import to avoid circular deps
            import("@/lib/settings-store").then(({ useSettingsStore }) => {
                const s = useSettingsStore.getState()
                import("@/lib/sound-manager").then(({ soundManager }) => {
                    soundManager.setMasterVolume(s.masterVolume)
                    soundManager.setMusicVolume(s.musicVolume)
                    soundManager.setSfxVolume(s.sfxVolume)
                    if (s.reducedMotion) {
                        document.documentElement.classList.add('reduce-motion')
                    }
                    if (s.uiScale !== 100) {
                        document.documentElement.style.fontSize = `${s.uiScale}%`
                    }
                })
            })
        }
    }, [])

    useEffect(() => {
        initAchievements()
        if (typeof window !== "undefined") {
            // Toggle only the theme classes — never overwrite className
            // wholesale, which would wipe accessibility classes
            // (reduce-motion, high-contrast) added by other effects.
            const root = document.documentElement
            root.classList.add("dark")
            root.classList.toggle("onyx", theme === "onyx")

            // Auto-save on close (Electron)
            const runtimeWindow = window as typeof window & { __esimCloseHookRegistered?: boolean }
            if (!runtimeWindow.__esimCloseHookRegistered && window.electron?.onAppClose) {
                runtimeWindow.__esimCloseHookRegistered = true
                window.electron.onAppClose(async () => {
                    if (isExitInProgressRef.current) return
                    isExitInProgressRef.current = true

                    let allowClose = true

                    try {
                        // Stop periodic auto-save to prevent concurrent IndexedDB writes
                        clearInterval(autoSaveInterval)

                        // Flush any pending debounced storage writes before saving
                        try { await debouncedStorage.flush() } catch { /* best effort */ }

                        let state = useGameStore.getState()

                        if (state.isLoading) {
                            allowClose = await (showExitConfirmRef.current?.("simulationRunning") ?? true)
                        }

                        // Re-fetch state — simulation may have finished while dialog was shown
                        state = useGameStore.getState()

                        if (allowClose && !state.isLoading && state.autoSave && state.saveId) {
                            setExitDialog({ open: true, variant: "saving" })

                            let saved = false
                            for (let attempt = 0; attempt < 3 && !saved; attempt++) {
                                try {
                                    await useGameStore.getState().saveGame()
                                    saved = true
                                    setExitDialog(null)
                                } catch (err) {
                                    logger.error(`[GameShell] Close-save attempt ${attempt + 1} failed`, err instanceof Error ? err.message : err)
                                    if (attempt < 2) {
                                        await new Promise(r => setTimeout(r, 300))
                                    }
                                }
                            }

                            if (!saved) {
                                allowClose = await (showExitConfirmRef.current?.("saveFailed") ?? true)
                            }
                        }
                    } catch (err) {
                        void err // Close handler error - don't trap user
                        allowClose = true // On error, never trap the user
                    } finally {
                        isExitInProgressRef.current = false
                    }

                    if (allowClose) {
                        window.electron.confirmAppClose()
                    } else {
                        window.electron.cancelAppClose?.()
                    }
                })
            }

            // Auto-save on close (browser / dev mode fallback only)
            const handleBeforeUnload = (e: BeforeUnloadEvent) => {
                // In Electron, close is handled entirely via IPC (app-close-intent)
                if (window.electron) return
                const s = useGameStore.getState()
                if (s.autoSave && s.saveId && !s.isLoading) {
                    s.saveGame().catch(() => { })
                    e.preventDefault()
                    e.returnValue = ""
                }
            }
            window.addEventListener("beforeunload", handleBeforeUnload)

            // Periodic Auto-save (every 2 minutes)
            let isSaving = false
            const autoSaveInterval = setInterval(async () => {
                if (isSaving) return
                const state = useGameStore.getState()
                if (state.autoSave && state.saveId && !state.isLoading) {
                    isSaving = true
                    try {
                        // Flush pending debounced writes before saving
                        await debouncedStorage.flush()
                        await state.saveGame()
                    } catch {
                        // Periodic auto-save silently retries next interval
                    } finally {
                        isSaving = false
                    }
                }
            }, 2 * 60 * 1000)

            // Pause week advancement when window loses focus
            const handleVisibilityChange = () => {
                const state = useGameStore.getState()
                if (document.hidden && state.isLoading) {
                    // If a simulation is running, we don't interrupt it
                    return
                }
                // Mark window focus state so advanceWeek can check
                ;(window as any).__esimWindowFocused = !document.hidden
            }
            document.addEventListener("visibilitychange", handleVisibilityChange)
            ;(window as any).__esimWindowFocused = true

            return () => {
                clearInterval(autoSaveInterval)
                window.removeEventListener("beforeunload", handleBeforeUnload)
                document.removeEventListener("visibilitychange", handleVisibilityChange)
            }
        }
    }, [theme, initAchievements])

    // Ambient music management based on current route
    const prevScene = useRef<string | null>(null)
    useEffect(() => {
        const isLiveMatch = pathname?.includes("/match/") && pathname?.includes("/live")
        const scene = isLiveMatch ? 'match' : 'menu'

        if (prevScene.current !== scene) {
            soundManager.stopMusic()
            if (scene !== 'match') {
                soundManager.startMusic(scene as 'menu' | 'match')
            }
            prevScene.current = scene
        }

        return () => { soundManager.stopMusic() }
    }, [pathname])

    const isNewGame = pathname === "/new-game" || pathname?.startsWith("/new-game/")
    const isMainMenu = pathname === "/main-menu"
    const isDesktop = pathname === "/desktop"
    const hideChrome = isNewGame || isMainMenu

    // Global Keyboard Shortcuts (consolidated — TopBar no longer registers its own handlers)
    const router = useRouter()
    useEffect(() => {
        const quickSave = async () => {
            const state = useGameStore.getState()
            if (!state.saveId || state.isLoading) return
            try {
                await debouncedStorage.flush()
                await state.saveGame()
                soundManager.play('weekAdvance')
            } catch {
                // Save errors surface via the exit-save path; swallow here so a hotkey
                // press doesn't throw into the window-level keydown listener.
            }
        }

        const toggleFullscreen = async () => {
            const w = (window as typeof window & { electron?: { window?: { isFullscreen: () => Promise<boolean>; setFullscreen: (fs: boolean) => Promise<boolean> } } }).electron?.window
            if (!w) return
            try {
                const fs = await w.isFullscreen()
                await w.setFullscreen(!fs)
            } catch {
                // Non-Electron (dev browser) — ignore
            }
        }

        const handler = (e: KeyboardEvent) => {
            // Don't intercept when a form control owns keyboard handling.
            // SELECT matters for number keys: the Gameplay auto-save interval
            // select has numeric options (2/5/10/15/30) that would otherwise
            // double as both a select type-ahead and a route shortcut.
            const tag = (e.target as HTMLElement)?.tagName
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement)?.isContentEditable) return
            // Don't intercept when a dialog/modal is open — the open dialog owns
            // keyboard handling (Esc, Ctrl+Enter) via its own listeners.
            if (document.querySelector('[role="dialog"]')) return

            const mod = e.ctrlKey || e.metaKey

            // Ctrl/Cmd+S — save
            if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
                e.preventDefault()
                void quickSave()
                return
            }
            // Ctrl/Cmd+L — load screen
            if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "l") {
                e.preventDefault()
                router.push("/load-game")
                return
            }

            // F-keys
            if (e.key === "F1") {
                e.preventDefault()
                setShortcutsOpen(prev => !prev)
                return
            }
            if (e.key === "F2") {
                e.preventDefault()
                void quickSave()
                return
            }
            if (e.key === "F3") {
                e.preventDefault()
                router.push("/load-game")
                return
            }
            if (e.key === "F10") {
                e.preventDefault()
                router.push("/settings")
                return
            }
            if (e.key === "F11") {
                e.preventDefault()
                void toggleFullscreen()
                return
            }

            if (e.key === "Escape") {
                e.preventDefault()
                router.back()
                return
            }
            if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
                e.preventDefault()
                setShortcutsOpen(prev => !prev)
                return
            }

            // 1–9 section shortcuts. Require no modifiers so Ctrl+1 etc. stay free.
            if (!mod && !e.altKey && !e.shiftKey && /^[1-9]$/.test(e.key)) {
                const route = NUMBER_KEY_ROUTES[e.key]
                if (route && !hideChrome) {
                    e.preventDefault()
                    router.push(route)
                    return
                }
            }

            if (e.key === " " && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                // Don't advance on non-gameplay pages
                const path = window.location.pathname
                if (path.includes('/match/') || path.includes('/settings') || path.includes('/credits') || path.includes('/load-game')) return
                const state = useGameStore.getState()
                const windowFocused = (window as any).__esimWindowFocused !== false
                if (state.saveId && !state.isLoading && !hideChrome && windowFocused) {
                    e.preventDefault()
                    soundManager.play('weekAdvance')
                    if (state.timeMode === "HYBRID_DAILY") {
                        state.advanceDay()
                    } else {
                        state.advanceWeek()
                    }
                }
            }
        }
        window.addEventListener("keydown", handler)
        return () => window.removeEventListener("keydown", handler)
    }, [router, hideChrome])

    return (
        // App-wide MotionConfig honors prefers-reduced-motion automatically
        // for every framer-motion descendant. Components that need to
        // override (e.g. a celebration that should still flash briefly) can
        // wrap themselves in a nested MotionConfig.
        <MotionConfig reducedMotion="user">
        <div className={`flex h-screen liquid-app-bg text-foreground overflow-hidden font-sans selection:bg-cyan-500/30 ${theme === "onyx" ? "onyx" : ""}`}>
            {/* Ambient depth layers — sit behind all chrome (z-[-1]); grain over aurora. */}
            <div className="liquid-aurora z-[-1]" />
            <div className="pointer-events-none absolute inset-0 liquid-noise" />
            {/* Fixed Sidebar - Hidden on New Game/Main Menu */}
            {!hideChrome && <Sidebar />}

            {/* Main Layout Area */}
            <div className="flex-1 flex flex-col min-w-0 relative z-10">
                {/* Top Status Bar - Hidden on New Game/Main Menu */}
                {!hideChrome && <TopBar />}

                {/* Scrollable Content Area */}
                <main id="main-content" className="flex-1 overflow-x-hidden relative overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-black/20">
                    {/* Single uniform page-entry animation for every route —
                        keyed on pathname so it re-runs per navigation. Pages
                        must NOT add their own entry fade (double-animation). */}
                    <div
                        key={pathname}
                        className={hideChrome || isDesktop ? "" : "p-8 pb-12 max-w-[1600px] mx-auto w-full animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out"}
                    >
                        <ErrorBoundary>
                            {children}
                        </ErrorBoundary>
                    </div>
                </main>
            </div>

            <MatchNavigationGuard />
            <ToastNotifications />
            {exitDialog && (
                <ExitConfirmDialog
                    open={exitDialog.open}
                    variant={exitDialog.variant}
                    onConfirm={handleExitConfirm}
                    onCancel={handleExitCancel}
                />
            )}
            {
                pendingCelebration && (
                    <TournamentWinCelebration
                        data={pendingCelebration}
                        onClose={clearCelebration}
                    />
                )
            }
            {
                pendingLegendPick && !pendingCelebration && (
                    <LegendPickModal
                        data={pendingLegendPick}
                        onSelect={selectLegend}
                    />
                )
            }
            {showBugReportButton && !hideChrome && <BugReportButton />}
            {!hideChrome && <HelpSystem />}
            {!hideChrome && <TutorialOverlay />}
            <DevTools />
            <WeekProcessingOverlay />
            <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        </div >
        </MotionConfig>
    )
}
