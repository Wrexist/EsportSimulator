/**
 * Live match pacing (Phase 3, stream K).
 *
 * A round used to play back in real time (115 s + bomb), so a map took
 * ~25 minutes of radar. "Key moments" pacing keeps the parts worth
 * watching at the chosen speed and fast-forwards the quiet stretches:
 *
 *   moments   every kill ±2.5 s (the opening duel with a longer lead-in),
 *             the plant, defuse start and end, the explosion, utility
 *             executes (2+ grenades within a few seconds) and the end of
 *             the round (the decisive moment up to ROUND_END)
 *   quiet     everything else, incl. freeze time: QUIET_FACTOR × faster
 *
 * Speed changes are eased (smoothstep over RAMP_SECONDS of round time on
 * the quiet side of each boundary), so the radar never jumps: it speeds up
 * after a moment and slows down before the next one. Moments always play
 * at exactly the moment speed.
 *
 * The pacing is expressed as the wall-clock length of each round second
 * (`tickWallMs`); the live clock (lib/live-clock.ts) plays the round
 * continuously at that rate, so the radar moves smoothly at any speed.
 *
 * Pure and deterministic: same events/script → same windows and timings.
 */

import type { MatchEvent } from "@/types"
import type { RoundScript } from "@/engine/match/round-script-types"

export type PacingMode = "moments" | "full"
export const PACING_MODES: readonly PacingMode[] = ["moments", "full"]
export const PACING_MODE_LABEL: Record<PacingMode, string> = { moments: "Key moments", full: "Full round" }

export type MomentKind = "opening" | "kill" | "plant" | "defuse-start" | "defuse-end" | "explode" | "utility" | "round-end"

export interface PacingWindow {
    /** Round seconds (inclusive start, exclusive end). */
    start: number
    end: number
    kinds: MomentKind[]
}

export interface RoundPacing {
    windows: PacingWindow[]
    /** Time of the ROUND_END event (the round stops being played back there). */
    endTime: number
}

export const PACING = {
    KILL_LEAD: 2.5,
    KILL_TAIL: 2.5,
    /** The round's first kill: a longer lead-in shows the contact building up. */
    OPENING_LEAD: 4,
    /** The plant takes 3.2 s; the PLANT event is when it completes. */
    PLANT_LEAD: 4,
    PLANT_TAIL: 2,
    DEFUSE_START_LEAD: 1.5,
    DEFUSE_START_TAIL: 1.5,
    DEFUSE_END_LEAD: 2,
    DEFUSE_END_TAIL: 1.5,
    EXPLODE_LEAD: 3,
    EXPLODE_TAIL: 1.5,
    UTILITY_LEAD: 1,
    UTILITY_TAIL: 2,
    /** Grenades this close together belong to one execute. */
    UTILITY_CLUSTER_GAP: 3,
    /** Fewest grenades in a cluster for it to count as an execute. */
    UTILITY_MIN_CLUSTER: 2,
    /** Lead-in before the decisive moment (last kill / defuse / explosion). */
    ROUND_END_LEAD: 2.5,
    /** ROUND_END follows the decisive moment by 2 s; a longer gap means the clock ran out. */
    ROUND_END_GRACE: 3,
    /** Windows closer than this are played as one (no speed-up for a blink). */
    MERGE_GAP: 1.5,
    /**
     * Moment speed at 1× in round seconds per real second. A map has ~34 s
     * of moments per round; at real time a map would still take ~15 min,
     * so the speed buttons multiply this base (2× = moments at 3× real time).
     */
    MOMENT_SPEED: 1.5,
    /** Quiet stretches play this many times faster than the moments. */
    QUIET_FACTOR: 8,
    /** Round seconds over which the speed eases between moment and quiet speed. */
    RAMP_SECONDS: 3,
    /** Shortest wall-clock round second (ms): fast-forward plays at most 20× real time. */
    MIN_TICK_MS: 50,
} as const

