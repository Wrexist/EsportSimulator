/**
 * Procedural SVG logo generator for fictional teams and tournaments.
 *
 * Deterministic: the same seed (team id or slug) always produces the same
 * logo. Pure function — no React, no DOM, runs in Node at sanitize time.
 *
 * Output: a standalone <svg> document suitable for writing to disk as
 * logo.svg, or for embedding via dangerouslySetInnerHTML at runtime.
 *
 * Visual parity note: the live <TeamEmblem> React component is the primary
 * renderer for teams that carry a `branding` object. This baked generator is
 * the fallback (brandless teams) and the tournament-logo renderer, so it
 * mirrors the same crest treatment — gradient body, gloss, vignette, a
 * procedural icon mark and an embossed monogram. The mark set is duplicated
 * here (rather than imported) to keep this module React-free for Node.
 */

function fnv1aHash(str: string): number {
    let hash = 2166136261
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
}

/** Relative luminance (0..1) of a #rrggbb color. */
function luminance(hex: string): number {
    const h = (hex || "").replace("#", "")
    if (h.length !== 6) return 0.15
    const r = parseInt(h.slice(0, 2), 16) / 255
    const g = parseInt(h.slice(2, 4), 16) / 255
    const b = parseInt(h.slice(4, 6), 16) / 255
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const PALETTES: Array<[string, string, string]> = [
    ["#0EA5E9", "#082F49", "#F8FAFC"], // sky
    ["#F43F5E", "#450A0A", "#FEF2F2"], // rose
    ["#22C55E", "#052E16", "#ECFDF5"], // emerald
    ["#EAB308", "#422006", "#FEFCE8"], // amber
    ["#A855F7", "#2E1065", "#FAF5FF"], // violet
    ["#EC4899", "#500724", "#FDF2F8"], // pink
    ["#14B8A6", "#042F2E", "#F0FDFA"], // teal
    ["#F97316", "#431407", "#FFF7ED"], // orange
    ["#6366F1", "#1E1B4B", "#EEF2FF"], // indigo
    ["#84CC16", "#1A2E05", "#F7FEE7"], // lime
    ["#E11D48", "#1F1F1F", "#F5F5F5"], // crimson on dark
    ["#FACC15", "#111827", "#FFFFFF"], // gold on ink
]

type Shape = "shield" | "hex" | "chevron" | "circle" | "diamond" | "crest"
const SHAPES: Shape[] = ["shield", "hex", "circle", "diamond", "crest"]

export interface LogoSpec {
    primary: string
    secondary: string
    accent: string
    shape: Shape
    monogram: string
    seedHash: number
}

export function logoSpec(seed: string, name: string): LogoSpec {
    const h = fnv1aHash(seed)
    const palette = PALETTES[h % PALETTES.length]
    const shape = SHAPES[(h >>> 4) % SHAPES.length]

    // Monogram: first letter of each significant word, up to 3 chars.
    const letters = name
        .replace(/[^A-Za-z0-9\s]/g, "")
        .split(/\s+/)
        .filter(Boolean)
        .map(w => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 3) || "X"

    return {
        primary: palette[0],
        secondary: palette[1],
        accent: palette[2],
        shape,
        monogram: letters,
        seedHash: h,
    }
}

// 256x256 shape paths.
function shapePath(shape: Shape): string {
    switch (shape) {
        case "shield": return "M128 16 L232 48 V132 Q232 200 128 244 Q24 200 24 132 V48 Z"
        case "hex": return "M128 16 L228 70 V186 L128 240 L28 186 V70 Z"
        case "diamond": return "M128 12 L244 128 L128 244 L12 128 Z"
        case "crest": return "M128 12 L226 48 V128 Q226 200 128 246 Q30 200 30 128 V48 Z"
        case "chevron": return "M24 40 H232 L176 128 L232 216 H24 L80 128 Z"
        case "circle": default: return "M128 128 m-108 0 a108 108 0 1 0 216 0 a108 108 0 1 0 -216 0 Z"
    }
}

// Icon marks in the live emblem's 100-space (centered ~50,46). Reused here by
// scaling into 256-space. Kept in sync with components/ui/TeamEmblem.tsx.
const MARKS: Array<(f: string) => string> = [
    f => `<path d="M28 44 L50 32 L72 44 L72 51 L50 39 L28 51 Z" fill="${f}"/><path d="M28 55 L50 43 L72 55 L72 62 L50 50 L28 62 Z" fill="${f}"/>`,
    f => `<path d="M50 33 L31 37 L45 40 L29 45 L46 47 L31 53 L50 51 Z" fill="${f}"/><path d="M50 33 L69 37 L55 40 L71 45 L54 47 L69 53 L50 51 Z" fill="${f}"/>`,
    f => `<path d="M50 24 L57 40 L74 41 L60 52 L65 68 L50 58 L35 68 L40 52 L26 41 L43 40 Z" fill="${f}"/>`,
    f => `<path d="M56 23 L37 49 L49 49 L44 69 L65 41 L53 41 Z" fill="${f}"/>`,
    f => `<path d="M50 24 C58 35 64 43 58 54 C55 63 45 63 42 54 C40 47 46 46 46 39 C50 43 49 48 53 49 C58 45 53 33 50 24 Z" fill="${f}"/>`,
    f => `<path d="M32 33 H68 L62 42 L58 60 L52 44 H48 L42 60 L38 42 Z" fill="${f}"/>`,
    f => `<ellipse cx="50" cy="46" rx="24" ry="10" fill="none" stroke="${f}" stroke-width="4"/><circle cx="50" cy="46" r="7" fill="${f}"/><circle cx="74" cy="46" r="3.6" fill="${f}"/>`,
    f => `<g stroke="${f}" stroke-width="6.5" stroke-linecap="round"><line x1="33" y1="30" x2="67" y2="63"/><line x1="67" y1="30" x2="33" y2="63"/></g><path d="M45 63 L55 63 L50 71 Z" fill="${f}"/>`,
    f => `<path d="M50 25 L72 54 L60 54 L60 67 L40 67 L40 54 L28 54 Z" fill="${f}"/>`,
    f => `<path d="M29 57 L33 35 L42 47 L50 31 L58 47 L67 35 L71 57 Z" fill="${f}"/>`,
    f => `<polygon points="50,25 70,37 70,55 50,67 30,55 30,37" fill="none" stroke="${f}" stroke-width="4.5"/><polygon points="50,36 61,42 61,50 50,56 39,50 39,42" fill="${f}"/>`,
    // talon slashes — must stay last to match TeamEmblem's catalog so the same
    // hash selects the same mark for baked and live logos.
    f => `<g fill="${f}"><path d="M34 28 Q44 40 40 64 L46 62 Q48 40 40 28 Z"/><path d="M46 26 Q54 40 50 66 L56 64 Q58 40 52 26 Z"/><path d="M58 28 Q66 40 62 62 L68 60 Q70 40 64 28 Z"/></g>`,
]

function renderMark(h: number, face: string): string {
    const mark = MARKS[(h >>> 7) % MARKS.length](face)
    // 100-space mark (centered 50,46) -> 256-space, centered near (128,118).
    return `<g transform="translate(128 118) scale(2.35) translate(-50 -46)">${mark}</g>`
}

export function renderLogoSVG(seed: string, name: string): string {
    const spec = logoSpec(seed, name)
    const uid = "lg" + (spec.seedHash % 100000)
    const d = shapePath(spec.shape)
    const lightBody = luminance(spec.primary) > 0.6
    const face = lightBody ? spec.secondary : spec.accent
    const showMark = ((spec.seedHash >>> 5) & 1) === 0
    const monoY = showMark ? 206 : 128
    const fontSize = showMark
        ? 56
        : spec.monogram.length === 1 ? 140 : spec.monogram.length === 2 ? 100 : 74
    const textFill = lightBody ? spec.secondary : spec.accent
    const textDrop = lightBody ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)"

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="${escapeAttr(name)} logo">
  <defs>
    <linearGradient id="${uid}b" x1="0" y1="0" x2="0.85" y2="1">
      <stop offset="0%" stop-color="${spec.primary}"/><stop offset="55%" stop-color="${spec.primary}"/><stop offset="100%" stop-color="${spec.secondary}"/>
    </linearGradient>
    <linearGradient id="${uid}s" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.42"/><stop offset="45%" stop-color="#ffffff" stop-opacity="0.07"/><stop offset="60%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${uid}d" x1="0" y1="0.5" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.4"/>
    </linearGradient>
    <radialGradient id="${uid}v" cx="0.5" cy="0.42" r="0.62">
      <stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.22"/>
    </radialGradient>
  </defs>
  <path d="${d}" fill="none" stroke="${spec.accent}" stroke-width="14" stroke-opacity="0.9" stroke-linejoin="round"/>
  <path d="${d}" fill="none" stroke="${spec.secondary}" stroke-width="7" stroke-linejoin="round"/>
  <path d="${d}" fill="url(#${uid}b)"/>
  <path d="${d}" fill="url(#${uid}d)"/>
  <path d="${d}" fill="url(#${uid}v)"/>
  <path d="${d}" fill="url(#${uid}s)"/>
  <path d="${d}" fill="none" stroke="#ffffff" stroke-opacity="0.26" stroke-width="3.5" stroke-linejoin="round" transform="translate(0,-1.5)"/>
  ${showMark ? renderMark(spec.seedHash, face) : ""}
  <text x="128" y="${monoY}" dy="${fontSize / 3}" text-anchor="middle" font-family="'Arial Black', Impact, sans-serif" font-weight="900" font-size="${fontSize}" letter-spacing="-2" fill="${textDrop}" transform="translate(0,3)">${escapeText(spec.monogram)}</text>
  <text x="128" y="${monoY}" dy="${fontSize / 3}" text-anchor="middle" font-family="'Arial Black', Impact, sans-serif" font-weight="900" font-size="${fontSize}" letter-spacing="-2" fill="${textFill}">${escapeText(spec.monogram)}</text>
</svg>
`
}

function escapeText(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function escapeAttr(s: string): string {
    return escapeText(s).replace(/"/g, "&quot;")
}
