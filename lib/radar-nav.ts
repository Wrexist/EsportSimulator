import radarNavData from "@/data/radar-nav-data.json"
import { MapId } from "@/types"
import type { Point } from "@/lib/map-radar-data"

type RadarLevel = "upper" | "lower"

interface RadarNavLevelRaw {
    gridSize: number
    walkableBitset: string
    nearestX: number[]
    nearestY: number[]
}

interface RadarNavRaw {
    version: number
    maps: Record<string, { upper: RadarNavLevelRaw; lower?: RadarNavLevelRaw }>
}

interface RadarNavLevelDecoded {
    gridSize: number
    walkableMask: Uint8Array
    nearestX: Uint8Array
    nearestY: Uint8Array
}

const RAW = radarNavData as RadarNavRaw
const CACHE = new Map<string, RadarNavLevelDecoded>()

function finite(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

function base64ToBytes(base64: string): Uint8Array {
    if (typeof atob === "function") {
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i)
        }
        return bytes
    }

    if (typeof Buffer !== "undefined") {
        return Uint8Array.from(Buffer.from(base64, "base64"))
    }

    throw new Error("No base64 decoder available in this runtime.")
}

function decodeWalkableMask(bitset: string, cells: number): Uint8Array {
    const bytes = base64ToBytes(bitset)
    const mask = new Uint8Array(cells)
    for (let idx = 0; idx < cells; idx++) {
        const bit = (bytes[idx >> 3] >> (idx & 7)) & 1
        mask[idx] = bit
    }
    return mask
}

function getRawLevel(mapId: MapId, level: RadarLevel): RadarNavLevelRaw | undefined {
    const mapData = RAW.maps[mapId]
    if (!mapData) return undefined
    if (level === "lower" && mapData.lower) return mapData.lower
    return mapData.upper
}

function decodeNavLevel(raw: RadarNavLevelRaw): RadarNavLevelDecoded {
    const gridSize = Math.max(2, Math.floor(finite(raw.gridSize, 128)))
    const cells = gridSize * gridSize
    const walkableMask = decodeWalkableMask(raw.walkableBitset, cells)
    const nearestX = new Uint8Array(cells)
    const nearestY = new Uint8Array(cells)

    for (let idx = 0; idx < cells; idx++) {
        nearestX[idx] = clamp(Math.floor(finite(raw.nearestX[idx], 0)), 0, gridSize - 1)
        nearestY[idx] = clamp(Math.floor(finite(raw.nearestY[idx], 0)), 0, gridSize - 1)
    }

    return {
        gridSize,
        walkableMask,
        nearestX,
        nearestY,
    }
}

export function getRadarNav(mapId: MapId, level: RadarLevel = "upper"): RadarNavLevelDecoded | undefined {
    const cacheKey = `${mapId}:${level}`
    const cached = CACHE.get(cacheKey)
    if (cached) return cached

    const raw = getRawLevel(mapId, level)
    if (!raw) return undefined

    const decoded = decodeNavLevel(raw)
    CACHE.set(cacheKey, decoded)
    return decoded
}

function pointToGrid(value: number, gridSize: number): number {
    const v = clamp(finite(value, 50), 0, 100)
    return clamp(Math.round((v / 100) * (gridSize - 1)), 0, gridSize - 1)
}

function gridToPoint(cell: number, gridSize: number): number {
    return (clamp(cell, 0, gridSize - 1) / (gridSize - 1)) * 100
}

export function isWalkable(mapId: MapId, level: RadarLevel, point: Point): boolean {
    const nav = getRadarNav(mapId, level)
    if (!nav) return true

    const gx = pointToGrid(point.x, nav.gridSize)
    const gy = pointToGrid(point.y, nav.gridSize)
    const idx = gy * nav.gridSize + gx
    return nav.walkableMask[idx] === 1
}

/** Supercover grid sweep: clear endpoints do not imply a clear path between them. */
export function isRadarSegmentWalkable(mapId: MapId, level: RadarLevel, from: Point, to: Point): boolean {
    if (![from.x, from.y, to.x, to.y].every(n => Number.isFinite(n) && n >= 0 && n <= 100)) return false
    const nav = getRadarNav(mapId, level)
    if (!nav) return false
    const scale = (nav.gridSize - 1) / 100
    const x0 = from.x * scale + 0.5, y0 = from.y * scale + 0.5
    const dx = (to.x - from.x) * scale, dy = (to.y - from.y) * scale
    let x = Math.floor(x0), y = Math.floor(y0)
    const endX = pointToGrid(to.x, nav.gridSize), endY = pointToGrid(to.y, nav.gridSize)
    const sx = Math.sign(dx), sy = Math.sign(dy)
    const tx = dx ? 1 / Math.abs(dx) : Infinity, ty = dy ? 1 / Math.abs(dy) : Infinity
    let nextX = dx ? (sx > 0 ? x + 1 - x0 : x0 - x) / Math.abs(dx) : Infinity
    let nextY = dy ? (sy > 0 ? y + 1 - y0 : y0 - y) / Math.abs(dy) : Infinity
    const clear = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < nav.gridSize && cy < nav.gridSize && nav.walkableMask[cy * nav.gridSize + cx] === 1
    for (let step = 0; step <= nav.gridSize * 2; step++) {
        if (!clear(x, y)) return false
        if (x === endX && y === endY) return true
        if (Math.abs(nextX - nextY) < 1e-10) {
            // Do not cut diagonally between two blocked corner cells.
            if (!clear(x + sx, y) || !clear(x, y + sy)) return false
            x += sx; y += sy; nextX += tx; nextY += ty
        } else if (nextX < nextY) { x += sx; nextX += tx }
        else { y += sy; nextY += ty }
    }
    return false
}

