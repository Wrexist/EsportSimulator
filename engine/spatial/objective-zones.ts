import type { Vec3 } from './types'
export interface PlantZonePiece { points: Vec3[]; zMin: number; zMax: number }
export interface PlantZone extends PlantZonePiece { pieces?: PlantZonePiece[] }
export function inPlantZone(point: Vec3, zone: PlantZone): boolean {
    return [zone, ...(zone.pieces || [])].some(piece => inPlantPiece(point, piece))
}
export function inPlantPiece(point: Vec3, zone: PlantZonePiece): boolean {
    if (point[2] < zone.zMin || point[2] > zone.zMax) return false
    let inside = false
    for (let i = 0, j = zone.points.length - 1; i < zone.points.length; j = i++) {
        const a = zone.points[i], b = zone.points[j]
        if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
    }
    return inside
}
