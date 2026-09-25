import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { parseProject } from '../../lib/map-annotations'
import { validateAnnotations } from '../../engine/spatial/annotations'
import { CollisionScene } from '../../engine/spatial/geometry'

const packageId = process.argv[2] === 'l14' ? 'L14' : process.argv[2] === 'l13' ? 'L13' : 'L12'
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const originals = [
    ['public/map-studio/drafts/mirage-user-v12-2026-09-13.json', 'efc599edc2dcfd27d450e734d476ff94426c98bb2ef631e96ca09f63d91a8fe2'],
    ['public/map-studio/drafts/mirage-user-areas-2026-09-13.json', '46e2c94658a547f6d8bf7d4af8643e3b690e946b14060daece37fc8315c11e65'],
].map(([file, expected]) => { const bytes = readFileSync(file), hash = sha(bytes); if (hash !== expected) throw Error(`Owner draft changed: ${file}`); return { file, sha256: hash, bytes: bytes.length } })
const project = parseProject(readFileSync(originals[0].file, 'utf8')), ref = JSON.parse(readFileSync('public/map-studio/spatial/Mirage.json', 'utf8')), mesh = readFileSync('public/map-studio/spatial/Mirage.mesh')
if (sha(mesh) !== ref.meshSha256) throw Error('Reference mesh changed')
const scene = CollisionScene.fromBinary(mesh.buffer.slice(mesh.byteOffset, mesh.byteOffset + mesh.byteLength) as ArrayBuffer), report = validateAnnotations(project, ref, scene)
const output = { originals, meshSha256: ref.meshSha256, sourceVersion: ref.sourceVersion, marks: project.marks.length, errors: report.receipt.errors, warnings: report.receipt.warnings, zones: report.zones, issues: report.issues, wallsUsed: report.wallsUsed, release: 'held', note: `Read-only revalidation under ${packageId} code. No owner marks, heights, types or polygons were changed.` }
writeFileSync(`docs/launch-readiness/evidence/${packageId}-mirage-review.json`, JSON.stringify(output, null, 2) + '\n')
console.log(JSON.stringify({ marks: output.marks, errors: output.errors, warnings: output.warnings, wallsUsed: output.wallsUsed, zones: output.zones.map(({ candidates, ...zone }) => zone) }, null, 2))