export function projectToWalkable(mapId: MapId, level: RadarLevel, point: Point): Point {
    const safePoint: Point = {
        x: clamp(finite(point?.x, 50), 0, 100),
        y: clamp(finite(point?.y, 50), 0, 100),
    }
    const nav = getRadarNav(mapId, level)
    if (!nav) return safePoint

    const gx = pointToGrid(safePoint.x, nav.gridSize)
    const gy = pointToGrid(safePoint.y, nav.gridSize)
    const idx = gy * nav.gridSize + gx

    if (nav.walkableMask[idx] === 1) return safePoint

    const nearestX = nav.nearestX[idx]
    const nearestY = nav.nearestY[idx]
    return {
        x: gridToPoint(nearestX, nav.gridSize),
        y: gridToPoint(nearestY, nav.gridSize),
    }
}

/** Deterministic A* for the estimated radar. Every shortcut uses the same
 * supercover sweep as movement. An unreachable target returns no route. */
const ROUTE_CACHE = new Map<string, Point[]>()
export function findRadarRoute(mapId: MapId, level: RadarLevel, from: Point, to: Point): Point[] {
    if (![from.x, from.y, to.x, to.y].every(n => Number.isFinite(n) && n >= 0 && n <= 100)) return []
    if (isRadarSegmentWalkable(mapId, level, from, to)) return [{ ...to }]
    // The estimated engine replays the same prefix on each render/seek. Cache
    // exact inputs, bounded in memory; callers receive their own mutable route.
    const key = `${mapId}:${level}:${from.x},${from.y}:${to.x},${to.y}`
    let route = ROUTE_CACHE.get(key)
    if (route) { ROUTE_CACHE.delete(key); ROUTE_CACHE.set(key, route) }
    else {
        route = buildRadarRoute(mapId, level, from, to)
        ROUTE_CACHE.set(key, route)
        if (ROUTE_CACHE.size > 1024) ROUTE_CACHE.delete(ROUTE_CACHE.keys().next().value!)
    }
    return route.map(p => ({ ...p }))
}

function buildRadarRoute(mapId: MapId, level: RadarLevel, from: Point, to: Point): Point[] {
    const nav = getRadarNav(mapId, level)
    if (!nav || ![from.x, from.y, to.x, to.y].every(n => Number.isFinite(n) && n >= 0 && n <= 100)) return []
    const n = nav.gridSize, cells = n * n
    const start = pointToGrid(from.y, n) * n + pointToGrid(from.x, n)
    const goal = pointToGrid(to.y, n) * n + pointToGrid(to.x, n)
    if (!nav.walkableMask[start] || !nav.walkableMask[goal]) return []
    const gx = goal % n, gy = Math.floor(goal / n)
    const costs = new Float64Array(cells).fill(Infinity), parents = new Int32Array(cells).fill(-1), closed = new Uint8Array(cells)
    type Node = { cell: number; score: number }
    const heap: Node[] = []
    const less = (a: Node, b: Node) => a.score < b.score || (a.score === b.score && a.cell < b.cell)
    const push = (node: Node) => {
        heap.push(node)
        let i = heap.length - 1
        while (i > 0) { const p = (i - 1) >> 1; if (!less(heap[i], heap[p])) break; [heap[i], heap[p]] = [heap[p], heap[i]]; i = p }
    }
    const pop = () => {
        const first = heap[0], last = heap.pop()!
        if (heap.length) {
            heap[0] = last
            let i = 0
            while (i * 2 + 1 < heap.length) {
                let child = i * 2 + 1
                if (child + 1 < heap.length && less(heap[child + 1], heap[child])) child++
                if (!less(heap[child], heap[i])) break
                ;[heap[child], heap[i]] = [heap[i], heap[child]]; i = child
            }
        }
        return first.cell
    }
    const heuristic = (x: number, y: number) => { const dx = Math.abs(gx - x), dy = Math.abs(gy - y); return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy) }
    costs[start] = 0; push({ cell: start, score: heuristic(start % n, Math.floor(start / n)) })
    const offsets = [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]
    while (heap.length) {
        const cell = pop()
        if (closed[cell]) continue
        if (cell === goal) {
            const raw: Point[] = [{ ...to }]
            for (let current = goal; current !== start; current = parents[current]) raw.push({ x: gridToPoint(current % n, n), y: gridToPoint(Math.floor(current / n), n) })
            raw.push({ x: gridToPoint(start % n, n), y: gridToPoint(Math.floor(start / n), n) })
            raw.reverse()
            const route: Point[] = []
            let anchor = from, index = 0
            while (index < raw.length) {
                let next = index
                while (next + 1 < raw.length && isRadarSegmentWalkable(mapId, level, anchor, raw[next + 1])) next++
                if (!isRadarSegmentWalkable(mapId, level, anchor, raw[next])) return []
                route.push(raw[next]); anchor = raw[next]; index = next + 1
            }
            return route
        }
        closed[cell] = 1
        const x = cell % n, y = Math.floor(cell / n)
        for (const [dx, dy] of offsets) {
            const nx = x + dx, ny = y + dy, next = ny * n + nx
            if (nx < 0 || ny < 0 || nx >= n || ny >= n || !nav.walkableMask[next] || closed[next]) continue
            if (dx && dy && (!nav.walkableMask[y * n + nx] || !nav.walkableMask[ny * n + x])) continue
            const cost = costs[cell] + (dx && dy ? Math.SQRT2 : 1)
            if (cost >= costs[next]) continue
            costs[next] = cost; parents[next] = cell
            push({ cell: next, score: cost + heuristic(nx, ny) })
        }
    }
    return []
}
