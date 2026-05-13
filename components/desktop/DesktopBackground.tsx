"use client"

import React from "react"

export const DesktopBackground = React.memo(function DesktopBackground() {
    return (
        <div className="absolute inset-0 pointer-events-none">
            {/* Gradient Base */}
            <div className="absolute inset-0 liquid-app-bg" />

            {/* Glass refraction layers */}
            <div className="absolute inset-0 liquid-noise" />
            <div className="absolute left-8 right-8 top-6 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <div className="absolute bottom-8 left-1/2 h-56 w-[min(72vw,920px)] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgba(125,211,252,0.045),transparent_65%)]" />

            {/* Grid Pattern */}
            <div className="absolute inset-0 opacity-[0.03]" style={{
                backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
                backgroundSize: "50px 50px"
            }} />
        </div>
    )
})
