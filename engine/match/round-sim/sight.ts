/**
 * The sight engine (script-v1 on maps with a baked round map): players move first, and fights start when enemies
 * see each other.
 *
 * Every player walks the round map's walk graph (round-script-nav) second by
 * second (DT ticks), on routes and timings from the round's plan (choosePlan /
 * assignJobs in simulate.ts: T strategy and site, CT setup and read, jobs,
 * posts). Each tick every pair of living enemies is checked against the
 * baked line of sight (round-script-visibility, out to BAKE_RADIUS) and the
 * smokes in the air. A new sighting becomes a fight with the pro
 * fight-by-distance rates (SIGHT_ENGAGE, docs/revamp/pro-benchmarks), and
 * the fight is decided by the resolver's duel maths (duel() in simulate.ts):
 * aim, weapon, armour, HP, day form, team edge, clutch and opening points,
 * plus what the two were doing when they met (holding an angle, walking into
 * it, caught from behind, blind, planting, trading a teammate). The kill
 * lands a sight-to-kill delay later (pro median 0.43 s); until then both
 * stand and shoot, and anyone else who sees them can join.
 *
 * The plan drives the movement, not the fights: Ts stage on their routes and
 * execute at the plan's time with real utility (smokes block sight, flashes
 * blind who faces them, molotovs flush and hold up, HEs hurt by distance);
 * CTs walk to their holds and rotate when they get information (Ts seen on a
 * site, utility, a teammate dying there, the plant). After a plant the Ts
 * hold post-plant spots and the CTs regroup, retake and defuse. Saves,
 * pickups of a dropped bomb, the round clock and the bomb timer are played
 * out on the map too.
 *
 * Output is the resolver's SimOutput (events, kills, damage, utility, plan)
 * plus `moves`: every player's legs on the walk graph (moves.ts), which the
 * radar replays as is.
 *
 * Pure and seeded: same inputs and roll key → same round.
 */

import { getRoundMap } from "@/data/round-maps"
import { HE_DAMAGE_RADIUS, heDamage, heLandingDistance } from "../grenade-damage"
import { navGraphFor, type NavGraph } from "../round-script-nav"
import type { RPoint, RoundMap, SiteId, UtilityKind } from "../round-script-types"
import { segmentHitsCircle, visibilityFor, type Visibility } from "../round-script-visibility"
import { PACES, arrivals, type RoundMoves } from "./moves"
import { TRAIT_AGGRESSIVE } from "./profile"
import {
    BOMB_TIME, LATEST_PLANT_START, P, PLANT_TIME, ROUND_TIME,
    assignJobs, choosePlan, commonPts, countAlive, duel, explode, finish, givesUp, holdPts, hurtBy, keyedRoll, pickWeighted,
    living, makeActors, openingPts, peekPts, plantUrgency, r1, rnd, save, surpriseRush, tradePts,
    type Actor, type PlanState, type Round, type RoundEnd, type SimInput, type SimOutput, type UtilityThrow,
} from "./simulate"
import { TUNING as T } from "./tuning"
import { isSniperClass, isSaveWorthy } from "./weapons"
import { zonePoint, type MapZones } from "./zones"

// Math is read once: global lookups are slow inside Jest's sandbox.
const { abs, atan2, cos, exp, floor, log, max, min, PI, round, sin, sqrt } = Math

/** Seconds per tick. */
export const DT = 0.25

const WALK = 0
const RUN = 1
const EMPTY: number[] = []

// ─── Map data ──────────────────────────────────────────────────────────────

interface XY { x: number; y: number }
interface Chain { nodes: number[]; arc: number[]; ci: number }

interface MapData {
    map: RoundMap
    g: NavGraph
    vis: Visibility
    /** Nearest zone id (route contact, hold, site) per node, for the kill feed. */
    zoneOf: string[]
    chains: Map<string, Chain>
    /** Hold node → the point its holder watches. */
    watch: Map<number, XY>
    /** Hold nodes of the angles every T knows (geometry holds and common pro ones). */
    angles: number[]
    /** Nodes a known angle has in sight (within SIGHT_RANGE): Ts stage out of them. */
    exposed: Uint8Array
    /** Pro T waiting spots. */
    stages: { node: number; site: SiteId; share: number }[]
}

const mapCache = new WeakMap<RoundMap, MapData>()

function mapData(map: RoundMap, zones: MapZones): MapData {
    let d = mapCache.get(map)
    if (d) return d
    const g = navGraphFor(map)
    const ids = [...zones.callouts.keys()].filter(z => z === "A" || z === "B" || map.routes.some(r => r.id === z) || map.holds.some(h => h.id === z))
    const pts = ids.map(z => zonePoint(map, z))
    const zoneOf: string[] = []
    for (let n = 0; n < g.size; n++) {
        let best = "A", bd = Infinity
        ids.forEach((z, k) => {
            const p = pts[k]
            if (!p || (p.floor ?? "upper") !== g.floor[n]) return
            const dd = (p.x - g.x[n]) ** 2 + (p.y - g.y[n]) ** 2
            if (dd < bd) { bd = dd; best = z }
        })
        zoneOf.push(best)
    }
    const chains = new Map<string, Chain>()
    for (const r of map.routes) {
        const nodes = g.routeNodes.get(r.id) ?? []
        const arc = [0]
        for (let i = 1; i < nodes.length; i++) arc.push(arc[i - 1] + g.dist(nodes[i - 1], nodes[i]))
        const cp = r.points[min(max(0, r.contactIndex), r.points.length - 1)]
        let ci = 0
        for (let i = 1; i < nodes.length; i++) if ((g.x[nodes[i]] - cp.x) ** 2 + (g.y[nodes[i]] - cp.y) ** 2 < (g.x[nodes[ci]] - cp.x) ** 2 + (g.y[nodes[ci]] - cp.y) ** 2) ci = i
        chains.set(r.id, { nodes, arc, ci })
    }
    const watch = new Map<number, XY>()
    for (const h of map.holds) { const n = g.holdNodes.get(h.id); if (n !== undefined) watch.set(n, h.watch) }
    const vis = visibilityFor(g)
    const angles = map.holds.filter(h => !h.pro || (h.share ?? 0) >= T.SIGHT_KNOWN_ANGLE).flatMap(h => {
        const n = g.holdNodes.get(h.id)
        return n === undefined ? [] : [n]
    })
    const exposed = new Uint8Array(g.size)
    for (const h of angles) for (let n = 0; n < g.size; n++) if (!exposed[n] && g.dist(n, h) <= T.SIGHT_RANGE && vis.seesFar(n, h)) exposed[n] = 1
    const stages = (map.stages ?? []).flatMap(s => {
        const node = g.stageNodes.get(s.id)
        return node === undefined ? [] : [{ node, site: s.site, share: s.share }]
    })
    d = { map, g, vis, zoneOf, chains, watch, angles, exposed, stages }
    mapCache.set(map, d)
    return d
}

/** Node of a route `back` map-% short of its contact point (negative: past it). */
function routeNode(D: MapData, routeId: string | undefined, back: number): number | undefined {
    const c = routeId ? D.chains.get(routeId) : undefined
    if (!c || !c.nodes.length) return undefined
    const want = c.arc[c.ci] - back
    let best = 0
    for (let i = 1; i < c.arc.length; i++) if (abs(c.arc[i] - want) < abs(c.arc[best] - want)) best = i
    return c.nodes[best]
}

/**
 * Staging node on a route: `back` map-% short of the contact point, moved
 * further back until no CT hold has it in sight (at most `limit` more).
 */
function stageNode(D: MapData, routeId: string | undefined, back: number, limit = 30): number | undefined {
    const c = routeId ? D.chains.get(routeId) : undefined
    if (!c || !c.nodes.length) return undefined
    const want = c.arc[c.ci] - back
    let i = 0
    for (let k = 1; k < c.arc.length; k++) if (abs(c.arc[k] - want) < abs(c.arc[i] - want)) i = k
    for (let k = i; k >= 0 && c.arc[i] - c.arc[k] <= limit; k--) if (!D.exposed[c.nodes[k]]) return c.nodes[k]
    return c.nodes[i]
}

/**
 * Waypoints along a route's own line up to `to` (a node on it), so a walk
 * from spawn follows the route instead of a shortcut across open ground.
 */
function alongRoute(D: MapData, routeId: string | undefined, from: number, to: number, at: number, pace: number): Way[] {
    const c = routeId ? D.chains.get(routeId) : undefined
    const end = c ? c.nodes.indexOf(to) : -1
    if (!c || end < 0) return []
    // Join the route at its node nearest to where we are.
    let k0 = 0
    for (let k = 1; k <= end; k++) if (D.g.dist(from, c.nodes[k]) < D.g.dist(from, c.nodes[k0])) k0 = k
    const out: Way[] = []
    let last = c.arc[k0]
    for (let k = k0; k < end; k++) if (k === k0 || c.arc[k] - last >= T.SIGHT_ROUTE_STEP) { out.push({ node: c.nodes[k], at, pace }); last = c.arc[k] }
    return out
}

/** Node on the walk from `from` to `to` about `back` (walking distance) short of `to`; `from` when already closer. */
function shortOf(g: NavGraph, from: number, to: number, back: number): number {
    const path = g.path(from, to)
    let acc = 0
    for (let i = path.length - 2; i >= 0; i--) {
        acc += g.cost(path[i], path[i + 1])
        if (acc >= back) return path[i]
    }
    return from
}

// ─── Bodies (movement and perception) ──────────────────────────────────────

interface Way {
    node: number
    /** Not before. */
    at: number
    pace: number
    look?: XY | null
}

interface Body {
    a: Actor
    /** Index in Ctx.bodies (and in the moves record). */
    k: number
    rec: number[]
    node: number
    spawn: number
    /** Current leg: full path, arrival times, index of the next node (0 = standing). */
    path: number[]
    at: number[]
    next: number
    /** Stop at the next node. */
    cut: boolean
    /** Time the body last stopped. */
    idle: number
    look: XY | null
    face: number
    queue: Way[]
    waitUntil: number
    busy: "" | "plant" | "defuse"
    busyUntil: number
    fights: number
    saving: boolean
    /** What the body is doing (behaviour tag; some situations read it). */
    task: string
    /** Time this body last killed someone (exposed for a moment). */
    killedAt: number
    /** Bodies this one killed, with the time. */
    victims: [number, number][]
}

