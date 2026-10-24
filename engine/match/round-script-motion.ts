/**
 * Looser radar movement for rounds replayed from the sight engine.
 *
 * The engine walks players along the round map's route lines and parks them
 * on exact hold nodes, so a straight replay looks on rails: players glued to
 * one line, sharp corners, holders frozen for half a minute, teammates
 * stacked on one dot. Pros (ESTA demos, scripts/audit-radar-motion.ts) stand
 * still about a quarter of the time, walk a lot, drift about 1.4 map-% off
 * the route lines and keep their distance from teammates.
 *
 * This pass draws each player a little off the engine's line, on walkable
 * ground only (round-script-walkable.ts): rounded corners, a lane of their
 * own while walking, a shuffle around the spot while holding, and a step
 * away from a teammate who walks on top of them. It never changes the
 * round: the drift is at most ~2 map-%, fades to nothing around every kill,
 * plant, defuse and bomb pick-up (those happen exactly where the engine put
 * them) and never pushes a player past run speed.
 */

import type { WalkArea } from "./round-script-walkable"
import { angle } from "./round-script-context"
import type { Floor, Side, TrackKey } from "./round-script-types"
import { sampleTrack } from "./round-script-sample"

const { abs, cos, exp, floor, hypot, max, min, PI, sin } = Math

/** Sample step of the loosened tracks (seconds). */
const H = 0.25
/** Rounded corners: Gaussian over the walk (seconds), and the most a corner is cut (map-%). */
const CORNER_SIGMA = 0.4
const CORNER_MAX = 1
/** Lane while walking: a player's own side of the line plus a slow sway (map-%). */
const LANE_BIAS = 1.1
const LANE_SWAY = 0.8
/** Shuffle while holding: how far from the spot (map-%), walking pace (× run speed) and pauses (seconds). */
const SHUFFLE = 2.2
const SHUFFLE_PACE: [number, number] = [0.15, 0.35]
const SHUFFLE_PAUSE: [number, number] = [0.1, 0.6]
/** Teammates closer than this (map-%) step apart, by at most SPACING_MAX. */
const SPACING = 2.5
const SPACING_MAX = 1.5
/** The most a player is ever drawn off the engine's spot (map-%). */
export const MAX_DRIFT = 3
/** Teammates closer than this (map-%) count as stacked on one spot, and each steps this far off it. */
const STACKED = 0.3
const STACK_STEP = 0.3
/** Seconds the drift takes to fade in / out around a pinned moment. */
const FADE = 0.6
/**
 * No drift with a living enemy this close (map-%), full drift from ENEMY_FAR:
 * a shuffle or a lane must not step a player into a sight line the engine
 * never had (stand-offs nobody fights).
 */
const ENEMY_NEAR = 10
const ENEMY_FAR = 14

/** Moments a player must stand exactly where the engine put them, [from, to] in seconds. */
export type Pins = Map<string, [number, number][]>

interface Lane {
    id: string
    side: Side
    t0: number
    /** Last moment of the track (the last sample sits here, less than H after the one before). */
    t1: number
    n: number
    bx: Float64Array
    by: Float64Array
    floor: Floor[]
    aim: Float64Array
    ox: Float64Array
    oy: Float64Array
    moving: Float64Array
    /** 0 with an enemy close, 1 with none near (per sample). */
    calm: Float64Array
    /** Step off a teammate standing on the very same spot (kept even inside pins). */
    sx: Float64Array
    sy: Float64Array
}

function hash(s: string): number {
    let h = 2166136261
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
    return (h >>> 0) / 4294967296
}

const smoothstep = (a: number, b: number, x: number) => {
    const u = min(1, max(0, (x - a) / (b - a)))
    return u * u * (3 - 2 * u)
}

/** Exponential smoothing both ways (time constant tau seconds). */
function smooth(v: Float64Array, tau: number): void {
    const w = exp(-H / tau)
    for (let i = 1; i < v.length; i++) v[i] = w * v[i - 1] + (1 - w) * v[i]
    for (let i = v.length - 2; i >= 0; i--) v[i] = w * v[i + 1] + (1 - w) * v[i]
}

/**
 * Loosen every track (keyed by player id). `pins` are the moments a player
 * stands exactly on the engine's spot; `seed` keeps a round's drift stable.
 */
