/**
 * Round script output: per-player keyframes from the timeline (≤ 0.5 s apart
 * while moving), teammate spacing, and the bought utility thrown.
 */

import type { NavGraph } from "./round-script-nav"
import { len, other, angle, round3, round4 } from "./round-script-context"
import type { XY, Step, Actor, Ctx } from "./round-script-context"
import { defaultSteps, legOf } from "./round-script-timeline"
import type { Floor, ScriptUtility, Side, SiteId, TrackKey, UtilityKind } from "./round-script-types"

// Math is read once: global lookups are very slow inside Jest's sandbox (tests time the builder).
const { abs, ceil, exp, max, min, sign } = Math

/** Keys while moving (a little under the 0.5 s contract: very close keys get merged). */
export const MAX_KEY_GAP = 0.48
export const UTILITY_SECONDS: Record<UtilityKind, number> = { smoke: 18, molotov: 7, flash: 0.3, he: 0.3 }

// ─── Tracks ────────────────────────────────────────────────────────────────

export function assembleSteps(ctx: Ctx, a: Actor): Step[] {
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

export function toKeys(g: NavGraph, steps: Step[]): TrackKey[] {
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
            const pieces = ceil(dt / MAX_KEY_GAP - 1e-9)
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
export function clipKeys(keys: TrackKey[], end: number): TrackKey[] {
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

/** Round keys; a key closer than 0.02 s to the previous one replaces it (keeps the first key). */
export function roundKeys(keys: TrackKey[]): TrackKey[] {
    const out: TrackKey[] = []
    for (const k of keys) {
        const key = { t: round4(k.t), x: round3(k.x), y: round3(k.y), floor: k.floor, aim: round3(k.aim) }
        const last = out[out.length - 1]
        if (last && key.t - last.t < 0.02) {
            if (out.length > 1) out[out.length - 1] = key
            else if (key.t > last.t) out.push(key)
        } else out.push(key)
    }
    return out
}

/** Sideways step (map-%) a walker takes when a teammate walks right next to them. */
export const SIDESTEP = 0.8
/** How fast the sidestep builds up / fades (map-% per second). */
export const SIDESTEP_RATE = 1.2
export const CROWD = 2.8

/**
 * Teammates walking the same corridor at the same time step up to SIDESTEP
 * apart, perpendicular to where they walk. The step builds up before the
 * encounter and fades after it, never while standing or within 0.6 s of a
 * kill / plant / defuse, and is smoothed away wherever it would push a
 * segment over the speed limit.
 */
export function spaceTeammates(ctx: Ctx, raw: Map<Actor, TrackKey[]>): void {
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
        const sideOf = new Float64Array(n)
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
            if (max(dIn / (k.t - prev.t), dOut / (next.t - k.t)) > ctx.v + 1e-6) continue
            if (pinned.some(t => abs(t - k.t) < 0.6)) continue
            room[i] = SIDESTEP
            let best = CROWD, bx = 0, by = 0, bOrder = 0, bDot = 1, bId = ""
            mates.forEach((b, j) => {
                if (b.deathT <= k.t) return
                const bk = raw.get(b)!
                let c = cursor[j]
                while (c + 1 < bk.length && bk[c + 1].t <= k.t) c++
                cursor[j] = c
                const p = bk[c], q = bk[c + 1] ?? p
                const u = q.t > p.t ? min(1, max(0, (k.t - p.t) / (q.t - p.t))) : 0
                if ((u < 0.5 ? p.floor : q.floor) !== k.floor) return
                const x = p.x + (q.x - p.x) * u, y = p.y + (q.y - p.y) * u
                const d = len(x - k.x, y - k.y)
                if (d < best) { best = d; bx = x; by = y; bOrder = b.order; bId = b.id; bDot = dirX[i] * (q.x - p.x) + dirY[i] * (q.y - p.y) }
            })
            if (best >= CROWD) continue
            need[i] = SIDESTEP
            // Already side by side: keep those sides. Else a fixed rule per pair (and stick to it).
            const across = -dirY[i] * (k.x - bx) + dirX[i] * (k.y - by)
            if (abs(across) >= 0.8) sideOf[i] = sign(across)
            else if (bId === lastMate) sideOf[i] = lastSign
            else sideOf[i] = a.order < bOrder ? 1 : bDot >= 0 ? -1 : 1
            lastMate = bId
            lastSign = sideOf[i]
        }
        // Smooth the walking direction (bends) both ways, ~0.6 s.
        for (const order of [1, -1]) {
            for (let s = 1; s < n; s++) {
                const i = order > 0 ? s : n - 1 - s
                const j = i - order
                if (!dirX[i] && !dirY[i]) { dirX[i] = dirX[j]; dirY[i] = dirY[j]; continue }
                const w = exp(-abs(keys[i].t - keys[j].t) / 0.6)
                const x = w * dirX[j] + (1 - w) * dirX[i], y = w * dirY[j] + (1 - w) * dirY[i]
                const m = len(x, y)
                if (m > 1e-6) { dirX[i] = x / m; dirY[i] = y / m }
            }
        }
        // Magnitude: ramps up before and down after every crowded key, capped by a ramped `room`.
        const mag = new Float64Array(n)
        const stepAt = (i: number, j: number) => SIDESTEP_RATE * abs(keys[i].t - keys[j].t)
        for (let i = 0, f = 0; i < n; i++) { f = max(need[i], f - (i ? stepAt(i, i - 1) : 0)); mag[i] = f }
        for (let i = n - 1, b = 0; i >= 0; i--) { b = max(need[i], b - (i < n - 1 ? stepAt(i, i + 1) : 0)); mag[i] = max(mag[i], b) }
        for (let i = 1; i < n; i++) room[i] = min(room[i], room[i - 1] + stepAt(i, i - 1))
        for (let i = n - 2; i >= 0; i--) room[i] = min(room[i], room[i + 1] + stepAt(i, i + 1))
        // Side: the one chosen at the nearest crowded key in time.
        const fwd: [number, number][] = []
        for (let i = 0, s = 0, ts = -Infinity; i < n; i++) { if (need[i]) { s = sideOf[i]; ts = keys[i].t } fwd.push([s, ts]) }
        for (let i = n - 1, s = 0, ts = Infinity; i >= 0; i--) {
            if (need[i]) { s = sideOf[i]; ts = keys[i].t }
            const [sf, tf] = fwd[i]
            const side = keys[i].t - tf <= ts - keys[i].t ? sf : s
            const m = min(mag[i], room[i]) * side
            shift[i] = { x: -dirY[i] * m, y: dirX[i] * m }
        }
    }
    for (const a of ctx.actors) {
        const keys = raw.get(a)!
        const { shift, room } = plans.get(a)!
        const limit = (i: number) => max(ctx.v * 1.08, len(keys[i].x - keys[i - 1].x, keys[i].y - keys[i - 1].y) / (keys[i].t - keys[i - 1].t))
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

export function throwUtility(ctx: Ctx): ScriptUtility[] {
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
                    const t = round3(max(1, t0 + 0.35 * i++))
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
