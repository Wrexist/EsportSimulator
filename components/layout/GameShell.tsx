"use client"

import { useRouteScroll } from "@/hooks/use-route-scroll"
import { routeAtmosphere } from "@/lib/ui-assets"
import { COLOR_VISION_MODES } from "@/lib/accessibility-preferences"
import { stopConfetti } from "@/lib/confetti-lazy"
import { TopBar } from "./TopBar"
import { ErrorBoundary } from "./ErrorBoundary"

import { usePathname, useRouter } from "next/navigation"
import { useGameStore } from "@/store/game-store"
import { DismissalJobMarket } from "@/components/career/DismissalJobMarket"
import { useSettingsStore } from "@/lib/settings-store"
import { Suspense, useEffect, useRef, useState, useCallback } from "react"
import { useShallow } from "zustand/react/shallow"
import type { ExitDialogVariant } from "./ExitConfirmDialog"
import dynamic from "next/dynamic"
import { soundManager } from "@/lib/sound-manager"
import { routeMusicScene } from "@/lib/route-audio"
import { debouncedStorage } from "@/engine/storage-adapter"
import { INBOX_OPEN_KEY, INBOX_TOGGLE_KEY, NUMBER_KEY_ROUTES } from "@/lib/keyboard-shortcuts"
import { InboxUrlBridge } from "@/components/inbox/InboxUrlBridge"
import { useInboxDrawer } from "@/components/inbox/inbox-drawer-store"
import { logger } from "@/lib/logger"
import { MotionConfig } from "framer-motion"
import { useAppReducedMotion } from "@/lib/reduced-motion"
import { createSessionPersistence } from "@/lib/session-persistence"
import { waitForPendingGameSave } from "@/store/game-store"
import { useMomentPending } from "@/components/moments/moment-state"

const ExitConfirmDialog = dynamic(() => import("./ExitConfirmDialog").then(mod => mod.ExitConfirmDialog), { ssr: false })
const MatchNavigationGuard = dynamic(() => import("./MatchNavigationGuard").then(mod => mod.MatchNavigationGuard), { ssr: false })
const MomentHost = dynamic(() => import("../moments/MomentHost").then(mod => mod.MomentHost), { ssr: false })
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
const InboxDrawer = dynamic(() => import("../inbox/InboxDrawer").then(mod => mod.InboxDrawer), { ssr: false })

const LIVE_MATCH_PATH = /^\/match\/[^/]+\/live\/?$/
function isLiveMatchPath(path: string | null | undefined): boolean {
    return !!path && LIVE_MATCH_PATH.test(path)
}

/** Screens open while between clubs: the job market, the wider world and settings. */
const BETWEEN_CLUBS_ROUTES = ["/team/", "/rankings", "/league", "/hall-of-fame", "/settings", "/credits", "/load-game", "/main-menu", "/new-game", "/map-editor", "/dev"]
function isBetweenClubsRoute(pathname: string | null): boolean {
    if (!pathname || pathname === "/") return true
    return BETWEEN_CLUBS_ROUTES.some(r => r.endsWith("/") ? pathname.startsWith(r) : pathname === r || pathname.startsWith(`${r}/`))
}

