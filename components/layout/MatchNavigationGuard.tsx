"use client"

import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Lock } from "lucide-react"
import { useFocusTrap } from "@/lib/accessibility"
import { resolveMatchWithoutLiveScreen } from "@/lib/live-match-rescue"
import { toast } from "@/lib/toast"
import { t } from "@/lib/i18n"

export function MatchNavigationGuard() {
    const { activeMatchId, setActiveMatch, completedMatches, scheduledMatches, currentWeek, isInitialized } = useGameStore(useShallow(state => ({
        activeMatchId: state.activeMatchId,
        setActiveMatch: state.setActiveMatch,
        completedMatches: state.completedMatches,
        scheduledMatches: state.scheduledMatches,
        currentWeek: state.currentWeek,
        isInitialized: state.isInitialized,
    })))
    const pathname = usePathname()
    const router = useRouter()
    const [showBlocker, setShowBlocker] = useState(false)
    const [resolving, setResolving] = useState(false)

    useEffect(() => {
        // Wait for store to hydrate/initialize to prevent false positives on reload
        if (!isInitialized) return

        // Check if we are in a match state
        if (!activeMatchId) {
            setShowBlocker(false)
            return
        }

        // Validate that the active match is actually still valid
        const activeId = activeMatchId

        // 1. Check if it's already completed (in completedMatches array)
        const isCompleted = completedMatches.some(m => m.id === activeId)
        if (isCompleted) {
            // Match completed - clear active state
            setActiveMatch(null)
            setShowBlocker(false)
            return
        }

        // 2. Check if it exists in schedule AND has no result yet
        const scheduled = scheduledMatches.find(m => m.id === activeId)
        if (!scheduled) {
            // Match not in schedule - clear active state
            setActiveMatch(null)
            setShowBlocker(false)
            return
        }

        // 3. Check if the scheduled match already has a result (shouldn't happen, but safety check)
        if (scheduled.result) {
            // Match already has result - clear active state
            setActiveMatch(null)
            setShowBlocker(false)
            return
        }

        // 4. Check if it's expired (past week)
        if (scheduled.week < currentWeek) {
            // Match expired (past week) - clear active state
            setActiveMatch(null)
            setShowBlocker(false)
            return
        }

        // Allow paths related to the match
        // Normalize paths for comparison
        const normalizedPath = pathname.toLowerCase().replace(/\/$/, "")
        const matchBasePath = `/match/${activeId}`.toLowerCase()

        const isMatchPath = normalizedPath.startsWith(matchBasePath)

        // If on result page, consider match done - clear the lock
        const isResultPage = normalizedPath === `${matchBasePath}/result`
        if (isResultPage) {
            // On result page means match is done, clear the active match
            setActiveMatch(null)
            setShowBlocker(false)
            return
        }

        // If not in a match path, show blocker
        if (!isMatchPath) {
            setShowBlocker(true)
        } else {
            setShowBlocker(false)
        }
    }, [activeMatchId, pathname, completedMatches, scheduledMatches, currentWeek, setActiveMatch, isInitialized])

    // "Resume match": straight back to the live screen, where the paused match
    // resumes (a match that cannot start yet is sent on to its prep page there).
    const handleReturnToMatch = () => {
        if (activeMatchId) {
            router.push(`/match/${activeMatchId}/live`)
        }
    }

    // The lock can always be resolved, even when the live screen cannot be shown
    // for this match (CROSSCUT-13): finish it without the live screen.
    const handleSimulateRest = async () => {
        const matchId = activeMatchId
        if (!matchId || resolving) return
        setResolving(true)
        try {
            if (await resolveMatchWithoutLiveScreen(matchId)) {
                // SMOKE-A-16: the final score, in the guard's own words (not the crash card's).
                const st = useGameStore.getState()
                const done = st.completedMatches.find(m => m.id === matchId)
                const name = (id: string) => st.teams.find(tm => tm.id === id)?.name ?? t("common.tbd")
                if (done?.result) {
                    // Your club first, as on the live screen.
                    const flip = done.awayTeamId === st.playerTeamId
                    toast.success(t("matchGuard.finished", flip
                        ? { home: name(done.awayTeamId), homeScore: done.result.awayScore, awayScore: done.result.homeScore, away: name(done.homeTeamId) }
                        : { home: name(done.homeTeamId), homeScore: done.result.homeScore, awayScore: done.result.awayScore, away: name(done.awayTeamId) }))
                }
                router.push(`/match/${matchId}/result`)
            }
        } catch (e) {
            if (process.env.NODE_ENV !== "production") console.error("[Match guard] simulating the rest failed", e)
            toast.error(t("matchError.failed"))
        } finally {
            setResolving(false)
        }
    }

    // Blocking notice: trap focus on it; Escape has nowhere valid to go.
    const dialogRef = useFocusTrap(showBlocker)

    return (
        <AnimatePresence>
            {showBlocker && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-modal bg-ink/90 flex items-center justify-center p-4"
                >
                    <motion.div
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        ref={dialogRef} tabIndex={-1}
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="modal-title-match-guard"
                        className="bg-panel border border-line-strong rounded-[10px] p-8 max-w-md w-full max-h-[calc(100dvh-6rem)] overflow-y-auto text-center relative"
                    >

                        <div className="w-16 h-16 rounded-lg bg-negative/10 text-negative flex items-center justify-center mx-auto mb-6">
                            <Lock size={32} />
                        </div>

                        <h2 id="modal-title-match-guard" className="font-display text-2xl font-bold text-ink-1 mb-2 uppercase">{t("guard.title")}</h2>
                        <p className="text-ink-2 mb-8">
                            {t("guard.body")}
                        </p>

                        <Button
                            onClick={handleReturnToMatch}
                            disabled={resolving}
                            size="lg"
                            className="w-full h-12"
                        >
                            {t("guard.back")}
                        </Button>
                        <Button
                            onClick={handleSimulateRest}
                            disabled={resolving}
                            variant="outline"
                            size="lg"
                            className="mt-3 w-full h-12"
                        >
                            {resolving ? t("advance.simulating") : t("guard.simulate")}
                        </Button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}

