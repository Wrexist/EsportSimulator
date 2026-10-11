/**
 * Baked round maps (data/round-maps/<mapId>.json, `RoundMap`) — Phase 2 W1.
 * Regenerate with `npx tsx scripts/bake-round-maps.ts --review`.
 *
 * Checks the schema, the minimum content the round-script builder relies on, and
 * that every position sits on the navigation mesh of its floor (radar % → world via
 * the native drafts' registration, then the nav polygons' own surface heights).
 */
import { readFileSync, statSync } from "fs"
import { MapId } from "@/types/enums"
import { fromRadar, surfaceHeight, type NavArea, type SpatialReference } from "@/engine/spatial/types"
import type { Floor, RoundMap, RoundMapRoute, RPoint, SiteId } from "@/engine/match/round-script-types"

const DRAFTS: Record<string, { upper: string; lower?: string }> = {
    Ancient: { upper: "ancient-upper-native.json" },
    Anubis: { upper: "anubis-upper-native.json" },
    Inferno: { upper: "inferno-upper-native.json" },
    Mirage: { upper: "mirage-v13-native-sites.json" },
    Nuke: { upper: "nuke-upper-native.json", lower: "nuke-lower-native.json" },
    Overpass: { upper: "overpass-upper-native.json" },
    Sandstone: { upper: "sandstone-upper-native.json" },
    Vertigo: { upper: "vertigo-upper-native.json", lower: "vertigo-lower-native.json" },
}
/**
 * Sites whose only T entrance is a single choke, so the alternative T route can
 * differ only before it (Inferno B: every T approach ends in upper banana).
 */
const SINGLE_T_ENTRANCE: Partial<Record<string, SiteId[]>> = { Inferno: ["B"] }

const d2 = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
function inPolygon(p: { x: number; y: number }, poly: { x: number; y: number }[]) {
    let inside = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j]
        if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside
    }
    return inside
}

/** Lightweight nav lookup (no portal building): area polygons bucketed on a 128-unit grid. */
class NavIndex {
    private grid = new Map<string, NavArea[]>()
    readonly split: number | null
    private matrix: Record<Floor, number[]>
    constructor(readonly ref: SpatialReference, drafts: { upper: string; lower?: string }) {
        for (const area of ref.areas) {
            const xs = area.corners.map(c => c[0]), ys = area.corners.map(c => c[1])
            for (let x = Math.floor(Math.min(...xs) / 128); x <= Math.floor(Math.max(...xs) / 128); x++)
                for (let y = Math.floor(Math.min(...ys) / 128); y <= Math.floor(Math.max(...ys) / 128); y++) {
                    const key = `${x}:${y}`
                    this.grid.set(key, [...(this.grid.get(key) || []), area])
                }
        }
        const split = Number(ref.transform.verticalsections?.default?.AltitudeMin)
        this.split = ref.radars.lower && Number.isFinite(split) ? split : null
        const load = (file: string) => JSON.parse(readFileSync(`public/map-studio/drafts/${file}`, "utf8")).registration.matrix as number[]
        const upper = load(drafts.upper)
        this.matrix = { upper, lower: drafts.lower ? load(drafts.lower) : upper }
    }
    floorOf(z: number): Floor { return this.split !== null && z < this.split ? "lower" : "upper" }
    /** Live-radar percent → world XY (the drafts' registration, then the overview transform). */
    world(p: RPoint) {
        const [a, b, c, d, e, f] = this.matrix[p.floor]
        return fromRadar(a * p.x + b * p.y + c, d * p.x + e * p.y + f, this.ref)
    }
    surfaces(x: number, y: number): number[] {
        return (this.grid.get(`${Math.floor(x / 128)}:${Math.floor(y / 128)}`) || []).flatMap(area => { const z = surfaceHeight(area, x, y); return z === null ? [] : [z] })
    }
    /** Is there nav of the point's floor within `radius` world units? */
    onMesh(p: RPoint, radius: number): boolean {
        const [x, y] = this.world(p)
        const probes = [[0, 0], ...[0.5, 1].flatMap(f => Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4) * radius * f, Math.sin(i * Math.PI / 4) * radius * f]))]
        return probes.some(([dx, dy]) => this.surfaces(x + dx, y + dy).some(z => this.floorOf(z) === p.floor))
    }
}

