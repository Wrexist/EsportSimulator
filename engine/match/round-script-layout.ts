/**
 * Development / fallback RoundMap built from the coarse radar layouts
 * (`data/map-layouts/*.json`, or `MAP_LAYOUTS` from lib/map-radar-data which
 * has them projected onto the walk mask). The baked maps
 * (`data/round-maps/<mapId>.json`, Phase 2 W1) replace this; the script
 * builder only sees the generic `RoundMap`.
 *
 * Synthesised from the layout: densified routes (T main = tToA/tToB, T alt =
 * a bend through `mid`, CT setup = spawn → ctRotateX, rotations A↔B), four
 * plant spots around each site centre, holds from `ctHolds` plus an anchor,
 * a site and a retake hold per site, and utility spots at the engage points.
 */

import type { Floor, HoldKind, RPoint, RoundMap, RoundMapHold, RoundMapRoute, RoundMapUtility, RouteKind, SiteId, UtilityKind } from "./round-script-types"

interface XY {
    x: number
    y: number
}

/** The layout fields the fallback needs; `MapLayoutJson` and `MapLayoutData` both fit. */
export interface RoundLayoutSource {
    mapId?: string
    tSpawn: XY[]
    ctSpawn: XY[]
    ctHolds?: XY[]
    aSite: XY
    bSite: XY
    tToA: XY[]
    tToB: XY[]
    ctRotateA: XY[]
    ctRotateB: XY[]
    engageA: XY
    engageB: XY
    mid: XY
    bSiteLevel?: "lower"
}

// Math is read once: global lookups are very slow inside Jest's sandbox (tests time the builder).
const { ceil, cos, max, min, PI, round, sin, sqrt } = Math

/** CS2 overview scale (world units per radar pixel, 1024 px images). */
const OVERVIEW_SCALE: Record<string, number> = {
    Ancient: 5, Anubis: 5.22, Inferno: 4.9, Mirage: 5, Nuke: 7, Overpass: 5.2, Sandstone: 4.4, Vertigo: 4,
}
/** Rifle run speed in world units per second. */
const RIFLE_UNITS_PER_SECOND = 215
/** Densify step; stays ≤ 1.5 after the points are rounded to 0.01. */
const STEP = 1.45
/** Lower-B maps: points this close to B (and closer to B than to A) are on the lower floor. */
const LOWER_B_RADIUS = 6.5
const CONTACT_RADIUS = 12

const len = (dx: number, dy: number) => sqrt(dx * dx + dy * dy)

const cache = new WeakMap<object, RoundMap>()

export function roundMapFromLayout(layout: RoundLayoutSource, mapId: string = layout.mapId ?? "unknown"): RoundMap {
    const hit = cache.get(layout)
    if (hit && hit.mapId === mapId) return hit
    const map = buildFromLayout(layout, mapId)
    cache.set(layout, map)
    return map
}

const d = (a: XY, b: XY) => len(a.x - b.x, a.y - b.y)
const lerp = (a: XY, b: XY, u: number): XY => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u })
const r2 = (v: number) => round(v * 100) / 100
const clampPct = (v: number) => max(0.5, min(99.5, v))
const centroid = (ps: XY[]): XY => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length })

