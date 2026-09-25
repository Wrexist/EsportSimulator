"use client"

import { useRouteScroll } from "@/hooks/use-route-scroll"
import { routeAtmosphere } from "@/lib/ui-assets"
import { COLOR_VISION_MODES } from "@/lib/accessibility-preferences"
import { stopConfetti } from "@/lib/confetti-lazy"
import { Sidebar } from "./Sidebar"
import { TopBar } from "./TopBar"
import { ErrorBoundary } from "./ErrorBoundary"

import { usePathname, useRouter } from "next/navigation"
import { useGameStore } from "@/store/game-store"
import { useSettingsStore } from "@/lib/settings-store"
import { useEffect, useRef, useState, useCallback } from "react"
import { useShallow } from "zustand/react/shallow"
import type { ExitDialogVariant } from "./ExitConfirmDialog"
import dynamic from "next/dynamic"
import { soundManager } from "@/lib/sound-manager"
import { routeMusicScene } from "@/lib/route-audio"
import { debouncedStorage } from "@/engine/storage-adapter"
import { NUMBER_KEY_ROUTES } from "@/lib/keyboard-shortcuts"
import { logger } from "@/lib/logger"
import { MotionConfig } from "framer-motion"
import { createSessionPersistence } from "@/lib/session-persistence"
import { waitForPendingGameSave } from "@/store/game-store"

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
    const { theme, pendingCelebration, clearCelebration, pendingLegendPick, selectLegend, initAchievements, showBugReportButton, timeMode, advanceDay, advanceWeek, soundEnabled } = useGameStore(useShallow(state => ({
        theme: state.theme,
        soundEnabled: state.soundEnabled,
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

    const showExitConfirmRef = useRef<((variant: ExitDialogVariant) => Promise<boolean>) | undefined>(undefined)
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
        setExitDialog(null)
    }, [])

    const reducedMotion = useSettingsStore(state => state.reducedMotion)
    const preferencesHydrated = useGameStore(state => state._hasHydrated)

    useEffect(() => {
        try { useSettingsStore.getState().adoptLegacyColorVision(localStorage.getItem("colorblind-mode")) } catch { /* denied storage keeps defaults */ }
        const media = window.matchMedia("(prefers-reduced-motion: reduce)")
        const applyPreferences = () => {
            const settings = useSettingsStore.getState()
            soundManager.setMasterVolume(settings.masterVolume)
            soundManager.setMusicVolume(settings.musicVolume)
            soundManager.setSfxVolume(settings.sfxVolume)
            document.documentElement.classList.toggle("reduce-motion", settings.reducedMotion || media.matches)
            if (settings.reducedMotion || media.matches) stopConfetti()
            document.documentElement.classList.remove(...COLOR_VISION_MODES.filter(mode => mode !== "off"))
            if (settings.colorVisionMode !== "off") document.documentElement.classList.add(settings.colorVisionMode)
            document.documentElement.style.fontSize = `${settings.uiScale}%`
        }
        applyPreferences()
        const unsubscribe = useSettingsStore.subscribe(applyPreferences)
        media.addEventListener("change", applyPreferences)
        return () => { unsubscribe(); media.removeEventListener("change", applyPreferences) }
    }, [])

    useEffect(() => {
        document.documentElement.classList.add("dark")
        document.documentElement.classList.toggle("onyx", theme === "onyx")
    }, [theme])

    useEffect(() => { initAchievements() }, [initAchievements])

    useEffect(() => {
        const runtimeWindow = window as typeof window & {
            __esimWindowFocused?: boolean
            electron?: {
                onAppClose: (callback: () => void) => (() => void) | void
                acknowledgeAppClose?: () => Promise<boolean>
                confirmAppClose: () => Promise<boolean> | void
                cancelAppClose?: () => Promise<boolean> | void
            }
        }
        const electronBridge = runtimeWindow.electron
        let disposed = false
        const persistence = createSessionPersistence({
            getState: useGameStore.getState,
            getSettings: useSettingsStore.getState,
            flush: async () => { await debouncedStorage.flush(); await waitForPendingGameSave() },
            confirm: variant => showExitConfirmRef.current?.(variant) ?? Promise.resolve(false),
            showSaving: saving => setExitDialog(saving ? { open: true, variant: "saving" } : null),
            onError: error => logger.error("[GameShell] Save/close failed", error),
        })
        const unsubscribeClose = electronBridge?.onAppClose(async () => {
            // Acknowledge receipt before awaiting a save or the player's choice.
            // Electron's watchdog only covers an unresponsive close handler.
            try { await electronBridge.acknowledgeAppClose?.() }
            catch (error) { logger.warn("[GameShell] Close acknowledgement failed", error) }
            const allowClose = await persistence.requestClose()
            if (disposed) return
            if (allowClose) await electronBridge.confirmAppClose()
            else await electronBridge.cancelAppClose?.()
        })
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (electronBridge) return
            const state = useGameStore.getState()
            if (useSettingsStore.getState().autoSave && state.saveId) {
                if (!state.isLoading) void state.saveGame().catch(() => {})
                event.preventDefault()
                event.returnValue = ""
            }
        }
        const handleVisibilityChange = () => {
            runtimeWindow.__esimWindowFocused = !document.hidden
            soundManager.setForeground(!document.hidden)
        }
        window.addEventListener("beforeunload", handleBeforeUnload)
        document.addEventListener("visibilitychange", handleVisibilityChange)
        handleVisibilityChange()
        return () => {
            disposed = true
            persistence.dispose()
            unsubscribeClose?.()
            exitResolverRef.current?.(false)
            exitResolverRef.current = null
            window.removeEventListener("beforeunload", handleBeforeUnload)
            document.removeEventListener("visibilitychange", handleVisibilityChange)
        }
    }, [])

    const musicScene = routeMusicScene(pathname)
    useEffect(() => {
        soundManager.setQuietScene(musicScene === "silent")
        soundManager.setEnabled(preferencesHydrated && soundEnabled)
        if (musicScene === "silent") soundManager.stopMusic()
        if (musicScene !== "silent") soundManager.startMusic(musicScene)
        return () => { soundManager.stopMusic() }
    }, [musicScene, soundEnabled, preferencesHydrated])

    const isNewGame = pathname === "/new-game" || pathname?.startsWith("/new-game/")
    const isMainMenu = pathname === "/main-menu"
    const isDesktop = pathname === "/desktop"
    const hideChrome = isNewGame || isMainMenu || pathname === "/map-editor" || pathname?.startsWith("/map-editor/")

    const viewCareerId = useGameStore(state => state.saveId)
    const mainScrollRef = useRouteScroll(viewCareerId, pathname, !hideChrome && !isDesktop)

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
            // A dialog can consume Escape and unmount before this window listener runs.
            if (e.defaultPrevented) return
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
        <MotionConfig reducedMotion={reducedMotion ? "always" : "user"}>
        <div data-route={pathname} data-premium-ui={!pathname?.startsWith('/map-editor') && !pathname?.startsWith('/dev')} className={`premium-app relative isolate flex h-dvh liquid-app-bg text-foreground overflow-hidden font-sans selection:bg-cyan-500/30 ${theme === "onyx" ? "onyx" : ""}`}>
            {/* Static light field behind the floating chrome. */}
            <div className="liquid-aurora" />
            {!pathname?.startsWith('/map-editor') && !pathname?.startsWith('/dev') && <div aria-hidden="true" className="premium-atmosphere" style={{ backgroundImage: `url("${routeAtmosphere(pathname || '/')}")` }} />}

            {/* Fixed Sidebar - Hidden on New Game/Main Menu */}
            {!hideChrome && <Sidebar />}

            {/* Main Layout Area */}
            <div className="flex-1 flex flex-col min-h-0 min-w-0 relative z-10">
                {/* Top Status Bar - Hidden on New Game/Main Menu */}
                {!hideChrome && <TopBar />}

                {/* Scrollable Content Area */}
                <main ref={mainScrollRef} id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-x-hidden relative overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-black/20">
                    {/* Short opacity reveal; routing never waits for an exit animation. */}
                    <div
                        key={pathname}
                        className={hideChrome || isDesktop ? "" : "game-page px-4 py-4 lg:px-6 lg:py-5 pb-8 max-w-[1600px] mx-auto w-full"}
                    >
                        <ErrorBoundary>
                            {!hideChrome && <TutorialOverlay />}
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
            {!pathname?.startsWith("/map-editor") && <DevTools />}
            <WeekProcessingOverlay />
            <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        </div >
        </MotionConfig>
    )
}
