import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { CollisionScene } from '../../engine/spatial/geometry'
import { NavigationMesh } from '../../engine/spatial/navigation'
import { UTILITY_KINDS, DEFAULT_UTILITY, EMPTY_STOCK, UTILITY_MODEL } from '../../engine/spatial/utility'
import { parseLabProject } from '../../lib/spatial-lab-project'
import { runLabEncounter } from '../../engine/spatial/lab-encounter'
import { discreteUtilityReplay } from './l12-discrete'

const base = 'public/map-studio/encounters/l12', ref = JSON.parse(readFileSync('public/map-studio/spatial/Mirage.json', 'utf8'))
const bytes = readFileSync('public/map-studio/spatial/Mirage.mesh'), sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex')
if (sha(bytes) !== ref.meshSha256) throw Error('Reference collision changed')
const scene = CollisionScene.fromBinary(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer), nav = new NavigationMesh(ref)
mkdirSync(base, { recursive: true })
const scenarios = UTILITY_KINDS.map(kind => {
    const project = parseLabProject(readFileSync('public/map-studio/encounters/l11/clear-duel.lab.json', 'utf8'), ref)
    project.encounter!.seconds = 12
    if (kind === 'decoy') project.encounter!.b.yaw = project.encounter!.a.yaw
    project.utility = { ...DEFAULT_UTILITY, inventory: { A: { ...EMPTY_STOCK, [kind]: 1 }, B: { ...EMPTY_STOCK } }, throws: [{ id: `test-${kind}`, owner: 'A', kind, at: 0.5, yaw: project.encounter!.a.yaw, pitch: -80, power: 0.1, mode: 'lob', tolerance: 16, bounceTargets: [], note: 'Original near-feet diagnostic throw on pinned reference geometry. Not a sourced or reviewed competitive lineup.' }] }
    const result = runLabEncounter(project, nav, scene).result
    if (result.utility?.flights[0]?.state !== 'detonated' || !result.utility.effects.length) throw Error(`${kind} did not detonate`)
    if (result.frames.at(-1)!.actors[0].utility?.inventory[kind] !== 0) throw Error('Inventory mismatch')
    const expected = kind === 'smoke' ? 'lost' : kind === 'flash' ? 'flash' : kind === 'he' ? 'blast-damage' : kind === 'fire' ? 'fire-damage' : 'decoy-heard'
    if (!result.events.some(e => e.type === expected)) throw Error(`${kind} lacks ${expected}`)
    if (['smoke', 'fire', 'decoy'].includes(kind) && !result.events.some(e => e.type === 'grenade-expire')) throw Error(`${kind} did not expire`)
    const id = `utility-${kind}`, lab = `/map-studio/encounters/l12/${id}.lab.json`
    writeFileSync('public' + lab, JSON.stringify(project, null, 2) + '\n')
    return { id, lab, expected, outcome: result.outcome, events: result.events.length, frames: result.frames.length, effects: result.utility.effects.map(e => ({ kind: e.kind, start: e.start, end: e.end, cells: e.cells?.length })), fullSha256: sha(JSON.stringify(result)), discreteSha256: sha(JSON.stringify(discreteUtilityReplay(result))), projectSha256: sha(readFileSync('public' + lab)) }
})
const manifest = { version: 1, mapId: 'Mirage', sourceVersion: ref.sourceVersion, meshSha256: ref.meshSha256, release: 'held', tuning: UTILITY_MODEL, coverage: 'Five original near-feet diagnostic throws; not reviewed competitive lineups or every launch map.', scenarios }
writeFileSync(base + '/index.json', JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify(manifest, null, 2))