export function loosenTracks(
    tracks: Map<string, TrackKey[]>, sides: Record<string, Side>, pins: Pins,
    walk: WalkArea, runSpeed: number, seed: string,
): void {
    if (!walk.baked) return
    const lanes: Lane[] = []
    for (const [id, track] of tracks) {
        if (track.length < 2) continue
        const t0 = track[0].t, t1 = track[track.length - 1].t
        const n = floor((t1 - t0) / H) + 2
        const L: Lane = {
            id, side: sides[id], t0, t1, n,
            bx: new Float64Array(n), by: new Float64Array(n), floor: new Array(n), aim: new Float64Array(n),
            ox: new Float64Array(n), oy: new Float64Array(n), moving: new Float64Array(n), calm: new Float64Array(n).fill(1),
            sx: new Float64Array(n), sy: new Float64Array(n),
        }
        for (let i = 0; i < n; i++) {
            const p = sampleTrack(track, min(t1, t0 + i * H))
            L.bx[i] = p.x; L.by[i] = p.y; L.floor[i] = p.floor; L.aim[i] = p.aim
        }
        lanes.push(L)
    }
    calmness(lanes)
    for (const L of lanes) drift(L, walk, runSpeed, seed)
    spaceOut(lanes)
    for (const L of lanes) {
        fit(L, pins.get(L.id) ?? [], walk, runSpeed)
        tracks.set(L.id, keysOf(L, tracks.get(L.id)!))
    }
}

/** Corners, lane and shuffle for one player (offsets before any limits). */
function drift(L: Lane, walk: WalkArea, v: number, seed: string): void {
    const { n, bx, by } = L
    const r = (k: string) => hash(`${seed}:${L.id}:${k}`)
    // How much the player is walking (0 standing … 1 walking), smoothed.
    const dx = new Float64Array(n), dy = new Float64Array(n)
    for (let i = 0; i < n; i++) {
        const a = max(0, i - 1), b = min(n - 1, i + 1)
        if (L.floor[a] !== L.floor[b] || a === b) continue
        const sx = (bx[b] - bx[a]) / ((b - a) * H), sy = (by[b] - by[a]) / ((b - a) * H)
        L.moving[i] = smoothstep(0.08, 0.3, hypot(sx, sy) / v)
        dx[i] = sx; dy[i] = sy
    }
    smooth(L.moving, 0.5)
    // Walking direction, smoothed through bends and held while standing.
    let hx = 1, hy = 0
    const nx = new Float64Array(n), ny = new Float64Array(n)
    for (let i = 0; i < n; i++) {
        const m = hypot(dx[i], dy[i])
        if (m > 0.05 * v) { hx = dx[i] / m; hy = dy[i] / m }
        nx[i] = hx; ny[i] = hy
    }
    for (let i = n - 2; i >= 0; i--) if (hypot(dx[i], dy[i]) <= 0.05 * v) { nx[i] = nx[i + 1]; ny[i] = ny[i + 1] }
    smooth(nx, 0.6); smooth(ny, 0.6)
    // Rounded corners: the walk blurred over CORNER_SIGMA (same floor only).
    const K = Math.ceil(3 * CORNER_SIGMA / H)
    const kern = Array.from({ length: 2 * K + 1 }, (_, k) => exp(-0.5 * ((k - K) * H / CORNER_SIGMA) ** 2))
    const bias = (r("lane") * 2 - 1) * LANE_BIAS
    const p1 = 9 + 6 * r("p1"), p2 = 4 + 3 * r("p2"), f1 = 2 * PI * r("f1"), f2 = 2 * PI * r("f2")
    const [wx, wy] = shuffle(L, walk, v, (k: number) => r(`w${k}`))
    for (let i = 0; i < n; i++) {
        const t = L.t0 + i * H
        let sx = 0, sy = 0, sw = 0
        for (let k = -K; k <= K; k++) {
            const j = i + k
            if (j < 0 || j >= n || L.floor[j] !== L.floor[i]) continue
            sx += kern[k + K] * bx[j]; sy += kern[k + K] * by[j]; sw += kern[k + K]
        }
        let cx = sx / sw - bx[i], cy = sy / sw - by[i]
        const cl = hypot(cx, cy)
        if (cl > CORNER_MAX) { cx *= CORNER_MAX / cl; cy *= CORNER_MAX / cl }
        // Lane: sideways off the line while walking.
        const m = L.moving[i]
        const lat = (bias + LANE_SWAY * (0.65 * sin(2 * PI * t / p1 + f1) + 0.35 * sin(2 * PI * t / p2 + f2))) * m
        // Shuffle around the spot while standing.
        L.ox[i] = cx * m + -ny[i] * lat + wx[i] * (1 - m)
        L.oy[i] = cy * m + nx[i] * lat + wy[i] * (1 - m)
    }
}

