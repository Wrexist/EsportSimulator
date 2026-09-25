import { readFileSync, writeFileSync } from 'node:fs'
import { CollisionScene } from '../../engine/spatial/geometry'
import { NavigationMesh } from '../../engine/spatial/navigation'
import { runLabTeams } from '../../engine/spatial/lab-teams'
import { parseLabProject } from '../../lib/spatial-lab-project'
import { sealRoundReplay, projectRoundReplay, captureRoundPosition, restoreRoundPosition, verifyRoundReplay } from '../../engine/spatial/round-replay'

async function main() {
    const ref = JSON.parse(readFileSync('public/map-studio/spatial/Mirage.json', 'utf8')), bytes = readFileSync('public/map-studio/spatial/Mirage.mesh')
    const world = CollisionScene.fromBinary(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer), nav = new NavigationMesh(ref)
    const manifest = JSON.parse(readFileSync('public/map-studio/teams/l13/index.json', 'utf8')), scenarios = []
    for (const entry of manifest.scenarios) {
        const project = parseLabProject(readFileSync(`public${entry.lab}`, 'utf8'), ref), start = performance.now()
        const result = runLabTeams(project, nav, world, true).result, simulationMs = performance.now() - start
        const replay = await sealRoundReplay(project, ref, result), end = result.frames.at(-1)!.tick
        const instant = projectRoundReplay(replay, end), before = JSON.stringify(replay), renderStart = performance.now()
        for (const frame of result.frames) projectRoundReplay(replay, frame.tick)
        const projectionMs = performance.now() - renderStart
        const checkpoint = JSON.parse(JSON.stringify(captureRoundPosition(replay, Math.floor(end / 2))))
        restoreRoundPosition(replay, checkpoint)
        if (JSON.stringify(projectRoundReplay(replay, end + 100)) !== JSON.stringify(instant) || before !== JSON.stringify(replay) || !await verifyRoundReplay(replay)) throw Error(`Replay divergence: ${entry.id}`)
        scenarios.push({ id: entry.id, lab: entry.lab, sha256: replay.sha256, outcome: instant.outcome, players: instant.players, events: result.events.length, frames: result.frames.length, ticks: end, bytes: new TextEncoder().encode(before).length, simulationMs, projectionMs })
        console.log(`${entry.id}: ${instant.outcome}, ${simulationMs.toFixed(1)} ms simulation, ${projectionMs.toFixed(1)} ms replay`)
    }
    writeFileSync('docs/launch-readiness/evidence/L14-replays.json', JSON.stringify({ engine: 'spatial-round-v1', passed: true, node: process.version, sourceVersion: ref.sourceVersion, meshSha256: ref.meshSha256, scenarios, limits: ['Six controlled lab rounds, not full career matches.', 'Timing is host-specific; spatial season cost remains unproven.', 'Recorded positions/bomb at 8 Hz; physical event ticks at 64 Hz.', 'Reward deltas use existing economy rules with zero initial cash and loss streak.'] }, null, 2) + '\n')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
