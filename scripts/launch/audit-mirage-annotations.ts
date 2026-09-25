import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { parseProject } from '../../lib/map-annotations'
import { parseRegistration } from '../../engine/spatial/registration'
import { CollisionScene } from '../../engine/spatial/geometry'
import { validateAnnotations } from '../../engine/spatial/annotations'
import type { SpatialReference } from '../../engine/spatial/types'

const path = 'public/map-studio/drafts/mirage-user-areas-2026-09-13.json'
const bytes = readFileSync(path), hash = createHash('sha256').update(bytes).digest('hex')
if (hash !== '46e2c94658a547f6d8bf7d4af8643e3b690e946b14060daece37fc8315c11e65') throw Error('Owner draft changed')
const project = parseProject(bytes.toString('utf8'))
const ref = JSON.parse(readFileSync('public/map-studio/spatial/Mirage.json', 'utf8')) as SpatialReference
const matrix = JSON.parse(readFileSync('public/map-studio/registration.json', 'utf8')).maps.find((r: { mapId: string }) => r.mapId === 'Mirage').registration
project.registration = parseRegistration(matrix)
const buffer = readFileSync('public/map-studio/spatial/Mirage.mesh')
const scene = CollisionScene.fromBinary(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer)
const report = validateAnnotations(project, ref, scene)
mkdirSync('tmp/l09', { recursive: true })
writeFileSync('tmp/l09/original-analysis.json', JSON.stringify({ originalSha256: hash, report }, null, 2))
console.log(JSON.stringify(report.zones.map(z => ({ id: z.id, label: z.label, samples: z.samples, candidates: z.candidates })), null, 2))
const bindings: Record<string, { floorId: string; zMin: number; zMax: number; site?: 'A' | 'B' }> = {
    '039da054-317d-4865-909e-bf938f08281f': { floorId: 'CT spawn sloped ground', zMin: -312, zMax: -240 },
    'd279ad51-a4b3-4d81-8860-067c3ad072c0': { floorId: 'T spawn ground', zMin: -180, zMax: -145 },
    '64aa2728-d3ba-4306-8287-83a0b7052483': { floorId: 'A site ground (exclude crates)', zMin: -190, zMax: -145, site: 'A' },
    '5bbc7ff9-1edc-41da-80d2-0dcdfd14d30d': { floorId: 'B site ground (exclude crates)', zMin: -174, zMax: -140, site: 'B' },
}
for (const mark of project.marks) if (bindings[mark.id]) {
    mark.spatial = bindings[mark.id]; mark.status = 'draft'
    if (mark.spatial.site) mark.label = `${mark.spatial.site} plant zone`
    mark.note = [mark.note, 'Provisional floor range from pinned navigation samples. Raised surfaces excluded. Polygon vertices preserved from the owner upload; plantability and spawn coverage still require review.'].filter(Boolean).join('\n')
}
const review = validateAnnotations(project, ref, scene)
project.validation = review.receipt
writeFileSync('public/map-studio/drafts/mirage-registered-review.json', JSON.stringify(project, null, 2) + '\n')
writeFileSync('tmp/l09/registered-analysis.json', JSON.stringify({ originalSha256: hash, report: review }, null, 2))
console.log(JSON.stringify({ errors: review.receipt.errors, zones: review.zones.map(z => ({ label: z.label, safe: z.safe, samples: z.samples, unsupported: z.unsupported, ambiguous: z.ambiguous, exits: z.exits })), routes: review.routes.map(r => ({ ...r, points: r.points.length })) }, null, 2))
