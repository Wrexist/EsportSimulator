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
