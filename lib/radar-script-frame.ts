/**
 * One radar frame read from a round script at time `t` (seconds since round
 * start): players, death markers, shot tracers, grenades and the bomb.
 *
 * Pure and cheap: players are sampled with a binary search per track
 * (`samplePositions`), everything else is a scan of a few dozen entries, so
 * the radar can call it on every animation frame.
 */

import { samplePositions, sampleTrack } from "@/engine/match/round-script"
import type { Floor, RPoint, RoundScript, SampledPlayer, Side, SiteId, UtilityKind } from "@/engine/match/round-script-types"

/** Seconds a shot tracer stays on the radar after a kill. */
export const TRACER_SECONDS = 1.2
/** Seconds a grenade is shown flying from its thrower to where it lands. */
export const GRENADE_FLIGHT_SECONDS = 0.8
/** Seconds a flash / HE pop stays visible (the effect itself is ~0.3 s). */
export const POP_SECONDS = 0.7
/** Seconds to plant (the planter stands on the spot before the PLANT time). */
export const PLANT_SECONDS = 3
const SMOKE_FADE_IN = 0.6
const SMOKE_FADE_OUT = 1.5

export interface FramePlayer extends SampledPlayer {
    hasBomb: boolean
}

export interface FrameDeath {
    victimId: string
    killerId: string
    t: number
    at: RPoint
    /** Victim's side (marker colour). */
    side: Side
}

export interface FrameTracer {
    from: RPoint
    at: RPoint
    /** Killer's side (tracer colour). */
    side: Side
    headshot: boolean
    /** 1 when fresh, fading to 0 at TRACER_SECONDS. */
    strength: number
}

export interface FrameUtility {
    kind: UtilityKind
    at: RPoint
    radius: number
    /** 0..1 visibility (fade in / out). */
    opacity: number
    /** 0..1 progress through the effect (pops grow with it). */
    progress: number
}

export interface FrameGrenade {
    kind: UtilityKind
    x: number
    y: number
    floor: Floor
    side: Side
}

export type BombPhase = "carried" | "dropped" | "planting" | "planted" | "defusing" | "defused" | "exploded" | "none"

export interface FrameBomb {
    phase: BombPhase
    /** Where the bomb lies (dropped / planting / planted and later). */
    at?: RPoint
    carrierId?: string
    /** Planting or defusing progress 0..1. */
    progress?: number
    defuserId?: string
    site?: SiteId
    /** Seconds since it was planted / exploded / defused (for pulses and flashes). */
    since?: number
}

export interface RadarScriptFrame {
    t: number
    players: FramePlayer[]
    deaths: FrameDeath[]
    tracers: FrameTracer[]
    utility: FrameUtility[]
    grenades: FrameGrenade[]
    bomb: FrameBomb
}

/** Bomb state at `t` from the script's carrier timeline, plant, defuse and explosion. */
export function bombAt(script: RoundScript, t: number, alive?: (id: string) => boolean): FrameBomb {
    const { carrier, plant, defuse, explodeAt } = script.bomb
    if (plant && t >= plant.t) {
        if (explodeAt !== undefined && t >= explodeAt) return { phase: "exploded", at: plant.at, site: plant.site, since: t - explodeAt }
        if (defuse && t >= defuse.tStart) {
            if (t < defuse.tEnd) {
                const span = Math.max(0.001, defuse.tEnd - defuse.tStart)
                return { phase: "defusing", at: plant.at, site: plant.site, defuserId: defuse.defuserId, progress: (t - defuse.tStart) / span, since: t - plant.t }
            }
            if (defuse.success) return { phase: "defused", at: plant.at, site: plant.site, defuserId: defuse.defuserId, since: t - defuse.tEnd }
        }
        return { phase: "planted", at: plant.at, site: plant.site, since: t - plant.t }
    }
    if (plant && t >= plant.t - PLANT_SECONDS && (!alive || alive(plant.planterId))) {
        return { phase: "planting", at: plant.at, site: plant.site, carrierId: plant.planterId, progress: (t - (plant.t - PLANT_SECONDS)) / PLANT_SECONDS }
    }
    let entry: RoundScript["bomb"]["carrier"][number] | undefined
    for (const c of carrier) {
        if (c.t > t) break
        entry = c
    }
    if (!entry) return { phase: "none" }
    if (entry.carrierId) return { phase: "carried", carrierId: entry.carrierId }
    return entry.at ? { phase: "dropped", at: entry.at } : { phase: "none" }
}

