import { readFileSync } from 'node:fs'
import { CollisionScene } from '../engine/spatial/geometry'
import { CollisionScene as OriginalScene } from './fixtures/spatial-geometry-v12'
import { SeededRNG } from '../engine/rng'
import { ACTIVE_MAP_POOL } from '../data/map-pool'
import type { SpatialReference, Vec3 } from '../engine/spatial/types'

test.each(ACTIVE_MAP_POOL)('%s collision rays, body clearance and sweeps match the frozen solver exactly', mapId => {
    const ref = JSON.parse(readFileSync(`public/map-studio/spatial/${mapId}.json`, 'utf8')) as SpatialReference
    const bytes = readFileSync(`public/map-studio/spatial/${mapId}.mesh`)
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    const actual = CollisionScene.fromBinary(buffer)
    // BVH construction is unchanged; share its immutable mesh/tree to avoid a
    // second expensive build. Body/sweep checks dispatch through the old raycast.
    const original = Object.create(actual) as OriginalScene
    original.raycast = function (a: Vec3, b: Vec3) { return OriginalScene.prototype.raycast.call(this, a, b) }
    const rng = new SeededRNG(4326170)
    const points = ref.areas.flatMap(area => area.corners)
    const point = (): Vec3 => {
        const p = points[Math.floor(rng.next() * points.length)]
        return [p[0], p[1], p[2] + rng.next() * 100]
    }
    for (let i = 0; i < 600; i++) {
        const a = point(), b = i % 10 ? point() : a
        expect(actual.raycast(a, b)).toEqual(original.raycast(a, b))
        expect(actual.raycast(b, a)).toEqual(original.raycast(b, a))
        if (i % 12 === 0) {
            const height = i % 24 ? 54 : 72
            expect(actual.bodyHit(a, height)).toEqual(original.bodyHit(a, height))
            expect(actual.movementHit(a, b, height)).toEqual(original.movementHit(a, b, height))
        }
    }
}, 60000)
