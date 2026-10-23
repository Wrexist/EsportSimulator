/**
 * Bake which round-script walk-graph nodes can see each other
 * (`data/round-maps/visibility/<mapId>.json`, read by
 * engine/match/round-script-visibility.ts).
 *
 *   npx tsx scripts/bake-round-visibility.ts            # all maps
 *   npx tsx scripts/bake-round-visibility.ts Mirage Nuke
 *
 * For every pair of nodes on the same floor within VIS_RADIUS map-% the
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
import { CollisionScene } from '../engine/spatial/geometry'
import { NavigationMesh } from '../engine/spatial/navigation'
import { fromRadar, type SpatialReference, type Vec3 } from '../engine/spatial/types'
import { navGraphFor } from '../engine/match/round-script-nav'
import { VIS_RADIUS, graphChecksum, visibilityPairs } from '../engine/match/round-script-visibility'
import type { Floor, RoundMap } from '../engine/match/round-script-types'

const ROOT = path.resolve(__dirname, '..')
const EYE = 64
const DRAFTS: Record<string, { upper: string; lower?: string }> = {
    Ancient: { upper: 'ancient-upper-native.json' }, Anubis: { upper: 'anubis-upper-native.json' },
    Inferno: { upper: 'inferno-upper-native.json' }, Mirage: { upper: 'mirage-v13-native-sites.json' },
    Nuke: { upper: 'nuke-upper-native.json', lower: 'nuke-lower-native.json' }, Overpass: { upper: 'overpass-upper-native.json' },
    Sandstone: { upper: 'sandstone-upper-native.json' }, Vertigo: { upper: 'vertigo-upper-native.json', lower: 'vertigo-lower-native.json' },
}

class World {
    readonly ref: SpatialReference
    readonly nav: NavigationMesh
    readonly scene: CollisionScene
    readonly split: number | null
    readonly reg: Partial<Record<Floor, number[]>> = {}
    constructor(mapId: string) {
        this.ref = JSON.parse(readFileSync(path.join(ROOT, `public/map-studio/spatial/${mapId}.json`), 'utf8'))
        this.nav = new NavigationMesh(this.ref)
        const mesh = readFileSync(path.join(ROOT, `public/map-studio/spatial/${mapId}.mesh`))
        this.scene = CollisionScene.fromBinary(mesh.buffer.slice(mesh.byteOffset, mesh.byteOffset + mesh.byteLength) as ArrayBuffer)
        for (const f of ['upper', 'lower'] as const) {
            const file = DRAFTS[mapId][f]
            if (!file) continue
            this.reg[f] = JSON.parse(readFileSync(path.join(ROOT, `public/map-studio/drafts/${file}`), 'utf8')).registration.matrix
        }
        if (!this.reg.lower) this.reg.lower = this.reg.upper
        const split = Number(this.ref.transform.verticalsections?.default?.AltitudeMin)
        this.split = this.ref.radars.lower && Number.isFinite(split) ? split : null
    }
    private floorOf(z: number): Floor { return this.split !== null && z < this.split ? 'lower' : 'upper' }
    private xy(x: number, y: number, floor: Floor): Vec3 {
        const [a, b, c, d, e, f] = this.reg[floor]!
        return fromRadar(a * x + b * y + c, d * x + e * y + f, this.ref)
    }
    /**
     * Ground under a radar point on its floor (spiralling out a little for
     * points just off a nav area): every walkable surface there, since a
     * radar point can sit over stairs or under a bridge.
     */
    grounds(x: number, y: number, floor: Floor): Vec3[] {
        const w = this.xy(x, y, floor)
        for (let r = 0; r <= 48; r += 8) {
            for (let k = 0; k < (r ? 16 : 1); k++) {
                const a = k / 16 * Math.PI * 2
                const px = w[0] + Math.cos(a) * r, py = w[1] + Math.sin(a) * r
                const found: Vec3[] = []
                for (const s of this.nav.surfaces(px, py)) if (this.floorOf(s.point[2]) === floor) found.push([px, py, s.point[2]])
                if (found.length) return found.sort((p, q) => q[2] - p[2]).slice(0, 3)
            }
        }
        return []
    }
    los(a: Vec3, b: Vec3): boolean {
        return !this.scene.raycast([a[0], a[1], a[2] + EYE], [b[0], b[1], b[2] + EYE])
    }
}

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
        radius: VIS_RADIUS,
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
