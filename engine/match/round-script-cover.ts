/**
 * Round script cover pass: nobody holds a spot in plain sight of a close
 * enemy they are not about to fight.
 *
 * The resolver decides who fights whom and when; the timeline places those
 * duels. Everything else is default motion (stage, hold, post-plant spots),
 * planned without looking at the other team, so a T staging for the execute
 * and the CT anchor watching that corridor could stand 1–5 map-% apart in
 * line of sight for a minute with no shot fired (audit 2026-10-23: 92 % of
 * rounds had such a stand-off, the worst lasted 71 s).
 *
 * After the timeline, every stretch a living player stands still is checked
 * every SAMPLE_SECONDS: an enemy within EXPOSE_RANGE who can see the spot
 * (baked line of sight, smokes block) and is not about to duel this player
 * (a KILL between the two within ENGAGE_GRACE) is an exposure. The holder
 * then steps back into the nearest cover (a node within COVER_RANGE that no
 * enemy sees during the exposure) and peeks back on time for whatever comes
 * next: every anchor (duel, plant, defuse, pickup) stays exactly where and
 * when the timeline put it, and walking speed never exceeds the run speed.
 *
 * Pure and deterministic; it only edits holding stretches.
 */

import { len, WALK_PACE } from "./round-script-context"
import type { Actor, Ctx, Step } from "./round-script-context"
import { segmentHitsCircle, visibilityFor } from "./round-script-visibility"
import type { RPoint } from "./round-script-types"

const { max, min } = Math

/** Seconds between exposure checks while a player holds. */
export const SAMPLE_SECONDS = 0.5
/** Map-% within which an enemy in sight is a fight that has to happen (≈ 13 m). */
export const EXPOSE_RANGE = 10
/** A KILL between the two this soon makes the sighting the start of that duel (not a stand-off). */
export const ENGAGE_GRACE = 2.5
/** Shortest hold worth checking (seconds). */
export const MIN_HOLD = 1
/** How far (map-%) a holder looks for cover, and the longest walk there. */
export const COVER_RANGE = 16
export const COVER_WALK = 18
/** Exposures closer than this in time are one exposure (seconds). */
export const MERGE_GAP = 1.5
/** Teammates in cover keep at least this far apart (map-%). */
export const COVER_SPACING = 2.2
/** Candidates tried for partial cover when nothing nearby is fully hidden. */
export const PARTIAL_CANDIDATES = 16

/** Without any cover, a holder steps aside to stay at least this far (map-%) from a passing enemy. */
export const STEP_ASIDE = 6

/** Waits one walker may take in a round, and how far back (seconds) on their walk they look for a spot to wait. */
export const MAX_YIELDS = 4
export const YIELD_LOOKBACK = 6
/** A wait spot stays hidden this long (seconds) after the walker sets off again. */
export const YIELD_MARGIN = 1
/** How much earlier than strictly needed (seconds) a walker may set off to pass before an enemy arrives. */
export const LEAVE_EARLY_MAX = 6
/** Walks per player re-planned around enemy sight lines. */
export const MAX_REROUTES = 6
/** Sight-aware detour: extra cost (map-%) per second a node is in sight of an enemy the walker is not fighting. */
export const SIGHT_COST = 8
/** A detour may be this much longer than the shortest walk (× its length, + map-%). */
export const DETOUR_MAX = 1.8
export const DETOUR_EXTRA = 3

export interface CoverStats {
    /** Holding stretches that were exposed. */
    exposed: number
    /** Of those, how many moved into cover. */
    covered: number
    /** Walks that waited for an enemy to pass. */
    yielded: number
    /** Walks that took another way round an enemy. */
    rerouted: number
}

export interface Smoke { t0: number; t1: number; at: RPoint; r: number }

