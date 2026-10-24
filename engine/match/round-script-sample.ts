/**
 * Sampling one round-script track at a moment (shared by the builder's
 * grenade placement and the radar).
 */

import { lerpAngle } from "./round-script-context"
import type { Floor, TrackKey } from "./round-script-types"

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
