import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { CollisionScene } from '../../engine/spatial/geometry'
import { NavigationMesh, type NavLocation } from '../../engine/spatial/navigation'
import { center, distance3, type SpatialReference } from '../../engine/spatial/types'
import { DEFAULT_ENCOUNTER, visibleSample, type EncounterResult } from '../../engine/spatial/encounter'
import { emptyLabProject, parseLabProject, type LabProject } from '../../lib/spatial-lab-project'
import { runLabEncounter } from '../../engine/spatial/lab-encounter'

const base = 'public/map-studio/encounters/l11', ref = JSON.parse(readFileSync('public/map-studio/spatial/Mirage.json', 'utf8')) as SpatialReference
const bytes = readFileSync('public/map-studio/spatial/Mirage.mesh'), sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex')
if (sha(bytes) !== ref.meshSha256) throw Error('Reference collision changed')
const scene = CollisionScene.fromBinary(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer), nav = new NavigationMesh(ref)
const candidates: NavLocation[] = []
for (const area of ref.areas) {
    const point = center(area)
    if (nav.supportedBody(point, scene) && !scene.bodyHit(point, 72)) candidates.push({ area: area.id, point })
}
let clear: [NavLocation, NavLocation] | undefined, blocked: typeof clear
for (const a of candidates) {
    for (const b of candidates) {
        const d = distance3(a.point, b.point)
        if (d < 180 || d > 400 || Math.abs(a.point[2] - b.point[2]) > 4) continue
        const yaw = Math.atan2(b.point[1] - a.point[1], b.point[0] - a.point[0]) * 180 / Math.PI
        const visible = visibleSample({ position: a.point, yaw, pitch: 0 }, b.point, 72, 110, scene)
        const reverse = visibleSample({ position: b.point, yaw: yaw > 0 ? yaw - 180 : yaw + 180, pitch: 0 }, a.point, 72, 110, scene)
        if (!clear && visible && reverse) clear = [a, b]
        if (!blocked && !visible && !reverse) blocked = [a, b]
        if (clear && blocked) break
    }
    if (clear && blocked) break
}
if (!clear || !blocked) throw Error('Could not find bounded Mirage fixture positions')
const make = (pair: [NavLocation, NavLocation]): LabProject => {
    const [a, b] = pair, yaw = Math.atan2(b.point[1] - a.point[1], b.point[0] - a.point[0]) * 180 / Math.PI
    return { ...emptyLabProject(ref), a, b, encounter: { ...DEFAULT_ENCOUNTER, a: { ...DEFAULT_ENCOUNTER.a, yaw, aimError: 0 }, b: { ...DEFAULT_ENCOUNTER.b, yaw: yaw > 0 ? yaw - 180 : yaw + 180, aimError: 0 } } }
}
const scenarios: { id: string; title: string; project: LabProject }[] = [
    { id: 'clear-duel', title: 'Clear sight · reaction duel', project: make(clear) },
    { id: 'opaque-wall', title: 'Opaque geometry · no contact', project: make(blocked) },
    { id: 'facing-away', title: 'Both players face away', project: make(clear) },
    { id: 'empty-magazine', title: 'A must reload before firing', project: make(clear) },
    { id: 'simultaneous-trade', title: 'Equal reaction · same-tick trade', project: make(clear) },
]
scenarios[2].project.encounter!.a.yaw = scenarios[2].project.encounter!.b.yaw
scenarios[2].project.encounter!.b.yaw = scenarios[0].project.encounter!.a.yaw
scenarios[3].project.encounter!.a.ammo = 0
scenarios[3].project.encounter!.b.yaw = scenarios[0].project.encounter!.a.yaw
for (const id of ['a', 'b'] as const) { scenarios[4].project.encounter![id].reactionMs = 250; scenarios[4].project.encounter![id].armor = 0 }
const discrete = (r: EncounterResult) => ({ outcome: r.outcome, events: r.events.map(({ from, to, ...e }) => e), frames: r.frames.map(f => ({ tick: f.tick, actors: f.actors.map(a => ({ id: a.id, health: a.health, armor: a.armor, ammo: a.ammo, reserve: a.reserve, state: a.state, visible: a.knowledge?.visible ?? false, seenTick: a.knowledge?.seenTick ?? null })) })) })
mkdirSync(base, { recursive: true })
const manifest = scenarios.map(s => {
    const project = parseLabProject(JSON.stringify(s.project), ref), result = runLabEncounter(project, nav, scene).result
    if (s.id === 'opaque-wall' || s.id === 'facing-away') { if (result.events.length) throw Error(`Hidden fixture has events: ${s.id}`) }
    else if (s.id === 'simultaneous-trade') { if (result.outcome !== 'trade') throw Error('Trade fixture did not trade') }
    else if (!result.events.some(e => e.type === 'damage')) throw Error(`No damage in ${s.id}`)
    if (s.id === 'empty-magazine' && result.events.find(e => e.actor === 'A' && e.type === 'shot')!.tick < 144) throw Error('Reload window bypassed')
    const lab = `/map-studio/encounters/l11/${s.id}.lab.json`
    writeFileSync('public' + lab, JSON.stringify(project, null, 2) + '\n')
    return { id: s.id, title: s.title, lab, outcome: result.outcome, events: result.events.length, fullSha256: sha(JSON.stringify(result)), discreteSha256: sha(JSON.stringify(discrete(result))), projectSha256: sha(readFileSync('public' + lab)) }
})
writeFileSync(base + '/index.json', JSON.stringify({ version: 1, mapId: 'Mirage', sourceVersion: ref.sourceVersion, meshSha256: ref.meshSha256, release: 'held', tuning: 'lab-rifle-v1; original, provisional, uncalibrated', comparison: 'Discrete hashes cover event types, ticks, damage, outcome, health, armor, ammo, reserve and knowledge visibility/age. Full hashes retain ray and angle floating point values.', scenarios: manifest }, null, 2) + '\n')
console.log(JSON.stringify(manifest, null, 2))
