/**
 * Live playback clock (Phase 3 polish).
 *
 * One continuous round clock per live screen: wall-clock time → round time,
 * following the pacing model (key moments at the chosen speed, quiet stretches
 * fast-forwarded with eased ramps; full rounds at `speed`). The radar samples
 * `now()` on every animation frame, so it moves smoothly at any speed; the
 * live hook asks `wallAt(t)` when an event is due and reveals it then, so
 * React only renders when the screen actually changes.
 *
 * The wall-clock length of each round second is exactly `tickWallMs` (the
 * old one-tick-per-second loop), spread inside the second by the same
 * midpoint samples, so a round takes as long as before.
 *
 * Mutable on purpose: never React state. `version` bumps on every jump
 * (new round, seek, restore) so the radar redraws.
 */

import type { MatchEvent } from "@/types"
import type { RoundScript } from "@/engine/match/round-script-types"
import { FAST_FORWARD_LEAD, FREEZE_LABEL_SECONDS, pacingRate, tickWallMs, type PacingMode, type RoundPacing } from "./live-match-pacing"
import type { RoundTimeline } from "./live-match-roster"
import { PLANT_SECONDS } from "./radar-script-frame"

/** What the radar needs: round time at a wall-clock instant. */
export interface LiveTimeSource {
    /** Round seconds at `wallMs` (performance.now() timeline). */
    now(wallMs?: number): number
    /** Bumped when the time jumps instead of flowing. */
    readonly version: number
}

/** Sub-steps per round second (the midpoint samples of `tickWallMs`). */
const STEPS = 8
/** Round length covered when the round's end is not known yet. */
const DEFAULT_SPAN = 240

const wallNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now())

export class LiveClock implements LiveTimeSource {
    private pacing: RoundPacing | null = null
    private speed = 1
    private mode: PacingMode = "moments"
    /** Wall ms from round time 0 at each sub-step boundary. */
    private cum = new Float64Array(1)
    private maxT = DEFAULT_SPAN
    private running = false
    private anchorT = -1
    private anchorWall = 0
    version = 0

    /** Last round time the clock can show (the round's ROUND_END). */
    get end(): number { return this.maxT }
    get isRunning(): boolean { return this.running }

    /** A new round (or a restored / skipped one) shown from round time `t`. */
    startRound(pacing: RoundPacing | null, t: number, wallMs = wallNow()): void {
        this.pacing = pacing
        this.maxT = pacing && Number.isFinite(pacing.endTime) ? Math.max(0, pacing.endTime) : DEFAULT_SPAN
        this.rebuild()
        this.anchorT = t < 0 ? t : Math.min(this.maxT, t)
        this.anchorWall = wallMs
        this.version++
    }

    /** Speed or pacing mode changed: keep the current round time, continue at the new rate. */
    configure(speed: number, mode: PacingMode, wallMs = wallNow()): void {
        if (speed === this.speed && mode === this.mode) return
        this.anchorT = this.now(wallMs)
        this.anchorWall = wallMs
        this.speed = speed
        this.mode = mode
        this.rebuild()
    }

    /** Play / pause; the round time is kept across a pause. */
    setRunning(on: boolean, wallMs = wallNow()): void {
        if (on === this.running) return
        this.anchorT = this.now(wallMs)
        this.anchorWall = wallMs
        this.running = on
    }

    /** Jump to round time `t` (skip round, finished match). */
    seek(t: number, wallMs = wallNow()): void {
        this.anchorT = t < 0 ? t : Math.min(this.maxT, t)
        this.anchorWall = wallMs
        this.version++
    }

    now(wallMs = wallNow()): number {
        if (!this.running || this.anchorT < 0) return this.anchorT
        const w = this.offsetAt(this.anchorT) + Math.max(0, wallMs - this.anchorWall)
        return this.timeAtOffset(w)
    }

    /**
     * Wall-clock ms (performance.now() timeline) at which the clock reaches
     * round time `t`; Infinity while paused or when `t` is past the round's end.
     */
    wallAt(t: number, wallMs = wallNow()): number {
        if (!this.running || !Number.isFinite(t) || t > this.maxT + 1e-9) return Infinity
        const cur = this.now(wallMs)
        if (t <= cur) return wallMs
        return this.anchorWall + (this.offsetAt(t) - this.offsetAt(this.anchorT))
    }

    /** Wall ms the rest of the round takes from `t` at the current speed (reports, tests). */
    wallBetween(a: number, b: number): number {
        return Math.max(0, this.offsetAt(b) - this.offsetAt(a))
    }

    private rebuild(): void {
        const seconds = Math.max(1, Math.ceil(this.maxT) + 1)
        const cum = new Float64Array(seconds * STEPS + 1)
        const weights = new Float64Array(STEPS)
        const paced = this.mode === "moments" && !!this.pacing
        for (let k = 0; k < seconds; k++) {
            const total = tickWallMs(this.pacing, k, this.speed, this.mode)
            let sum = 0
            for (let i = 0; i < STEPS; i++) {
                weights[i] = paced ? 1 / pacingRate(this.pacing!, k + (i + 0.5) / STEPS) : 1
                sum += weights[i]
            }
            for (let i = 0; i < STEPS; i++) {
                const j = k * STEPS + i
                cum[j + 1] = cum[j] + total * (weights[i] / sum)
            }
        }
        this.cum = cum
    }

