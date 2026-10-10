/**
 * Live match ↔ round script glue (Phase 2A, W3).
 *
 * The live screen builds one RoundScript per round, right after the resolver
 * has decided it (`playLegacyRound`), and the radar samples that script. The
 * script is rebuilt deterministically from the match seed and the recorded
 * round, so it is never persisted: a resumed match rebuilds it from the
 * checkpointed RoundResult (without bought utility, which the checkpoint does
 * not keep — the radar then simply shows no grenades for that round).
 */

import type { MatchEvent, RoundResult } from "@/types"
import type { LegacySeriesContext } from "@/engine/match/legacy-series"
import { buildRoundScript, prepareRoundMap, scriptInputFromResolverRound, type ResolverLoadout } from "@/engine/match/round-script"
import type { RPoint, RoundMap, RoundScript, SiteId } from "@/engine/match/round-script-types"
import { roundMapFor } from "@/data/round-maps"
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

const SITE_RADIUS = 7.5
const SPAWN_RADIUS = 8
const MID_RADIUS = 9
const APPROACH_RADIUS = 24

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

function inPolygon(p: { x: number; y: number }, poly: readonly { x: number; y: number }[]): boolean {
    let inside = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j]
        if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
    }
    return inside
}

/** Coarse callout for a point: "A site", "B approach", "Mid", "T spawn", "CT side", … */
export function locationOf(map: RoundMap, p: RPoint): string {
    const sameFloor = (q: RPoint) => map.floors.length < 2 || q.floor === p.floor
    for (const id of ["A", "B"] as const) {
        const site = map.sites[id]
        if (sameFloor(site.center) && (dist(site.center, p) <= SITE_RADIUS || (site.polygon.length >= 3 && inPolygon(p, site.polygon)))) return `${id} site`
    }
    if (map.spawns.T.some(q => dist(q, p) <= SPAWN_RADIUS)) return "T spawn"
    if (map.spawns.CT.some(q => dist(q, p) <= SPAWN_RADIUS)) return "CT spawn"
    if (map.holds.some(h => h.kind === "mid" && dist(h.at, p) <= MID_RADIUS)) return "Mid"
    const dA = dist(map.sites.A.center, p), dB = dist(map.sites.B.center, p)
    if (Math.min(dA, dB) <= APPROACH_RADIUS) return `${dA <= dB ? "A" : "B"} approach`
    const dT = Math.min(...map.spawns.T.map(q => dist(q, p)))
    const dCT = Math.min(...map.spawns.CT.map(q => dist(q, p)))
    return dT <= dCT ? "T side" : "CT side"
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
            const death = deaths.get(e.victimId)
            if (!death) return e
            const location = locationOf(live.map, death.at)
            return e.location === location ? e : { ...e, location }
        }
        return e
    })
}
