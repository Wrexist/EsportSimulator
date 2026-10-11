"use client"

import { Home } from 'lucide-react'

export default function NotFound() {
    return (
        <div className="flex min-h-[70vh] flex-col items-center justify-center p-8 text-ink-1">
            <div className="w-full max-w-md rounded-[10px] border border-line-strong bg-panel p-8 text-center">
                <p className="font-display text-6xl font-bold leading-none tabular-nums text-ink-3">404</p>
                <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-gold">Page not found</p>
                <h1 className="mb-3 font-display text-3xl font-bold uppercase leading-none">Off the map</h1>
                <p className="mb-6 text-sm leading-relaxed text-ink-2">
                    This screen doesn&apos;t exist. Your career is untouched; head back to the main menu to continue.
                </p>
                <a
                    href="/main-menu"
                    className="inline-flex h-10 items-center gap-2 rounded border border-gold bg-gold px-5 text-sm font-semibold text-gold-on transition-colors hover:border-gold-hover hover:bg-gold-hover"
                >
                    <Home size={15} aria-hidden="true" />
                    Back to main menu
                </a>
            </div>
        </div>
    )
}