/**
 * A holder's shuffle: walk at a walking pace to a spot within SHUFFLE of the
 * hold, stand a moment, walk to the next (offsets per sample, smoothed so
 * starts and stops are not instant).
 */
function shuffle(L: Lane, walk: WalkArea, v: number, r: (k: number) => number): [Float64Array, Float64Array] {
    const n = L.n
    const x = new Float64Array(n), y = new Float64Array(n)
    let i = 0, k = 0, px = 0, py = 0
    while (i < n) {
        const pause = SHUFFLE_PAUSE[0] + (SHUFFLE_PAUSE[1] - SHUFFLE_PAUSE[0]) * r(k++)
        for (const end = i + Math.round(pause / H); i < end && i < n; i++) { x[i] = px; y[i] = py }
        // The next spot: on ground the player can walk to from the hold (a few tries, else back to it).
        const at = min(i, n - 1), bx = L.bx[at], by = L.by[at], fl = L.floor[at]
        let tx = 0, ty = 0
        for (let tries = 0; tries < 6; tries++) {
            const a = 2 * PI * r(k++), d = SHUFFLE * Math.sqrt(r(k++))
            const cx = d * cos(a), cy = d * sin(a)
            if (walk.clear(bx, by, bx + cx, by + cy, fl) && walk.clear(bx + px, by + py, bx + cx, by + cy, fl)) { tx = cx; ty = cy; break }
        }
        const pace = v * (SHUFFLE_PACE[0] + (SHUFFLE_PACE[1] - SHUFFLE_PACE[0]) * r(k++))
        const steps = max(1, Math.round(hypot(tx - px, ty - py) / (pace * H)))
        for (let s = 1; s <= steps && i < n; s++, i++) { x[i] = px + (tx - px) * s / steps; y[i] = py + (ty - py) * s / steps }
        px = tx; py = ty
    }
    smooth(x, 0.15); smooth(y, 0.15)
    return [x, y]
}

/** How far each player is from the nearest living enemy, as a 0–1 drift allowance (smoothed). */
function calmness(lanes: Lane[]): void {
    for (const A of lanes) {
        for (let i = 0; i < A.n; i++) {
            const t = min(A.t1, A.t0 + i * H)
            let d = Infinity
            for (const B of lanes) {
                if (B.side === A.side || t > B.t1 + 1e-9 || t < B.t0) continue
                const j = Math.round((t - B.t0) / H)
                if (j >= B.n || B.floor[j] !== A.floor[i]) continue
                d = min(d, hypot(A.bx[i] - B.bx[j], A.by[i] - B.by[j]))
            }
            A.calm[i] = smoothstep(ENEMY_NEAR, ENEMY_FAR, d)
        }
        // Settle before the enemy shows up and only start again after a moment.
        const lo = new Float64Array(A.n)
        const R = Math.round(FADE / H)
        for (let i = 0; i < A.n; i++) {
            let m = 1
            for (let k = max(0, i - R); k <= min(A.n - 1, i + R); k++) m = min(m, A.calm[k])
            lo[i] = m
        }
        A.calm.set(lo)
    }
}

