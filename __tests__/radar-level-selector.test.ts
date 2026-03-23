import { resolveAutoRadarLevel } from "@/lib/radar-level-selector"

describe("radar-level-selector", () => {
  it("prioritizes planted bomb level", () => {
    const level = resolveAutoRadarLevel({
      isDualLevel: true,
      currentLevel: "upper",
      currentTime: 40,
      bombState: {
        planted: true,
        exploded: false,
        defused: false,
        level: "lower",
      },
      killLines: [],
      radarDots: [],
    })
    expect(level).toBe("lower")
  })

  it("uses recent kill-line level when bomb is not active", () => {
    const level = resolveAutoRadarLevel({
      isDualLevel: true,
      currentLevel: "upper",
      currentTime: 30.5,
      bombState: {
        planted: false,
        exploded: false,
        defused: false,
      },
      killLines: [
        { fromX: 10, fromY: 10, toX: 20, toY: 20, time: 20, isHeadshot: false, level: "upper" },
        { fromX: 10, fromY: 10, toX: 20, toY: 20, time: 29.8, isHeadshot: false, level: "lower" },
      ],
      radarDots: [],
    })
    expect(level).toBe("lower")
  })

  it("falls back to alive player majority when there is no bomb or recent kill line", () => {
    const level = resolveAutoRadarLevel({
      isDualLevel: true,
      currentLevel: "upper",
      currentTime: 50,
      bombState: {
        planted: false,
        exploded: false,
        defused: false,
      },
      killLines: [],
      radarDots: [
        { playerId: "a", nickname: "A", x: 10, y: 10, side: "ct", isAlive: true, level: "lower", angle: 0 },
        { playerId: "b", nickname: "B", x: 10, y: 10, side: "ct", isAlive: true, level: "lower", angle: 0 },
        { playerId: "c", nickname: "C", x: 10, y: 10, side: "t", isAlive: true, level: "upper", angle: 0 },
      ],
    })
    expect(level).toBe("lower")
  })

  it("returns upper for single-level maps", () => {
    const level = resolveAutoRadarLevel({
      isDualLevel: false,
      currentLevel: "lower",
      currentTime: 10,
      bombState: {
        planted: true,
        exploded: false,
        defused: false,
        level: "lower",
      },
      killLines: [],
      radarDots: [],
    })
    expect(level).toBe("upper")
  })
})
