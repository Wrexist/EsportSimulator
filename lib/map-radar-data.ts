/**
 * Map coordinate definitions for the live radar overlay.
 * Normalized 0–100 coordinate system where (0,0) = top-left of radar image.
 * Derived from visual inspection of each /public/maps/de_*_radar_psd*.png image.
 */

import { MapId } from "@/types"
import { projectToWalkable } from "./radar-nav"

export interface Point {
    x: number  // 0-100, left to right
    y: number  // 0-100, top to bottom
}

export interface MapBounds {
    minX: number
    maxX: number
    minY: number
    maxY: number
}

export interface MapLayoutData {
    tSpawn: Point[]       // 5 staggered T spawn positions
    ctSpawn: Point[]      // 5 staggered CT default hold positions (spread across sites + mid)
    aSite: Point          // A bombsite center
    bSite: Point          // B bombsite center
    tToA: Point[]         // Waypoints: T spawn → A site attack path
    tToB: Point[]         // Waypoints: T spawn → B site attack path
    ctRotateA: Point[]    // CT rotation toward A site
    ctRotateB: Point[]    // CT rotation toward B site
    engageA: Point        // Engagement zone near A approach
    engageB: Point        // Engagement zone near B approach
    mid: Point            // Mid-map position
    // For dual-level maps only
    bSiteLevel?: "lower"  // If B site is on the lower radar level
    bounds: MapBounds     // Playable area bounds (auto-computed from all points)
}

/** Compute playable area bounds from all defined points in a layout, with padding */
function computeBounds(layout: Omit<MapLayoutData, "bounds">): MapBounds {
    const allPoints: Point[] = [
        ...layout.tSpawn,
        ...layout.ctSpawn,
        layout.aSite,
        layout.bSite,
        ...layout.tToA,
        ...layout.tToB,
        ...layout.ctRotateA,
        ...layout.ctRotateB,
        layout.engageA,
        layout.engageB,
        layout.mid,
    ]
    const xs = allPoints.map(p => p.x)
    const ys = allPoints.map(p => p.y)
    const PAD = 3
    return {
        minX: Math.max(0, Math.min(...xs) - PAD),
        maxX: Math.min(100, Math.max(...xs) + PAD),
        minY: Math.max(0, Math.min(...ys) - PAD),
        maxY: Math.min(100, Math.max(...ys) + PAD),
    }
}

function stagger(center: Point, spread: number, count: number): Point[] {
    const positions: Point[] = []
    const angles = [0, 72, 144, 216, 288] // Pentagon formation
    for (let i = 0; i < count; i++) {
        const rad = (angles[i % 5] * Math.PI) / 180
        positions.push({
            x: center.x + Math.cos(rad) * spread,
            y: center.y + Math.sin(rad) * spread
        })
    }
    return positions
}

function projectPointForLevel(mapId: MapId, point: Point, level: "upper" | "lower" = "upper"): Point {
    return projectToWalkable(mapId, level, point)
}

function projectPathForLevel(
    mapId: MapId,
    path: Point[],
    level: "upper" | "lower",
    lowerFromIndex?: number
): Point[] {
    return path.map((point, idx) => {
        const useLower = level === "lower" && lowerFromIndex !== undefined && idx >= lowerFromIndex
        return projectPointForLevel(mapId, point, useLower ? "lower" : "upper")
    })
}

function projectLayoutPoints(mapId: MapId, base: Omit<MapLayoutData, "bounds">): Omit<MapLayoutData, "bounds"> {
    const usesLowerB = base.bSiteLevel === "lower"
    const lowerTailFromTToB = Math.max(0, base.tToB.length - 2)
    const lowerTailFromCtB = Math.max(0, base.ctRotateB.length - 2)
    return {
        tSpawn: base.tSpawn.map(point => projectPointForLevel(mapId, point, "upper")),
        ctSpawn: base.ctSpawn.map(point => projectPointForLevel(mapId, point, "upper")),
        aSite: projectPointForLevel(mapId, base.aSite, "upper"),
        bSite: projectPointForLevel(mapId, base.bSite, usesLowerB ? "lower" : "upper"),
        tToA: projectPathForLevel(mapId, base.tToA, "upper"),
        tToB: projectPathForLevel(mapId, base.tToB, usesLowerB ? "lower" : "upper", usesLowerB ? lowerTailFromTToB : undefined),
        ctRotateA: projectPathForLevel(mapId, base.ctRotateA, "upper"),
        ctRotateB: projectPathForLevel(mapId, base.ctRotateB, usesLowerB ? "lower" : "upper", usesLowerB ? lowerTailFromCtB : undefined),
        engageA: projectPointForLevel(mapId, base.engageA, "upper"),
        engageB: projectPointForLevel(mapId, base.engageB, usesLowerB ? "lower" : "upper"),
        mid: projectPointForLevel(mapId, base.mid, "upper"),
        bSiteLevel: base.bSiteLevel,
    }
}

