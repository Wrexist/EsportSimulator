import { layoutRadarLabels } from '@/lib/radar-label-layout'
import type { RadarPlayerDot } from '@/lib/radar-position-engine'

const dots: RadarPlayerDot[] = Array.from({ length: 10 }, (_, i) => ({ playerId: `p${i}`, nickname: `Player${i}`, side: i < 5 ? 'ct' : 't', isAlive: true, angle: 0, x: 48 + i % 3, y: 48 + Math.floor(i / 3) }))

test('crowded spawn names remain distinct without moving markers', () => {
    const before = structuredClone(dots), labels = [...layoutRadarLabels(dots).values()]
    expect(labels).toHaveLength(10)
    expect(dots).toEqual(before)
    for (const [i, a] of labels.entries()) for (const b of labels.slice(i + 1)) {
        expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y).toBe(false)
    }
    expect([...layoutRadarLabels([...dots].reverse())]).toEqual([...layoutRadarLabels(dots)])
})

test('edge labels stay on the radar and dead markers have no nameplate', () => {
    const edge = dots.map((d, i) => ({ ...d, x: i % 2 ? 100 : 0, y: i < 5 ? 0 : 100 }))
    const labels = layoutRadarLabels([...edge, { ...dots[0], playerId: 'dead', isAlive: false }])
    expect(labels.has('dead')).toBe(false)
    expect(labels.size).toBeGreaterThan(0)
    for (const label of labels.values()) {
        expect(label.x).toBeGreaterThanOrEqual(0); expect(label.x + label.width).toBeLessThanOrEqual(100)
        expect(label.y).toBeGreaterThanOrEqual(0); expect(label.y + label.height).toBeLessThanOrEqual(100)
    }
})
