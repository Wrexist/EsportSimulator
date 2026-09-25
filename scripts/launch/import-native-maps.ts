import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { emptyProject, parseProject, type MapFloor, type MapAnnotationProject } from '../../lib/map-annotations'
import { mergeMapLibrary } from '../../lib/map-studio-library'
import { parseRegistration, type MapRegistration } from '../../engine/spatial/registration'
import type { SpatialReference, Vec3 } from '../../engine/spatial/types'
import { parseNativeEntities, footprint, worldVertices, nativeFloor, sourceRadarPoint } from './native-map-data'

const read = <T,>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T
const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')
const write = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n')
const registrations = read<{ maps: { mapId: string; floor: MapFloor; registration: MapRegistration }[] }>('public/map-studio/registration.json').maps
interface Physics { hulls: { vertices: Vec3[]; collisionAttributeIndex: number }[]; meshes: unknown[] }
const index: { mapId: string; floor: MapFloor; project: string; audit: string; spawns: number; sitePieces: number }[] = []

for (const file of readdirSync('public/map-studio/spatial').filter(file => file.endsWith('.json') && file !== 'Mirage.json').sort()) {
    const ref = read<SpatialReference>(`public/map-studio/spatial/${file}`), root = `tmp/native-maps/${ref.mapId}`
    const nav = read<Pick<SpatialReference, 'areas' | 'ladders'>>(`${root}/nav.json`)
    const areas = nav.areas.filter(area => area.hull === 0 && area.movable === 4294967295), ids = new Set(areas.map(area => area.id))
    for (const area of areas) area.edges = area.edges.filter(edge => ids.has(edge.target))
    if (JSON.stringify(areas) !== JSON.stringify(ref.areas) || JSON.stringify(nav.ladders) !== JSON.stringify(ref.ladders)) throw Error(`${ref.mapId}: navigation changed; review registration before import`)
    if (hash(`public/map-studio/spatial/${ref.mapId}.mesh`) !== ref.meshSha256) throw Error('Reference mesh changed')
    const entities = readdirSync(root).filter(file => file.endsWith('.txt')).sort().flatMap(file => parseNativeEntities(readFileSync(`${root}/${file}`, 'utf8')))
    if (new Set(entities.map(entity => entity.id)).size !== entities.length) throw Error('Duplicate entity across lumps')
    const targets = entities.filter(entity => entity.classname === 'func_bomb_target')
    if (targets.length !== 2 || new Set(targets.map(entity => entity.site)).size !== 2) throw Error(`${ref.mapId}: expected distinct A/B targets`)
    const projects: Partial<Record<MapFloor, MapAnnotationProject>> = {}
    for (const floor of Object.keys(ref.radars) as MapFloor[]) {
        const row = registrations.find(row => row.mapId === ref.mapId && row.floor === floor)
        if (!row) throw Error('Missing radar registration')
        const registration = parseRegistration(row.registration)
        if (hash(`public${registration.sourceRadar}`) !== registration.sourceSha256 || hash(`public${ref.radars[floor]}`) !== registration.targetSha256 || registration.meshSha256 !== ref.meshSha256 || registration.sourceVersion !== ref.sourceVersion) throw Error('Stale radar registration')
        projects[floor] = { ...mergeMapLibrary(emptyProject(ref.mapId, floor)), registration }
    }
    const sites = targets.map(target => {
        if (!target.model?.startsWith(`maps/${ref.sourceMap}/entities/`) || target.model.includes('..')) throw Error('Unexpected trigger model path')
        const physics = read<Physics>(`${root}/${target.site}.json`)
        if (!physics.hulls.length || physics.meshes.length) throw Error('Trigger mesh needs a separate projection adapter')
        const pieces = physics.hulls.map((hull, part) => {
            const vertices = worldVertices(hull.vertices, target), zMin = Math.min(...vertices.map(p => p[2])), zMax = Math.max(...vertices.map(p => p[2]))
            const floor = nativeFloor(zMin, zMax, ref), project = projects[floor]!, points = footprint(vertices).map(p => sourceRadarPoint(p, ref, project.registration!))
            const id = `native-site:${ref.mapId}:${target.site}:${part}`
            project.marks.push({ id, kind: 'bombsite', points, label: `${target.site} native plant zone${physics.hulls.length > 1 ? ` (${part + 1}/${physics.hulls.length})` : ''}`, status: 'draft',
                note: `Installed func_bomb_target ${target.id}, convex piece ${part + 1}. Native volume Z ${zMin} to ${zMax}. Pieces form a union; do not fill the gaps. This is a projected trigger, not a validated standing-floor binding or Source player-overlap implementation.` })
            return { id, floor, vertices, zMin, zMax, points }
        })
        return { site: target.site, entityId: target.id, model: target.model, origin: target.origin, angles: target.angles, scales: target.scales, sha256: hash(`${root}/${target.model}_c`), pieces }
    })
    const spawns = entities.filter(entity => entity.classname !== 'func_bomb_target').map(entity => {
        const side = entity.classname === 'info_player_counterterrorist' ? 'CT' : 'T', floor = nativeFloor(entity.origin[2], entity.origin[2], ref)
        const project = projects[floor]!, radar = sourceRadarPoint(entity.origin, ref, project.registration!)
        if (entity.enabled) project.marks.push({ id: `native-spawn:${ref.mapId}:${entity.id}`, kind: 'callout', points: [radar], side, status: 'draft', label: `${side} spawn ${entity.id}`,
            note: `Installed enabled spawn; priority ${entity.priority}. World origin ${entity.origin.join(', ')}. Review pin only: entity origin requires grounding before runtime use.` })
        return { ...entity, side, floor, radar }
    })
    for (const side of ['CT', 'T']) if (!spawns.some(spawn => spawn.side === side && spawn.enabled)) throw Error(`Missing enabled ${side} spawns`)
    const world = read<Physics>(`${root}/world.json`), audit = `/map-studio/reviews/native/${ref.mapId}/audit.json`
    mkdirSync(`public/map-studio/reviews/native/${ref.mapId}`, { recursive: true })
    write(`public${audit}`, { format: 'esim-native-map-audit', version: 1, mapId: ref.mapId, sourceMap: ref.sourceMap, extraction: read(`${root}/extraction.json`), navMatches: true, navAreas: areas.length, ladders: nav.ladders.length, sites, spawns,
        world: { hulls: world.hulls.length, meshes: world.meshes, collisionAttributeIndices: [...new Set(world.hulls.map(hull => hull.collisionAttributeIndex))].sort((a, b) => a - b) },
        sourceHashes: { nav: hash(`${root}/maps/${ref.sourceMap}.nav`), physics: hash(`${root}/maps/${ref.sourceMap}/world_physics.vmdl_c`), entities: Object.fromEntries(readdirSync(`${root}/maps/${ref.sourceMap}/entities`).filter(file => file.endsWith('.vents_c')).sort().map(file => [file, hash(`${root}/maps/${ref.sourceMap}/entities/${file}`)])) },
        limits: ['Spawn pins are entity origins; runtime grounding and priority selection remain pending.', 'Each convex plant piece is projected separately; exact 3D trigger/player overlap and standing-floor binding remain pending.', 'Radar registration remains provisional; navigation equality does not certify visual alignment or collision masks.', 'Native collision categories, dynamic/breakable entities and runtime geometry adoption remain pending.', 'Library drawings and utility guides are preserved, not validated by this import.'] })
    for (const [floor, project] of Object.entries(projects)) {
        const url = `/map-studio/drafts/${ref.mapId.toLowerCase()}-${floor}-native.json`
        const parsed = parseProject(JSON.stringify(project))
        write(`public${url}`, parsed)
        index.push({ mapId: ref.mapId, floor: floor as MapFloor, project: url, audit, spawns: parsed.marks.filter(mark => mark.id.startsWith('native-spawn:')).length, sitePieces: parsed.marks.filter(mark => mark.id.startsWith('native-site:')).length })
    }
}
write('data/native-map-drafts.json', index)
console.log(JSON.stringify(index, null, 2))
