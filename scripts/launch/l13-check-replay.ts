import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { CollisionScene } from '../../engine/spatial/geometry'
import { NavigationMesh } from '../../engine/spatial/navigation'
import { parseLabProject } from '../../lib/spatial-lab-project'
import { runLabTeams } from '../../engine/spatial/lab-teams'
import { discreteTeamReplay } from './l13-discrete'

const source = process.argv[2]
if (!source) throw Error('Pass a browser-exported team replay file')
const replay = JSON.parse(readFileSync(source, 'utf8')), ref = JSON.parse(readFileSync('public/map-studio/spatial/Mirage.json', 'utf8'))
if (replay.format !== 'esim-team-replay' || replay.version !== 1 || replay.meshSha256 !== ref.meshSha256 || replay.sourceVersion !== ref.sourceVersion) throw Error('Replay/reference identity mismatch')
const bytes = readFileSync('public/map-studio/spatial/Mirage.mesh'), hash = (s: string) => createHash('sha256').update(s).digest('hex')
const project = parseLabProject(JSON.stringify(replay.project), ref), scene = CollisionScene.fromBinary(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
const expected = runLabTeams(project, new NavigationMesh(ref), scene).result
const discreteMatches = hash(JSON.stringify(discreteTeamReplay(expected))) === hash(JSON.stringify(discreteTeamReplay(replay.result)))
if (!discreteMatches) throw Error('Browser export does not reproduce authoritative decisions')
writeFileSync('docs/launch-readiness/evidence/L13-browser-replay-check.json', JSON.stringify({ passed: true, fullMatches: hash(JSON.stringify(expected)) === hash(JSON.stringify(replay.result)), discreteMatches, fullSha256: hash(JSON.stringify(replay.result)), outcome: expected.outcome, frames: expected.frames.length, events: expected.events.length, sourceVersion: ref.sourceVersion, meshSha256: ref.meshSha256 }, null, 2) + '\n')
console.log('PASS: visible browser export reproduces team decisions and resources')
