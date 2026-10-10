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
 */

import { SeededRNG, deriveSeed } from "../rng"
import { navGraphFor, type NavGraph } from "./round-script-nav"
import type {
    CtSetup, Floor, RPoint, RoundMap, RoundMapHold, RoundMapRoute, RoundScript, RoundScriptInput, RoundScriptPlayer,
    SampledPlayer, ScriptBomb, ScriptDeath, ScriptUtility, Side, SiteId, TStrategy, TrackKey, UtilityKind,
} from "./round-script-types"

export { roundMapFromLayout, type RoundLayoutSource } from "./round-script-layout"
export {
    roundScriptSeed, scriptInputFromResolverRound,
    type ResolverLoadout, type ResolverRoundSource, type ResolverTeamLineup,
} from "./round-script-input"

const PLANT_SECONDS = 3
const BOMB_SECONDS = 40
const MAX_KEY_GAP = 0.5
/** Paces as a share of the map's runSpeed. */
const WALK_PACE = 0.85
const RUN_PACE = 0.95
const PLAN_PACE = 0.92
const DUEL_MIN = 2.5
const DUEL_MAX = 10
/** Speed allowance (× runSpeed) used only when a duel cannot be reached at run speed. */
const BURST = 1.08
/** Share of the theoretical reach a killer may use before its next fight (keeps slack for the duel itself). */
const LOOKAHEAD_MARGIN = 0.75
/** Teammates' default spots keep at least this far apart. */
const HOME_GAP = 3.6
/** Seconds between teammates leaving together, so they walk in single file. */
const FILE_GAP = 0.9
const UTILITY_SECONDS: Record<UtilityKind, number> = { smoke: 18, molotov: 7, flash: 0.3, he: 0.3 }

/** Euclidean length (Math.hypot is several times slower, much more so inside Jest). */
const len = (dx: number, dy: number) => Math.sqrt(dx * dx + dy * dy)

interface XY {
    x: number
    y: number
}

/** A default "home" a player walks to from time `t` on. */
interface Phase {
    t: number
    node: number
    pace: number
    look?: XY
}

/** A hard constraint: the player is on `node` at `t`. */
interface Anchor {
    t: number
    node: number
    look?: XY
    aimAt?: XY
    dead?: boolean
    /** Pinned on the node until then (planting / defusing). */
    holdUntil?: number
    kind?: "plant" | "defuse"
}

interface Step {
    t: number
    node: number
    look?: XY
    aimAt?: XY
}

type Role = "entry" | "support" | "igl" | "awp" | "lurk" | "rifler"
type Job = "entry" | "support" | "igl" | "awp" | "lurk" | "fake" | "pack" | "ct"

interface Actor {
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

interface Kill {
    t: number
    killerId: string
    victimId: string
    weapon?: string
    headshot?: boolean
    trade?: boolean
}

interface State {
    node: number
    x: number
    y: number
    floor: Floor
    holding: boolean
}

interface Chain {
    nodes: number[]
    arc: number[]
    contactArc: number
    contactNode: number
}

interface Ctx {
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

// ─── Public API ────────────────────────────────────────────────────────────

export function buildRoundScript(input: RoundScriptInput, map: RoundMap): RoundScript {
    const ctx = createContext(input, map)
    choosePlan(ctx)
    assignRoles(ctx)
    buildTPhases(ctx)
    buildCtPhases(ctx)
    runTimeline(ctx)

    const raw = new Map<Actor, TrackKey[]>()
    for (const a of ctx.actors) raw.set(a, clipKeys(toKeys(ctx.g, assembleSteps(ctx, a)), ctx.endTime))
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
        utility: throwUtility(ctx),
        bomb: ctx.bomb,
        endTime: ctx.endTime,
    }
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

/** Binary search + linear interpolation; aim turns the short way round. */
export function sampleTrack(track: readonly TrackKey[], t: number): { x: number; y: number; floor: Floor; aim: number } {
    const first = track[0]
    const last = track[track.length - 1]
    if (t <= first.t) return { x: first.x, y: first.y, floor: first.floor, aim: first.aim }
    if (t >= last.t) return { x: last.x, y: last.y, floor: last.floor, aim: last.aim }
    let lo = 0
    let hi = track.length - 1
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (track[mid].t <= t) lo = mid
        else hi = mid
    }
    const a = track[lo]
    const b = track[hi]
    const u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1
    return {
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
        floor: u < 0.5 ? a.floor : b.floor,
        aim: lerpAngle(a.aim, b.aim, u),
    }
}

// ─── Context ───────────────────────────────────────────────────────────────

function createContext(input: RoundScriptInput, map: RoundMap): Ctx {
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
        kills.push({ t: e.time, killerId, victimId: victim.id, weapon: e.weapon, headshot: e.isHeadshot, trade: e.isTrade })
    }
    const plant = events.find(e => e.type === "PLANT")
    const defuse = events.find(e => e.type === "DEFUSE")
    const save = events.find(e => e.type === "SAVE")
    const roundEnd = events.find(e => e.type === "ROUND_END")
    const lastT = events.length ? events[events.length - 1].time : 0

