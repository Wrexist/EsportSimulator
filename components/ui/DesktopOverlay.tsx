"use client"

import React from "react"

interface DesktopOverlayProps {
    children: React.ReactNode
}

export function DesktopOverlay({ children }: DesktopOverlayProps) {
    return (
        <div className="relative mx-auto w-full max-w-[1200px] aspect-[16/10]">
            {/* Monitor Frame */}
            <div className="relative w-full h-full bg-neutral-900 rounded-[1.5rem] border-[6px] border-neutral-800 shadow-[0_0_100px_rgba(0,0,0,0.6),inset_0_0_30px_rgba(255,255,255,0.03)] overflow-hidden ring-1 ring-white/5">

                {/* Bezel Top with Webcam */}
                <div className="absolute top-0 left-0 right-0 h-5 bg-neutral-900 flex items-center justify-center z-50">
                    <div className="w-2 h-2 rounded-full bg-neutral-800 ring-1 ring-white/5">
                        <div className="w-1 h-1 rounded-full bg-neutral-700 mx-auto mt-0.5" />
                    </div>
                </div>

                {/* Screen Content */}
                <div className="absolute inset-0 pt-5 bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950">
                    {children}
                </div>

                {/* Screen Gloss Effect */}
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-white/[0.02] via-transparent to-transparent" />

                {/* Subtle Edge Glow */}
                <div className="absolute inset-0 pointer-events-none rounded-[1.25rem] ring-1 ring-inset ring-white/5" />
            </div>

            {/* Monitor Stand */}
            <div className="relative mx-auto -mt-1">
                {/* Neck */}
                <div className="w-20 h-8 mx-auto bg-gradient-to-b from-neutral-800 to-neutral-900 rounded-b-lg shadow-lg" />
                {/* Base */}
                <div className="w-40 h-2 mx-auto bg-gradient-to-b from-neutral-800 to-neutral-900 rounded-full shadow-xl" />
            </div>
        </div>
    )
}