/** Teammates walking or standing on top of each other step apart. */
function spaceOut(lanes: Lane[]): void {
    const push = new Map<Lane, [Float64Array, Float64Array]>()
    for (const L of lanes) push.set(L, [new Float64Array(L.n), new Float64Array(L.n)])
    for (let a = 0; a < lanes.length; a++) for (let b = a + 1; b < lanes.length; b++) {
        const A = lanes[a], B = lanes[b]
        if (A.side !== B.side) continue
        const from = max(A.t0, B.t0), to = min(A.t0 + (A.n - 1) * H, B.t0 + (B.n - 1) * H)
        for (let t = from; t <= to + 1e-9; t += H) {
            const i = Math.round((t - A.t0) / H), j = Math.round((t - B.t0) / H)
            if (i >= A.n || j >= B.n || A.floor[i] !== B.floor[j]) continue
            const ax = A.bx[i] + A.ox[i], ay = A.by[i] + A.oy[i], bx = B.bx[j] + B.ox[j], by = B.by[j] + B.oy[j]
            let dx = ax - bx, dy = ay - by
            const d = hypot(dx, dy)
            if (d >= SPACING) continue
            if (d < 1e-3) { const u = hash(`${A.id}|${B.id}`) * 2 * PI; dx = cos(u); dy = sin(u) } else { dx /= d; dy /= d }
            const k = (SPACING - d) / 2
            const pa = push.get(A)!, pb = push.get(B)!
            pa[0][i] += dx * k; pa[1][i] += dy * k
            pb[0][j] -= dx * k; pb[1][j] -= dy * k
        }
    }
    // Two teammates on the very same spot (the engine parks them on one node): a small step apart,
    // even at a kill or plant, so the radar never draws one dot for two players.
    for (let a = 0; a < lanes.length; a++) for (let b = a + 1; b < lanes.length; b++) {
        const A = lanes[a], B = lanes[b]
        if (A.side !== B.side) continue
        const from = max(A.t0, B.t0), to = min(A.t1, B.t1)
        const u = hash(`${A.id}|${B.id}`) * 2 * PI
        for (let t = from; t <= to + 1e-9; t += H) {
            const i = Math.round((t - A.t0) / H), j = Math.round((t - B.t0) / H)
            if (i >= A.n || j >= B.n || A.floor[i] !== B.floor[j]) continue
            if (hypot(A.bx[i] - B.bx[j], A.by[i] - B.by[j]) >= STACKED) continue
            A.sx[i] += cos(u) * STACK_STEP; A.sy[i] += sin(u) * STACK_STEP
            B.sx[j] -= cos(u) * STACK_STEP; B.sy[j] -= sin(u) * STACK_STEP
        }
    }
    for (const L of lanes) { smooth(L.sx, 0.2); smooth(L.sy, 0.2) }
    for (const L of lanes) {
        const [px, py] = push.get(L)!
        smooth(px, 0.25); smooth(py, 0.25)
        for (let i = 0; i < L.n; i++) {
            const m = hypot(px[i], py[i]), s = m > SPACING_MAX ? SPACING_MAX / m : 1
            L.ox[i] += px[i] * s; L.oy[i] += py[i] * s
        }
    }
}

