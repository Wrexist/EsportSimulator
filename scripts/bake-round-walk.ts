/**
 * Bake where a player can stand on each round map: a 0.5 map-% raster per
 * floor, a cell walkable when the map's nav mesh has ground on that floor
 * under its centre. Written to data/round-maps/walk/<Map>.json and read by
 * engine/match/round-script-walkable.ts (the radar keeps loosened paths on
 * walkable ground).
 *
 *   npx tsx scripts/bake-round-walk.ts [Map ...]
 *
 * The raster depends only on the map's meshes and registration
 * (scripts/map-world.ts), not on the round map's routes.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DRAFTS, ROOT, World } from './map-world'
import { WALK_CELL, WALK_SIZE } from '../engine/match/round-script-walkable'
import type { Floor } from '../engine/match/round-script-types'

function bake(mapId: string): void {
    const W = new World(mapId)
    const floors: Floor[] = DRAFTS[mapId].lower ? ['upper', 'lower'] : ['upper']
    const out: Record<string, unknown> = { schemaVersion: 1, mapId, cell: WALK_CELL, size: WALK_SIZE }
    const counts: string[] = []
    for (const floor of floors) {
        const bytes = new Uint8Array(Math.ceil(WALK_SIZE * WALK_SIZE / 8))
        let n = 0
        for (let gx = 0; gx < WALK_SIZE; gx++) for (let gy = 0; gy < WALK_SIZE; gy++) {
            const x = (gx + 0.5) * WALK_CELL, y = (gy + 0.5) * WALK_CELL
            if (!W.standable(x, y, floor)) continue
            const i = gx * WALK_SIZE + gy
            bytes[i >> 3] |= 1 << (i & 7)
            n++
        }
        out[floor] = Buffer.from(bytes).toString('base64')
        counts.push(`${floor} ${n} cells`)
    }
    const dir = path.join(ROOT, 'data/round-maps/walk')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, `${mapId}.json`), JSON.stringify(out) + '\n')
    console.log(`${mapId}: ${counts.join(', ')}`)
}

const wanted = process.argv.slice(2)
for (const id of Object.keys(DRAFTS)) if (!wanted.length || wanted.includes(id)) bake(id)