// ─── DUST 2 ───
// T spawn: bottom-center, CT spawn: upper-center area (green hatched box)
// A site: top-left (orange), B site: top-right (orange)
// Long A runs down the left, B tunnels through center-right
const dust2Base = {
    tSpawn: stagger({ x: 38, y: 88 }, 3, 5),
    ctSpawn: [
        { x: 15, y: 20 },  // A site hold
        { x: 25, y: 30 },  // A long/short
        { x: 48, y: 22 },  // Mid doors
        { x: 72, y: 20 },  // B tunnels
        { x: 82, y: 15 },  // B site hold
    ],
    aSite: { x: 10, y: 8 },
    bSite: { x: 82, y: 12 },
    tToA: [
        { x: 38, y: 88 },
        { x: 30, y: 75 },
        { x: 22, y: 60 },
        { x: 18, y: 42 },
        { x: 14, y: 25 },
        { x: 10, y: 10 },
    ],
    tToB: [
        { x: 38, y: 88 },
        { x: 48, y: 78 },
        { x: 55, y: 65 },
        { x: 62, y: 48 },
        { x: 72, y: 30 },
        { x: 82, y: 14 },
    ],
    ctRotateA: [{ x: 30, y: 22 }, { x: 20, y: 15 }, { x: 12, y: 10 }],
    ctRotateB: [{ x: 60, y: 20 }, { x: 72, y: 16 }, { x: 80, y: 13 }],
    engageA: { x: 20, y: 30 },
    engageB: { x: 68, y: 32 },
    mid: { x: 42, y: 40 },
}
const dust2Projected = projectLayoutPoints(MapId.DUST2, dust2Base)
const dust2: MapLayoutData = { ...dust2Projected, bounds: computeBounds(dust2Projected) }

// ─── MIRAGE ───
// T spawn: bottom-left, CT spawn: far right
// A site: upper-left (orange), B site: center-bottom (orange)
const mirageBase = {
    tSpawn: stagger({ x: 30, y: 72 }, 3, 5),
    ctSpawn: [
        { x: 22, y: 22 },  // A site hold
        { x: 30, y: 30 },  // A ramp
        { x: 50, y: 35 },  // Mid connector
        { x: 45, y: 55 },  // B short
        { x: 42, y: 65 },  // B site hold
    ],
    aSite: { x: 17, y: 26 },
    bSite: { x: 40, y: 60 },
    tToA: [
        { x: 30, y: 72 },
        { x: 28, y: 60 },
        { x: 25, y: 48 },
        { x: 22, y: 38 },
        { x: 19, y: 30 },
        { x: 17, y: 26 },
    ],
    tToB: [
        { x: 30, y: 72 },
        { x: 35, y: 65 },
        { x: 38, y: 58 },
        { x: 42, y: 55 },
        { x: 40, y: 60 },
    ],
    ctRotateA: [{ x: 35, y: 30 }, { x: 25, y: 28 }, { x: 18, y: 26 }],
    ctRotateB: [{ x: 45, y: 50 }, { x: 42, y: 58 }, { x: 40, y: 62 }],
    engageA: { x: 25, y: 35 },
    engageB: { x: 42, y: 55 },
    mid: { x: 48, y: 40 },
}
const mirageProjected = projectLayoutPoints(MapId.MIRAGE, mirageBase)
const mirage: MapLayoutData = { ...mirageProjected, bounds: computeBounds(mirageProjected) }

// ─── INFERNO ───
// T spawn: far-left (green), CT spawn: top-right (green)
// A site: top-center (orange circle), B site: right-center (orange)
// Banana: bottom-center running up to B
const infernoBase = {
    tSpawn: stagger({ x: 4, y: 52 }, 3, 5),
    ctSpawn: [
        { x: 35, y: 15 },  // A site
        { x: 28, y: 25 },  // Arch/library
        { x: 48, y: 35 },  // Mid
        { x: 65, y: 40 },  // Banana top
        { x: 72, y: 52 },  // B site
    ],
    aSite: { x: 33, y: 17 },
    bSite: { x: 72, y: 55 },
    tToA: [
        { x: 4, y: 52 },
        { x: 15, y: 48 },
        { x: 25, y: 42 },
        { x: 30, y: 32 },
        { x: 33, y: 22 },
        { x: 33, y: 17 },
    ],
    tToB: [
        { x: 4, y: 52 },
        { x: 18, y: 55 },
        { x: 32, y: 60 },
        { x: 48, y: 62 },
        { x: 60, y: 58 },
        { x: 72, y: 55 },
    ],
    ctRotateA: [{ x: 40, y: 25 }, { x: 35, y: 20 }, { x: 33, y: 17 }],
    ctRotateB: [{ x: 55, y: 45 }, { x: 65, y: 50 }, { x: 72, y: 55 }],
    engageA: { x: 28, y: 30 },
    engageB: { x: 55, y: 58 },
    mid: { x: 40, y: 40 },
}
const infernoProjected = projectLayoutPoints(MapId.INFERNO, infernoBase)
const inferno: MapLayoutData = { ...infernoProjected, bounds: computeBounds(infernoProjected) }

