/**
 * Round script from the sight engine's own movement (RoundResult.moves).
 *
 * A sight-v1 round records where every player walked (round-sim/moves.ts).
 * The radar replays exactly that instead of reconstructing positions from
 * the events: each player's legs expand to timed nodes on the same walk
 * graph, deaths and kills happen where the two players really stood, and
 * the grenades and the bomb sit where the engine put them. Live, after a
 * resume and in the review scrubber alike, because it is rebuilt from the
 * round result alone.
 */

import { navGraphFor, type NavGraph } from "./round-script-nav"
import { angle, round3, roundPoint, type Step, type XY } from "./round-script-context"
import { clipKeys, roundKeys, toKeys, UTILITY_SECONDS } from "./round-script-tracks"
import { sampleTrack } from "./round-script-sample"
import { expandLegs, type RoundMoves } from "./round-sim/moves"
import { loosenTracks, MAX_DRIFT, type Pins } from "./round-script-motion"
import { HE_DAMAGE_RADIUS } from "./grenade-damage"
import { walkAreaFor } from "./round-script-walkable"
import type {
    RoundMap, RoundScript, RPoint, ScriptBomb, ScriptDeath, ScriptUtility, Side, SiteId, TrackKey, UtilityKind,
} from "./round-script-types"
import type { RoundResult } from "@/types"

const { max } = Math

/** Display radius of a grenade without a baked spot (map-%). */
const FREE_RADIUS: Record<UtilityKind, number> = { smoke: 2.5, molotov: 1.6, he: 1.2, flash: 2 }
/** Seconds a killer turns onto the victim before the shot. */
const AIM_LEAD = 0.3
/** Seconds a plant takes (round-sim/simulate.ts PLANT_TIME) and a defuse with a kit (without: twice that). */
const PLANT_TIME = 3.2
const DEFUSE_KIT_TIME = 5

/** Whether a round carries movement this map can replay. */
export function hasMoves(round: Pick<RoundResult, "moves">): boolean {
    const m = round.moves
    return !!m && m.v === 1 && m.ids.length === m.legs.length && m.ids.length > 0
}

/**
 * The radar script of a sight-v1 round. `ctIds` are the players on CT this
 * round. Players are drawn a little off the engine's exact line
 * (round-script-motion.ts) unless `opts.loosen` is false. Throws on a record
 * that does not fit the map (the caller falls back).
 */