function buildFromLayout(layout: RoundLayoutSource, mapId: string): RoundMap {
    const lowerB = layout.bSiteLevel === "lower"
    const site: Record<SiteId, XY> = { A: layout.aSite, B: layout.bSite }
    const engage: Record<SiteId, XY> = { A: layout.engageA, B: layout.engageB }
    const floorAt = (p: XY): Floor => lowerB && d(p, site.B) <= LOWER_B_RADIUS && d(p, site.B) < d(p, site.A) ? "lower" : "upper"
    const pt = (p: XY): RPoint => {
        const q = { x: clampPct(p.x), y: clampPct(p.y) }
        return { x: r2(q.x), y: r2(q.y), floor: floorAt(q) }
    }

    const densify = (raw: XY[]): RPoint[] => {
        const pts = raw.filter((p, i) => i === 0 || d(p, raw[i - 1]) > 0.05)
        const out: RPoint[] = []
        for (let i = 0; i < pts.length; i++) {
            if (i > 0) {
                const steps = ceil(d(pts[i - 1], pts[i]) / STEP)
                for (let s = 1; s < steps; s++) out.push(pt(lerp(pts[i - 1], pts[i], s / steps)))
            }
            out.push(pt(pts[i]))
        }
        return out
    }

    const routes: RoundMapRoute[] = []
    const addRoute = (id: string, kind: RouteKind, target: SiteId, from: RoundMapRoute["from"], raw: XY[], contactAt?: XY) => {
        const points = densify(raw)
        let length = 0
        for (let i = 1; i < points.length; i++) length += d(points[i - 1], points[i])
        let contactIndex = points.findIndex(p => d(p, site[target]) <= CONTACT_RADIUS)
        if (contactAt && d(contactAt, site[target]) <= 18) {
            contactIndex = points.reduce((best, p, i) => d(p, contactAt) < d(points[best], contactAt) ? i : best, 0)
        }
        if (contactIndex < 0) contactIndex = points.length - 1
        routes.push({ id, kind, site: target, from, points, length: r2(length), contactIndex })
    }

    const tStart = layout.tToA[0] ?? centroid(layout.tSpawn)
    const ctStart = centroid(layout.ctSpawn)
    addRoute("t-a-main", "t-exec", "A", "tSpawn", [...layout.tToA, site.A], engage.A)
    addRoute("t-a-alt", "t-exec", "A", "tSpawn", [tStart, lerp(tStart, layout.mid, 0.5), layout.mid, lerp(layout.mid, site.A, 0.5), site.A])
    addRoute("t-b-main", "t-exec", "B", "tSpawn", [layout.tToB[0] ?? tStart, ...layout.tToB.slice(1), site.B], engage.B)
    addRoute("t-b-alt", "t-exec", "B", "tSpawn", [tStart, lerp(tStart, layout.mid, 0.5), layout.mid, lerp(layout.mid, site.B, 0.5), site.B])
    addRoute("ct-a", "ct-setup", "A", "ctSpawn", [ctStart, ...layout.ctRotateA, site.A])
    addRoute("ct-b", "ct-setup", "B", "ctSpawn", [ctStart, ...layout.ctRotateB, site.B])
    const rotAB = [site.A, ...[...layout.ctRotateA].reverse(), ...layout.ctRotateB, site.B]
    addRoute("rot-a-b", "rotate", "B", "A", rotAB)
    addRoute("rot-b-a", "rotate", "A", "B", [...rotAB].reverse())

    // Holds: the authored CT holds, plus an anchor (toward the choke), a site
    // and a retake hold per site so every site has at least three.
    const holds: RoundMapHold[] = []
    const upstream = (target: SiteId): XY => {
        const main = routes.find(r => r.id === `t-${target.toLowerCase()}-main`)!
        return main.points[max(0, main.contactIndex - 6)]
    }
    const addHold = (id: string, target: SiteId, kind: HoldKind, at: XY, watch: XY) => {
        holds.push({ id, site: target, kind, at: pt(at), watch: pt(watch) })
    }
    ;(layout.ctHolds ?? []).forEach((h, i) => {
        const target: SiteId = d(h, site.A) <= d(h, site.B) ? "A" : "B"
        const toSite = d(h, site[target])
        const kind: HoldKind = toSite <= 7 ? "site" : d(h, layout.mid) < 0.8 * toSite ? "mid" : "anchor"
        const watchPoint = kind === "mid" ? (d(h, layout.mid) > 3 ? layout.mid : upstream(target)) : d(h, engage[target]) > 3 ? engage[target] : upstream(target)
        addHold(`ct-${i + 1}`, target, kind, h, watchPoint)
    })
    for (const s of ["A", "B"] as const) {
        const c = site[s], e = engage[s]
        const span = max(1e-6, d(c, e))
        const perp = { x: -(e.y - c.y) / span, y: (e.x - c.x) / span }
        const ctRoute = routes.find(r => r.id === `ct-${s.toLowerCase()}`)!
        const retake = [...ctRoute.points].reverse().find(p => d(p, c) >= 11) ?? ctRoute.points[0]
        addHold(`${s.toLowerCase()}-anchor`, s, "anchor", lerp(c, e, 0.55), d(lerp(c, e, 0.55), e) > 2 ? e : upstream(s))
        addHold(`${s.toLowerCase()}-site`, s, "site", { x: c.x + perp.x * 2.5, y: c.y + perp.y * 2.5 }, e)
        addHold(`${s.toLowerCase()}-retake`, s, "retake", retake, c)
    }

    const sites = {} as RoundMap["sites"]
    const utility: RoundMapUtility[] = []
    const addUtil = (id: string, s: SiteId, side: "T" | "CT", kind: UtilityKind, at: XY, radius: number) => {
        utility.push({ id, site: s, side, kind, at: pt(at), radius })
    }
    for (const s of ["A", "B"] as const) {
        const c = site[s], e = engage[s]
        const span = max(1e-6, d(c, e))
        const perp = { x: -(e.y - c.y) / span, y: (e.x - c.x) / span }
        const polygon: RPoint[] = []
        for (let k = 0; k < 8; k++) {
            const a = (k / 8) * PI * 2
            polygon.push(pt({ x: c.x + cos(a) * 5, y: c.y + sin(a) * 5 }))
        }
        sites[s] = {
            center: pt(c),
            polygon,
            plantSpots: [[-2.2, -1.8], [2.2, -1.8], [-2.2, 1.8], [2.2, 1.8]].map(([dx, dy]) => pt({ x: c.x + dx, y: c.y + dy })),
        }
        const retake = holds.find(h => h.id === `${s.toLowerCase()}-retake`)!.at
        const lo = s.toLowerCase()
        addUtil(`${lo}-t-smoke-cross`, s, "T", "smoke", retake, 2.2)
        addUtil(`${lo}-t-smoke-side`, s, "T", "smoke", { x: c.x + perp.x * 6, y: c.y + perp.y * 6 }, 2.2)
        addUtil(`${lo}-t-molotov`, s, "T", "molotov", { x: c.x - perp.x * 3, y: c.y - perp.y * 3 }, 1.6)
        addUtil(`${lo}-t-flash`, s, "T", "flash", lerp(e, c, 0.4), 1.2)
        addUtil(`${lo}-t-he`, s, "T", "he", lerp(c, e, 0.55), 1.2)
        addUtil(`${lo}-ct-molotov`, s, "CT", "molotov", lerp(c, e, 0.3), 1.6)
        addUtil(`${lo}-ct-smoke`, s, "CT", "smoke", e, 2.2)
        addUtil(`${lo}-ct-flash`, s, "CT", "flash", c, 1.2)
        addUtil(`${lo}-ct-he`, s, "CT", "he", lerp(c, e, 0.6), 1.2)
    }

    const spawns = (ps: XY[]): RPoint[] => {
        const out = ps.map(pt)
        const c = centroid(ps.length ? ps : [{ x: 50, y: 50 }])
        for (let k = out.length; k < 5; k++) {
            const a = (k / 5) * PI * 2
            out.push(pt({ x: c.x + cos(a) * 3, y: c.y + sin(a) * 3 }))
        }
        return out
    }

    return {
        schemaVersion: 1,
        mapId,
        floors: lowerB ? ["upper", "lower"] : ["upper"],
        spawns: { T: spawns(layout.tSpawn), CT: spawns(layout.ctSpawn) },
        sites,
        routes,
        holds,
        utility,
        runSpeed: r2(RIFLE_UNITS_PER_SECOND / ((OVERVIEW_SCALE[mapId] ?? 5) * 10.24)),
    }
}
