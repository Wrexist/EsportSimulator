/**
 * Shapes the radar panel accepts.
 *
 * - Snapshot mode: precomputed frames (the physical replay rehearsal, unit
 *   tests) — `RadarPlayerDot`, `RadarKillLine`, `RadarBombState`, `RadarSmoke`.
 * - Script mode: the live match hands over a round script
 *   (engine/match/round-script-types.ts) and the radar samples it itself.
 *
 * Coordinates are radar percent space (0–100, origin top-left).
 */

export type RadarLevel = "upper" | "lower"

export interface Point {
    x: number
    y: number
}

export interface RadarPlayerDot {
    playerId: string
    nickname: string
    x: number
    y: number
    side: "ct" | "t"
    isAlive: boolean
    deathTime?: number
    level?: RadarLevel
    angle: number
    money?: number
    /** Optional extras the canvas draws when present. */
    hp?: number
    weapon?: string
    hasBomb?: boolean
    hasKit?: boolean
}

export interface RadarKillLine {
    fromX: number
    fromY: number
    toX: number
    toY: number
    time: number
    isHeadshot: boolean
    weapon?: string
    level?: RadarLevel
}

export interface RadarBombState {
    planted: boolean
    position?: Point
    exploded: boolean
    defused: boolean
    defuseTime?: number
    defuseProgress?: number
    level?: RadarLevel
}

export interface RadarSmoke {
    x: number
    y: number
    radius: number
    startTime: number
    endTime: number
    level?: RadarLevel
}

/** Per-player display info for script mode, by player id. */
export interface RadarScriptPlayerInfo {
    name: string
    /** Cash (kept for callers; the canvas does not draw an economy ring). */
    money?: number
    /** Primary weapon id this round ("ak47", "awp", "usp_s", …): picks the weapon glyph. */
    weapon?: string
    /** CT defuse kit this round. */
    hasKit?: boolean
}

/** Radar base art for one map, in the radar percent frame (0–100 = image edges). */
export interface RadarArt {
    upper: string
    lower?: string
}
