/**
 * Round script internals: the builder's context, actors, anchors and small
 * helpers shared by plan, timeline and tracks. Not part of the public API.
 */

import { SeededRNG, deriveSeed } from "../rng"
import { navGraphFor, type NavGraph } from "./round-script-nav"
import type { CtSetup, Floor, RPoint, RoundMap, RoundMapHold, RoundMapRoute, RoundScriptInput, RoundScriptPlayer, ScriptBomb, ScriptDeath, Side, SiteId, TStrategy } from "./round-script-types"

// Math is read once: global lookups are very slow inside Jest's sandbox (tests time the builder).
const { atan2, max, PI, round, sqrt } = Math

export const PLANT_SECONDS = 3
export const BOMB_SECONDS = 40
/** Paces as a share of the map's runSpeed. */
export const WALK_PACE = 0.85
export const RUN_PACE = 0.95
export const PLAN_PACE = 0.92
/** Teammates' default spots keep at least this far apart. */
export const HOME_GAP = 3.6
/** Seconds between teammates leaving together, so they walk in single file. */
export const FILE_GAP = 0.9
/** Euclidean length (Math.hypot is several times slower, much more so inside Jest). */
export const len = (dx: number, dy: number) => sqrt(dx * dx + dy * dy)

export interface XY {
    x: number
    y: number
}

/** A default "home" a player walks to from time `t` on. */
export interface Phase {
    t: number
    node: number
    pace: number
    look?: XY
}

/** A hard constraint: the player is on `node` at `t`. */
export interface Anchor {
    t: number
    node: number
    look?: XY
    aimAt?: XY
    dead?: boolean
    /** Pinned on the node until then (planting / defusing). */
    holdUntil?: number
    kind?: "plant" | "defuse"
}

export interface Step {
    t: number
    node: number
    look?: XY
    aimAt?: XY
}

export type Role = "entry" | "support" | "igl" | "awp" | "lurk" | "rifler"
export type Job = "entry" | "support" | "igl" | "awp" | "lurk" | "fake" | "pack" | "ct"

export interface Actor {
    id: string
    side: Side
    player: RoundScriptPlayer
    role: Role
    job: Job
    /** Lead order within the side (entry first). */
    order: number
    spawn: number
    deathT: number
    route?: RoundMapRoute
    hold?: RoundMapHold
    phases: Phase[]
    anchors: Anchor[]
    /** Future anchors (plant / defuse) committed when the timeline reaches them. */
    fixed: Anchor[]
    legs: (Step[] | undefined)[]
    tail?: { from: number; steps: Step[] }
    /** Times of the kills this player takes part in. */
    eventTimes: number[]
}

export interface Kill {
    t: number
    killerId: string
    victimId: string
    weapon?: string
    headshot?: boolean
    trade?: boolean
    /** script-v1: baked zone id the resolver put this fight in. */
    zone?: string
}

export interface State {
    node: number
    x: number
    y: number
    floor: Floor
    holding: boolean
}

export interface Chain {
    nodes: number[]
    arc: number[]
    contactArc: number
    contactNode: number
}

export interface Ctx {
    input: RoundScriptInput
    map: RoundMap
    g: NavGraph
    v: number
    rng: { plan: SeededRNG; assign: SeededRNG; duel: SeededRNG; util: SeededRNG }
    endTime: number
    actors: Actor[]
    byId: Map<string, Actor>
    kills: Kill[]
    plantT?: number
    defuseT?: number
    exploded: boolean
    saveT?: number
    strategy: TStrategy
    site: SiteId
    ctSetup: CtSetup
    execAt: number
    trigger: number
    plantNode: number
    planter?: Actor
    deaths: ScriptDeath[]
    bomb: ScriptBomb
    carrierId: string | null
    drop?: { t: number; node: number }
    lastDeath?: { t: number; node: number }
    chains: Map<string, Chain>
    /** Constraints the builder could not meet (kept for tests / the harness). */
    violations: number
}

// ─── Context ───────────────────────────────────────────────────────────────

