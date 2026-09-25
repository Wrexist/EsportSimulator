import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { emptyProject, parseProject, annotationHistory, type MapMark } from '@/lib/map-annotations'
import { parseRegistration, annotationSignature, type MapRegistration } from '@/engine/spatial/registration'
import { polygonProblem, validateAnnotations, annotationCollision } from '@/engine/spatial/annotations'
import { CollisionScene, withOccupiedBodies } from '@/engine/spatial/geometry'
import { NavigationMesh, DEFAULT_ROUTE_OPTIONS } from '@/engine/spatial/navigation'
import { simulateMovement } from '@/engine/spatial/movement'
import { emptyLabProject, parseLabProject } from '@/lib/spatial-lab-project'
import type { NavArea, SpatialReference, Vec3 } from '@/engine/spatial/types'

const hash = '0'.repeat(64)
const registration: MapRegistration = { version: 1, sourceRadar: '/maps/de_mirage_radar_psd.png', sourceSha256: hash, targetSha256: hash, meshSha256: hash, sourceVersion: 'test', matrix: [1, 0, 0, 0, 1, 0], method: 'manual', confidence: 'provisional', evidence: 'Synthetic test reference' }
const area = (id = 1, z = 0, x = 0): NavArea => ({ id, hull: 0, flags: '0', movable: 0, corners: [[x, 0, z], [x + 100, 0, z], [x + 100, -100, z], [x, -100, z]], edges: [], laddersAbove: [], laddersBelow: [] })
const reference = (areas = [area()]): SpatialReference => ({ format: 'esim-spatial-reference', version: 1, mapId: 'Mirage', sourceMap: 'de_mirage', sourceVersion: 'test', sourceUrl: 'https://example.com', meshSha256: hash, radars: { upper: '/test.png' }, transform: { pos_x: 0, pos_y: 0, scale: 1 / 10.24 }, areas, ladders: [] })
const scene = () => new CollisionScene(new Float32Array([1000, 0, 0, 1000, 100, 0, 1000, 0, 100]), new Uint32Array([0, 1, 2]))
const zone = (): MapMark => ({ id: 'zone', kind: 'ctspawn', points: [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }], label: 'Spawn', note: '', spatial: { floorId: 'ground', zMin: -5, zMax: 5 }, status: 'draft' })
const project = () => ({ ...emptyProject(), registration: structuredClone(registration), marks: [zone()] })