    return {
        input, map, g, v: map.runSpeed, rng,
        endTime: Math.max(roundEnd?.time ?? lastT + 2, lastT, 5),
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

function roleOf(role: string): Role {
    const r = (role || "").toUpperCase()
    if (r.includes("ENTRY")) return "entry"
    if (r.includes("SUPPORT")) return "support"
    if (r === "IGL" || r.includes("LEADER")) return "igl"
    if (r.includes("AWP") || r.includes("SNIPER")) return "awp"
    if (r.includes("LURK")) return "lurk"
    return "rifler"
}

function weaponClass(weapon: string | undefined): "sniper" | "rifle" | "smg" | "shotgun" | "pistol" | "knife" | "other" {
    const w = (weapon ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
    if (/^(awp|ssg08|scar20|g3sg1)$/.test(w)) return "sniper"
    if (/^(ak47|m4a4|m4a1s?|m4a1silencer|galil(ar)?|famas|aug|sg55[36])$/.test(w)) return "rifle"
    if (/^(mac10|mp9|mp7|mp5sd|ump45|p90|(pp)?bizon)$/.test(w)) return "smg"
    if (/^(nova|mag7|sawedoff|xm1014)$/.test(w)) return "shotgun"
    if (/^(glock|usps?|p2000|p250|deagle|deserteagle|dualies|elite|tec9|fiveseven|cz75a?|r8|revolver)$/.test(w)) return "pistol"
    if (w.startsWith("knife")) return "knife"
    return "other"
}

const isSniper = (weapon: string | undefined) => weaponClass(weapon) === "sniper"
const other = (s: SiteId): SiteId => (s === "A" ? "B" : "A")
const hyp = (a: XY, b: XY) => len(a.x - b.x, a.y - b.y)
const alive = (a: Actor, t: number) => a.deathT > t

function weighted<K extends string>(rng: SeededRNG, weights: Record<K, number>): K {
    const keys = Object.keys(weights) as K[]
    const total = keys.reduce((s, k) => s + Math.max(0, weights[k]), 0)
    let r = rng.next() * total
    for (const k of keys) {
        r -= Math.max(0, weights[k])
        if (r < 0) return k
    }
    return keys[keys.length - 1]
}

// ─── Plan ──────────────────────────────────────────────────────────────────

function choosePlan(ctx: Ctx): void {
    const { input } = ctx
    const rng = ctx.rng.plan
    const tStyle = (input.tPlaystyle ?? "").toLowerCase()
    const ctStyle = (input.ctPlaystyle ?? "").toLowerCase()

    if (input.buy.T === "eco") ctx.strategy = "eco"
    else {
        const w: Record<Exclude<TStrategy, "eco">, number> = { default: 4, execute: 3, split: 1.5, fake: 1, rush: 1 }
        if (input.buy.T === "force" || input.buy.T === "pistol") w.rush += 3
        if (tStyle === "aggressive") { w.rush += 2; w.execute += 1; w.default -= 1 }
        if (tStyle === "structured") { w.default += 1; w.split += 1; w.fake += 0.5 }
        ctx.strategy = weighted(rng, w)
    }
    // A rush that would idle on site for the resolver's (late) plant is an execute.
    if (ctx.strategy === "rush" && ctx.plantT !== undefined && ctx.plantT > 35) ctx.strategy = "execute"
    ctx.site = rng.bool(0.5) ? "A" : "B"

    const cw: Record<CtSetup, number> = { "2-1-2": 6, "stack-A": 1, "stack-B": 1, aggressive: 1 }
    if (ctStyle === "aggressive") cw.aggressive += 2
    if (ctStyle === "structured") cw["2-1-2"] += 2
    if (input.buy.CT === "eco" || input.buy.CT === "force") { cw["stack-A"] += 1.5; cw["stack-B"] += 1.5; cw.aggressive += 1.5 }
    ctx.ctSetup = weighted(rng, cw)
}

// ─── Assignment ────────────────────────────────────────────────────────────

const PLANTER_PRIORITY: Record<Role, number> = { support: 0, igl: 1, rifler: 2, awp: 3, entry: 4, lurk: 5 }
const LEAD_ORDER: Record<Job, number> = { entry: 0, support: 1, igl: 2, pack: 3, awp: 4, lurk: 5, fake: 6, ct: 9 }

function assignRoles(ctx: Ctx): void {
    const rng = ctx.rng.assign
    const ts = ctx.actors.filter(a => a.side === "T")
    const byPriority = (pool: Actor[]) => [...pool].sort((a, b) => PLANTER_PRIORITY[a.role] - PLANTER_PRIORITY[b.role] || a.order - b.order)

    // The planter has to be alive at the plant; the bomb starts with them.
    if (ctx.plantT !== undefined) {
        const plantT = ctx.plantT
        ctx.planter = byPriority(ts.filter(a => alive(a, plantT)))[0] ?? byPriority(ts)[0]
        const spots = ctx.g.plantNodes[ctx.site]
        ctx.plantNode = spots.length ? rng.pick(spots) : ctx.g.siteNodes[ctx.site]
    }
    const carrier = ctx.planter ?? byPriority(ts)[0]
    ctx.carrierId = carrier?.id ?? null
    if (carrier) ctx.bomb.carrier.push({ t: 0, carrierId: carrier.id })

    const quick = ctx.strategy === "rush" || ctx.strategy === "eco"
    for (const a of ts) {
        a.job = a.role === "entry" ? "entry" : a.role === "support" ? "support" : a.role === "igl" ? "igl" : a.role === "lurk" && !quick ? "lurk" : "pack"
        if (isSniper(a.player.weapon)) a.job = "awp"
        if (a === ctx.planter && (a.job === "lurk")) a.job = "pack"
    }
    if (!quick && ts.length >= 4 && !ts.some(a => a.job === "lurk")) {
        const pool = ts.filter(a => a.job === "pack" && a !== ctx.planter)
        if (pool.length) rng.pick(pool).job = "lurk"
    }
    if (!ts.some(a => a.job === "entry")) {
        const pool = ts.filter(a => a.job === "pack" || a.job === "igl" || a.job === "support")
        const pick = pool.find(a => a !== ctx.planter) ?? pool[0]
        if (pick) pick.job = "entry"
    }
    if (ctx.strategy === "fake") {
        const fakers = ts.filter(a => a.job === "lurk")
        const extra = ts.filter(a => (a.job === "pack" || a.job === "igl") && a !== ctx.planter)
        if (extra.length && fakers.length < 2) fakers.push(extra[extra.length - 1])
        for (const a of fakers.slice(0, 2)) a.job = "fake"
    }
    ;[...ts].sort((a, b) => LEAD_ORDER[a.job] - LEAD_ORDER[b.job] || a.order - b.order).forEach((a, i) => { a.order = i })
}

function tRoutes(ctx: Ctx, site: SiteId): { main?: RoundMapRoute; alt?: RoundMapRoute } {
    const exec = ctx.map.routes.filter(r => r.kind === "t-exec" && r.site === site)
    const main = exec.find(r => /main/.test(r.id)) ?? [...exec].sort((a, b) => a.length - b.length)[0]
    const alt = exec.find(r => r !== main && /alt/.test(r.id)) ?? exec.find(r => r !== main) ?? main
    return { main, alt }
}

function chainOf(ctx: Ctx, route: RoundMapRoute): Chain {
    const cached = ctx.chains.get(route.id)
    if (cached) return cached
    const { g } = ctx
    const nodes = g.routeNodes.get(route.id) ?? []
    const arc = [0]
    for (let i = 1; i < nodes.length; i++) arc.push(arc[i - 1] + g.dist(nodes[i - 1], nodes[i]))
    const cp = route.points[Math.min(Math.max(0, route.contactIndex), route.points.length - 1)]
    let ci = 0
    for (let i = 1; i < nodes.length; i++) if (hyp(g.point(nodes[i]), cp) < hyp(g.point(nodes[ci]), cp)) ci = i
    const chain = { nodes, arc, contactArc: arc[ci] ?? 0, contactNode: nodes[ci] ?? g.siteNodes[route.site] }
    ctx.chains.set(route.id, chain)
    return chain
}

function nodeAtArc(chain: Chain, s: number): number {
    let best = 0
    for (let i = 1; i < chain.arc.length; i++) if (Math.abs(chain.arc[i] - s) < Math.abs(chain.arc[best] - s)) best = i
    return chain.nodes[best]
}

/** Spread players along a route behind its contact point, `gap` + 4 per player. */
function stageOnChain(ctx: Ctx, chain: Chain, players: Actor[], gap: number, taken: number[]): Map<Actor, number> {
    const out = new Map<Actor, number>()
    if (!chain.nodes.length) return out
    const floor = Math.min(8, chain.contactArc * 0.5)
    players.forEach((a, k) => {
        let s = Math.max(floor, chain.contactArc - gap - 4 * k)
        let node = nodeAtArc(chain, s)
        for (let tries = 0; tries < 6 && taken.some(n => ctx.g.dist(n, node) < HOME_GAP); tries++) {
            s = Math.max(0, s - 2.5)
            node = nodeAtArc(chain, s)
        }
        taken.push(node)
        out.set(a, node)
    })
    return out
}

/** Distinct spots on a site, deepest (farthest from `from`) first. */
function siteSpots(ctx: Ctx, site: SiteId, from: number, taken: number[], count: number): number[] {
    const { g } = ctx
    const c = g.siteNodes[site]
    const pool = [...new Set([...g.plantNodes[site], ...g.around(c, 6)])].filter(n => g.floor[n] === g.floor[c])
    pool.sort((a, b) => g.dist(b, from) - g.dist(a, from) || a - b)
    const out: number[] = []
    for (const gap of [HOME_GAP, 2.5, 0]) {
        for (const n of pool) {
            if (out.length >= count) return out
            if (out.includes(n) || [...taken, ...out].some(m => g.dist(m, n) < gap)) continue
            out.push(n)
        }
    }
    while (out.length < count) out.push(c)
    return out
}

/** Post-plant positions 4–13 from the bomb, holds preferred. */
function postPlantSpots(ctx: Ctx, count: number): number[] {
    const { g } = ctx
    const bomb = ctx.plantNode
    const holdNodes = new Set(ctx.map.holds.filter(h => h.site === ctx.site).map(h => g.holdNodes.get(h.id)))
    const pool = g.around(bomb, 13).filter(n => g.dist(n, bomb) >= 3.5)
        .map(n => ({ n, score: Math.abs(g.dist(n, bomb) - 8) - (holdNodes.has(n) ? 3 : 0) + ctx.rng.assign.range(0, 2) }))
        .sort((a, b) => a.score - b.score)
    const out: number[] = []
    for (const gap of [HOME_GAP, 2.5]) {
        for (const { n } of pool) {
            if (out.length >= count) return out
            if (!out.includes(n) && out.every(m => g.dist(m, n) >= gap)) out.push(n)
        }
    }
    while (out.length < count) out.push(bomb)
    return out
}

/** Node on the walk from `from` to `to`, about `back` short of `to` (and clear of `taken`). */
function shortOf(ctx: Ctx, from: number, to: number, back: number, taken: number[]): number | null {
    const { g } = ctx
    const path = g.path(from, to)
    let acc = 0
    for (let i = path.length - 2; i >= 0; i--) {
        acc += g.dist(path[i], path[i + 1])
        if (acc < back || g.dist(path[i], to) < back * 0.6) continue
        if (taken.some(n => g.dist(n, path[i]) < HOME_GAP)) continue
        return path[i]
    }
    return null
}

// ─── Phases ────────────────────────────────────────────────────────────────

function buildTPhases(ctx: Ctx): void {
    const { g, rng } = ctx
    const ts = ctx.actors.filter(a => a.side === "T").sort((a, b) => a.order - b.order)
    if (!ts.length) return
    const S = ctx.site
    const O = other(S)
    const { main, alt } = tRoutes(ctx, S)
    const fakeRoute = tRoutes(ctx, O).main
    const lurkRoute = ctx.map.routes.find(r => r.kind === "lurk" && r.site === O) ?? ctx.map.routes.find(r => r.kind === "lurk") ?? fakeRoute
    const site = g.point(g.siteNodes[S])
    if (ctx.planter && ctx.plantT !== undefined) {
        ctx.planter.fixed.push({ t: ctx.plantT - PLANT_SECONDS, node: ctx.plantNode, holdUntil: ctx.plantT, kind: "plant", look: site })
    }
    if (!main) {
        // No T routes for the site: walk straight there over the graph.
        for (const a of ts) a.phases = [{ t: 0, node: a.spawn, pace: RUN_PACE }, { t: FILE_GAP * a.order, node: a === ctx.planter ? ctx.plantNode : g.siteNodes[S], pace: RUN_PACE }]
        ctx.execAt = 0
        ctx.trigger = Math.min(20, ctx.plantT ?? Infinity)
        return
    }

    let splitAlt = 0
    for (const a of ts) {
        let route = main
        if (ctx.strategy === "execute" && (a.job === "awp" || a.job === "lurk")) route = alt ?? main
        if (ctx.strategy === "default") route = a.job === "awp" ? alt ?? main : a.job === "lurk" ? lurkRoute ?? main : main
        if (ctx.strategy === "fake") route = a.job === "awp" ? alt ?? main : a.job === "fake" ? fakeRoute ?? main : main
        if (ctx.strategy === "split" && a !== ctx.planter && a.job !== "entry" && a.job !== "support" && (a.job === "awp" || a.job === "lurk" || splitAlt < 2)) {
            route = alt ?? main
            splitAlt++
        }
        a.route = route
    }

    // Staging spots per route group (and a closer regroup spot for defaults).
    const taken: number[] = []
    const stage = new Map<Actor, number>()
    const regroup = new Map<Actor, number>()
    const groups = new Map<RoundMapRoute, Actor[]>()
    for (const a of ts) groups.set(a.route!, [...(groups.get(a.route!) ?? []), a])
    for (const [route, members] of groups) {
        const gap = route === lurkRoute && route !== main ? 3 : ctx.strategy === "default" ? (route === main ? 10 : 5) : ctx.strategy === "eco" || ctx.strategy === "execute" ? 4 : 5
        for (const [a, n] of stageOnChain(ctx, chainOf(ctx, route), members, gap, taken)) stage.set(a, n)
    }
    if (ctx.strategy === "default") {
        const regroupTaken: number[] = []
        const members = groups.get(main) ?? []
        for (const [a, n] of stageOnChain(ctx, chainOf(ctx, main), members, 3, regroupTaken)) regroup.set(a, n)
    }

    // Execute time: from the plant if there is one, else seeded (pulled earlier when the fights come early).
    const mainChain = chainOf(ctx, main)
    const execDelay = (a: Actor) => (a.route === main ? FILE_GAP * (groups.get(main) ?? []).indexOf(a) : 1.2 + FILE_GAP * a.order)
    if (ctx.strategy === "rush") ctx.execAt = 0
    else {
        const base = ctx.strategy === "eco" ? rng.plan.range(15, 30) : ctx.strategy === "execute" ? rng.plan.range(25, 40)
            : ctx.strategy === "split" ? rng.plan.range(30, 50) : rng.plan.range(35, 55)
        if (ctx.plantT !== undefined && ctx.planter) {
            const from = regroup.get(ctx.planter) ?? stage.get(ctx.planter) ?? ctx.planter.spawn
            const travel = g.pathDist(from, ctx.plantNode) / (ctx.v * RUN_PACE)
            ctx.execAt = Math.max(6, ctx.plantT - PLANT_SECONDS - travel - execDelay(ctx.planter) - rng.plan.range(1, 5))
        } else if (ctx.kills.length) {
            const median = ctx.kills[Math.floor((ctx.kills.length - 1) / 2)].t
            ctx.execAt = Math.min(base, Math.max(12, median - 2))
        } else ctx.execAt = base
    }

    // Where each T goes on the execute.
    const siteTaken: number[] = ctx.plantT !== undefined ? [ctx.plantNode] : []
    const onSite = ts.filter(a => a !== ctx.planter && a.job !== "awp" && a.job !== "lurk")
    const spots = siteSpots(ctx, S, mainChain.contactNode, siteTaken, onSite.length)
    const execHome = new Map<Actor, { node: number; look?: XY }>()
    const deeper = (n: number): XY => {
        const p = g.point(n)
        const c = g.point(mainChain.contactNode)
        return { x: p.x + (p.x - c.x), y: p.y + (p.y - c.y) }
    }
    onSite.forEach((a, i) => execHome.set(a, { node: spots[i], look: deeper(spots[i]) }))
    if (ctx.planter) execHome.set(ctx.planter, { node: ctx.plantT !== undefined ? ctx.plantNode : spots[0] ?? g.siteNodes[S], look: site })
    const cut = ctx.map.routes.find(r => r.kind === "rotate" && r.site === S && r.from === O)
    for (const a of ts) {
        if (execHome.has(a)) continue
        if (a.job === "awp") execHome.set(a, { node: chainOf(ctx, a.route ?? main).contactNode, look: site })
        else if (a.job === "lurk" && ctx.strategy === "default" && cut) {
            const c = chainOf(ctx, cut)
            execHome.set(a, { node: nodeAtArc(c, c.arc[c.arc.length - 1] * 0.45), look: g.point(g.siteNodes[O]) })
        } else execHome.set(a, { node: siteSpots(ctx, S, mainChain.contactNode, [...spots, ...siteTaken], 1)[0], look: site })
    }
    const post = ctx.plantT !== undefined ? postPlantSpots(ctx, ts.length) : []
    // The first to leave spawn gets the spawn closest to where they head, so the stagger keeps them in single file.
    const freeSpawns = ts.map(a => a.spawn)
    for (const a of ts) {
        const target = ctx.strategy === "rush" ? execHome.get(a)!.node : stage.get(a) ?? execHome.get(a)!.node
        const dist = g.distancesTo(target)
        const pick = freeSpawns.reduce((best, n) => (dist[n] < dist[best] ? n : best), freeSpawns[0])
        freeSpawns.splice(freeSpawns.indexOf(pick), 1)
        a.spawn = pick
        a.anchors[0].node = pick
    }

    for (const a of ts) {
        const home = execHome.get(a)!
        const chain = chainOf(ctx, a.route ?? main)
        const forward = (n: number): XY => g.point(chain.nodes[Math.min(chain.nodes.indexOf(n) + 3, chain.nodes.length - 1)] ?? n)
        const phases: Phase[] = [{ t: 0, node: a.spawn, pace: RUN_PACE }]
        const leave = FILE_GAP * a.order
        if (ctx.strategy === "rush") phases.push({ t: leave, node: home.node, pace: RUN_PACE, look: home.look })
        else {
            const s0 = stage.get(a) ?? chain.contactNode
            phases.push({ t: leave, node: s0, pace: WALK_PACE, look: forward(s0) })
            const r = regroup.get(a)
            if (r !== undefined) phases.push({ t: Math.max(leave + 1, ctx.execAt - rng.plan.range(6, 10)), node: r, pace: WALK_PACE, look: forward(r) })
            if (a.job === "fake" && fakeRoute) {
                const fc = chainOf(ctx, fakeRoute)
                phases.push({ t: Math.max(leave + 1, ctx.execAt - 8), node: fc.contactNode, pace: RUN_PACE, look: g.point(g.siteNodes[O]) })
                phases.push({ t: ctx.execAt + 3, node: home.node, pace: RUN_PACE, look: home.look })
            } else phases.push({ t: ctx.execAt + execDelay(a), node: home.node, pace: RUN_PACE, look: home.look })
        }
        if (ctx.plantT !== undefined && !(a.job === "lurk" && cut && ctx.strategy === "default")) {
            const spot = post[a.order % post.length]
            const p = g.point(spot)
            const bomb = g.point(ctx.plantNode)
            phases.push({ t: ctx.plantT + 0.5 + 0.4 * a.order, node: spot, pace: WALK_PACE, look: { x: p.x + (p.x - bomb.x), y: p.y + (p.y - bomb.y) } })
        }
        a.phases = sortPhases(phases)
    }

    // CTs rotate once the entry shows up at the attacked site.
    const entry = ts.find(a => a.job === "entry") ?? ts[0]
    const from = ctx.strategy === "rush" ? entry.spawn : regroup.get(entry) ?? stage.get(entry) ?? entry.spawn
    const contact = (ctx.strategy === "rush" ? 0.5 * entry.order : ctx.execAt) + g.pathDist(from, mainChain.contactNode) / (ctx.v * RUN_PACE)
    ctx.trigger = Math.min(contact + 1, ctx.plantT ?? Infinity)
    applySave(ctx, ts)
}

function buildCtPhases(ctx: Ctx): void {
    const { g } = ctx
    const rng = ctx.rng.assign
    const cts = ctx.actors.filter(a => a.side === "CT")
    if (!cts.length) return
    const S = ctx.site

    // Holds per setup: 2-1-2, stacks, or 2-1-2 with one player pushing out.
    const counts = { A: 2, B: 2, mid: 1 }
    if (ctx.ctSetup === "stack-A") Object.assign(counts, { A: 3, B: 1 })
    if (ctx.ctSetup === "stack-B") Object.assign(counts, { A: 1, B: 3 })
    const mids = rng.shuffle(ctx.map.holds.filter(h => h.kind === "mid"))
    if (!mids.length) { counts[rng.bool(0.5) ? "A" : "B"] += counts.mid; counts.mid = 0 }
    const slots: RoundMapHold[] = []
    const spaced = (h: RoundMapHold) => !slots.includes(h) && slots.every(o => o.at.floor !== h.at.floor || hyp(o.at, h.at) >= HOME_GAP)
    for (const s of ["A", "B"] as const) {
        const ofSite = ctx.map.holds.filter(h => h.site === s && h.kind !== "mid")
        const ranked = [
            ...rng.shuffle(ofSite.filter(h => h.kind === "anchor")),
            ...rng.shuffle(ofSite.filter(h => h.kind === "site")),
            ...rng.shuffle(ofSite.filter(h => h.kind === "retake")),
        ]
        let taken = 0
        for (const h of ranked) if (taken < counts[s] && spaced(h)) { slots.push(h); taken++ }
    }
    let midTaken = 0
    for (const h of mids) if (midTaken < counts.mid && spaced(h)) { slots.push(h); midTaken++ }
    for (const h of rng.shuffle(ctx.map.holds)) if (slots.length < cts.length && spaced(h)) slots.push(h)
    for (const h of ctx.map.holds) if (slots.length < cts.length && !slots.includes(h)) slots.push(h)

    const awper = cts.find(a => isSniper(a.player.weapon)) ?? cts.find(a => a.role === "awp")
    const ordered = rng.shuffle(cts.filter(a => a !== awper))
    if (awper) ordered.unshift(awper)
    const free = [...slots]
    for (const a of ordered) {
        let i = 0
        if (a === awper) i = Math.max(0, free.findIndex(h => h.kind === "anchor" || h.kind === "mid"))
        a.hold = free.splice(i, 1)[0] ?? slots[0]
    }

    const aggressor = ctx.ctSetup === "aggressive" ? (cts.find(a => a.role === "entry" && a !== awper) ?? ordered.find(a => a !== awper)) : undefined
    const site = g.point(g.siteNodes[S])
    const bomb = ctx.plantT !== undefined ? g.point(ctx.plantNode) : undefined
    const holdNodeOf = (a: Actor) => g.holdNodes.get(a.hold!.id) ?? g.siteNodes[a.hold!.site]
    // Shortest trips leave spawn first, from the spawn closest to their hold, so shared corridors stay in file.
    const leaveRank = [...cts].sort((a, b) => g.pathDist(a.spawn, holdNodeOf(a)) - g.pathDist(b.spawn, holdNodeOf(b)) || a.order - b.order)
    const freeSpawns = leaveRank.map(a => a.spawn)
    for (const a of leaveRank) {
        const dist = g.distancesTo(holdNodeOf(a))
        const pick = freeSpawns.reduce((best, n) => (dist[n] < dist[best] ? n : best), freeSpawns[0])
        freeSpawns.splice(freeSpawns.indexOf(pick), 1)
        a.spawn = pick
        a.anchors[0].node = pick
    }
    // Rotators and retakers stop clear of the players already holding the site.
    const siteHolders = cts.filter(a => a.hold!.site === S && a.hold!.kind !== "mid").map(holdNodeOf)
    const retakeTaken: number[] = [...siteHolders]
    const spotTaken: number[] = [...siteHolders]
    cts.forEach(a => {
        const k = leaveRank.indexOf(a)
        const hold = a.hold!
        const holdNode = holdNodeOf(a)
        const phases: Phase[] = [{ t: 0, node: a.spawn, pace: RUN_PACE }]
        if (a === aggressor) {
            const main = tRoutes(ctx, hold.site).main
            const chain = main ? chainOf(ctx, main) : null
            const fwd = chain ? nodeAtArc(chain, chain.contactArc - rng.range(5, 10)) : holdNode
            const up = chain ? g.point(nodeAtArc(chain, chain.contactArc - 18)) : hold.watch
            phases.push({ t: FILE_GAP * k, node: fwd, pace: RUN_PACE, look: up })
            phases.push({ t: rng.range(10, 18), node: holdNode, pace: RUN_PACE, look: hold.watch })
        } else phases.push({ t: FILE_GAP * k, node: holdNode, pace: RUN_PACE, look: hold.watch })

        let home = holdNode
        if (hold.site !== S || hold.kind === "mid") {
            const stage = shortOf(ctx, holdNode, g.siteNodes[S], 10, retakeTaken)
            if (stage !== null) {
                phases.push({ t: ctx.trigger + 0.5 + FILE_GAP * (retakeTaken.length - siteHolders.length) + rng.range(0, 0.4), node: stage, pace: RUN_PACE, look: site })
                retakeTaken.push(stage)
                if (ctx.trigger <= (ctx.plantT ?? Infinity)) home = stage
            }
        }
        if (ctx.plantT !== undefined && bomb) {
            const spot = shortOf(ctx, home, ctx.plantNode, 6, spotTaken)
            if (spot !== null) {
                phases.push({ t: ctx.plantT + 1 + FILE_GAP * (spotTaken.length - siteHolders.length) + rng.range(0, 0.4), node: spot, pace: PLAN_PACE, look: bomb })
                spotTaken.push(spot)
            }
        }
        a.phases = sortPhases(phases)
    })
    applySave(ctx, cts)
}

/** After a SAVE call the losing side's survivors fall back toward their spawn. */
function applySave(ctx: Ctx, side: Actor[]): void {
    const saveT = ctx.saveT
    if (saveT === undefined || !side.length || side[0].side === ctx.input.winnerSide) return
    for (const a of side) {
        if (!alive(a, saveT)) continue
        a.phases = [...a.phases.filter(p => p.t < saveT + 0.5), { t: saveT + 0.5, node: a.spawn, pace: RUN_PACE }]
    }
}

function sortPhases(phases: Phase[]): Phase[] {
    return phases.map((p, i) => ({ p, i })).sort((a, b) => a.p.t - b.p.t || a.i - b.i).map(x => x.p)
}

// ─── Default motion, legs, sampling of the plan ────────────────────────────

function phaseAt(phases: Phase[], t: number): number {
    let i = 0
    while (i + 1 < phases.length && phases[i + 1].t <= t) i++
    return i
}

/** Follow the phase homes from an anchor until `horizon`. */
function defaultSteps(ctx: Ctx, a: Actor, from: Anchor, horizon: number): Step[] {
    const { g } = ctx
    const steps: Step[] = [{ t: from.t, node: from.node, look: from.look, aimAt: from.aimAt }]
    let t = from.t
    let cur = from.node
    if (from.holdUntil !== undefined && from.holdUntil > t) {
        t = from.holdUntil
        steps.push({ t, node: cur, look: from.look })
    }
    if (!a.phases.length) {
        if (horizon > t) steps.push({ t: horizon, node: cur, look: from.look })
        return steps
    }
    let pi = phaseAt(a.phases, t)
    while (t < horizon) {
        const ph = a.phases[pi]
        const nextT = pi + 1 < a.phases.length ? a.phases[pi + 1].t : Infinity
        if (cur !== ph.node && t < nextT) {
            const path = g.path(cur, ph.node)
            const speed = ctx.v * ph.pace
            for (let i = 1; i < path.length; i++) {
                t += g.dist(path[i - 1], path[i]) / speed
                cur = path[i]
                steps.push({ t, node: cur })
                if (t >= horizon || t >= nextT) break
            }
        }
        if (t >= horizon) break
        if (cur === ph.node || t < nextT) {
            if (cur === ph.node && !steps[steps.length - 1].aimAt) steps[steps.length - 1].look = ph.look
            const until = Math.min(nextT, horizon)
            if (until > t) {
                t = until
                steps.push({ t, node: cur, look: cur === ph.node ? ph.look : steps[steps.length - 1].look })
            }
        }
        if (nextT === Infinity) break
        pi = phaseAt(a.phases, t)
    }
    return steps
}

/** Steps from anchor `from` to anchor `to`: the default motion, left as late as possible. */
function legSteps(ctx: Ctx, a: Actor, from: Anchor, to: Anchor): Step[] {
    const { g, v } = ctx
    const def = defaultSteps(ctx, a, from, to.t)
    const dist = g.distancesTo(to.node)
    const end: Step = { t: to.t, node: to.node, look: to.look, aimAt: to.aimAt }
    const minK = from.holdUntil !== undefined && from.holdUntil > from.t ? 1 : 0
    let k = def.length - 1
    while (k > 0 && def[k].t > to.t) k--
    for (; k >= minK; k--) {
        const s = def[k]
        const d = dist[s.node]
        if (!Number.isFinite(d)) continue
        let dep = to.t - d / (v * PLAN_PACE)
        if (dep < s.t) dep = to.t - d / v
        if (dep < s.t - 1e-6) continue
        dep = Math.max(dep, s.t)
        const out = def.slice(0, k + 1)
        if (dep > s.t + 1e-6) out.push({ t: dep, node: s.node, look: s.look })
        walk(g, out, s.node, to.node, dep, to.t)
        out.push(end)
        return out
    }
    ctx.violations++
    const out: Step[] = [def[0]]
    walk(g, out, from.node, to.node, from.t, to.t)
    out.push(end)
    return out
}

/** Append the inner nodes of the walk from `from` to `to`, timed evenly between t0 and t1. */
function walk(g: NavGraph, out: Step[], from: number, to: number, t0: number, t1: number): void {
    if (from === to) return
    const path = g.path(from, to)
    let total = 0
    for (let j = 1; j < path.length; j++) total += g.dist(path[j - 1], path[j])
    let acc = 0
    for (let j = 1; j < path.length - 1; j++) {
        acc += g.dist(path[j - 1], path[j])
        out.push({ t: t0 + (t1 - t0) * (acc / total), node: path[j] })
    }
}

function legOf(ctx: Ctx, a: Actor, i: number): Step[] {
    let leg = a.legs[i]
    if (!leg) {
        leg = legSteps(ctx, a, a.anchors[i], a.anchors[i + 1])
        a.legs[i] = leg
    }
    return leg
}

function tailOf(ctx: Ctx, a: Actor): Step[] {
    const from = a.anchors.length - 1
    if (!a.tail || a.tail.from !== from) a.tail = { from, steps: defaultSteps(ctx, a, a.anchors[from], ctx.endTime) }
    return a.tail.steps
}

/** Where a player is at `t` under everything decided so far. */
function stateAt(ctx: Ctx, a: Actor, t: number): State {
    let i = a.anchors.length - 1
    while (i > 0 && a.anchors[i].t > t) i--
    const anchor = a.anchors[i]
    if (anchor.dead) return { node: anchor.node, ...ctx.g.point(anchor.node), holding: true }
    const steps = i === a.anchors.length - 1 ? tailOf(ctx, a) : legOf(ctx, a, i)
    return sampleSteps(ctx.g, steps, t)
}

function sampleSteps(g: NavGraph, steps: Step[], t: number): State {
    const at = (s: Step, holding: boolean): State => ({ node: s.node, x: g.x[s.node], y: g.y[s.node], floor: g.floor[s.node], holding })
    if (t <= steps[0].t) return at(steps[0], steps.length < 2 || steps[1].node === steps[0].node)
    const last = steps[steps.length - 1]
    if (t >= last.t) return at(last, true)
    let lo = 0
    let hi = steps.length - 1
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (steps[mid].t <= t) lo = mid
        else hi = mid
    }
    const s0 = steps[lo]
    const s1 = steps[hi]
    if (s0.node === s1.node) return at(s0, true)
    const u = (t - s0.t) / (s1.t - s0.t)
    return {
        node: u < 0.5 ? s0.node : s1.node,
        x: g.x[s0.node] + (g.x[s1.node] - g.x[s0.node]) * u,
        y: g.y[s0.node] + (g.y[s1.node] - g.y[s0.node]) * u,
        floor: u < 0.5 ? g.floor[s0.node] : g.floor[s1.node],
        holding: false,
    }
}

function pushAnchor(a: Actor, anchor: Anchor): void {
    a.anchors.push(anchor)
    a.tail = undefined
}

// ─── Timeline ──────────────────────────────────────────────────────────────

interface QueuedEvent {
    t: number
    order: number
    kind: "kill" | "defuse" | "pickup"
    kill?: Kill
}

function runTimeline(ctx: Ctx): void {
    const queue: QueuedEvent[] = ctx.kills.map((kill, i) => ({ t: kill.t, order: i, kind: "kill", kill }))
    if (ctx.defuseT !== undefined && ctx.plantT !== undefined) queue.push({ t: Math.max(ctx.plantT, ctx.defuseT - 10), order: -1, kind: "defuse" })
    let seq = queue.length
    while (queue.length) {
        let bi = 0
        for (let i = 1; i < queue.length; i++) if (queue[i].t < queue[bi].t || (queue[i].t === queue[bi].t && queue[i].order < queue[bi].order)) bi = i
        const ev = queue.splice(bi, 1)[0]
        commitFixed(ctx, ev.t)
        if (ev.kind === "kill") {
            const dropped = placeKill(ctx, ev.kill!)
            if (dropped) queue.push({ t: ev.t + 1.5, order: seq++, kind: "pickup" })
        } else if (ev.kind === "defuse") chooseDefuser(ctx, ev.t)
        else pickUpBomb(ctx, ev.t)
    }
    commitFixed(ctx, Infinity)
    if (ctx.plantT !== undefined && ctx.planter) {
        const at = ctx.g.point(ctx.plantNode)
        ctx.bomb.plant = { t: ctx.plantT, site: ctx.site, at, planterId: ctx.planter.id }
        ctx.bomb.carrier.push({ t: ctx.plantT, carrierId: null, at })
    }
}

/** Move pending plant / defuse anchors whose time has come onto the timeline. */
function commitFixed(ctx: Ctx, t: number): void {
    for (const a of ctx.actors) {
        while (a.fixed.length && a.fixed[0].t <= t) {
            const f = a.fixed.shift()!
            const last = a.anchors[a.anchors.length - 1]
            if (last.dead) continue
            // Late: arrive as soon as possible (a shorter plant / defuse) rather than teleport.
            const arrive = freeFrom(last) + ctx.g.pathDist(last.node, f.node) / ctx.v
            if (arrive > f.t + 1e-6) {
                if (f.t > last.t) ctx.violations++
                f.t = Math.min(arrive, f.holdUntil ?? arrive)
                if (f.kind === "defuse" && ctx.bomb.defuse) ctx.bomb.defuse.tStart = round3(f.t)
            }
            if (f.t < last.t) f.t = last.t
            pushAnchor(a, f)
        }
    }
}

/** Returns true when the bomb was dropped by this death. */
function placeKill(ctx: Ctx, kill: Kill): boolean {
    const { g } = ctx
    const V = ctx.byId.get(kill.victimId)!
    const K = ctx.byId.get(kill.killerId)
    const t = kill.t
    if (V.anchors[V.anchors.length - 1].dead) return false
    const sV = stateAt(ctx, V, t)
    let v = sV.node
    let k = sV.node
    if (K && K.side !== V.side && !K.anchors[K.anchors.length - 1].dead) {
        const pair = chooseDuel(ctx, kill, V, K, sV, stateAt(ctx, K, t))
        v = pair.v
        k = pair.k
        const lastK = K.anchors[K.anchors.length - 1]
        if (lastK.t <= t) {
            const pin = lastK.holdUntil !== undefined && lastK.holdUntil > t ? lastK.holdUntil : undefined
            pushAnchor(K, { t, node: k, aimAt: g.point(v), ...(pin !== undefined ? { holdUntil: pin } : {}) })
        }
    } else ctx.violations++
    const at = roundPoint(g.point(v))
    const from = roundPoint(g.point(k))
    pushAnchor(V, { t, node: v, dead: true, aimAt: from })
    ctx.deaths.push({
        t, victimId: V.id, killerId: kill.killerId, at, from,
        ...(kill.weapon ? { weapon: kill.weapon } : {}),
        ...(kill.headshot !== undefined ? { headshot: kill.headshot } : {}),
    })
    ctx.lastDeath = { t, node: v }
    if (V.id === ctx.carrierId && ctx.plantT === undefined) {
        ctx.bomb.carrier.push({ t, carrierId: null, at })
        ctx.carrierId = null
        ctx.drop = { t, node: v }
        return true
    }
    return false
}

function duelRange(weapon: string | undefined): [number, number] {
    switch (weaponClass(weapon)) {
        case "sniper": return [6, 10]
        case "rifle": return [4, 8.5]
        case "smg": return [3.5, 7]
        case "shotgun": return [2.5, 4.5]
        case "pistol": return [3, 6.5]
        case "knife": return [1, 1.8]
        default: return [3.5, 8]
    }
}

/** Is `n` a node this player can stand on at `t` (reach, pins and the next fixed appointment)? */
function reachable(ctx: Ctx, a: Actor, t: number, speed = 1): (n: number) => boolean {
    const last = a.anchors[a.anchors.length - 1]
    const free = freeFrom(last)
    if (free >= t) return n => n === last.node
    const fromLast = ctx.g.distancesTo(last.node)
    const budget = ctx.v * speed * (t - free) + 1e-6
    const next = a.fixed[0]
    if (!next) return n => fromLast[n] <= budget
    const toNext = ctx.g.distancesTo(next.node)
    const budgetNext = ctx.v * speed * (next.t - t) + 1e-6
    return n => fromLast[n] <= budget && toNext[n] <= budgetNext
}

/** When an anchor lets the player move again (after a plant / defuse pin). */
function freeFrom(anchor: Anchor): number {
    return Math.max(anchor.t, anchor.holdUntil ?? anchor.t)
}

/**
 * Victim and killer nodes for one kill: in duel range on the same floor,
 * reachable by both, and as close as possible to where each would be anyway
 * (moving a holder costs more than moving a walker). Penalties keep the
 * killer the victim's nearest enemy, teammates apart, post-plant fights near
 * the bomb and trades near the previous death.
 */
function chooseDuel(ctx: Ctx, kill: Kill, V: Actor, K: Actor, sV: State, sK: State): { v: number; k: number } {
    const { g } = ctx
    const t = kill.t
    const [lo, hi] = duelRange(kill.weapon)
    const want = ctx.rng.duel.range(lo, hi)
    const minD = weaponClass(kill.weapon) === "knife" ? 0.6 : DUEL_MIN
    const reachV = reachable(ctx, V, t)
    const reachK = reachable(ctx, K, t)
    const fromV = g.distancesTo(sV.node)
    const fromK = g.distancesTo(sK.node)
    const wV = sV.holding ? 3 : 1
    const wK = sK.holding ? 2 : 1
    const others = ctx.actors.filter(a => a.side === K.side && a !== K && alive(a, t)).map(a => stateAt(ctx, a, t))
    const matesV = ctx.actors.filter(a => a.side === V.side && a !== V && alive(a, t)).map(a => stateAt(ctx, a, t))
    const matesK = others
    const bomb = ctx.plantT !== undefined && t >= ctx.plantT ? g.point(ctx.plantNode) : null
    const trade = kill.trade && ctx.lastDeath && t - ctx.lastDeath.t <= 6 ? g.point(ctx.lastDeath.node) : null
    // Lookahead: the killer's next fight must stay within reach of its opponent.
    const nextKill = ctx.kills.find(x => x.t > t && (x.killerId === K.id || x.victimId === K.id))
    const nextFoe = nextKill ? ctx.byId.get(nextKill.killerId === K.id ? nextKill.victimId : nextKill.killerId) : undefined
    let foeDist: Float64Array | null = null
    let foeBound = Infinity
    let foeFixedDist: Float64Array | null = null
    let foeFixedBound = Infinity
    if (nextKill && nextFoe && nextFoe !== V && nextFoe.side !== K.side) {
        const t2 = nextKill.t
        const lastF = nextFoe.anchors[nextFoe.anchors.length - 1]
        foeDist = g.distancesTo(lastF.node)
        foeBound = LOOKAHEAD_MARGIN * (ctx.v * ((t2 - t) + Math.max(0, t2 - freeFrom(lastF))) + DUEL_MAX)
        const f = nextFoe.fixed[0]
        if (f) {
            const radius = t2 <= f.t ? ctx.v * (f.t - t2) : ctx.v * Math.max(0, t2 - freeFrom(f))
            foeFixedDist = g.distancesTo(f.node)
            foeFixedBound = LOOKAHEAD_MARGIN * (ctx.v * (t2 - t) + radius + DUEL_MAX)
        }
    }

    let best: { v: number; k: number } | null = null
    let bestCost = Infinity
    let bestMissesFoe = false
    const consider = (v: number, k: number, walkDist: number) => {
        if (g.floor[v] !== g.floor[k]) return
        const e = g.dist(v, k)
        if (e < minD || e > DUEL_MAX) return
        let cost = wV * fromV[v] + wK * fromK[k] + 1.5 * Math.abs(e - want)
        if (cost >= bestCost) return
        if (!reachV(v) || !reachK(k)) return
        if (walkDist > e * 1.6 + 2) cost += 6
        if (foeDist && foeDist[k] > foeBound) cost += 30 + 4 * (foeDist[k] - foeBound)
        if (foeFixedDist && foeFixedDist[k] > foeFixedBound) cost += 30 + 4 * (foeFixedDist[k] - foeFixedBound)
        const vx = g.x[v], vy = g.y[v], kx = g.x[k], ky = g.y[k]
        for (const o of others) {
            if (o.floor !== g.floor[v]) continue
            const d = len(o.x - vx, o.y - vy)
            if (d < e + 0.3) cost += 10 + 2 * (e - d)
        }
        for (const m of matesV) if (len(m.x - vx, m.y - vy) < 2.5) cost += 5
        for (const m of matesK) if (len(m.x - kx, m.y - ky) < 2.5) cost += 5
        if (bomb) {
            const dv = len(vx - bomb.x, vy - bomb.y)
            const dk = len(kx - bomb.x, ky - bomb.y)
            if (dv > 12) cost += (dv - 12) * 0.8
            if (dk > 14) cost += (dk - 14) * 0.5
        }
        if (trade) {
            const dt = len(kx - trade.x, ky - trade.y)
            if (dt > 7) cost += dt - 7
        }
        if (cost < bestCost) {
            bestCost = cost
            best = { v, k }
            bestMissesFoe = (!!foeDist && foeDist[k] > foeBound) || (!!foeFixedDist && foeFixedDist[k] > foeFixedBound)
        }
    }

    // Along the walk between them (victim nearer its own side) ...
    const path = g.path(sV.node, sK.node)
    if (path.length > 1) {
        const cum = [0]
        for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + g.dist(path[i - 1], path[i]))
        let j = 0
        for (let i = 0; i < path.length; i++) {
            if (j <= i) j = i + 1
            while (j < path.length - 1 && cum[j] - cum[i] < want) j++
            for (let jj = j - 1; jj <= j + 1; jj++) if (jj > i && jj < path.length) consider(path[i], path[jj], cum[jj] - cum[i])
        }
    }
    // ... or one of them stays where they are.
    for (const k of g.around(sV.node, DUEL_MAX)) consider(sV.node, k, fromV[k])
    for (const v of g.around(sK.node, DUEL_MAX)) consider(v, sK.node, fromK[v])
    // ... or, when that strands the killer before its next fight, on its way there.
    if (nextFoe && (!best || bestMissesFoe)) {
        const targets = [nextFoe.anchors[nextFoe.anchors.length - 1].node, ...nextFoe.fixed.slice(0, 1).map(f => f.node)]
        for (const target of targets) {
            for (const k of g.path(sK.node, target)) for (const v of g.around(k, DUEL_MAX)) consider(v, k, g.dist(v, k))
        }
    }
    if (best) return best
    return closestApproach(ctx, V, K, t, want, sV, sK)
}

/**
 * No pair in range is reachable (kills a few seconds into the round across a
 * big map, or back-to-back fights far apart): get as close as the clock and
 * any plant / defuse appointment allow, with the small speed allowance.
 */
function closestApproach(ctx: Ctx, V: Actor, K: Actor, t: number, want: number, sV: State, sK: State): { v: number; k: number } {
    const { g } = ctx
    ctx.violations++
    const reachV = reachable(ctx, V, t, BURST)
    const reachK = reachable(ctx, K, t, BURST)
    const path = g.path(V.anchors[V.anchors.length - 1].node, K.anchors[K.anchors.length - 1].node)
    let vi = -1
    for (let i = 0; i < path.length; i++) if (reachV(path[i])) vi = i
    let ki = -1
    for (let i = path.length - 1; i >= 0; i--) if (reachK(path[i])) ki = i
    if (vi < 0 || ki < 0) return { v: vi >= 0 ? path[vi] : sV.node, k: ki >= 0 ? path[ki] : sK.node }
    if (ki > vi) return { v: path[vi], k: path[ki] }
    // Both can reach the stretch [ki, vi]: keep about `want` between them inside it.
    const cum = [0]
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + g.dist(path[i - 1], path[i]))
    const mid = (cum[ki] + cum[vi]) / 2
    let p = vi
    while (p > 0 && cum[p] > mid - want / 2) p--
    let q = Math.max(ki, p + 1)
    while (q < path.length - 1 && cum[q] - cum[p] < want) q++
    return { v: path[p], k: path[Math.min(q, path.length - 1)] }
}

