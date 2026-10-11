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
        <div className="flex min-h-[70vh] flex-col items-center justify-center p-8 text-ink-1">
            <div className="w-full max-w-md rounded-[10px] border border-line-strong bg-panel p-8 text-center">
                <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-lg border border-negative/40 bg-negative/10">
                    <AlertTriangle className="text-negative" size={24} aria-hidden="true" />
                </div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-negative">Screen error</p>
                <h1 className="mb-3 font-display text-3xl font-bold uppercase leading-none">This screen stopped working</h1>
                <p className="mb-6 text-sm leading-relaxed text-ink-2">
                    Something unexpected happened on this screen. Your saved game data is intact — only the current view is affected.
                </p>
                {process.env.NODE_ENV !== 'production' && (
                    <pre className="mb-6 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-shell p-4 text-left font-mono text-xs text-negative">
                        {error.message}
                    </pre>
                )}
                <div className="flex justify-center gap-3">
                    <button
                        onClick={reset}
                        className="flex h-10 items-center gap-2 rounded border border-gold bg-gold px-5 text-sm font-semibold text-gold-on transition-colors hover:border-gold-hover hover:bg-gold-hover"
                    >
                        <RefreshCw size={15} aria-hidden="true" />
                        Try again
                    </button>
                    <a
                        href="/main-menu"
                        className="flex h-10 items-center gap-2 rounded border border-line bg-raised px-5 text-sm font-semibold text-ink-1 transition-colors hover:border-line-strong hover:bg-hover"
                    >
                        <Home size={15} aria-hidden="true" />
                        Main menu
                    </a>
                </div>
            </div>
        </div>
    )
}
