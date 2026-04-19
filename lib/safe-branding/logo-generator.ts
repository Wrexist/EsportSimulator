/**
 * Procedural SVG logo generator for fictional teams.
 *
 * Deterministic: the same seed (team id or slug) always produces the same
 * logo. Pure function — no React, no DOM, runs in Node at sanitize time.
 *
 * Output: a standalone <svg> document suitable for writing to disk as
 * logo.svg, or for embedding via dangerouslySetInnerHTML at runtime.
 */

function fnv1aHash(str: string): number {
    let hash = 2166136261
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
}

// Seeded RNG local to this module so the generator stays deterministic.
function seededRng(seed: number): () => number {
    let s = seed || 1
    return () => {
        s = Math.imul(s ^ (s >>> 15), 2246822507)
        s = Math.imul(s ^ (s >>> 13), 3266489909)
        s ^= s >>> 16
        return (s >>> 0) / 4294967296
    }
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

type Shape = "shield" | "hex" | "chevron" | "circle" | "diamond"
const SHAPES: Shape[] = ["shield", "hex", "chevron", "circle", "diamond"]

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

function renderShape(spec: LogoSpec): string {
    switch (spec.shape) {
        case "shield":
            return `<path d="M128 16 L232 48 V132 Q232 196 128 240 Q24 196 24 132 V48 Z" fill="${spec.primary}" stroke="${spec.secondary}" stroke-width="6"/>`
        case "hex":
            return `<polygon points="128,16 232,72 232,184 128,240 24,184 24,72" fill="${spec.primary}" stroke="${spec.secondary}" stroke-width="6"/>`
        case "chevron":
            return `<path d="M24 40 H232 L176 128 L232 216 H24 L80 128 Z" fill="${spec.primary}" stroke="${spec.secondary}" stroke-width="6"/>`
        case "circle":
            return `<circle cx="128" cy="128" r="108" fill="${spec.primary}" stroke="${spec.secondary}" stroke-width="8"/>`
        case "diamond":
            return `<polygon points="128,16 232,128 128,240 24,128" fill="${spec.primary}" stroke="${spec.secondary}" stroke-width="6"/>`
    }
}

function renderFlourish(spec: LogoSpec): string {
    const rng = seededRng(spec.seedHash)
    const a = Math.floor(rng() * 40) + 60
    const b = Math.floor(rng() * 40) + 170
    return `<line x1="${a}" y1="80" x2="${b}" y2="80" stroke="${spec.secondary}" stroke-width="3" stroke-linecap="round" opacity="0.5"/>
    <line x1="${a + 10}" y1="184" x2="${b - 10}" y2="184" stroke="${spec.secondary}" stroke-width="3" stroke-linecap="round" opacity="0.5"/>`
}

export function renderLogoSVG(seed: string, name: string): string {
    const spec = logoSpec(seed, name)
    const fontSize = spec.monogram.length === 1 ? 140 : spec.monogram.length === 2 ? 100 : 74
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="${escapeAttr(name)} logo">
  ${renderShape(spec)}
  ${renderFlourish(spec)}
  <text x="128" y="${128 + fontSize / 3}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="${fontSize}" fill="${spec.accent}" letter-spacing="-2">${escapeText(spec.monogram)}</text>
</svg>
`
}

function escapeText(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function escapeAttr(s: string): string {
    return escapeText(s).replace(/"/g, "&quot;")
}