export function scriptFromMoves(
    round: RoundResult, mapId: string, map: RoundMap, ctIds: ReadonlySet<string>, opts: { loosen?: boolean } = {},
): RoundScript {
    const moves = round.moves as RoundMoves
    const g = navGraphFor(map)
    const events = round.events ?? []
    const end = events.find(e => e.type === "ROUND_END")
    const lastT = events.reduce((m, e) => max(m, e.time), 0)
    const endTime = max(end?.time ?? lastT + 2, lastT, 5)
    for (const rec of moves.legs) for (let i = 0; i < rec.length; i++) {
        if ((i === 0 || (i - 1) % 4 === 1) && (rec[i] < 0 || rec[i] >= g.size)) throw new Error(`moves: node ${rec[i]} not on the map`)
    }

    const kills = events.filter(e => e.type === "KILL" && e.playerId && e.victimId)
    const deathT = new Map(kills.map(k => [k.victimId!, k.time]))
    const watch = new Map<number, XY>()
    for (const h of map.holds) {
        const n = g.holdNodes.get(h.id)
        if (n !== undefined) watch.set(n, h.watch)
    }

    // Tracks: walked nodes, holds facing their watch point, cut at death or round end.
    const raw = new Map<string, TrackKey[]>()
    moves.ids.forEach((id, k) => {
        const steps: Step[] = expandLegs(g, moves.legs[k]).map(s => ({ t: s.t, node: s.node }))
        for (let i = 0; i < steps.length; i++) {
            const s = steps[i], nx = steps[i + 1]
            if ((!nx || nx.node === s.node) && watch.has(s.node)) s.look = watch.get(s.node)
        }
        const until = deathT.get(id) ?? endTime
        const keys = clipKeys(toKeys(g, steps), until)
        // Standing still to the end: one key there, so the radar's loosening covers the whole hold.
        const last = keys[keys.length - 1]
        if (last && last.t < until - 0.05) keys.push({ ...last, t: until })
        raw.set(id, keys)
    })
    const sideOf: Record<string, Side> = {}
    for (const id of moves.ids) sideOf[id] = ctIds.has(id) ? "CT" : "T"
    const utility = utilityOf(round, map, g)
    if (opts.loosen !== false) {
        const pins = pinsOf(round, moves)
        // Whoever stood near an HE when it went off stays put: a drift must not walk them into (or out of) the blast.
        for (const u of utility) {
            if (u.kind !== "he") continue
            for (const [id, track] of raw) {
                if (!track.length || track[0].t > u.t || track[track.length - 1].t < u.t) continue
                const p = sampleTrack(track, u.t)
                if (Math.hypot(p.x - u.at.x, p.y - u.at.y) >= HE_DAMAGE_RADIUS + MAX_DRIFT) continue
                let list = pins.get(id)
                if (!list) pins.set(id, list = [])
                list.push([u.t - 0.3, u.t + 0.3])
            }
        }
        loosenTracks(raw, sideOf, pins, walkAreaFor(mapId), map.runSpeed, `${mapId}:${round.roundNumber}`)
    }
    const at = (id: string, t: number): RPoint | undefined => {
        const track = raw.get(id)
        if (!track?.length) return undefined
        const p = sampleTrack(track, t)
        return { x: p.x, y: p.y, floor: p.floor }
    }

    // Kills: the killer turns onto the victim; both are where they stood.
    const deaths: ScriptDeath[] = []
    for (const e of kills) {
        const v = at(e.victimId!, e.time), f = at(e.playerId!, e.time)
        if (!v || !f) continue
        deaths.push({
            t: e.time, victimId: e.victimId!, killerId: e.playerId!, at: roundPoint(v), from: roundPoint(f),
            ...(e.weapon ? { weapon: e.weapon } : {}), ...(e.isHeadshot ? { headshot: true } : {}),
        })
        const track = raw.get(e.playerId!)
        if (track) aimAt(track, e.time, v)
    }

    const tracks: Record<string, TrackKey[]> = {}
    const sides: Record<string, Side> = {}
    for (const id of moves.ids) {
        tracks[id] = roundKeys(raw.get(id) ?? [])
        sides[id] = sideOf[id]
    }

    return {
        version: 1,
        mapId,
        round: round.roundNumber,
        plan: {
            tStrategy: round.plan?.tStrategy ?? "default",
            site: round.plan?.site ?? "A",
            ctSetup: round.plan?.ctSetup ?? "2-1-2",
        },
        sides,
        tracks,
        deaths,
        utility,
        bomb: bombOf(round, moves, g),
        endTime,
    }
}

/**
 * Moments the radar shows a player exactly where the engine had them: their
 * kills and deaths, grenade hits, planting, defusing and picking up the bomb.
 */
function pinsOf(round: RoundResult, moves: RoundMoves): Pins {
    const pins: Pins = new Map()
    const pin = (id: string | undefined, a: number, b: number) => {
        if (!id) return
        let list = pins.get(id)
        if (!list) pins.set(id, list = [])
        list.push([a, b])
    }
    for (const e of round.events ?? []) {
        if (e.type === "KILL") { pin(e.playerId, e.time - AIM_LEAD - 0.1, e.time); pin(e.victimId, e.time - 0.4, e.time) }
        else if (e.type === "PLANT") pin(e.playerId, e.time - PLANT_TIME - 0.2, e.time + 0.3)
        else if (e.type === "DEFUSE") pin(e.playerId, e.time - DEFUSE_KIT_TIME * 2 - 0.2, e.time)
    }
    // Grenade victims stand where the engine hit them (in the fire, inside the blast).
    for (const u of round.utility ?? []) if (u.hit) pin(u.hit, u.t - 0.5, u.t + 0.5)
    const b = moves.bomb
    for (let i = 0; i + 2 < b.length; i += 3) {
        const t = b[i] / 100, who = b[i + 1]
        if (who >= 0) pin(moves.ids[who], t - 0.3, t + 0.3)
    }
    return pins
}

