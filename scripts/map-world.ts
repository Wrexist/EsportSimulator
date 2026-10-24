/**
 * A map's collision mesh and nav mesh in round-map coordinates (radar %),
 * for line-of-sight raycasts at standing eye height. Shared by the
 * visibility bake (bake-round-visibility.ts) and the sight-engine audit
 * (audit-sight-engine.ts).
 *
 * Coordinates: live radar % → overview % through the native drafts'
 * registration matrix, then `fromRadar` to world (as scripts/bake-round-maps.ts).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CollisionScene } from '../engine/spatial/geometry'
import { NavigationMesh } from '../engine/spatial/navigation'
import { fromRadar, type SpatialReference, type Vec3 } from '../engine/spatial/types'
import type { Floor } from '../engine/match/round-script-types'

export const ROOT = path.resolve(__dirname, '..')
export const EYE = 64
export const DRAFTS: Record<string, { upper: string; lower?: string }> = {
    Ancient: { upper: 'ancient-upper-native.json' }, Anubis: { upper: 'anubis-upper-native.json' },
    Inferno: { upper: 'inferno-upper-native.json' }, Mirage: { upper: 'mirage-v13-native-sites.json' },
    Nuke: { upper: 'nuke-upper-native.json', lower: 'nuke-lower-native.json' }, Overpass: { upper: 'overpass-upper-native.json' },
    Sandstone: { upper: 'sandstone-upper-native.json' }, Vertigo: { upper: 'vertigo-upper-native.json', lower: 'vertigo-lower-native.json' },
}

export class World {
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
