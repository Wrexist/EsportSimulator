import { MapId } from "@/types/enums"

/**
 * Active competitive map pool.
 * Edit this array to add/remove maps without touching engine code.
 */
export const ACTIVE_MAP_POOL: MapId[] = [
    MapId.MIRAGE,
    MapId.INFERNO,
    MapId.NUKE,
    MapId.OVERPASS,
    MapId.VERTIGO,
    MapId.ANCIENT,
    MapId.ANUBIS,
    MapId.SANDSTONE,
]

/**
 * Display names for maps. Includes a few legacy map IDs that may still appear
 * in saves from older versions.
 */
export const MAP_NAMES: Record<string, string> = {
    [MapId.SANDSTONE]: "Dust II",
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
