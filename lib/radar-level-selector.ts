import type { RadarBombState, RadarKillLine, RadarPlayerDot } from "@/lib/radar-position-engine"

type RadarLevel = "upper" | "lower"

interface ResolveRadarLevelInput {
    isDualLevel: boolean
    currentLevel: RadarLevel
    currentTime?: number
    bombState?: RadarBombState
    killLines?: RadarKillLine[]
    radarDots?: RadarPlayerDot[]
}

export function resolveAutoRadarLevel(input: ResolveRadarLevelInput): RadarLevel {
    if (!input.isDualLevel) return "upper"

    if (
        input.bombState?.planted
        && !input.bombState.defused
        && !input.bombState.exploded
        && input.bombState.level
    ) {
        return input.bombState.level
    }

    const now = typeof input.currentTime === "number" ? input.currentTime : undefined
    const recentKillLines = (input.killLines || [])
        .filter(line => !!line.level)
        .filter(line => (now == null ? true : now - line.time <= 2))
        .sort((a, b) => b.time - a.time)

    if (recentKillLines.length > 0 && recentKillLines[0].level) {
        return recentKillLines[0].level
    }

    let upperAlive = 0
    let lowerAlive = 0
    for (const dot of input.radarDots || []) {
        if (!dot.isAlive || !dot.level) continue
        if (dot.level === "lower") lowerAlive++
        else upperAlive++
    }

    if (lowerAlive > upperAlive) return "lower"
    if (upperAlive > lowerAlive) return "upper"
    return input.currentLevel
}
