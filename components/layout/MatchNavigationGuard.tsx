"use client"

import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Lock } from "lucide-react"
import { useFocusTrap } from "@/lib/accessibility"

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

    const handleReturnToMatch = () => {
        if (activeMatchId) {
            router.push(`/match/${activeMatchId}/tactics`) // Return to tactics page to resume match setup
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
                    className="fixed inset-0 top-16 z-modal bg-ink/90 flex items-center justify-center p-4"
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

                        <h2 id="modal-title-match-guard" className="font-display text-2xl font-bold text-ink-1 mb-2 uppercase">Match in Progress</h2>
                        <p className="text-ink-2 mb-8">
                            You cannot leave the match area while a game is active. Please complete the match or simulate the result.
                        </p>

                        <Button
                            onClick={handleReturnToMatch}
                            size="lg"
                            className="w-full h-12"
                        >
                            Return to Match
                        </Button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}

