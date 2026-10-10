/**
 * Baked round maps (Phase 2 W1, `scripts/bake-round-maps.ts`), keyed by
 * MapId value. The round-script builder reads one of these per map; maps
 * without a baked file fall back to `roundMapFromLayout`.
 *
 * Site labels follow the game's bombsite entities and differ from
 * data/map-layouts on several maps: never mix the two sources.
 */

import type { RoundMap } from "@/engine/match/round-script-types"
import { roundMapFromLayout, type RoundLayoutSource } from "@/engine/match/round-script-layout"

import ancient from "./Ancient.json"
import anubis from "./Anubis.json"
import inferno from "./Inferno.json"
import mirage from "./Mirage.json"
import nuke from "./Nuke.json"
import overpass from "./Overpass.json"
import sandstone from "./Sandstone.json"
import vertigo from "./Vertigo.json"

const BAKED = [ancient, anubis, inferno, mirage, nuke, overpass, sandstone, vertigo] as unknown as RoundMap[]

export const ROUND_MAPS: Record<string, RoundMap> = Object.fromEntries(BAKED.map(m => [m.mapId, m]))

export function getRoundMap(mapId: string): RoundMap | undefined {
    return ROUND_MAPS[mapId]
}

/** The baked map, or a development map built from the coarse radar layout for maps without one. */
export function roundMapFor(mapId: string, fallbackLayout?: RoundLayoutSource): RoundMap | undefined {
    return ROUND_MAPS[mapId] ?? (fallbackLayout ? roundMapFromLayout(fallbackLayout, mapId) : undefined)
}
