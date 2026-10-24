/**
 * Live match ↔ round script glue (Phase 2A, W3).
 *
 * The live screen builds one RoundScript per round, right after the resolver
 * has decided it (`playLegacyRound`), and the radar samples that script. The
 * script is rebuilt deterministically from the match seed and the recorded
 * round, so it is never persisted: a resumed match rebuilds it from the
 * checkpointed RoundResult. legacy-v2 rounds do not record bought utility, so
 * a resumed legacy round shows no grenades.
 *
 * script-v1 rounds carry the resolver's plan, grenades and per-kill zones
 * (RoundResult.plan / .utility, MatchEvent.zone); the builder uses them, so
 * the radar shows the site, timing, smokes and fight places the engine
 * decided, also after a resume.
 *
 * Rounds from the sight engine also carry every player's walk
 * (RoundResult.moves): the radar then replays those positions exactly
 * (round-script-moves.ts) instead of rebuilding them from the events.
 */

import type { MatchEvent, RoundResult } from "@/types"
import type { LegacySeriesContext } from "@/engine/match/legacy-series"
import { buildRoundScript, prepareRoundMap, scriptInputFromResolverRound, type ResolverLoadout } from "@/engine/match/round-script"
import { hasMoves, scriptFromMoves } from "@/engine/match/round-script-moves"
import type { RPoint, RoundMap, RoundScript, SiteId } from "@/engine/match/round-script-types"
import { roundMapFor } from "@/data/round-maps"
import { calloutOf } from "@/engine/match/round-sim/zones"
import { getMapLayoutJson } from "@/data/map-layouts"

export interface LiveRoundScript {
    script: RoundScript
    /** The RoundMap the script was built on (site markers, callouts). */
    map: RoundMap
    mapId: string
    mapIndex: number
    roundNumber: number
}

/** What the builder needs from the series context: seed, match id and both lineups. */
export type LiveScriptSeries = Pick<LegacySeriesContext, "seed" | "matchId" | "home" | "away">

export interface LiveRoundScriptSource {
    ctx: LiveScriptSeries
    mapId: string
    mapIndex: number
    round: RoundResult
    /** Post-buy loadouts by player id (`LegacyRoundStep.preRound`); omitted on restore. */
    loadouts?: Readonly<Record<string, ResolverLoadout | undefined>>
}

/** The baked round map, or a fallback built from the coarse radar layout. */
export function liveRoundMap(mapId: string): RoundMap | undefined {
    return roundMapFor(mapId, getMapLayoutJson(mapId))
}

const warmed = new WeakSet<RoundMap>()

/**
 * Builds the map's walk graph and shortest paths once (~15 ms) so every round
 * of the map builds warm (~1 ms). Idempotent; call when a map starts.
 */
export function warmRoundMap(mapId: string): void {
    const map = liveRoundMap(mapId)
    if (!map || warmed.has(map)) return
    warmed.add(map)
    try {
        prepareRoundMap(map)
    } catch {
        // The first build of the map pays for it instead.
    }
}

const lineup = (side: LiveScriptSeries["home"]) => ({
    teamId: side.team.id,
    playstyle: side.team.playstyle,
    players: side.players.map(p => ({ id: p.id, role: p.role })),
})

/**
 * The round's script, or null when it cannot be built (unknown map, no
 * events, builder failure). Never throws: the radar is display only and must
 * not stop a live match.
 */
export function buildLiveRoundScript(src: LiveRoundScriptSource): LiveRoundScript | null {
    const map = liveRoundMap(src.mapId)
    if (!map || !src.round?.events?.length) return null
    if (hasMoves(src.round)) {
        try {
            const ct = src.round.ctTeam === src.ctx.home.team.id ? src.ctx.home : src.ctx.away
            const script = scriptFromMoves(src.round, src.mapId, map, new Set(ct.players.map(p => p.id)))
            return { script, map, mapId: src.mapId, mapIndex: src.mapIndex, roundNumber: src.round.roundNumber }
        } catch (error) {
            // A record that does not fit this map: rebuild from the events below.
            if (process.env.NODE_ENV !== "production") console.warn("[radar] moves replay failed", error)
        }
    }
    try {
        const input = scriptInputFromResolverRound({
            mapId: src.mapId,
            seed: src.ctx.seed,
            matchId: src.ctx.matchId,
            mapIndex: src.mapIndex,
            round: src.round,
            home: lineup(src.ctx.home),
            away: lineup(src.ctx.away),
            loadouts: src.loadouts,
        })
        const script = buildRoundScript(input, map)
        return { script, map, mapId: src.mapId, mapIndex: src.mapIndex, roundNumber: src.round.roundNumber }
    } catch (error) {
        if (process.env.NODE_ENV !== "production") console.warn("[radar] round script failed", error)
        return null
    }
}

// ─── Event annotations (display only) ──────────────────────────────────────

/** Coarse callout for a point: "A site", "B approach", "Mid", "T spawn", "CT side", … (shared with the script-v1 resolver). */
export function locationOf(map: RoundMap, p: RPoint): string {
    return calloutOf(map, p)
}

/**
 * Copies of the round's events with the script's bombsite on PLANT / DEFUSE /
 * EXPLODE and a callout on each KILL. Unchanged events keep their identity;
 * without a script the input array is returned as is.
 */
export function annotateRoundEvents(events: MatchEvent[], live: LiveRoundScript | null): MatchEvent[] {
    if (!live) return events
    const site: SiteId | undefined = live.script.bomb.plant?.site
    const deaths = new Map(live.script.deaths.map(d => [d.victimId, d]))
    return events.map(e => {
        if (site && (e.type === "PLANT" || e.type === "DEFUSE" || e.type === "EXPLODE")) return e.site === site ? e : { ...e, site }
        if (e.type === "KILL" && e.victimId) {
            // script-v1 kills already name where the engine fought them.
            if (e.zone && e.location) return e
            const death = deaths.get(e.victimId)
            if (!death) return e
            const location = locationOf(live.map, death.at)
            return e.location === location ? e : { ...e, location }
        }
        return e
    })
}
