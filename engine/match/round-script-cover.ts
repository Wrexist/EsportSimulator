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

import { len } from "./round-script-context"
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

export interface CoverStats {
    /** Holding stretches that were exposed. */
    exposed: number
    /** Of those, how many moved into cover. */
    covered: number
}

export interface Smoke { t0: number; t1: number; at: RPoint; r: number }

export function applyCover(ctx: Ctx, steps: Map<Actor, Step[]>, smokes: readonly Smoke[]): CoverStats {
    const stats: CoverStats = { exposed: 0, covered: 0 }
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
                if (back && nextX0 - (leave + d) < 2 * d + 0.6 && x + 1 < exposures.length) {
                    // Too close to the next exposure to peek in between: fold them into one.
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
            for (let q = 0; q < times.length; q += 4) if (watchers(ai, n, times[q], null, seenBy)) return false
            for (let q = 0; q < times.length; q++) if (q % 4 && watchers(ai, n, times[q], null, seenBy)) return false
            return true
        }
        for (const n of cands) if (hidden(n) && !crowded(n)) return n
        // Partial cover among the nearest few.
        let best: number | null = null
        let bestSeen = Math.min(here - 1, Math.floor(times.length / 5))
        for (const n of cands.slice(0, PARTIAL_CANDIDATES)) {
            let seen = 0
            for (const k of times) if (watchers(ai, n, k, null, seenBy) && ++seen > bestSeen) break
            if (seen > bestSeen || crowded(n)) continue
            best = n
            bestSeen = seen - 1
        }
        return best
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