/** Fade around pins and floor changes, keep to walkable ground, keep under run speed. */
function fit(L: Lane, pins: [number, number][], walk: WalkArea, v: number): void {
    const { n, bx, by, ox, oy } = L
    for (let i = 0; i < n; i++) {
        const d = hypot(ox[i], oy[i])
        if (d > MAX_DRIFT) { ox[i] *= MAX_DRIFT / d; oy[i] *= MAX_DRIFT / d }
    }
    const f = new Float64Array(n)
    // The stack step fades at this player's own pins only (a kill or plant stays on the engine's spot).
    const g = new Float64Array(n)
    for (let i = 0; i < n; i++) {
        const t = L.t0 + i * H
        let e = 1
        for (const [a, b] of pins) e = min(e, smoothstep(0, FADE, max(a - t, t - b)))
        g[i] = e
    }
    for (let i = 0; i < n; i++) {
        const t = L.t0 + i * H
        // Fade: 0 inside a pin or near a floor change, back to 1 over FADE.
        let e = L.calm[i]
        for (const [a, b] of pins) e = min(e, smoothstep(0, FADE, max(a - t, t - b)))
        for (let k = -3; k <= 3; k++) {
            const j = i + k
            if (j >= 0 && j < n && L.floor[j] !== L.floor[i]) e = min(e, smoothstep(0, FADE, abs(k) * H - H))
        }
        // Walkable: the largest share of the drift whose whole way from the engine's spot is on ground.
        let ok = 0
        if (e > 0 && walk.ok(bx[i], by[i], L.floor[i])) {
            for (const s of [1, 0.75, 0.5, 0.25]) {
                if (walk.clear(bx[i], by[i], bx[i] + ox[i] * s * e, by[i] + oy[i] * s * e, L.floor[i])) { ok = s; break }
            }
        }
        f[i] = e * ok
    }
    // No sudden snaps: the lowest share within ±0.5 s, then a short average (never above the sample's own share).
    const R = Math.round(0.5 / H)
    const lo = new Float64Array(n)
    for (let i = 0; i < n; i++) {
        let m = 1
        for (let k = max(0, i - R); k <= min(n - 1, i + R); k++) m = min(m, f[k])
        lo[i] = m
    }
    for (let i = 0; i < n; i++) {
        const a = max(0, i - 1), b = min(n - 1, i + 1)
        let s = 0
        for (let k = a; k <= b; k++) s += lo[k]
        f[i] = s / (b - a + 1)
    }
    for (let i = 0; i < n; i++) {
        ox[i] *= f[i]; oy[i] *= f[i]
        // The step off a stacked teammate stays (where the ground allows).
        let x = ox[i] + L.sx[i] * g[i], y = oy[i] + L.sy[i] * g[i]
        const d = hypot(x, y)
        if (d > MAX_DRIFT) { x *= MAX_DRIFT / d; y *= MAX_DRIFT / d }
        if ((L.sx[i] || L.sy[i]) && g[i] > 0 && walk.clear(bx[i], by[i], bx[i] + x, by[i] + y, L.floor[i])) { ox[i] = x; oy[i] = y }
    }
    // Run speed: shrink the drift where it would make a step too fast (the engine's own walk never is).
    const at = (i: number) => min(L.t1, L.t0 + i * H)
    for (let pass = 0; pass < 12; pass++) {
        let fixed = true
        for (let i = 1; i < n; i++) {
            const step = hypot(bx[i] + ox[i] - bx[i - 1] - ox[i - 1], by[i] + oy[i] - by[i - 1] - oy[i - 1])
            if (step <= v * (at(i) - at(i - 1)) * 0.99) continue
            fixed = false
            ox[i] *= 0.7; oy[i] *= 0.7; ox[i - 1] *= 0.7; oy[i - 1] *= 0.7
        }
        if (fixed) break
        if (pass === 11) for (let i = 0; i < n; i++) { ox[i] = 0; oy[i] = 0 }
    }
}

function keysOf(L: Lane, base: TrackKey[]): TrackKey[] {
    const out: TrackKey[] = []
    const t1 = base[base.length - 1].t
    const still = (i: number) => i < 0 || i >= L.n || (L.ox[i] === 0 && L.oy[i] === 0)
    let b = 0
    for (let i = 0; i < L.n; i++) {
        const t = min(t1, L.t0 + i * H)
        if (out.length && t <= out[out.length - 1].t + 1e-9) break
        // Where the drift is nothing, the engine's own keys (exact kill and plant spots and moments).
        if (still(i)) {
            while (b < base.length && base[b].t < t - 1e-9) {
                if (still(i - 1)) out.push(base[b])
                b++
            }
            if (b < base.length && abs(base[b].t - t) < 1e-9) { out.push(base[b++]); continue }
        } else while (b < base.length && base[b].t <= t + 1e-9) b++
        const x = L.bx[i] + L.ox[i], y = L.by[i] + L.oy[i]
        let aim = L.aim[i]
        // Walking with nobody to aim at: look where the drawn path goes.
        if (L.moving[i] > 0.6 && i + 1 < L.n) {
            const nx = L.bx[i + 1] + L.ox[i + 1], ny = L.by[i + 1] + L.oy[i + 1]
            const baseHeading = angle({ x: L.bx[i], y: L.by[i] }, { x: L.bx[i + 1], y: L.by[i + 1] })
            if (hypot(nx - x, ny - y) > 0.05 && abs(wrap(L.aim[i] - baseHeading)) < 0.3) aim = angle({ x, y }, { x: nx, y: ny })
        }
        out.push({ t, x, y, floor: L.floor[i], aim })
    }
    return out
}

const wrap = (a: number) => {
    let d = a % (2 * PI)
    if (d > PI) d -= 2 * PI
    if (d < -PI) d += 2 * PI
    return d
}
