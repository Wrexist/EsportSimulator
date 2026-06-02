"use client"

import { Home, Crosshair } from 'lucide-react'

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen liquid-app-bg text-white p-8 relative overflow-hidden">
            {/* Decorative crosshair watermark */}
            <Crosshair
                className="absolute text-white/[0.02] pointer-events-none"
                style={{ width: 520, height: 520 }}
                aria-hidden="true"
            />

            <div className="max-w-md text-center relative z-10">
                <div className="text-8xl font-black text-white/10 mb-3 tracking-tighter tabular-nums">404</div>
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/40 mb-3">SIGNAL LOST</p>
                <h1 className="text-2xl font-bold mb-3 tracking-tight">Off the map.</h1>
                <p className="text-sm text-white/60 mb-8 leading-relaxed">
                    Whatever you were looking for isn&apos;t here. Maybe the page got refactored, maybe it never existed.
                </p>
                <a
                    href="/main-menu"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-white hover:bg-white/90 text-black rounded-lg text-xs font-bold uppercase tracking-wider ring-1 ring-white/40 transition-colors"
                >
                    <Home size={14} />
                    Back to Main Menu
                </a>
            </div>
        </div>
    )
}