/** Everything the radar draws at `t`. */
export function radarScriptFrame(script: RoundScript, t: number): RadarScriptFrame {
    const sampled = samplePositions(script, t)
    const aliveIds = new Set(sampled.filter(p => p.alive).map(p => p.id))
    const bomb = bombAt(script, t, id => aliveIds.has(id))
    const players: FramePlayer[] = sampled.map(p => ({ ...p, hasBomb: p.alive && (bomb.phase === "carried" || bomb.phase === "planting") && bomb.carrierId === p.id }))

    const deaths: FrameDeath[] = []
    const tracers: FrameTracer[] = []
    for (const d of script.deaths) {
        if (d.t > t) continue
        deaths.push({ victimId: d.victimId, killerId: d.killerId, t: d.t, at: d.at, side: script.sides[d.victimId] ?? "T" })
        const age = t - d.t
        if (age <= TRACER_SECONDS) {
            tracers.push({ from: d.from, at: d.at, side: script.sides[d.killerId] ?? "CT", headshot: !!d.headshot, strength: 1 - age / TRACER_SECONDS })
        }
    }

    const utility: FrameUtility[] = []
    const grenades: FrameGrenade[] = []
    for (const u of script.utility) {
        if (t < u.t) {
            if (t >= u.t - GRENADE_FLIGHT_SECONDS) {
                const track = script.tracks[u.throwerId]
                if (track?.length) {
                    const from = sampleTrack(track, u.t - GRENADE_FLIGHT_SECONDS)
                    const k = (t - (u.t - GRENADE_FLIGHT_SECONDS)) / GRENADE_FLIGHT_SECONDS
                    grenades.push({
                        kind: u.kind,
                        x: from.x + (u.at.x - from.x) * k,
                        y: from.y + (u.at.y - from.y) * k,
                        floor: k < 0.5 ? from.floor : u.at.floor,
                        side: script.sides[u.throwerId] ?? "T",
                    })
                }
            }
            continue
        }
        const pop = u.kind === "flash" || u.kind === "he"
        const life = pop ? POP_SECONDS : u.duration
        const age = t - u.t
        if (age > life) continue
        let opacity = 1
        if (!pop) {
            if (age < SMOKE_FADE_IN) opacity = age / SMOKE_FADE_IN
            else if (age > life - SMOKE_FADE_OUT) opacity = Math.max(0, (life - age) / SMOKE_FADE_OUT)
        } else {
            opacity = 1 - age / life
        }
        utility.push({ kind: u.kind, at: u.at, radius: u.radius, opacity, progress: age / life })
    }

    return { t, players, deaths, tracers, utility, grenades, bomb }
}

/** Alive players per side at `t` (for the clutch banner and the footer). */
export function aliveCounts(script: RoundScript, t: number): Record<Side, number> {
    const dead = new Set(script.deaths.filter(d => d.t <= t).map(d => d.victimId))
    const out: Record<Side, number> = { CT: 0, T: 0 }
    for (const id of Object.keys(script.tracks)) if (!dead.has(id)) out[script.sides[id]] += 1
    return out
}

/**
 * Floor the radar should show on a two-level map: the planted bomb's floor,
 * else the most recent kill's (within 2 s), else where most living players
 * are; ties keep the current floor.
 */
export function scriptAutoFloor(script: RoundScript, t: number, current: Floor): Floor {
    const bomb = bombAt(script, t)
    if ((bomb.phase === "planted" || bomb.phase === "defusing" || bomb.phase === "planting") && bomb.at) return bomb.at.floor
    let recent: { t: number; floor: Floor } | undefined
    for (const d of script.deaths) if (d.t <= t && t - d.t <= 2 && (!recent || d.t > recent.t)) recent = { t: d.t, floor: d.at.floor }
    if (recent) return recent.floor
    let upper = 0, lower = 0
    for (const p of samplePositions(script, t)) {
        if (!p.alive) continue
        if (p.floor === "lower") lower++
        else upper++
    }
    return lower > upper ? "lower" : upper > lower ? "upper" : current
}