    private offsetAt(t: number): number {
        const x = Math.max(0, Math.min(this.maxT, t)) * STEPS
        const i = Math.min(this.cum.length - 2, Math.floor(x))
        return this.cum[i] + (this.cum[i + 1] - this.cum[i]) * (x - i)
    }

    private timeAtOffset(w: number): number {
        const cum = this.cum
        if (w <= 0) return 0
        if (w >= this.offsetAt(this.maxT)) return this.maxT
        let lo = 0, hi = cum.length - 1
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1
            if (cum[mid] <= w) lo = mid
            else hi = mid
        }
        const span = cum[hi] - cum[lo]
        const t = (lo + (span > 0 ? (w - cum[lo]) / span : 0)) / STEPS
        return Math.min(this.maxT, t)
    }
}

// ─── Scorebug clock ─────────────────────────────────────────────────────────

/** Round clock on the scorebug (1:55 down), seconds. */
export const ROUND_SECONDS = 115
/** Bomb timer on the scorebug from the plant, seconds. */
export const BOMB_SECONDS = 40

export interface ScorebugTime {
    /** Whole seconds shown. */
    seconds: number
    /** The bomb timer is shown (planted, not yet defused / exploded). */
    planted: boolean
}

/**
 * What the scorebug shows at round time `t`: the round clock until the plant
 * (it stops there), then the bomb timer until the defuse / explosion. The
 * plant counts once `t` reaches it (the reveal rule of the feed and radar).
 */
export function scorebugTime(t: number, plantAt?: number, bombEndAt?: number): ScorebugTime {
    const plant = plantAt !== undefined && plantAt <= t ? plantAt : undefined
    if (plant !== undefined && !(bombEndAt !== undefined && bombEndAt <= t)) return { seconds: Math.max(0, BOMB_SECONDS - Math.floor(t - plant)), planted: true }
    return { seconds: roundClockSeconds(t, plantAt), planted: false }
}

/** The round clock at round time `t` (it stops at the plant). */
export function roundClockSeconds(t: number, plantAt?: number): number {
    const until = plantAt !== undefined && plantAt <= t ? plantAt : t
    return Math.max(0, ROUND_SECONDS - Math.floor(Math.max(0, until)))
}

/** PLANT time and the defuse / explosion that ends the bomb timer, from a round's events. */
export function roundBombTimes(events: readonly MatchEvent[]): { plantAt?: number; bombEndAt?: number } {
    const plant = events.find(e => e.type === "PLANT")
    if (!plant) return {}
    const end = events.find(e => (e.type === "DEFUSE" || e.type === "EXPLODE") && e.time >= plant.time)
    return { plantAt: plant.time, ...(end ? { bombEndAt: end.time } : {}) }
}

// ─── When the screen changes ────────────────────────────────────────────────

export interface WakeSource {
    events: readonly MatchEvent[]
    timeline?: Pick<RoundTimeline, "hp" | "throws" | "multiKills"> | null
    pacing?: RoundPacing | null
    script?: Pick<RoundScript, "bomb"> | null
}

/**
 * Round times at which something on the live screen outside the radar's own
 * canvas and the scorebug timer changes: events (feed, roster, score), HP
 * steps and grenades thrown (roster), multi-kill callouts, the bomb's
 * planting / defusing phases and the end of freeze time (radar header) and
 * the key-moment indicator (`FAST_FORWARD_LEAD` before each pacing
 * boundary). Sorted, unique. The live hook renders at these times only.
 */
export function liveWakeTimes(src: WakeSource): number[] {
    const out: number[] = []
    const add = (t: number | undefined) => { if (t !== undefined && Number.isFinite(t) && t >= 0) out.push(t) }
    add(FREEZE_LABEL_SECONDS)
    for (const e of src.events) add(e.time)
    const tl = src.timeline
    if (tl) {
        for (const steps of Object.values(tl.hp)) for (const s of steps) add(s.t)
        for (const list of Object.values(tl.throws)) for (const u of list) add(u.t)
        for (const k of tl.multiKills) add(k.t)
    }
    for (const w of src.pacing?.windows ?? []) { add(w.start - FAST_FORWARD_LEAD); add(w.end - FAST_FORWARD_LEAD) }
    const bomb = src.script?.bomb
    if (bomb?.plant) add(bomb.plant.t - PLANT_SECONDS)
    if (bomb?.defuse) { add(bomb.defuse.tStart); add(bomb.defuse.tEnd) }
    if (bomb?.explodeAt !== undefined) add(bomb.explodeAt)
    out.sort((a, b) => a - b)
    return out.filter((t, i) => i === 0 || t - out[i - 1] > 1e-6)
}

/** First wake strictly after `t` (Infinity when none). */
export function nextWakeAfter(wakes: readonly number[] | undefined, t: number): number {
    if (!wakes?.length) return Infinity
    let lo = 0, hi = wakes.length
    while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (wakes[mid] <= t + 1e-9) lo = mid + 1
        else hi = mid
    }
    return lo < wakes.length ? wakes[lo] : Infinity
}
