import type { MapPoint } from './map-annotations'

/** Blank, non-finite or out-of-map coordinates must never silently become (0, 0). */
export function parseMapCoordinates(x: string, y: string): MapPoint | null {
    if (!x.trim() || !y.trim()) return null
    const point = { x: Number(x), y: Number(y) }
    return [point.x, point.y].every(value => Number.isFinite(value) && value >= 0 && value <= 100) ? point : null
}