/** The defuser: alive at the defuse, free of later fights, closest to the bomb; kit → 5 s. */
function chooseDefuser(ctx: Ctx, now: number): void {
    const { g } = ctx
    const td = ctx.defuseT!
    const bomb = ctx.plantNode
    const bp = g.point(bomb)
    const killsAfter = (a: Actor) => ctx.kills.filter(k => k.killerId === a.id && k.t > now).map(k => k.t)
    let best: Actor | undefined
    let bestCost = Infinity
    for (const a of ctx.actors) {
        if (a.side !== "CT" || !alive(a, td)) continue
        const later = killsAfter(a)
        const s = stateAt(ctx, a, now)
        const cost = hyp(s, bp) + (later.length ? 40 + 2 * (Math.max(...later) - now) : 0) + (a.player.hasKit ? -4 : 0)
        if (cost < bestCost) { bestCost = cost; best = a }
    }
    if (!best) return
    const later = killsAfter(best)
    let tStart = td - (best.player.hasKit ? 5 : 10)
    if (later.length) tStart = Math.max(tStart, Math.max(...later) + 0.5)
    else {
        const last = best.anchors[best.anchors.length - 1]
        tStart = Math.max(tStart, freeFrom(last) + g.pathDist(last.node, bomb) / ctx.v)
    }
    tStart = Math.min(Math.max(tStart, now), td)
    best.fixed.push({ t: tStart, node: bomb, holdUntil: td, kind: "defuse", look: bp })
    best.fixed.sort((a, b) => a.t - b.t)
    best.phases = [...best.phases.filter(p => p.t < tStart), { t: tStart, node: bomb, pace: RUN_PACE, look: bp }]
    best.tail = undefined
    ctx.bomb.defuse = { tStart: round3(tStart), tEnd: td, defuserId: best.id, success: true }
}

