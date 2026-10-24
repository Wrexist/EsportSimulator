import type { RadarScene } from "@/lib/radar-scene"

type RadarLevel = "upper" | "lower"

/** Seconds a kill keeps the radar on its floor. */
const RECENT_KILL_SECONDS = 2
/** Living players the other floor needs beyond the shown one before "auto" switches to it. */
const FLOOR_MAJORITY = 2

/**
 * Floor a two-level radar should show in "auto": the bomb's floor while it is
 * being planted / planted / defused, else the floor of the most recent kill
 * (within 2 s) or of a duel being fought, else where clearly more living
 * players are (two more than on the shown floor, so one player on the stairs
 * does not flip the view back and forth, or everyone left); otherwise the
 * current floor. Single-level maps always show "upper". Reads a sampled
 * scene, so it works the same for round scripts and snapshots, and allocates nothing.
 */
export function sceneAutoFloor(scene: RadarScene, current: RadarLevel, dualLevel: boolean): RadarLevel {
    if (!dualLevel) return "upper"
    const bomb = scene.bomb
    if (bomb.hasPos && (bomb.phase === "planting" || bomb.phase === "planted" || bomb.phase === "defusing")) return bomb.floor

    let recentAge = Infinity
    let recentFloor: RadarLevel | null = null
    for (let i = 0; i < scene.deathCount; i++) {
        const d = scene.deaths[i]
        if (d.age <= RECENT_KILL_SECONDS && d.age < recentAge) { recentAge = d.age; recentFloor = d.floor }
    }
    for (let i = 0; i < scene.tracerCount; i++) {
        const tr = scene.tracers[i]
        if (tr.age <= RECENT_KILL_SECONDS && tr.age < recentAge) { recentAge = tr.age; recentFloor = tr.floor }
    }
    if (recentFloor) return recentFloor
    if (scene.shotCount > 0) return scene.shots[0].floor

    let upper = 0
    let lower = 0
    for (let i = 0; i < scene.playerCount; i++) {
        const p = scene.players[i]
        if (!p.alive) continue
        if (p.floor === "lower") lower++
        else upper++
    }
    const shown = current === "upper" ? upper : lower
    const other = current === "upper" ? lower : upper
    if (other > 0 && (shown === 0 || other >= shown + FLOOR_MAJORITY)) return current === "upper" ? "lower" : "upper"
    return current
}
