import { MapId } from "@/types"
import { getRadarNav, isWalkable, projectToWalkable } from "@/lib/radar-nav"

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

describe("radar-nav", () => {
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