export function applyCover(ctx: Ctx, steps: Map<Actor, Step[]>, smokes: readonly Smoke[]): CoverStats {
    const stats: CoverStats = { exposed: 0, covered: 0, yielded: 0, rerouted: 0 }
    const { g } = ctx
    const vis = visibilityFor(g)
    const N = ctx.actors.length
    const idx = new Map<Actor, number>()
    ctx.actors.forEach((a, i) => idx.set(a, i))
    // Kill times per pair (either order), for the engagement grace.
    const duelTimes: (number[] | undefined)[] = new Array(N * N)
    for (const k of ctx.kills) {
        const ki = idx.get(ctx.byId.get(k.killerId)!), vi = idx.get(ctx.byId.get(k.victimId)!)
        if (ki === undefined || vi === undefined) continue
        ;(duelTimes[ki * N + vi] ??= []).push(k.t)
        ;(duelTimes[vi * N + ki] ??= []).push(k.t)
    }
    const engaged = (ai: number, ei: number, t: number) => {
        const list = duelTimes[ai * N + ei]
        if (!list) return false
        for (const k of list) if (k >= t - 1e-6 && k <= t + ENGAGE_GRACE) return true
        return false
    }
    const smoked = (t: number, n: number, m: number) => {
        for (let i = 0; i < smokes.length; i++) {
            const s = smokes[i]
            if (t < s.t0 || t > s.t1 || s.at.floor !== g.floor[n]) continue
            if (segmentHitsCircle(g.point(n), g.point(m), s.at, s.r)) return true
        }
        return false
    }

    // Every player's node on a fixed time grid (t_k = k·SAMPLE_SECONDS + 0.25; -1 = dead / not yet moving),
    // rebuilt for a player whenever the pass edits their steps.
    const K = Math.ceil(ctx.endTime / SAMPLE_SECONDS) + 1
    const tAt = (k: number) => k * SAMPLE_SECONDS + 0.25
    const grid: (Int32Array | null)[] = new Array(N).fill(null)
    const gridOf = (i: number): Int32Array => {
        let gr = grid[i]
        if (gr) return gr
        gr = new Int32Array(K).fill(-1)
        const a = ctx.actors[i]
        const es = steps.get(a)
        // One sweep with a cursor (k and the steps both run forward): the node a walker is nearer to.
        if (es?.length) for (let k = 0, c = 0; k < K; k++) {
            const t = tAt(k)
            if (t < es[0].t || !(a.deathT > t)) continue
            while (c + 1 < es.length && es[c + 1].t <= t) c++
            const s0 = es[c], s1 = es[c + 1]
            gr[k] = !s1 || s1.node === s0.node || (t - s0.t) < (s1.t - s0.t) / 2 ? s0.node : s1.node
        }
        grid[i] = gr
        return gr
    }
    const enemiesOf = ctx.actors.map(a => ctx.actors.map((e, j) => (e.side !== a.side ? j : -1)).filter(j => j >= 0))
    const matesOf = ctx.actors.map(a => ctx.actors.map((m, j) => (m !== a && m.side === a.side ? j : -1)).filter(j => j >= 0))

    /** Enemies (not about to duel player `ai`) who would see node `n` at grid time `k`. */
    const watchers = (ai: number, n: number, k: number, out: number[] | null, only?: readonly number[]): boolean => {
        const t = tAt(k)
        let any = false
        const nx = g.x[n], ny = g.y[n]
        for (const ei of only ?? enemiesOf[ai]) {
            const m = gridOf(ei)[k]
            if (m < 0) continue
            if (len(g.x[m] - nx, g.y[m] - ny) > EXPOSE_RANGE) continue
            if (!vis.sees(n, m) || engaged(ai, ei, t) || smoked(t, n, m)) continue
            any = true
            if (out) { if (!out.includes(ei)) out.push(ei) } else return true
        }
        return any
    }
    const kFrom = (t: number) => Math.max(0, Math.ceil((t - 0.25) / SAMPLE_SECONDS - 1e-9))

    // Attackers give ground before the plant (they choose when to fight), defenders after it.
    const order = [...ctx.actors].sort((a, b) => (a.side === b.side ? a.order - b.order : a.side === "T" ? -1 : 1))

    // Walkers first: someone about to walk into sight of a close enemy they are not
    // fighting waits at the last spot on their way that enemy cannot see, and goes on
    // once the enemy has passed. The delay comes out of their next hold, so every
    // anchor stays where and when the timeline put it.
    // Then walks that still run into sight take another way when one fits in their time
    // (leaving their hold earlier, up to run speed), arriving exactly when they did.
    for (const a of order) for (let tries = 0; tries < MAX_REROUTES; tries++) if (!rerouteOnce(a)) break
    for (const a of order) for (let tries = 0; tries < MAX_YIELDS; tries++) if (!yieldOnce(a)) break
    for (const a of order) {
        const src = steps.get(a)
        if (!src || src.length < 2) continue
        // Anchor times are hard: the player must be on their node then (and through a plant / defuse).
        const pins: number[] = []
        const pinned: [number, number][] = []
        for (const an of a.anchors) {
            pins.push(an.t)
            if (an.holdUntil !== undefined && an.holdUntil > an.t) { pins.push(an.holdUntil); pinned.push([an.t, an.holdUntil]) }
        }
        pins.sort((x, y) => x - y)
        const isLast = (i: number) => i === src.length - 1
        const out: Step[] = []
        let i = 0
        while (i < src.length) {
            let j = i
            while (j + 1 < src.length && src[j + 1].node === src[i].node) j++
            const run = src.slice(i, j + 1)
            // The tail of a survivor's track ends at the round end: no need to come back.
            const openEnd = isLast(j) && a.deathT > src[j].t + 1e-6
            out.push(...coverRun(a, run, pins, pinned, openEnd))
            i = j + 1
        }
        steps.set(a, out)
        grid[idx.get(a)!] = null
    }
    return stats

    /** One wait for the first walk that runs into sight of an enemy; false when there is none left to fix. */
    function yieldOnce(a: Actor): boolean {
        const st = steps.get(a)
        if (!st || st.length < 3) return false
        const ai = idx.get(a)!
        const gr = gridOf(ai)
        let c = 0
        for (let k = kFrom(st[0].t); k < K; k++) {
            const t = tAt(k)
            if (gr[k] < 0 || !(a.deathT > t + 0.1)) continue
            while (c + 1 < st.length && st[c + 1].t <= t) c++
            if (c + 1 >= st.length || st[c + 1].node === st[c].node) continue
            if (!watchers(ai, gr[k], k, null)) continue
            // The exposure, merged over short gaps, and who sees it.
            const seenBy: number[] = []
            let x1 = t, quiet = 0
            for (let q = k; q < K && tAt(q) < a.deathT; q++) {
                if (gr[q] >= 0 && watchers(ai, gr[q], q, seenBy)) { x1 = tAt(q); quiet = 0 } else if ((quiet += SAMPLE_SECONDS) > MERGE_GAP) break
            }
            const resume = x1 + SAMPLE_SECONDS
            if (tryYield(a, ai, st, c, t, resume) || tryLeaveEarly(a, ai, st, c, t, resume)) { stats.yielded++; return true }
            // Nowhere to wait: leave this walk and look further on.
            k = kFrom(resume)
        }
        return false
    }

    function tryYield(a: Actor, ai: number, st: Step[], c: number, x0: number, resume: number): boolean {
        // Wait spots: the nodes the walker already passed on this walk, latest first.
        for (let w = c; w >= 1 && st[w].t >= x0 - YIELD_LOOKBACK; w--) {
            const n = st[w].node
            if (resume <= st[w].t) continue
            const plan = reschedule(a, st, w, resume)
            if (!plan || overPlant(st[w].t, plan.times[plan.times.length - 1])) break
            let hidden = true
            for (let k = kFrom(st[w].t); k < K && tAt(k) <= resume + YIELD_MARGIN; k++) if (watchers(ai, n, k, null) || mateNear(ai, n, k)) { hidden = false; break }
            if (!hidden) {
                // A spot passed in a hold (the walk's start) is as far back as it goes.
                if (st[w - 1].node === n) break
                continue
            }
            const look = st[w].look ?? st[w + 1].look
            const next: Step[] = st.slice(0, w + 1)
            pushStep(next, { t: resume, node: n, look })
            for (let s = w + 1; s <= plan.h; s++) pushStep(next, { ...st[s], t: plan.times[s - w - 1] })
            for (let s = plan.h + 1; s < st.length; s++) pushStep(next, st[s])
            steps.set(a, next)
            grid[ai] = null
            return true
        }
        return false
    }

    /**
     * The other way round: leave the hold before this walk earlier, pass before the enemy
     * gets there and wait at the walk's end instead. Only when the whole walk, and the
     * longer wait at its end, then stays out of sight.
     */
    function tryLeaveEarly(a: Actor, ai: number, st: Step[], c: number, x0: number, x1: number): boolean {
        let b = c
        while (b >= 1 && st[b - 1].node !== st[b].node) b--
        if (b < 1) return false
        let h = c + 1
        while (h + 1 < st.length && st[h + 1].node !== st[h].node) h++
        const t0 = st[b].t, tEnd = st[h].t
        if (a.anchors.some(an => an.t > t0 + 1e-6 && an.t < tEnd - 1e-6)) return false
        const most = t0 - st[b - 1].t - 0.2
        const need = x1 - x0
        for (let d = need; d <= most + 1e-6 && d <= need + LEAVE_EARLY_MAX; d += SAMPLE_SECONDS) {
            if (a.anchors.some(an => an.t >= t0 - d - 1e-6 && an.t <= t0 + 1e-6 && an.node === st[b].node && an.t > st[b - 1].t + 1e-6)) return false
            const next: Step[] = st.slice(0, b)
            for (let s = b; s <= h; s++) pushStep(next, { ...st[s], t: st[s].t - d })
            pushStep(next, { t: tEnd, node: st[h].node, look: st[h].look })
            for (let s = h + 1; s < st.length; s++) pushStep(next, st[s])
            if (overPlant(t0 - d, tEnd) || exposedOn(ai, next, t0 - d, tEnd)) continue
            steps.set(a, next)
            grid[ai] = null
            return true
        }
        return false
    }

    /** Re-plan the first walk (from a hold to the next hold) that runs into sight; false when none can be improved. */
    function rerouteOnce(a: Actor): boolean {
        const st = steps.get(a)
        if (!st || st.length < 3) return false
        const ai = idx.get(a)!
        const gr = gridOf(ai)
        let c = 0
        for (let k = kFrom(st[0].t); k < K; k++) {
            const t = tAt(k)
            if (gr[k] < 0 || !(a.deathT > t + 0.1)) continue
            while (c + 1 < st.length && st[c + 1].t <= t) c++
            if (c + 1 >= st.length || st[c + 1].node === st[c].node) continue
            if (!watchers(ai, gr[k], k, null)) continue
            let b = c
            while (b >= 1 && st[b - 1].node !== st[b].node) b--
            let h = c + 1
            while (h + 1 < st.length && st[h + 1].node !== st[h].node) h++
            if (tryReroute(a, ai, st, b, h)) { stats.rerouted++; return true }
            k = kFrom(st[h].t)
        }
        return false
    }

    function tryReroute(a: Actor, ai: number, st: Step[], b: number, h: number): boolean {
        const from = st[b].node, to = st[h].node, t0 = st[b].t, t1 = st[h].t
        if (from === to || !(t1 > t0)) return false
        if (a.anchors.some(an => an.t > t0 + 1e-6 && an.t < t1 - 1e-6)) return false
        // Only walks done before the plant: after it they are retakes and give-ups, where a detour reads as turning back.
        if (ctx.plantT !== undefined && t1 > ctx.plantT) return false
        const before = exposure(ai, st, t0, t1)
        if (!before) return false
        // Earliest departure: back into the hold before the walk, never before an anchor or across the plant.
        let early = t0
        if (b >= 1 && st[b - 1].node === from) early = st[b - 1].t + 0.2
        for (const an of a.anchors) if (an.t <= t0 + 1e-6) early = max(early, an.holdUntil ?? an.t)
        if (ctx.plantT !== undefined && ctx.plantT > early && ctx.plantT < t1) early = max(early, min(ctx.plantT, t0))
        early = min(early, t0)
        let oldLen = 0
        for (let s = b + 1; s <= h; s++) oldLen += g.cost(st[s - 1].node, st[s].node)
        const pace = max(oldLen / (t1 - t0), ctx.v * 0.5)
        const path = sightPath(ai, from, to, t0, pace)
        if (!path) return false
        let pathLen = 0
        for (let s = 1; s < path.length; s++) pathLen += g.cost(path[s - 1], path[s])
        if (pathLen > g.pathDist(from, to) * DETOUR_MAX + DETOUR_EXTRA) return false
        const window = t1 - early
        if (pathLen / ctx.v > window + 1e-6) return false
        // Keep the old pace when it fits, otherwise up to run speed; leave as late as that allows.
        const dur = min(window, max(pathLen / ctx.v, pathLen / pace))
        const dep = t1 - dur
        const next: Step[] = dep < t0 - 1e-6 ? st.slice(0, b) : st.slice(0, b + 1)
        pushStep(next, { t: dep, node: from, look: st[b].look })
        walkPath(next, path, dep, t1)
        for (let s = h; s < st.length; s++) pushStep(next, st[s])
        if (exposure(ai, next, early, t1) >= before) return false
        steps.set(a, next)
        grid[ai] = null
        return true
    }

    /** Samples in [ta, tb] where steps `st` put player `ai` in sight of an enemy they are not fighting (or on a mate). */
    function exposure(ai: number, st: Step[], ta: number, tb: number): number {
        let c = 0, n = 0
        for (let k = kFrom(ta); k < K && tAt(k) <= tb; k++) {
            const t = tAt(k)
            if (t < st[0].t) continue
            while (c + 1 < st.length && st[c + 1].t <= t) c++
            const s0 = st[c], s1 = st[c + 1]
            const node = !s1 || s1.node === s0.node || (t - s0.t) < (s1.t - s0.t) / 2 ? s0.node : s1.node
            if (watchers(ai, node, k, null) || mateNear(ai, node, k)) n++
        }
        return n
    }

    /**
     * Shortest walk from `from` to `to` with every node priced by the time it spends in sight of
     * an enemy (when the walker, leaving at t0 at `pace` map-%/s, would pass it).
     */
    function sightPath(ai: number, from: number, to: number, t0: number, pace: number): number[] | null {
        const M = g.size
        const cost = new Float64Array(M).fill(Infinity)
        const walked = new Float64Array(M)
        const prev = new Int32Array(M).fill(-1)
        const done = new Uint8Array(M)
        const heap: number[] = []
        const push = (n: number) => {
            heap.push(n)
            let i = heap.length - 1
            while (i > 0) { const p = (i - 1) >> 1; if (cost[heap[p]] <= cost[heap[i]]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p }
        }
        const pop = (): number => {
            const top = heap[0], last = heap.pop()!
            if (heap.length) {
                heap[0] = last
                let i = 0
                for (;;) {
                    const l = 2 * i + 1, r = l + 1
                    let m = i
                    if (l < heap.length && cost[heap[l]] < cost[heap[m]]) m = l
                    if (r < heap.length && cost[heap[r]] < cost[heap[m]]) m = r
                    if (m === i) break
                    ;[heap[m], heap[i]] = [heap[i], heap[m]]
                    i = m
                }
            }
            return top
        }
        cost[from] = 0
        push(from)
        while (heap.length) {
            const n = pop()
            if (done[n]) continue
            done[n] = 1
            if (n === to) break
            for (const m of g.neighbors(n)) {
                if (done[m]) continue
                const e = g.cost(n, m)
                const w = walked[n] + e
                const k = kFrom(t0 + w / pace)
                const seen = m !== to && k < K && watchers(ai, m, k, null) ? SIGHT_COST * e / pace : 0
                const cm = cost[n] + e + seen
                if (cm < cost[m]) { cost[m] = cm; walked[m] = w; prev[m] = n; push(m) }
            }
        }
        if (!done[to]) return null
        const path: number[] = []
        for (let n = to; n >= 0; n = prev[n]) path.push(n)
        path.reverse()
        return path[0] === from ? path : null
    }

    /** A walk moved in time must not cross the plant: the round changes there (a walk to the site turns pointless). */
    function overPlant(t0: number, t1: number): boolean {
        return ctx.plantT !== undefined && t0 < ctx.plantT && t1 > ctx.plantT
    }

    /** Whether steps `st` put player `ai` in sight of an enemy they are not fighting during [ta, tb]. */
    function exposedOn(ai: number, st: Step[], ta: number, tb: number): boolean {
        let c = 0
        for (let k = kFrom(ta); k < K && tAt(k) <= tb; k++) {
            const t = tAt(k)
            if (t < st[0].t) continue
            while (c + 1 < st.length && st[c + 1].t <= t) c++
            const s0 = st[c], s1 = st[c + 1]
            const n = !s1 || s1.node === s0.node || (t - s0.t) < (s1.t - s0.t) / 2 ? s0.node : s1.node
            if (watchers(ai, n, k, null) || mateNear(ai, n, k)) return true
        }
        return false
    }

    /** A teammate within COVER_SPACING of node `n` at grid time `k`. */
    function mateNear(ai: number, n: number, k: number): boolean {
        for (const mi of matesOf[ai]) {
            const m = gridOf(mi)[k]
            if (m >= 0 && g.floor[m] === g.floor[n] && len(g.x[m] - g.x[n], g.y[m] - g.y[n]) < COVER_SPACING) return true
        }
        return false
    }

    /**
     * New times for steps w+1..h when the walker leaves step w at `resume` instead: the walk goes on
     * to a later hold (no anchor before it) that still has room, walking at its old pace while the
     * holds on the way shrink, or up to WALK_PACE faster (never above run speed) when it must.
     */
    function reschedule(a: Actor, st: Step[], w: number, resume: number): { h: number; times: number[] } | null {
        let walk = 0, pause = 0, dist = 0, fastest = 0
        for (let h = w + 1; h < st.length; h++) {
            if (a.anchors.some(an => an.t > st[w].t + 1e-6 && an.t <= st[h].t + 1e-6)) return null
            const dt = st[h].t - st[h - 1].t
            if (st[h].node === st[h - 1].node) pause += dt
            else {
                const d = g.pathDist(st[h - 1].node, st[h].node)
                walk += dt
                dist += d
                fastest = max(fastest, d / max(dt, 1e-9) / ctx.v)
            }
            const holds = h + 1 < st.length && st[h + 1].node === st[h].node
            const end = h + 1 >= st.length
            if (!holds && !end) continue
            const by = holds ? st[h + 1].t - 0.2 : a.deathT === Infinity ? ctx.endTime - 0.2 : -Infinity
            const room = min(by, a.deathT - 0.2) - resume
            if (room < max(dist / ctx.v, walk * WALK_PACE) - 1e-6) { if (end) return null; continue }
            if (a.anchors.some(an => an.t > st[w].t + 1e-6 && an.t <= resume + room + 1e-6 && an.t < st[h + 1]?.t - 1e-6)) return null
            const walkScale = min(1, room / max(walk, 1e-9))
            // No step of the walk may end up faster than run speed.
            if (walkScale < 1 && walkScale < fastest) { if (end) return null; continue }
            const pauseScale = pause > 0 ? max(0, min(1, (room - walk * walkScale) / pause)) : 0
            const times: number[] = []
            let t = resume
            for (let s = w + 1; s <= h; s++) {
                const d = st[s].t - st[s - 1].t
                t += st[s].node === st[s - 1].node ? d * pauseScale : d * walkScale
                times.push(t)
            }
            return { h, times }
        }
        return null
    }

    function coverRun(a: Actor, run: Step[], pins: number[], pinned: [number, number][], openEnd: boolean): Step[] {
        const P = run[0].node
        const t0 = run[0].t, t1 = run[run.length - 1].t
        if (t1 - t0 < MIN_HOLD) return run
        // Windows between pins inside the run.
        const cuts = [t0, ...pins.filter(p => p > t0 + 1e-6 && p < t1 - 1e-6), t1]
        const result: Step[] = []
        for (let w = 0; w + 1 < cuts.length; w++) {
            const w0 = cuts[w], w1 = cuts[w + 1]
            const inside = run.filter(s => s.t >= w0 - 1e-6 && s.t <= w1 + 1e-6)
            const first = inside[0] ?? { t: w0, node: P }
            const last = inside[inside.length - 1] ?? { t: w1, node: P }
            const lastWindow = w + 2 === cuts.length
            const keep = () => { for (const s of inside) pushStep(result, s) }
            if (w1 - w0 < MIN_HOLD || pinned.some(([p0, p1]) => w0 < p1 - 1e-6 && w1 > p0 + 1e-6) || !(a.deathT > w0)) { keep(); continue }
            // Exposed moments, grouped into exposures (a gap under MERGE_GAP joins two).
            const ai = idx.get(a)!
            const exposures: { x0: number; x1: number; seenBy: number[] }[] = []
            for (let k = kFrom(w0 + 0.1); k < K && tAt(k) < min(w1, a.deathT) - 0.1; k++) {
                const t = tAt(k)
                if (!watchers(ai, P, k, null)) continue
                const seenBy: number[] = []
                watchers(ai, P, k, seenBy)
                const cur = exposures[exposures.length - 1]
                if (cur && t - cur.x1 <= MERGE_GAP) {
                    cur.x1 = t + SAMPLE_SECONDS / 2
                    for (const e of seenBy) if (!cur.seenBy.includes(e)) cur.seenBy.push(e)
                } else exposures.push({ x0: t - SAMPLE_SECONDS / 2, x1: t + SAMPLE_SECONDS / 2, seenBy })
            }
            if (!exposures.length) { keep(); continue }
            stats.exposed++
            const look = first.look ?? last.look
            const comeBack = !(lastWindow && openEnd)
            pushStep(result, first)
            let free = first.t
            let moved = false
            for (let x = 0; x < exposures.length; x++) {
                const { x0, x1, seenBy } = exposures[x]
                const back0 = comeBack || x + 1 < exposures.length
                // There and back inside the window (or just there when the round ends in cover).
                const maxWalk = back0 ? ctx.v * max(0, (w1 - free - 0.4) / 2) : COVER_WALK
                const cover = pickCover(a, P, x0, x1, seenBy, maxWalk)
                if (cover === null) continue
                const path = g.path(P, cover)
                const d = g.pathDist(P, cover) / ctx.v
                const depart = max(free, x0 - d)
                const arrive = depart + d
                const back = comeBack || x + 1 < exposures.length
                // Stay in cover until the next exposure would start soon anyway.
                const nextX0 = x + 1 < exposures.length ? exposures[x + 1].x0 : Infinity
                const leave = back ? min(max(x1, arrive), w1 - d) : Infinity
                if (back && leave < arrive + 0.3) continue
                if (back && nextX0 - (leave + d) < 2 * d + 0.6 && x + 1 < exposures.length
                    && pickCover(a, P, x0, exposures[x + 1].x1, [...seenBy, ...exposures[x + 1].seenBy], maxWalk) !== null) {
                    // Too close to the next exposure to peek in between: fold them into one (when one cover serves both).
                    exposures[x + 1].x0 = x0
                    for (const e of seenBy) if (!exposures[x + 1].seenBy.includes(e)) exposures[x + 1].seenBy.push(e)
                    continue
                }
                moved = true
                if (depart > free + 1e-6) pushStep(result, { t: depart, node: P, look })
                walkPath(result, path, depart, arrive)
                pushStep(result, { t: arrive, node: cover, look })
                if (back) {
                    pushStep(result, { t: leave, node: cover, look })
                    walkPath(result, [...path].reverse(), leave, leave + d)
                    pushStep(result, { t: leave + d, node: P, look })
                    free = leave + d
                } else {
                    pushStep(result, { t: max(arrive, w1), node: cover, look })
                    free = Infinity
                }
            }
            if (moved) stats.covered++
            if (free !== Infinity) pushStep(result, last)
        }
        return result
    }

    /** Nearest node within reach that none of the enemies who saw the spot sees during [x0, x1]. */
    function pickCover(a: Actor, P: number, x0: number, x1: number, seenBy: readonly number[], maxWalk: number): number | null {
        const dist = g.distancesTo(P)
        const reach = min(COVER_WALK, maxWalk)
        const cands = g.around(P, COVER_RANGE).filter(n => n !== P && dist[n] <= reach).sort((m, n) => dist[m] - dist[n] || m - n)
        const ai = idx.get(a)!
        const times: number[] = []
        for (let k = kFrom(x0); k < K && tAt(k) <= x1 + 1e-6; k++) times.push(k)
        if (!times.length) return null
        // Fully hidden if possible, else the spot seen least (at most a fifth of the time, and less than here).
        let here = 0
        for (const k of times) if (watchers(ai, P, k, null, seenBy)) here++
        const mates = matesOf[ai]
        const crowded = (n: number) => {
            for (let q = 0; q < times.length; q += 2) {
                const k = times[q]
                for (const mi of mates) {
                    const m = gridOf(mi)[k]
                    if (m >= 0 && g.floor[m] === g.floor[n] && len(g.x[m] - g.x[n], g.y[m] - g.y[n]) < COVER_SPACING) return true
                }
            }
            return false
        }
        // Coarse pass first (every 4th moment), so most candidates are rejected after a check or two.
        const hidden = (n: number) => {
            for (let q = 0; q < times.length; q += 4) if (watchers(ai, n, times[q], null)) return false
            for (let q = 0; q < times.length; q++) if (q % 4 && watchers(ai, n, times[q], null)) return false
            return true
        }
        for (const n of cands) if (hidden(n) && !crowded(n)) return n
        // Partial cover among the nearest few.
        let best: number | null = null
        let bestSeen = Math.min(here - 1, Math.floor(times.length / 5))
        for (const n of cands.slice(0, PARTIAL_CANDIDATES)) {
            let seen = 0
            for (const k of times) if (watchers(ai, n, k, null) && ++seen > bestSeen) break
            if (seen > bestSeen || crowded(n)) continue
            best = n
            bestSeen = seen - 1
        }
        if (best !== null) return best
        // Nowhere out of sight (an enemy sweeps the whole area): at least keep out of point-blank range.
        let far = here > 0 ? closest(P, times, seenBy) : 0
        for (const n of cands) {
            if (crowded(n)) continue
            const d = closest(n, times, seenBy)
            if (d >= STEP_ASIDE && d > far) { best = n; far = d }
        }
        return best
    }

    /** Closest any of `who` comes to node `n` over the grid times (map-%). */
    function closest(n: number, times: readonly number[], who: readonly number[]): number {
        let d = Infinity
        for (const k of times) for (const ei of who) {
            const m = gridOf(ei)[k]
            if (m >= 0 && g.floor[m] === g.floor[n]) d = min(d, len(g.x[m] - g.x[n], g.y[m] - g.y[n]))
        }
        return d
    }

    function walkPath(out: Step[], path: number[], ta: number, tb: number): void {
        if (path.length < 3) return
        let total = 0
        for (let k = 1; k < path.length; k++) total += g.cost(path[k - 1], path[k])
        let acc = 0
        for (let k = 1; k < path.length - 1; k++) {
            acc += g.cost(path[k - 1], path[k])
            pushStep(out, { t: ta + (tb - ta) * (acc / total), node: path[k] })
        }
    }
}

function pushStep(out: Step[], s: Step): void {
    const last = out[out.length - 1]
    if (last === s) return
    if (last && s.t < last.t - 1e-9) return
    if (last && s.t <= last.t + 1e-9 && s.node === last.node) {
        if (s.aimAt) last.aimAt = s.aimAt
        if (s.look) last.look = s.look
        return
    }
    out.push({ ...s })
}