// ─── ANUBIS ───
// T spawn: bottom-center (green), CT spawn: upper-center
// A site: left-center (orange), B site: top-right (orange)
const anubisBase = {
    tSpawn: stagger({ x: 40, y: 85 }, 3, 5),
    ctSpawn: [
        { x: 28, y: 42 },  // A site hold
        { x: 22, y: 50 },  // A main
        { x: 48, y: 45 },  // Mid
        { x: 68, y: 30 },  // B connector
        { x: 76, y: 24 },  // B site hold
    ],
    aSite: { x: 25, y: 46 },
    bSite: { x: 76, y: 22 },
    tToA: [
        { x: 40, y: 85 },
        { x: 35, y: 75 },
        { x: 30, y: 65 },
        { x: 28, y: 55 },
        { x: 26, y: 48 },
        { x: 25, y: 46 },
    ],
    tToB: [
        { x: 40, y: 85 },
        { x: 48, y: 72 },
        { x: 55, y: 58 },
        { x: 62, y: 42 },
        { x: 70, y: 30 },
        { x: 76, y: 22 },
    ],
    ctRotateA: [{ x: 35, y: 40 }, { x: 28, y: 44 }, { x: 25, y: 46 }],
    ctRotateB: [{ x: 60, y: 30 }, { x: 70, y: 25 }, { x: 76, y: 22 }],
    engageA: { x: 30, y: 55 },
    engageB: { x: 65, y: 35 },
    mid: { x: 48, y: 50 },
}
const anubisProjected = projectLayoutPoints(MapId.ANUBIS, anubisBase)
const anubis: MapLayoutData = { ...anubisProjected, bounds: computeBounds(anubisProjected) }

// ─── ANCIENT ───
// T spawn: bottom-center, CT spawn: top-center (green)
// A site: upper-left (orange), B site: right (orange)
const ancientBase = {
    tSpawn: stagger({ x: 46, y: 83 }, 3, 5),
    ctSpawn: [
        { x: 20, y: 28 },  // A site hold
        { x: 30, y: 35 },  // A main
        { x: 44, y: 20 },  // Mid
        { x: 60, y: 30 },  // B connector
        { x: 72, y: 38 },  // B site hold
    ],
    aSite: { x: 18, y: 26 },
    bSite: { x: 72, y: 38 },
    tToA: [
        { x: 46, y: 83 },
        { x: 40, y: 70 },
        { x: 35, y: 55 },
        { x: 28, y: 42 },
        { x: 22, y: 32 },
        { x: 18, y: 26 },
    ],
    tToB: [
        { x: 46, y: 83 },
        { x: 52, y: 70 },
        { x: 58, y: 58 },
        { x: 62, y: 48 },
        { x: 68, y: 42 },
        { x: 72, y: 38 },
    ],
    ctRotateA: [{ x: 35, y: 25 }, { x: 25, y: 27 }, { x: 18, y: 26 }],
    ctRotateB: [{ x: 55, y: 32 }, { x: 65, y: 36 }, { x: 72, y: 38 }],
    engageA: { x: 30, y: 40 },
    engageB: { x: 62, y: 45 },
    mid: { x: 44, y: 45 },
}
const ancientProjected = projectLayoutPoints(MapId.ANCIENT, ancientBase)
const ancient: MapLayoutData = { ...ancientProjected, bounds: computeBounds(ancientProjected) }

// ─── OVERPASS ───
// T spawn: bottom-left, CT spawn: upper area
// A site: upper-left (orange), B site: center-right (orange)
const overpassBase = {
    tSpawn: stagger({ x: 25, y: 75 }, 3, 5),
    ctSpawn: [
        { x: 30, y: 18 },  // A site hold
        { x: 22, y: 30 },  // A long
        { x: 45, y: 25 },  // Mid/connector
        { x: 55, y: 28 },  // B short
        { x: 56, y: 35 },  // B site hold
    ],
    aSite: { x: 32, y: 14 },
    bSite: { x: 56, y: 30 },
    tToA: [
        { x: 25, y: 75 },
        { x: 22, y: 62 },
        { x: 20, y: 48 },
        { x: 22, y: 35 },
        { x: 28, y: 22 },
        { x: 32, y: 14 },
    ],
    tToB: [
        { x: 25, y: 75 },
        { x: 30, y: 65 },
        { x: 38, y: 55 },
        { x: 45, y: 45 },
        { x: 52, y: 38 },
        { x: 56, y: 30 },
    ],
    ctRotateA: [{ x: 35, y: 22 }, { x: 30, y: 18 }, { x: 32, y: 14 }],
    ctRotateB: [{ x: 50, y: 30 }, { x: 54, y: 32 }, { x: 56, y: 30 }],
    engageA: { x: 24, y: 38 },
    engageB: { x: 45, y: 42 },
    mid: { x: 38, y: 40 },
}
const overpassProjected = projectLayoutPoints(MapId.OVERPASS, overpassBase)
const overpass: MapLayoutData = { ...overpassProjected, bounds: computeBounds(overpassProjected) }

