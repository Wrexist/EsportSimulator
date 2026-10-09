import type { RadarPlayerDot } from "./radar-position-engine"

export interface RadarLabel { x: number; y: number; width: number; height: number; text: string }

/** Nameplate metrics in radar units (the overlay viewBox is 100 x 100). */
export const RADAR_LABEL_FONT_SIZE = 2.2
export const RADAR_LABEL_HEIGHT = 3.4
/** Text baseline offset from the label's top edge. */
export const RADAR_LABEL_BASELINE = 2.5
const LABEL_PAD_X = 0.7
/** Uppercase semibold sans averages ~0.62 em per glyph. */
const LABEL_CHAR_WIDTH = RADAR_LABEL_FONT_SIZE * 0.62
/** Full nicknames up to this length; longer ones are cut with an ellipsis. */
const MAX_LABEL_CHARS = 12
/** Candidate gaps between dot centre and label edge, nearest first (dots keep a 2-unit box). */
const LABEL_DISTANCES = [2.6, 4, 6, 9, 13, 18, 24]

function labelText(nickname: string | undefined): string {
    const name = (nickname || "PLAYER").toUpperCase()
    return name.length > MAX_LABEL_CHARS ? `${name.slice(0, MAX_LABEL_CHARS - 1)}…` : name
}

/**
 * Place names without moving world markers. Stable order keeps labels deterministic.
 * `preferred` holds each player's previous label offset from its dot; it is tried
 * first so labels don't flip sides from one tick to the next.
 */
export function layoutRadarLabels(dots: RadarPlayerDot[], preferred?: Map<string, { dx: number; dy: number }>): Map<string, RadarLabel> {
    const result = new Map<string, RadarLabel>()
    const live = dots.filter(d => d.isAlive && Number.isFinite(d.x) && Number.isFinite(d.y))
    const reserved = live.map(d => ({ x: d.x - 2, y: d.y - 2, width: 4, height: 4 }))
    const overlap = (a: RadarLabel, b: { x: number; y: number; width: number; height: number }) =>
        a.x < b.x + b.width + .5 && a.x + a.width + .5 > b.x && a.y < b.y + b.height + .5 && a.y + a.height + .5 > b.y
    for (const dot of [...live].sort((a, b) => a.playerId.localeCompare(b.playerId))) {
        const text = labelText(dot.nickname)
        const width = text.length * LABEL_CHAR_WIDTH + LABEL_PAD_X * 2, height = RADAR_LABEL_HEIGHT
        const prev = preferred?.get(dot.playerId)
        if (prev) {
            const label = { x: dot.x + prev.dx, y: dot.y + prev.dy, width, height, text }
            const inBounds = label.x >= 1 && label.x <= 99 - width && label.y >= 1 && label.y <= 99 - height
            if (inBounds && !reserved.some(box => overlap(label, box))) {
                result.set(dot.playerId, label); reserved.push(label); continue
            }
        }
        for (const distance of LABEL_DISTANCES) {
            let found = false
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, 1], [-1, -1], [1, 1]]) {
                const label = {
                    x: Math.max(1, Math.min(99 - width, dot.x + dx * distance - (dx < 0 ? width : dx === 0 ? width / 2 : 0))),
                    y: Math.max(1, Math.min(99 - height, dot.y + dy * distance - (dy < 0 ? height : dy === 0 ? height / 2 : 0))), width, height, text,
                }
                if (reserved.some(box => overlap(label, box))) continue
                result.set(dot.playerId, label); reserved.push(label); found = true; break
            }
            if (found) break
        }
    }
    return result
}
