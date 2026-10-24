/**
 * Line of sight between walk-graph nodes (baked by
 * scripts/bake-round-visibility.ts into data/round-maps/visibility/).
 *
 * The round script uses it twice: a duel is only placed where the two can
 * see each other, and a player holding a spot steps into cover when an enemy
 * they are not about to fight would see them from close range (no more
 * minute-long stand-offs at 2 m with nobody shooting).
 *
 * Pairs farther apart than VIS_RADIUS, or on different floors, never count
 * as visible: past that range a sighting is not a fight the radar has to
 * explain. Without a bake (or with a stale one) every pair in range is
 * visible, which is the old behaviour.
 */

import type { NavGraph } from "./round-script-nav"
import type { RPoint } from "./round-script-types"
import { VISIBILITY_BAKES } from "@/data/round-maps/visibility"

/** Map-% radius the bake covers (≥ the longest duel and the exposure range). */
export const VIS_RADIUS = 12

export interface VisibilityBake {
    schemaVersion: 1
    mapId: string
    radius: number
    nodes: number
    checksum: number
    pairs: number
    bits: string
}

/** Walks every baked pair once (n < m, same floor, within VIS_RADIUS), in bit order. */
export function visibilityPairs(g: NavGraph, visit: (n: number, m: number) => void): void {
    for (let n = 0; n < g.size; n++) {
        const near = g.around(n, VIS_RADIUS).filter(m => m > n).sort((a, b) => a - b)
        for (const m of near) visit(n, m)
    }
}

/** Stable fingerprint of the graph's nodes (count and rounded coordinates). */
export function graphChecksum(g: NavGraph): number {
    let h = g.size >>> 0
    for (let n = 0; n < g.size; n++) {
        h = (Math.imul(h, 31) + Math.round(g.x[n] * 100)) >>> 0
        h = (Math.imul(h, 31) + Math.round(g.y[n] * 100)) >>> 0
        h = (Math.imul(h, 31) + (g.floor[n] === "lower" ? 1 : 0)) >>> 0
    }
    return h
}

export class Visibility {
    /** Visible pairs: byte n * size + m is 1 (both orders). Null = no usable bake. */
    private readonly seen: Uint8Array | null

    constructor(private readonly g: NavGraph, bake: VisibilityBake | undefined) {
        this.seen = bake && bake.nodes === g.size && bake.checksum === graphChecksum(g) ? decode(g, bake) : null
    }

    /** True when the map has a matching bake (tests). */
    get baked(): boolean {
        return this.seen !== null
    }

    /** Can a player standing on node `a` see one on node `b`? */
    sees(a: number, b: number): boolean {
        const g = this.g
        if (a === b) return true
        if (g.floor[a] !== g.floor[b]) return false
        const dx = g.x[a] - g.x[b], dy = g.y[a] - g.y[b]
        if (dx * dx + dy * dy > VIS_RADIUS * VIS_RADIUS) return false
        return this.seen === null || this.seen[a * g.size + b] === 1
    }
}

function decode(g: NavGraph, bake: VisibilityBake): Uint8Array | null {
    const bytes = typeof Buffer !== "undefined" ? Buffer.from(bake.bits, "base64") : Uint8Array.from(atob(bake.bits), c => c.charCodeAt(0))
    const seen = new Uint8Array(g.size * g.size)
    let i = 0
    let ok = true
    visibilityPairs(g, (n, m) => {
        if (i >= bake.pairs) { ok = false; return }
        if (bytes[i >> 3] & (1 << (i & 7))) {
            seen[n * g.size + m] = 1
            seen[m * g.size + n] = 1
        }
        i++
    })
    return ok && i === bake.pairs ? seen : null
}

const cache = new WeakMap<NavGraph, Visibility>()

/** The graph's visibility (decoded once per graph). */
export function visibilityFor(g: NavGraph): Visibility {
    let v = cache.get(g)
    if (!v) {
        v = new Visibility(g, VISIBILITY_BAKES[g.map.mapId])
        cache.set(g, v)
    }
    return v
}

/** Does the segment a→b pass through a circle (a smoke) of radius r at c? */
export function segmentHitsCircle(a: RPoint, b: { x: number; y: number }, c: { x: number; y: number }, r: number): boolean {
    const dx = b.x - a.x, dy = b.y - a.y
    const l2 = dx * dx + dy * dy
    let u = l2 > 0 ? ((c.x - a.x) * dx + (c.y - a.y) * dy) / l2 : 0
    u = u < 0 ? 0 : u > 1 ? 1 : u
    const px = a.x + dx * u - c.x, py = a.y + dy * u - c.y
    return px * px + py * py < r * r
}
