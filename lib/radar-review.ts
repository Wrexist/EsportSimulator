/**
 * Earlier rounds of the current map for the radar's review scrubber.
 *
 * Round scripts are not persisted; they are rebuilt deterministically from the
 * match seed and the recorded round (`buildLiveRoundScript`, ~1 ms warm), and
 * only when the user opens a round. script-v1 rounds record their grenades,
 * so a rebuilt round shows them; legacy-v2 rounds show no grenades.
 */

import type { RoundResult } from "@/types/match"
import type { RoundScript } from "@/engine/match/round-script-types"
import { buildLiveRoundScript, type LiveScriptSeries } from "./live-round-script"

/** What the live screen has for the map being played. */
export interface RadarReviewSource {
    /** Series context (seed, match id, lineups): `matchData.current.ctx`. */
    ctx: LiveScriptSeries
    /** Index of the map in the series. */
    mapIndex: number
    /** Recorded rounds of this map so far (the live round included): `result.maps[mapIndex].rounds`. */
    rounds: readonly RoundResult[]
}

const cache = new WeakMap<RoundResult, { ctx: LiveScriptSeries; mapId: string; mapIndex: number; script: RoundScript | null }>()

/** The recorded round with that number, if any. */
export function reviewRound(src: RadarReviewSource | null | undefined, roundNumber: number): RoundResult | undefined {
    if (!src) return undefined
    for (let i = src.rounds.length - 1; i >= 0; i--) if (src.rounds[i]?.roundNumber === roundNumber) return src.rounds[i]
    return undefined
}

/** Round numbers that can be reviewed (recorded and with events), ascending. */
export function reviewableRounds(src: RadarReviewSource | null | undefined): number[] {
    if (!src) return []
    const out = new Set<number>()
    for (const r of src.rounds) if (r?.events?.length) out.add(r.roundNumber)
    return [...out].sort((a, b) => a - b)
}

/** The round's script, rebuilt once and cached per recorded round. Null when it cannot be built. */
export function reviewScript(src: RadarReviewSource, mapId: string, roundNumber: number): RoundScript | null {
    const round = reviewRound(src, roundNumber)
    if (!round) return null
    const hit = cache.get(round)
    if (hit && hit.ctx === src.ctx && hit.mapId === mapId && hit.mapIndex === src.mapIndex) return hit.script
    const live = buildLiveRoundScript({ ctx: src.ctx, mapId, mapIndex: src.mapIndex, round })
    const script = live?.script ?? null
    cache.set(round, { ctx: src.ctx, mapId, mapIndex: src.mapIndex, script })
    return script
}
