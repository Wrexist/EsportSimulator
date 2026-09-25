import { isArea, type MapAnnotationProject, type MapMark, type MapPoint } from '@/lib/map-annotations'
import { CollisionScene, type CollisionWorld, type RayHit } from './geometry'
import { NavigationMesh, DEFAULT_ROUTE_OPTIONS, type NavLocation } from './navigation'
import { annotationSignature, registrationMatches, registeredWorld, type AnnotationValidationReceipt } from './registration'
import type { SpatialReference, Vec3 } from './types'
import { simulateMovement } from './movement'
import { selectSpawnPositions } from './spawn-layout'

export interface AnnotationIssue { severity: 'error' | 'warning'; code: string; message: string; markId?: string }
export interface ZoneCheck { id: string; label: string; kind: string; samples: number; safe: number; unsupported: number; blocked: number; ambiguous: number; exits: number; candidates: NavLocation[]; point: NavLocation | null; spawnPositions?: NavLocation[]; clearPositions?: NavLocation[] }
export interface AnnotationReport { issues: AnnotationIssue[]; zones: ZoneCheck[]; routes: { from: string; to: string; reachable: boolean; reason?: string; points: Vec3[] }[]; receipt: AnnotationValidationReceipt; wallsUsed: number }
const cross = (a: MapPoint, b: MapPoint, c: MapPoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
const same = (a: MapPoint, b: MapPoint) => Math.hypot(a.x - b.x, a.y - b.y) < 0.0001
export function polygonRing(points: MapPoint[]) { return points.length > 1 && same(points[0], points[points.length - 1]) ? points.slice(0, -1) : points }
export function intersects(a: MapPoint, b: MapPoint, c: MapPoint, d: MapPoint): boolean {
    const bounds = (p: MapPoint, q: MapPoint, r: MapPoint) => r.x >= Math.min(p.x, q.x) - 1e-8 && r.x <= Math.max(p.x, q.x) + 1e-8 && r.y >= Math.min(p.y, q.y) - 1e-8 && r.y <= Math.max(p.y, q.y) + 1e-8
    const x = cross(a, b, c), y = cross(a, b, d), z = cross(c, d, a), w = cross(c, d, b)
    return x * y < 0 && z * w < 0 || Math.abs(x) < 1e-8 && bounds(a, b, c) || Math.abs(y) < 1e-8 && bounds(a, b, d) || Math.abs(z) < 1e-8 && bounds(c, d, a) || Math.abs(w) < 1e-8 && bounds(c, d, b)
}
export function polygonProblem(points: MapPoint[]): string | null {
    const p = polygonRing(points)
    if (p.length < 3) return 'An area needs three different vertices.'
    for (let i = 0; i < p.length; i++) {
        if (same(p[i], p[(i + 1) % p.length])) return 'The area contains a repeated edge vertex.'
        for (let j = i + 1; j < p.length; j++) if (j !== i + 1 && !(i === 0 && j === p.length - 1) && intersects(p[i], p[(i + 1) % p.length], p[j], p[(j + 1) % p.length])) return 'The area crosses or touches itself. Move the crossing vertices.'
    }
    const area = Math.abs(p.reduce((sum, a, i) => sum + a.x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * a.y, 0)) / 2
    return area < 0.01 ? 'The area has no usable interior.' : null
}
export function inside(point: MapPoint, polygon: MapPoint[]): boolean {
    const p = polygonRing(polygon); let result = false
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i].y > point.y) !== (p[j].y > point.y) && point.x < (p[j].x - p[i].x) * (point.y - p[i].y) / (p[j].y - p[i].y) + p[i].x) result = !result
    return result
}
/** Review conflicts only: an opening annotation never cuts collision geometry automatically. */
export function openingIssues(project: MapAnnotationProject): AnnotationIssue[] {
    const issues: AnnotationIssue[] = [], openings = project.marks.filter(m => m.kind === 'window' || m.kind === 'passage')
    const warn = (mark: MapMark, code: string, message: string) => issues.push({ severity: 'warning' as const, code, message, markId: mark.id })
    for (const mark of openings) {
        const a = mark.points[0], b = mark.points[1]
        if (!mark.label.trim() || !mark.note.trim()) warn(mark, 'opening-description', 'Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.')
        if (!mark.spatial) warn(mark, 'opening-height', 'This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.')
        if (Math.hypot(b.x - a.x, b.y - a.y) > 5) warn(mark, 'opening-length', 'This opening spans more than 5% of the radar. Check that it marks one opening or cover edge, rather than a whole corridor.')
        const coincident = openings.find(other => other.id !== mark.id && other.kind !== mark.kind && (same(a, other.points[0]) && same(b, other.points[1]) || same(a, other.points[1]) && same(b, other.points[0])))
        if (coincident) warn(mark, 'opening-overlap', 'A blue marking and a green passage share these endpoints. Clarify whether walking and shooting use different heights, or keep the single intended type.')
        const crosses = project.marks.some(wall => wall.kind === 'wall' && wall.points.slice(1).some((q, i) => {
            const p = wall.points[i]
            return ![p, q].some(p => same(p, a) || same(p, b)) && intersects(a, b, p, q)
        }))
        if (crosses) warn(mark, 'opening-wall-overlap', 'This opening overlaps a red segment in 2D. Review their heights and leave the intended opening clear; green/blue markings do not erase walls.')
    }
    return issues
}
export function annotationCollision(base: CollisionWorld, project: MapAnnotationProject, ref: SpatialReference): { scene: CollisionWorld; wallsUsed: number } {
    if (!registrationMatches(project, ref)) return { scene: base, wallsUsed: 0 }
    const vertices: number[] = [], indices: number[] = []; let wallsUsed = 0
    for (const mark of project.marks) {
        if (mark.kind !== 'wall' || !mark.spatial) continue
        wallsUsed++
        for (let i = 1; i < mark.points.length; i++) {
            const a = registeredWorld(mark.points[i - 1], project.registration!, ref), b = registeredWorld(mark.points[i], project.registration!, ref), index = vertices.length / 3
            vertices.push(a[0], a[1], mark.spatial.zMin, b[0], b[1], mark.spatial.zMin, b[0], b[1], mark.spatial.zMax, a[0], a[1], mark.spatial.zMax)
            indices.push(index, index + 1, index + 2, index, index + 2, index + 3)
        }
    }
    if (!indices.length) return { scene: base, wallsUsed }
    const walls = new CollisionScene(new Float32Array(vertices), new Uint32Array(indices))
    const nearest = (a: RayHit | null, b: RayHit | null) => !a ? b : !b ? a : a.fraction <= b.fraction ? a : b
    return { wallsUsed, scene: {
        raycast: (a, b) => nearest(base.raycast(a, b), walls.raycast(a, b)),
        movementHit: (a, b, h, r) => nearest(base.movementHit(a, b, h, r), walls.movementHit(a, b, h, r)),
        bodyHit: (p, h, r) => base.bodyHit?.(p, h, r) || walls.bodyHit(p, h, r),
    } }
}

