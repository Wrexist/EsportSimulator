/**
 * Bake which round-script walk-graph nodes can see each other
 * (`data/round-maps/visibility/<mapId>.json`, read by
 * engine/match/round-script-visibility.ts).
 *
 *   npx tsx scripts/bake-round-visibility.ts            # all maps
 *   npx tsx scripts/bake-round-visibility.ts Mirage Nuke
 *
 * For every pair of nodes on the same floor within BAKE_RADIUS map-% the
 * collision mesh (public/map-studio/spatial/<Map>.mesh) is raycast at standing
 * eye height between the two ground points. One bit per pair, in the order
 * `visibilityPairs` walks them, base64-encoded. A node whose ground cannot be
 * found counts as seeing everything; a point over several walkable surfaces
 * (stairs, bridges) sees what any of them sees (the conservative answer for both duels
 * and exposure checks).
 *
 * The file records the graph's node count and a coordinate checksum: when the
 * round maps or the graph builder change, the runtime ignores a stale bake
 * (and the jest test asks for a re-bake).
 *
 * Coordinates: live radar % → overview % through the native drafts'
 * registration matrix, then `fromRadar` to world (as scripts/bake-round-maps.ts).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DRAFTS, ROOT, World } from './map-world'
import { navGraphFor } from '../engine/match/round-script-nav'
import { BAKE_RADIUS, graphChecksum, visibilityPairs } from '../engine/match/round-script-visibility'
import type { RoundMap } from '../engine/match/round-script-types'

function bake(map: RoundMap): void {
    const W = new World(map.mapId)
    const g = navGraphFor(map)
    const ground = Array.from({ length: g.size }, (_, n) => W.grounds(g.x[n], g.y[n], g.floor[n]))
    const bits: number[] = []
    let seen = 0
    visibilityPairs(g, (n, m) => {
        const a = ground[n], b = ground[m]
        // Visible if any standing surface of one sees any of the other (a stair or bridge spot is both).
        const v = !a.length || !b.length || a.some(p => b.some(q => W.los(p, q)))
        bits.push(v ? 1 : 0)
        if (v) seen++
    })
    const bytes = new Uint8Array(Math.ceil(bits.length / 8))
    bits.forEach((b, i) => { if (b) bytes[i >> 3] |= 1 << (i & 7) })
    const out = {
        schemaVersion: 1,
        mapId: map.mapId,
        radius: BAKE_RADIUS,
        nodes: g.size,
        checksum: graphChecksum(g),
        pairs: bits.length,
        bits: Buffer.from(bytes).toString('base64'),
    }
    const dir = path.join(ROOT, 'data/round-maps/visibility')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, `${map.mapId}.json`), JSON.stringify(out) + '\n')
    const noGround = ground.filter(p => !p.length).length
    console.log(`${map.mapId}: ${g.size} nodes, ${bits.length} pairs, ${(100 * seen / Math.max(1, bits.length)).toFixed(1)}% visible, ${noGround} nodes without ground, ${bytes.length} bytes`)
}

async function main(): Promise<void> {
    const wanted = process.argv.slice(2)
    for (const id of Object.keys(DRAFTS)) {
        if (wanted.length && !wanted.includes(id)) continue
        const map = JSON.parse(readFileSync(path.join(ROOT, `data/round-maps/${id}.json`), 'utf8')) as RoundMap
        bake(map)
    }
}

void main()
