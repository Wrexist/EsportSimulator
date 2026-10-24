/**
 * Where a player can stand on each round map, a 0.5 map-% raster per floor
 * (`scripts/bake-round-walk.ts`, read by engine/match/round-script-walkable.ts).
 * Keyed by mapId.
 */

import type { WalkBake } from "@/engine/match/round-script-walkable"

import ancient from "./Ancient.json"
import anubis from "./Anubis.json"
import inferno from "./Inferno.json"
import mirage from "./Mirage.json"
import nuke from "./Nuke.json"
import overpass from "./Overpass.json"
import sandstone from "./Sandstone.json"
import vertigo from "./Vertigo.json"

const BAKED = [ancient, anubis, inferno, mirage, nuke, overpass, sandstone, vertigo] as unknown as WalkBake[]

export const WALK_BAKES: Record<string, WalkBake> = Object.fromEntries(BAKED.map(b => [b.mapId, b]))
