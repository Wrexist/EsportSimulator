"use client"
import { t } from "@/lib/i18n"

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
            // false = refused (the store toasted why); still leave the crashed
            // screen. Advancing the week resolves an unplayable fixture.
            if (await simulateInstantMatch(matchId)) toast.success(t("matchError.resolved"))
            router.push("/schedule")
        } catch (e) {
            // Even the headless sim failed — leave the user on this screen with
            // the other options rather than make things worse.
            if (process.env.NODE_ENV !== "production") console.error("[Match Error] instant-sim fallback failed", e)
            toast.error(t("matchError.failed"))
            setResolving(false)
        }
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-ink-1 p-8">
            <div className="max-w-md text-center">
                <div className="w-16 h-16 rounded-full bg-negative/10 flex items-center justify-center mx-auto mb-5">
                    <AlertTriangle className="text-negative" size={32} />
                </div>
                <h1 className="text-xl font-bold mb-2">{t("matchError.title")}</h1>
                <p className="text-sm text-ink-3 mb-5">
                    {t("matchError.body")}
                </p>
                {process.env.NODE_ENV !== "production" && (
                    <pre className="bg-raised border border-line rounded-lg p-3 text-left text-[11px] text-negative mb-5 max-h-28 overflow-y-auto whitespace-pre-wrap">
                        {error.message}
                    </pre>
                )}
                <div className="flex flex-wrap gap-3 justify-center">
                    {matchId && (
                        <button
                            onClick={handleSimulate}
                            disabled={resolving}
                            className="flex items-center gap-2 px-4 py-2 bg-gold text-gold-on hover:bg-gold-hover disabled:opacity-60 rounded-lg text-sm font-medium transition-colors"
                        >
                            <FastForward size={14} />
                            {resolving ? t("advance.simulating") : t("matchError.simulate")}
                        </button>
                    )}
                    <button
                        onClick={reset}
                        disabled={resolving}
                        className="flex items-center gap-2 px-4 py-2 premium-white-action disabled:opacity-60 rounded-lg text-sm font-medium transition-colors"
                    >
                        <RefreshCw size={14} />
                        {t("matchError.retry")}
                    </button>
                    <Link
                        href="/schedule"
                        className="flex items-center gap-2 px-4 py-2 bg-hover hover:bg-hover rounded-lg text-sm font-medium transition-colors"
                    >
                        <Calendar size={14} />
                        {t("result.schedule")}
                    </Link>
                </div>
            </div>
        </div>
    )
}
