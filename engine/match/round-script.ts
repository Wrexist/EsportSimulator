/**
 * Round script builder (Phase 2A).
 *
 * Turns one resolved round (resolver events, lineups, buys) into a
 * deterministic RoundScript on a RoundMap: the plan, every player's track,
 * where each duel happens, the bought utility and the bomb. Outcomes are not
 * touched — every KILL / PLANT / DEFUSE keeps its resolver time and players;
 * the script only decides where and how.
 *
 *   plan      T strategy, attacked site, CT setup, execute time
 *   assign    roles → T routes and staging spots, CT holds, planter
 *   phases    each player's default "home" over time (stage → execute →
 *             post-plant for T; hold → rotate → retake for CT)
 *   timeline  resolver events in time order become anchors (time + node);
 *             between anchors a player follows their phases and leaves as
 *             late as possible to make the next anchor
 *   duels     each KILL picks a victim/killer node pair in duel range that
 *             both can reach, close to where they would be anyway
 *   bomb      planter on a plant spot for the plant, drops and pickups,
 *             defuser on the bomb, explosion at plant + 40 s
 *   utility   bought grenades land on the map's spots before the execute
 *             (T) or on the retake (CT)
 *
 * Pure and seeded; the walk graph and its shortest paths are cached per
 * RoundMap. Spec: docs/revamp/PHASE2_ROUND_SCRIPT.md
 *
 * Modules: round-script-plan (plan, assign, phases), -timeline (motion,
 * duels, bomb), -tracks (keys, teammate spacing, utility), -context (shared
 * state), -nav (walk graph), -layout (fallback map), -input (adapter).
 */

import { BOMB_SECONDS, createContext } from "./round-script-context"
import { sampleTrack } from "./round-script-sample"
import type { Actor, Step } from "./round-script-context"
import { applyCover } from "./round-script-cover"
import { choosePlan, assignRoles, buildTPhases, buildCtPhases } from "./round-script-plan"
import { runTimeline } from "./round-script-timeline"
import { assembleSteps, toKeys, clipKeys, roundKeys, smokeClouds, spaceTeammates, throwUtility } from "./round-script-tracks"
import { navGraphFor } from "./round-script-nav"
import type { Floor, RoundMap, RoundScript, RoundScriptInput, SampledPlayer, Side, TrackKey } from "./round-script-types"

export { sampleTrack } from "./round-script-sample"
export { roundMapFromLayout, type RoundLayoutSource } from "./round-script-layout"
export {
    roundScriptSeed, scriptInputFromResolverRound,
    type ResolverLoadout, type ResolverRoundSource, type ResolverTeamLineup,
} from "./round-script-input"

// ─── Public API ────────────────────────────────────────────────────────────

export function buildRoundScript(input: RoundScriptInput, map: RoundMap): RoundScript {
    const ctx = createContext(input, map)
    ctx.smokes = smokeClouds(ctx)
    choosePlan(ctx)
    assignRoles(ctx)
    buildTPhases(ctx)
    buildCtPhases(ctx)
    runTimeline(ctx)

    const steps = new Map<Actor, Step[]>()
    for (const a of ctx.actors) steps.set(a, assembleSteps(ctx, a))
    applyCover(ctx, steps, ctx.smokes)
    const raw = new Map<Actor, TrackKey[]>()
    for (const a of ctx.actors) {
        const keys = clipKeys(toKeys(ctx.g, steps.get(a)!), ctx.endTime)
        // A survivor whose steps stop short of the end stays where the last one left them.
        const last = keys[keys.length - 1]
        if (a.deathT === Infinity && last && last.t < ctx.endTime - 1e-6) keys.push({ ...last, t: ctx.endTime })
        raw.set(a, keys)
    }
    spaceTeammates(ctx, raw)
    const tracks: Record<string, TrackKey[]> = {}
    const sides: Record<string, Side> = {}
    for (const a of ctx.actors) {
        tracks[a.id] = roundKeys(raw.get(a)!)
        sides[a.id] = a.side
    }
    if (ctx.plantT !== undefined && ctx.exploded) ctx.bomb.explodeAt = ctx.plantT + BOMB_SECONDS
    return {
        version: 1,
        mapId: input.mapId,
        round: input.round,
        plan: { tStrategy: ctx.strategy, site: ctx.site, ctSetup: ctx.ctSetup },
        sides,
        tracks,
        deaths: ctx.deaths,
        utility: throwUtility(ctx, tracks),
        bomb: ctx.bomb,
        endTime: ctx.endTime,
    }
}

/**
 * Optional warm-up when a map starts (match start, map change): builds the
 * walk graph and all its shortest paths (~15 ms) so every round of the map
 * builds warm (~1 ms). Without it the first rounds of a map pay for them.
 */
export function prepareRoundMap(map: RoundMap): void {
    navGraphFor(map).prepare()
}

/** Every player's interpolated position at `t` (dead players frozen where they fell). */
export function samplePositions(script: RoundScript, t: number): SampledPlayer[] {
    const deathAt = new Map<string, number>()
    for (const d of script.deaths) deathAt.set(d.victimId, d.t)
    const out: SampledPlayer[] = []
    for (const id of Object.keys(script.tracks)) {
        const track = script.tracks[id]
        if (!track.length) continue
        const death = deathAt.get(id)
        out.push({ id, side: script.sides[id], ...sampleTrack(track, t), alive: death === undefined || t < death })
    }
    return out
}
