/**
 * Radar zoom / pan. The view is the map point (radar %) at the centre of the
 * viewport plus a zoom factor; the map square fits the viewport's shorter side
 * at zoom 1. Panning is clamped so the map always covers the viewport.
 */

import type { RoundMap } from "@/engine/match/round-script-types"

export const MIN_ZOOM = 1
/** Beyond ~3× the 1024 px radar art turns soft. */
export const MAX_ZOOM = 3

export interface RadarView {
    zoom: number
    /** Map point (radar %) at the viewport centre. */
    cx: number
    cy: number
}

export const DEFAULT_VIEW: RadarView = { zoom: 1, cx: 50, cy: 50 }

/** screen = o + map × k (CSS px). */
export interface RadarTransform {
    k: number
    ox: number
    oy: number
}

export function clampView(view: RadarView, minZoom = MIN_ZOOM): RadarView {
    const zoom = Math.max(Math.max(MIN_ZOOM, minZoom), Math.min(MAX_ZOOM, Number.isFinite(view.zoom) ? view.zoom : 1))
    const half = 50 / zoom
    const clamp = (c: number) => (Number.isFinite(c) ? Math.max(half, Math.min(100 - half, c)) : 50)
    return { zoom, cx: clamp(view.cx), cy: clamp(view.cy) }
}

/** Map content box in radar % (e.g. the art's opaque pixels). */
export interface RadarBounds { minX: number; minY: number; maxX: number; maxY: number }

/**
 * Where players can be on a baked round map (routes, holds, spawns, sites and
 * grenade spots, both floors): the radar's home view frames this instead of
 * the art's empty outskirts.
 */
export function roundMapBounds(map: Pick<RoundMap, "routes" | "holds" | "spawns" | "sites" | "utility"> | null | undefined): RadarBounds | null {
    if (!map) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const add = (p: { x: number; y: number }) => {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return
        if (p.x < minX) minX = p.x
        if (p.x > maxX) maxX = p.x
        if (p.y < minY) minY = p.y
        if (p.y > maxY) maxY = p.y
    }
    for (const r of map.routes ?? []) for (const p of r.points) add(p)
    for (const h of map.holds ?? []) add(h.at)
    for (const side of ["T", "CT"] as const) for (const p of map.spawns?.[side] ?? []) add(p)
    for (const id of ["A", "B"] as const) {
        const site = map.sites?.[id]
        if (!site) continue
        add(site.center)
        for (const p of site.polygon) add(p)
    }
    for (const u of map.utility ?? []) add(u.at)
    return maxX > minX && maxY > minY ? { minX, minY, maxX, maxY } : null
}

/**
 * The "home" view: the content box filling the viewport with `margin` map-%
 * around it (radar art has wide empty borders). Never zooms out past 1 or in
 * past 2.
 */
export function fitView(bounds: RadarBounds | null | undefined, margin = 5): RadarView {
    if (!bounds || !(bounds.maxX > bounds.minX) || !(bounds.maxY > bounds.minY)) return DEFAULT_VIEW
    const w = bounds.maxX - bounds.minX + margin * 2
    const h = bounds.maxY - bounds.minY + margin * 2
    const zoom = Math.max(1, Math.min(2, 100 / Math.max(w, h)))
    return clampView({ zoom, cx: (bounds.minX + bounds.maxX) / 2, cy: (bounds.minY + bounds.maxY) / 2 })
}

export function viewTransform(view: RadarView, width: number, height: number, out?: RadarTransform): RadarTransform {
    const size = Math.min(width, height)
    const k = (size * view.zoom) / 100
    const t = out ?? { k: 0, ox: 0, oy: 0 }
    t.k = k
    t.ox = width / 2 - view.cx * k
    t.oy = height / 2 - view.cy * k
    return t
}

export function screenToMap(view: RadarView, width: number, height: number, sx: number, sy: number): { x: number; y: number } {
    const { k, ox, oy } = viewTransform(view, width, height)
    return { x: (sx - ox) / k, y: (sy - oy) / k }
}

/**
 * Zooms by `factor` keeping the map point under (sx, sy) in place. Zooming
 * back out to `home.zoom` returns to the home view (centred content).
 */
export function zoomAt(view: RadarView, factor: number, sx: number, sy: number, width: number, height: number, home: RadarView = DEFAULT_VIEW): RadarView {
    const zoom = Math.max(home.zoom, Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom * factor)))
    if (zoom === view.zoom) return view
    if (zoom <= home.zoom + 1e-6) return home
    const m = screenToMap(view, width, height, sx, sy)
    const size = Math.min(width, height)
    const k = (size * zoom) / 100
    // Keep m under the cursor: sx = width/2 + (m.x - cx) * k.
    return clampView({ zoom, cx: m.x - (sx - width / 2) / k, cy: m.y - (sy - height / 2) / k }, home.zoom)
}

/** Moves the view by a screen-space drag (not past the map edges; the home view does not move). */
export function panBy(view: RadarView, dx: number, dy: number, width: number, height: number, home: RadarView = DEFAULT_VIEW): RadarView {
    const k = (Math.min(width, height) * view.zoom) / 100
    if (!(k > 0) || view.zoom <= home.zoom + 1e-6) return view
    return clampView({ zoom: view.zoom, cx: view.cx - dx / k, cy: view.cy - dy / k }, home.zoom)
}
