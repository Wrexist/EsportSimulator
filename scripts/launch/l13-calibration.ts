import { readFileSync, writeFileSync } from 'node:fs'
import { CollisionScene } from '../../engine/spatial/geometry'
import { NavigationMesh } from '../../engine/spatial/navigation'
import { UTILITY_KINDS, UTILITY_MODEL, EMPTY_STOCK } from '../../engine/spatial/utility'
import { runLabTeams } from '../../engine/spatial/lab-teams'
import { parseLabProject } from '../../lib/spatial-lab-project'

const ref = JSON.parse(readFileSync('public/map-studio/spatial/Mirage.json', 'utf8')), bytes = readFileSync('public/map-studio/spatial/Mirage.mesh')
const world = CollisionScene.fromBinary(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer), nav = new NavigationMesh(ref)
const cases = UTILITY_KINDS.map(kind => {
    const project = parseLabProject(readFileSync('public/map-studio/teams/l13/support-smoke.lab.json', 'utf8'), ref), u = project.teams!.utility!
    u.throws[0].kind = kind; u.inventory.T2 = { ...EMPTY_STOCK, [kind]: 1 }
    const r = runLabTeams(project, nav, world).result, flight = r.utility!.flights[0]
    if (!flight || flight.state !== 'detonated') throw Error(`Team ${kind} failed to detonate`)
    u.throws[0].target = [...flight.point]
    const matched = runLabTeams(project, nav, world).result.utility!.checks[0]
    u.throws[0].target[0] += 64
    const mismatch = runLabTeams(project, nav, world).result.utility!.checks[0]
    if (matched.state !== 'matches-model' || mismatch.state !== 'mismatch') throw Error('Target diagnostic did not detect perturbation')
    return { kind, releaseTick: flight.start, detonationTick: r.events.find(e => e.type === 'grenade-detonate')!.tick, landing: flight.point, bounces: flight.bounces, effects: r.utility!.effects.map(e => ({ kind: e.kind, start: e.start, end: e.end, cells: e.cells?.length })), consumed: r.events.filter(e => e.type === 'grenade-throw').length, matched, shiftedTarget: mismatch }
})
const skills = [0.2, 0.65, 0.8].map(skill => {
    const outcomes = Array.from({ length: 24 }, (_, seed) => {
        const project = parseLabProject(readFileSync('public/map-studio/teams/l13/trade-clutch.lab.json', 'utf8'), ref)
        project.teams!.seed = seed; project.teams!.skill = { T: skill, CT: 0.65 }
        const r = runLabTeams(project, nav, world).result
        return { seed, outcome: r.outcome, shots: r.metrics.shots, damage: r.metrics.damage }
    })
    return { skill, tWins: outcomes.filter(r => r.outcome === 'T').length, ctWins: outcomes.filter(r => r.outcome === 'CT').length, unresolved: outcomes.filter(r => r.outcome === 'unresolved').length, outcomes }
})
const report = { model: UTILITY_MODEL, sourceVersion: ref.sourceVersion, meshSha256: ref.meshSha256, cases, skills, status: 'provisional', limits: 'Original near-feet diagnostics and one 2v2 seeded skill batch, not measured competitive lineups or a broad balance claim. Model matching is not real-map verification. No owner markings were changed.' }
writeFileSync('docs/launch-readiness/evidence/L13-calibration.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ utility: cases.map(c => ({ kind: c.kind, release: c.releaseTick, detonation: c.detonationTick, consumed: c.consumed, targetCheck: c.shiftedTarget.state })), skills: skills.map(({outcomes, ...s}) => s) }, null, 2))