interface Fight {
    t: Body
    c: Body
    t0: number
    at: number
    d: number
    tMoving: boolean
    cMoving: boolean
    tSettled: boolean
    cSettled: boolean
    done: boolean
}

interface Cloud { t0: number; t1: number; x: number; y: number; floor: string; r: number }
interface Fire extends Cloud { ct: boolean; by: Body }

interface Ctx {
    /** The execute's grenades are on their way. */
    utilThrown: boolean
    /** The tick being simulated (grenades land no earlier than its start). */
    now: number
    R: Round
    D: MapData
    g: NavGraph
    plan: PlanState
    bodies: Body[]
    Ts: Body[]
    CTs: Body[]
    lurker: Body | null
    fakers: Body[]
    aggressor: Body | null
    fights: Fight[]
    /** Pair key → time before which a sighting is not rolled again. */
    cool: Map<number, number>
    /** Pair key → in sight last tick. */
    seen: Set<number>
    smokes: Cloud[]
    fires: Fire[]
    jobs: { t: number; run: () => void }[]
    /** Site → time the CTs got the call. */
    called: Partial<Record<SiteId | "plant", number>>
    execAt: number
    executed: boolean
    plantNode: number
    plantStart: number
    planter: Body | null
    bombNode: number
    bombLog: number[]
    defuser: Body | null
    defuseEnd: number
    retakeAt: number
    retakeStarted: boolean
    tSaving: boolean
    ctSaving: boolean
    lastDeath: number
    end: RoundEnd | null
    /** Site centre nodes, A then B. */
    siteNode: [number, number]
}

const pairKey = (a: Body, b: Body) => a.k * 16 + b.k

function bodyXY(C: Ctx, b: Body, t: number): XY {
    const g = C.g
    if (b.next > 0 && b.next < b.path.length) {
        const i = b.next
        const t0 = b.at[i - 1], t1 = b.at[i]
        const u = t1 > t0 ? min(1, max(0, (t - t0) / (t1 - t0))) : 1
        const p = b.path[i - 1], q = b.path[i]
        return { x: g.x[p] + (g.x[q] - g.x[p]) * u, y: g.y[p] + (g.y[q] - g.y[p]) * u }
    }
    return { x: g.x[b.node], y: g.y[b.node] }
}

const bodyXY2 = (C: Ctx, b: Body, t: number): RPoint => ({ ...bodyXY(C, b, t), floor: C.g.floor[b.node] })

/** The node a body counts as standing on for sight (the nearer end of the edge it walks). */
function sightNode(b: Body, t: number): number {
    if (b.next > 0 && b.next < b.path.length) {
        const t0 = b.at[b.next - 1], t1 = b.at[b.next]
        return t - t0 > (t1 - t0) / 2 ? b.path[b.next] : b.path[b.next - 1]
    }
    return b.node
}

const moving = (b: Body) => b.next > 0 && b.next < b.path.length

function startLeg(C: Ctx, b: Body, t: number, to: number, pace: number): boolean {
    if (to === b.node || to < 0) return false
    const t0 = round(t * 100) / 100
    const path = C.g.path(b.node, to)
    if (path.length < 2) return false
    b.path = path
    b.at = arrivals(C.g, path, t0, pace)
    b.next = 1
    b.cut = false
    b.rec.push(round(t0 * 100), to, pace)
    const g = C.g
    b.face = atan2(g.y[path[1]] - g.y[path[0]], g.x[path[1]] - g.x[path[0]])
    return true
}

function endLeg(b: Body, walked: number, t: number): void {
    b.rec.push(walked)
    b.path = EMPTY
    b.at = EMPTY
    b.next = 0
    b.cut = false
    b.idle = t
}

/** Walk on to `t`: arrive at nodes, stop where the leg ends or was cut, wait at enemy fire. */
function advance(C: Ctx, b: Body, t: number): void {
    const g = C.g
    while (b.next > 0 && b.next < b.path.length && b.at[b.next] <= t) {
        const arr = b.at[b.next]
        b.node = b.path[b.next]
        b.next++
        if (b.next < b.path.length) {
            const nx = b.path[b.next]
            b.face = atan2(g.y[nx] - g.y[b.node], g.x[nx] - g.x[b.node])
            // Fire ahead: hold up until it burns out (a rush runs through and takes it).
            const fire = fireAt(C, nx, arr, !b.a.ct)
            if (fire && !(C.plan.strategy === "rush" || C.plan.ecoRush) && !b.saving) {
                endLeg(b, b.next - 1, arr)
                b.waitUntil = max(b.waitUntil, fire.t1)
                continue
            }
        }
        if (b.cut || b.next >= b.path.length) endLeg(b, b.next - 1, arr)
    }
}

/** Fire thrown by CTs (`byCT`) or Ts covering node `n` at `t`. */
function fireAt(C: Ctx, n: number, t: number, byCT: boolean): Fire | undefined {
    const g = C.g
    for (const f of C.fires) {
        if (t < f.t0 || t >= f.t1 || g.floor[n] !== f.floor || f.ct !== byCT) continue
        if ((g.x[n] - f.x) ** 2 + (g.y[n] - f.y) ** 2 <= f.r * f.r) return f
    }
    return undefined
}


/** Replace a body's waypoints; a walking body stops at its next node and picks them up. */
function setQueue(b: Body, ways: Way[]): void {
    b.queue = ways
    if (moving(b) && !(ways.length && ways[0].node === b.path[b.path.length - 1])) b.cut = true
}

function look(C: Ctx, b: Body, t: number): void {
    if (!b.look || moving(b)) return
    const g = C.g
    const dx = b.look.x - g.x[b.node], dy = b.look.y - g.y[b.node]
    if (dx * dx + dy * dy > 0.01) b.face = atan2(dy, dx)
    void t
}

/** Follow the waypoints: one leg at a time, not while fighting, busy or told to wait. */
function drive(C: Ctx, b: Body, t: number): void {
    if (!b.a.alive || moving(b) || b.fights > 0 || b.busyUntil > t || b.waitUntil > t) return
    while (b.queue.length && b.queue[0].node === b.node) {
        const w = b.queue.shift()!
        if (w.look !== undefined) b.look = w.look
        look(C, b, t)
    }
    const w = b.queue[0]
    if (!w || w.at > t) return
    if (!startLeg(C, b, t, w.node, w.pace)) b.queue.shift()
}

// ─── Fights ────────────────────────────────────────────────────────────────

function angleDiff(a: number, b: number): number {
    let d = (a - b) % (2 * PI)
    if (d > PI) d -= 2 * PI
    if (d < -PI) d += 2 * PI
    return abs(d)
}

/** Chance a fresh sighting at `d` map-% becomes a fight (pro contact → fight by distance). */
function engageChance(d: number): number {
    const e = T.SIGHT_ENGAGE
    return d <= 3 ? e[0] : d <= 6 ? e[1] : d <= 10 ? e[2] : d <= 15 ? e[3] : d <= 20 ? e[4] : e[5]
}

/** Seconds from sight to the kill: lognormal around the pro medians (longer up close). */
function killDelay(C: Ctx, d: number, key: number): number {
    const u1 = max(1e-6, keyedRoll(C.R, 11, key)), u2 = keyedRoll(C.R, 12, key)
    const z = sqrt(-2 * log(u1)) * cos(2 * PI * u2)
    const close = d < 4
    const med = close ? T.SIGHT_KILL_CLOSE : T.SIGHT_KILL_MEDIAN
    const sd = close ? T.SIGHT_KILL_SPREAD_CLOSE : T.SIGHT_KILL_SPREAD
    return min(4, 0.15 + (med - 0.15) * exp(sd * z))
}

/** Weapon against distance: pistols and SMGs fade at range, shotguns past close range, an AWP up close. */
function rangePts(a: Actor, d: number): number {
    switch (a.wc) {
        case "pistol": case "pistolB": return -max(0, d - 9) * T.SIGHT_RANGE_PISTOL
        case "deagle": return -max(0, d - 14) * T.SIGHT_RANGE_PISTOL
        case "smg": return -max(0, d - 11) * T.SIGHT_RANGE_SMG
        case "heavy": return -max(0, d - 5) * T.SIGHT_RANGE_SHOTGUN
        case "awp": case "scout": return d < 4 ? -T.AWP_PEEK : 0
        default: return 0
    }
}

function startFight(C: Ctx, tb: Body, cb: Body, t: number, d: number): void {
    const key = pairKey(tb, cb) + 4096 * (C.fights.length & 7)
    const f: Fight = {
        t: tb, c: cb, t0: t, at: t + killDelay(C, d, key), d,
        tMoving: moving(tb), cMoving: moving(cb),
        tSettled: !moving(tb) && t - tb.idle >= T.SIGHT_SETTLE, cSettled: !moving(cb) && t - cb.idle >= T.SIGHT_SETTLE,
        done: false,
    }
    C.fights.push(f)
    for (const b of [tb, cb]) {
        b.fights++
        if (moving(b)) b.cut = true
    }
}