/** The closest living T walks over and picks up a dropped bomb (if nothing else is due first). */
function pickUpBomb(ctx: Ctx, now: number): void {
    const drop = ctx.drop
    if (!drop) return
    let best: { a: Actor; t: number } | null = null
    for (const a of ctx.actors) {
        if (a.side !== "T" || !alive(a, now)) continue
        const last = a.anchors[a.anchors.length - 1]
        if (last.dead || last.t > now) continue
        const s = stateAt(ctx, a, now)
        const arrive = now + ctx.g.pathDist(s.node, drop.node) / (ctx.v * PLAN_PACE)
        const nextEvent = a.eventTimes.find(x => x > now) ?? Infinity
        if (arrive + 0.5 >= nextEvent || arrive >= ctx.endTime - 1 || arrive >= a.deathT) continue
        if (!best || arrive < best.t) best = { a, t: arrive }
    }
    if (!best) return
    pushAnchor(best.a, { t: best.t, node: drop.node })
    ctx.bomb.carrier.push({ t: round3(best.t), carrierId: best.a.id })
    ctx.carrierId = best.a.id
    ctx.drop = undefined
}

// ─── Tracks ────────────────────────────────────────────────────────────────

function assembleSteps(ctx: Ctx, a: Actor): Step[] {
    const out: Step[] = []
    const n = a.anchors.length
    for (let i = 0; i < n; i++) {
        const anchor = a.anchors[i]
        const seg = i < n - 1 ? legOf(ctx, a, i)
            : anchor.dead ? [{ t: anchor.t, node: anchor.node, aimAt: anchor.aimAt }]
                : defaultSteps(ctx, a, anchor, ctx.endTime)
        for (const s of seg) {
            const last = out[out.length - 1]
            if (last && s.t <= last.t + 1e-6) {
                if (s.node === last.node || s.t < last.t - 1e-6) {
                    if (s.aimAt) last.aimAt = s.aimAt
                    continue
                }
            }
            out.push({ ...s })
        }
    }
    return out
}

