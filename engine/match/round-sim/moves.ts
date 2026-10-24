/**
 * Where every player walked in a sight-v1 round (round-sim/sight.ts), in a
 * compact form the round result carries so the radar replays the engine's
 * own positions (live, after a resume and in the review scrubber).
 *
 * A player's record is their spawn node followed by legs of four numbers:
 *
 *   [t × 100, to, pace, walked]
 *
 * From `t` the player walks the walk graph's shortest path from where the
 * previous leg ended to node `to` at PACES[pace] × runSpeed, and stops after
 * `walked` edges (the whole path when the leg was not cut). The engine and
 * the radar both expand legs with `expandLegs`, so they agree exactly.
 *
 * The bomb: [t × 100, carrier index (into `ids`, -1 = on the ground), node].
 */

import type { NavGraph } from "../round-script-nav"

/** Shares of the map's runSpeed: walk, run, creep. */
export const PACES = [0.85, 0.95, 0.6] as const

export interface RoundMoves {
    v: 1
    /** Player ids, in record order. */
    ids: string[]
    /** Per player (same order as `ids`): spawn node, then legs of 4 numbers. */
    legs: number[][]
    /** Bomb carrier changes: triples [t × 100, carrier index or -1, node]. */
    bomb: number[]
}

/** One timed node of an expanded track. */
export interface TimedNode {
    t: number
    node: number
}

/**
 * Arrival times along a path walked from `t0` at `pace` (`at[0]` = t0).
 * Shared by the engine and the radar so both compute the same floats.
 */
export function arrivals(g: NavGraph, path: readonly number[], t0: number, pace: number): number[] {
    const v = g.map.runSpeed * PACES[pace]
    const at = [t0]
    for (let i = 1; i < path.length; i++) at.push(at[i - 1] + g.cost(path[i - 1], path[i]) / v)
    return at
}

/**
 * A player's record as timed nodes: the spawn at 0, every node reached (or
 * being walked to when the leg was cut) with its arrival time. Standing still
 * between legs is implied by the gap to the next leg's start.
 */
export function expandLegs(g: NavGraph, rec: readonly number[]): TimedNode[] {
    if (!rec.length) return []
    let node = rec[0]
    const out: TimedNode[] = [{ t: 0, node }]
    for (let i = 1; i + 3 < rec.length; i += 4) {
        const t0 = rec[i] / 100, to = rec[i + 1], pace = rec[i + 2], walked = rec[i + 3]
        const full = g.path(node, to)
        const path = walked >= 0 ? full.slice(0, walked + 1) : full
        if (path.length < 2) continue
        const at = arrivals(g, path, t0, pace)
        out.push({ t: t0, node })
        for (let k = 1; k < path.length; k++) out.push({ t: at[k], node: path[k] })
        node = path[path.length - 1]
    }
    return out
}
