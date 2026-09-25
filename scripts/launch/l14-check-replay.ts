import { readFileSync, writeFileSync } from 'node:fs'
import { CollisionScene } from '../../engine/spatial/geometry'
import { NavigationMesh } from '../../engine/spatial/navigation'
import { parseLabProject } from '../../lib/spatial-lab-project'
import { runLabTeams } from '../../engine/spatial/lab-teams'
import { sealRoundReplay, verifyRoundReplay, projectRoundReplay } from '../../engine/spatial/round-replay'

async function main() {
    if (!process.argv[2]) throw Error('Pass the exported round replay path')
    const replay = JSON.parse(readFileSync(process.argv[2], 'utf8'))
    if (!await verifyRoundReplay(replay)) throw Error('Unsupported or modified replay')
    const ref = JSON.parse(readFileSync('public/map-studio/spatial/Mirage.json', 'utf8'))
    if (replay.meshSha256 !== ref.meshSha256) throw Error('Replay reference changed')
    const project = parseLabProject(JSON.stringify(replay.project), ref), bytes = readFileSync('public/map-studio/spatial/Mirage.mesh')
    const world = CollisionScene.fromBinary(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
    const result = runLabTeams(project, new NavigationMesh(ref), world, true).result
    const expected = await sealRoundReplay(project, ref, result)
    if (expected.sha256 !== replay.sha256) throw Error('Export does not reproduce the physical round')
    const final = projectRoundReplay(expected, result.frames.at(-1)!.tick)
    writeFileSync('docs/launch-readiness/evidence/L14-browser-export.json', JSON.stringify({ passed: true, sha256: replay.sha256, outcome: final.outcome, players: final.players, sourceVersion: ref.sourceVersion, meshSha256: ref.meshSha256 }, null, 2) + '\n')
    console.log('PASS: browser export exactly reproduces input, physical frames, events and result')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
