import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { emptyProject, parseProject, markDisplayLabel, type MapPoint } from '@/lib/map-annotations'
import { INTERIOR_BOUNDARIES, MAP_STUDIO_LIBRARY, mergeMapLibrary } from '@/lib/map-studio-library'
import { sourceRadarPoint } from '@/scripts/launch/native-map-data'
import type { SpatialReference } from '@/engine/spatial/types'
import type { MapRegistration } from '@/engine/spatial/registration'

const marks = INTERIOR_BOUNDARIES.maps.Anubis.upper!
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
const audit = read('public/map-studio/reviews/native/Anubis/interior-audit.json')

describe('Anubis interior boundary repair', () => {
    it('covers all eighteen substantial radar holes with editable, height-unbound guides', () => {
        expect(audit.holeCount).toBe(18)
        expect(marks).toHaveLength(19) // One void splits around protected native navigation.
        expect(new Set(marks.map(mark => mark.id.split(':')[3])).size).toBe(18)
        for (const mark of marks) {
            expect(mark).toMatchObject({ kind: 'wall', locked: false, status: 'draft' })
            expect(mark.spatial).toBeUndefined()
            expect(markDisplayLabel(mark)).toBe('')
            expect(markDisplayLabel(mark, mark.id)).toBe(mark.label)
        }
        expect(createHash('sha256').update(readFileSync('public/maps/de_anubis_radar_psd.png')).digest('hex')).toBe(audit.sourceRadarSha256)
        expect(parseProject(JSON.stringify(mergeMapLibrary(emptyProject('Anubis')))).marks.filter(mark => mark.id.startsWith('interior:'))).toEqual(marks)
    })
    it('adds only the new outlines to existing drafts and never resurrects deleted library entries', () => {
        const user = { id: 'mine', kind: 'wall' as const, points: [{ x: 20, y: 20 }, { x: 25, y: 20 }], label: 'My wall', note: 'Keep' }
        const edited = { ...marks[0], points: [{ x: 10, y: 10 }, { x: 12, y: 10 }], note: 'My correction' }
        const old = { ...emptyProject('Anubis'), libraryVersion: MAP_STUDIO_LIBRARY.version, marks: [user, edited] }
        const merged = mergeMapLibrary(old)
        expect(merged.marks.filter(mark => mark.source?.provider === 'CS2Nades')).toEqual([])
        expect(merged.marks.find(mark => mark.id === 'mine')).toEqual(user)
        expect(merged.marks.find(mark => mark.id === edited.id)).toEqual(edited)
        expect(old.marks).toEqual([user, edited])
        const deleted = { ...merged, marks: [user] }
        const reloaded = parseProject(JSON.stringify(deleted))
        expect(mergeMapLibrary(reloaded)).toBe(reloaded)
        expect(reloaded.marks).toEqual([user])
    })
    it('rejects invalid update receipts and leaves other map drawings alone', () => {
        expect(() => parseProject(JSON.stringify({ ...emptyProject('Anubis'), interiorBoundaryVersion: {} }))).toThrow('boundary version')
        const mirage = mergeMapLibrary(emptyProject('Mirage'))
        expect(mirage.interiorBoundaryVersion).toBeUndefined()
        expect(mirage.marks.some(mark => mark.id.startsWith('interior:'))).toBe(false)
    })
    it('keeps every new line outside native walkable polygons at all heights', () => {
        const ref = read('public/map-studio/spatial/Anubis.json') as SpatialReference
        const registration = read('public/map-studio/registration.json').maps.find((r: { mapId: string }) => r.mapId === 'Anubis').registration as MapRegistration
        const polygons = ref.areas.map(area => {
            const points = area.corners.map(p => sourceRadarPoint(p, ref, registration))
            return { points, minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)), minY: Math.min(...points.map(p => p.y)), maxY: Math.max(...points.map(p => p.y)) }
        })
        const cross = (a: MapPoint, b: MapPoint, c: MapPoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
        const inside = (p: MapPoint, poly: MapPoint[]) => {
            let hit = false
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                const a = poly[i], b = poly[j]
                if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) hit = !hit
            }
            return hit
        }
        const crossings: string[] = []
        for (const mark of marks) for (let i = 1; i < mark.points.length; i++) {
            const a = mark.points[i - 1], b = mark.points[i]
            for (const poly of polygons) {
                if (Math.max(a.x, b.x) < poly.minX || Math.min(a.x, b.x) > poly.maxX || Math.max(a.y, b.y) < poly.minY || Math.min(a.y, b.y) > poly.maxY) continue
                if (inside(a, poly.points) || inside(b, poly.points)) crossings.push(mark.id)
                for (let j = 0; j < poly.points.length; j++) {
                    const c = poly.points[j], d = poly.points[(j + 1) % poly.points.length]
                    if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) crossings.push(mark.id)
                }
            }
        }
        expect(crossings).toEqual([])
    })
})
