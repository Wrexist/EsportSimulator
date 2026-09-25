export type Vec3 = [number, number, number]
export interface NavArea { id: number; hull: number; flags: string; movable: number; corners: Vec3[]; edges: { target: number; edge: number; targetEdge: number }[]; laddersAbove: number[]; laddersBelow: number[] }
export interface NavLadder { id: number; width: number; top: Vec3; bottom: Vec3; topAreas: number[]; bottomAreas: number[] }
export interface SpatialReference {
    format: "esim-spatial-reference"; version: 1; mapId: string; sourceMap: string; sourceVersion: string; sourceUrl: string; meshSha256: string
    transform: { pos_x: number; pos_y: number; scale: number; rotate?: number | null; zoom?: number | null; verticalsections?: Record<string, { AltitudeMin: string; AltitudeMax: string }> }
    radars: { upper: string; lower?: string }; areas: NavArea[]; ladders: NavLadder[]
}
export const distance3 = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
export const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
export const center = (area: NavArea): Vec3 => {
    const p = [0, 1, 2].map(axis => area.corners.reduce((sum, point) => sum + point[axis], 0) / area.corners.length) as Vec3
    p[2] = surfaceHeight(area, p[0], p[1]) ?? p[2]
    return p
}
// Source overview coordinates are defined on a 1024-pixel square, irrespective of PNG resolution.
export const toRadar = (p: Vec3, ref: SpatialReference): [number, number] => [(p[0] - ref.transform.pos_x) / (ref.transform.scale * 10.24), (ref.transform.pos_y - p[1]) / (ref.transform.scale * 10.24)]
export const fromRadar = (x: number, y: number, ref: SpatialReference): Vec3 => [ref.transform.pos_x + x * ref.transform.scale * 10.24, ref.transform.pos_y - y * ref.transform.scale * 10.24, 0]

/** Resolve actual polygon height, including slopes, without selecting another floor. */
export function surfaceHeight(area: NavArea, x: number, y: number): number | null {
    const a = area.corners[0]
    for (let i = 1; i < area.corners.length - 1; i++) {
        const b = area.corners[i], c = area.corners[i + 1]
        const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if (Math.abs(den) < 1e-8) continue
        const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / den
        const v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / den
        if (u >= -1e-5 && v >= -1e-5 && u + v <= 1.00001) return u * a[2] + v * b[2] + (1 - u - v) * c[2]
    }
    return null
}