/** Points one side of a fight brings beyond the duel's own (aim, weapon, armour, HP, numbers). */
function sidePts(C: Ctx, me: Body, foe: Body, f: Fight, t: number): number {
    const R = C.R
    const a = me.a
    const mine = me === f.t
    const isMoving = mine ? f.tMoving : f.cMoving
    const settled = mine ? f.tSettled : f.cSettled
    const foeMoving = mine ? f.cMoving : f.tMoving
    let s = commonPts(R, a) + openingPts(R, a, isMoving) + rangePts(a, f.d)
    const at = bodyXY(C, me, f.t0), them = bodyXY(C, foe, f.t0)
    // Facing them, or hearing them walk in.
    const aware = angleDiff(me.face, atan2(them.y - at.y, them.x - at.x)) <= T.SIGHT_AWARE || foeMoving && f.d <= T.SIGHT_HEAR
    // Others shooting at me from other angles.
    let cross = 0
    for (const g of C.fights) if (!g.done && g !== f && (g.t === me || g.c === me)) cross++
    if (me.busy) s -= T.SIGHT_BUSY
    else if (a.blindUntil > t) s -= T.BLIND
    else if (!aware) s -= T.SIGHT_BEHIND
    else if (settled) {
        s += holdPts(R, a, 0)
        if (isSniperClass(a.wc) && f.d < 4) s -= T.AWP_HOLD
        s -= min(2, cross) * T.CROSSFIRE
    } else s += peekPts(R, a, cross)
    // A chance meeting (both on the move): the T walks with intent, a scoped AWP fires first.
    if (isMoving && foeMoving) s += (a.ct ? 0 : T.CONTACT_T_EDGE) + (!R.firstKill && isSniperClass(a.wc) ? T.CONTACT_AWP_OPEN : 0)
    // Trading a teammate the foe just killed; exposed after my own kill.
    if (foe.victims.some(([, tk]) => t - tk <= T.SIGHT_TRADE_WINDOW)) s += tradePts(a) - T.TRADE + T.SIGHT_TRADE
    if (t - me.killedAt <= T.SIGHT_EXPOSED_SECONDS) s -= T.EXPOSED
    // A rush beats a defence that is not set; CTs who read it are waiting (G1: repeated playbook rushes).
    if (!a.ct && surpriseRush(C.plan) && !R.bomb.planted) s += T.RUSH_SPEED
    if (me.task === "push" && isMoving) s += T.PUSH_SURPRISE + (a.p.creativity - 50) * 0.05
    if (me.task === "lurk" && foe.task === "rotate") s += T.LURK + (a.p.creativity - 50) * T.LURK_CREATIVITY
    if (a.ct && C.retakeStarted && t > retakeDeadline(C) - 8) s -= T.RUSHED
    // Before the plant the CTs defend ground they know, after it the Ts do.
    if (a.ct && !R.bomb.planted) s += T.SIGHT_CT_DEFEND
    // Post-plant: the Ts sit on angles around the bomb, the CTs have to come to them.
    if (!a.ct && me.task === "post" && foe.task === "retake") s += T.SIGHT_POST
    if (a.p.traits & TRAIT_AGGRESSIVE && isMoving) s += 1
    return s
}

function resolveFight(C: Ctx, f: Fight): void {
    f.done = true
    const R = C.R
    const tb = f.t, cb = f.c
    tb.fights--
    cb.fights--
    if (!tb.a.alive || !cb.a.alive) return
    R.t = f.at
    const st = sidePts(C, tb, cb, f, f.at)
    const sc = sidePts(C, cb, tb, f, f.at)
    const vn = sightNode(tb, f.at)
    const zone = C.D.zoneOf[vn] ?? R.S.id
    const p = bodyXY(C, tb, f.at), q = bodyXY(C, cb, f.at)
    R.spotNext = { x: round((p.x + q.x) * 50) / 100, y: round((p.y + q.y) * 50) / 100, floor: C.g.floor[vn] }
    const w = duel(R, tb.a, cb.a, st, sc, zone)
    R.spotNext = undefined
    const wb = w === tb.a ? tb : cb
    const lb = wb === tb ? cb : tb
    wb.killedAt = f.at
    wb.victims.push([lb.k, f.at])
    died(C, lb, f.at)
}

/** Everything a death changes: the leg, other fights, the bomb, the calls and saves. */
function died(C: Ctx, b: Body, t: number): void {
    const R = C.R
    C.lastDeath = t
    if (moving(b)) endLeg(b, b.next, t)
    for (const f of C.fights) if (!f.done && (f.t === b || f.c === b)) {
        f.done = true
        f.t.fights--
        f.c.fights--
    }
    b.fights = 0
    b.queue = []
    if (!b.a.ct) {
        if (R.bomb.carrier === null && !R.bomb.planted && C.bombLog[C.bombLog.length - 2] === b.k) dropBomb(C, b.node, t)
        if (C.planter === b && b.busy === "plant") C.planter = null
    } else {
        if (C.defuser === b) { C.defuser = null; C.defuseEnd = Infinity }
        // A CT dying on a site is the call for that site.
        for (const s of ["A", "B"] as const) if (C.g.dist(b.node, C.g.siteNodes[s]) <= T.SIGHT_SITE_CORE + 2) call(C, s, t)
    }
    b.busy = ""
    b.busyUntil = 0
    afterDeath(C, b.a.ct, t)
}

function dropBomb(C: Ctx, node: number, t: number): void {
    C.bombNode = node
    C.bombLog.push(round(t * 100), -1, node)
}

/** Sightings this tick: new ones may become fights (or one side backs off). */
function sightings(C: Ctx, t: number): void {
    const { g, D } = C
    const vis = D.vis
    const R = C.R
    const seenNow = new Set<number>()
    const spotted = [0, 0]
    for (const tb of C.Ts) {
        if (!tb.a.alive) continue
        const tn = sightNode(tb, t)
        for (const cb of C.CTs) {
            if (!cb.a.alive) continue
            const cn = sightNode(cb, t)
            if (g.floor[tn] !== g.floor[cn]) continue
            const d = g.dist(tn, cn)
            // A smoke between them hides them, unless they are close enough to hear and spray through it.
            if (d > T.SIGHT_RANGE || !vis.seesFar(tn, cn) || d > T.SIGHT_SMOKE_NEAR && smoked(C, tn, cn, t)) continue
            const key = pairKey(tb, cb)
            seenNow.add(key)
            for (let s = 0; s < 2; s++) {
                // Same floor only: on Nuke the two sites sit almost on top of each other.
                if (g.floor[tn] !== g.floor[C.siteNode[s]]) continue
                const dc = g.dist(tn, C.siteNode[s])
                if (dc <= T.SIGHT_SITE_RADIUS) spotted[s] |= 1 << tb.k
                if (dc <= T.SIGHT_SITE_CORE) spotted[s] |= 1 << 12
            }
            if (C.fights.some(f => !f.done && f.t === tb && f.c === cb)) continue
            if ((C.cool.get(key) ?? -1) > t) continue
            let p = engageChance(d)
            if (tb.saving || cb.saving) p *= T.SIGHT_SAVE_ENGAGE
            if (keyedRoll(R, 13, key) < p) startFight(C, tb, cb, t, d)
            else {
                C.cool.set(key, t + T.SIGHT_RECHECK)
                // Too close to stand and look: whoever walked into it backs off.
                if (d <= T.SIGHT_CLOSE) backOff(C, moving(tb) || !moving(cb) && keyedRoll(R, 14, key) < 0.5 ? tb : cb, t)
            }
        }
    }
    C.seen = seenNow
    // Three Ts near a site (or one on it) seen by a CT: the call for that site.
    for (let s = 0; s < 2; s++) {
        const bits = spotted[s]
        if (!bits) continue
        let n = 0
        for (let k = 0; k < 12; k++) if (bits & (1 << k)) n++
        if (n >= T.SIGHT_CALL_SEEN || bits & (1 << 12)) call(C, s ? "B" : "A", t)
    }
}

function smoked(C: Ctx, a: number, b: number, t: number): boolean {
    if (!C.smokes.length) return false
    const g = C.g
    const pa = { x: g.x[a], y: g.y[a], floor: g.floor[a] }, pb = { x: g.x[b], y: g.y[b] }
    for (const s of C.smokes) {
        if (t < s.t0 || t >= s.t1 || s.floor !== g.floor[a]) continue
        if (segmentHitsCircle(pa, pb, s, s.r)) return true
    }
    return false
}

/** A body that lets a close sighting pass steps back out of sight and waits a moment. */
function backOff(C: Ctx, b: Body, t: number): void {
    if (b.busy || b.fights > 0) return
    const g = C.g
    let back = b.node
    if (moving(b)) back = b.path[max(0, b.next - 2)]
    else {
        const nb = g.neighbors(b.node)
        const home = g.distancesTo(b.spawn)
        for (const n of nb) if (home[n] < home[back]) back = n
    }
    b.queue.unshift({ node: back, at: t, pace: RUN })
    if (moving(b)) b.cut = true
    b.waitUntil = max(b.waitUntil, t + T.SIGHT_BACKOFF)
}


// ─── Utility ───────────────────────────────────────────────────────────────

function spotOf(C: Ctx, id: string | undefined): (RPoint & { radius: number }) | undefined {
    if (!id) return undefined
    const u = C.D.map.utility.find(x => x.id === id)
    return u ? { ...u.at, radius: u.radius } : undefined
}

function record(C: Ctx, b: Body, kind: UtilityKind, site: SiteId, t: number, spot: string, at?: RPoint): UtilityThrow {
    // Rounded down: a grenade never shows after a death it came before.
    const e: UtilityThrow = { t: max(0.5, floor(t * 10 + 1e-6) / 10), playerId: b.a.id, kind, spot, site }
    if (at) e.at = { x: round(at.x * 100) / 100, y: round(at.y * 100) / 100, floor: at.floor }
    C.R.utility.push(e)
    b.a.used.push(kind)
    b.a[kind]--
    return e
}