const DECISIVE: ReadonlySet<MatchEvent["type"]> = new Set(["KILL", "DEFUSE", "EXPLODE"])

/** The round's moments from its events (and script, for defuse start / utility). */
export function computeRoundPacing(events: readonly MatchEvent[], script?: Pick<RoundScript, "utility" | "bomb"> | null): RoundPacing {
    const P = PACING
    const raw: PacingWindow[] = []
    const add = (kind: MomentKind, start: number, end: number) => {
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) raw.push({ start: Math.max(0, start), end, kinds: [kind] })
    }
    const sorted = [...events].filter(e => Number.isFinite(e.time)).sort((a, b) => a.time - b.time)
    const endEvent = sorted.find(e => e.type === "ROUND_END")
    const endTime = endEvent ? endEvent.time : sorted.length ? sorted[sorted.length - 1].time : 0

    let first = true
    for (const e of sorted) {
        if (e.time > endTime) break
        if (e.type === "KILL") {
            add(first ? "opening" : "kill", e.time - (first ? P.OPENING_LEAD : P.KILL_LEAD), e.time + P.KILL_TAIL)
            first = false
        } else if (e.type === "PLANT") add("plant", e.time - P.PLANT_LEAD, e.time + P.PLANT_TAIL)
        else if (e.type === "DEFUSE") add("defuse-end", e.time - P.DEFUSE_END_LEAD, e.time + P.DEFUSE_END_TAIL)
        else if (e.type === "EXPLODE") add("explode", e.time - P.EXPLODE_LEAD, e.time + P.EXPLODE_TAIL)
    }

    const defuse = script?.bomb?.defuse
    if (defuse && Number.isFinite(defuse.tStart) && defuse.tStart < endTime) add("defuse-start", defuse.tStart - P.DEFUSE_START_LEAD, defuse.tStart + P.DEFUSE_START_TAIL)

    // Utility executes: clusters of grenades thrown close together.
    const throws = (script?.utility ?? []).map(u => u.t).filter(t => Number.isFinite(t) && t < endTime).sort((a, b) => a - b)
    for (let i = 0; i < throws.length;) {
        let j = i
        while (j + 1 < throws.length && throws[j + 1] - throws[j] <= P.UTILITY_CLUSTER_GAP) j++
        if (j - i + 1 >= P.UTILITY_MIN_CLUSTER) add("utility", throws[i] - P.UTILITY_LEAD, throws[j] + P.UTILITY_TAIL)
        i = j + 1
    }

    // The end of the round: from just before the decisive moment (last kill,
    // defuse or explosion; the clock when the round ran out of time) to ROUND_END.
    if (endEvent) {
        const decisive = [...sorted].reverse().find(e => DECISIVE.has(e.type) && e.time <= endTime)
        const at = decisive && endTime - decisive.time <= P.ROUND_END_GRACE ? decisive.time : endTime - 2
        add("round-end", at - P.ROUND_END_LEAD, endTime + 0.001)
    }

    return { windows: mergeWindows(raw, endTime), endTime }
}

/** Sort, clip to the round and merge overlapping (or nearly touching) windows. */
export function mergeWindows(windows: readonly PacingWindow[], endTime: number): PacingWindow[] {
    const sorted = windows
        .map(w => ({ start: Math.max(0, w.start), end: Math.min(endTime + 0.001, w.end), kinds: [...w.kinds] }))
        .filter(w => w.end > w.start)
        .sort((a, b) => a.start - b.start)
    const out: PacingWindow[] = []
    for (const w of sorted) {
        const last = out[out.length - 1]
        if (last && w.start - last.end <= PACING.MERGE_GAP) {
            last.end = Math.max(last.end, w.end)
            for (const k of w.kinds) if (!last.kinds.includes(k)) last.kinds.push(k)
        } else out.push(w)
    }
    return out
}

const smoothstep = (x: number) => {
    const c = Math.max(0, Math.min(1, x))
    return c * c * (3 - 2 * c)
}

