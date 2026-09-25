import { airbornePlan } from '@/engine/spatial/airborne'
import { NavigationMesh, DEFAULT_ROUTE_OPTIONS, type NavLocation, type SpatialLink } from '@/engine/spatial/navigation'
import { CollisionScene } from '@/engine/spatial/geometry'
import { simulateMovement } from '@/engine/spatial/movement'
import type { SpatialReference, NavArea } from '@/engine/spatial/types'

const area = (id: number, x: number, z: number): NavArea => ({ id, hull: 0, flags: '0', movable: 0, corners: [[x, 0, z], [x + 100, 0, z], [x + 100, 100, z], [x, 100, z]], edges: [], laddersAbove: [], laddersBelow: [] })
const clear = () => new CollisionScene(new Float32Array([2000, 0, 0, 2000, 100, 0, 2000, 0, 100]), new Uint32Array([0, 1, 2]))
const ref = (z = 0): SpatialReference => ({ format: 'esim-spatial-reference', version: 1, mapId: 'Mirage', sourceVersion: 'test', sourceMap: 'test', sourceUrl: '', meshSha256: '', transform: { pos_x: 0, pos_y: 0, scale: 1 }, radars: { upper: '' }, areas: [area(1, 0, z), area(2, 130, 0)], ladders: [] })

test('explicit jump crosses a gap with a deterministic arc and exact supported landing; no reverse edge is invented', () => {
    const nav = new NavigationMesh(ref()), a: NavLocation = { area: 1, point: [50, 50, 0] }, b: NavLocation = { area: 2, point: [180, 50, 0] }
    const link: SpatialLink = { id: 'jump', from: 1, to: 2, start: a.point, end: b.point, kind: 'jump' }
    const options = { ...DEFAULT_ROUTE_OPTIONS, jumps: true, links: [link] }
    expect(nav.findRoute(a, b, { ...options, jumps: false }, clear()).points).toHaveLength(0)
    const route = nav.findRoute(a, b, options, clear()), frames = simulateMovement(route, clear(), 220, 72, nav)
    expect(route.kinds).toContain('jump')
    expect(frames.some(f => f.state === 'airborne' && f.position[2] > 20)).toBe(true)
    expect(frames.at(-1)?.position).toEqual(b.point)
    expect(frames.at(-1)?.state).toBe('arrived')
    expect(simulateMovement(route, clear(), 220, 72, nav)).toEqual(frames)
    expect(nav.findRoute(b, a, options, clear()).points).toHaveLength(0)
})
test('jump clearance rejects a ceiling and a wall, excessive reach and unsupported landing', () => {
    const ceiling = new CollisionScene(new Float32Array([0, 0, 90, 300, 0, 90, 300, 100, 90, 0, 100, 90]), new Uint32Array([0, 1, 2, 0, 2, 3]))
    expect(airbornePlan([50, 50, 0], [180, 50, 0], 'jump', ceiling)).toBeNull()
    const wall = new CollisionScene(new Float32Array([115, 0, 0, 115, 100, 0, 115, 100, 200, 115, 0, 200]), new Uint32Array([0, 1, 2, 0, 2, 3]))
    expect(airbornePlan([50, 50, 0], [180, 50, 0], 'jump', wall)).toBeNull()
    expect(airbornePlan([0, 0, 0], [500, 0, 0], 'jump', clear())).toBeNull()
    const nav = new NavigationMesh(ref()), route = { areas: [1], points: [[50, 50, 0], [115, 50, 0]] as [number, number, number][], kinds: ['jump' as const], distance: 65, rejected: 0 }
    expect(simulateMovement(route, clear(), 220, 72, nav).at(-1)?.state).toBe('blocked')
})
test('one-way drops reject reverse uphill movement and excessive falling height', () => {
    const nav = new NavigationMesh(ref(120)), a: NavLocation = { area: 1, point: [80, 50, 120] }, b: NavLocation = { area: 2, point: [150, 50, 0] }
    const link: SpatialLink = { id: 'drop', from: 1, to: 2, start: a.point, end: b.point, kind: 'drop' }
    const options = { ...DEFAULT_ROUTE_OPTIONS, drops: true, links: [link] }
    const route = nav.findRoute(a, b, options, clear())
    expect(simulateMovement(route, clear(), 220, 72, nav).at(-1)?.state).toBe('arrived')
    expect(nav.findRoute(b, a, options, clear()).points).toHaveLength(0)
    expect(airbornePlan(b.point, a.point, 'drop', clear())).toBeNull()
    expect(airbornePlan([80, 50, 500], b.point, 'drop', clear())).toBeNull()
})