/** A grenade of `kind` lands at `p` (thrown by `b` at `t`); its effect on the map. */
function land(C: Ctx, b: Body, kind: UtilityKind, site: SiteId, at: number, spot: string, p: RPoint, r: number): void {
    if (!b.a.alive || b.a[kind] <= 0) return
    // A grenade scheduled before this tick lands at the tick's start (positions are known from there on).
    const t = max(at, C.now - DT)
    const g = C.g
    const R = C.R
    const e = record(C, b, kind, site, t, spot, spot ? undefined : p)
    const foes = (b.a.ct ? C.Ts : C.CTs).filter(x => x.a.alive)
    const pn = g.nearest(p)
    if (kind === "smoke") C.smokes.push({ t0: t + 0.6, t1: t + 18, x: p.x, y: p.y, floor: p.floor, r: max(1.6, r) })
    else if (kind === "molotov") {
        const f: Fire = { t0: t + 0.4, t1: t + 7, x: p.x, y: p.y, floor: p.floor, r: max(1.4, r), ct: b.a.ct, by: b }
        C.fires.push(f)
        for (const x of foes) {
            const xp = bodyXY(C, x, t)
            if (g.floor[sightNode(x, t)] !== p.floor || (xp.x - p.x) ** 2 + (xp.y - p.y) ** 2 > f.r * f.r) continue
            // The burn is recorded on someone not already in a gunfight (they live past it).
            if (!e.hit && x.fights === 0) hurtBy(e, b.a, x.a, 6 + floor(rnd(R, P.util).next() * 16))
            x.a.flushed = true
            // Out of the fire: one step back toward their own spawn.
            backOff(C, x, t)
        }
    } else if (kind === "he") {
        // The one it hurts most (one recorded victim per grenade).
        let best: Body | null = null, bestDmg = 0
        for (const x of foes) {
            if (g.floor[sightNode(x, t)] !== p.floor) continue
            const xp = bodyXY(C, x, t)
            const dmg = heDamage({ distance: sqrt((xp.x - p.x) ** 2 + (xp.y - p.y) ** 2), armoured: x.a.kevlar, obstructed: !C.D.vis.seesFar(pn, x.node) })
            if (dmg > bestDmg) { best = x; bestDmg = dmg }
        }
        if (best) hurtBy(e, b.a, best.a, bestDmg)
    } else if (kind === "flash") {
        for (const x of foes) {
            if (g.floor[sightNode(x, t)] !== p.floor || g.dist(x.node, pn) > T.SIGHT_FLASH_RANGE || !C.D.vis.seesFar(pn, x.node)) continue
            const facing = angleDiff(x.face, atan2(p.y - g.y[x.node], p.x - g.x[x.node])) <= PI / 2
            if (!facing) continue
            if (rnd(R, P.util).next() < T.FLASH_BASE + T.FLASH_PER_GRENADES * b.a.p.grenades + T.SIGHT_FLASH_BONUS) {
                x.a.blindUntil = max(x.a.blindUntil, t + 1.6 + rnd(R, P.util).next())
                x.a.blindBy = b.a.i
            }
        }
    }
}

/** HE at a target: lands off it by the thrower's landing error. */
function heAt(C: Ctx, b: Body, site: SiteId, t: number, target: Body): void {
    const g = C.g
    const R = C.R
    const tp = bodyXY(C, target, t)
    const dist = heLandingDistance(rnd(R, P.util).next(), b.a.p.grenades)
    const ang = rnd(R, P.util).next() * 2 * PI
    const n = g.nearest({ x: tp.x + cos(ang) * dist, y: tp.y + sin(ang) * dist, floor: g.floor[target.node] })
    land(C, b, "he", site, t, "", g.point(n), HE_DAMAGE_RADIUS)
}

function utilSpot(C: Ctx, site: SiteId, side: "T" | "CT", kind: UtilityKind, k: number): { id: string; p: RPoint; r: number } | undefined {
    const ids = C.R.z.sites[site].util[side][kind]
    if (!ids.length) return undefined
    const id = ids[k % ids.length]
    const s = spotOf(C, id)
    return s ? { id, p: { x: s.x, y: s.y, floor: s.floor }, r: s.radius } : undefined
}

/** The T execute utility on site S, thrown from where the hitters stand (alive at the throw). */
const hittersOf = (C: Ctx) => C.Ts.filter(b => b.a.alive && b.a.job !== "lurk" && b.a.job !== "fake" && !b.saving)

/** The hit's grenades, timed onto the execute at `t` (smokes from 4 s before). */
function executeUtility(C: Ctx, hitters: Body[], t: number): void {
    C.utilThrown = true
    const R = C.R
    const S = R.S.id
    const st = C.plan.strategy
    const maxSmokes = st === "execute" ? 3 : st === "rush" || st === "eco" ? 0 : 2
    const maxFlashes = st === "execute" ? 4 : st === "rush" || st === "eco" ? 1 : 2
    const throwers = [...hitters].sort((a, b) => (b.a.job === "support" ? 1 : 0) - (a.a.job === "support" ? 1 : 0) || b.a.p.grenades - a.a.p.grenades)
    const defenders = () => C.CTs.filter(c => c.a.alive && c.a.post === S)
    let smokes = 0
    for (const b of throwers) {
        if (smokes >= maxSmokes || b.a.smoke <= 0) continue
        const s = utilSpot(C, S, "T", "smoke", smokes)
        if (!s) break
        const k = smokes++
        C.jobs.push({ t: t - 4 + 0.3 * k, run: () => land(C, b, "smoke", S, t - 4 + 0.3 * k, s.id, s.p, s.r) })
    }
    let molly: Body | null = null
    for (const b of throwers) {
        if (b.a.molotov <= 0 || st === "rush") continue
        molly = b
        const s = utilSpot(C, S, "T", "molotov", 0)
        // On a defender's spot when one holds the site, else the baked spot.
        C.jobs.push({
            t: t - 2.5, run: () => {
                const d = defenders()
                const target = d.length ? d[floor(rnd(R, P.util).next() * d.length)] : null
                const p = target ? C.g.point(target.node) : s?.p
                if (p) land(C, b, "molotov", S, t - 2.5, target ? "" : s!.id, p, target ? 1.6 : s?.r ?? 1.6)
            },
        })
        break
    }
    // The HE from someone else than the molotov when anyone else has one.
    const heFirst = [...throwers].sort((a, b) => (a === molly ? 1 : 0) - (b === molly ? 1 : 0))
    for (const b of heFirst) {
        if (b.a.he <= 0 || st === "rush" && rnd(R, P.util).next() < 0.5) continue
        C.jobs.push({
            t: t - 1.5, run: () => {
                const d = defenders()
                if (d.length) heAt(C, b, S, t - 1.5, d[floor(rnd(R, P.util).next() * d.length)])
            },
        })
        break
    }
    let flashes = 0
    for (const b of throwers) {
        for (let n = 0; n < b.a.flash && flashes < maxFlashes; n++) {
            const k = flashes++
            const s = utilSpot(C, S, "T", "flash", k)
            const p = s?.p ?? C.g.point(C.g.siteNodes[S])
            C.jobs.push({ t: t - 0.8 + 0.25 * k, run: () => land(C, b, "flash", S, t - 0.8 + 0.25 * k, s?.id ?? "", p, 2) })
        }
    }
}

/** CT utility at the entrance once the site gets the call. */
function entranceUtility(C: Ctx, site: SiteId, t: number): void {
    const R = C.R
    const g = C.g
    const ts = C.Ts.filter(x => x.a.alive && g.dist(x.node, g.siteNodes[site]) <= T.SIGHT_SITE_RADIUS + 8)
    if (!ts.length) return
    let k = 0
    for (const b of C.CTs) {
        if (!b.a.alive || b.a.post !== site || b.saving) continue
        const lead = ts[0]
        const at = t + 0.5 + 0.4 * k++
        // A rush is on them before a molotov lands, unless they read it and wait with one.
        if (b.a.molotov > 0 && (C.plan.strategy !== "rush" || C.plan.readCall)) {
            C.jobs.push({ t: at, run: () => { if (lead.a.alive) land(C, b, "molotov", site, at, "", g.point(lead.node), 1.6) } })
        } else if (b.a.he > 0 && rnd(R, P.util).next() < 0.6) {
            C.jobs.push({ t: at, run: () => { if (lead.a.alive) heAt(C, b, site, at, lead) } })
        } else if (b.a.flash > 0 && rnd(R, P.util).next() < 0.6) {
            C.jobs.push({ t: at, run: () => { if (lead.a.alive) land(C, b, "flash", site, at, "", bodyXY2(C, lead, at), 2) } })
        } else if (b.a.smoke > 0 && rnd(R, P.util).next() < 0.5) {
            const s = utilSpot(C, site, "CT", "smoke", 0)
            if (s) C.jobs.push({ t: at, run: () => land(C, b, "smoke", site, at, s.id, s.p, s.r) })
        }
    }
}

/** Retake utility on the bomb: flashes blind holders who face them, a molotov flushes one, a smoke cuts a line. */
function retakeUtility(C: Ctx, t: number): void {
    const R = C.R
    const g = C.g
    const S = R.S.id
    let flashes = 0
    for (const b of C.CTs) {
        if (!b.a.alive || b.saving) continue
        if (b.a.smoke > 0) {
            const s = utilSpot(C, S, "CT", "smoke", 0)
            if (s) land(C, b, "smoke", S, t, s.id, s.p, s.r)
        }
        if (b.a.molotov > 0) {
            const hs = C.Ts.filter(x => x.a.alive && g.dist(x.node, C.bombNode) <= 13)
            if (hs.length) land(C, b, "molotov", S, t, "", g.point(hs[floor(rnd(R, P.retakeUtil).next() * hs.length)].node), 1.6)
        }
        for (let n = 0; n < b.a.flash && flashes < 3; n++) {
            const k = flashes++
            const at = t + 0.3 * k
            C.jobs.push({ t: at, run: () => land(C, b, "flash", S, at, "", g.point(C.bombNode), 2) })
        }
    }
}

// ─── Plan on the map ───────────────────────────────────────────────────────

/** Distinct nodes on a site, deepest (farthest from `from`) first. */
function siteSpots(C: Ctx, site: SiteId, from: number, count: number, taken: number[] = []): number[] {
    const g = C.g
    const c = g.siteNodes[site]
    const pool = [...new Set([...g.plantNodes[site], ...g.around(c, 7)])].filter(n => g.floor[n] === g.floor[c])
    pool.sort((a, b) => g.pathDist(from, b) - g.pathDist(from, a) || a - b)
    const out: number[] = []
    for (const gap of [3, 2, 0]) for (const n of pool) {
        if (out.length >= count) return out
        if (out.includes(n) || [...taken, ...out].some(m => g.dist(m, n) < gap)) continue
        out.push(n)
    }
    while (out.length < count) out.push(c)
    return out
}

