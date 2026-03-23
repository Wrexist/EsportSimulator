import { MapId, MatchEvent } from "@/types"
import { computeRadarPositions } from "@/lib/radar-position-engine"
import { isWalkable } from "@/lib/radar-nav"

function buildPlayers(prefix: string, count: number) {
  return Array.from({ length: count }, (_, idx) => ({
    id: `${prefix}${idx + 1}`,
    nickname: `${prefix.toUpperCase()}${idx + 1}`,
    isDead: false,
    money: 3000 + idx * 500,
  }))
}

describe("radar-position-engine", () => {
  const activeMaps: MapId[] = [
    MapId.DUST2,
    MapId.MIRAGE,
    MapId.INFERNO,
    MapId.NUKE,
    MapId.OVERPASS,
    MapId.VERTIGO,
    MapId.ANCIENT,
    MapId.ANUBIS,
  ]

  function createReferenceEvents(): MatchEvent[] {
    return [
      { type: "KILL", time: 16, playerId: "h1", killerId: "h1", victimId: "a1", weapon: "ak47" },
      { type: "KILL", time: 24, playerId: "a2", killerId: "a2", victimId: "h2", weapon: "m4a1s" },
      { type: "PLANT", time: 35, playerId: "h3", details: "Bomb planted on B site" },
      { type: "ROUND_END", time: 55 }
    ]
  }

  it("handles over-5-player input without NaN or out-of-bounds dots", () => {
    const homePlayers = buildPlayers("h", 7)
    const awayPlayers = buildPlayers("a", 7)
    const events: MatchEvent[] = [
      { type: "KILL", time: 20, playerId: "h1", killerId: "h1", victimId: "a1", weapon: "ak47" },
      { type: "ROUND_END", time: 45 }
    ]

    const result = computeRadarPositions(
      MapId.MIRAGE,
      25,
      events,
      homePlayers,
      awayPlayers,
      true,
      5,
      1337
    )

    expect(result.dots.length).toBeGreaterThan(0)
    for (const dot of result.dots) {
      expect(Number.isFinite(dot.x)).toBe(true)
      expect(Number.isFinite(dot.y)).toBe(true)
      expect(Number.isFinite(dot.angle)).toBe(true)
      expect(dot.x).toBeGreaterThanOrEqual(0)
      expect(dot.x).toBeLessThanOrEqual(100)
      expect(dot.y).toBeGreaterThanOrEqual(0)
      expect(dot.y).toBeLessThanOrEqual(100)
    }
  })

  it("filters implausible cross-map kill lines by weapon range", () => {
    const homePlayers = buildPlayers("h", 5)
    const awayPlayers = buildPlayers("a", 5)
    const events: MatchEvent[] = [
      { type: "KILL", time: 2, playerId: "h1", killerId: "h1", victimId: "a1", weapon: "knife" },
      { type: "ROUND_END", time: 60 }
    ]

    const result = computeRadarPositions(
      MapId.DUST2,
      2.25,
      events,
      homePlayers,
      awayPlayers,
      true,
      1,
      2026
    )

    expect(result.killLines.length).toBe(0)
  })

  it("emits finite, clamped kill lines with level metadata on dual-level maps", () => {
    const homePlayers = buildPlayers("h", 5)
    const awayPlayers = buildPlayers("a", 5)
    const events: MatchEvent[] = [
      { type: "KILL", time: 20, playerId: "h1", killerId: "h1", victimId: "a1", weapon: "awp", isHeadshot: true },
      { type: "ROUND_END", time: 45 }
    ]

    const result = computeRadarPositions(
      MapId.NUKE,
      20.5,
      events,
      homePlayers,
      awayPlayers,
      true,
      4,
      999
    )

    expect(result.killLines.length).toBeGreaterThan(0)
    for (const line of result.killLines) {
      expect(Number.isFinite(line.fromX)).toBe(true)
      expect(Number.isFinite(line.fromY)).toBe(true)
      expect(Number.isFinite(line.toX)).toBe(true)
      expect(Number.isFinite(line.toY)).toBe(true)
      expect(line.fromX).toBeGreaterThanOrEqual(0)
      expect(line.fromX).toBeLessThanOrEqual(100)
      expect(line.toX).toBeGreaterThanOrEqual(0)
      expect(line.toX).toBeLessThanOrEqual(100)
      expect(line.level === undefined || line.level === "upper" || line.level === "lower").toBe(true)
    }

    const nanTimeResult = computeRadarPositions(
      MapId.NUKE,
      Number.NaN,
      [],
      homePlayers,
      awayPlayers,
      true,
      1,
      55
    )
    nanTimeResult.dots.forEach(dot => {
      expect(Number.isFinite(dot.x)).toBe(true)
      expect(Number.isFinite(dot.y)).toBe(true)
    })
  })

  it("keeps generated dots on walkable radar areas across maps and times", () => {
    const homePlayers = buildPlayers("h", 5)
    const awayPlayers = buildPlayers("a", 5)
    const events = createReferenceEvents()

    for (const mapId of activeMaps) {
      for (let second = 0; second <= 55; second++) {
        const result = computeRadarPositions(
          mapId,
          second,
          events,
          homePlayers,
          awayPlayers,
          true,
          3,
          8080
        )

        for (const dot of result.dots) {
          const level = dot.level || "upper"
          expect(isWalkable(mapId, level, { x: dot.x, y: dot.y })).toBe(true)
        }
      }
    }
  })

  it("limits per-second alive-player movement jumps for smoother radar motion", () => {
    const homePlayers = buildPlayers("h", 5)
    const awayPlayers = buildPlayers("a", 5)
    const events = createReferenceEvents()

    for (const mapId of activeMaps) {
      const previousById = new Map<string, { x: number; y: number; alive: boolean }>()

      for (let second = 0; second <= 55; second++) {
        const result = computeRadarPositions(
          mapId,
          second,
          events,
          homePlayers,
          awayPlayers,
          true,
          2,
          1010
        )

        const currentById = new Map<string, { x: number; y: number; alive: boolean }>()
        for (const dot of result.dots) {
          currentById.set(dot.playerId, { x: dot.x, y: dot.y, alive: dot.isAlive })
          const previous = previousById.get(dot.playerId)
          if (!previous) continue
          if (!previous.alive || !dot.isAlive) continue

          const jump = Math.hypot(dot.x - previous.x, dot.y - previous.y)
          expect(jump).toBeLessThanOrEqual(14)
        }

        previousById.clear()
        currentById.forEach((value, key) => previousById.set(key, value))
      }
    }
  })
})
