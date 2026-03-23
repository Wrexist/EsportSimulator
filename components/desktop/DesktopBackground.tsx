"use client"

import React from "react"

export const DesktopBackground = React.memo(function DesktopBackground() {
    return (
        <div className="absolute inset-0 pointer-events-none">
            {/* Gradient Base */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-neutral-900 to-slate-950" />

            {/* Subtle Animated Orbs */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl animate-pulse" />
            <div
                className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl animate-pulse"
                style={{ animationDelay: "1s" }}
            />

            {/* Grid Pattern */}
            <div className="absolute inset-0 opacity-[0.03]" style={{
                backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
                backgroundSize: "50px 50px"
            }} />
        </div>
    )
})