/** Post-plant spots 4–12 from the bomb, holds first. */
function postSpots(C: Ctx, count: number): number[] {
    const g = C.g
    const bomb = C.bombNode
    const holds = new Set(C.D.map.holds.filter(h => h.site === C.R.S.id).map(h => g.holdNodes.get(h.id)))
    const pool = g.around(bomb, 12).filter(n => g.dist(n, bomb) >= 4)
        .map(n => ({ n, s: abs(g.dist(n, bomb) - 8) - (holds.has(n) ? 3 : 0) + rnd(C.R, P.retake).next() * 2 }))
        .sort((a, b) => a.s - b.s)
    const out: number[] = []
    for (const gap of [3, 2]) for (const { n } of pool) {
        if (out.length >= count) return out
        if (!out.includes(n) && out.every(m => g.dist(m, n) >= gap)) out.push(n)
    }
    while (out.length < count) out.push(bomb)
    return out
}

const ahead = (C: Ctx, routeId: string | undefined, back: number): XY | null => {
    const n = routeNode(C.D, routeId, back)
    return n === undefined ? null : C.g.point(n)
}

/** Opening moves: holds, staging, map control, the AWP angle, a CT push. */
function opening(C: Ctx): void {
    const { R, g, plan } = C
    const S = R.S, O = R.O
    const st = plan.strategy
    const rush = st === "rush" || plan.ecoRush
    // CTs to their posts.
    for (const b of C.CTs) {
        const hold = g.holdNodes.get(b.a.zone)
        const node = hold ?? g.siteNodes[(b.a.post === "B" ? "B" : "A")]
        b.task = "hold"
        b.queue = [{ node, at: 0, pace: RUN, look: C.D.watch.get(node) ?? g.point(g.siteNodes[b.a.post === "B" ? "B" : "A"]) }]
    }
    // Ts: routes per job.
    const mainId = S.main.id, altId = S.alt.id, splitId = S.split.id
    const lurkId = R.z.lurk[O.id]?.id ?? O.main.id
    const spots = siteSpots(C, S.id, routeNode(C.D, mainId, 0) ?? g.siteNodes[S.id], C.Ts.length + 1, [C.plantNode])
    let spot = 0, split = 0
    const taken = new Set<number>()
    const order: Record<string, number> = { entry: 0, pack: 1, support: 2, igl: 3, fake: 4, awp: 5, lurk: 6 }
    const ts = [...C.Ts].sort((a, b) => (order[a.a.job] ?? 3) - (order[b.a.job] ?? 3) || a.k - b.k)
    ts.forEach((b, i) => {
        const job = b.a.job
        let route = mainId
        if (job === "awp" && st !== "rush") route = altId
        if (st === "split" && job !== "entry" && b !== C.planter && (job === "awp" || split < 2)) { route = splitId; split++ }
        b.task = job === "lurk" ? "lurk" : job === "fake" ? "fake" : "stage"
        const leave = 0.9 * i
        const target = b === C.planter ? C.plantNode : spots[spot++]
        if (rush) {
            b.task = "exec"
            b.queue = [{ node: target, at: leave * 0.6, pace: RUN, look: g.point(g.siteNodes[S.id]) }]
            return
        }
        if (job === "lurk") {
            const n = stageNode(C.D, lurkId, 3) ?? g.siteNodes[O.id]
            b.queue = waitOn(C, lurkId, b.node, n, O.id, taken, leave, ahead(C, lurkId, -6))
            return
        }
        if (job === "fake") {
            const n = stageNode(C.D, O.main.id, 6) ?? g.siteNodes[O.id]
            b.queue = waitOn(C, O.main.id, b.node, n, O.id, taken, leave, ahead(C, O.main.id, -6))
            return
        }
        const back = job === "awp" ? 3 : st === "default" ? T.SIGHT_STAGE_DEFAULT + 3 * (i % 3) : st === "eco" ? 8 : 5 + 2 * (i % 3)
        const n = (job === "awp" ? routeNode(C.D, route, back) : stageNode(C.D, route, back)) ?? g.siteNodes[S.id]
        b.queue = job === "awp"
            ? [...alongRoute(C.D, route, b.node, n, leave, WALK), { node: n, at: leave, pace: WALK, look: ahead(C, route, back - 8) }]
            : waitOn(C, route, b.node, n, S.id, taken, leave, ahead(C, route, back - 8))
        ;(b as Body & { route?: string; target?: number }).route = route
        ;(b as Body & { route?: string; target?: number }).target = target
    })
    if (rush) {
        C.executed = true
        executeUtility(C, ts, plan.execAt)
        return
    }
    crossSmokes(C)
    earlyPlays(C)
}

/**
 * The walk out to a stage: along the route to `n`, or, when a pro waiting
 * spot for that site is free within SIGHT_STAGE_SPREAD of it and out of the
 * known angles, along the route to the point nearest that spot and on to it
 * (pros spread over the waiting spots instead of queueing on one line).
 */
function waitOn(C: Ctx, routeId: string, from: number, n: number, site: SiteId, taken: Set<number>, leave: number, look: XY | null): Way[] {
    const { g, D } = C
    const free = D.stages.filter(s => s.site === site && !taken.has(s.node) && !D.exposed[s.node] && g.pathDist(n, s.node) <= T.SIGHT_STAGE_SPREAD)
    const chain = D.chains.get(routeId)
    if (!free.length) {
        // No waiting spot free: the route node, or the first one back from it a mate is not already on.
        const back = chain ? chain.nodes.slice(0, chain.nodes.indexOf(n) + 1).reverse() : []
        const at = taken.has(n) ? back.find(c => !taken.has(c)) ?? n : n
        taken.add(at)
        return [...alongRoute(D, routeId, from, at, leave, WALK), { node: at, at: leave, pace: WALK, look }]
    }
    const pick = pickWeighted(rnd(C.R, P.spots), free, s => s.share).node
    taken.add(pick)
    const upTo = chain ? chain.nodes.slice(0, chain.nodes.indexOf(n) + 1) : []
    let via = n
    for (const c of upTo) if (g.pathDist(c, pick) < g.pathDist(via, pick)) via = c
    return [...alongRoute(D, routeId, from, via, leave, WALK), { node: pick, at: leave, pace: WALK, look }]
}

/**
 * Where a T's walk out crosses a CT hold's sight, the Ts smoke the crossing
 * off (pros smoke the mid cross and the long-range angles on the way out).
 * One smoke per watched crossing, from the crossing T or a mate, while smokes last.
 */
function crossSmokes(C: Ctx): void {
    const { g, D, R } = C
    const crossed = new Map<number, { t: number; n: number; by: Body }>()
    for (const b of C.Ts) {
        let node = b.node, t = 0
        for (const w of b.queue) {
            const path = g.path(node, w.node)
            if (path.length < 2) continue
            const at = arrivals(g, path, max(t, w.at), w.pace)
            for (let i = 1; i < path.length; i++) {
                const n = path[i]
                if (!D.exposed[n]) continue
                for (const h of D.angles) {
                    if (g.floor[h] !== g.floor[n] || g.dist(n, h) > T.SIGHT_RANGE || g.dist(n, h) < T.SIGHT_CLOSE || !D.vis.seesFar(n, h)) continue
                    const prev = crossed.get(h)
                    if (!prev || at[i] < prev.t) crossed.set(h, { t: at[i], n, by: b })
                }
            }
            node = path[path.length - 1]
            t = at[at.length - 1]
        }
    }
    let left = T.SIGHT_CROSS_SMOKES
    for (const [h, c] of [...crossed].sort((a, b) => a[1].t - b[1].t)) {
        if (left <= 0) break
        const thrower = c.by.a.smoke > 0 ? c.by : C.Ts.find(x => x.a.smoke > 0 && x !== C.planter)
        if (!thrower || c.t < 4) continue
        left--
        const tt = c.t - 2.5
        const p = { x: g.x[c.n] + (g.x[h] - g.x[c.n]) * 0.3, y: g.y[c.n] + (g.y[h] - g.y[c.n]) * 0.3, floor: g.floor[c.n] }
        C.jobs.push({ t: tt, run: () => land(C, thrower, "smoke", R.S.id, tt, "", p, 2.5) })
    }
}

type Staged = Body & { route?: string; target?: number }

