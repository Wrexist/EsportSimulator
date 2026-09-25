import { MapId } from "@/types"
import { findRadarRoute, getRadarNav, isWalkable, isRadarSegmentWalkable, projectToWalkable } from "@/lib/radar-nav"
import { MAP_LAYOUTS } from '@/lib/map-radar-data'

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

describe("radar-nav", () => {
  it('routes around the Anubis interior instead of steering through it', () => {
    const layout = MAP_LAYOUTS[MapId.ANUBIS]
    const from = projectToWalkable(MapId.ANUBIS, 'upper', layout.tSpawn[0])
    const to = projectToWalkable(MapId.ANUBIS, 'upper', layout.aSite)
    expect(isRadarSegmentWalkable(MapId.ANUBIS, 'upper', from, to)).toBe(false)
    const route = findRadarRoute(MapId.ANUBIS, 'upper', from, to)
    expect(route.length).toBeGreaterThan(1)
    expect(route.at(-1)).toEqual(to)
    let previous = from
    for (const p of route) { expect(isRadarSegmentWalkable(MapId.ANUBIS, 'upper', previous, p)).toBe(true); previous = p }
    const expected = structuredClone(route)
    route[0].x = -1; route.shift()
    expect(findRadarRoute(MapId.ANUBIS, 'upper', from, to)).toEqual(expected)
    expect(findRadarRoute(MapId.ANUBIS, 'upper', { x: NaN, y: 0 }, to)).toEqual([])
    expect(findRadarRoute(MapId.ANUBIS, 'upper', { x: 0, y: 0 }, to)).toEqual([])
  })
  it("rejects a wall between two clear endpoints in both directions", () => {
    const nav = getRadarNav(MapId.MIRAGE, "upper")!
    let checked = false
    for (let y = 0; y < nav.gridSize && !checked; y++) {
      let start = -1, crossedWall = false
      for (let x = 0; x < nav.gridSize; x++) {
        if (nav.walkableMask[y * nav.gridSize + x]) {
          if (start >= 0 && crossedWall) {
            const a = { x: start / (nav.gridSize - 1) * 100, y: y / (nav.gridSize - 1) * 100 }
            const b = { ...a, x: x / (nav.gridSize - 1) * 100 }
            expect(isWalkable(MapId.MIRAGE, "upper", a)).toBe(true)
            expect(isWalkable(MapId.MIRAGE, "upper", b)).toBe(true)
            expect(isRadarSegmentWalkable(MapId.MIRAGE, "upper", a, b)).toBe(false)
            expect(isRadarSegmentWalkable(MapId.MIRAGE, "upper", b, a)).toBe(false)
            expect(isRadarSegmentWalkable(MapId.MIRAGE, "upper", a, a)).toBe(true)
            checked = true; break
          }
          start = x
        } else if (start >= 0) crossedWall = true
      }
    }
    expect(checked).toBe(true)
  })

  it("rejects invalid or out-of-map movement instead of clamping it into the map", () => {
    const p = projectToWalkable(MapId.MIRAGE, "upper", { x: 50, y: 50 })
    for (const x of [-1, 101, NaN, Infinity]) expect(isRadarSegmentWalkable(MapId.MIRAGE, "upper", p, { x, y: p.y })).toBe(false)
  })
  it("loads nav data for every active map and level", () => {
    for (const mapId of Object.values(MapId)) {
      const upper = getRadarNav(mapId, "upper")
      expect(upper).toBeDefined()
      expect(upper?.gridSize).toBeGreaterThan(0)
      if (mapId === MapId.NUKE || mapId === MapId.VERTIGO) {
        const lower = getRadarNav(mapId, "lower")
        expect(lower).toBeDefined()
        expect(lower?.gridSize).toBe(upper?.gridSize)
      }
    }
  })

  it("projects arbitrary coordinates to bounded walkable coordinates and is idempotent", () => {
    const samples = [
      { x: -40, y: -10 },
      { x: 0, y: 0 },
      { x: 23.4, y: 88.2 },
      { x: 50, y: 50 },
      { x: 99.9, y: 99.9 },
      { x: 140, y: 190 },
    ]

    for (const mapId of Object.values(MapId)) {
      const levels: Array<"upper" | "lower"> = mapId === MapId.NUKE || mapId === MapId.VERTIGO
        ? ["upper", "lower"]
        : ["upper"]

      for (const level of levels) {
        for (const sample of samples) {
          const projected = projectToWalkable(mapId, level, sample)
          expect(projected.x).toBeGreaterThanOrEqual(0)
          expect(projected.x).toBeLessThanOrEqual(100)
          expect(projected.y).toBeGreaterThanOrEqual(0)
          expect(projected.y).toBeLessThanOrEqual(100)
          expect(isWalkable(mapId, level, projected)).toBe(true)

          const projectedAgain = projectToWalkable(mapId, level, projected)
          expect(dist(projected, projectedAgain)).toBeLessThanOrEqual(0.8)
        }
      }
    }
  })
})