/** Point the killer's aim at the victim for the moment of the kill. */
function aimAt(track: TrackKey[], t: number, victim: XY): void {
    const set = (tk: number) => {
        const p = sampleTrack(track, tk)
        const key: TrackKey = { t: tk, x: p.x, y: p.y, floor: p.floor, aim: angle(p, victim) }
        let i = track.findIndex(k => k.t >= tk - 1e-6)
        if (i < 0) i = track.length
        if (track[i] && Math.abs(track[i].t - tk) < 1e-6) track[i] = key
        else track.splice(i, 0, key)
    }
    if (t - AIM_LEAD > track[0].t) set(t - AIM_LEAD)
    set(t)
}

function utilityOf(round: RoundResult, map: RoundMap, g: NavGraph): ScriptUtility[] {
    const out: ScriptUtility[] = []
    for (const u of round.utility ?? []) {
        const spot = u.spot ? map.utility.find(s => s.id === u.spot) : undefined
        const p: RPoint | undefined = spot?.at ?? (u.at ? { x: u.at.x, y: u.at.y, floor: u.at.floor ?? "upper" } : undefined)
        const where = p ?? g.point(g.siteNodes[u.site as SiteId] ?? 0)
        out.push({
            t: round3(u.t), throwerId: u.playerId, kind: u.kind, at: roundPoint(where),
            radius: spot?.radius ?? FREE_RADIUS[u.kind], duration: UTILITY_SECONDS[u.kind],
            ...(u.hit ? { hitId: u.hit } : {}), ...(u.dmg ? { dmg: u.dmg } : {}),
        })
    }
    return out.sort((a, b) => a.t - b.t)
}

function bombOf(round: RoundResult, moves: RoundMoves, g: NavGraph): ScriptBomb {
    const events = round.events ?? []
    const bomb: ScriptBomb = { carrier: [] }
    const b = moves.bomb
    for (let i = 0; i + 2 < b.length; i += 3) {
        const t = b[i] / 100, who = b[i + 1], node = b[i + 2]
        bomb.carrier.push(who >= 0
            ? { t, carrierId: moves.ids[who] ?? null }
            : { t, carrierId: null, at: roundPoint(g.point(node)) })
    }
    const plant = events.find(e => e.type === "PLANT")
    if (plant?.playerId) {
        const last = [...bomb.carrier].reverse().find(c => c.carrierId === null && c.t <= plant.time + 0.01)
        const spot = plant.spot ? { x: plant.spot.x, y: plant.spot.y, floor: plant.spot.floor ?? "upper" } : last?.at
        if (spot) bomb.plant = { t: plant.time, site: (plant.site ?? round.plan?.site ?? "A") as SiteId, at: roundPoint(spot as RPoint), planterId: plant.playerId }
    }
    const defuse = events.find(e => e.type === "DEFUSE")
    if (defuse?.playerId) {
        const kit = round.playerEconomy?.find(p => p.playerId === defuse.playerId)?.hasKit
        bomb.defuse = { tStart: round3(defuse.time - (kit ? 5 : 10)), tEnd: defuse.time, defuserId: defuse.playerId, success: true }
    }
    const explode = events.find(e => e.type === "EXPLODE")
    if (explode) bomb.explodeAt = explode.time
    return bomb
}