function earlyPlays(C: Ctx): void {
    const { R, g, plan } = C
    const st = plan.strategy
    const z = R.z
    // Mid control: a T and a mate walk at the mid CT.
    const pMid = (st === "execute" ? 0.25 : st === "eco" ? (plan.ecoRush ? 0.05 : 0.4) : 0.5) * T.SIGHT_MID_SCALE
    const midCT = C.CTs.find(b => b.a.post === "mid" && b !== C.aggressor)
    const midNode = midCT ? g.holdNodes.get(midCT.a.zone) : undefined
    if (midCT && midNode !== undefined && rnd(R, P.early).bool(pMid)) {
        const at = z.midTime + rnd(R, P.early).range(T.SIGHT_MID_DELAY[0], T.SIGHT_MID_DELAY[1])
        const pool = C.Ts.filter(b => b.a.job !== "lurk" && b.a.job !== "fake" && b !== C.planter)
        const taker = (rnd(R, P.early).bool(0.35) ? pool.find(b => b.a.job === "entry") : undefined) ?? pool[rnd(R, P.early).int(0, max(0, pool.length - 1))]
        const mate = pool.find(b => b !== taker && b.a.job !== "awp")
        for (const b of [taker, mate]) {
            if (!b) continue
            const from = (b as Staged).target ?? b.spawn
            const n = shortOf(g, g.spawnNodes.T[0] ?? from, midNode, b === taker ? T.SIGHT_MID_BACK : T.SIGHT_MID_BACK + 4)
            const back = b.queue[b.queue.length - 1]
            b.task = "mid"
            b.queue = [{ node: n, at: at + (b === mate ? 0.9 : 0), pace: RUN, look: g.point(midNode) }, ...(back ? [{ ...back, at: at + T.SIGHT_MID_HOLD }] : [])]
        }
    }
    // A CT peeks the T AWPer's angle.
    const tAwp = C.Ts.find(b => isSniperClass(b.a.wc))
    const pAwp = st === "default" ? 0.55 : st === "split" || st === "fake" ? 0.4 : st === "execute" ? 0.2 : 0
    if (tAwp && rnd(R, P.early).bool(pAwp)) {
        const peeker = C.CTs.find(b => b.a.post !== "mid" && !isSniperClass(b.a.wc) && b !== C.aggressor)
        const awpSpot = tAwp.queue[tAwp.queue.length - 1]?.node
        if (peeker && awpSpot !== undefined) {
            const at = rnd(R, P.early).range(T.SIGHT_PEEK_AT[0], T.SIGHT_PEEK_AT[1])
            const hold = peeker.queue[0]
            C.jobs.push({
                t: at, run: () => {
                    if (!peeker.a.alive || C.executed || peeker.task !== "hold") return
                    const n = shortOf(g, peeker.node, awpSpot, T.SIGHT_PEEK_BACK)
                    peeker.task = "peek"
                    setQueue(peeker, [{ node: n, at, pace: RUN, look: g.point(awpSpot) }, ...(hold ? [{ ...hold, at: at + 3 }] : [])])
                    C.jobs.push({ t: at + 3, run: () => { if (peeker.task === "peek") peeker.task = "hold" } })
                },
            })
        }
    }
    // An aggressive CT walks up a T route.
    const ag = C.aggressor
    if (ag) {
        const into = rnd(R, P.early).bool(0.5) ? R.S : R.O
        const n = routeNode(C.D, into.main.id, rnd(R, P.early).range(4, 10))
        const until = min(into.main.contactTime + 4, rnd(R, P.early).range(14, 24))
        const hold = ag.queue[0]
        if (n !== undefined) {
            ag.task = "push"
            ag.queue = [{ node: n, at: 0, pace: RUN, look: ahead(C, into.main.id, 16) }, ...(hold ? [{ ...hold, at: until }] : [])]
            C.jobs.push({ t: until, run: () => { if (ag.task === "push") ag.task = "hold" } })
        }
    }
}

/** The execute: hitters walk in from their staging spots, utility goes in just before. */
function execute(C: Ctx, t: number): void {
    if (C.executed) return
    C.executed = true
    const { g, R } = C
    const S = R.S
    const hitters = hittersOf(C)
    if (!C.utilThrown) executeUtility(C, hitters, t)
    const spots = siteSpots(C, S.id, routeNode(C.D, S.main.id, 0) ?? g.siteNodes[S.id], C.Ts.length + 1, [C.plantNode])
    let k = 0
    // Entries first, the bomb behind them, the AWP last.
    const rank = (b: Body) => (b.a.job === "awp" ? 3 : b === C.planter ? (hitters.length > 2 ? 2 : 1) : b.a.job === "entry" ? 0 : 1)
    hitters.sort((a, b) => rank(a) - rank(b)).forEach((b, i) => {
        const st = b as Staged
        const target = b === C.planter ? C.plantNode : st.target ?? spots[k++]
        b.task = "exec"
        const ways: Way[] = []
        if (b.a.job === "awp") {
            const n = routeNode(C.D, st.route, 0)
            if (n !== undefined) ways.push({ node: n, at: t + 0.9 * i, pace: WALK, look: g.point(g.siteNodes[S.id]) })
        }
        ways.push({ node: target, at: t + 0.9 * i, pace: RUN, look: g.point(g.spawnNodes.CT[0] ?? g.siteNodes[S.id]) })
        setQueue(b, ways)
    })
    // The lurker cuts the rotation from the other site.
    const lk = C.lurker
    if (lk?.a.alive && !lk.saving) {
        const rot = C.D.map.routes.find(r => r.kind === "rotate" && r.site === S.id && r.from === R.O.id)
        const c = rot ? C.D.chains.get(rot.id) : undefined
        if (c && c.nodes.length) {
            const n = c.nodes[floor(c.nodes.length * 0.45)]
            setQueue(lk, [{ node: n, at: t + rnd(R, P.lurk).range(1, 4), pace: WALK, look: g.point(g.siteNodes[R.O.id]) }])
        }
    }
    // Fakers come over late.
    for (const f of C.fakers) if (f.a.alive && !f.saving) {
        f.task = "exec"
        setQueue(f, [{ node: spots[k++ % spots.length], at: t + 1, pace: RUN, look: g.point(g.siteNodes[S.id]) }])
    }
}

/** The fake: utility on the other site; the CTs may bite. */
function fake(C: Ctx, t: number): void {
    const { R } = C
    const O = R.O.id
    let k = 0
    for (const f of C.fakers) {
        if (!f.a.alive) continue
        for (const kind of ["smoke", "flash", "molotov"] as const) {
            if (f.a[kind] <= 0) continue
            const s = utilSpot(C, O, "T", kind, k)
            const at = t + 0.5 * k++
            if (s) C.jobs.push({ t: at, run: () => land(C, f, kind, O, at, s.id, s.p, s.r) })
        }
    }
    const bite = max(0.25, min(0.8, 0.55 + (C.plan.read === "right" ? -0.25 : C.plan.read === "wrong" ? 0.15 : 0)))
    if (rnd(R, P.flow).bool(bite)) {
        const mover = C.CTs.find(b => b.a.alive && b.a.post === "mid") ?? C.CTs.find(b => b.a.alive && b.a.post === R.S.id)
        const at = t + rnd(R, P.flow).range(1, 3)
        if (mover) C.jobs.push({ t: at, run: () => rotate(C, mover, O, at) })
    }
}

/** The CTs get the call for a site: the others rotate (one far anchor may stay), the site throws its utility. */
function call(C: Ctx, site: SiteId, t: number): void {
    if (C.called[site] !== undefined || C.called.plant !== undefined) return
    C.called[site] = t
    const R = C.R
    if (site === R.S.id) entranceUtility(C, site, t)
    const info = rnd(R, P.flow).range(T.ROTATE_INFO[0], T.ROTATE_INFO[1])
    let anchorStays = false
    const lurkAlive = !!C.lurker?.a.alive
    for (const b of C.CTs) {
        if (!b.a.alive || b.saving || b.a.post === site) continue
        if (b.a.post !== "mid" && !anchorStays && (lurkAlive || rnd(R, P.flow).bool(0.35))) { anchorStays = true; continue }
        const delay = max(0.3, info + (b.a.post === "mid" ? 0 : 0.8))
        C.jobs.push({ t: t + delay, run: () => rotate(C, b, site, t + delay) })
    }
}

function rotate(C: Ctx, b: Body, site: SiteId, t: number): void {
    if (!b.a.alive || b.saving || C.called.plant !== undefined) return
    const g = C.g
    const center = g.siteNodes[site]
    const stage = shortOf(g, b.node, center, T.SIGHT_ROTATE_STAGE)
    b.a.post = site
    b.task = "rotate"
    const spot = siteSpots(C, site, stage, 1, C.CTs.filter(x => x !== b && x.a.alive).map(x => x.node))[0]
    setQueue(b, [
        { node: stage, at: t, pace: RUN, look: g.point(center) },
        { node: spot, at: t + T.SIGHT_ROTATE_WAIT, pace: RUN, look: g.point(center) },
    ])
    C.jobs.push({ t: t + 15, run: () => { if (b.task === "rotate") b.task = "hold" } })
    // On the way in: a site already lost is played as a retake from the stage.
    const atStage = t + g.pathDist(b.node, stage) / (g.map.runSpeed * PACES[RUN]) + T.SIGHT_ROTATE_WAIT - 0.5
    C.jobs.push({
        t: atStage, run: () => {
            if (!b.a.alive || b.task !== "rotate" || C.R.bomb.planted) return
            const near = (x: Body) => x.a.alive && g.dist(x.node, center) <= T.SIGHT_SITE_RADIUS + 3
            const ts = C.Ts.filter(near).length, cts = C.CTs.filter(x => x !== b && near(x) && !x.saving).length
            if (ts >= cts + T.SIGHT_LOST_SITE) b.queue = b.queue.filter(w => w.node === stage)
        },
    })
}

/** The bomb is down: Ts to post-plant spots, CTs regroup for the retake (or save). */
function planted(C: Ctx, t: number): void {
    const { R, g } = C
    const p = C.planter!
    R.bomb.planted = true
    R.bomb.plantT = t
    R.bomb.planter = p.a
    R.bomb.carrier = null
    C.called.plant = t
    C.bombNode = p.node
    C.bombLog.push(round(t * 100), -1, p.node)
    const pt = g.point(p.node)
    R.events.push({ type: "PLANT", time: r1(t), side: "t", playerId: p.a.id, site: R.S.id, location: R.S.callout, zone: R.S.id, details: "Bomb has been planted", spot: { x: round(pt.x * 100) / 100, y: round(pt.y * 100) / 100, floor: pt.floor } })
    p.busy = ""
    p.busyUntil = 0
    const ts = C.Ts.filter(b => b.a.alive && !b.saving)
    const spots = postSpots(C, ts.length)
    const bomb = g.point(C.bombNode)
    ts.forEach((b, i) => {
        if (b === C.lurker && g.pathDist(b.node, C.bombNode) > 30) return
        const n = spots[i]
        const q = g.point(n)
        b.task = "post"
        setQueue(b, [{ node: n, at: t + 0.4 * i, pace: WALK, look: { x: q.x + (q.x - bomb.x), y: q.y + (q.y - bomb.y) } }])
    })
    // CTs: regroup short of the bomb.
    const cts = C.CTs.filter(b => b.a.alive && !b.saving)
    for (const b of cts) {
        const stage = shortOf(g, b.node, C.bombNode, T.SIGHT_RETAKE_STAGE)
        b.task = "retake"
        setQueue(b, [{ node: stage, at: t + rnd(R, P.retake).range(0.5, 2), pace: RUN, look: bomb }])
    }
    const sorted = cts.map(b => t + 1 + walked(g, b.node, shortOf(g, b.node, C.bombNode, T.SIGHT_RETAKE_STAGE)) / (g.map.runSpeed * PACES[RUN])).sort((a, b) => a - b)
    C.retakeAt = min(max(sorted[min(sorted.length - 1, 1)] ?? t + 3, t + 2), retakeDeadline(C) - 10)
    // Down in numbers on the plant: the CTs may give the round up at once.
    if (countAlive(R.T) && wantsSave(C, t)) ctSave(C, t)
}

