/**
 * Baked node-to-node line of sight per round map
 * (`scripts/bake-round-visibility.ts`, read by
 * engine/match/round-script-visibility.ts). Keyed by mapId.
 */

import type { VisibilityBake } from "@/engine/match/round-script-visibility"

import ancient from "./Ancient.json"
import anubis from "./Anubis.json"
import inferno from "./Inferno.json"
import mirage from "./Mirage.json"
import nuke from "./Nuke.json"
import overpass from "./Overpass.json"
import sandstone from "./Sandstone.json"
import vertigo from "./Vertigo.json"

const BAKED = [ancient, anubis, inferno, mirage, nuke, overpass, sandstone, vertigo] as unknown as VisibilityBake[]

export const VISIBILITY_BAKES: Record<string, VisibilityBake> = Object.fromEntries(BAKED.map(b => [b.mapId, b]))