export function validateAnnotations(project: MapAnnotationProject, ref: SpatialReference, base: CollisionWorld): AnnotationReport {
    const nav = new NavigationMesh(ref), issues: AnnotationIssue[] = openingIssues(project), zones: ZoneCheck[] = [], routes: AnnotationReport['routes'] = []
    const add = (severity: AnnotationIssue['severity'], code: string, message: string, mark?: MapMark) => issues.push({ severity, code, message, ...(mark ? { markId: mark.id } : {}) })
    const registered = registrationMatches(project, ref)
    if (!registered) add('error', 'registration', 'Align this radar to the current reference before testing geometry.')
    else if (project.registration!.confidence !== 'reviewed') add('warning', 'alignment-review', 'Image alignment is provisional. Compare landmarks before marking it reviewed.')
    const { scene, wallsUsed } = annotationCollision(base, project, ref)
    const areas = project.marks.filter(m => isArea(m.kind))
    for (const kind of ['ctspawn', 'tspawn']) if (!areas.some(m => m.kind === kind)) add('error', 'missing-spawn', `Add a ${kind === 'ctspawn' ? 'CT' : 'T'} spawn polygon.`)
    for (const site of ['A', 'B']) if (!areas.some(m => m.kind === 'bombsite' && m.spatial?.site === site)) add('error', 'missing-site', `Assign one plant polygon to site ${site}.`)
    for (const site of ['A', 'B']) if (areas.filter(m => m.kind === 'bombsite' && m.spatial?.site === site).length > 1) add('error', 'duplicate-site', `Several plant polygons claim site ${site}; resolve the duplicate.`)
    for (const mark of project.marks.filter(m => isArea(m.kind) || m.kind === 'wall')) {
        if (mark.status !== 'checked') add('warning', 'draft', 'This geometry has not been checked by its author.', mark)
        if (!mark.spatial) add('error', 'unbound-height', 'Choose the floor and height range for this marking.', mark)
        if (mark.kind === 'wall') {
            if (mark.points.some((p, i) => i > 0 && same(p, mark.points[i - 1]))) add('error', 'wall-edge', 'Wall contains a zero-length segment.', mark)
            continue
        }
        const problem = polygonProblem(mark.points)
        if (problem) { add('error', 'polygon', problem, mark); continue }
        if (!registered) continue
        const polygon = polygonRing(mark.points).map(p => { const w = registeredWorld(p, project.registration!, ref); return { x: w[0], y: w[1] } })
        const xs = polygon.map(p => p.x), ys = polygon.map(p => p.y), minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
        const countX = Math.max(1, Math.min(24, Math.ceil((maxX - minX) / 32))), countY = Math.max(1, Math.min(24, Math.ceil((maxY - minY) / 32)))
        const zone: ZoneCheck = { id: mark.id, kind: mark.kind, label: mark.spatial?.site ? `${mark.spatial.site} plant zone` : mark.label || mark.kind, samples: 0, safe: 0, unsupported: 0, blocked: 0, ambiguous: 0, exits: 0, candidates: [], point: null }
        const safe: NavLocation[] = [], candidateHeights = new Set<number>()
        for (let i = 0; i < countX; i++) for (let j = 0; j < countY; j++) {
            const p = { x: minX + (i + 0.5) / countX * (maxX - minX), y: minY + (j + 0.5) / countY * (maxY - minY) }
            if (!inside(p, polygon)) continue
            zone.samples++
            const all = nav.surfaces(p.x, p.y)
            for (const location of all) { const height = Math.round(location.point[2] / 16) * 16; if (!candidateHeights.has(height) && zone.candidates.length < 12) { candidateHeights.add(height); zone.candidates.push(location) } }
            if (!mark.spatial) continue
            const surfaces = all.filter(s => s.point[2] >= mark.spatial!.zMin && s.point[2] <= mark.spatial!.zMax)
            if (!surfaces.length) { zone.unsupported++; continue }
            if (surfaces.some(s => Math.abs(s.point[2] - surfaces[0].point[2]) > 2)) { zone.ambiguous++; continue }
            const location = surfaces[0]
            const inset = Array.from({ length: 8 }, (_, k) => ({ x: p.x + Math.cos(k * Math.PI / 4) * 16, y: p.y + Math.sin(k * Math.PI / 4) * 16 })).every(p => inside(p, polygon))
            if (!inset || !nav.supportedBody(location.point, scene) || scene.bodyHit?.(location.point, 72, 16)) { zone.blocked++; continue }
            safe.push(location); zone.safe++
        }
        // Stable central representative; the inspector exposes rejected samples too.
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
        safe.sort((a, b) => Math.hypot(a.point[0] - cx, a.point[1] - cy) - Math.hypot(b.point[0] - cx, b.point[1] - cy) || a.area - b.area)
        zone.point = safe[0] || null
        zone.clearPositions = selectSpawnPositions(safe)
        if (mark.kind === 'ctspawn' || mark.kind === 'tspawn') {
            zone.spawnPositions = zone.clearPositions
            if (zone.spawnPositions.length < 5) add('error', 'spawn-capacity', `Only ${zone.spawnPositions.length} separated player positions were found in this spawn. Review its floor, boundary and clearance for a full five-player team.`, mark)
        }
        if (mark.spatial && !zone.safe) add('error', 'no-safe-point', 'No sampled point has a supported, clear player body on this floor.', mark)
        if (zone.unsupported || zone.ambiguous) add('error', 'floor-coverage', `${zone.unsupported} samples lack this floor; ${zone.ambiguous} overlap different floors. Refine the polygon or height range.`, mark)
        if (zone.blocked) add('warning', 'body-clearance', `${zone.blocked} samples are too close to an edge or obstruction. Only clear inset points can be used.`, mark)
        if (zone.point && mark.kind !== 'bombsite') {
            for (const direction of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const x = cx + direction[0] * ((maxX - minX) / 2 + 64), y = cy + direction[1] * ((maxY - minY) / 2 + 64)
                const end = nav.surfaces(x, y).find(s => Math.abs(s.point[2] - zone.point!.point[2]) <= 32)
                if (end && nav.findRoute(zone.point, end, DEFAULT_ROUTE_OPTIONS, scene).points.length) zone.exits++
            }
            if (!zone.exits) add('error', 'no-exit', 'No sampled connected exit was found. Inspect a route from this spawn.', mark)
        }
        zones.push(zone)
    }
    for (const spawn of zones.filter(z => z.kind !== 'bombsite')) for (const site of zones.filter(z => z.kind === 'bombsite')) {
        const route = spawn.point && site.point ? nav.findRoute(spawn.point, site.point, DEFAULT_ROUTE_OPTIONS, scene) : null
        const frames = route?.points.length ? simulateMovement(route, scene, 220, 72, nav) : []
        const reachable = frames.at(-1)?.state === 'arrived'
        routes.push({ from: spawn.id, to: site.id, reachable, reason: route?.reason || frames.at(-1)?.reason || (!route ? 'Bind both zones to clear surfaces first.' : undefined), points: route?.points || [] })
        if (!reachable) add('error', 'unreachable-site', `${spawn.label} cannot complete movement to ${site.label} in the supported route model.`)
    }
    add('warning', 'reference-limits', 'Sampled static reference checks are not full collision certification. Release inclusion remains held for review and content clearance.')
    const errors = issues.filter(i => i.severity === 'error').length, warnings = issues.length - errors
    return { issues, zones, routes, wallsUsed, receipt: { version: 1, signature: annotationSignature(project), errors, warnings, state: errors ? 'blocked' : 'review-ready' } }
}
