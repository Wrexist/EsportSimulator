/**
 * Eager imports of every map-layout JSON. Next.js will inline these into
 * the client bundle so the radar engine has zero-async access to layouts.
 *
 * Keys are MapId enum values (lowercase enum, see types/enums.ts) so
 * lib/map-radar-data.ts can look up by enum value directly.
 */

import type { MapLayoutJson } from "./types"

// JSON imports get inferred with `unknown` nested types under strict mode;
// the cast lifts every entry to the authored shape in one place so consumers
// don't have to repeat it.
import dust2Raw from "./dust_ii.json"
import mirageRaw from "./mirage.json"
import infernoRaw from "./inferno.json"
import anubisRaw from "./anubis.json"
import ancientRaw from "./ancient.json"
import overpassRaw from "./overpass.json"
import nukeRaw from "./nuke.json"
import vertigoRaw from "./vertigo.json"

const dust2 = dust2Raw as unknown as MapLayoutJson
const mirage = mirageRaw as unknown as MapLayoutJson
const inferno = infernoRaw as unknown as MapLayoutJson
const anubis = anubisRaw as unknown as MapLayoutJson
const ancient = ancientRaw as unknown as MapLayoutJson
const overpass = overpassRaw as unknown as MapLayoutJson
const nuke = nukeRaw as unknown as MapLayoutJson
const vertigo = vertigoRaw as unknown as MapLayoutJson

export const MAP_LAYOUT_JSONS: Record<string, MapLayoutJson> = {
    [dust2.mapId]: dust2,
    [mirage.mapId]: mirage,
    [inferno.mapId]: inferno,
    [anubis.mapId]: anubis,
    [ancient.mapId]: ancient,
    [overpass.mapId]: overpass,
    [nuke.mapId]: nuke,
    [vertigo.mapId]: vertigo,
}

/** Ordered list — used by the builder UI to render the map picker. */
export const MAP_LAYOUTS_ORDERED: MapLayoutJson[] = [
    dust2, mirage, inferno, anubis, ancient, overpass, nuke, vertigo,
]

export function getMapLayoutJson(mapId: string): MapLayoutJson | undefined {
    return MAP_LAYOUT_JSONS[mapId]
}
