/**
 * Zone-level view of a baked round map (data/round-maps/<map>.json) for the
 * script-v1 resolver: travel times on real routes (T spawn → contact, CT
 * spawn → site, rotations, mid → site), the hold / route / utility-spot ids
 * fights and grenades are tagged with, and their callouts. Built once per
 * map and cached.
 *
 * Zone ids are the baked map's own ids, so the round-script builder can put
 * a fight exactly where the resolver says it happened:
 *   route id ("t-a-main")  → the route's contact point
 *   hold id  ("mid-1")     → the hold position
 *   "A" / "B"              → on the site (the bomb once planted)
 */

import { getRoundMap } from "@/data/round-maps"
import type { RPoint, RoundMap, RoundMapRoute, SiteId, UtilityKind } from "../round-script-types"

export interface RouteInfo { id: string; contactTime: number; callout: string }

export interface ZoneSite {
    id: SiteId
    callout: string
    holds: string[]
    anchors: string[]
    retake?: string
    main: RouteInfo
    alt: RouteInfo
    split: RouteInfo
    /** Seconds from CT spawn to the site. */
    ctTime: number
    /** Seconds to rotate from the other site. */
    rotateTime: number
    /** Seconds from a mid hold to the site. */
    midTime: number
    /** Utility spot ids per side and kind. */
    util: Record<"T" | "CT", Record<UtilityKind, string[]>>
}

export interface MapZones {
    mapId: string
    runSpeed: number
    sites: Record<SiteId, ZoneSite>
    midHolds: string[]
    /** Seconds for a T to reach mid. */
    midTime: number
    lurk: Record<SiteId, RouteInfo | undefined>
    /** Zone / spot id → callout ("A site", "Mid", "B approach", …). */
    callouts: Map<string, string>
}

const cache = new Map<string, MapZones>()

export function zonesFor(mapId: string | undefined): MapZones {
    const key = mapId ?? ""
    let z = cache.get(key)
    if (!z) {
        const map = key ? getRoundMap(key) : undefined
        z = map ? buildZones(map) : genericZones(key)
        cache.set(key, z)
    }
    return z
}

const hyp = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)

function arcTo(route: RoundMapRoute, index: number): number {
    let s = 0
    const end = Math.min(index, route.points.length - 1)
    for (let i = 1; i <= end; i++) s += hyp(route.points[i - 1], route.points[i])
    return s
}

function buildZones(map: RoundMap): MapZones {
    const v = map.runSpeed > 0 ? map.runSpeed : 4
    const callouts = new Map<string, string>()
    const tSpawn = centroid(map.spawns.T)
    const ctSpawn = centroid(map.spawns.CT)
    const routeInfo = (r: RoundMapRoute | undefined, fallbackSite: SiteId): RouteInfo => {
        if (!r) return { id: fallbackSite, contactTime: 16, callout: `${fallbackSite} approach` }
        const contact = r.points[Math.max(0, Math.min(r.contactIndex, r.points.length - 1))]
        const callout = calloutOf(map, contact)
        callouts.set(r.id, callout)
        return { id: r.id, contactTime: arcTo(r, r.contactIndex) / (v * 0.95), callout }
    }
    const site = (id: SiteId): ZoneSite => {
        const other: SiteId = id === "A" ? "B" : "A"
        const exec = map.routes.filter(r => r.kind === "t-exec" && r.site === id)
        const main = exec.find(r => /main/.test(r.id)) ?? [...exec].sort((a, b) => a.length - b.length)[0]
        const alt = exec.find(r => r !== main && /alt/.test(r.id)) ?? exec.find(r => r !== main) ?? main
        const split = exec.find(r => r !== main && /split/.test(r.id)) ?? alt
        const ct = map.routes.find(r => r.kind === "ct-setup" && r.site === id)
        const rot = map.routes.find(r => r.kind === "rotate" && r.site === id && r.from === other)
        const holds = map.holds.filter(h => h.site === id && h.kind !== "mid")
        for (const h of map.holds) callouts.set(h.id, calloutOf(map, h.at))
        const mids = map.holds.filter(h => h.kind === "mid")
        const center = map.sites[id].center
        const midDist = mids.length ? Math.min(...mids.map(h => hyp(h.at, center))) : hyp(ctSpawn, center)
        const util = { T: emptyUtil(), CT: emptyUtil() }
        for (const u of map.utility) {
            if (u.site !== id) continue
            util[u.side][u.kind].push(u.id)
            callouts.set(u.id, calloutOf(map, u.at))
        }
        callouts.set(id, `${id} site`)
        return {
            id, callout: `${id} site`,
            holds: holds.filter(h => h.kind !== "retake").map(h => h.id),
            anchors: holds.filter(h => h.kind === "anchor").map(h => h.id),
            retake: holds.find(h => h.kind === "retake")?.id,
            main: routeInfo(main, id), alt: routeInfo(alt, id), split: routeInfo(split, id),
            ctTime: (ct ? ct.length : hyp(ctSpawn, center) * 1.3) / v,
            rotateTime: (rot ? rot.length : hyp(map.sites.A.center, map.sites.B.center) * 1.35) / v,
            midTime: (midDist * 1.35) / v,
            util,
        }
    }
    const sites = { A: site("A"), B: site("B") }
    const mids = map.holds.filter(h => h.kind === "mid")
    const midTime = mids.length ? (Math.min(...mids.map(h => hyp(h.at, tSpawn))) * 1.35) / (v * 0.95) : 12
    const lurkOf = (s: SiteId) => {
        const r = map.routes.find(x => x.kind === "lurk" && x.site === s)
        return r ? routeInfo(r, s) : undefined
    }
    return { mapId: map.mapId, runSpeed: v, sites, midHolds: mids.map(h => h.id), midTime, lurk: { A: lurkOf("A"), B: lurkOf("B") }, callouts }
}

