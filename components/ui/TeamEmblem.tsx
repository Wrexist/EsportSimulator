"use client"

import { cn } from "@/lib/utils"
import type { TeamBranding } from "@/data/snapshot-types"

/**
 * Live procedural team crest — a 3D-shaded badge rendered from the team's
 * branding (colors + logoStyle). Pure SVG, no blur filters (cheap enough to
 * render hundreds in tables), but with gradient depth, a glossy sheen, a
 * beveled rim, a procedural icon mark and an embossed monogram/wordmark so
 * teams read as premium esports crests instead of flat monogram shields.
 * Deterministic per seed.
 *
 * Mark + text colors are chosen for contrast against the body, so the crest
 * stays legible on light (yellow/white) and dark primaries alike.
 *
 * Real raster logos (.webp/.png the user drops in) take priority in
 * TeamLogoDisplay; this is the upgraded fallback for every generated team.
 */

function fnv1a(str: string): number {
    let h = 2166136261
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
    return h >>> 0
}

/** Relative luminance (0..1) of a #rgb / #rrggbb color. */
function luminance(hex: string): number {
    let h = (hex || "").replace("#", "")
    if (h.length === 3) h = h.split("").map(c => c + c).join("")
    if (h.length !== 6) return 0.15
    const r = parseInt(h.slice(0, 2), 16) / 255
    const g = parseInt(h.slice(2, 4), 16) / 255
    const b = parseInt(h.slice(4, 6), 16) / 255
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

type Shape = "shield" | "hex" | "circle" | "roundsquare" | "diamond" | "pill" | "crest"

function shapePath(shape: Shape): string {
    switch (shape) {
        case "shield": return "M50 5 L90 21 V53 Q90 85 50 96 Q10 85 10 53 V21 Z"
        case "hex": return "M50 5 L89 27 V73 L50 95 L11 73 V27 Z"
        case "diamond": return "M50 4 L95 50 L50 96 L5 50 Z"
        case "roundsquare": return "M22 8 H78 Q92 8 92 22 V78 Q92 92 78 92 H22 Q8 92 8 78 V22 Q8 8 22 8 Z"
        case "pill": return "M28 28 H72 Q92 28 92 50 Q92 72 72 72 H28 Q8 72 8 50 Q8 28 28 28 Z"
        case "crest": return "M50 4 L88 18 V50 Q88 78 50 96 Q12 78 12 50 V18 Z"
        case "circle": default: return "M50 6 A44 44 0 1 1 49.99 6 Z"
    }
}

function pickShape(style: string | undefined, h: number): Shape {
    if (style === "monogram") return (h & 1) ? "circle" : "roundsquare"
    if (style === "wordmark") return "pill"
    if (style === "mascot") return (h & 1) ? "crest" : "shield"
    if (style === "emblem") return (h & 1) ? "shield" : "hex"
    const opts: Shape[] = ["shield", "hex", "diamond", "circle", "crest"]
    return opts[(h >>> 3) % opts.length]
}

function deriveInitials(name: string, shortName?: string): string {
    if (shortName && shortName.trim()) return shortName.trim().toUpperCase().slice(0, 3)
    const w = name.replace(/[^A-Za-z0-9\s]/g, "").split(/\s+/).filter(Boolean)
    if (w.length >= 2) return (w[0][0] + w[1][0]).toUpperCase()
    return (name || "X").toUpperCase().slice(0, 3)
}

// ============================================================
// PROCEDURAL ICON MARKS
// ============================================================
// Each returns SVG markup drawn in `face` (a contrast color), centered around
// (50,46) inside a ~[26..74] x [24..68] box. Bold and simple so they survive
// being rendered at 32px in dense tables.

type Mark = (face: string) => string

const MARKS: readonly Mark[] = [
    // chevrons (insignia)
    f => `<path d="M28 44 L50 32 L72 44 L72 51 L50 39 L28 51 Z" fill="${f}"/>
          <path d="M28 55 L50 43 L72 55 L72 62 L50 50 L28 62 Z" fill="${f}"/>`,
    // swept wings
    f => `<path d="M50 33 L31 37 L45 40 L29 45 L46 47 L31 53 L50 51 Z" fill="${f}"/>
          <path d="M50 33 L69 37 L55 40 L71 45 L54 47 L69 53 L50 51 Z" fill="${f}"/>`,
    // star
    f => `<path d="M50 24 L57 40 L74 41 L60 52 L65 68 L50 58 L35 68 L40 52 L26 41 L43 40 Z" fill="${f}"/>`,
    // lightning bolt
    f => `<path d="M56 23 L37 49 L49 49 L44 69 L65 41 L53 41 Z" fill="${f}"/>`,
    // flame
    f => `<path d="M50 24 C58 35 64 43 58 54 C55 63 45 63 42 54 C40 47 46 46 46 39 C50 43 49 48 53 49 C58 45 53 33 50 24 Z" fill="${f}"/>`,
    // fanged jaw
    f => `<path d="M32 33 H68 L62 42 L58 60 L52 44 H48 L42 60 L38 42 Z" fill="${f}"/>`,
    // orbit
    f => `<ellipse cx="50" cy="46" rx="24" ry="10" fill="none" stroke="${f}" stroke-width="4"/>
          <circle cx="50" cy="46" r="7" fill="${f}"/><circle cx="74" cy="46" r="3.6" fill="${f}"/>`,
    // crossed blades
    f => `<g stroke="${f}" stroke-width="6.5" stroke-linecap="round"><line x1="33" y1="30" x2="67" y2="63"/><line x1="67" y1="30" x2="33" y2="63"/></g>
          <path d="M45 63 L55 63 L50 71 Z" fill="${f}"/>`,
    // arrowhead
    f => `<path d="M50 25 L72 54 L60 54 L60 67 L40 67 L40 54 L28 54 Z" fill="${f}"/>`,
    // crown
    f => `<path d="M29 57 L33 35 L42 47 L50 31 L58 47 L67 35 L71 57 Z" fill="${f}"/>`,
    // hex core
    f => `<polygon points="50,25 70,37 70,55 50,67 30,55 30,37" fill="none" stroke="${f}" stroke-width="4.5"/>
          <polygon points="50,36 61,42 61,50 50,56 39,50 39,42" fill="${f}"/>`,
    // talon slashes
    f => `<g fill="${f}"><path d="M34 28 Q44 40 40 64 L46 62 Q48 40 40 28 Z"/><path d="M46 26 Q54 40 50 66 L56 64 Q58 40 52 26 Z"/><path d="M58 28 Q66 40 62 62 L68 60 Q70 40 64 28 Z"/></g>`,
]

function renderMark(h: number, face: string, scale: number, dy: number): string {
    const mark = MARKS[(h >>> 7) % MARKS.length](face)
    // Scale about the mark's center (50,46) and nudge vertically.
    const t = `translate(50 ${46 + dy}) scale(${scale}) translate(-50 -46)`
    return `<g transform="${t}" style="filter:drop-shadow(0 1.5px 1px rgba(0,0,0,0.5))">${mark}</g>`
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
    const style = branding.logoStyle
    const shape = pickShape(style, h)
    const initials = deriveInitials(name, shortName)
    const primary = branding.primaryColor || "#38bdf8"
    const secondary = branding.secondaryColor || "#0e1217"
    const accent = branding.accentColor || "#ffffff"
    const uid = `te-${(seed || name).replace(/[^a-zA-Z0-9]/g, "")}-${size}`
    const d = shapePath(shape)
    const isPill = shape === "pill"

    // Pick foreground colors for contrast against the body.
    const lightBody = luminance(primary) > 0.6
    const face = lightBody ? (luminance(secondary) < 0.35 ? secondary : "#0b0f14") : accent
    const textDrop = lightBody ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)"

    // Which foreground to draw: mark vs monogram vs wordmark.
    const showMark = style === "mascot" || style === "emblem" || (!style && ((h >>> 5) & 1) === 0)
    const showMonogram = !style || style === "monogram" || style === "emblem"
    const showWordmark = style === "wordmark"

    const monoY = showMark && style === "emblem" ? 82 : 52
    const fontSize = showMark && style === "emblem"
        ? 22
        : isPill ? 26 : initials.length >= 3 ? 30 : initials.length === 2 ? 38 : 50
    const markScale = style === "emblem" ? 0.72 : 0.98
    const markDy = style === "emblem" ? -8 : 0

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
                    <stop offset="100%" stopColor="#000000" stopOpacity="0.4" />
                </linearGradient>
                {/* radial vignette to seat the mark */}
                <radialGradient id={`${uid}-vig`} cx="0.5" cy="0.42" r="0.62">
                    <stop offset="55%" stopColor="#000000" stopOpacity="0" />
                    <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
                </radialGradient>
                {/* monogram vertical gradient */}
                <linearGradient id={`${uid}-mono`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lightBody ? secondary : "#ffffff"} />
                    <stop offset="100%" stopColor={lightBody ? "#000000" : accent} />
                </linearGradient>
            </defs>

            {/* accent rim */}
            <path d={d} fill="none" stroke={accent} strokeWidth={6} strokeOpacity={0.9} strokeLinejoin="round" />
            {/* dark seat under rim for contrast */}
            <path d={d} fill="none" stroke={secondary} strokeWidth={3} strokeLinejoin="round" />
            {/* body */}
            <path d={d} fill={`url(#${uid}-base)`} />
            {/* depth + gloss + vignette */}
            <path d={d} fill={`url(#${uid}-shade)`} />
            <path d={d} fill={`url(#${uid}-vig)`} />
            <path d={d} fill={`url(#${uid}-sheen)`} />
            {/* top bevel highlight */}
            <path d={d} fill="none" stroke="#ffffff" strokeOpacity={0.28} strokeWidth={1.6} strokeLinejoin="round" transform="translate(0,-0.6)" />

            {/* procedural icon mark */}
            {showMark && (
                <g dangerouslySetInnerHTML={{ __html: renderMark(h, face, markScale, markDy) }} />
            )}

            {/* wordmark tag on a banner */}
            {showWordmark && (
                <>
                    <rect x={16} y={40} width={68} height={22} rx={5} fill="#000000" fillOpacity={0.28} />
                    <text x="50" y="56" textAnchor="middle"
                        fontFamily="'Arial Black', Impact, system-ui, sans-serif" fontWeight={900}
                        fontSize={initials.length >= 3 ? 26 : 32} letterSpacing={1}
                        fill="rgba(0,0,0,0.5)" transform="translate(0,1.4)">{initials}</text>
                    <text x="50" y="56" textAnchor="middle"
                        fontFamily="'Arial Black', Impact, system-ui, sans-serif" fontWeight={900}
                        fontSize={initials.length >= 3 ? 26 : 32} letterSpacing={1}
                        fill={face}>{initials}</text>
                </>
            )}

            {/* embossed monogram (dark drop then contrast face) */}
            {showMonogram && !showWordmark && (
                <>
                    <text x="50" y={monoY} dy={fontSize / 3} textAnchor="middle"
                        fontFamily="'Arial Black', Impact, system-ui, sans-serif" fontWeight={900}
                        fontSize={fontSize} letterSpacing={-1}
                        fill={textDrop} transform="translate(0,1.6)">{initials}</text>
                    <text x="50" y={monoY} dy={fontSize / 3} textAnchor="middle"
                        fontFamily="'Arial Black', Impact, system-ui, sans-serif" fontWeight={900}
                        fontSize={fontSize} letterSpacing={-1}
                        fill={`url(#${uid}-mono)`}>{initials}</text>
                </>
            )}
        </svg>
    )
}