function toKeys(g: NavGraph, steps: Step[]): TrackKey[] {
    const keys: TrackKey[] = []
    if (!steps.length) return keys
    const firstMove = steps.find(s => s.node !== steps[0].node)
    let aim = firstMove ? angle(g.point(steps[0].node), g.point(firstMove.node)) : 0
    const push = (t: number, x: number, y: number, floor: Floor, a: number) => {
        const last = keys[keys.length - 1]
        const key = { t, x, y, floor, aim: a }
        if (last && key.t <= last.t + 1e-6) keys[keys.length - 1] = key
        else keys.push(key)
    }
    for (let i = 0; i < steps.length; i++) {
        const s = steps[i]
        const nx = steps[i + 1]
        const p = g.point(s.node)
        const moving = !!nx && nx.node !== s.node
        if (s.aimAt) aim = angle(p, s.aimAt)
        else if (moving) aim = angle(p, g.point(nx.node))
        else if (s.look) aim = angle(p, s.look)
        push(s.t, p.x, p.y, p.floor, aim)
        if (!nx) break
        const dt = nx.t - s.t
        if (moving) {
            const q = g.point(nx.node)
            const dir = angle(p, q)
            const pieces = Math.ceil(dt / MAX_KEY_GAP - 1e-9)
            for (let k = 1; k < pieces; k++) {
                const u = k / pieces
                push(s.t + dt * u, p.x + (q.x - p.x) * u, p.y + (q.y - p.y) * u, u < 0.5 ? p.floor : q.floor, dir)
            }
        } else if (dt > 0.6) {
            // Keep the hold aim until just before the next key.
            push(nx.t - 0.3, p.x, p.y, p.floor, aim)
        }
    }
    return keys
}

