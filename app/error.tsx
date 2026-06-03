"use client"

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { errorTracker } from '@/lib/error-tracking'

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        // Route-level errors were previously only console.error'd in dev, so
        // production crashes went unreported. Funnel them into the same
        // tracker the component ErrorBoundary uses.
        errorTracker.captureException(error, {
            tags: { type: 'route-error-boundary' },
            context: { digest: error.digest },
        })
        if (process.env.NODE_ENV !== 'production') {
            console.error('[App Error]', error)
        }
    }, [error])

    return (
        <div className="flex flex-col items-center justify-center min-h-screen liquid-app-bg text-white p-8">
            <div className="max-w-md text-center">
                <div className="w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6 shadow-[0_18px_44px_-20px_rgba(239,68,68,0.5)]">
                    <AlertTriangle className="text-red-400" size={36} />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-red-400/80 mb-3">CRITICAL FAULT</p>
                <h1 className="text-2xl font-bold mb-3 tracking-tight">Match interrupted.</h1>
                <p className="text-sm text-white/60 mb-6 leading-relaxed">
                    Something unexpected happened on this screen. Your saved game data is intact — only the current view is affected.
                </p>
                {process.env.NODE_ENV !== 'production' && (
                    <pre className="bg-black/40 border border-white/10 rounded-lg p-4 text-left text-xs text-red-300 mb-6 max-h-32 overflow-y-auto whitespace-pre-wrap font-mono">
                        {error.message}
                    </pre>
                )}
                <div className="flex gap-3 justify-center">
                    <button
                        onClick={reset}
                        className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-white/90 text-black rounded-lg text-xs font-bold uppercase tracking-wider ring-1 ring-white/40 transition-colors"
                    >
                        <RefreshCw size={14} />
                        Try Again
                    </button>
                    <a
                        href="/main-menu"
                        className="flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
                    >
                        <Home size={14} />
                        Main Menu
                    </a>
                </div>
            </div>
        </div>
    )
}
