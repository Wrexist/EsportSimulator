/**
 * Shared feature derivation for procedural player portraits.
 *
 * Both the SVG generator (Node, build-time) and the live 3D portrait component
 * (browser, runtime) consume `derivePortraitFeatures(seed)` so the same player
 * looks like the same person across the SVG thumbnail and the 3D hero view.
 */

export function fnv1aHash(str: string): number {
    let hash = 2166136261
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
}

// Independent feature streams from the same hash. Avoids bit-shift correlation
// between dimensions.
export function makeRng(seed: number): () => number {
    let s = seed >>> 0
    return () => {
        s = (s + 0x6D2B79F5) >>> 0
        let t = s
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

export function pick<T>(rng: () => number, arr: readonly T[]): T {
    return arr[Math.floor(rng() * arr.length)]
}

export const BG_PALETTES: ReadonlyArray<readonly [string, string]> = [
    ["#0F172A", "#1E293B"],
    ["#1E1B4B", "#312E81"],
    ["#052E16", "#14532D"],
    ["#450A0A", "#7F1D1D"],
    ["#422006", "#78350F"],
    ["#2E1065", "#5B21B6"],
    ["#042F2E", "#134E4A"],
    ["#1F2937", "#374151"],
    ["#0C4A6E", "#075985"],
    ["#3B0764", "#6B21A8"],
]

export const SHIRT_COLORS = [
    "#1E293B", "#312E81", "#14532D", "#7F1D1D", "#78350F", "#5B21B6",
    "#134E4A", "#374151", "#075985", "#6B21A8", "#0F766E", "#9F1239",
] as const

export const SKIN_TONES = [
    "#3A2A1F", "#4F2F1F", "#6B4423", "#8D5524",
    "#A66E48", "#B07A4D", "#C68B5F", "#D4A373",
    "#E5B888", "#F1C9A5",
] as const

export const HAIR_COLORS = [
    "#0B0B0B", "#1F1812", "#2B2420", "#3D2B1F", "#5C3A1E", "#7A4B1F",
    "#A66A3A", "#C89B5B", "#E1C07E", "#B04A3C",
    "#E5E7EB", "#67E8F9", "#A7F3D0", "#F9A8D4", "#C4B5FD", "#FDE047",
    "#FB923C", "#22D3EE",
] as const

export const EYE_COLORS = [
    "#1F2937", "#0E7490", "#166534", "#92400E", "#7C2D12", "#4338CA",
] as const

export type Hairstyle =
    | "bald" | "buzz" | "short" | "side" | "curly" | "long" | "ponytail"
    | "manbun" | "mohawk" | "spike" | "undercut" | "dreads" | "cap" | "beanie" | "hoodie"

export const HAIRSTYLES: readonly Hairstyle[] = [
    "bald", "buzz", "short", "side", "curly", "long", "ponytail", "manbun",
    "mohawk", "spike", "undercut", "dreads", "cap", "beanie", "hoodie",
]

export type HeadShape = "round" | "oval" | "tall" | "wide" | "square"
export const HEAD_SHAPES: readonly HeadShape[] = ["round", "oval", "tall", "wide", "square"]

export type EyeStyle = "dot" | "almond" | "narrow" | "wide" | "closed"
export const EYE_STYLES: readonly EyeStyle[] = ["dot", "almond", "narrow", "wide", "closed"]

export type BrowStyle = "flat" | "raised" | "stern" | "thin"
export const BROW_STYLES: readonly BrowStyle[] = ["flat", "raised", "stern", "thin"]

export type MouthStyle = "line" | "smirk" | "smile" | "neutral" | "grimace"
export const MOUTH_STYLES: readonly MouthStyle[] = ["line", "smirk", "smile", "neutral", "grimace"]

export type FacialHair = "clean" | "stubble" | "goatee" | "mustache" | "beard"
export const FACIAL_HAIR: readonly FacialHair[] = ["clean", "stubble", "goatee", "mustache", "beard"]

export type Accessory =
    | "none" | "headset" | "glasses" | "sunglasses" | "headband" | "earbud" | "eyepatch"

export interface PortraitFeatures {
    seed: number
    bg: readonly [string, string]
    skin: string
    headShape: HeadShape
    hairstyle: Hairstyle
    hairColor: string
    eyeStyle: EyeStyle
    eyeColor: string
    browStyle: BrowStyle
    browColor: string
    mouthStyle: MouthStyle
    facialHair: FacialHair
    facialHairColor: string
    accessory: Accessory
    shirt: string
    accent: string
}

function pickAccessory(rng: () => number): Accessory {
    const r = rng()
    if (r < 0.55) return "none"
    if (r < 0.78) return "headset"
    if (r < 0.86) return "glasses"
    if (r < 0.91) return "sunglasses"
    if (r < 0.95) return "headband"
    if (r < 0.98) return "earbud"
    return "eyepatch"
}

function pickFacialHair(rng: () => number): FacialHair {
    const r = rng()
    if (r < 0.55) return "clean"
    if (r < 0.74) return "stubble"
    if (r < 0.85) return "goatee"
    if (r < 0.93) return "mustache"
    return "beard"
}

export function derivePortraitFeatures(seed: string): PortraitFeatures {
    const h = fnv1aHash(seed)
    const rng = makeRng(h)

    const bg = pick(rng, BG_PALETTES)
    const skin = pick(rng, SKIN_TONES)
    const headShape = pick(rng, HEAD_SHAPES)
    const hairstyle = pick(rng, HAIRSTYLES)
    const hairColor = pick(rng, HAIR_COLORS)
    const eyeStyle = pick(rng, EYE_STYLES)
    const eyeColor = pick(rng, EYE_COLORS)
    const browStyle = pick(rng, BROW_STYLES)
    const mouthStyle = pick(rng, MOUTH_STYLES)
    const facialHair = pickFacialHair(rng)
    const accessory = pickAccessory(rng)
    const shirt = pick(rng, SHIRT_COLORS)
    const accent = pick(rng, BG_PALETTES)[1]

    // Bleached / yellow hair would render invisibly thin brows on light skin —
    // darken the brow color in those cases.
    const browColor = hairColor === "#E5E7EB" || hairColor === "#FDE047"
        ? "#374151"
        : hairColor

    return {
        seed: h,
        bg,
        skin,
        headShape,
        hairstyle,
        hairColor,
        eyeStyle,
        eyeColor,
        browStyle,
        browColor,
        mouthStyle,
        facialHair,
        facialHairColor: hairColor,
        accessory,
        shirt,
        accent,
    }
}
