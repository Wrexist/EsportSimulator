/**
 * Round script timeline: default motion between anchors, and the resolver's
 * events in time order — each KILL placed as an in-range duel, plant and
 * defuse appointments, bomb drops and pickups.
 */

import type { NavGraph } from "./round-script-nav"
import { RUN_PACE, PLAN_PACE, len, weaponClass, hyp, alive, round3, roundPoint } from "./round-script-context"
import type { Phase, Anchor, Step, Actor, Kill, State, Ctx } from "./round-script-context"
import { zonePoint } from "./round-sim/zones"
import { segmentHitsCircle, visibilityFor } from "./round-script-visibility"

// Math is read once: global lookups are very slow inside Jest's sandbox (tests time the builder).
const { abs, max, min } = Math

export const DUEL_MIN = 2.5
export const DUEL_MAX = 10
/** Speed allowance (× runSpeed) used only when a duel cannot be reached at run speed. */
export const BURST = 1.08
/** Share of the theoretical reach a killer may use before its next fight (keeps slack for the duel itself). */
export const LOOKAHEAD_MARGIN = 0.75
/** script-v1: a duel more than this far (map-%) from the resolver's zone pays ZONE_PULL per extra map-%. */
export const ZONE_RADIUS = 3
export const ZONE_PULL = 6
/** script-v1: beyond this the duel is no longer "at" the zone: a wall the movement costs rarely beat. */
export const ZONE_HARD = 6.5
export const ZONE_WALL = 80
/** script-v1: victim spots tried around the resolver's zone (map-%). */
export const ZONE_SPREAD = 4
/** A duel spot pair without line of sight (a wall between them) or through a smoke: practically never chosen. */
export const NO_SIGHT = 120
export const THROUGH_SMOKE = 60
/** A duel spot in plain sight of a close enemy who is not in this fight (map-%, cost): the bystander would shoot. */
export const BYSTANDER_RANGE = 8
export const BYSTANDER = 25

// ─── Default motion, legs, sampling of the plan ────────────────────────────

export function phaseAt(phases: Phase[], t: number): number {
    let i = 0
    while (i + 1 < phases.length && phases[i + 1].t <= t) i++
    return i
}

