import { MapId } from "@/types/enums"

/**
 * The seven competitive maps a career rotates through (C6).
 * Nuke remains supported for saved matches and Map Studio, but is retired from new play.
 * Edit this array to add/remove maps without touching engine code.
 */
export const ROTATION_MAP_POOL: readonly MapId[] = [
    MapId.MIRAGE,
    MapId.INFERNO,
    MapId.OVERPASS,
    MapId.VERTIGO,
    MapId.ANCIENT,
    MapId.ANUBIS,
    MapId.SANDSTONE,
]

/**
 * Active competitive map pool for the season being played. Every season
 * after a career's first, one map of ROTATION_MAP_POOL is benched
 * (engine/season/map-rotation.ts) and this array holds the rest. It is
 * updated in place (setActiveMapPool) so every reader that copies it at
 * call time sees the current season; outside a career it is the full pool.
 */
export const ACTIVE_MAP_POOL: MapId[] = [...ROTATION_MAP_POOL]

/** Smallest pool the veto sequences support (two bans, two picks, a decider). */
export const MIN_ACTIVE_MAPS = 5

/** Replace the active pool (ignored unless it is at least MIN_ACTIVE_MAPS distinct rotation maps). */
export function setActiveMapPool(maps: readonly MapId[] | undefined | null): void {
    const next = [...new Set((maps ?? ROTATION_MAP_POOL).filter(m => ROTATION_MAP_POOL.includes(m)))]
    const ordered = ROTATION_MAP_POOL.filter(m => next.includes(m))
    const use = ordered.length >= MIN_ACTIVE_MAPS ? ordered : [...ROTATION_MAP_POOL]
    if (use.length === ACTIVE_MAP_POOL.length && use.every((m, i) => ACTIVE_MAP_POOL[i] === m)) return
    ACTIVE_MAP_POOL.splice(0, ACTIVE_MAP_POOL.length, ...use)
}

/**
 * Display names for maps. Includes a few legacy map IDs that may still appear
 * in saves from older versions.
 */
export const MAP_NAMES: Record<string, string> = {
    [MapId.SANDSTONE]: "Sandstone",
    [MapId.MIRAGE]: "Mirage",
    [MapId.INFERNO]: "Inferno",
    [MapId.NUKE]: "Nuke",
    [MapId.OVERPASS]: "Overpass",
    [MapId.VERTIGO]: "Vertigo",
    [MapId.ANCIENT]: "Ancient",
    [MapId.ANUBIS]: "Anubis",
    cache: "Cache",
    train: "Train",
    cobblestone: "Cobblestone",
}

/** Resolve a map ID to its display name, falling back to the raw ID. */
export function getMapName(mapId: string | MapId | undefined | null): string {
    if (!mapId) return "Unknown Map"
    return MAP_NAMES[mapId as string] ?? String(mapId)
}

/**
 * Map IDs → public asset filenames. The enum value for Sandstone is
 * "Sandstone" and its artwork file is /maps/sandstone.png. All other maps
 * use their lowercased enum value.
 */
export const MAP_ASSET_FILENAMES: Record<string, string> = {
    [MapId.SANDSTONE]: "sandstone",
    [MapId.MIRAGE]: "mirage",
    [MapId.INFERNO]: "inferno",
    [MapId.NUKE]: "nuke",
    [MapId.OVERPASS]: "overpass",
    [MapId.VERTIGO]: "vertigo",
    [MapId.ANCIENT]: "ancient",
    [MapId.ANUBIS]: "anubis",
}

/** Resolve a MapId to its `/public/maps/<file>.png` filename (no extension). */
export function getMapAssetName(mapId: string | MapId | undefined | null): string {
    if (!mapId) return "sandstone"
    return MAP_ASSET_FILENAMES[mapId as string] ?? String(mapId).toLowerCase()
}