test('closed and implicitly closed polygons validate, while crossings and degenerate rings fail', () => {
    const p = zone().points
    expect(polygonProblem(p)).toBeNull()
    expect(polygonProblem([...p, p[0]])).toBeNull()
    expect(polygonProblem([p[0], p[2], p[1], p[3]])).toMatch(/crosses/)
    expect(polygonProblem([p[0], p[0], p[2]])).not.toBeNull()
})
test('registration parser rejects collapsed matrices and foreign radar provenance', () => {
    expect(() => parseRegistration({ ...registration, matrix: [0, 0, 0, 0, 0, 0] })).toThrow()
    expect(() => parseProject(JSON.stringify({ ...project(), registration: { ...registration, sourceRadar: '/maps/wrong.png' } }))).toThrow(/different/)
})
test('project export retains bindings and a current receipt; geometry edits invalidate it and undo restores it', () => {
    const p = project(), report = validateAnnotations(p, reference(), scene())
    const saved = { ...p, validation: report.receipt }
    expect(parseProject(JSON.stringify(saved))).toEqual(saved)
    const changed = { ...saved, marks: [{ ...p.marks[0], label: 'Changed' }] }
    const history = annotationHistory({ past: [], present: saved, future: [] }, { type: 'edit', project: changed })
    expect(history.present.validation).toBeUndefined()
    expect(annotationHistory(history, { type: 'undo' }).present.validation).toEqual(report.receipt)
    expect(parseProject(JSON.stringify(changed)).validation).toBeUndefined()
})
test('floor bindings exclude overlapping upper surfaces and ambiguous ranges are rejected', () => {
    const p = project(), ref = reference([area(), area(2, 100)])
    expect(validateAnnotations(p, ref, scene()).zones[0].safe).toBeGreaterThan(0)
    p.marks[0].spatial!.zMax = 110
    const result = validateAnnotations(p, ref, scene()).zones[0]
    expect(result.safe).toBe(0); expect(result.ambiguous).toBeGreaterThan(0)
})
test('authored walls affect collision only with registration and a physical height range', () => {
    const p = project(); p.marks = [{ ...zone(), kind: 'wall', points: [{ x: 50, y: 0 }, { x: 50, y: 100 }], spatial: { floorId: 'ground wall', zMin: 0, zMax: 80 } }]
    const world = annotationCollision(scene(), p, reference())
    expect(world.wallsUsed).toBe(1)
    expect(world.scene.movementHit([30, -50, 0], [70, -50, 0])).not.toBeNull()
    expect(world.scene.movementHit([30, -50, 100], [70, -50, 100])).toBeNull()
    p.marks[0].spatial = undefined
    expect(annotationCollision(scene(), p, reference()).wallsUsed).toBe(0)
    p.registration.meshSha256 = 'f'.repeat(64)
    expect(validateAnnotations(p, reference(), scene()).issues.some(i => i.code === 'registration')).toBe(true)
})
test('a custom walk cannot bridge an unsupported gap even when both endpoints are valid', () => {
    const nav = new NavigationMesh(reference([area(), area(2, 0, 150)])), a = { area: 1, point: [50, -50, 0] as Vec3 }, b = { area: 2, point: [200, -50, 0] as Vec3 }
    const route = nav.findRoute(a, b, { ...DEFAULT_ROUTE_OPTIONS, links: [{ id: 'unsafe', from: 1, to: 2, start: a.point, end: b.point, kind: 'walk' }] }, scene())
    expect(route.points).toHaveLength(0)
    expect(route.rejected).toBeGreaterThan(0)
    const forced = { areas: [1, 2], points: [a.point, b.point], kinds: ['walk' as const], distance: 150, rejected: 0 }
    expect(simulateMovement(forced, scene(), 220, 72, nav).at(-1)?.state).toBe('blocked')
})
test('stationary body clearance rejects standing under a low ceiling but permits crouching', () => {
    const ceiling = new CollisionScene(new Float32Array([0, 0, 60, 100, 0, 60, 100, -100, 60, 0, -100, 60]), new Uint32Array([0, 1, 2, 0, 2, 3]))
    const nav = new NavigationMesh(reference()), a = { area: 1, point: [30, -50, 0] as Vec3 }, b = { area: 1, point: [70, -50, 0] as Vec3 }
    expect(nav.findRoute(a, b, DEFAULT_ROUTE_OPTIONS, ceiling).points).toHaveLength(0)
    const route=nav.findRoute(a,b,{...DEFAULT_ROUTE_OPTIONS,height:54},ceiling)
    expect(simulateMovement(route,ceiling,85,54,nav).at(-1)).toMatchObject({state:'arrived',position:b.point})
})
test('lab save and reload retains registered geometry as an independent copy', () => {
    const p = project(), ref = reference()
    const loaded = parseLabProject(JSON.stringify({ ...emptyLabProject(ref), annotations: p }), ref)
    expect(loaded.annotations).toEqual(p)
    loaded.annotations!.marks[0].points[0].x = 12
    expect(p.marks[0].points[0].x).toBe(10)
})
test('physical floor rays support inset nav borders without accepting an actual void or another floor', () => {
    const nav = new NavigationMesh(reference())
    const floor = new CollisionScene(new Float32Array([0, 0, 0, 130, 0, 0, 130, -100, 0, 0, -100, 0]), new Uint32Array([0, 1, 2, 0, 2, 3]))
    expect(nav.supported([95, -50, 0], 16)).toBe(false)
    expect(nav.supportedBody([95, -50, 0], floor)).toBe(true)
    expect(nav.supportedBody([95, -50, 0], scene())).toBe(false)
    expect(nav.supportedBody([95, -50, 100], floor)).toBe(false)
})
test('a teammate reservation blocks overlapping starts and can be removed without teleporting', () => {
    const nav = new NavigationMesh(reference()), a = { area: 1, point: [30, -50, 0] as Vec3 }, b = { area: 1, point: [70, -50, 0] as Vec3 }
    const occupied = withOccupiedBodies(scene(), [a.point])
    expect(nav.findRoute(a, b, DEFAULT_ROUTE_OPTIONS, occupied).points).toHaveLength(0)
    expect(simulateMovement(nav.findRoute(a,b,DEFAULT_ROUTE_OPTIONS,scene()),scene(),220,72,nav).at(-1)).toMatchObject({state:'arrived',position:b.point})
    const saved = parseLabProject(JSON.stringify({ ...emptyLabProject(reference()), occupied: [a] }), reference())
    expect(saved.occupied).toEqual([a])
})
test('all radar floors have measured local provenance and are held from release', () => {
    const coverage = JSON.parse(readFileSync('public/map-studio/registration.json', 'utf8'))
    expect(coverage.maps).toHaveLength(10)
    for (const row of coverage.maps) {
        const r = parseRegistration(row.registration)
        expect(row.release).toBe('held')
        expect(createHash('sha256').update(readFileSync('public' + r.sourceRadar)).digest('hex')).toBe(r.sourceSha256)
        const ref = JSON.parse(readFileSync(`public/map-studio/spatial/${row.mapId}.json`, 'utf8'))
        expect(createHash('sha256').update(readFileSync('public' + ref.radars[row.floor])).digest('hex')).toBe(r.targetSha256)
    }
})
test('the original Mirage upload remains byte-for-byte intact and its review copy retains every vertex', () => {
    const bytes = readFileSync('public/map-studio/drafts/mirage-user-areas-2026-09-13.json')
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('46e2c94658a547f6d8bf7d4af8643e3b690e946b14060daece37fc8315c11e65')
    const original = parseProject(bytes.toString()), review = parseProject(readFileSync('public/map-studio/drafts/mirage-registered-review.json', 'utf8'))
    expect(review.marks.map(m => [m.id, m.kind, m.points])).toEqual(original.marks.map(m => [m.id, m.kind, m.points]))
    // Stored review predates five-body spawn checks; retain drawings, discard stale receipt.
    expect(review.validation).toBeUndefined()
})
