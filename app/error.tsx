"use client"

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        if (process.env.NODE_ENV !== 'production') {
            console.error('[App Error]', error)
        }
    }, [error])

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#0e1217] text-white p-8">
            <div className="max-w-md text-center">
                <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
                    <AlertTriangle className="text-red-500" size={40} />
                </div>
                <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
                <p className="text-sm text-white/50 mb-6">
                    An unexpected error occurred. Your game data is safe.
                </p>
                {process.env.NODE_ENV !== 'production' && (
                    <pre className="bg-white/5 border border-white/10 rounded-lg p-4 text-left text-xs text-red-400 mb-6 max-h-32 overflow-y-auto whitespace-pre-wrap">
                        {error.message}
                    </pre>
                )}
                <div className="flex gap-3 justify-center">
                    <button
                        onClick={reset}
                        className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm font-medium transition-colors"
                    >
                        <RefreshCw size={14} />
                        Try Again
                    </button>
                    <a
                        href="/main-menu"
                        className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 rounded-lg text-sm font-medium transition-colors"
                    >
                        <Home size={14} />
                        Main Menu
                    </a>
                </div>
            </div>
        </div>
    )
}
