/**
 * Radar playback clock. The live match ticks once per game second; between
 * ticks the radar advances the round time itself so the script is sampled
 * continuously. Pausing freezes it where it is, resuming continues from there
 * instead of jumping ahead, and a new tick restarts the glide from that tick.
 *
 * Mutable on purpose: the canvas reads it every animation frame, the panel
 * writes it when its props change — no React state per frame.
 */

export interface RadarClock {
    /** Last tick (whole game seconds) from the match. */
    tick: number
    /** Wall-clock ms when that tick arrived (or playback resumed). */
    tickStart: number
    /** Wall-clock length of one tick. */
    durationMs: number
    /** Playback is running and motion is allowed. */
    animating: boolean
    /** Progress 0–1 through the current tick (kept while paused). */
    alpha: number
}

export function createRadarClock(tick = 0, now = 0): RadarClock {
    return { tick, tickStart: now, durationMs: 1000, animating: false, alpha: 0 }
}

/** A new tick from the match: glide from it. Same tick again is a no-op. */
export function clockSetTick(c: RadarClock, tick: number, now: number): void {
    if (c.tick === tick) return
    c.tick = tick
    c.alpha = 0
    c.tickStart = now
}

/** Playback started / stopped or the speed changed; keeps the progress through the tick. */
export function clockSetPlayback(c: RadarClock, animating: boolean, durationMs: number, now: number): void {
    if (c.animating) c.alpha = progress(c, now)
    c.animating = animating && durationMs > 0
    c.durationMs = durationMs > 0 ? durationMs : c.durationMs
    if (c.animating) c.tickStart = now - c.alpha * c.durationMs
}

function progress(c: RadarClock, now: number): number {
    if (!c.animating || !(c.durationMs > 0)) return c.alpha
    return Math.max(0, Math.min(1, (now - c.tickStart) / c.durationMs))
}

/** Round time the radar shows at wall-clock `now`. */
export function clockTime(c: RadarClock, now: number): number {
    if (c.animating) c.alpha = progress(c, now)
    return c.tick + c.alpha
}