/** Cut a track at `end` (the last walk may run past the round end). */
function clipKeys(keys: TrackKey[], end: number): TrackKey[] {
    const i = keys.findIndex(k => k.t > end + 1e-9)
    if (i <= 0) return keys
    const a = keys[i - 1], b = keys[i]
    const out = keys.slice(0, i)
    if (end > a.t + 1e-6) {
        const u = (end - a.t) / (b.t - a.t)
        out.push({ t: end, x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, floor: u < 0.5 ? a.floor : b.floor, aim: a.aim })
    }
    return out
}

function roundKeys(keys: TrackKey[]): TrackKey[] {
    const out: TrackKey[] = []
    for (const k of keys) {
        const key = { t: round3(k.t), x: round2(k.x), y: round2(k.y), floor: k.floor, aim: round3(k.aim) }
        if (out.length && key.t <= out[out.length - 1].t) out[out.length - 1] = key
        else out.push(key)
    }
    return out
}

/** Sideways step (map-%) a walker takes when a teammate walks right next to them. */
const SIDESTEP = 1.4
/** How fast the sidestep builds up / fades (map-% per second). */
const SIDESTEP_RATE = 1.2
const CROWD = 2.8

/**
 * Teammates walking the same corridor at the same time step up to SIDESTEP
 * apart, perpendicular to where they walk. The step builds up before the
 * encounter and fades after it, never while standing or within 0.6 s of a
 * kill / plant / defuse, and is smoothed away wherever it would push a
 * segment over the speed limit.
 */