const MAP_IDS = Object.values(MapId) as string[]
const maps = MAP_IDS.map(id => {
    const file = `data/round-maps/${id}.json`
    return { id, file, map: JSON.parse(readFileSync(file, "utf8")) as RoundMap, nav: new NavIndex(JSON.parse(readFileSync(`public/map-studio/spatial/${id}.json`, "utf8")) as SpatialReference, DRAFTS[id]) }
})

/** Share of b's approach (second half of its length, up to its contact point) running within 2 map-% of a. */
function approachOverlap(a: RoundMapRoute, b: RoundMapRoute) {
    let acc = 0
    const tail = b.points.filter((p, i) => (acc += i ? d2(b.points[i - 1], p) : 0) >= b.length * 0.5 && i <= b.contactIndex)
    return tail.filter(p => a.points.some(q => q.floor === p.floor && d2(p, q) < 2)).length / Math.max(1, tail.length)
}
const sharedPoints = (a: RoundMapRoute, b: RoundMapRoute) => b.points.filter(p => a.points.some(q => q.floor === p.floor && d2(p, q) < 2)).length / b.points.length

describe("baked round maps", () => {
    it("has one file per map pool entry", () => {
        expect(MAP_IDS.sort()).toEqual(["Ancient", "Anubis", "Inferno", "Mirage", "Nuke", "Overpass", "Sandstone", "Vertigo"])
    })

    describe.each(maps)("$id", ({ id, file, map, nav }) => {
        const points = (): RPoint[] => [
            ...map.spawns.T, ...map.spawns.CT,
            ...(["A", "B"] as SiteId[]).flatMap(s => [map.sites[s].center, ...map.sites[s].plantSpots]),
            ...map.routes.flatMap(r => r.points), ...map.holds.flatMap(h => [h.at, h.watch]), ...map.utility.map(u => u.at),
        ]

        it("matches the schema", () => {
            expect(map.schemaVersion).toBe(1)
            expect(map.mapId).toBe(id)
            expect(map.floors).toEqual(id === "Nuke" || id === "Vertigo" ? ["upper", "lower"] : ["upper"])
            expect(map.runSpeed).toBeCloseTo(215 / (nav.ref.transform.scale * 10.24), 2)
            for (const p of points()) {
                expect(map.floors).toContain(p.floor)
                expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(100)
                expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(100)
                expect(Math.round(p.x * 100) / 100).toBe(p.x)
            }
            for (const list of [map.routes, map.holds, map.utility]) expect(new Set(list.map(x => x.id)).size).toBe(list.length)
        })

        it("stays under the size budget", () => {
            expect(statSync(file).size).toBeLessThanOrEqual(80 * 1024)
        })

        it("has spread spawns on the nav", () => {
            for (const side of ["T", "CT"] as const) {
                const spawns = map.spawns[side]
                expect(spawns.length).toBeGreaterThanOrEqual(5)
                for (let i = 0; i < spawns.length; i++) for (let j = i + 1; j < spawns.length; j++) expect(d2(spawns[i], spawns[j])).toBeGreaterThan(0.5)
                for (const p of spawns) expect(nav.onMesh(p, 6)).toBe(true)
            }
        })

        it.each(["A", "B"] as SiteId[])("site %s has a plant zone with plant spots inside it", s => {
            const site = map.sites[s]
            expect(site.polygon.length).toBeGreaterThanOrEqual(3)
            expect(site.plantSpots.length).toBeGreaterThanOrEqual(4)
            for (const p of [site.center, ...site.plantSpots]) {
                expect(p.floor).toBe(site.polygon[0].floor)
                expect(inPolygon(p, site.polygon)).toBe(true)
                expect(nav.onMesh(p, 6)).toBe(true)
            }
        })

        it("has the required routes", () => {
            for (const s of ["A", "B"] as SiteId[]) {
                expect(map.routes.filter(r => r.kind === "t-exec" && r.site === s && r.from === "tSpawn").length).toBeGreaterThanOrEqual(2)
                expect(map.routes.filter(r => r.kind === "ct-setup" && r.site === s && r.from === "ctSpawn").length).toBeGreaterThanOrEqual(1)
            }
            expect(map.routes.some(r => r.kind === "rotate" && r.from === "A" && r.site === "B")).toBe(true)
            expect(map.routes.some(r => r.kind === "rotate" && r.from === "B" && r.site === "A")).toBe(true)
            expect(map.routes.some(r => r.kind === "lurk")).toBe(true)
        })

        it("routes are dense, measured, on the nav mesh and on known floors", () => {
            let total = 0, on = 0
            for (const r of map.routes) {
                expect(r.points.length).toBeGreaterThanOrEqual(2)
                expect(r.contactIndex).toBeGreaterThanOrEqual(0)
                expect(r.contactIndex).toBeLessThan(r.points.length)
                let length = 0
                for (let i = 1; i < r.points.length; i++) {
                    const step = d2(r.points[i - 1], r.points[i])
                    expect(step).toBeLessThanOrEqual(1.6)
                    length += step
                }
                expect(r.length).toBeCloseTo(length, 1)
                for (const p of r.points) {
                    total++
                    if (nav.onMesh(p, 6)) on++
                    // Ladder rungs, ledges and door frames sit just off the nav polygons.
                    else expect(nav.onMesh(p, 64)).toBe(true)
                }
            }
            expect(on / total).toBeGreaterThanOrEqual(0.99)
        })

        it.each(["A", "B"] as SiteId[])("T routes into %s use different corridors", s => {
            const t = map.routes.filter(r => r.kind === "t-exec" && r.site === s)
            const [main, alt] = t
            expect(sharedPoints(main, alt)).toBeLessThan(0.6)
            if (!SINGLE_T_ENTRANCE[id]?.includes(s)) expect(approachOverlap(main, alt)).toBeLessThan(0.5)
            for (const extra of t.slice(2)) for (const other of t.slice(0, 2)) expect(approachOverlap(other, extra)).toBeLessThan(0.5)
            // Every T route ends at the site and enters its contact zone before that.
            for (const r of t) {
                expect(d2(r.points[r.points.length - 1], map.sites[s].center)).toBeLessThan(1)
                expect(r.contactIndex).toBeLessThan(r.points.length - 1)
            }
        })

        it.each(["A", "B"] as SiteId[])("site %s has holds that watch something", s => {
            const holds = map.holds.filter(h => h.site === s && (h.kind === "site" || h.kind === "anchor"))
            expect(holds.length).toBeGreaterThanOrEqual(3)
            for (const h of map.holds.filter(h => h.site === s)) {
                expect(nav.onMesh(h.at, 6)).toBe(true)
                expect(d2(h.at, h.watch)).toBeGreaterThan(1)
            }
        })

        it.each(["A", "B"] as SiteId[])("site %s has execute and retake utility on walkable ground", s => {
            const u = map.utility.filter(x => x.site === s)
            const count = (side: "T" | "CT", kind: string) => u.filter(x => x.side === side && x.kind === kind).length
            expect(count("T", "smoke")).toBeGreaterThanOrEqual(2)
            expect(count("T", "molotov")).toBeGreaterThanOrEqual(1)
            expect(count("T", "flash")).toBeGreaterThanOrEqual(1)
            expect(count("CT", "molotov") + count("CT", "smoke")).toBeGreaterThanOrEqual(1)
            const radius: Record<string, number> = { smoke: 2.2, molotov: 1.6, flash: 3, he: 1.5 }
            for (const x of u) {
                expect(x.radius).toBeCloseTo(radius[x.kind], 5)
                expect(nav.onMesh(x.at, 6)).toBe(true)
            }
        })
    })
})
