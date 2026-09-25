import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { parseLabProject } from '../../lib/spatial-lab-project'
import { CollisionScene } from '../../engine/spatial/geometry'
import { NavigationMesh } from '../../engine/spatial/navigation'
import { runLabEncounter } from '../../engine/spatial/lab-encounter'
import { discreteUtilityReplay } from './l12-discrete'
import type { EncounterResult } from '../../engine/spatial/encounter'

const file = process.argv[2]
if (!file) throw Error('Provide the downloaded encounter replay path')
const raw = readFileSync(file), replay = JSON.parse(raw.toString()) as { format: string; project: unknown; result: EncounterResult; meshSha256: string }
if (replay.format !== 'esim-encounter-replay') throw Error('Not an encounter replay')
const ref = JSON.parse(readFileSync('public/map-studio/spatial/Mirage.json', 'utf8')), mesh = readFileSync('public/map-studio/spatial/Mirage.mesh')
const hash = (s: string | Buffer) => createHash('sha256').update(s).digest('hex')
if (hash(mesh) !== ref.meshSha256 || replay.meshSha256 !== ref.meshSha256) throw Error('Mesh mismatch')
const project = parseLabProject(JSON.stringify(replay.project), ref), scene = CollisionScene.fromBinary(mesh.buffer.slice(mesh.byteOffset, mesh.byteOffset + mesh.byteLength) as ArrayBuffer)
const expected = runLabEncounter(project, new NavigationMesh(ref), scene).result
const states = (r: EncounterResult) => { const { checks, ...rest } = discreteUtilityReplay(r); return { ...rest, checks: checks?.map(c => ({ id: c.id, state: c.state, reason: c.reason })) } }
if (JSON.stringify(states(expected)) !== JSON.stringify(states(replay.result))) throw Error('Authoritative state/event/check result mismatch')
let maxCheckpointErrorDelta = 0, maxPathDelta = 0
for (const [i, check] of expected.utility!.checks.entries()) {
    const actual = replay.result.utility!.checks[i]
    for (const [a, b] of [[check.landingError, actual.landingError], ...check.bounceErrors.map((n, i) => [n, actual.bounceErrors[i]])]) {
        if (a == null || b == null) { if (a !== b) throw Error('Missing checkpoint'); continue }
        maxCheckpointErrorDelta = Math.max(maxCheckpointErrorDelta, Math.abs(a - b))
    }
}
for (const [i, flight] of expected.utility!.flights.entries()) {
    const actual = replay.result.utility!.flights[i]
    if (!actual || flight.path.length !== actual.path.length) throw Error('Flight path length mismatch')
    flight.path.forEach((p, j) => { if (p.tick !== actual.path[j].tick) throw Error('Flight path tick mismatch'); p.point.forEach((n, k) => { maxPathDelta = Math.max(maxPathDelta, Math.abs(n - actual.path[j].point[k])) }) })
}
if (maxCheckpointErrorDelta > 1e-8 || maxPathDelta > 1e-8) throw Error('Float geometry exceeds declared comparison tolerance')
const report = { passed: true, replaySha256: hash(raw), meshSha256: ref.meshSha256, events: expected.events.length, frames: expected.frames.length, authoritativeSha256: hash(JSON.stringify(states(expected))), maxPathDelta, maxCheckpointErrorDelta, floatToleranceUnits: 1e-8, checks: replay.result.utility!.checks, comparison: 'Exact event types/ticks/damage/inventory/knowledge and checkpoint state; geometric path/checkpoint errors compared within the explicitly reported world-unit tolerance.' }
writeFileSync('docs/launch-readiness/evidence/L12-browser-replay-check.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