/** Walking length of the path from a to b: its edge costs, without the detour cost that steers paths around spots. */
function walked(g: NavGraph, a: number, b: number): number {
    const path = g.path(a, b)
    let d = 0
    for (let i = 1; i < path.length; i++) d += g.cost(path[i - 1], path[i])
    return d
}

const kitTime = (C: Ctx) => (C.CTs.some(b => b.a.alive && b.a.kit) ? 5 : 10)
/** Last moment a retake can still start a defuse that finishes (walk + defuse + margin). */
function retakeDeadline(C: Ctx): number {
    return C.R.bomb.plantT + BOMB_TIME - kitTime(C) - 3.5
}

function startRetake(C: Ctx, t: number): void {
    if (C.retakeStarted) return
    C.retakeStarted = true
    const { g, R } = C
    if (countAlive(R.T) && wantsSave(C, t)) return ctSave(C, t)
    retakeUtility(C, t)
    const cts = C.CTs.filter(b => b.a.alive && !b.saving)
    const defuser = cts.filter(b => b.a.kit).sort((a, b) => g.pathDist(a.node, C.bombNode) - g.pathDist(b.node, C.bombNode))[0]
        ?? [...cts].sort((a, b) => g.pathDist(a.node, C.bombNode) - g.pathDist(b.node, C.bombNode))[0]
    const spots = siteSpots(C, R.S.id, defuser?.node ?? C.bombNode, cts.length, [C.bombNode])
    const bomb = g.point(C.bombNode)
    cts.forEach((b, i) => {
        b.task = "retake"
        setQueue(b, [{ node: b === defuser ? C.bombNode : spots[i], at: t + 0.3 * i, pace: RUN, look: bomb }])
    })
    ;(C as Ctx & { defuseBy?: Body }).defuseBy = defuser
}

function wantsSave(C: Ctx, t: number): boolean {
    const R = C.R
    const urgency = max(0, min(1, (T.SAVE_CLOCK_SECONDS - (retakeDeadline(C) - t)) / T.SAVE_CLOCK_SECONDS))
    return givesUp(R, R.CT, countAlive(R.T), urgency, T.SIGHT_SAVE_RETAKE)
}

function ctSave(C: Ctx, t: number): void {
    if (C.ctSaving) return
    C.ctSaving = true
    const R = C.R
    R.t = t
    save(R, living(R.CT))
    for (const b of C.CTs) if (b.a.alive) {
        b.saving = true
        b.task = "save"
        setQueue(b, [{ node: b.spawn, at: t, pace: RUN, look: null }])
    }
    // Rarely a T leaves the bomb to hunt.
    const hunter = C.Ts.find(b => b.a.alive && b.a.job !== "lurk")
    if (hunter && countAlive(R.T) >= 2 && rnd(R, P.late).bool(T.EXIT_HUNT_T)) {
        hunter.task = "hunt"
        setQueue(hunter, [{ node: C.g.spawnNodes.CT[0] ?? hunter.node, at: t + 1, pace: RUN, look: null }])
    }
}

function tSave(C: Ctx, t: number): void {
    if (C.tSaving) return
    C.tSaving = true
    const R = C.R
    R.t = t
    save(R, living(R.T))
    for (const b of C.Ts) if (b.a.alive) {
        b.saving = true
        b.task = "save"
        if (b.busy === "plant") { b.busy = ""; b.busyUntil = 0 }
        setQueue(b, [{ node: b.spawn, at: t, pace: RUN, look: null }])
    }
    // The CTs may hunt the savers.
    const room = ROUND_TIME - t - 2
    for (const b of C.CTs) {
        if (!b.a.alive || countAlive(R.CT) < 2) continue
        if (!rnd(R, P.late).bool(T.EXIT_HUNT_CT * min(1, room / T.EXIT_ROOM))) continue
        b.task = "hunt"
        const target = C.Ts.find(x => x.a.alive)
        if (target) setQueue(b, [{ node: shortOf(C.g, b.node, target.node, 4), at: t + rnd(R, P.late).range(1, 4), pace: RUN, look: C.g.point(target.node) }])
    }
}

/** Saves after a death, by phase (resolver rules: early, during the hit, on the retake). */
function afterDeath(C: Ctx, ctDied: boolean, t: number): void {
    const R = C.R
    const tN = countAlive(R.T), ctN = countAlive(R.CT)
    if (!tN || !ctN) return
    if (!ctDied && !R.bomb.planted && !C.tSaving) {
        const early = !C.executed && t < C.execAt - 3
        if (givesUp(R, R.T, ctN, early ? 0 : plantUrgency(R), early ? T.SAVE_EARLY : T.SAVE_T)) tSave(C, t)
    }
    if (ctDied && R.bomb.planted && !C.ctSaving && C.retakeStarted && wantsSave(C, t)) ctSave(C, t)
    // A lone site defender facing a crowd falls back to the retake.
    if (ctDied && !R.bomb.planted && C.executed) {
        const onSite = C.CTs.filter(b => b.a.alive && b.a.post === R.S.id && !b.saving && C.g.dist(b.node, C.g.siteNodes[R.S.id]) <= T.SIGHT_SITE_RADIUS)
        const tsOnSite = C.Ts.filter(b => b.a.alive && C.g.dist(b.node, C.g.siteNodes[R.S.id]) <= T.SIGHT_SITE_RADIUS + 4)
        if (onSite.length === 1 && tsOnSite.length >= 3 && rnd(R, P.fallback).bool(T.FALLBACK)) {
            // Back toward CT spawn, out of the site, to retake later.
            const b = onSite[0]
            const home = C.g.path(b.node, b.spawn)
            b.task = "fallback"
            setQueue(b, [{ node: home[min(6, home.length - 1)], at: t, pace: RUN, look: C.g.point(C.g.siteNodes[R.S.id]) }])
        }
    }
}

// ─── The bomb ──────────────────────────────────────────────────────────────

function bombTick(C: Ctx, t: number): void {
    const { R, g } = C
    if (R.bomb.planted) return
    const carrier = C.bombLog.length ? C.bombLog[C.bombLog.length - 2] : -1
    if (carrier < 0) {
        // On the ground: the nearest T fetches it.
        if (t >= LATEST_PLANT_START || C.tSaving) return
        const pool = C.Ts.filter(b => b.a.alive && !b.saving && b.fights === 0)
        if (!pool.length) return
        const here = pool.find(b => b.node === C.bombNode && !moving(b))
        if (here) {
            R.bomb.carrier = here.a
            C.bombLog.push(round(t * 100), here.k, here.node)
            C.planter = here
            if (C.executed || C.plan.strategy === "rush") { here.task = "exec"; setQueue(here, [{ node: C.plantNode, at: t, pace: RUN, look: g.point(g.siteNodes[R.S.id]) }]) }
            return
        }
        const fetch = pool.find(b => b.task === "fetch") ?? pool.filter(b => b !== C.lurker || pool.length === 1).sort((a, b) => g.pathDist(a.node, C.bombNode) - g.pathDist(b.node, C.bombNode))[0]
        if (fetch && fetch.task !== "fetch") {
            fetch.task = "fetch"
            setQueue(fetch, [{ node: C.bombNode, at: t, pace: RUN, look: null }])
        }
        return
    }
    const b = C.bodies[carrier]
    if (!b.a.alive) return
    if (b.busy === "plant") {
        if (t >= b.busyUntil) planted(C, b.busyUntil)
        return
    }
    if (C.tSaving || t > LATEST_PLANT_START) return
    // On a plant spot of the attacked site (or the chosen one), not fighting: plant.
    const onSpot = b.node === C.plantNode || g.plantNodes[R.S.id].includes(b.node) || (C.executed && g.dist(b.node, g.siteNodes[R.S.id]) <= 3)
    if (onSpot && !moving(b) && b.fights === 0 && (C.executed || C.plan.strategy === "rush")) {
        b.busy = "plant"
        b.busyUntil = t + PLANT_TIME
        C.planter = b
        b.queue = []
        b.look = null
    } else if (C.executed && b.task !== "exec" && b.task !== "fetch" && b.queue.length === 0 && !moving(b)) {
        setQueue(b, [{ node: C.plantNode, at: t, pace: RUN, look: g.point(g.siteNodes[R.S.id]) }])
    }
}

