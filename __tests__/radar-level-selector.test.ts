import { sceneAutoFloor } from "@/lib/radar-level-selector"
import { createRadarScene, sceneFromSnapshot } from "@/lib/radar-scene"
import type { RadarBombState, RadarKillLine, RadarPlayerDot } from "@/lib/radar-types"

const noBomb: RadarBombState = { planted: false, exploded: false, defused: false }

function scene(t: number, opts: { dots?: RadarPlayerDot[]; killLines?: RadarKillLine[]; bomb?: RadarBombState }) {
  return sceneFromSnapshot({ t, dots: opts.dots ?? [], killLines: opts.killLines ?? [], bomb: opts.bomb ?? noBomb }, createRadarScene())
}

describe("radar-level-selector", () => {
  it("prioritizes planted bomb level", () => {
    const s = scene(40, { bomb: { planted: true, exploded: false, defused: false, level: "lower", position: { x: 50, y: 50 } } })
    expect(sceneAutoFloor(s, "upper", true)).toBe("lower")
  })

  it("uses recent kill-line level when bomb is not active", () => {
    const s = scene(30.5, {
      killLines: [
        { fromX: 10, fromY: 10, toX: 20, toY: 20, time: 20, isHeadshot: false, level: "upper" },
        { fromX: 10, fromY: 10, toX: 20, toY: 20, time: 29.8, isHeadshot: false, level: "lower" },
      ],
    })
    expect(sceneAutoFloor(s, "upper", true)).toBe("lower")
  })

  it("uses a fresh death marker's floor", () => {
    const s = scene(12, { dots: [{ playerId: "d", nickname: "D", x: 10, y: 10, side: "t", isAlive: false, deathTime: 11, level: "lower", angle: 0 }] })
    expect(sceneAutoFloor(s, "upper", true)).toBe("lower")
    const later = scene(20, { dots: [{ playerId: "d", nickname: "D", x: 10, y: 10, side: "t", isAlive: false, deathTime: 11, level: "lower", angle: 0 }] })
    expect(sceneAutoFloor(later, "upper", true)).toBe("upper")
  })

  it("falls back to a clear alive-player majority when there is no bomb or recent kill line", () => {
    const dot = (id: string, level: "upper" | "lower"): RadarPlayerDot => ({ playerId: id, nickname: id, x: 10, y: 10, side: "ct", isAlive: true, level, angle: 0 })
    // Two more on the other floor: switch.
    expect(sceneAutoFloor(scene(50, { dots: [dot("a", "lower"), dot("b", "lower"), dot("c", "lower"), dot("d", "upper")] }), "upper", true)).toBe("lower")
    // One more (a player on the stairs): stay, so the view does not flicker.
    expect(sceneAutoFloor(scene(50, { dots: [dot("a", "lower"), dot("b", "lower"), dot("c", "upper")] }), "upper", true)).toBe("upper")
    // Nobody left on the shown floor: switch.
    expect(sceneAutoFloor(scene(50, { dots: [dot("a", "lower")] }), "upper", true)).toBe("lower")
  })

  it("keeps the current floor on a tie", () => {
    const s = scene(50, {
      dots: [
        { playerId: "a", nickname: "A", x: 10, y: 10, side: "ct", isAlive: true, level: "lower", angle: 0 },
        { playerId: "c", nickname: "C", x: 10, y: 10, side: "t", isAlive: true, level: "upper", angle: 0 },
      ],
    })
    expect(sceneAutoFloor(s, "lower", true)).toBe("lower")
    expect(sceneAutoFloor(s, "upper", true)).toBe("upper")
  })

  it("returns upper for single-level maps", () => {
    const s = scene(10, { bomb: { planted: true, exploded: false, defused: false, level: "lower", position: { x: 50, y: 50 } } })
    expect(sceneAutoFloor(s, "lower", false)).toBe("upper")
  })
})