// ─── NUKE ───
// Horizontal layout. T spawn: far-left, CT spawn: far-right
// A site: center (upper level), B site: center (lower level)
const nukeBase = {
    tSpawn: stagger({ x: 20, y: 48 }, 3, 5),
    ctSpawn: [
        { x: 55, y: 42 },  // A site hold
        { x: 48, y: 35 },  // Hut
        { x: 62, y: 48 },  // Ramp
        { x: 75, y: 45 },  // Heaven
        { x: 88, y: 48 },  // CT spawn area
    ],
    aSite: { x: 52, y: 44 },
    bSite: { x: 52, y: 52 },  // lower level
    tToA: [
        { x: 20, y: 48 },
        { x: 28, y: 45 },
        { x: 35, y: 40 },
        { x: 42, y: 38 },
        { x: 48, y: 42 },
        { x: 52, y: 44 },
    ],
    tToB: [
        { x: 20, y: 48 },
        { x: 28, y: 50 },
        { x: 35, y: 52 },
        { x: 42, y: 54 },
        { x: 48, y: 53 },
        { x: 52, y: 52 },
    ],
    ctRotateA: [{ x: 60, y: 45 }, { x: 55, y: 43 }, { x: 52, y: 44 }],
    ctRotateB: [{ x: 65, y: 50 }, { x: 58, y: 52 }, { x: 52, y: 52 }],
    engageA: { x: 42, y: 40 },
    engageB: { x: 42, y: 52 },
    mid: { x: 40, y: 48 },
    bSiteLevel: "lower" as const,
}
const nukeProjected = projectLayoutPoints(MapId.NUKE, nukeBase)
const nuke: MapLayoutData = { ...nukeProjected, bounds: computeBounds(nukeProjected) }

// ─── VERTIGO ───
// T spawn: bottom area, CT spawn: upper area
// A site: upper-left (orange), B site: center-right (orange, lower)
const vertigoBase = {
    tSpawn: stagger({ x: 35, y: 82 }, 3, 5),
    ctSpawn: [
        { x: 18, y: 22 },  // A site hold
        { x: 25, y: 30 },  // A ramp
        { x: 42, y: 28 },  // Mid
        { x: 60, y: 40 },  // B connector
        { x: 72, y: 55 },  // B site hold
    ],
    aSite: { x: 17, y: 20 },
    bSite: { x: 72, y: 55 },  // lower level
    tToA: [
        { x: 35, y: 82 },
        { x: 30, y: 68 },
        { x: 25, y: 55 },
        { x: 22, y: 42 },
        { x: 18, y: 30 },
        { x: 17, y: 20 },
    ],
    tToB: [
        { x: 35, y: 82 },
        { x: 42, y: 72 },
        { x: 50, y: 62 },
        { x: 58, y: 55 },
        { x: 65, y: 52 },
        { x: 72, y: 55 },
    ],
    ctRotateA: [{ x: 30, y: 25 }, { x: 22, y: 22 }, { x: 17, y: 20 }],
    ctRotateB: [{ x: 55, y: 48 }, { x: 65, y: 52 }, { x: 72, y: 55 }],
    engageA: { x: 25, y: 38 },
    engageB: { x: 58, y: 55 },
    mid: { x: 40, y: 42 },
    bSiteLevel: "lower" as const,
}
const vertigoProjected = projectLayoutPoints(MapId.VERTIGO, vertigoBase)
const vertigo: MapLayoutData = { ...vertigoProjected, bounds: computeBounds(vertigoProjected) }

export const MAP_LAYOUTS: Record<string, MapLayoutData> = {
    [MapId.DUST2]: dust2,
    [MapId.MIRAGE]: mirage,
    [MapId.INFERNO]: inferno,
    [MapId.ANUBIS]: anubis,
    [MapId.ANCIENT]: ancient,
    [MapId.OVERPASS]: overpass,
    [MapId.NUKE]: nuke,
    [MapId.VERTIGO]: vertigo,
}