function defuseTick(C: Ctx, t: number): void {
    const { R, g } = C
    if (!R.bomb.planted) return
    if (C.defuser) {
        const b = C.defuser
        if (!b.a.alive) { C.defuser = null; return }
        if (t >= C.defuseEnd) {
            const end = C.defuseEnd
            R.t = end
            R.events.push({ type: "DEFUSE", time: r1(end), side: "ct", playerId: b.a.id, site: R.S.id, zone: R.S.id, location: R.S.callout, details: "Bomb has been defused" })
            C.end = { winnerCT: true, winType: "BOMB_DEFUSE", t: end }
        }
        return
    }
    const tsAlive = C.Ts.filter(x => x.a.alive)
    for (const b of C.CTs) {
        if (!b.a.alive || b.saving || b.node !== C.bombNode || moving(b) || b.fights > 0) continue
        const dur = b.a.kit ? 5 : 10
        if (t + dur > R.bomb.plantT + BOMB_TIME - 0.1) continue
        // Nobody in sight (or no time left to wait): stick it.
        const watched = tsAlive.some(x => C.D.vis.seesFar(sightNode(x, t), b.node) && g.dist(x.node, b.node) <= T.SIGHT_RANGE)
        if (watched && tsAlive.length && t + dur < R.bomb.plantT + BOMB_TIME - 3) continue
        C.defuser = b
        b.busy = "defuse"
        b.busyUntil = t + dur
        C.defuseEnd = t + dur
        // The Ts hear the defuse and go for the bomb.
        for (const x of tsAlive) {
            if (x.saving || x.fights > 0 || g.pathDist(x.node, C.bombNode) > T.SIGHT_DEFUSE_HEAR) continue
            x.task = "deny"
            setQueue(x, [{ node: shortOf(g, x.node, C.bombNode, 2), at: t + 0.3, pace: RUN, look: g.point(C.bombNode) }])
        }
        return
    }
    // All Ts down: the nearest CT walks to the bomb.
    if (!tsAlive.length && !C.ctSaving) {
        const cts = C.CTs.filter(x => x.a.alive)
        if (!cts.some(x => x.queue[0]?.node === C.bombNode || (x.node === C.bombNode))) {
            const near = cts.sort((a, b) => (b.a.kit ? 1 : 0) - (a.a.kit ? 1 : 0) || g.pathDist(a.node, C.bombNode) - g.pathDist(b.node, C.bombNode))[0]
            if (near) setQueue(near, [{ node: C.bombNode, at: t, pace: RUN, look: null }])
        }
    }
}

// ─── Round ─────────────────────────────────────────────────────────────────

/**
 * The execute time on the map: when the hitters leave their staging spots
 * (the resolver's execAt was its first contact on the site). Pro plants come
 * at a median 76 s (p25 53, p75 95).
 */
function retime(R: Round, plan: PlanState): void {
    const rng = rnd(R, P.plan)
    const [lo, hi] = T.SIGHT_EXEC[plan.strategy === "eco" && plan.ecoRush ? "rush" : plan.strategy]
    if (plan.strategy === "rush" || plan.strategy === "eco" && plan.ecoRush) return
    if (plan.strategy === "fake") {
        plan.fakeAt = rng.range(lo, hi)
        plan.execAt = plan.fakeAt + rng.range(T.SIGHT_FAKE_GAP[0], T.SIGHT_FAKE_GAP[1])
        return
    }
    plan.execAt = rng.range(lo, hi)
}

/** True when the round can be played on the map (a baked round map for its zones). */
export function sightMapFor(zones: MapZones): RoundMap | undefined {
    return zones.mapId ? getRoundMap(zones.mapId) : undefined
}

export function simulateSightRound(input: SimInput, map: RoundMap): SimOutput & { moves: RoundMoves } {
    const all = makeActors(input)
    // The sight engine's own side balance (the resolver's CT_BIAS is in every CT's base).
    for (const a of all) if (a.ct) a.base += T.SIGHT_CT_BIAS - T.CT_BIAS
    // Every fight here is a real duel, so raw skill counts for more than in the resolver:
    // flatten it a little, and give the side's standout players the swing they bring.
    for (const a of all) {
        const mates = all.filter(x => x.ct === a.ct)
        const avg = mates.reduce((s, x) => s + x.p.skill, 0) / mates.length
        a.base += (T.SIGHT_SKILL - 1) * T.AIM_PER_SKILL * (a.p.skill - 70) + T.SIGHT_STAR * (a.p.skill - avg)
    }
    const R: Round = {
        rollKey: input.rollKey ?? input.rng.int(1, 0x7ffffffe), contacts: [], draws: new Map(), meetings: new Map(), z: input.zones, t: 0, all,
        T: all.filter(a => !a.ct), CT: all.filter(a => a.ct), events: [], firstKill: false, pressure: input.pressure,
        bomb: { carrier: null, lost: false, planted: false, plantT: 0, planter: null },
        utility: [], S: input.zones.sites.A, O: input.zones.sites.B,
    }
    const tSide = input.homeIsCT ? input.away : input.home
    const ctSide = input.homeIsCT ? input.home : input.away
    const plan = choosePlan(R, input, tSide, ctSide)
    retime(R, plan)
    R.S = input.zones.sites[plan.site]
    R.O = input.zones.sites[plan.site === "A" ? "B" : "A"]
    const jobs = assignJobs(R, plan)
    const D = mapData(map, input.zones)
    const g = D.g
    const bodies: Body[] = all.map((a, k) => ({
        a, k, rec: [], node: 0, spawn: 0, path: EMPTY, at: EMPTY, next: 0, cut: false, idle: 0, look: null, face: 0,
        queue: [], waitUntil: 0, busy: "", busyUntil: 0, fights: 0, saving: false, task: "", killedAt: -99, victims: [],
    }))
    const C: Ctx = {
        now: 0, utilThrown: false, R, D, g, plan, bodies, Ts: bodies.filter(b => !b.a.ct), CTs: bodies.filter(b => b.a.ct),
        lurker: null, fakers: [], aggressor: null, fights: [], cool: new Map(), seen: new Set(), smokes: [], fires: [], jobs: [],
        called: {}, execAt: plan.execAt, executed: false, plantNode: g.siteNodes[plan.site], plantStart: 0, planter: null,
        bombNode: -1, bombLog: [], defuser: null, defuseEnd: Infinity, retakeAt: Infinity, retakeStarted: false,
        tSaving: false, ctSaving: false, lastDeath: 0, end: null, siteNode: [g.siteNodes.A, g.siteNodes.B],
    }
    C.lurker = jobs.lurker ? C.bodies[jobs.lurker.i] : null
    C.fakers = jobs.fakers.map(a => C.bodies[a.i])
    C.aggressor = jobs.aggressor ? C.bodies[jobs.aggressor.i] : null
    // Spawns: the first to leave gets the spawn closest to where they head.
    for (const side of [C.Ts, C.CTs]) {
        const spawns = [...(g.spawnNodes[side[0]?.a.ct ? "CT" : "T"] ?? [])]
        side.forEach((b, i) => {
            const n = spawns.length ? spawns[i % spawns.length] : 0
            b.node = b.spawn = n
            b.rec.push(n)
        })
    }
    const plants = g.plantNodes[plan.site]
    C.plantNode = plants.length ? plants[floor(rnd(R, P.plan).next() * plants.length)] : g.siteNodes[plan.site]
    const carrier = R.bomb.carrier
    C.planter = carrier ? C.bodies[carrier.i] : null
    C.bombLog.push(0, C.planter ? C.planter.k : -1, C.planter ? C.planter.node : g.spawnNodes.T[0] ?? 0)
    opening(C)
    if (!C.executed) {
        C.jobs.push({ t: C.execAt, run: () => execute(C, C.execAt) })
        C.jobs.push({ t: C.execAt - 4, run: () => { if (!C.executed && !C.tSaving) executeUtility(C, hittersOf(C), C.execAt) } })
        if (plan.strategy === "fake" && C.fakers.length) C.jobs.push({ t: plan.fakeAt, run: () => fake(C, plan.fakeAt) })
        // A hit that never started (everyone stuck in fights) goes in late anyway.
        C.jobs.push({ t: LATEST_PLANT_START - 22, run: () => execute(C, LATEST_PLANT_START - 22) })
    }

    const maxT = ROUND_TIME + BOMB_TIME + 5
    for (let t = DT; t <= maxT && !C.end; t = round((t + DT) * 100) / 100) {
        C.now = t
        for (const b of bodies) if (b.a.alive) advance(C, b, t)
        // Scheduled plays and fights, in time order.
        for (;;) {
            let job = -1, jt = Infinity
            for (let i = 0; i < C.jobs.length; i++) if (C.jobs[i].t <= t && C.jobs[i].t < jt) { jt = C.jobs[i].t; job = i }
            let fight: Fight | null = null
            for (const f of C.fights) if (!f.done && f.at <= t && (!fight || f.at < fight.at)) fight = f
            if (job < 0 && !fight) break
            if (fight && fight.at <= jt) resolveFight(C, fight)
            else C.jobs.splice(job, 1)[0].run()
            if (checkEnd(C, t)) break
        }
        C.fights = C.fights.filter(f => !f.done)
        if (C.end || checkEnd(C, t)) break
        bombTick(C, t)
        defuseTick(C, t)
        if (C.end) break
        if (R.bomb.planted && !C.retakeStarted && !C.ctSaving && t >= C.retakeAt) startRetake(C, t)
        if (checkEnd(C, t)) break
        sightings(C, t)
        for (const b of bodies) drive(C, b, t)
    }
    const end = C.end ?? { winnerCT: true, winType: "TIME" as const, t: ROUND_TIME }
    // Close the legs still walking.
    for (const b of bodies) if (b.next > 0) endLeg(b, b.path.length - 1, end.t)
    R.t = end.t
    const out = finish(R, input, plan, end)
    const moves: RoundMoves = { v: 1, ids: bodies.map(b => b.a.id), legs: bodies.map(b => b.rec), bomb: C.bombLog }
    return { ...out, moves }
}

function checkEnd(C: Ctx, t: number): boolean {
    if (C.end) return true
    const R = C.R
    const tN = countAlive(R.T), ctN = countAlive(R.CT)
    if (!ctN) { C.end = { winnerCT: false, winType: "ELIMINATION", t: C.lastDeath }; return true }
    if (!R.bomb.planted) {
        if (!tN) { C.end = { winnerCT: true, winType: "ELIMINATION", t: C.lastDeath }; return true }
        if (t >= ROUND_TIME) {
            const planting = C.bodies.find(b => b.busy === "plant" && b.a.alive)
            if (planting && planting.busyUntil <= ROUND_TIME) return false
            R.t = ROUND_TIME
            C.end = { winnerCT: true, winType: "TIME", t: ROUND_TIME }
            return true
        }
        return false
    }
    if (t >= R.bomb.plantT + BOMB_TIME && !(C.defuser && C.defuseEnd <= R.bomb.plantT + BOMB_TIME)) {
        C.end = explode(R)
        return true
    }
    return false
}

export { isSaveWorthy }
