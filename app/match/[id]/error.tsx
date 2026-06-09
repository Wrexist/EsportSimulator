"use client"

// Per-route error boundary for the match flow (veto/tactics/live/result).
// Catches simulation crashes without taking down the whole app — and gives the
// user TWO ways out so a crashing match can never brick the save:
//   1. "Simulate instead" — resolve the match headlessly via the robust engine
//      that runs every AI match (no live UI, no 3D/animation/timers), which is
//      what usually crashes. This commits a result so the week can advance.
//   2. "Back to schedule" — bail without resolving (still replayable).
// Without (1), a deterministically-crashing match left the player unable to
// play it AND unable to advance the week (advanceWeek blocks on an unplayed
// player match) — an unrecoverable softlock.

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useParams } from "next/navigation"
import { AlertTriangle, RefreshCw, Calendar, FastForward } from "lucide-react"
import { gameErrors } from "@/lib/error-tracking"
import { useGameStore } from "@/store/game-store"
import { toast } from "@/lib/toast"

export default function MatchError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    const router = useRouter()
    const params = useParams()
    const matchId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string | undefined)
    const simulateInstantMatch = useGameStore(s => s.simulateInstantMatch)
    const [resolving, setResolving] = useState(false)

    useEffect(() => {
        // Report match-flow crashes through the match-simulation channel so
        // production failures here are not silently lost.
        gameErrors.matchSimulation(error)
        if (process.env.NODE_ENV !== "production") {
            console.error("[Match Error]", error)
        }
    }, [error])

    const handleSimulate = async () => {
        if (!matchId || resolving) return
        setResolving(true)
        try {
            await simulateInstantMatch(matchId)
            toast.success("Match resolved via instant simulation.")
            router.push("/schedule")
        } catch (e) {
            // Even the headless sim failed — leave the user on this screen with
            // the other options rather than make things worse.
            if (process.env.NODE_ENV !== "production") console.error("[Match Error] instant-sim fallback failed", e)
            toast.error("Couldn't resolve the match. Try 'Back to schedule' and replay it.")
            setResolving(false)
        }
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-white p-8">
            <div className="max-w-md text-center">
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-5">
                    <AlertTriangle className="text-red-500" size={32} />
                </div>
                <h1 className="text-xl font-bold mb-2">Match crashed</h1>
                <p className="text-sm text-white/50 mb-5">
                    Something went wrong during the match. Your save is safe — simulate the
                    result instantly, or head back to the schedule and try again.
                </p>
                {process.env.NODE_ENV !== "production" && (
                    <pre className="bg-white/5 border border-white/10 rounded-lg p-3 text-left text-[11px] text-red-400 mb-5 max-h-28 overflow-y-auto whitespace-pre-wrap">
                        {error.message}
                    </pre>
                )}
                <div className="flex flex-wrap gap-3 justify-center">
                    {matchId && (
                        <button
                            onClick={handleSimulate}
                            disabled={resolving}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-lg text-sm font-medium transition-colors"
                        >
                            <FastForward size={14} />
                            {resolving ? "Simulating…" : "Simulate instead"}
                        </button>
                    )}
                    <button
                        onClick={reset}
                        disabled={resolving}
                        className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 rounded-lg text-sm font-medium transition-colors"
                    >
                        <RefreshCw size={14} />
                        Retry
                    </button>
                    <Link
                        href="/schedule"
                        className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 rounded-lg text-sm font-medium transition-colors"
                    >
                        <Calendar size={14} />
                        Schedule
                    </Link>
                </div>
            </div>
        </div>
    )
}
