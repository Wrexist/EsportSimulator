import { toRadar, type SpatialReference, type Vec3 } from '../../engine/spatial/types'
import type { MapRegistration } from '../../engine/spatial/registration'
import type { MapFloor, MapPoint } from '../../lib/map-annotations'

export interface NativeEntity {
    id: string; classname: string; origin: Vec3; angles: Vec3; scales: Vec3
    enabled: boolean; priority: number; site?: 'A' | 'B'; model?: string
}

/** Read flat values records emitted by VRF's DATA formatter, never arbitrary executable content. */
export function parseNativeEntities(text: string): NativeEntity[] {
    const records: NativeEntity[] = []
    for (const match of text.matchAll(/values\s*=\s*\{([^{}]*)\}/g)) {
        const block = match[1]
        const string = (key: string) => new RegExp(`\\b${key}\\s*=\\s*(?:resource_name:)?"([^"]+)"`).exec(block)?.[1]
        const classname = string('classname')
        if (!['info_player_counterterrorist', 'info_player_terrorist', 'func_bomb_target'].includes(classname || '')) continue
        const vector = (key: string): Vec3 => {
            const value = new RegExp(`\\b${key}\\s*=\\s*\\[([^\\]]+)\\]`).exec(block)?.[1].split(',').map(Number)
            if (!value || value.length !== 3 || !value.every(Number.isFinite)) throw Error(`Missing or invalid native ${key}`)
            return value as Vec3
        }
        const id = string('hammerUniqueId')
        if (!id) throw Error('Native entity has no stable source ID')
        const isSite = classname === 'func_bomb_target'
        const designation = string('bomb_site_designation')
        if (isSite && !['0', '1'].includes(designation || '')) throw Error('Unknown native bombsite designation')
        const enabled = /\benabled\s*=\s*(true|false|0|1)\b/.exec(block)?.[1]
        if (!isSite && enabled === undefined) throw Error('Spawn enabled state missing')
        records.push({ id, classname: classname!, origin: vector('origin'), angles: vector('angles'), scales: vector('scales'),
            enabled: enabled === 'true' || enabled === '1', priority: Number(/\bpriority\s*=\s*(-?\d+)/.exec(block)?.[1] || 0),
            ...(isSite ? { site: designation === '0' ? 'A' : 'B', model: string('model') } : {}) })
    }
    if (new Set(records.map(record => record.id)).size !== records.length) throw Error('Duplicate native entity IDs')
    return records
}

export function worldVertices(vertices: Vec3[], entity: NativeEntity): Vec3[] {
    // Current maps use translations/scales. Fail closed for new rotations rather than guess Source Euler conventions.
    if (entity.angles.some(value => value !== 0)) throw Error('Rotated trigger needs a verified Source transform adapter')
    return vertices.map(vertex => vertex.map((value, axis) => value * entity.scales[axis] + entity.origin[axis]) as Vec3)
}

/** One convex hull at a time: combining hulls fills gaps that are not plantable. */
export function footprint(vertices: Vec3[]): Vec3[] {
    const points = [...new Map(vertices.map(point => [`${point[0]},${point[1]}`, point])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1])
    const cross = (o: Vec3, a: Vec3, b: Vec3) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    const half = (list: Vec3[]) => { const out: Vec3[] = []; for (const p of list) { while (out.length > 1 && cross(out.at(-2)!, out.at(-1)!, p) <= 0) out.pop(); out.push(p) } return out.slice(0, -1) }
    const result = half(points).concat(half([...points].reverse()))
    if (result.length < 3) throw Error('Degenerate native trigger footprint')
    return result
}

export function nativeFloor(zMin: number, zMax: number, ref: SpatialReference): MapFloor {
    if (!ref.radars.lower) return 'upper'
    const split = Number(ref.transform.verticalsections?.default.AltitudeMin)
    if (!Number.isFinite(split)) throw Error('Missing native floor split')
    if (zMin < split && zMax >= split) throw Error('Trigger crosses radar floor boundary; needs clipped projections')
    return zMax < split ? 'lower' : 'upper'
}

export function sourceRadarPoint(point: Vec3, ref: SpatialReference, registration: MapRegistration): MapPoint {
    const [x, y] = toRadar(point, ref), [a, b, c, d, e, f] = registration.matrix, det = a * e - b * d
    const result = { x: (e * (x - c) - b * (y - f)) / det, y: (a * (y - f) - d * (x - c)) / det }
    if (![result.x, result.y].every(value => Number.isFinite(value) && value >= 0 && value <= 100)) throw Error('Native coordinate outside registered radar')
    return result
}
