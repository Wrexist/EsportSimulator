import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { CollisionScene } from '../../engine/spatial/geometry'
import { NavigationMesh } from '../../engine/spatial/navigation'
import { parseLabProject } from '../../lib/spatial-lab-project'
import { runLabTeams } from '../../engine/spatial/lab-teams'
import { sealRoundReplay } from '../../engine/spatial/round-replay'
import { previewCareerRound } from '../../engine/spatial/career-round-adapter'
import type { SpatialReference } from '../../engine/spatial/types'

async function main() {
    const directory = 'docs/ui-review/physical-career'
    const ref = JSON.parse(readFileSync('public/map-studio/spatial/Mirage.json', 'utf8')) as SpatialReference
    const project = parseLabProject(readFileSync(`${directory}/mirage-5v5-review.lab.json`, 'utf8'), ref)
    const mesh = readFileSync('public/map-studio/spatial/Mirage.mesh')
    if (createHash('sha256').update(mesh).digest('hex') !== ref.meshSha256) throw Error('Reference checksum mismatch')
    const scene = CollisionScene.fromBinary(mesh.buffer.slice(mesh.byteOffset, mesh.byteOffset + mesh.byteLength) as ArrayBuffer)
    const nav = new NavigationMesh(ref)
    const started = performance.now()
    const result = runLabTeams(project, nav, scene, true).result
    const elapsedMs = Math.round(performance.now() - started)
    const replay = await sealRoundReplay(project, ref, result)
    const preview = await previewCareerRound(replay, {
        matchId: 'mirage-integration-review', mapId: ref.mapId, roundNumber: 1,
        homeTeamId: 'review-home', awayTeamId: 'review-away', homeSide: 'T',
        players: project.teams!.actors.map(a => ({ actorId: a.id, playerId: `review:${a.id}`, teamId: a.side === 'T' ? 'review-home' : 'review-away' })),
    })
    const report = { replaySha256: replay.sha256, sourceVersion: ref.sourceVersion, meshSha256: ref.meshSha256,
        careerEligible: false, elapsedMs, outcome: result.outcome, reason: result.reason, ticks: result.frames.at(-1)!.tick,
        frames: result.frames.length, events: result.events.length, metrics: result.metrics,
        routeFailures: result.events.filter(e => e.type === 'route-blocked'),
        finalActors: result.frames.at(-1)!.actors.map(a => ({ id: a.id, position: a.position, intent: a.intent, reason: a.reason })),
        blockedActors: [...new Set(result.events.filter(e => e.type === 'intent' && /blocked|route|unreachable/i.test(e.reason)).map(e => e.actor))],
        preview, note: 'One seed, provisional lab rules and unreviewed annotations. This is an integration smoke check, not balance or geometry certification.' }
    writeFileSync('tmp/physical-career-radar-preview.json',JSON.stringify({replay,binding:preview.binding}))
    writeFileSync(`${directory}/5v5-integration-${replay.engine}.json`, JSON.stringify({ engine: replay.engine, ...report }, null, 2) + '\n')
    console.log(JSON.stringify({ elapsedMs, outcome: result.outcome, reason: result.reason, frames: report.frames, events: report.events, metrics: result.metrics, winType: preview.round.winType, careerEligible: preview.careerEligible }, null, 2))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
