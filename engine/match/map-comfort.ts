/**
 * Map identity: every club has maps it is at home on and maps it avoids.
 * Of the seven rotation maps, a club's best map gives it MAP_COMFORT_STEPS[0]
 * of team edge, its second best the next step, and its two weakest the same
 * amounts against it; the three in the middle are neutral. The edge joins the
 * rest of the non-player edge (staff, prep, chemistry...) under the same cap,
 * so the veto decides something: ban their best map, pick your own.
 *
 * Drawn once per club (it is the club's identity, it does not change by
 * season), the same rule for every club including the manager's.
 */

import { ROTATION_MAP_POOL } from "@/data/map-pool"
import { SeededRNG, deriveSeed } from "../rng"

/**
 * Team edge on a club's maps, best first; the worst maps mirror the best.
 * Measured scale (docs/revamp/calibration/WIN_ODDS_2026-10.md): +10% edge is
 * about +4 map-win points, so a club on its best map against a club on its
 * worst is about four points better off than on neutral ground.
 */
export const MAP_COMFORT_STEPS = [0.05, 0.025] as const

/** How much a point of comfort edge moves the veto's map strength (skill points). */
export const MAP_COMFORT_VETO_WEIGHT = 200

const cache = new Map<string, Map<string, number>>()

/** A club's edge on each rotation map (map id → edge, -0.05 to +0.05). */
export function teamMapComfort(teamId: string): Map<string, number> {
    const hit = cache.get(teamId)
    if (hit) return hit
    const rng = new SeededRNG(deriveSeed(0x3a9c0f, teamId))
    const order = [...ROTATION_MAP_POOL]
    for (let i = order.length - 1; i > 0; i--) {
        const j = rng.int(0, i)
        ;[order[i], order[j]] = [order[j], order[i]]
    }
    const out = new Map<string, number>(order.map(m => [m, 0]))
    MAP_COMFORT_STEPS.forEach((step, i) => {
        out.set(order[i], step)
        out.set(order[order.length - 1 - i], -step)
    })
    if (cache.size > 500) cache.clear()
    cache.set(teamId, out)
    return out
}

/** A club's edge on one map (0 for a map outside the rotation). */
export function mapComfort(teamId: string | undefined, mapId: string | undefined): number {
    if (!teamId || !mapId) return 0
    return teamMapComfort(teamId).get(mapId) ?? 0
}

/** Short label for a club's comfort on a map. */
export function mapComfortLabel(edge: number): string {
    if (edge >= MAP_COMFORT_STEPS[0]) return "Best map"
    if (edge > 0) return "Strong"
    if (edge <= -MAP_COMFORT_STEPS[0]) return "Worst map"
    if (edge < 0) return "Weak"
    return "Neutral"
}
