/**
 * Where a player can stand on a round map (baked by
 * scripts/bake-round-walk.ts into data/round-maps/walk/): a 0.5 map-% raster
 * per floor taken from the map's nav mesh.
 *
 * The radar uses it to let players drift off the route lines (lanes, hold
 * shuffles, rounded corners) without ever showing one inside a wall. Without
 * a bake only the route lines themselves count as walkable, so nothing moves
 * off them.
 */

import type { Floor } from "./round-script-types"
import { WALK_BAKES } from "@/data/round-maps/walk"

/** Raster cell (map-%). */
export const WALK_CELL = 0.5
/** Cells per side (covers 0–100 map-%). */
export const WALK_SIZE = 200

export interface WalkBake {
    schemaVersion: 1
    mapId: string
    cell: number
    size: number
    upper: string
    lower?: string
}

function decode(b64: string): Uint8Array {
    if (typeof atob === "function") {
        const s = atob(b64)
        const out = new Uint8Array(s.length)
        for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
        return out
    }
    return Uint8Array.from(Buffer.from(b64, "base64"))
}

export class WalkArea {
    private readonly bits: Partial<Record<Floor, Uint8Array>> = {}
    readonly baked: boolean

    constructor(bake: WalkBake | undefined) {
        this.baked = !!bake && bake.schemaVersion === 1 && bake.cell === WALK_CELL && bake.size === WALK_SIZE
        if (!this.baked) return
        this.bits.upper = decode(bake!.upper)
        if (bake!.lower) this.bits.lower = decode(bake!.lower)
    }

    /** Ground under this point (on its floor). */
    ok(x: number, y: number, floor: Floor): boolean {
        const b = this.bits[floor] ?? this.bits.upper
        if (!b) return false
        const gx = Math.floor(x / WALK_CELL), gy = Math.floor(y / WALK_CELL)
        if (gx < 0 || gy < 0 || gx >= WALK_SIZE || gy >= WALK_SIZE) return false
        const i = gx * WALK_SIZE + gy
        return (b[i >> 3] & (1 << (i & 7))) !== 0
    }

    /** Ground all along the straight line a → b (checked every quarter cell). */
    clear(ax: number, ay: number, bx: number, by: number, floor: Floor): boolean {
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (WALK_CELL / 4)))
        for (let k = 1; k <= steps; k++) {
            const u = k / steps
            if (!this.ok(ax + (bx - ax) * u, ay + (by - ay) * u, floor)) return false
        }
        return true
    }
}

const cache = new Map<string, WalkArea>()

export function walkAreaFor(mapId: string): WalkArea {
    let w = cache.get(mapId)
    if (!w) {
        w = new WalkArea(WALK_BAKES[mapId])
        cache.set(mapId, w)
    }
    return w
}
