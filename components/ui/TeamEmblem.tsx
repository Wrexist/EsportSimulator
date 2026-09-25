"use client"

import { useId } from "react"
import { textOnBrand } from "@/lib/branding/fallback"
import { cn } from "@/lib/utils"
import type { TeamBranding } from "@/data/snapshot-types"
import { EMBLEM_DRAWINGS, emblemOutlineColor } from "@/lib/team-emblem-design"
import { teamEmblemIdentity } from "@/lib/team-emblem-identity"

interface TeamEmblemProps {
    name: string
    shortName?: string
    branding: TeamBranding
    seed: string
    size?: number
    className?: string
}

// Community colors may be untrusted. Only literal colors enter SVG attributes.
function color(value: string | undefined, fallback: string): string {
    return value && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : fallback
}

/** Original, ID-stable club marks; no WebGL, filters, or external assets. */
export function TeamEmblem({ name, branding, seed, size = 32, className }: TeamEmblemProps) {
    const uid = `club-${useId().replace(/:/g, "")}`
    const { motif, primary } = teamEmblemIdentity(seed || name, name, color(branding.primaryColor, "#38bdf8"))
    const drawing = EMBLEM_DRAWINGS[motif]
    const accent = textOnBrand(primary)

    return (
        <svg viewBox="0 0 100 100" width={size} height={size}
            className={cn("shrink-0", className)} role="img" aria-label={`${name} logo`}>
            <defs>
                <linearGradient id={`${uid}-color`} x1="0" y1="0" x2="0.8" y2="1">
                    <stop offset="0" stopColor={primary} />
                    <stop offset="1" stopColor={primary} stopOpacity="0.7" />
                </linearGradient>
            </defs>
            <g strokeLinejoin="round">
                <path d={drawing.body} fill="#0a1420" stroke={emblemOutlineColor(primary)} strokeWidth="9" />
                <path d={drawing.body} fill={`url(#${uid}-color)`} stroke={primary} strokeWidth="2" />
                <path d={drawing.facet} fill={motif === "melon" ? "#fb7185" : "#0a1420"} fillOpacity={motif === "melon" ? 1 : 0.48} />
                <path d={drawing.detail} fill={motif === "melon" ? "#0a1420" : accent} />
            </g>

        </svg>
    )
}
