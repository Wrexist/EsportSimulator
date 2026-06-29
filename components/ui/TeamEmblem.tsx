"use client"

import { cn } from "@/lib/utils"
import type { TeamBranding } from "@/data/snapshot-types"

/**
 * Live procedural team emblem — a 3D-shaded badge rendered from the team's
 * branding (colors + logoStyle). Pure SVG, no filters that blur (cheap enough
 * to render hundreds in tables), but with gradient depth, a glossy top sheen,
 * a beveled rim and an embossed monogram so teams read as premium crests
 * instead of flat 2D shields. Deterministic per seed.
 *
 * Real raster logos (.webp/.png the user drops in) take priority in
 * TeamLogoDisplay; this is the upgraded fallback for every generated team.
 */

function fnv1a(str: string): number {
    let h = 2166136261
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
    return h >>> 0
}

type Shape = "shield" | "hex" | "circle" | "roundsquare" | "diamond" | "pill"

function shapePath(shape: Shape): string {
    switch (shape) {
        case "shield": return "M50 5 L90 21 V53 Q90 85 50 96 Q10 85 10 53 V21 Z"
        case "hex": return "M50 5 L89 27 V73 L50 95 L11 73 V27 Z"
        case "diamond": return "M50 4 L95 50 L50 96 L5 50 Z"
        case "roundsquare": return "M22 8 H78 Q92 8 92 22 V78 Q92 92 78 92 H22 Q8 92 8 78 V22 Q8 8 22 8 Z"
        case "pill": return "M28 28 H72 Q92 28 92 50 Q92 72 72 72 H28 Q8 72 8 50 Q8 28 28 28 Z"
        case "circle": default: return "M50 6 A44 44 0 1 1 49.99 6 Z"
    }
}

function pickShape(style: string | undefined, h: number): Shape {
    if (style === "monogram") return (h & 1) ? "circle" : "roundsquare"
    if (style === "wordmark") return "pill"
    if (style === "mascot") return (h & 1) ? "shield" : "hex"
    // emblem / default
    const opts: Shape[] = ["shield", "hex", "diamond", "circle"]
    return opts[(h >>> 3) % opts.length]
}

function deriveInitials(name: string, shortName?: string): string {
    if (shortName && shortName.trim()) return shortName.trim().toUpperCase().slice(0, 3)
    const w = name.replace(/[^A-Za-z0-9\s]/g, "").split(/\s+/).filter(Boolean)
    if (w.length >= 2) return (w[0][0] + w[1][0]).toUpperCase()
    return (name || "X").toUpperCase().slice(0, 3)
}

interface TeamEmblemProps {
    name: string
    shortName?: string
    branding: TeamBranding
    seed: string
    size?: number
    className?: string
}

export function TeamEmblem({ name, shortName, branding, seed, size = 32, className }: TeamEmblemProps) {
    const h = fnv1a(seed || name)
    const shape = pickShape(branding.logoStyle, h)
    const initials = deriveInitials(name, shortName)
    const primary = branding.primaryColor || "#38bdf8"
    const secondary = branding.secondaryColor || "#0e1217"
    const accent = branding.accentColor || "#ffffff"
    const uid = `te-${(seed || name).replace(/[^a-zA-Z0-9]/g, "")}-${size}`
    const d = shapePath(shape)
    const isPill = shape === "pill"
    const fontSize = isPill ? 26 : initials.length >= 3 ? 30 : initials.length === 2 ? 38 : 50

    return (
        <svg
            viewBox="0 0 100 100"
            width={size}
            height={size}
            className={cn(className)}
            style={{ filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.45))" }}
            role="img"
            aria-label={`${name} logo`}
        >
            <defs>
                {/* base body: lit top-left -> dark bottom-right */}
                <linearGradient id={`${uid}-base`} x1="0" y1="0" x2="0.85" y2="1">
                    <stop offset="0%" stopColor={primary} />
                    <stop offset="55%" stopColor={primary} />
                    <stop offset="100%" stopColor={secondary} />
                </linearGradient>
                {/* glossy top sheen */}
                <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
                    <stop offset="45%" stopColor="#ffffff" stopOpacity="0.08" />
                    <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
                </linearGradient>
                {/* bottom inner shadow for depth */}
                <linearGradient id={`${uid}-shade`} x1="0" y1="0.5" x2="0" y2="1">
                    <stop offset="0%" stopColor="#000000" stopOpacity="0" />
                    <stop offset="100%" stopColor="#000000" stopOpacity="0.38" />
                </linearGradient>
                {/* monogram vertical gradient (light top) */}
                <linearGradient id={`${uid}-mono`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor={accent} />
                </linearGradient>
            </defs>

            {/* accent rim */}
            <path d={d} fill="none" stroke={accent} strokeWidth={6} strokeOpacity={0.9} strokeLinejoin="round" />
            {/* dark seat under rim for contrast */}
            <path d={d} fill="none" stroke={secondary} strokeWidth={3} strokeLinejoin="round" />
            {/* body */}
            <path d={d} fill={`url(#${uid}-base)`} />
            {/* depth + gloss */}
            <path d={d} fill={`url(#${uid}-shade)`} />
            <path d={d} fill={`url(#${uid}-sheen)`} />
            {/* top bevel highlight */}
            <path d={d} fill="none" stroke="#ffffff" strokeOpacity={0.28} strokeWidth={1.6} strokeLinejoin="round" transform="translate(0,-0.6)" />

            {/* wordmark underline accent */}
            {isPill && (
                <rect x={30} y={62} width={40} height={3} rx={1.5} fill={accent} opacity={0.9} />
            )}

            {/* embossed monogram: dark drop then light face */}
            <text x="50" y={isPill ? 52 : 52} dy={fontSize / 3} textAnchor="middle"
                fontFamily="'Arial Black', Impact, system-ui, sans-serif" fontWeight={900}
                fontSize={fontSize} letterSpacing={-1}
                fill="rgba(0,0,0,0.5)" transform="translate(0,1.6)">{initials}</text>
            <text x="50" y={isPill ? 52 : 52} dy={fontSize / 3} textAnchor="middle"
                fontFamily="'Arial Black', Impact, system-ui, sans-serif" fontWeight={900}
                fontSize={fontSize} letterSpacing={-1}
                fill={`url(#${uid}-mono)`}>{initials}</text>
        </svg>
    )
}