function spaceTeammates(ctx: Ctx, raw: Map<Actor, TrackKey[]>): void {
    const plans = new Map<Actor, { shift: XY[]; room: Float64Array }>()
    for (const a of ctx.actors) {
        const keys = raw.get(a)!
        const n = keys.length
        const shift: XY[] = keys.map(() => ({ x: 0, y: 0 }))
        const room = new Float64Array(n)
        plans.set(a, { shift, room })
        if (n < 3) continue
        const mates = ctx.actors.filter(b => b !== a && b.side === a.side)
        const cursor = mates.map(() => 0)
        const pinned = a.anchors.flatMap(x => (x.holdUntil !== undefined ? [x.t, x.holdUntil] : [x.t]))
        const need = new Float64Array(n)
        const sign = new Float64Array(n)
        const dirX = new Float64Array(n)
        const dirY = new Float64Array(n)
        let lastMate = ""
        let lastSign = 1
        for (let i = 1; i < n - 1; i++) {
            const k = keys[i], prev = keys[i - 1], next = keys[i + 1]
            const span = len(next.x - prev.x, next.y - prev.y)
            if (span > 1e-6) { dirX[i] = (next.x - prev.x) / span; dirY[i] = (next.y - prev.y) / span }
            const dIn = len(k.x - prev.x, k.y - prev.y)
            const dOut = len(next.x - k.x, next.y - k.y)
            if (dIn < 1e-3 || dOut < 1e-3) continue
            if (Math.max(dIn / (k.t - prev.t), dOut / (next.t - k.t)) > ctx.v + 1e-6) continue
            if (pinned.some(t => Math.abs(t - k.t) < 0.6)) continue
            room[i] = SIDESTEP
            let best = CROWD, bx = 0, by = 0, bOrder = 0, bDot = 1, bId = ""
            mates.forEach((b, j) => {
                if (b.deathT <= k.t) return
                const bk = raw.get(b)!
                let c = cursor[j]
                while (c + 1 < bk.length && bk[c + 1].t <= k.t) c++
                cursor[j] = c
                const p = bk[c], q = bk[c + 1] ?? p
                const u = q.t > p.t ? Math.min(1, Math.max(0, (k.t - p.t) / (q.t - p.t))) : 0
                if ((u < 0.5 ? p.floor : q.floor) !== k.floor) return
                const x = p.x + (q.x - p.x) * u, y = p.y + (q.y - p.y) * u
                const d = len(x - k.x, y - k.y)
                if (d < best) { best = d; bx = x; by = y; bOrder = b.order; bId = b.id; bDot = dirX[i] * (q.x - p.x) + dirY[i] * (q.y - p.y) }
            })
            if (best >= CROWD) continue
            need[i] = SIDESTEP
            // Already side by side: keep those sides. Else a fixed rule per pair (and stick to it).
            const across = -dirY[i] * (k.x - bx) + dirX[i] * (k.y - by)
            if (Math.abs(across) >= 0.8) sign[i] = Math.sign(across)
            else if (bId === lastMate) sign[i] = lastSign
            else sign[i] = a.order < bOrder ? 1 : bDot >= 0 ? -1 : 1
            lastMate = bId
            lastSign = sign[i]
        }
        // Smooth the walking direction (bends) both ways, ~0.6 s.
        for (const order of [1, -1]) {
            for (let s = 1; s < n; s++) {
                const i = order > 0 ? s : n - 1 - s
                const j = i - order
                if (!dirX[i] && !dirY[i]) { dirX[i] = dirX[j]; dirY[i] = dirY[j]; continue }
                const w = Math.exp(-Math.abs(keys[i].t - keys[j].t) / 0.6)
                const x = w * dirX[j] + (1 - w) * dirX[i], y = w * dirY[j] + (1 - w) * dirY[i]
                const m = len(x, y)
                if (m > 1e-6) { dirX[i] = x / m; dirY[i] = y / m }
            }
        }
        // Magnitude: ramps up before and down after every crowded key, capped by a ramped `room`.
        const mag = new Float64Array(n)
        const stepAt = (i: number, j: number) => SIDESTEP_RATE * Math.abs(keys[i].t - keys[j].t)
        for (let i = 0, f = 0; i < n; i++) { f = Math.max(need[i], f - (i ? stepAt(i, i - 1) : 0)); mag[i] = f }
        for (let i = n - 1, b = 0; i >= 0; i--) { b = Math.max(need[i], b - (i < n - 1 ? stepAt(i, i + 1) : 0)); mag[i] = Math.max(mag[i], b) }
        for (let i = 1; i < n; i++) room[i] = Math.min(room[i], room[i - 1] + stepAt(i, i - 1))
        for (let i = n - 2; i >= 0; i--) room[i] = Math.min(room[i], room[i + 1] + stepAt(i, i + 1))
        // Side: the one chosen at the nearest crowded key in time.
        const fwd: [number, number][] = []
        for (let i = 0, s = 0, ts = -Infinity; i < n; i++) { if (need[i]) { s = sign[i]; ts = keys[i].t } fwd.push([s, ts]) }
        for (let i = n - 1, s = 0, ts = Infinity; i >= 0; i--) {
            if (need[i]) { s = sign[i]; ts = keys[i].t }
            const [sf, tf] = fwd[i]
            const side = keys[i].t - tf <= ts - keys[i].t ? sf : s
            const m = Math.min(mag[i], room[i]) * side
            shift[i] = { x: -dirY[i] * m, y: dirX[i] * m }
        }
    }
    for (const a of ctx.actors) {
        const keys = raw.get(a)!
        const { shift, room } = plans.get(a)!
        const limit = (i: number) => Math.max(ctx.v * 1.08, len(keys[i].x - keys[i - 1].x, keys[i].y - keys[i - 1].y) / (keys[i].t - keys[i - 1].t))
        const fast = (i: number) => {
            const dt = keys[i].t - keys[i - 1].t
            if (dt <= 0) return false
            const d = len(keys[i].x + shift[i].x - keys[i - 1].x - shift[i - 1].x, keys[i].y + shift[i].y - keys[i - 1].y - shift[i - 1].y)
            return d / dt > limit(i) + 1e-6
        }
        // Smooth any segment the shift made too fast (keys with no room stay unshifted), then give up on it.
        for (let pass = 0; pass < 60; pass++) {
            let clean = true
            for (let i = 1; i < keys.length; i++) {
                if (!fast(i)) continue
                clean = false
                const mx = (shift[i].x + shift[i - 1].x) / 2, my = (shift[i].y + shift[i - 1].y) / 2
                for (const j of [i - 1, i]) shift[j] = room[j] > 0 ? { x: (shift[j].x + mx) / 2, y: (shift[j].y + my) / 2 } : { x: 0, y: 0 }
            }
            if (clean) break
        }
        for (let changed = true; changed;) {
            changed = false
            for (let i = 1; i < keys.length; i++) {
                if (!fast(i)) continue
                shift[i] = { x: 0, y: 0 }
                shift[i - 1] = { x: 0, y: 0 }
                changed = true
            }
        }
        keys.forEach((k, i) => { k.x += shift[i].x; k.y += shift[i].y })
    }
}

