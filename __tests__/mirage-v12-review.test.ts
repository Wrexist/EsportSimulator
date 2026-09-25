import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { emptyProject, parseProject, type MapMark } from '@/lib/map-annotations'
import { openingIssues } from '@/engine/spatial/annotations'
import { parseLabProject } from '@/lib/spatial-lab-project'
import type { SpatialReference } from '@/engine/spatial/types'

const base = 'public/map-studio/reviews/mirage-v12/'
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
const bundle = JSON.parse(readFileSync(base + 'routes.json', 'utf8'))
const reference = JSON.parse(readFileSync('public/map-studio/spatial/Mirage.json', 'utf8')) as SpatialReference
const mark = (id: string, kind: MapMark['kind']): MapMark => ({ id, kind, label: '', note: '', points: [{ x: 10, y: 10 }, { x: 20, y: 10 }] })

test('opening review identifies conflicting types in either direction and excessive span without rewriting geometry', () => {
    const p = { ...emptyProject(), marks: [mark('blue', 'window'), { ...mark('green', 'passage'), points: [...mark('green', 'passage').points].reverse() }] }
    const before = JSON.stringify(p), issues = openingIssues(p)
    expect(issues.filter(i => i.code === 'opening-overlap')).toHaveLength(2)
    expect(issues.some(i => i.code === 'opening-description')).toBe(true)
    expect(issues.some(i => i.code === 'opening-height')).toBe(true)
    expect(issues.some(i => i.code === 'opening-length')).toBe(true)
    expect(JSON.stringify(p)).toBe(before)
})
test('a crossing wall is flagged while an intentional wall endpoint at an opening is allowed', () => {
    const window = mark('blue', 'window'), wall = { ...mark('wall', 'wall'), points: [{ x: 15, y: 5 }, { x: 15, y: 15 }] }
    expect(openingIssues({ ...emptyProject(), marks: [window, wall] }).some(i => i.code === 'opening-wall-overlap')).toBe(true)
    wall.points = [{ x: 10, y: 10 }, { x: 10, y: 0 }]
    expect(openingIssues({ ...emptyProject(), marks: [window, wall] }).some(i => i.code === 'opening-wall-overlap')).toBe(false)
})
test('the v12 attachment remains exact and all owner markings survive in the separate route copy', () => {
    const original = readFileSync('public/map-studio/drafts/mirage-user-v12-2026-09-13.json')
    expect(sha(original)).toBe('efc599edc2dcfd27d450e734d476ff94426c98bb2ef631e96ca09f63d91a8fe2')
    const p = parseProject(original.toString()), copy = parseProject(readFileSync('public/map-studio/drafts/mirage-v12-with-reference-routes.json', 'utf8'))
    expect(p.marks).toHaveLength(169)
    expect(copy.marks.slice(0, p.marks.length)).toEqual(p.marks)
    expect(copy.marks.slice(p.marks.length)).toHaveLength(10)
    expect(copy.validation).toBeUndefined() // revalidate under the current spawn-capacity model
    expect(bundle.release).toBe('held')
    expect(bundle.sourceSha256).toBe(sha(original))
    expect(bundle.referenceSha256).toBe(sha(readFileSync('public/map-studio/spatial/Mirage.json')))
})
test.each(bundle.routes.map((r: { id: string }) => [r.id]))('generated %s keeps a portable height-aware lab fixture', (id: string) => {
    const entry = bundle.routes.find((r: { id: string }) => r.id === id)
    const lab = parseLabProject(readFileSync('public' + entry.lab, 'utf8'), reference)
    expect(entry.route.points[0]).toEqual(lab.a!.point)
    expect(entry.route.points.at(-1)).toEqual(lab.b!.point)
    expect(entry.route.kinds).toHaveLength(entry.route.points.length - 1)
    expect(entry.route.points.every((p: number[]) => p.length === 3 && p.every(Number.isFinite))).toBe(true)
    expect(entry.replaySha256).toMatch(/^[a-f0-9]{64}$/)
    expect(lab.annotations!.marks).toHaveLength(46)
})