export function createContext(input: RoundScriptInput, map: RoundMap): Ctx {
    const g = navGraphFor(map)
    const stream = (label: string) => new SeededRNG(deriveSeed(input.seed, input.mapId, input.round, label))
    const rng = { plan: stream("plan"), assign: stream("assign"), duel: stream("duel"), util: stream("utility") }
    const events = input.events.filter(e => Number.isFinite(e.time)).sort((a, b) => a.time - b.time)

    const actors: Actor[] = []
    const byId = new Map<string, Actor>()
    for (const side of ["T", "CT"] as const) {
        const spawns = rng.assign.shuffle(g.spawnNodes[side].length ? g.spawnNodes[side] : [0])
        input.players.filter(p => p.side === side).forEach((p, i) => {
            const spawn = spawns[i % spawns.length]
            const a: Actor = {
                id: p.id, side, player: p, role: roleOf(p.role), job: side === "CT" ? "ct" : "pack", order: i, spawn,
                deathT: Infinity, phases: [], anchors: [{ t: 0, node: spawn }], fixed: [], legs: [], eventTimes: [],
            }
            actors.push(a)
            byId.set(a.id, a)
        })
    }

    const kills: Kill[] = []
    for (const e of events) {
        if (e.type !== "KILL") continue
        const killerId = e.killerId ?? e.playerId
        const victim = e.victimId ? byId.get(e.victimId) : undefined
        if (!victim || !killerId || victim.deathT !== Infinity) continue
        victim.deathT = e.time
        victim.eventTimes.push(e.time)
        byId.get(killerId)?.eventTimes.push(e.time)
        kills.push({ t: e.time, killerId, victimId: victim.id, weapon: e.weapon, headshot: e.isHeadshot, trade: e.isTrade, ...(e.zone ? { zone: e.zone } : {}) })
    }
    const plant = events.find(e => e.type === "PLANT")
    const defuse = events.find(e => e.type === "DEFUSE")
    const save = events.find(e => e.type === "SAVE")
    const roundEnd = events.find(e => e.type === "ROUND_END")
    const lastT = events.length ? events[events.length - 1].time : 0

    return {
        input, map, g, v: map.runSpeed, rng,
        endTime: max(roundEnd?.time ?? lastT + 2, lastT, 5),
        actors, byId, kills,
        plantT: plant?.time,
        defuseT: plant ? defuse?.time : undefined,
        exploded: !!plant && (events.some(e => e.type === "EXPLODE") || input.endReason === "bomb_exploded"),
        saveT: save?.time,
        strategy: "default", site: "A", ctSetup: "2-1-2", execAt: 40, trigger: 45, plantNode: g.siteNodes.A,
        deaths: [], bomb: { carrier: [] }, carrierId: null,
        chains: new Map(), violations: 0,
    }
}

export function roleOf(role: string): Role {
    const r = (role || "").toUpperCase()
    if (r.includes("ENTRY")) return "entry"
    if (r.includes("SUPPORT")) return "support"
    if (r === "IGL" || r.includes("LEADER")) return "igl"
    if (r.includes("AWP") || r.includes("SNIPER")) return "awp"
    if (r.includes("LURK")) return "lurk"
    return "rifler"
}

export function weaponClass(weapon: string | undefined): "sniper" | "rifle" | "smg" | "shotgun" | "pistol" | "knife" | "other" {
    const w = (weapon ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
    if (/^(awp|ssg08|scar20|g3sg1)$/.test(w)) return "sniper"
    if (/^(ak47|m4a4|m4a1s?|m4a1silencer|galil(ar)?|famas|aug|sg55[36])$/.test(w)) return "rifle"
    if (/^(mac10|mp9|mp7|mp5sd|ump45|p90|(pp)?bizon)$/.test(w)) return "smg"
    if (/^(nova|mag7|sawedoff|xm1014)$/.test(w)) return "shotgun"
    if (/^(glock|usps?|p2000|p250|deagle|deserteagle|dualies|elite|tec9|fiveseven|cz75a?|r8|revolver)$/.test(w)) return "pistol"
    if (w.startsWith("knife")) return "knife"
    return "other"
}

export const isSniper = (weapon: string | undefined) => weaponClass(weapon) === "sniper"
export const other = (s: SiteId): SiteId => (s === "A" ? "B" : "A")
export const hyp = (a: XY, b: XY) => len(a.x - b.x, a.y - b.y)
export const alive = (a: Actor, t: number) => a.deathT > t

export function weighted<K extends string>(rng: SeededRNG, weights: Record<K, number>): K {
    const keys = Object.keys(weights) as K[]
    const total = keys.reduce((s, k) => s + max(0, weights[k]), 0)
    let r = rng.next() * total
    for (const k of keys) {
        r -= max(0, weights[k])
        if (r < 0) return k
    }
    return keys[keys.length - 1]
}

// ─── Math ──────────────────────────────────────────────────────────────────

export function angle(from: XY, to: XY): number {
    return atan2(to.y - from.y, to.x - from.x)
}

export function lerpAngle(a: number, b: number, u: number): number {
    let d = (b - a) % (PI * 2)
    if (d > PI) d -= PI * 2
    if (d < -PI) d += PI * 2
    let r = a + d * u
    if (r > PI) r -= PI * 2
    if (r <= -PI) r += PI * 2
    return r
}

export const round3 = (v: number) => round(v * 1000) / 1000
export const round4 = (v: number) => round(v * 10000) / 10000
/** Keys and points keep 0.001 map-%: coarser rounding makes very short segments look fast. */
export const roundPoint = (p: RPoint): RPoint => ({ x: round3(p.x), y: round3(p.y), floor: p.floor })
