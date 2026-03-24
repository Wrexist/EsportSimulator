"use client"

import { Sidebar } from "./Sidebar"
import { TopBar } from "./TopBar"
import { ErrorBoundary } from "./ErrorBoundary"

import { usePathname, useRouter } from "next/navigation"
import { useGameStore } from "@/store/game-store"
import { useEffect, useRef, useState, useCallback } from "react"
import type { ExitDialogVariant } from "./ExitConfirmDialog"
import dynamic from "next/dynamic"
import { soundManager } from "@/lib/sound-manager"

const ExitConfirmDialog = dynamic(() => import("./ExitConfirmDialog").then(mod => mod.ExitConfirmDialog), { ssr: false })
const MatchNavigationGuard = dynamic(() => import("./MatchNavigationGuard").then(mod => mod.MatchNavigationGuard), { ssr: false })
const TournamentWinCelebration = dynamic(() => import("../celebration/TournamentWinCelebration").then(mod => mod.TournamentWinCelebration), { ssr: false })
const ToastNotifications = dynamic(() => import("../ui/ToastNotifications").then(mod => mod.ToastNotifications), { ssr: false })
const LegendPickModal = dynamic(() => import("../celebration/LegendPickModal").then(mod => mod.LegendPickModal), { ssr: false })
const BugReportButton = dynamic(() => import("../ui/BugReportButton").then(mod => mod.BugReportButton), { ssr: false })
const DevTools = dynamic(() => import("../debug/DevTools").then(mod => mod.DevTools), { ssr: false })
const WeekProcessingOverlay = dynamic(() => import("../ui/WeekProcessingOverlay").then(mod => mod.WeekProcessingOverlay), { ssr: false })
const KeyboardShortcutsModal = dynamic(() => import("../ui/KeyboardShortcutsModal").then(mod => mod.KeyboardShortcutsModal), { ssr: false })


export function GameShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const theme = useGameStore(state => state.theme)
    const pendingCelebration = useGameStore(state => state.pendingCelebration)
    const clearCelebration = useGameStore(state => state.clearCelebration)
    const pendingLegendPick = useGameStore(state => state.pendingLegendPick)
    const selectLegend = useGameStore(state => state.selectLegend)
    const initAchievements = useGameStore(state => state.initAchievements)
    const showBugReportButton = useGameStore(state => state.showBugReportButton)

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

    useEffect(() => {
        initAchievements()
        if (typeof window !== "undefined") {
            document.documentElement.className = theme === "onyx" ? "dark onyx" : "dark"

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
                                    console.error(`[GameShell] Close-save attempt ${attempt + 1} failed:`, err instanceof Error ? err.message : err)
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

    // Global Keyboard Shortcuts
    const router = useRouter()
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            // Don't intercept when typing in inputs, textareas, or content-editable
            const tag = (e.target as HTMLElement)?.tagName
            if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return
            // Don't intercept when a dialog/modal is open
            if (document.querySelector('[role="dialog"]')) return

            if (e.key === "Escape") {
                e.preventDefault()
                router.back()
            }
            if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
                e.preventDefault()
                setShortcutsOpen(prev => !prev)
                return
            }
            if (e.key === " " && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                const state = useGameStore.getState()
                const windowFocused = (window as any).__esimWindowFocused !== false
                if (state.saveId && !state.isLoading && !hideChrome && windowFocused) {
                    e.preventDefault()
                    state.advanceWeek()
                }
            }
        }
        window.addEventListener("keydown", handler)
        return () => window.removeEventListener("keydown", handler)
    }, [router, hideChrome])

    return (
        <div className={`flex h-screen bg-[#080a0e] text-foreground overflow-hidden font-sans selection:bg-cyan-500/30 ${theme === "onyx" ? "onyx" : ""}`}>
            {/* Fixed Sidebar - Hidden on New Game/Main Menu */}
            {!hideChrome && <Sidebar />}

            {/* Main Layout Area */}
            <div className="flex-1 flex flex-col min-w-0 relative z-10">
                {/* Top Status Bar - Hidden on New Game/Main Menu */}
                {!hideChrome && <TopBar />}

                {/* Scrollable Content Area */}
                <main id="main-content" className="flex-1 overflow-x-hidden relative overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-black/20">
                    <div
                        key={pathname}
                        className={hideChrome || isDesktop ? "" : "p-8 pb-12 max-w-[1600px] mx-auto w-full"}
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
            <DevTools />
            <WeekProcessingOverlay />
            <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        </div >
    )
}