export function GameShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const { theme, pendingLegendPick, selectLegend, initAchievements, showBugReportButton } = useGameStore(useShallow(state => ({
        theme: state.theme,
        pendingLegendPick: state.pendingLegendPick,
        selectLegend: state.selectLegend,
        initAchievements: state.initAchievements,
        showBugReportButton: state.showBugReportButton,
    })))

    // Full-screen moments (titles, tier moves, signings, welcome) come first;
    // the legend pick of a major opens after its title moment.
    const momentPending = useMomentPending()

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
    const soundEnabled = useSettingsStore(state => state.soundEnabled)
    const motionReduced = useAppReducedMotion()
    const preferencesHydrated = useGameStore(state => state._hasHydrated)

    useEffect(() => {
        try { useSettingsStore.getState().adoptLegacyColorVision(localStorage.getItem("colorblind-mode")) } catch { /* denied storage keeps defaults */ }
        const media = window.matchMedia("(prefers-reduced-motion: reduce)")
        const applyPreferences = () => {
            const settings = useSettingsStore.getState()
            soundManager.setMasterVolume(settings.masterVolume)
            soundManager.setMusicVolume(settings.musicVolume)
            soundManager.setSfxVolume(settings.sfxVolume)
            soundManager.setUiSounds(settings.uiSounds)
            soundManager.setHoverSounds(settings.hoverSounds)
            soundManager.setMuteWhenUnfocused(settings.muteWhenUnfocused)
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
            // Audio follows focus too ("mute when window unfocused" decides whether that silences it).
            soundManager.setForeground(!document.hidden && (typeof document.hasFocus !== "function" || document.hasFocus()))
        }
        window.addEventListener("beforeunload", handleBeforeUnload)
        document.addEventListener("visibilitychange", handleVisibilityChange)
        window.addEventListener("focus", handleVisibilityChange)
        window.addEventListener("blur", handleVisibilityChange)
        handleVisibilityChange()
        return () => {
            disposed = true
            persistence.dispose()
            unsubscribeClose?.()
            exitResolverRef.current?.(false)
            exitResolverRef.current = null
            window.removeEventListener("beforeunload", handleBeforeUnload)
            document.removeEventListener("visibilitychange", handleVisibilityChange)
            window.removeEventListener("focus", handleVisibilityChange)
            window.removeEventListener("blur", handleVisibilityChange)
        }
    }, [])

    const inCareer = useGameStore(state => !!state.saveId && !!state.playerTeamId)
    // Between clubs (sacked, club folded, or a career started without a club)
    // there is no club to run: management screens show the job market.
    const betweenClubs = useGameStore(state => inCareer && !!state.gameOverReason)
    const musicScene = routeMusicScene(pathname, inCareer)
    useEffect(() => {
        soundManager.setQuietScene(musicScene === "silent")
        soundManager.setEnabled(preferencesHydrated && soundEnabled)
        if (musicScene === "silent") soundManager.stopMusic()
        else soundManager.startMusic(musicScene)
    }, [musicScene, soundEnabled, preferencesHydrated])
    useEffect(() => () => soundManager.stopMusic(), [])

    const isNewGame = pathname === "/new-game" || pathname?.startsWith("/new-game/")
    const isMainMenu = pathname === "/main-menu"
    const hideChrome = isNewGame || isMainMenu || pathname === "/map-editor" || pathname?.startsWith("/map-editor/")
    // Match screens (veto, tactics, live, result) own the whole view: the
    // onboarding checklist would sit on top of the result headline.
    const isMatchRoute = pathname?.startsWith("/match/") ?? false
    // The live match is full-screen: no sidebar (all locked mid-match) and no
    // top bar (its "Play match" CTA is wrong while the match is running).
    const isLiveMatch = isLiveMatchPath(pathname)
    // The result page runs its scoreboard and standouts to the right edge, so
    // the floating help button would sit on the MVP rating at 1280×720.
    const isMatchResult = isMatchRoute && (pathname?.endsWith("/result") ?? false)

    const viewCareerId = useGameStore(state => state.saveId)
    const mainScrollRef = useRouteScroll(viewCareerId, pathname, !hideChrome)

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
            // Mid-match the sidebar is locked; navigation hotkeys must not
            // bypass it (they used to route away and trip the match guard).
            const onLiveMatch = isLiveMatchPath(window.location.pathname)

            // Ctrl/Cmd+S — save
            if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
                e.preventDefault()
                void quickSave()
                return
            }
            if (onLiveMatch && (e.key === "Escape" || e.key === "F3" || e.key === "F10" || (mod && e.key.toLowerCase() === "l") || (!mod && !e.altKey && (/^[1-9]$/.test(e.key) || e.key.toLowerCase() === INBOX_TOGGLE_KEY)))) return
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
                soundManager.play("back")
                router.back()
                return
            }
            if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
                e.preventDefault()
                setShortcutsOpen(prev => !prev)
                return
            }

            // Inbox drawer: I toggles, 2 opens (it replaced the /desktop route).
            // While the drawer is open it handles I itself (dialog guard above).
            if (!mod && !e.altKey && !hideChrome && (e.key.toLowerCase() === INBOX_TOGGLE_KEY || (!e.shiftKey && e.key === INBOX_OPEN_KEY))) {
                e.preventDefault()
                if (e.key === INBOX_OPEN_KEY) useInboxDrawer.getState().openInbox()
                else useInboxDrawer.getState().toggle()
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
                if (state.saveId && !state.isLoading && !state.continueRun && !hideChrome && windowFocused) {
                    e.preventDefault()
                    soundManager.play('weekAdvance')
                    // Same as the top-bar Continue: run to the next decision.
                    void state.continueToNextDecision()
                }
            }
        }
        window.addEventListener("keydown", handler)
        return () => window.removeEventListener("keydown", handler)
    }, [router, hideChrome])

    return (
        // App-wide MotionConfig. With reduced motion active (in-game setting
        // OR OS preference) every framer-motion animation — including
        // opacity/colour loops that `reducedMotion="always"` alone leaves
        // running — jumps straight to its final value via skipAnimations.
        <MotionConfig reducedMotion={reducedMotion ? "always" : "user"} skipAnimations={motionReduced}>
        <div data-route={pathname} data-premium-ui={!pathname?.startsWith('/map-editor') && !pathname?.startsWith('/dev')} className={`premium-app relative isolate flex h-dvh liquid-app-bg text-foreground overflow-hidden font-sans selection:bg-gold/30 ${theme === "onyx" ? "onyx" : ""}`}>
            {/* Static light field behind the floating chrome. */}
            <div className="liquid-aurora" />
            {!pathname?.startsWith('/map-editor') && !pathname?.startsWith('/dev') && <div aria-hidden="true" className="premium-atmosphere" style={{ backgroundImage: `url("${routeAtmosphere(pathname || '/')}")` }} />}

            {/* Main Layout Area */}
            <div className="flex-1 flex flex-col min-h-0 min-w-0 relative z-10">
                {/* Two-row header (hubs + sub-tabs) - hidden on New Game/Main Menu and the full-screen live match */}
                {!hideChrome && !isLiveMatch && <TopBar />}

                {/* Scrollable Content Area */}
                <main ref={mainScrollRef} id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-x-hidden relative overflow-y-auto">
                    {/* Short opacity reveal; routing never waits for an exit animation. */}
                    <div
                        key={pathname}
                        className={hideChrome ? "" : isLiveMatch ? "live-match-page h-full w-full px-4 py-3" : "game-page px-4 py-4 lg:px-6 lg:py-5 pb-8 max-w-[1600px] mx-auto w-full"}
                    >
                        <ErrorBoundary>
                            {!hideChrome && !isMatchRoute && <TutorialOverlay />}
                            {betweenClubs && !isBetweenClubsRoute(pathname) ? <DismissalJobMarket blockedRoute /> : children}
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
            <MomentHost />
            {
                pendingLegendPick && !momentPending && (
                    <LegendPickModal
                        data={pendingLegendPick}
                        onSelect={selectLegend}
                    />
                )
            }
            {!hideChrome && !isLiveMatch && (
                <>
                    <Suspense fallback={null}><InboxUrlBridge /></Suspense>
                    <InboxDrawer />
                </>
            )}
            {showBugReportButton && !hideChrome && !isLiveMatch && <BugReportButton />}
            {!hideChrome && !isLiveMatch && !isMatchResult && <HelpSystem />}
            {!pathname?.startsWith("/map-editor") && <DevTools />}
            <WeekProcessingOverlay />
            <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        </div >
        </MotionConfig>
    )
}