function emptyUtil(): Record<UtilityKind, string[]> {
    return { smoke: [], flash: [], molotov: [], he: [] }
}

function centroid(points: readonly RPoint[]): { x: number; y: number } {
    if (!points.length) return { x: 50, y: 50 }
    return { x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length }
}

/** Fallback for a map without a baked file: generic timings, site-level zones only. */
function genericZones(mapId: string): MapZones {
    const callouts = new Map<string, string>([["A", "A site"], ["B", "B site"], ["mid", "Mid"]])
    const site = (id: SiteId): ZoneSite => ({
        id, callout: `${id} site`, holds: [id], anchors: [id],
        main: { id, contactTime: 16, callout: `${id} approach` }, alt: { id, contactTime: 19, callout: `${id} approach` }, split: { id, contactTime: 20, callout: `${id} approach` },
        ctTime: 9, rotateTime: 16, midTime: 8, util: { T: emptyUtil(), CT: emptyUtil() },
    })
    return { mapId, runSpeed: 4, sites: { A: site("A"), B: site("B") }, midHolds: ["mid"], midTime: 11, lurk: { A: undefined, B: undefined }, callouts }
}

// ─── Callouts (shared with the live radar) ─────────────────────────────────

const SITE_RADIUS = 7.5
const SPAWN_RADIUS = 8
const MID_RADIUS = 9
const APPROACH_RADIUS = 24

function inPolygon(p: { x: number; y: number }, poly: readonly { x: number; y: number }[]): boolean {
    let inside = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j]
        if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
    }
    return inside
}

/** Coarse callout for a point: "A site", "B approach", "Mid", "T spawn", "CT side", … */
export function calloutOf(map: RoundMap, p: RPoint): string {
    const sameFloor = (q: RPoint) => map.floors.length < 2 || q.floor === p.floor
    for (const id of ["A", "B"] as const) {
        const s = map.sites[id]
        if (sameFloor(s.center) && (hyp(s.center, p) <= SITE_RADIUS || (s.polygon.length >= 3 && inPolygon(p, s.polygon)))) return `${id} site`
    }
    if (map.spawns.T.some(q => hyp(q, p) <= SPAWN_RADIUS)) return "T spawn"
    if (map.spawns.CT.some(q => hyp(q, p) <= SPAWN_RADIUS)) return "CT spawn"
    if (map.holds.some(h => h.kind === "mid" && hyp(h.at, p) <= MID_RADIUS)) return "Mid"
    const dA = hyp(map.sites.A.center, p), dB = hyp(map.sites.B.center, p)
    if (Math.min(dA, dB) <= APPROACH_RADIUS) return `${dA <= dB ? "A" : "B"} approach`
    const dT = Math.min(...map.spawns.T.map(q => hyp(q, p)))
    const dCT = Math.min(...map.spawns.CT.map(q => hyp(q, p)))
    return dT <= dCT ? "T side" : "CT side"
}

/** Point of a zone id on a baked map (route contact, hold, utility spot, site centre). */
export function zonePoint(map: RoundMap, zone: string | undefined): RPoint | undefined {
    if (!zone) return undefined
    if (zone === "A" || zone === "B") return map.sites[zone].center
    const route = map.routes.find(r => r.id === zone)
    if (route) return route.points[Math.max(0, Math.min(route.contactIndex, route.points.length - 1))]
    const hold = map.holds.find(h => h.id === zone)
    if (hold) return hold.at
    return map.utility.find(u => u.id === zone)?.at
}
