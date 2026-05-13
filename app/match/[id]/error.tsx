"use client"

// Per-route error boundary for the match flow (veto/tactics/live/result).
// Catches simulation crashes without taking down the whole app — and routes
// the user back to schedule so the match can be re-attempted.

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, RefreshCw, Calendar } from "lucide-react"

export default function MatchError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        if (process.env.NODE_ENV !== "production") {
            console.error("[Match Error]", error)
        }
    }, [error])

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-white p-8">
            <div className="max-w-md text-center">
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-5">
                    <AlertTriangle className="text-red-500" size={32} />
                </div>
                <h1 className="text-xl font-bold mb-2">Match crashed</h1>
                <p className="text-sm text-white/50 mb-5">
                    Something went wrong during the match. Your save is safe — head back to the schedule and try again.
                </p>
                {process.env.NODE_ENV !== "production" && (
                    <pre className="bg-white/5 border border-white/10 rounded-lg p-3 text-left text-[11px] text-red-400 mb-5 max-h-28 overflow-y-auto whitespace-pre-wrap">
                        {error.message}
                    </pre>
                )}
                <div className="flex gap-3 justify-center">
                    <button
                        onClick={reset}
                        className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm font-medium transition-colors"
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
