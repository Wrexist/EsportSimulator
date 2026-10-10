/**
 * Snapshot shapes the radar panel draws when it is fed precomputed frames
 * (the physical replay rehearsal, unit tests). The live match feeds the panel
 * a round script instead (engine/match/round-script-types.ts).
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