/** Follow the phase homes from an anchor until `horizon`. */
export function defaultSteps(ctx: Ctx, a: Actor, from: Anchor, horizon: number): Step[] {
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
                t += g.cost(path[i - 1], path[i]) / speed
                cur = path[i]
                steps.push({ t, node: cur })
                if (t >= horizon || t >= nextT) break
            }
        }
        if (t >= horizon) break
        if (cur === ph.node || t < nextT) {
            if (cur === ph.node && !steps[steps.length - 1].aimAt) steps[steps.length - 1].look = ph.look
            const until = min(nextT, horizon)
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
/**
 * Two anchors this close (seconds), with time to walk between them: the player
 * holds where the first left them instead of drifting back toward their
 * default spot and returning (back-and-forth between quick kills).
 */
export const SHORT_LEG = 4

export function legSteps(ctx: Ctx, a: Actor, from: Anchor, to: Anchor): Step[] {
    const { g, v } = ctx
    const dist = g.distancesTo(to.node)
    const gap = to.t - from.t
    const def = from.holdUntil === undefined && gap <= SHORT_LEG && dist[from.node] / v <= gap
        ? [{ t: from.t, node: from.node, look: from.look, aimAt: from.aimAt }, { t: to.t, node: from.node, look: from.look }]
        : defaultSteps(ctx, a, from, to.t)
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
        dep = max(dep, s.t)
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
export function walk(g: NavGraph, out: Step[], from: number, to: number, t0: number, t1: number): void {
    if (from === to) return
    const path = g.path(from, to)
    let total = 0
    for (let j = 1; j < path.length; j++) total += g.cost(path[j - 1], path[j])
    let acc = 0
    for (let j = 1; j < path.length - 1; j++) {
        acc += g.cost(path[j - 1], path[j])
        out.push({ t: t0 + (t1 - t0) * (acc / total), node: path[j] })
    }
}

export function legOf(ctx: Ctx, a: Actor, i: number): Step[] {
    let leg = a.legs[i]
    if (!leg) {
        leg = legSteps(ctx, a, a.anchors[i], a.anchors[i + 1])
        a.legs[i] = leg
    }
    return leg
}

export function tailOf(ctx: Ctx, a: Actor): Step[] {
    const from = a.anchors.length - 1
    if (!a.tail || a.tail.from !== from) a.tail = { from, steps: defaultSteps(ctx, a, a.anchors[from], ctx.endTime) }
    return a.tail.steps
}

/** Where a player is at `t` under everything decided so far. */
export function stateAt(ctx: Ctx, a: Actor, t: number): State {
    let i = a.anchors.length - 1
    while (i > 0 && a.anchors[i].t > t) i--
    const anchor = a.anchors[i]
    if (anchor.dead) return { node: anchor.node, ...ctx.g.point(anchor.node), holding: true }
    const steps = i === a.anchors.length - 1 ? tailOf(ctx, a) : legOf(ctx, a, i)
    return sampleSteps(ctx.g, steps, t)
}

export function sampleSteps(g: NavGraph, steps: Step[], t: number): State {
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

export function pushAnchor(a: Actor, anchor: Anchor): void {
    a.anchors.push(anchor)
    a.tail = undefined
}

// ─── Timeline ──────────────────────────────────────────────────────────────

export interface QueuedEvent {
    t: number
    order: number
    kind: "kill" | "defuse" | "pickup"
    kill?: Kill
}

export function runTimeline(ctx: Ctx): void {
    const queue: QueuedEvent[] = ctx.kills.map((kill, i) => ({ t: kill.t, order: i, kind: "kill", kill }))
    if (ctx.defuseT !== undefined && ctx.plantT !== undefined) queue.push({ t: max(ctx.plantT, ctx.defuseT - 10), order: -1, kind: "defuse" })
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
export function commitFixed(ctx: Ctx, t: number): void {
    for (const a of ctx.actors) {
        while (a.fixed.length && a.fixed[0].t <= t) {
            const f = a.fixed.shift()!
            const last = a.anchors[a.anchors.length - 1]
            if (last.dead) continue
            // Late: arrive as soon as possible (a shorter plant / defuse) rather than teleport.
            const arrive = freeFrom(last) + ctx.g.pathDist(last.node, f.node) / ctx.v
            if (arrive > f.t + 1e-6) {
                if (f.t > last.t) ctx.violations++
                f.t = min(arrive, f.holdUntil ?? arrive)
                if (f.kind === "defuse" && ctx.bomb.defuse) ctx.bomb.defuse.tStart = round3(f.t)
            }
            if (f.t < last.t) f.t = last.t
            pushAnchor(a, f)
        }
    }
}

/** Returns true when the bomb was dropped by this death. */
export function placeKill(ctx: Ctx, kill: Kill): boolean {
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

export function duelRange(weapon: string | undefined): [number, number] {
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
export function reachable(ctx: Ctx, a: Actor, t: number, speed = 1): (n: number) => boolean {
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
export function freeFrom(anchor: Anchor): number {
    return max(anchor.t, anchor.holdUntil ?? anchor.t)
}

/**
 * Victim and killer nodes for one kill: in duel range on the same floor,
 * reachable by both, and as close as possible to where each would be anyway
 * (moving a holder costs more than moving a walker). Penalties keep the
 * killer the victim's nearest enemy, teammates apart, post-plant fights near
 * the bomb and trades near the previous death.
 */
export function chooseDuel(ctx: Ctx, kill: Kill, V: Actor, K: Actor, sV: State, sK: State): { v: number; k: number } {
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
    // script-v1: the resolver says where this fight happened (and that replaces the bomb / trade guesses).
    const zone = kill.zone ? zonePoint(ctx.map, kill.zone) : undefined
    const vis = visibilityFor(g)
    const smokes = ctx.smokes.filter(s => t >= s.t0 && t <= s.t1)
    const bomb = !zone && ctx.plantT !== undefined && t >= ctx.plantT ? g.point(ctx.plantNode) : null
    const trade = !zone && kill.trade && ctx.lastDeath && t - ctx.lastDeath.t <= 6 ? g.point(ctx.lastDeath.node) : null
    // Lookahead: the killer's next fight must stay within reach of its opponent.
    const nextKill = ctx.kills.find(x => x.t > t && (x.killerId === K.id || x.victimId === K.id))
    const nextFoe = nextKill ? ctx.byId.get(nextKill.killerId === K.id ? nextKill.victimId : nextKill.killerId) : undefined
    let foeDist: Float64Array | null = null
    let foeBound = Infinity
    /** Beyond this the next fight cannot be reached at all (not just with little slack): it outweighs the zone. */
    let foeHard = Infinity
    let foeFixedDist: Float64Array | null = null
    let foeFixedBound = Infinity
    const nextZone = nextKill?.zone ? zonePoint(ctx.map, nextKill.zone) : undefined
    if (nextKill && nextZone) {
        // script-v1: the next fight has a place; stay within reach of it.
        foeDist = g.distancesTo(g.nearest(nextZone))
        foeBound = LOOKAHEAD_MARGIN * ctx.v * (nextKill.t - t) + DUEL_MAX
        foeHard = ctx.v * (nextKill.t - t) + DUEL_MAX + ZONE_SPREAD
    } else if (nextKill && nextFoe && nextFoe !== V && nextFoe.side !== K.side) {
        const t2 = nextKill.t
        const lastF = nextFoe.anchors[nextFoe.anchors.length - 1]
        foeDist = g.distancesTo(lastF.node)
        foeBound = LOOKAHEAD_MARGIN * (ctx.v * ((t2 - t) + max(0, t2 - freeFrom(lastF))) + DUEL_MAX)
    }
    if (nextKill && nextFoe && nextFoe !== V && nextFoe.side !== K.side) {
        const t2 = nextKill.t
        const f = nextFoe.fixed[0]
        if (f) {
            const radius = t2 <= f.t ? ctx.v * (f.t - t2) : ctx.v * max(0, t2 - freeFrom(f))
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
        let cost = wV * fromV[v] + wK * fromK[k] + 1.5 * abs(e - want)
        const vx = g.x[v], vy = g.y[v], kx = g.x[k], ky = g.y[k]
        if (zone && zone.floor === g.floor[v]) {
            const dz = len((vx + kx) / 2 - zone.x, (vy + ky) / 2 - zone.y)
            if (dz > ZONE_RADIUS) cost += ZONE_PULL * (dz - ZONE_RADIUS) + (dz > ZONE_HARD ? ZONE_WALL + 10 * (dz - ZONE_HARD) : 0)
        }
        if (!vis.sees(v, k)) cost += NO_SIGHT
        if (cost >= bestCost) return
        for (let si = 0; si < smokes.length; si++) {
            const sm = smokes[si]
            if (sm.at.floor === g.floor[v] && segmentHitsCircle(g.point(k), g.point(v), sm.at, sm.r)) { cost += THROUGH_SMOKE; break }
        }
        if (cost >= bestCost) return
        if (!reachV(v) || !reachK(k)) return
        if (walkDist > e * 1.6 + 2) cost += 6
        if (foeDist && foeDist[k] > foeBound) cost += 30 + 4 * (foeDist[k] - foeBound) + (foeDist[k] > foeHard ? 2 * ZONE_WALL : 0)
        if (foeFixedDist && foeFixedDist[k] > foeFixedBound) cost += 30 + 4 * (foeFixedDist[k] - foeFixedBound)
        for (const o of others) {
            if (o.floor !== g.floor[v]) continue
            const d = len(o.x - vx, o.y - vy)
            if (d < e + 0.3) cost += 10 + 2 * (e - d)
        }
        for (const m of matesV) if (len(m.x - vx, m.y - vy) < 2.5) cost += 5
        for (const m of matesK) if (len(m.x - kx, m.y - ky) < 2.5) cost += 5
        // The killer stays on after the kill: the victim's teammates nearby should not have a clear view of the spot.
        for (const m of matesV) {
            if (m.floor !== g.floor[k] || len(m.x - kx, m.y - ky) > BYSTANDER_RANGE) continue
            if (vis.sees(k, m.node)) cost += BYSTANDER
        }
        if (cost >= bestCost) return
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

    // script-v1: where the resolver says the fight happened, when both can make it there ...
    if (zone) {
        const zn = g.nearest(zone)
        for (const v of g.around(zn, ZONE_SPREAD)) for (const k of g.around(v, hi)) consider(v, k, g.dist(v, k))
    }
    // ... along the walk between them (victim nearer its own side) ...
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
    // ... or, when nothing else fits, on the way to a plant / defuse appointment (those are fixed).
    if (!best) {
        for (const [A, sA] of [[K, sK], [V, sV]] as const) {
            const f = A.fixed[0]
            if (!f) continue
            for (const n of g.path(sA.node, f.node)) for (const m of g.around(n, DUEL_MAX)) {
                if (A === K) consider(m, n, g.dist(m, n))
                else consider(n, m, g.dist(m, n))
            }
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
export function closestApproach(ctx: Ctx, V: Actor, K: Actor, t: number, want: number, sV: State, sK: State): { v: number; k: number } {
    const { g } = ctx
    ctx.violations++
    const reachV = reachable(ctx, V, t, BURST)
    const reachK = reachable(ctx, K, t, BURST)
    const path = g.path(V.anchors[V.anchors.length - 1].node, K.anchors[K.anchors.length - 1].node)
    let vi = -1
    for (let i = 0; i < path.length; i++) if (reachV(path[i])) vi = i
    let ki = -1
    for (let i = path.length - 1; i >= 0; i--) if (reachK(path[i])) ki = i
    // Nothing on the way between them: stay put (the sampled node can sit a little ahead of the walk; the last anchor never does).
    const stay = (A: Actor, s: State, reach: (n: number) => boolean) => (reach(s.node) ? s.node : A.anchors[A.anchors.length - 1].node)
    if (vi < 0 || ki < 0) return { v: vi >= 0 ? path[vi] : stay(V, sV, reachV), k: ki >= 0 ? path[ki] : stay(K, sK, reachK) }
    if (ki > vi) return { v: path[vi], k: path[ki] }
    // Both can reach the stretch [ki, vi]: keep about `want` between them inside it.
    const cum = [0]
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + g.cost(path[i - 1], path[i]))
    const mid = (cum[ki] + cum[vi]) / 2
    let p = vi
    while (p > 0 && cum[p] > mid - want / 2) p--
    let q = max(ki, p + 1)
    while (q < path.length - 1 && cum[q] - cum[p] < want) q++
    return { v: path[p], k: path[min(q, path.length - 1)] }
}

/** The defuser: alive at the defuse, free of later fights, closest to the bomb; kit → 5 s. */
export function chooseDefuser(ctx: Ctx, now: number): void {
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
        // Someone who cannot walk to the bomb in time for the defuse is a poor pick, one who cannot make it at all a last resort.
        const arrive = now + g.pathDist(s.node, bomb) / ctx.v
        const late = arrive - (td - (a.player.hasKit ? 5 : 10))
        const cost = hyp(s, bp) + (later.length ? 40 + 2 * (max(...later) - now) : 0) + (a.player.hasKit ? -4 : 0)
            + (late > 0 ? 20 + 10 * late : 0) + (arrive > td ? 400 : 0)
        if (cost < bestCost) { bestCost = cost; best = a }
    }
    if (!best) return
    const later = killsAfter(best)
    let tStart = td - (best.player.hasKit ? 5 : 10)
    if (later.length) tStart = max(tStart, max(...later) + 0.5)
    else {
        const last = best.anchors[best.anchors.length - 1]
        tStart = max(tStart, freeFrom(last) + g.pathDist(last.node, bomb) / ctx.v)
    }
    tStart = min(max(tStart, now), td)
    best.fixed.push({ t: tStart, node: bomb, holdUntil: td, kind: "defuse", look: bp })
    best.fixed.sort((a, b) => a.t - b.t)
    best.phases = [...best.phases.filter(p => p.t < tStart), { t: tStart, node: bomb, pace: RUN_PACE, look: bp }]
    best.tail = undefined
    ctx.bomb.defuse = { tStart: round3(tStart), tEnd: td, defuserId: best.id, success: true }
}

/** The closest living T walks over and picks up a dropped bomb (if nothing else is due first). */
export function pickUpBomb(ctx: Ctx, now: number): void {
    const drop = ctx.drop
    if (!drop) return
    let best: { a: Actor; t: number } | null = null
    for (const a of ctx.actors) {
        if (a.side !== "T" || !alive(a, now)) continue
        const last = a.anchors[a.anchors.length - 1]
        if (last.dead || last.t > now) continue
        const s = stateAt(ctx, a, now)
        // From where they are now, and never sooner than the walk from their last fixed spot allows.
        const pace = ctx.v * PLAN_PACE
        const arrive = max(now + ctx.g.pathDist(s.node, drop.node) / pace, freeFrom(last) + ctx.g.pathDist(last.node, drop.node) / pace)
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
