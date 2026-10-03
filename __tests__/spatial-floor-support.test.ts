import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { CollisionScene } from '@/engine/spatial/geometry'
import { NavigationMesh, DEFAULT_ROUTE_OPTIONS, walkSampleCount, type Route } from '@/engine/spatial/navigation'
import { simulateMovement } from '@/engine/spatial/movement'
import { distance3, type NavArea, type SpatialReference, type Vec3 } from '@/engine/spatial/types'

const ref = JSON.parse(readFileSync('public/map-studio/spatial/Overpass.json', 'utf8')) as SpatialReference
const bytes = readFileSync('public/map-studio/spatial/Overpass.mesh')
const world = CollisionScene.fromBinary(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
const nav = new NavigationMesh(ref)
const options = { ...DEFAULT_ROUTE_OPTIONS, ladders: false }

// T4 route requests from the two v12 Overpass combat failures (seed 4326170 A tick 512, seed 4326171 B tick 2816).
// Both crossed the 3-unit stair strip (areas 1627/1623) where a diagonal footprint sample is 20.07 units above
// the lower tread inside a 0.09-unit window. The planner's lattice skipped it; a decelerating tick landed in it.
const cases: [string, { area: number; point: Vec3 }, { area: number; point: Vec3 }][] = [
    ['A tick 512', { area: 2717, point: [-1380.5444213288813, -3035.294327294658, 252.9858079292084] }, { area: 1623, point: [-734.5002, -2251.771744662243, 238.0679014134772] }],
    ['B tick 2816', { area: 976, point: [-515.522541851969, -1711.75607991, 152] }, { area: 1158, point: [-1824.5, 662.4999133333333, 482.66664666666674] }],
]

describe('walk floor support: planner and movement solver share one lattice', () => {
    it('keeps the pinned Overpass mesh and the narrow unsupported stair window', () => {
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(ref.meshSha256)
        // The support rule itself is unchanged: this exact point is still rejected.
        expect(nav.supportedBody([-734.5002, -2260.7404544538813, 232.02447101175773], world)).toBe(false)
    })
    it.each(cases)('Overpass T4 %s route arrives without floor snapping or teleporting', (_, start, goal) => {
        const route = nav.findRoute(start, goal, options, world)
        expect(route.points.length).toBeGreaterThan(1)
        // Every executed walk lattice sample is the one the planner validated.
        route.points.slice(1).forEach((b, i) => {
            if (route.kinds[i] !== 'walk') return
            const a = route.points[i]
            for (let k = 0; k <= walkSampleCount(a, b); k++) expect(nav.supportedWalkSample(a, b, k, world)).toBe(true)
        })
        for (const speed of [85, 130, 220]) {
            const track = simulateMovement(route, world, speed, 72, nav)
            expect(track.at(-1)).toMatchObject({ state: 'arrived' })
            expect(distance3(track.at(-1)!.position, goal.point)).toBeLessThan(.01)
            // Continuous motion: no step longer than one tick at full speed.
            for (let i = 1; i < track.length; i++) expect(distance3(track[i - 1].position, track[i].position)).toBeLessThanOrEqual(speed / 64 + 1e-6)
        }
    }, 60000)
    it('still stops before an actual floor gap on a forced walk', () => {
        const tile = (id: number, x: number): NavArea => ({ id, hull: 0, flags: '0', movable: 4294967295, corners: [[x, 0, 0], [x + 100, 0, 0], [x + 100, 100, 0], [x, 100, 0]], edges: [], laddersAbove: [], laddersBelow: [] })
        const mesh = new NavigationMesh({ ...ref, areas: [tile(1, 0), tile(2, 200)], ladders: [] })
        const empty = new CollisionScene(new Float32Array([10000, 0, 0, 10000, 100, 0, 10000, 0, 100]), new Uint32Array([0, 1, 2]))
        const forced: Route = { areas: [1, 2], points: [[50, 50, 0], [250, 50, 0]], kinds: ['walk'], distance: 200, rejected: 0 }
        const track = simulateMovement(forced, empty, 220, 72, mesh)
        expect(track.at(-1)).toMatchObject({ state: 'blocked', reason: expect.stringContaining('Feet lost floor support') })
        expect(track.at(-1)!.position[0]).toBeLessThan(100)
        expect(mesh.findRoute({ area: 1, point: [50, 50, 0] }, { area: 2, point: [250, 50, 0] }, DEFAULT_ROUTE_OPTIONS, empty).points).toHaveLength(0)
    })
})
