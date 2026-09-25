import { selectSpawnPositions } from '@/engine/spatial/spawn-layout'
import type { NavLocation } from '@/engine/spatial/navigation'
const p = (x: number, y = 0, z = 0): NavLocation => ({ area: 1, point: [x, y, z] })

test('selects five detached, spaced positions from supplied clear samples', () => {
    const samples = Array.from({ length: 10 }, (_, i) => p(i * 20))
    const before = JSON.stringify(samples), result = selectSpawnPositions(samples)
    expect(result).toHaveLength(5)
    for (const [i, a] of result.entries()) for (const b of result.slice(i + 1)) expect(Math.hypot(a.point[0] - b.point[0], a.point[1] - b.point[1])).toBeGreaterThanOrEqual(32)
    expect(selectSpawnPositions(samples)).toEqual(result)
    result[0].point[0] = 999
    expect(JSON.stringify(samples)).toBe(before)
})
test('never fills a small spawn with overlapping or invented positions', () => {
    expect(selectSpawnPositions([p(0), p(0), p(10), p(20)])).toHaveLength(1)
    expect(selectSpawnPositions([])).toEqual([])
    expect(selectSpawnPositions([p(0), p(32)])).toHaveLength(2)
    expect(() => selectSpawnPositions([], 6)).toThrow()
})
