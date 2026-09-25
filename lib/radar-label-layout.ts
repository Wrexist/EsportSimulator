import type { RadarPlayerDot } from "./radar-position-engine"

export interface RadarLabel { x: number; y: number; width: number; height: number; text: string }
/** Place names without moving world markers. Stable order keeps labels deterministic. */
export function layoutRadarLabels(dots: RadarPlayerDot[]): Map<string, RadarLabel> {
    const result = new Map<string, RadarLabel>()
    const live = dots.filter(d => d.isAlive && Number.isFinite(d.x) && Number.isFinite(d.y))
    const reserved = live.map(d => ({ x: d.x - 2, y: d.y - 2, width: 4, height: 4 }))
    const overlap = (a: RadarLabel, b: { x: number; y: number; width: number; height: number }) =>
        a.x < b.x + b.width + .5 && a.x + a.width + .5 > b.x && a.y < b.y + b.height + .5 && a.y + a.height + .5 > b.y
    for (const dot of [...live].sort((a, b) => a.playerId.localeCompare(b.playerId))) {
        const text = (dot.nickname || "PLAYER").toUpperCase().slice(0, 6)
        const width = text.length * 1.65 + 1.6, height = 4.2
        for (const distance of [4, 8, 12, 16, 20]) {
            let found = false
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, 1], [-1, -1], [1, 1]]) {
                const label = {
                    x: Math.max(1, Math.min(99 - width, dot.x + dx * distance - (dx < 0 ? width : dx === 0 ? width / 2 : 0))),
                    y: Math.max(1, Math.min(99 - height, dot.y + dy * distance - height / 2)), width, height, text,
                }
                if (reserved.some(box => overlap(label, box))) continue
                result.set(dot.playerId, label); reserved.push(label); found = true; break
            }
            if (found) break
        }
    }
    return result
}
