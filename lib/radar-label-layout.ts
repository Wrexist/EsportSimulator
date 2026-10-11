import type { RadarPlayerDot } from "./radar-types"

export interface RadarLabel { x: number; y: number; width: number; height: number; text: string }

/** Nameplate metrics in radar units (the default space is the 100 x 100 radar frame). */
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
const DIRECTIONS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, 1], [-1, -1], [1, 1]]

/** Where and how labels are laid out; the defaults are the radar-percent metrics above. */
export interface LabelLayoutOptions {
    /** Full label width for a text (overrides the per-character estimate and padding). */
    measure?: (text: string, playerId: string) => number
    height?: number
    /** Candidate gaps between dot centre and label edge, nearest first. */
    distances?: readonly number[]
    /** Labels stay inside this box. */
    bounds?: { minX: number; minY: number; maxX: number; maxY: number }
    /** Half size of the box kept free around every dot. */
    markerHalf?: number
    /** Minimum gap between boxes. */
    gap?: number
    /** Longer names are cut with an ellipsis; 0 keeps full names. */
    maxChars?: number
    uppercase?: boolean
}

export function radarLabelText(nickname: string | undefined, maxChars = MAX_LABEL_CHARS, uppercase = true): string {
    const raw = nickname || "PLAYER"
    const name = uppercase ? raw.toUpperCase() : raw
    return maxChars > 0 && name.length > maxChars ? `${name.slice(0, maxChars - 1)}…` : name
}

/**
 * Place names without moving world markers. Stable order keeps labels deterministic.
 * `preferred` holds each player's previous label offset from its dot; it is tried
 * first so labels don't flip sides from one layout to the next.
 */
export function layoutRadarLabels(
    dots: readonly RadarPlayerDot[],
    preferred?: Map<string, { dx: number; dy: number }>,
    options: LabelLayoutOptions = {},
): Map<string, RadarLabel> {
    const height = options.height ?? RADAR_LABEL_HEIGHT
    const distances = options.distances ?? LABEL_DISTANCES
    const bounds = options.bounds ?? { minX: 1, minY: 1, maxX: 99, maxY: 99 }
    const half = options.markerHalf ?? 2
    const gap = options.gap ?? 0.5
    const maxChars = options.maxChars ?? MAX_LABEL_CHARS
    const uppercase = options.uppercase ?? true

    const result = new Map<string, RadarLabel>()
    const live = dots.filter(d => d.isAlive && Number.isFinite(d.x) && Number.isFinite(d.y))
    const reserved: { x: number; y: number; width: number; height: number }[] = live.map(d => ({ x: d.x - half, y: d.y - half, width: half * 2, height: half * 2 }))
    const overlap = (a: RadarLabel, b: { x: number; y: number; width: number; height: number }) =>
        a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y
    const clampX = (x: number, width: number) => Math.max(bounds.minX, Math.min(bounds.maxX - width, x))
    const clampY = (y: number) => Math.max(bounds.minY, Math.min(bounds.maxY - height, y))

    for (const dot of [...live].sort((a, b) => a.playerId.localeCompare(b.playerId))) {
        const text = radarLabelText(dot.nickname, maxChars, uppercase)
        const width = options.measure ? options.measure(text, dot.playerId) : text.length * LABEL_CHAR_WIDTH + LABEL_PAD_X * 2
        const prev = preferred?.get(dot.playerId)
        if (prev) {
            const label = { x: dot.x + prev.dx, y: dot.y + prev.dy, width, height, text }
            const inBounds = label.x >= bounds.minX && label.x <= bounds.maxX - width && label.y >= bounds.minY && label.y <= bounds.maxY - height
            if (inBounds && !reserved.some(box => overlap(label, box))) {
                result.set(dot.playerId, label); reserved.push(label); continue
            }
        }
        let placed = false
        for (const distance of distances) {
            for (const [dx, dy] of DIRECTIONS) {
                const label = {
                    x: clampX(dot.x + dx * distance - (dx < 0 ? width : dx === 0 ? width / 2 : 0), width),
                    y: clampY(dot.y + dy * distance - (dy < 0 ? height : dy === 0 ? height / 2 : 0)), width, height, text,
                }
                if (reserved.some(box => overlap(label, box))) continue
                result.set(dot.playerId, label); reserved.push(label); placed = true; break
            }
            if (placed) break
        }
    }
    return result
}