// ─── Utility ───────────────────────────────────────────────────────────────

function throwUtility(ctx: Ctx): ScriptUtility[] {
    const rng = ctx.rng.util
    const out: ScriptUtility[] = []
    const volley = (side: Side, site: SiteId, t0: number, throwers: Actor[]) => {
        let i = 0
        for (const kind of ["smoke", "molotov", "he", "flash"] as const) {
            const spots = rng.shuffle(ctx.map.utility.filter(u => u.site === site && u.side === side && u.kind === kind))
            if (!spots.length) continue
            let used = 0
            for (const a of throwers) {
                for (let c = 0; c < (a.player.utility[kind] ?? 0); c++) {
                    // One smoke / molotov per spot; flashes and HEs may share one.
                    if (used >= spots.length && (kind === "smoke" || kind === "molotov")) break
                    const spot = spots[used++ % spots.length]
                    const t = round3(Math.max(1, t0 + 0.35 * i++))
                    if (t >= a.deathT || t >= ctx.endTime) continue
                    out.push({ t, throwerId: a.id, kind, at: { ...spot.at }, radius: spot.radius, duration: UTILITY_SECONDS[kind] })
                }
            }
        }
    }
    const ts = ctx.actors.filter(a => a.side === "T")
    const cts = ctx.actors.filter(a => a.side === "CT")
    const execT = ctx.strategy === "rush" ? ctx.trigger - 3 : ctx.execAt - 2
    volley("T", other(ctx.site), ctx.execAt - 9, ts.filter(a => a.job === "fake"))
    volley("T", ctx.site, execT, ts.filter(a => a.job !== "fake" && a.job !== "lurk"))
    volley("CT", ctx.site, ctx.plantT !== undefined ? ctx.plantT + rng.range(4, 8) : ctx.trigger + 0.5, cts)
    return out.sort((a, b) => a.t - b.t)
}

// ─── Math ──────────────────────────────────────────────────────────────────

function angle(from: XY, to: XY): number {
    return Math.atan2(to.y - from.y, to.x - from.x)
}

function lerpAngle(a: number, b: number, u: number): number {
    let d = (b - a) % (Math.PI * 2)
    if (d > Math.PI) d -= Math.PI * 2
    if (d < -Math.PI) d += Math.PI * 2
    let r = a + d * u
    if (r > Math.PI) r -= Math.PI * 2
    if (r <= -Math.PI) r += Math.PI * 2
    return r
}

const round2 = (v: number) => Math.round(v * 100) / 100
const round3 = (v: number) => Math.round(v * 1000) / 1000
const roundPoint = (p: RPoint): RPoint => ({ x: round2(p.x), y: round2(p.y), floor: p.floor })