/**
 * Relative playback rate at round time `t`: 1 inside a moment, up to
 * QUIET_FACTOR in a quiet stretch, eased near each moment.
 */
export function pacingRate(pacing: RoundPacing, t: number): number {
    const { windows } = pacing
    let prevEnd = -Infinity
    for (const w of windows) {
        if (t < w.start) {
            const d = Math.min(t - prevEnd, w.start - t)
            return 1 + (PACING.QUIET_FACTOR - 1) * smoothstep(d / PACING.RAMP_SECONDS)
        }
        if (t < w.end) return 1
        prevEnd = w.end
    }
    // After the last moment (the round has ended or will on time).
    return 1 + (PACING.QUIET_FACTOR - 1) * smoothstep((t - prevEnd) / PACING.RAMP_SECONDS)
}

/** The dock's key-moment indicator switches this many round seconds before a boundary. */
export const FAST_FORWARD_LEAD = 0.5
/** The radar labels the first round seconds "FREEZE TIME". */
export const FREEZE_LABEL_SECONDS = 3

/** True when round time `t` is inside a key moment. */
export function inMoment(pacing: RoundPacing, t: number): boolean {
    return pacing.windows.some(w => t >= w.start && t < w.end)
}

const SAMPLES = 8

/**
 * Wall-clock milliseconds for the tick that plays round second `t` → `t + 1`
 * at `speed` (1×/2×/4×/8×, times MOMENT_SPEED inside moments). Full-round
 * mode (or no pacing) plays every second at `speed` (1× = real time).
 */
export function tickWallMs(pacing: RoundPacing | null, t: number, speed: number, mode: PacingMode): number {
    const s = Math.max(0.1, speed)
    if (mode === "full" || !pacing) return 1000 / s
    // Midpoint rule over the tick: wall time = ∫ dt / (speed × base × rate(t)).
    let inv = 0
    for (let i = 0; i < SAMPLES; i++) inv += 1 / pacingRate(pacing, t + (i + 0.5) / SAMPLES)
    const momentMs = 1000 / (s * PACING.MOMENT_SPEED)
    return Math.max(PACING.MIN_TICK_MS, Math.min(momentMs, momentMs * (inv / SAMPLES)))
}

/**
 * Wall-clock milliseconds to play a whole round back (ticks 0 … floor(end)),
 * as the live loop does: an event at time e is revealed on tick floor(e).
 */
export function roundWallMs(pacing: RoundPacing, speed: number, mode: PacingMode): number {
    const last = Math.floor(pacing.endTime)
    let total = 0
    for (let t = 0; t < last; t++) total += tickWallMs(pacing, t, speed, mode)
    return total
}

/** Round seconds spent inside moments (for reports and tests). */
export function momentSeconds(pacing: RoundPacing): number {
    return pacing.windows.reduce((s, w) => s + (w.end - w.start), 0)
}

// ─── Between rounds ─────────────────────────────────────────────────────────

/** Round-end banner (who won, how, MVP) before the next decision. */
export const ROUND_BEAT_MS = 1200
/** Auto tactics: the decision card confirms itself after this long. */
export const AUTO_CONFIRM_MS = 2000
/** Pistol rounds (no decision) start this long after the beat. */
export const PISTOL_START_MS = 900
/** Halftime / map-change card before the pistol round starts on its own. */
export const BREAK_CARD_MS = 3200

/**
 * Starting speed from the "Live match speed" setting. Key moments start at
 * 2× (moments at 3× real time: a BO1 map in ~6 minutes); full rounds at 1×
 * (real time), as before.
 */
export function defaultLiveSpeed(mode: PacingMode, setting: "normal" | "fast" | "very-fast" | undefined): number {
    if (mode === "moments") return setting === "very-fast" ? 8 : setting === "fast" ? 4 : 2
    return setting === "very-fast" ? 4 : setting === "fast" ? 2 : 1
}
