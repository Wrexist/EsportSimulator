import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { isArea, MAX_POINTS, parseProject, type MapMark } from '../../lib/map-annotations'
import { annotationCollision, validateAnnotations } from '../../engine/spatial/annotations'
import { CollisionScene } from '../../engine/spatial/geometry'
import { NavigationMesh, DEFAULT_ROUTE_OPTIONS } from '../../engine/spatial/navigation'
import { simulateMovement } from '../../engine/spatial/movement'
import { toRadar, type SpatialReference } from '../../engine/spatial/types'
import { emptyLabProject, parseLabProject } from '../../lib/spatial-lab-project'

const source = 'public/map-studio/drafts/mirage-user-v13-2026-09-22.json'
const bytes = readFileSync(source), hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
const sourceSha256 = hash(bytes)
if (sourceSha256 !== '68d5ce44e95636de7e0a8972044b840ae0a0ecfe4265f4cb9c8969fd2c7671e8') throw Error('Updated owner draft differs from the preserved attachment')
const project = parseProject(bytes.toString()), previous = parseProject(readFileSync('public/map-studio/drafts/mirage-user-v12-2026-09-13.json', 'utf8'))
const refBytes = readFileSync('public/map-studio/spatial/Mirage.json'), ref = JSON.parse(refBytes.toString()) as SpatialReference
const mesh = readFileSync('public/map-studio/spatial/Mirage.mesh')
if (hash(mesh) !== ref.meshSha256) throw Error('Reference mesh changed')
for (const [file, expected] of [[project.registration!.sourceRadar, project.registration!.sourceSha256], [ref.radars.upper, project.registration!.targetSha256]]) if (hash(readFileSync('public' + file)) !== expected) throw Error('Registered radar changed')
const scene = CollisionScene.fromBinary(mesh.buffer.slice(mesh.byteOffset, mesh.byteOffset + mesh.byteLength) as ArrayBuffer)
const originalReport = validateAnnotations(project, ref, scene)
const repairs: {id:string;before:unknown;after:unknown}[] = []
const bindings: Record<string, NonNullable<MapMark['spatial']>> = {
    'e342d75a-bf88-4f53-9b2d-951129f01df3': {floorId:'CT spawn sloped ground',zMin:-312,zMax:-240},
    '7e894eb2-6759-4731-82cf-500b7f3ba5cf': {floorId:'T spawn ground',zMin:-180,zMax:-145},
    '128d1d6d-6e1d-4fb0-ab69-c47cba379699': {floorId:'B site ground (exclude crates)',zMin:-174,zMax:-140,site:'B'},
    '34969b36-6b35-45a6-83b5-9889e6211271': {floorId:'A site ground (exclude crates)',zMin:-190,zMax:-145,site:'A'},
}
for(const mark of project.marks) if(bindings[mark.id]) {
    repairs.push({id:mark.id,before:mark.spatial ?? null,after:bindings[mark.id]})
    mark.spatial=bindings[mark.id]
    mark.status='draft'
    mark.note=[mark.note,'Floor binding restored from pinned reference navigation samples. Original polygon preserved. Ground surface only; raised crates excluded. Boundary and gameplay acceptance remain under review.'].filter(Boolean).join('\n')
    if(mark.spatial.site)mark.label=`${mark.spatial.site} plant zone`
}
const report = validateAnnotations(project, ref, scene), nav = new NavigationMesh(ref)
const world = annotationCollision(scene, project, ref).scene
const output = 'public/map-studio/reviews/mirage-v13'
mkdirSync(output, { recursive: true })
const write = (file: string, value: unknown) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
const old = new Map(previous.marks.map(m => [m.id, m])), ids = new Set(project.marks.map(m => m.id))
const geometry = { ...project, marks: project.marks.filter(m => isArea(m.kind) || ['wall', 'window', 'passage'].includes(m.kind)) }
const routes = [], rejected = [], guides: MapMark[] = []
const short = (zone: typeof report.zones[number]) => zone.kind === 'ctspawn' ? 'CT' : zone.kind === 'tspawn' ? 'T' : project.marks.find(m=>m.id===zone.id)?.spatial?.site || zone.id
for (const from of report.zones) for (const to of report.zones) {
    if (from.id === to.id || from.kind !== 'bombsite' && to.kind !== 'bombsite') continue
    const id = `${short(from).toLowerCase()}-to-${short(to).toLowerCase()}`, label = `${short(from)} to ${short(to)}`
    if (!from.point || !to.point) { rejected.push({ id, reason: 'No safe bound endpoint' }); continue }
    const route = nav.findRoute(from.point, to.point, DEFAULT_ROUTE_OPTIONS, world)
    const frames = simulateMovement(route, world, 220, 72, nav), last = frames.at(-1)
    if (last?.state !== 'arrived' || route.points.length > MAX_POINTS) { rejected.push({ id, reason: last?.reason || route.reason || 'Route exceeds the annotation point limit' }); continue }
    const [a, b, c, d, e, f] = project.registration!.matrix, determinant = a * e - b * d
    const points = route.points.map(p => { const [x, y] = toRadar(p, ref); return { x: (e * (x - c) - b * (y - f)) / determinant, y: (-d * (x - c) + a * (y - f)) / determinant } })
    // Preserve every portal vertex; never simplify a route across a wall for a cleaner picture.
    if (points.some(p => p.x < 0 || p.x > 100 || p.y < 0 || p.y > 100)) { rejected.push({ id, reason: 'Route leaves the registered radar bounds' }); continue }
    const markId = `nav-route:Mirage:v13:${id}`
    guides.push({ id: markId, kind: 'route', label: `${label} (reference)`, note: `Generated from Awpy navigation ${ref.sourceVersion}: ${ref.sourceUrl}\n${last.time.toFixed(3)} seconds at provisional run speed. Not an observed pro tactic. Height-aware path and independent lab test: /map-studio/reviews/mirage-v13/${id}.lab.json\nUnbound authored walls and openings remain review drawings. Recompute after geometry changes.`, points, status: 'draft', side: short(from) === 'CT' ? 'CT' : short(from) === 'T' ? 'T' : 'both' })
    const lab = parseLabProject(JSON.stringify({ ...emptyLabProject(ref), a: from.point, b: to.point, annotations: geometry }), ref)
    write(`${output}/${id}.lab.json`, lab)
    routes.push({ id, markId, label, from: from.point, to: to.point, route, seconds: last.time, frames: frames.length, replaySha256: hash(JSON.stringify(frames)), motionSha256: hash(JSON.stringify(frames.map(frame => ({ ...frame, heading: undefined })))), lab: `/map-studio/reviews/mirage-v13/${id}.lab.json` })
}
project.validation = report.receipt
write('public/map-studio/drafts/mirage-v13-repaired.json', project)
const review = parseProject(JSON.stringify({ ...project, marks: [...project.marks, ...guides] }))
review.validation = validateAnnotations(review, ref, scene).receipt
write('public/map-studio/drafts/mirage-v13-with-reference-routes.json', review)
const bundle = { format: 'esim-route-review', version: 1, mapId: ref.mapId, sourceVersion: ref.sourceVersion, sourceUrl: ref.sourceUrl, sourceSha256, referenceSha256: hash(refBytes), meshSha256: ref.meshSha256, registration: project.registration, release: 'held', motionHashScope: 'Every frame field except display heading; the full unmodified replay hash is retained separately. Cross-runtime heading bit parity is not claimed.', method: 'Connected navigation routes, verified with sampled static body movement; not observed tactical routes.', routes, rejected }
write(`${output}/routes.json`, bundle)
const delta = { added: project.marks.filter(m => !old.has(m.id)).map(m => ({ id: m.id, kind: m.kind })), removed: previous.marks.filter(m => !ids.has(m.id)).map(m => m.id), edited: project.marks.filter(m => old.has(m.id) && JSON.stringify(m) !== JSON.stringify(old.get(m.id))).map(m => m.id) }
write(`${output}/audit.json`, { sourceSha256, originalReport, repairs, markings: project.marks.length, counts: Object.fromEntries([...new Set(project.marks.map(m => m.kind))].map(kind => [kind, project.marks.filter(m => m.kind === kind).length])), delta, report, generated: routes.map(r => ({ id: r.id, seconds: r.seconds, points: r.route.points.length })), rejected })
console.log(JSON.stringify({ markings: project.marks.length, added: delta.added.length, edited: delta.edited.length, removed: delta.removed.length, errors: report.receipt.errors, warnings: report.receipt.warnings, generated: routes.map(r => ({ id: r.id, seconds: r.seconds })), rejected }, null, 2))
