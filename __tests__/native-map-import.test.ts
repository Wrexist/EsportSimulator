import { readFileSync } from 'node:fs'
import { emptyProject, parseProject, markDisplayLabel, markVisuals, annotationSvg, type MapFloor } from '@/lib/map-annotations'
import { mergeMapLibrary } from '@/lib/map-studio-library'
import drafts from '@/data/native-map-drafts.json'
import { footprint, nativeFloor, parseNativeEntities, sourceRadarPoint, worldVertices, type NativeEntity } from '@/scripts/launch/native-map-data'
import { registeredWorld, type MapRegistration } from '@/engine/spatial/registration'
import type { SpatialReference } from '@/engine/spatial/types'

const load = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
describe('installed native map drafts', () => {
    it('covers every non-Mirage map and both available radar floors', () => {
        expect(drafts.map(draft => `${draft.mapId}/${draft.floor}`).sort()).toEqual(['Ancient/upper', 'Anubis/upper', 'Inferno/upper', 'Nuke/lower', 'Nuke/upper', 'Overpass/upper', 'Sandstone/upper', 'Vertigo/lower', 'Vertigo/upper'])
    })
    it.each(drafts)('$mapId / $floor preserves the library and includes only native entities on that floor', entry => {
        const draft = parseProject(readFileSync(`public${entry.project}`, 'utf8'))
        const baseline = mergeMapLibrary(emptyProject(entry.mapId, entry.floor as MapFloor))
        for (const mark of baseline.marks) expect(draft.marks.find(candidate => candidate.id === mark.id)).toEqual(mark)
        const audit = load(`public${entry.audit}`)
        expect(audit.navMatches).toBe(true)
        expect(audit.sites.map((site: { site: string }) => site.site).sort()).toEqual(['A', 'B'])
        const enabled = audit.spawns.filter((spawn: { enabled: boolean; floor: string }) => spawn.enabled && spawn.floor === entry.floor)
        const pins = draft.marks.filter(mark => mark.id.startsWith('native-spawn:'))
        expect(pins).toHaveLength(enabled.length)
        for (const spawn of enabled) expect(pins.find(pin => pin.id.endsWith(`:${spawn.id}`))?.points).toEqual([spawn.radar])
        const pieces = audit.sites.flatMap((site: { pieces: { floor: string; id: string; points: unknown[] }[] }) => site.pieces).filter((piece: { floor: string }) => piece.floor === entry.floor)
        expect(draft.marks.filter(mark => mark.id.startsWith('native-site:'))).toHaveLength(pieces.length)
        for (const piece of pieces) expect(draft.marks.find(mark => mark.id === piece.id)?.points).toEqual(piece.points)
        expect(new Set(draft.marks.map(mark => mark.id)).size).toBe(draft.marks.length)
        expect(draft.validation).toBeUndefined()
        for (const mark of draft.marks.filter(mark => mark.id.startsWith('native-'))) {
            expect(mark.status).toBe('draft')
            expect(mark.spatial).toBeUndefined() // Trigger heights and spawn origins are not standing-floor bindings.
        }
    })
    it('keeps Nuke B as six separate lower-floor pieces and Vertigo T spawns downstairs', () => {
        const nuke = load('public/map-studio/reviews/native/Nuke/audit.json')
        expect(nuke.sites.find((site: { site: string }) => site.site === 'B').pieces).toHaveLength(6)
        expect(nuke.sites.find((site: { site: string }) => site.site === 'B').pieces.every((piece: { floor: string }) => piece.floor === 'lower')).toBe(true)
        const vertigo = load('public/map-studio/reviews/native/Vertigo/audit.json')
        expect(vertigo.spawns.filter((spawn: { side: string }) => spawn.side === 'T').every((spawn: { floor: string }) => spawn.floor === 'lower')).toBe(true)
    })
    it('shows one site label while preserving every selectable convex piece and its full label', () => {
        const project = parseProject(readFileSync('public/map-studio/drafts/nuke-lower-native.json', 'utf8'))
        const pieces = project.marks.filter(mark => mark.id.startsWith('native-site:'))
        expect(pieces.map(mark => markDisplayLabel(mark)).filter(Boolean)).toEqual(['B plant zone'])
        expect(markDisplayLabel(pieces[2], pieces[2].id)).toBe(pieces[2].label)
        const svg = annotationSvg(project, 'data:image/png;base64,')
        expect(svg.match(/B plant zone/g)).toHaveLength(1)
        expect(svg.match(/<polygon /g)).toHaveLength(6)
    })
    it('uses small team-coloured spawn pins and reveals source names only on selection', () => {
        const project = parseProject(readFileSync('public/map-studio/drafts/anubis-upper-native.json', 'utf8'))
        const pins = project.marks.filter(mark => mark.id.startsWith('native-spawn:'))
        expect(pins.every(mark => markDisplayLabel(mark) === '')).toBe(true)
        const ct = pins.find(mark => mark.side === 'CT')!, t = pins.find(mark => mark.side === 'T')!
        expect(markVisuals(ct)[0].attrs.fill).not.toBe(markVisuals(t)[0].attrs.fill)
        expect(markDisplayLabel(ct, ct.id)).toBe(ct.label)
    })
})

describe('native coordinate import', () => {
    const entity: NativeEntity = { id: 'test', classname: 'func_bomb_target', origin: [1238, 1953.5, -186], angles: [0, 0, 0], scales: [1, 1, 1], enabled: false, priority: 0 }
    it('applies model translation before radar projection and rejects unverified rotations', () => {
        expect(worldVertices([[10, 20, 30]], entity)).toEqual([[1248, 1973.5, -156]])
        expect(() => worldVertices([[0, 0, 0]], { ...entity, angles: [0, 90, 0] })).toThrow('Rotated')
    })
    it('projects a convex piece without duplicate upper/lower vertices', () => {
        expect(footprint([[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0], [0, 0, 10], [1, 1, 0]])).toHaveLength(4)
    })
    it('rejects cross-floor volumes instead of misplacing them', () => {
        const ref = load('public/map-studio/spatial/Nuke.json') as SpatialReference
        expect(nativeFloor(-768, -728, ref)).toBe('lower')
        expect(nativeFloor(-416, -320, ref)).toBe('upper')
        expect(() => nativeFloor(-500, -400, ref)).toThrow('crosses')
    })
    it('round trips native XY through the non-identity source radar registration', () => {
        const ref = load('public/map-studio/spatial/Anubis.json') as SpatialReference
        const registration = load('public/map-studio/registration.json').maps.find((row: { mapId: string }) => row.mapId === 'Anubis').registration as MapRegistration
        const point = sourceRadarPoint([1238, 1953.5, -186], ref, registration)
        const world = registeredWorld(point, registration, ref)
        expect(world[0]).toBeCloseTo(1238, 8); expect(world[1]).toBeCloseTo(1953.5, 8)
    })
    it('requires an explicit spawn enabled state and preserves disabled values', () => {
        const text = 'values = { classname = "info_player_terrorist" hammerUniqueId = "1" origin = [0,0,0] angles = [0,0,0] scales = [1,1,1] enabled = false priority = 2 }'
        expect(parseNativeEntities(text)[0]).toMatchObject({ enabled: false, priority: 2 })
        expect(() => parseNativeEntities(text.replace('enabled = false', ''))).toThrow('enabled')
    })
})
