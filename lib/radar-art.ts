/**
 * Radar base art per map.
 *
 * Prefers the baked art manifest (`data/radar-art.json` or `data/radar-art.ts`,
 * mapId → { upper, lower? } image paths in the radar percent frame) when the
 * build has one, and falls back to the same baked art in `public/radar-art`
 * (project-made by scripts/bake-radar-art.ts). Valve's radar overviews
 * (`public/maps/de_*_radar_psd*.png`) are not shipped and never used at
 * runtime; an unknown map gets no art and the radar draws a neutral panel.
 *
 * The manifest is picked up with webpack's `require.context`, so the app
 * builds and runs whether or not the file exists; under Jest (no
 * `require.context`) only the fallback is used.
 */

import type { RadarArt } from "./radar-types"

/** Baked project radar art (same frame as the round maps), used when the manifest cannot be read. */
export const FALLBACK_RADAR_ART: Readonly<Record<string, RadarArt>> = {
    Sandstone: { upper: "/radar-art/Sandstone-upper.webp", baked: true },
    Mirage: { upper: "/radar-art/Mirage-upper.webp", baked: true },
    Inferno: { upper: "/radar-art/Inferno-upper.webp", baked: true },
    Nuke: { upper: "/radar-art/Nuke-upper.webp", lower: "/radar-art/Nuke-lower.webp", baked: true },
    Overpass: { upper: "/radar-art/Overpass-upper.webp", baked: true },
    Vertigo: { upper: "/radar-art/Vertigo-upper.webp", lower: "/radar-art/Vertigo-lower.webp", baked: true },
    Ancient: { upper: "/radar-art/Ancient-upper.webp", baked: true },
    Anubis: { upper: "/radar-art/Anubis-upper.webp", baked: true },
}

/** Map ids with or without the "de_" prefix, any case → lower-case map name. */
export function radarArtKey(mapId: string): string {
    return mapId.trim().toLowerCase().replace(/^de_/, "")
}

const asPath = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined)

function entryOf(raw: unknown): RadarArt | undefined {
    if (typeof raw === "string") return asPath(raw) ? { upper: raw.trim() } : undefined
    if (!raw || typeof raw !== "object") return undefined
    const o = raw as Record<string, unknown>
    const upper = asPath(o.upper) ?? asPath(o.primary) ?? asPath(o.src) ?? asPath(o.image)
    if (!upper) return undefined
    const lower = asPath(o.lower) ?? asPath(o.secondary)
    return lower ? { upper, lower } : { upper }
}

/**
 * Normalises a manifest module or JSON (default export, `maps` wrapper, an
 * object keyed by map id or an array of `{ mapId, upper, lower }`) to
 * radarArtKey → art. Unknown shapes give an empty record.
 */
export function normalizeRadarArtManifest(raw: unknown): Record<string, RadarArt> {
    const out: Record<string, RadarArt> = {}
    let src: unknown = raw
    for (let i = 0; i < 3 && src && typeof src === "object" && !Array.isArray(src); i++) {
        const o = src as Record<string, unknown>
        const inner = o.default ?? o.RADAR_ART ?? o.radarArt ?? o.maps
        if (!inner || typeof inner !== "object") break
        src = inner
    }
    if (Array.isArray(src)) {
        for (const item of src) {
            const id = item && typeof item === "object" ? asPath((item as Record<string, unknown>).mapId) ?? asPath((item as Record<string, unknown>).id) : undefined
            const art = entryOf(item)
            if (id && art) out[radarArtKey(id)] = art
        }
        return out
    }
    if (!src || typeof src !== "object") return out
    for (const [id, value] of Object.entries(src as Record<string, unknown>)) {
        const art = entryOf(value)
        if (art) out[radarArtKey(id)] = art
    }
    return out
}

let manifest: Record<string, RadarArt> | null | undefined

type RequireContext = { keys(): string[]; (id: string): unknown }

function loadManifest(): Record<string, RadarArt> | null {
    if (manifest !== undefined) return manifest
    manifest = null
    try {
        // Webpack resolves this at build time; it is empty when the file does not exist.
        const ctx = (require as unknown as { context: (dir: string, deep: boolean, filter: RegExp) => RequireContext })
            .context("../data", false, /^\.\/radar-art\.(json|ts)$/)
        const key = ctx.keys().sort((a, b) => (a.endsWith(".json") ? -1 : 1) - (b.endsWith(".json") ? -1 : 1))[0]
        if (key) {
            const normalized = normalizeRadarArtManifest(ctx(key))
            manifest = Object.keys(normalized).length ? normalized : null
        }
    } catch {
        manifest = null
    }
    return manifest
}

/** Art for a map: the baked manifest's entry, else the baked fallback; undefined for an unknown map. */
export function radarArtFor(mapId: string, manifestOverride?: Record<string, RadarArt> | null): RadarArt | undefined {
    const key = radarArtKey(mapId)
    const baked = (manifestOverride !== undefined ? manifestOverride : loadManifest())?.[key]
    if (baked) return { ...baked, baked: true }
    const fallback = Object.entries(FALLBACK_RADAR_ART).find(([id]) => radarArtKey(id) === key)
    return fallback?.[1]
}
