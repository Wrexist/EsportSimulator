import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { CollisionScene } from '../../engine/spatial/geometry'
import { NavigationMesh, DEFAULT_ROUTE_OPTIONS, type NavLocation } from '../../engine/spatial/navigation'
import { distance3, type SpatialReference } from '../../engine/spatial/types'
import { TEAM_DEFAULTS, type TeamSetup } from '../../engine/spatial/team-model'
import { DEFAULT_UTILITY, EMPTY_STOCK } from '../../engine/spatial/utility'
import { emptyLabProject, parseLabProject } from '../../lib/spatial-lab-project'
import { runLabTeams } from '../../engine/spatial/lab-teams'
import { discreteTeamReplay } from './l13-discrete'

const base = 'public/map-studio/teams/l13', ref: SpatialReference = JSON.parse(readFileSync('public/map-studio/spatial/Mirage.json', 'utf8'))
const bytes = readFileSync('public/map-studio/spatial/Mirage.mesh'), sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex')
if (sha(bytes) !== ref.meshSha256) throw Error('Reference collision changed')
const scene = CollisionScene.fromBinary(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer), nav = new NavigationMesh(ref)
const duel = parseLabProject(readFileSync('public/map-studio/encounters/l11/clear-duel.lab.json', 'utf8'), ref)
let slots: NavLocation[] = []
for (const area of ref.areas) {
    const xs = area.corners.map(p => p[0]), ys = area.corners.map(p => p[1])
    if (Math.max(...xs) - Math.min(...xs) < 175 || Math.max(...ys) - Math.min(...ys) < 175) continue
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
    const points: NavLocation[] = []
    for (const x of [-64, 0, 64]) for (const y of [-64, 0, 64]) {
        const p = nav.surfaces(cx + x, cy + y).find(p => p.area === area.id)
        if (p && nav.supportedBody(p.point, scene) && !scene.bodyHit(p.point, 72) && (!points.length || nav.findRoute(points[0], p, { ...DEFAULT_ROUTE_OPTIONS, ladders: false }, scene).points.length)) points.push(p)
    }
    if (points.length >= 6) { slots = points; break }
}
if (slots.length < 6) throw Error('No clear supported team fixture patch')
duel.a = slots[0]; duel.b = slots[4]
const t2 = slots[1], ct2 = slots[5], siteA = slots[6] || slots[3], siteB = slots[2]
const yaw = Math.atan2(duel.b.point[1] - duel.a.point[1], duel.b.point[0] - duel.a.point[0]) * 180 / Math.PI
duel.encounter!.a.yaw = yaw; duel.encounter!.b.yaw = yaw > 0 ? yaw - 180 : yaw + 180
const actors: TeamSetup['actors'] = [
    { id: 'T1', side: 'T', role: 'entry', start: duel.a!, station: duel.a!, yaw: duel.encounter!.a.yaw, health: 100, armor: 100, ammo: 30 },
    { id: 'T2', side: 'T', role: 'support', start: t2, station: t2, yaw: duel.encounter!.a.yaw, health: 100, armor: 100, ammo: 30 },
    { id: 'CT1', side: 'CT', role: 'anchor', start: duel.b!, station: duel.b!, yaw: duel.encounter!.b.yaw, health: 100, armor: 100, ammo: 30 },
    { id: 'CT2', side: 'CT', role: 'support', start: ct2, station: ct2, yaw: duel.encounter!.b.yaw, health: 100, armor: 100, ammo: 30 },
]
const setup: TeamSetup = { ...TEAM_DEFAULTS, seconds: 25, roundSeconds: 20, carrier: 'T1', sites: { A: siteA, B: siteB }, actors }
const cases: { id: string; label: string; expected: string; change: (s: TeamSetup) => void }[] = [
    { id: 'delayed-radio', label: 'Delayed reports · 2v2', expected: 'report', change: s => { s.seconds = 8; s.openingSeconds = 10; s.communicationMs = 1000 } },
    { id: 'execute', label: 'Entry, support and plant', expected: 'planted', change: s => { s.openingSeconds = 0 } },
    { id: 'retake', label: 'Retake and defuse', expected: 'defused', change: s => { s.initialBomb = 'planted'; s.bombSeconds = 20; s.sites.A = s.actors[2].start } },
    { id: 'deadline-save', label: 'Impossible deadline · save', expected: 'exploded', change: s => { s.initialBomb = 'planted'; s.bombSeconds = 5; s.sites.A = s.actors[2].start } },
    { id: 'support-smoke', label: 'Support utility budget', expected: 'grenade-throw', change: s => { s.openingSeconds = 0; s.utility = { ...DEFAULT_UTILITY, inventory: Object.fromEntries(s.actors.map(a => [a.id, { ...EMPTY_STOCK, smoke: a.id === 'T2' ? 1 : 0 }])), throws: [{ id: 'support-smoke', owner: 'T2', kind: 'smoke', at: 0.5, yaw: s.actors[1].yaw, pitch: -80, power: 0.1, mode: 'lob', tolerance: 16, bounceTargets: [], note: 'Original diagnostic throw; not a competitive lineup.' }] } } },
    { id: 'trade-clutch', label: 'Reaction, trade and clutch', expected: 'damage', change: s => { s.guns = true; s.openingSeconds = 10; s.seconds = 12 } },
]
mkdirSync(base, { recursive: true })
const scenarios = cases.map(c => {
    const teams = structuredClone(setup); c.change(teams)
    const project = parseLabProject(JSON.stringify({ ...emptyLabProject(ref), a: duel.a, b: duel.b, teams }), ref)
    const result = runLabTeams(project, nav, scene).result
    if (!result.events.some(e => e.type === c.expected)) throw Error(`${c.id}: missing ${c.expected}`)
    if (result.metrics.minSeparation < 32) throw Error('Overlapping team actors')
    const lab = `/map-studio/teams/l13/${c.id}.lab.json`
    writeFileSync('public' + lab, JSON.stringify(project, null, 2) + '\n')
    return { id: c.id, label: c.label, lab, expected: c.expected, outcome: result.outcome, metrics: result.metrics, frames: result.frames.length, events: result.events.length, projectSha256: sha(readFileSync('public' + lab)), fullSha256: sha(JSON.stringify(result)), discreteSha256: sha(JSON.stringify(discreteTeamReplay(result))) }
})
const manifest = { version: 1, sourceVersion: ref.sourceVersion, meshSha256: ref.meshSha256, release: 'held', coverage: 'Original 2v2 diagnostic points on pinned Mirage geometry. Objective circles are test targets, not validated bombsite polygons.', scenarios }
writeFileSync(base + '/index.json', JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify(manifest, null, 2))
