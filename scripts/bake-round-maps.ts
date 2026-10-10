/**
 * Bake the per-map spatial data of the Phase 2 round script
 * (`data/round-maps/<mapId>.json`, `RoundMap` in engine/match/round-script-types.ts).
 *
 *   npx tsx scripts/bake-round-maps.ts            # all maps, JSON only
 *   npx tsx scripts/bake-round-maps.ts --review   # also tmp/round-maps-review/<map>.png
 *   npx tsx scripts/bake-round-maps.ts Mirage Nuke --review
 *
 * Deterministic and re-runnable: no randomness, stable tie-breaks.
 *
 * Sources
 * - Navigation: public/map-studio/spatial/<Map>.json (world-space nav areas, ladders,
 *   overview transform) + <Map>.mesh (collision triangles, used for line of sight).
 * - Native bombsite triggers and spawn pins: public/map-studio/drafts/*-native*.json.
 *
 * Coordinates
 * Output points are in the live radar's percent space (the /maps/de_*_radar_psd*.png
 * images MapRadarPanel draws). World → overview percent is `toRadar`
 * (engine/spatial/types.ts); the drafts' `registration.matrix` maps live-radar percent
 * → overview percent (`registeredRadar`, engine/spatial/registration.ts), so world →
 * live radar applies its inverse — the same conversion as `sourceRadarPoint` in
 * scripts/launch/native-map-data.ts. Lower-floor points use the lower draft's matrix.
 * Floors come from the overview's vertical sections (Nuke z < -495, Vertigo z < 11700 → lower).
 *
 * Method
 * - Graph: nav areas + NavigationMesh portals, plus ledge drops/jumps and doorways whose
 *   polygon edges are not aligned (NavigationMesh drops those), checked against the collision mesh.
 * - Routes: Dijkstra with per-area cost multipliers, string-pulled along walkable nav, densified
 *   to ≤ 1.2 map-%. T main = shortest path (avoiding CT spawn and the other site); T alt/split
 *   additionally penalise the main corridor and ground CTs reach far first ("CT territory").
 * - contactIndex: first point after which the route stays within the site's contact radius
 *   (90th-percentile plant radius + 4 map-%) on the site's floor.
 * - Holds and utility: candidate standing points on a 40-unit grid, picked by line of sight
 *   (collision mesh, eye height) to the routes' entry points.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp, { type OverlayOptions } from 'sharp'
import { CollisionScene } from '../engine/spatial/geometry'
import { NavigationMesh, type SpatialLink } from '../engine/spatial/navigation'
import type { MapRegistration } from '../engine/spatial/registration'
import { distance3, fromRadar, surfaceHeight, toRadar, type SpatialReference, type Vec3 } from '../engine/spatial/types'
import type {
    Floor, HoldKind, RPoint, RoundMap, RoundMapHold, RoundMapRoute, RoundMapSite, RoundMapUtility, RouteKind, Side, SiteId, UtilityKind,
} from '../engine/match/round-script-types'

// ─── Configuration ─────────────────────────────────────────────────────────

interface Waypoint { x: number; y: number; floor?: Floor; z?: number }
interface MapConfig {
    mapId: string
    /** Native annotation drafts per radar floor (public/map-studio/drafts). */
    drafts: { upper: string; lower?: string }
    /** Extra map-% added to the plantable radius to get the contact (entrance) radius. */
    contactPad?: Partial<Record<SiteId, number>>
    /** Force a route through waypoints (live radar %), keyed by route id. */
    via?: Record<string, Waypoint[]>
    /** T routes avoid areas whose CT share of the spawn race is below this (default 0.22). */
    ctTerritory?: number
    /** Max length of the optional third T corridor relative to the main one (default 1.35). */
    splitMaxRatio?: number
    /** Passages the nav export misses (closed door models), as radar endpoints with world z. Two-way walk links. */
    extraLinks?: { a: Waypoint; b: Waypoint; note: string }[]
}

export const MAPS: MapConfig[] = [
    { mapId: 'Ancient', drafts: { upper: 'ancient-upper-native.json' } },
    { mapId: 'Anubis', drafts: { upper: 'anubis-upper-native.json' } },
    { mapId: 'Inferno', drafts: { upper: 'inferno-upper-native.json' } },
    // Mirage A is the classic three-way (ramp, palace, mid → connector); connector is 1.5× ramp.
    { mapId: 'Mirage', drafts: { upper: 'mirage-v13-native-sites.json' }, splitMaxRatio: 1.6 },
    {
        mapId: 'Nuke', drafts: { upper: 'nuke-upper-native.json', lower: 'nuke-lower-native.json' },
        // The radar draws an open doorway between A site and mini; nav and collision both carry a closed door there.
        extraLinks: [{ a: { x: 60.2, y: 45.8, z: -412 }, b: { x: 63.0, y: 45.8, z: -412 }, note: 'Nuke mini door' }],
        // Secret: outside → secret stairs → lower halls → B from the south-west (the generic alternative cut through A).
        via: { 't-b-alt': [{ x: 63.5, y: 68, floor: 'lower' }, { x: 51, y: 63, floor: 'lower' }] },
    },
    { mapId: 'Overpass', drafts: { upper: 'overpass-upper-native.json' } },
    { mapId: 'Sandstone', drafts: { upper: 'sandstone-upper-native.json' } },
    { mapId: 'Vertigo', drafts: { upper: 'vertigo-upper-native.json', lower: 'vertigo-lower-native.json' } },
]

/** Live radar art per map (components/match/MapRadarPanel.tsx). */
const RADAR_IMAGES: Record<string, { upper: string; lower?: string }> = {
    Sandstone: { upper: 'de_sandstone_radar_psd.png' },
    Mirage: { upper: 'de_mirage_radar_psd.png' },
    Inferno: { upper: 'de_inferno_radar_psd.png' },
    Nuke: { upper: 'de_nuke_radar_psd_1.png', lower: 'de_nuke_lower_radar_psd_2.png' },
    Overpass: { upper: 'de_overpass_radar_psd.png' },
    Vertigo: { upper: 'de_vertigo_radar_psd_1.png', lower: 'de_vertigo_lower_radar_psd_2.png' },
    Ancient: { upper: 'de_ancient_radar_psd.png' },
    Anubis: { upper: 'de_anubis_radar_psd.png' },
}

const RIFLE_RUN_SPEED = 215 // Source units per second
const EYE = 64 // standing eye height
const MAX_STEP_PCT = 1.2 // densified route spacing (map-%)
const STEP_DZ = 24 // max height change between walk samples
const MAX_DROP = 128 // engine/spatial/airborne.ts AIRBORNE_TUNING.maxDrop
const MAX_JUMP = 44 // jump apex is ~49 units with AIRBORNE_TUNING
const SMOKE_R = 2.2, MOLOTOV_R = 1.6, FLASH_R = 3, HE_R = 1.5

// ─── Small geometry helpers ────────────────────────────────────────────────

interface Pt { x: number; y: number }
const round2 = (n: number) => Math.round(n * 100) / 100
const d2 = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function pointInPolygon(p: Pt, poly: Pt[]): boolean {
    let inside = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j]
        if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside
    }
    return inside
}
function polygonArea(poly: Pt[]): number {
    let s = 0
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a.x * b.y - b.x * a.y }
    return s / 2
}
function segDist(p: Pt, a: Pt, b: Pt): number {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
}
function douglasPeucker(points: Pt[], tolerance: number): Pt[] {
    if (points.length <= 2) return points.slice()
    let worst = 0, index = 0
    for (let i = 1; i < points.length - 1; i++) { const d = segDist(points[i], points[0], points[points.length - 1]); if (d > worst) { worst = d; index = i } }
    if (worst <= tolerance) return [points[0], points[points.length - 1]]
    const left = douglasPeucker(points.slice(0, index + 1), tolerance), right = douglasPeucker(points.slice(index), tolerance)
    return [...left.slice(0, -1), ...right]
}

/**
 * Outline of the union of convex trigger pieces: rasterise at `cell` map-%, close
 * hairline seams between touching pieces, keep the largest connected blob and trace
 * its outer boundary. One convex piece is returned unchanged.
 */
function unionOutline(pieces: Pt[][], cell = 0.08): Pt[] {
    if (pieces.length === 1) return pieces[0].slice()
    const xs = pieces.flat().map(p => p.x), ys = pieces.flat().map(p => p.y)
    const x0 = Math.min(...xs) - 1, y0 = Math.min(...ys) - 1
    const w = Math.ceil((Math.max(...xs) + 1 - x0) / cell), h = Math.ceil((Math.max(...ys) + 1 - y0) / cell)
    let grid = new Uint8Array(w * h)
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const p = { x: x0 + (i + .5) * cell, y: y0 + (j + .5) * cell }
        if (pieces.some(poly => pointInPolygon(p, poly))) grid[j * w + i] = 1
    }
    const morph = (src: Uint8Array, dilate: boolean, r: number) => {
        const out = new Uint8Array(w * h)
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
            let v = dilate ? 0 : 1
            for (let dj = -r; dj <= r && v === (dilate ? 0 : 1); dj++) for (let di = -r; di <= r; di++) {
                const ii = i + di, jj = j + dj, s = ii >= 0 && jj >= 0 && ii < w && jj < h ? src[jj * w + ii] : 0
                if (dilate && s) { v = 1; break }
                if (!dilate && !s) { v = 0; break }
            }
            out[j * w + i] = v
        }
        return out
    }
    grid = morph(morph(grid, true, 2), false, 2)
    // Largest 4-connected component.
    const label = new Int32Array(w * h).fill(-1)
    let best = -1, bestSize = 0, comp = 0
    for (let s = 0; s < w * h; s++) {
        if (!grid[s] || label[s] >= 0) continue
        const stack = [s]; label[s] = comp; let size = 0
        while (stack.length) {
            const c = stack.pop()!; size++
            const i = c % w, j = (c - i) / w
            for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const ii = i + di, jj = j + dj
                if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue
                const n = jj * w + ii
                if (grid[n] && label[n] < 0) { label[n] = comp; stack.push(n) }
            }
        }
        if (size > bestSize) { bestSize = size; best = comp }
        comp++
    }
    const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < w && j < h && label[j * w + i] === best
    const next = new Map<string, [number, number]>()
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        if (!inside(i, j)) continue
        if (!inside(i, j - 1)) next.set(`${i},${j}`, [i + 1, j])
        if (!inside(i + 1, j)) next.set(`${i + 1},${j}`, [i + 1, j + 1])
        if (!inside(i, j + 1)) next.set(`${i + 1},${j + 1}`, [i, j + 1])
        if (!inside(i - 1, j)) next.set(`${i},${j + 1}`, [i, j])
    }
    let loop: Pt[] = []
    const seen = new Set<string>()
    for (const start of [...next.keys()].sort()) {
        if (seen.has(start)) continue
        const pts: Pt[] = []
        let key = start
        while (!seen.has(key) && next.has(key)) {
            seen.add(key)
            const [i, j] = key.split(',').map(Number)
            pts.push({ x: x0 + i * cell, y: y0 + j * cell })
            const n = next.get(key)!; key = `${n[0]},${n[1]}`
        }
        if (Math.abs(polygonArea(pts)) > Math.abs(polygonArea(loop))) loop = pts
    }
    // Simplify the closed loop: split at the point farthest from the first vertex.
    let far = 0
    for (let i = 1; i < loop.length; i++) if (d2(loop[i], loop[0]) > d2(loop[far], loop[0])) far = i
    const a = douglasPeucker(loop.slice(0, far + 1), cell * 1.2), b = douglasPeucker([...loop.slice(far), loop[0]], cell * 1.2)
    return [...a.slice(0, -1), ...b.slice(0, -1)]
}

// ─── Draft (annotation) loading ────────────────────────────────────────────

interface DraftMark { id: string; kind: string; label?: string; note?: string; side?: string; points: Pt[]; spatial?: { zMin: number; zMax: number; site?: SiteId } }
interface Draft { floor: Floor; registration: MapRegistration; marks: DraftMark[] }

function loadDraft(file: string): Draft {
    const doc = JSON.parse(readFileSync(path.join('public/map-studio/drafts', file), 'utf8')) as { floor: Floor; registration: MapRegistration; marks: DraftMark[] }
    if (!doc.registration?.matrix) throw Error(`${file}: missing registration`)
    return { floor: doc.floor, registration: doc.registration, marks: doc.marks }
}

// ─── Per-map baking context ────────────────────────────────────────────────

interface Loc { area: number; point: Vec3 }
interface Edge { to: number; link: SpatialLink; base: number; hard: boolean }
interface Cand { area: number; p: Vec3; r: RPoint }
interface WorldRoute { id: string; kind: RouteKind; site: SiteId; from: RoundMapRoute['from']; world: Vec3[]; pts: RPoint[]; contactIndex: number; length: number }

export class Baker {
    readonly ref: SpatialReference
    readonly nav: NavigationMesh
    readonly scene: CollisionScene
    readonly drafts: Draft[]
    readonly split: number | null
    readonly unitsPerPct: number
    readonly adjacency = new Map<number, Edge[]>()
    readonly centers = new Map<number, { r: RPoint }>()
    readonly log: string[] = []

    constructor(readonly config: MapConfig) {
        this.ref = JSON.parse(readFileSync(`public/map-studio/spatial/${config.mapId}.json`, 'utf8')) as SpatialReference
        this.nav = new NavigationMesh(this.ref)
        const mesh = readFileSync(`public/map-studio/spatial/${config.mapId}.mesh`)
        this.scene = CollisionScene.fromBinary(mesh.buffer.slice(mesh.byteOffset, mesh.byteOffset + mesh.byteLength) as ArrayBuffer)
        this.drafts = [loadDraft(config.drafts.upper), ...(config.drafts.lower ? [loadDraft(config.drafts.lower)] : [])]
        const split = Number(this.ref.transform.verticalsections?.default?.AltitudeMin)
        this.split = this.ref.radars.lower && Number.isFinite(split) ? split : null
        this.unitsPerPct = this.ref.transform.scale * 10.24
        for (const [id, c] of this.nav.centers) this.centers.set(id, { r: this.radar(c) })
        this.buildGraph()
        for (const extra of config.extraLinks || []) {
            const [a, b] = [extra.a, extra.b].map(w => this.snap(w, w.floor ?? 'upper', w.z ?? null, 0))
            if (!a || !b) throw Error(`${config.mapId}: extra link endpoint off the nav (${extra.note})`)
            for (const [from, to] of [[a, b], [b, a]]) {
                const link: SpatialLink = { id: `extra:${from.area}:${to.area}`, from: from.area, to: to.area, start: from.point, end: to.point, kind: 'walk' }
                const ca = this.nav.centers.get(from.area)!, cb = this.nav.centers.get(to.area)!
                this.adjacency.get(from.area)!.push({ to: to.area, link, hard: true, base: distance3(ca, from.point) + distance3(from.point, to.point) + distance3(to.point, cb) })
            }
        }
    }

    get floors(): Floor[] { return this.split === null ? ['upper'] : ['upper', 'lower'] }
    floorOf(z: number): Floor { return this.split !== null && z < this.split ? 'lower' : 'upper' }
    registration(floor: Floor): MapRegistration { return (this.drafts.find(d => d.floor === floor) ?? this.drafts[0]).registration }

    /** World → live radar percent (inverse registration of the point's floor). */
    radar(p: Vec3): RPoint {
        const floor = this.floorOf(p[2])
        const [x, y] = toRadar(p, this.ref), [a, b, c, d, e, f] = this.registration(floor).matrix, det = a * e - b * d
        return { x: (e * (x - c) - b * (y - f)) / det, y: (a * (y - f) - d * (x - c)) / det, floor }
    }
    /** Live radar percent → world XY (z = 0). */
    worldXY(p: Pt, floor: Floor): Vec3 {
        const [a, b, c, d, e, f] = this.registration(floor).matrix
        return fromRadar(a * p.x + b * p.y + c, d * p.x + e * p.y + f, this.ref)
    }
    /** Surface at world XY nearest `z` (optionally restricted to a floor). */
    ground(x: number, y: number, z: number | null, floor?: Floor, maxDz = Infinity): Loc | null {
        let best: Loc | null = null, bestScore = Infinity
        for (const s of this.nav.surfaces(x, y)) {
            if (floor && this.floorOf(s.point[2]) !== floor) continue
            const score = z === null ? s.point[2] : Math.abs(s.point[2] - z)
            if (z !== null && score > maxDz) continue
            if (score < bestScore) { bestScore = score; best = s }
        }
        return best
    }
    /** Nearest supported location to a radar point on a floor (spiral search). */
    snap(p: Pt, floor: Floor, z: number | null = null, clearance = 12): Loc | null {
        const w = this.worldXY(p, floor)
        for (let r = 0; r <= 160; r += 8) {
            const steps = r === 0 ? 1 : Math.ceil(2 * Math.PI * r / 8)
            let best: Loc | null = null
            for (let k = 0; k < steps; k++) {
                const a = k / steps * Math.PI * 2, x = w[0] + Math.cos(a) * r, y = w[1] + Math.sin(a) * r
                const g = this.ground(x, y, z, floor, z === null ? Infinity : 64)
                if (g && this.clear(g.point, clearance) && this.adjacency.get(g.area)?.length && (!best || Math.abs(g.point[2] - (z ?? g.point[2])) < Math.abs(best.point[2] - (z ?? best.point[2])))) best = g
            }
            if (best) return best
        }
        return null
    }
    /** All 4 offsets at `radius` have a surface within STEP_DZ of the point. */
    clear(p: Vec3, radius: number): boolean {
        if (!radius) return true
        for (const [dx, dy] of [[radius, 0], [-radius, 0], [0, radius], [0, -radius]]) {
            if (!this.nav.surfaces(p[0] + dx, p[1] + dy).some(s => Math.abs(s.point[2] - p[2]) <= STEP_DZ)) return false
        }
        return true
    }
    /** Continuous walk check on the nav surfaces from a to b (sampled every 8 units). */
    walkable(a: Vec3, b: Vec3, clearance = 0): boolean {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(len / 8))
        let z = a[2]
        for (let i = 1; i <= n; i++) {
            const t = i / n, x = lerp(a[0], b[0], t), y = lerp(a[1], b[1], t)
            let best: number | null = null
            for (const s of this.nav.surfaces(x, y)) if (Math.abs(s.point[2] - z) <= STEP_DZ && (best === null || Math.abs(s.point[2] - z) < Math.abs(best - z))) best = s.point[2]
            if (best === null) return false
            z = best
            if (clearance && i < n && !this.clear([x, y, z], clearance)) return false
        }
        return Math.abs(z - b[2]) <= STEP_DZ
    }
    los(a: Vec3, b: Vec3): boolean {
        return !this.scene.raycast([a[0], a[1], a[2] + EYE], [b[0], b[1], b[2] + EYE])
    }

    /** No collision between a ledge/landing pair: over the top of the higher end, then straight down/up. */
    private airClear(a: Vec3, b: Vec3): boolean {
        const top = Math.max(a[2], b[2]) + 32
        return !this.scene.raycast([a[0], a[1], a[2] + 32], [a[0], a[1], top]) && !this.scene.raycast([a[0], a[1], top], [b[0], b[1], top]) && !this.scene.raycast([b[0], b[1], top], [b[0], b[1], b[2] + 32])
    }

    /**
     * Nav edges whose two polygon sides are not aligned within 4 units are dropped by
     * NavigationMesh (`portal`), which loses real drops (Mirage apartments → B) and
     * small ledges. Rebuild them as explicit traversals when the collision mesh is clear.
     */
    private gapLinks(id: number): SpatialLink[] {
        const area = this.nav.areas.get(id)!, native = new Set((this.nav.links.get(id) || []).map(l => l.id)), out: SpatialLink[] = []
        for (const e of area.edges) {
            if (native.has(`${id}:${e.target}:${e.edge}`)) continue
            const target = this.nav.areas.get(e.target)
            if (!target || e.edge >= area.corners.length || e.targetEdge >= target.corners.length) continue
            const p = area.corners[e.edge], q = area.corners[(e.edge + 1) % area.corners.length]
            const u = target.corners[e.targetEdge], v = target.corners[(e.targetEdge + 1) % target.corners.length]
            let best: { s: Vec3; t: Vec3; gap: number; mid: number } | null = null
            for (let k = 1; k <= 9; k++) {
                const f = k / 10, s: Vec3 = [lerp(p[0], q[0], f), lerp(p[1], q[1], f), lerp(p[2], q[2], f)]
                const dx = v[0] - u[0], dy = v[1] - u[1], l2 = dx * dx + dy * dy
                const g = l2 ? Math.max(0, Math.min(1, ((s[0] - u[0]) * dx + (s[1] - u[1]) * dy) / l2)) : 0
                const t: Vec3 = [lerp(u[0], v[0], g), lerp(u[1], v[1], g), lerp(u[2], v[2], g)]
                const gap = Math.hypot(s[0] - t[0], s[1] - t[1]), mid = Math.abs(f - .5)
                if (!best || gap < best.gap - 0.5 || (Math.abs(gap - best.gap) <= 0.5 && mid < best.mid)) best = { s, t, gap, mid }
            }
            if (!best) continue
            const dz = best.t[2] - best.s[2]
            const kind = dz < -18 ? 'drop' : dz > 18 ? 'jump' : 'walk'
            if (kind === 'drop' ? dz < -MAX_DROP || best.gap > 56 : kind === 'jump' ? dz > MAX_JUMP || best.gap > 32 : best.gap > 24) continue
            if (!this.airClear(best.s, best.t)) continue
            out.push({ id: `gap:${id}:${e.target}:${e.edge}`, from: id, to: e.target, start: best.s, end: best.t, kind })
        }
        return out
    }

    /**
     * Doorways: the nav generator leaves door frames uncovered (e.g. Nuke mini → A), so two
     * level floors face each other across a strip with no nav at all. Bridge parallel, facing
     * edges ≤ 96 units apart with ≥ 32 units of overlap when the strip is empty of nav and
     * the collision mesh is clear at knee, chest and eye height.
     */
    readonly doorLinks: SpatialLink[] = []
    private buildDoorLinks(): Map<number, SpatialLink[]> {
        const byArea = new Map<number, SpatialLink[]>()
        const linked = (a: number, b: number) => (this.nav.links.get(a) || []).some(l => l.to === b) || (this.nav.links.get(b) || []).some(l => l.to === a)
        const areas = [...this.nav.areas.values()]
        const box = (a: typeof areas[number]) => { const xs = a.corners.map(c => c[0]), ys = a.corners.map(c => c[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
        const boxes = new Map(areas.map(a => [a.id, box(a)]))
        const seen = new Set<string>()
        for (const a of areas) {
            const [ax0, ay0, ax1, ay1] = boxes.get(a.id)!
            const near = new Set<typeof a>()
            for (const b of areas) {
                if (b.id <= a.id) continue
                const [bx0, by0, bx1, by1] = boxes.get(b.id)!
                if (bx0 > ax1 + 96 || bx1 < ax0 - 96 || by0 > ay1 + 96 || by1 < ay0 - 96) continue
                near.add(b)
            }
            for (const b of near) {
                if (b.id <= a.id || linked(a.id, b.id)) continue
                const key = `${a.id}:${b.id}`
                if (seen.has(key)) continue
                for (let i = 0; i < a.corners.length && !seen.has(key); i++) {
                    const p = a.corners[i], q = a.corners[(i + 1) % a.corners.length]
                    const ex = q[0] - p[0], ey = q[1] - p[1], len = Math.hypot(ex, ey)
                    if (len < 32) continue
                    const ux = ex / len, uy = ey / len
                    for (let j = 0; j < b.corners.length; j++) {
                        const u = b.corners[j], v = b.corners[(j + 1) % b.corners.length]
                        const fx = v[0] - u[0], fy = v[1] - u[1], flen = Math.hypot(fx, fy)
                        if (flen < 32 || Math.abs((fx * ux + fy * uy) / flen) < 0.95) continue
                        const t0 = (u[0] - p[0]) * ux + (u[1] - p[1]) * uy, t1 = (v[0] - p[0]) * ux + (v[1] - p[1]) * uy
                        const lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(len, Math.max(t0, t1))
                        if (hi - lo < 32) continue
                        const tm = (lo + hi) / 2, s: Vec3 = [p[0] + ux * tm, p[1] + uy * tm, lerp(p[2], q[2], tm / len)]
                        const gt = ((s[0] - u[0]) * fx + (s[1] - u[1]) * fy) / (flen * flen)
                        const e: Vec3 = [u[0] + fx * gt, u[1] + fy * gt, lerp(u[2], v[2], gt)]
                        const gap = Math.hypot(e[0] - s[0], e[1] - s[1])
                        if (gap < 8 || gap > 96 || Math.abs(e[2] - s[2]) > 12) continue
                        // The strip between them must be uncovered and physically open.
                        const m: Vec3 = [(s[0] + e[0]) / 2, (s[1] + e[1]) / 2, (s[2] + e[2]) / 2]
                        if (this.nav.surfaces(m[0], m[1]).some(x => Math.abs(x.point[2] - m[2]) < 40)) continue
                        if ([16, 40, 64].some(h => this.scene.raycast([s[0], s[1], s[2] + h], [e[0], e[1], e[2] + h]))) continue
                        if (this.scene.raycast([m[0], m[1], m[2] + 24], [m[0], m[1], m[2] - 24]) === null) continue // needs a floor under the doorway
                        seen.add(key)
                        for (const [from, to, st, en] of [[a.id, b.id, s, e], [b.id, a.id, e, s]] as [number, number, Vec3, Vec3][]) {
                            const link: SpatialLink = { id: `door:${from}:${to}`, from, to, start: st, end: en, kind: 'walk' }
                            byArea.set(from, [...(byArea.get(from) || []), link]); this.doorLinks.push(link)
                        }
                        break
                    }
                }
            }
        }
        return byArea
    }

    private buildGraph() {
        const doors = this.buildDoorLinks()
        for (const [id] of this.nav.areas) {
            const edges: Edge[] = []
            for (const link of [...(this.nav.links.get(id) || []), ...this.gapLinks(id), ...(doors.get(id) || [])]) {
                if (!this.nav.areas.has(link.to)) continue
                const dz = link.end[2] - link.start[2]
                let factor = 1, hard = link.id.startsWith('gap:') || link.id.startsWith('door:')
                if (link.kind === 'jump') {
                    if (dz > MAX_JUMP || !this.airClear(link.start, link.end)) continue
                    factor = 1.6; hard = true
                } else if (link.kind === 'drop') {
                    if (dz < -MAX_DROP || !this.airClear(link.start, link.end)) continue
                    factor = 1.15; hard = true
                } else if (link.kind === 'ladder') {
                    if (Math.hypot(link.start[0] - link.end[0], link.start[1] - link.end[1]) > 64 || distance3(link.start, link.end) > 512) continue
                    factor = 2.5; hard = true
                }
                const a = this.nav.centers.get(id)!, b = this.nav.centers.get(link.to)!
                edges.push({ to: link.to, link, hard, base: distance3(a, link.start) + distance3(link.start, link.end) * factor + distance3(link.end, b) })
            }
            this.adjacency.set(id, edges)
        }
    }

    /** Dijkstra over nav areas with a per-area cost multiplier. */
    dijkstra(start: number, penalty: (area: number) => number = () => 1, goal?: number): { dist: Map<number, number>; prev: Map<number, Edge & { from: number }> } {
        const dist = new Map<number, number>([[start, 0]]), prev = new Map<number, Edge & { from: number }>(), done = new Set<number>()
        const heap: [number, number][] = [[0, start]]
        const push = (item: [number, number]) => {
            heap.push(item); let i = heap.length - 1
            while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] < heap[i][0] || (heap[p][0] === heap[i][0] && heap[p][1] <= heap[i][1])) break;[heap[p], heap[i]] = [heap[i], heap[p]]; i = p }
        }
        const pop = (): [number, number] => {
            const top = heap[0], last = heap.pop()!
            if (heap.length) {
                heap[0] = last; let i = 0
                for (; ;) {
                    const l = i * 2 + 1, r = l + 1; let m = i
                    const less = (x: number, y: number) => heap[x][0] < heap[y][0] || (heap[x][0] === heap[y][0] && heap[x][1] < heap[y][1])
                    if (l < heap.length && less(l, m)) m = l
                    if (r < heap.length && less(r, m)) m = r
                    if (m === i) break;[heap[m], heap[i]] = [heap[i], heap[m]]; i = m
                }
            }
            return top
        }
        while (heap.length) {
            const [cost, id] = pop()
            if (done.has(id)) continue
            done.add(id)
            if (id === goal) break
            const pa = penalty(id)
            for (const e of this.adjacency.get(id) || []) {
                if (done.has(e.to)) continue
                const c = cost + e.base * (pa + penalty(e.to)) / 2
                if (c < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, c); prev.set(e.to, { ...e, from: id }); push([c, e.to]) }
            }
        }
        return { dist, prev }
    }

    /** The point itself if it lies on the area, else the closest point of the area 6 units inside its rim. */
    onArea(id: number, p: Vec3): Vec3 {
        const area = this.nav.areas.get(id)!, z = surfaceHeight(area, p[0], p[1])
        if (z !== null && Math.abs(z - p[2]) <= 64) return [p[0], p[1], z]
        let best: [number, number] = [area.corners[0][0], area.corners[0][1]], bd = Infinity
        for (let i = 0; i < area.corners.length; i++) {
            const a = area.corners[i], b = area.corners[(i + 1) % area.corners.length]
            const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy
            const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
            const q: [number, number] = [a[0] + dx * t, a[1] + dy * t], d = Math.hypot(q[0] - p[0], q[1] - p[1])
            if (d < bd) { bd = d; best = q }
        }
        const c = this.nav.centers.get(id)!, toC = Math.hypot(c[0] - best[0], c[1] - best[1]) || 1, k = Math.min(1, 6 / toC)
        const x = best[0] + (c[0] - best[0]) * k, y = best[1] + (c[1] - best[1]) * k
        return [x, y, surfaceHeight(area, x, y) ?? c[2]]
    }

    /** Raw nav path (portal points) between two locations; hard = indices of ladder/drop/jump endpoints. */
    navPath(from: Loc, to: Loc, penalty: (area: number) => number): { pts: Vec3[]; hard: Set<number> } | null {
        const { prev } = this.dijkstra(from.area, penalty, to.area)
        if (from.area !== to.area && !prev.has(to.area)) return null
        const chain: (Edge & { from: number })[] = []
        for (let id = to.area; id !== from.area;) { const e = prev.get(id)!; chain.unshift(e); id = e.from }
        const pts: Vec3[] = [from.point], hard = new Set<number>()
        const pushWithin = (area: number, target: Vec3) => {
            const last = pts[pts.length - 1]
            if (!this.walkable(last, target)) {
                const c = this.nav.centers.get(area)!
                if (this.walkable(last, c) && this.walkable(c, target)) pts.push(c)
            }
            pts.push(target)
        }
        for (const e of chain) {
            // Ladder rungs and ledge/door endpoints can sit just outside their polygons: stand on the nav instead.
            pushWithin(e.from, e.hard ? this.onArea(e.from, e.link.start) : e.link.start)
            if (e.hard) hard.add(pts.length - 1)
            pts.push(e.hard ? this.onArea(e.to, e.link.end) : e.link.end)
            if (e.hard) hard.add(pts.length - 1)
        }
        pushWithin(to.area, to.point)
        // Drop exact duplicates (keeping hard markers aligned).
        const outPts: Vec3[] = [], outHard = new Set<number>()
        pts.forEach((p, i) => {
            if (outPts.length && distance3(outPts[outPts.length - 1], p) < 0.01) { if (hard.has(i)) outHard.add(outPts.length - 1); return }
            if (hard.has(i)) outHard.add(outPts.length)
            outPts.push(p)
        })
        return { pts: outPts, hard: outHard }
    }

    /** String-pull a raw nav path with walkable shortcuts, then densify to MAX_STEP_PCT. */
    smooth(raw: { pts: Vec3[]; hard: Set<number> }): Vec3[] {
        const { pts, hard } = raw
        const keep: number[] = [0]
        let i = 0
        while (i < pts.length - 1) {
            let j = Math.min(pts.length - 1, i + 80)
            // Never shortcut across a ladder / drop / jump endpoint.
            for (let k = i + 1; k < j; k++) if (hard.has(k)) { j = k; break }
            if (hard.has(i) && hard.has(i + 1)) j = i + 1
            while (j > i + 1 && !this.walkable(pts[i], pts[j], 12)) j--
            keep.push(j); i = j
        }
        const out: Vec3[] = [pts[0]]
        const maxStep = MAX_STEP_PCT * this.unitsPerPct
        for (let k = 1; k < keep.length; k++) {
            const a = pts[keep[k - 1]], b = pts[keep[k]]
            const special = hard.has(keep[k - 1]) && hard.has(keep[k])
            const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxStep))
            let z = a[2]
            for (let s = 1; s <= n; s++) {
                const t = s / n
                if (s === n) { out.push(b); break }
                const x = lerp(a[0], b[0], t), y = lerp(a[1], b[1], t)
                if (special) { out.push([x, y, lerp(a[2], b[2], t)]); continue }
                const g = this.ground(x, y, z, undefined, STEP_DZ * 3)
                z = g ? g.point[2] : lerp(a[2], b[2], t)
                out.push([x, y, z])
            }
        }
        return out
    }
}

// ─── Baking one map ────────────────────────────────────────────────────────

interface SiteInfo { id: SiteId; floor: Floor; zMin: number; zMax: number; polygon: Pt[]; samples: Cand[]; center: Cand; radius: number; contact: number; plantSpots: Cand[] }

/** A decimal number in a draft note (notes end sentences with '.', so no trailing dot). */
const NUM = '(-?\\d+(?:\\.\\d+)?)'

function parseZRange(m: DraftMark): [number, number] | null {
    const z = new RegExp(`Z ${NUM} to ${NUM}`).exec(m.note || '')
    if (z) return [Number(z[1]), Number(z[2])]
    return m.spatial ? [m.spatial.zMin, m.spatial.zMax] : null
}

function farthestPointOrder<T>(items: T[], pos: (t: T) => Pt, first: T, count: number, minGap = 0): T[] {
    const chosen = [first]
    while (chosen.length < count) {
        let best: T | null = null, bestD = -1
        for (const it of items) {
            if (chosen.includes(it)) continue
            const d = Math.min(...chosen.map(c => d2(pos(c), pos(it))))
            if (d > bestD) { bestD = d; best = it }
        }
        if (!best || bestD < minGap) break
        chosen.push(best)
    }
    return chosen
}

export function bakeMap(config: MapConfig): { map: RoundMap; baker: Baker; extras: ReviewExtras } {
    const bk = new Baker(config)
    const say = (s: string) => bk.log.push(s)

    // Spawns ────────────────────────────────────────────────────────────────
    const spawnCands: Record<Side, Cand[]> = { T: [], CT: [] }
    for (const draft of bk.drafts) for (const m of draft.marks) {
        const match = /^(T|CT) spawn/.exec(m.label || '')
        if (m.kind !== 'callout' || !match) continue
        const side = match[1] as Side
        const origin = new RegExp(`World origin ${NUM}, ${NUM}, ${NUM}`).exec(m.note || '')
        let loc: Loc | null = null
        if (origin) {
            const [x, y, z] = [Number(origin[1]), Number(origin[2]), Number(origin[3])]
            loc = bk.ground(x, y, z, undefined, 96)
            if (!loc) { const s = bk.snap(bk.radar([x, y, z]), bk.floorOf(z), z); loc = s }
        } else loc = bk.snap(m.points[0], draft.floor)
        if (!loc || !bk.adjacency.get(loc.area)?.length) { say(`spawn ${m.label} could not be grounded`); continue }
        spawnCands[side].push({ area: loc.area, p: loc.point, r: bk.radar(loc.point) })
    }
    const spawns = {} as Record<Side, Cand[]>
    const spawnCentroid = {} as Record<Side, Pt>
    for (const side of ['T', 'CT'] as Side[]) {
        const list = spawnCands[side]
        if (list.length < 5) throw Error(`${config.mapId}: only ${list.length} ${side} spawn pins`)
        const c = { x: list.reduce((s, p) => s + p.r.x, 0) / list.length, y: list.reduce((s, p) => s + p.r.y, 0) / list.length }
        spawnCentroid[side] = c
        const first = [...list].sort((a, b) => d2(a.r, c) - d2(b.r, c))[0]
        spawns[side] = farthestPointOrder(list, p => p.r, first, 5)
    }
    const tStart = [...spawnCands.T].sort((a, b) => d2(a.r, spawnCentroid.T) - d2(b.r, spawnCentroid.T))[0]
    const ctStart = [...spawnCands.CT].sort((a, b) => d2(a.r, spawnCentroid.CT) - d2(b.r, spawnCentroid.CT))[0]
    const fromT = bk.dijkstra(tStart.area).dist, fromCT = bk.dijkstra(ctStart.area).dist

    // Candidate standing points (reachable by both sides) ───────────────────
    const cands: Cand[] = []
    {
        const xs = bk.ref.areas.flatMap(a => a.corners.map(c => c[0])), ys = bk.ref.areas.flatMap(a => a.corners.map(c => c[1]))
        const step = 40
        for (let x = Math.ceil(Math.min(...xs) / step) * step; x <= Math.max(...xs); x += step) for (let y = Math.ceil(Math.min(...ys) / step) * step; y <= Math.max(...ys); y += step) {
            for (const s of bk.nav.surfaces(x, y)) {
                if (!fromT.has(s.area) || !fromCT.has(s.area) || !bk.clear(s.point, 14)) continue
                cands.push({ area: s.area, p: s.point, r: bk.radar(s.point) })
            }
        }
    }
    say(`${cands.length} candidate standing points, ${bk.doorLinks.length / 2} doorway links`)

    // Sites ─────────────────────────────────────────────────────────────────
    const sites = {} as Record<SiteId, SiteInfo>
    for (const id of ['A', 'B'] as SiteId[]) {
        const pieces: { poly: Pt[]; floor: Floor; z: [number, number] }[] = []
        for (const draft of bk.drafts) for (const m of draft.marks) {
            if (m.kind !== 'bombsite') continue
            const sid = m.spatial?.site ?? (m.label || '').trim()[0]
            if (sid !== id) continue
            const z = parseZRange(m)
            if (!z) throw Error(`${config.mapId} ${id}: bombsite without Z range`)
            pieces.push({ poly: m.points, floor: draft.floor, z })
        }
        if (!pieces.length) throw Error(`${config.mapId}: no ${id} plant zone`)
        const floor = pieces[0].floor, zMin = Math.min(...pieces.map(p => p.z[0])), zMax = Math.max(...pieces.map(p => p.z[1]))
        const polygon = unionOutline(pieces.map(p => p.poly))
        // Plantable standing samples: inside a piece, on the nav at trigger height, away from edges.
        const samples: Cand[] = []
        const bx = polygon.map(p => p.x), by = polygon.map(p => p.y)
        for (let y = Math.min(...by); y <= Math.max(...by); y += 0.25) for (let x = Math.min(...bx); x <= Math.max(...bx); x += 0.25) {
            const p = { x: round2(x), y: round2(y) }
            if (!pieces.some(pc => pointInPolygon(p, pc.poly)) || !pointInPolygon(p, polygon)) continue
            const w = bk.worldXY(p, floor)
            for (const s of bk.nav.surfaces(w[0], w[1])) {
                if (s.point[2] < zMin - 40 || s.point[2] > zMax + 2 || !fromT.has(s.area) || !fromCT.has(s.area)) continue
                samples.push({ area: s.area, p: s.point, r: { ...p, floor } })
            }
        }
        if (samples.length < 4) throw Error(`${config.mapId} ${id}: only ${samples.length} plantable nav samples`)
        const mean = { x: samples.reduce((s, c) => s + c.r.x, 0) / samples.length, y: samples.reduce((s, c) => s + c.r.y, 0) / samples.length }
        const roomy = samples.filter(s => bk.clear(s.p, 16))
        const pool = roomy.length >= 6 ? roomy : samples
        const center = [...pool].sort((a, b) => d2(a.r, mean) - d2(b.r, mean))[0]
        const dists = samples.map(s => d2(s.r, center.r)).sort((a, b) => a - b)
        const radius = dists[Math.floor(dists.length * 0.9)]
        const contact = radius + (config.contactPad?.[id] ?? 4)
        // Plant spots: spread over the plantable floor, kept off the outline.
        const inner = pool.filter(s => polygon.every((_, i) => segDist(s.r, polygon[i], polygon[(i + 1) % polygon.length]) >= 0.35))
        const plantSpots = farthestPointOrder(inner.length >= 6 ? inner : pool, s => s.r, center, 6, 0.8)
        sites[id] = { id, floor, zMin, zMax, polygon, samples, center, radius, contact, plantSpots }
        say(`site ${id}: floor ${floor} centre ${center.r.x.toFixed(1)},${center.r.y.toFixed(1)} radius ${radius.toFixed(1)} contact ${contact.toFixed(1)} samples ${samples.length}`)
    }

    // Routes ────────────────────────────────────────────────────────────────
    const areaR = (id: number) => bk.centers.get(id)!.r
    const routes: WorldRoute[] = []
    const lengthOf = (pts: RPoint[]) => pts.slice(1).reduce((s, p, i) => s + d2(pts[i], p), 0)
    const contactIndexOf = (pts: RPoint[], site: SiteInfo) => {
        let idx = pts.length - 1
        for (let i = pts.length - 1; i >= 0; i--) {
            const inside = d2(pts[i], site.center.r) <= site.contact && (bk.split === null || pts[i].floor === site.floor)
            if (!inside) break
            idx = i
        }
        return idx
    }
    const corridorPenalty = (avoid: RPoint[][], keepClear: { c: Pt; r: number }[], width = 3.2, factor = 9) => {
        const cache = new Map<number, number>()
        return (area: number) => {
            let v = cache.get(area)
            if (v !== undefined) return v
            const p = areaR(area)
            v = 1
            if (!keepClear.some(k => d2(p, k.c) < k.r)) {
                for (const route of avoid) if (route.some(q => q.floor === p.floor && d2(q, p) < width)) { v = factor; break }
            }
            cache.set(area, v); return v
        }
    }
    /** Zones only apply within 200 units of their own height (Nuke B sits under A). */
    const zonesPenalty = (zones: { c: Pt; r: number; f: number; z: number }[], keepClear: { c: Pt; r: number }[]) => (area: number) => {
        const p = areaR(area), az = bk.nav.centers.get(area)![2]
        if (keepClear.some(k => d2(p, k.c) < k.r)) return 1
        let v = 1
        for (const z of zones) if (d2(p, z.c) < z.r && Math.abs(az - z.z) <= 200) v = Math.max(v, z.f)
        return v
    }
    const combine = (...fs: ((a: number) => number)[]) => (a: number) => fs.reduce((v, f) => v * f(a), 1)
    const toLoc = (c: Cand): Loc => ({ area: c.area, point: c.p })
    const makeRoute = (id: string, kind: RouteKind, site: SiteId, from: RoundMapRoute['from'], start: Cand, end: Cand, penalty: (a: number) => number): WorldRoute | null => {
        const legs: Loc[] = [toLoc(start)]
        for (const w of config.via?.[id] || []) {
            const s = bk.snap(w, w.floor ?? 'upper')
            if (!s) throw Error(`${config.mapId} ${id}: via point ${w.x},${w.y} is off the nav`)
            legs.push(s)
        }
        legs.push(toLoc(end))
        let world: Vec3[] = []
        for (let i = 1; i < legs.length; i++) {
            const raw = bk.navPath(legs[i - 1], legs[i], penalty)
            if (!raw) { say(`route ${id}: no nav path`); return null }
            const part = bk.smooth(raw)
            world = world.length ? [...world, ...part.slice(1)] : part
        }
        const pts = world.map(p => bk.radar(p))
        const siteInfo = sites[site]
        const contactIndex = kind === 'lurk' ? pts.length - 1 : contactIndexOf(pts, siteInfo)
        return { id, kind, site, from, world, pts, contactIndex, length: lengthOf(pts) }
    }
    const overlap = (a: RPoint[], b: RPoint[], tol = 2) => b.filter(p => a.some(q => q.floor === p.floor && d2(p, q) < tol)).length / b.length
    /** Share of b's approach (second half up to its contact point) that runs along a: the "different corridor" check. */
    const corridorOverlap = (a: WorldRoute, b: WorldRoute) => { let acc = 0; const pts = b.pts.filter((p, i) => (acc += i ? d2(b.pts[i - 1], p) : 0) >= b.length * 0.5 && i <= b.contactIndex); return pts.length ? overlap(a.pts, pts) : 1 }

    const tZone = { c: spawnCentroid.T, r: 6 }, ctZone = { c: spawnCentroid.CT, r: 8 }
    /** Share of the T↔CT race won by CT: < CT_TERRITORY means CTs get there long before Ts. */
    const ctShare = (area: number) => { const t = fromT.get(area), c = fromCT.get(area); return t === undefined || c === undefined ? 0 : c / (t + c) }
    const CT_TERRITORY = config.ctTerritory ?? 0.22
    for (const id of ['A', 'B'] as SiteId[]) {
        const site = sites[id], other = sites[id === 'A' ? 'B' : 'A']
        const siteKeep = { c: site.center.r, r: site.contact }
        const approach = { c: site.center.r, r: site.contact + 3 }
        const inApproach = (p: Pt, z: number) => d2(p, approach.c) < approach.r && Math.abs(z - site.center.p[2]) <= 200
        const territory = (area: number) => ctShare(area) < CT_TERRITORY && !inApproach(areaR(area), bk.nav.centers.get(area)![2]) ? 30 : 1
        // CT spawn stays off-limits right up to the plant zone (Overpass CT spawn borders A: never enter A from it).
        const tBase = combine(zonesPenalty([{ c: other.center.r, r: other.contact, f: 30, z: other.center.p[2] }], [siteKeep, tZone]), zonesPenalty([{ ...ctZone, f: 30, z: ctStart.p[2] }], [{ c: site.center.r, r: site.radius + 1 }, tZone]))
        const lc = id.toLowerCase()
        const main = makeRoute(`t-${lc}-main`, 't-exec', id, 'tSpawn', tStart, site.center, tBase)
        if (!main) throw Error(`${config.mapId}: no T route to ${id}`)
        routes.push(main)
        // Penalise the main corridor right up to the plant zone so the alternative uses another entrance where one exists.
        const keep = [tZone, { c: site.center.r, r: site.radius + 1 }]
        // Only the part after the first 30 % defines a corridor: spawn exits are shared.
        const tail = (r: WorldRoute) => { let acc = 0; return r.pts.filter((p, i) => (acc += i ? d2(r.pts[i - 1], p) : 0) >= r.length * 0.3) }
        const alt = makeRoute(`t-${lc}-alt`, 't-exec', id, 'tSpawn', tStart, site.center, combine(tBase, territory, corridorPenalty([tail(main)], keep)))
        if (alt) routes.push(alt)
        if (alt) {
            const third = makeRoute(`t-${lc}-split`, 't-exec', id, 'tSpawn', tStart, site.center, combine(tBase, territory, corridorPenalty([tail(main), tail(alt)], keep)))
            // Optional third corridor: only if it is short enough and stays out of CT-held ground.
            const ctSide = (r: WorldRoute) => r.world.slice(0, r.contactIndex).filter((p, i) => { const g = bk.ground(p[0], p[1], p[2], undefined, 40); return g && ctShare(g.area) < CT_TERRITORY && !inApproach(r.pts[i], p[2]) }).length / Math.max(1, r.contactIndex)
            if (third && third.length <= main.length * (config.splitMaxRatio ?? 1.35) && overlap(main.pts, third.pts) < 0.35 && overlap(alt.pts, third.pts) < 0.35 && ctSide(third) < 0.1) routes.push(third)
            else if (third) say(`t-${lc}-split rejected: length ${third.length.toFixed(0)} vs ${main.length.toFixed(0)}, overlap ${overlap(main.pts, third.pts).toFixed(2)}/${overlap(alt.pts, third.pts).toFixed(2)}, CT ground ${ctSide(third).toFixed(2)}`)
            say(`alt t-${lc}: CT ground ${ctSide(alt).toFixed(2)}`)
        }
        const ct = makeRoute(`ct-${lc}`, 'ct-setup', id, 'ctSpawn', ctStart, site.center, zonesPenalty([{ ...tZone, r: 12, f: 30, z: tStart.p[2] }], [siteKeep]))
        if (!ct) throw Error(`${config.mapId}: no CT route to ${id}`)
        routes.push(ct)
    }
    for (const [a, b] of [['A', 'B'], ['B', 'A']] as [SiteId, SiteId][]) {
        const r = makeRoute(`rot-${a.toLowerCase()}-${b.toLowerCase()}`, 'rotate', b, a, sites[a].center, sites[b].center, zonesPenalty([{ ...tZone, r: 12, f: 30, z: tStart.p[2] }], []))
        if (!r) throw Error(`${config.mapId}: no rotation ${a}→${b}`)
        routes.push(r)
    }
    // Lurks: walk the alternative T corridor of each site and stop short of its contact point.
    for (const id of ['A', 'B'] as SiteId[]) {
        const lc = id.toLowerCase()
        const src = routes.find(r => r.id === `t-${lc}-alt`) ?? routes.find(r => r.id === `t-${lc}-main`)!
        const back = 1.5
        let end = src.contactIndex, acc = 0
        while (end > 1 && acc < back) { acc += d2(src.pts[end], src.pts[end - 1]); end-- }
        const pts = src.pts.slice(0, end + 1), world = src.world.slice(0, end + 1)
        routes.push({ id: `lurk-${lc}`, kind: 'lurk', site: id, from: 'tSpawn', world, pts, contactIndex: pts.length - 1, length: lengthOf(pts) })
    }

    // Holds ─────────────────────────────────────────────────────────────────
    const holds: RoundMapHold[] = []
    const holdCands = (pred: (c: Cand) => boolean) => cands.filter(pred)
    const tExec = (id: SiteId) => routes.filter(r => r.kind === 't-exec' && r.site === id)
    const routeIdx = (r: WorldRoute, back: number) => { let i = r.contactIndex, acc = 0; while (i > 0 && acc < back) { acc += d2(r.pts[i], r.pts[i - 1]); i-- } return i }
    const nearHold = (c: Cand, gap: number) => holds.some(h => h.at.floor === c.r.floor && d2(h.at, c.r) < gap)
    const onRoute = (c: Cand, rs: WorldRoute[], tol: number) => rs.some(r => r.pts.some(p => p.floor === c.r.floor && d2(p, c.r) < tol))
    const addHold = (id: string, site: SiteId, kind: HoldKind, at: Cand, watch: { r: RPoint }) => holds.push({ id, site, kind, at: at.r, watch: watch.r })
    for (const id of ['A', 'B'] as SiteId[]) {
        const site = sites[id], lc = id.toLowerCase(), rs = tExec(id)
        const siteZ = site.center.p[2]
        // Each T route is watched at its first contact-zone point on the plant level that defenders can
        // actually see (routes may arrive through a door, a hut interior, a drop or a ladder).
        const sitePool = holdCands(c => c.r.floor === site.floor && Math.abs(c.p[2] - siteZ) <= 80 && d2(c.r, site.center.r) <= site.radius + 2)
        const visibleEntry = (r: WorldRoute) => {
            for (let i = r.contactIndex; i < r.pts.length; i++) {
                if (Math.abs(r.world[i][2] - siteZ) > 80) continue
                if (sitePool.some(c => d2(c.r, r.pts[i]) >= 3.5 && bk.los(c.p, r.world[i]))) return i
            }
            return r.contactIndex
        }
        const entrances = rs.map(r => ({ r, i: visibleEntry(r) })).filter((e, k, all) => all.findIndex(o => d2(o.r.pts[o.i], e.r.pts[e.i]) < 2.5) === k)
        // Site holds: on/next to the plant zone, line of sight to an entrance, as far back as useful.
        entrances.forEach((e, k) => {
            const target = { r: e.r.pts[e.i], p: e.r.world[e.i] }
            const pool = holdCands(c => c.r.floor === site.floor && Math.abs(c.p[2] - siteZ) <= 80 && d2(c.r, site.center.r) <= site.radius + 2 && !nearHold(c, 2.5))
            let best: Cand | null = null, bestScore = -Infinity
            for (const c of pool) {
                const dist = d2(c.r, target.r)
                if (dist < 3.5 || dist > 18 || !bk.los(c.p, target.p)) continue
                const covers = entrances.filter(o => o !== e && bk.los(c.p, o.r.world[o.i])).length
                const score = Math.min(dist, 10) + covers * 2 - d2(c.r, site.center.r) * 0.25 - (onRoute(c, rs, 1.5) ? 3 : 0)
                if (score > bestScore) { bestScore = score; best = c }
            }
            if (best) addHold(`${lc}-site-${k + 1}`, id, 'site', best, target)
            else say(`${lc} site hold for ${e.r.id}: pool ${pool.length}, in range ${pool.filter(c => d2(c.r, target.r) >= 3.5 && d2(c.r, target.r) <= 18).length}, los ${pool.filter(c => bk.los(c.p, target.p)).length}, target z ${target.p[2].toFixed(0)} at ${target.r.x.toFixed(1)},${target.r.y.toFixed(1)}`)
        })
        // Anchors: off the T path near an entrance, watching the approach just outside it.
        entrances.slice(0, 2).forEach((e, k) => {
            const wi = routeIdx(e.r, 2.5), watch = { r: e.r.pts[wi], p: e.r.world[wi] }
            const pool = holdCands(c => (bk.split === null || c.r.floor === site.floor) && d2(c.r, site.center.r) <= site.contact + 2 && d2(c.r, site.center.r) < d2(watch.r, site.center.r) && !nearHold(c, 2.5) && !onRoute(c, rs, 2))
            let best: Cand | null = null, bestScore = -Infinity
            for (const c of pool) {
                const dist = d2(c.r, watch.r)
                if (dist < 3 || dist > 12 || !bk.los(c.p, watch.p)) continue
                const score = -Math.abs(dist - 6) - (fromCT.get(c.area)! / bk.unitsPerPct) * 0.02
                if (score > bestScore) { bestScore = score; best = c }
            }
            if (best) addHold(`${lc}-anchor-${k + 1}`, id, 'anchor', best, watch)
        })
        // Retake: on the CT setup route just outside the contact zone, looking onto the site.
        const ct = routes.find(r => r.id === `ct-${lc}`)!
        let ri = ct.contactIndex, acc = 0
        while (ri > 0 && acc < 3) { acc += d2(ct.pts[ri], ct.pts[ri - 1]); ri-- }
        const retakeAt = cands.filter(c => c.r.floor === ct.pts[ri].floor).sort((a, b) => d2(a.r, ct.pts[ri]) - d2(b.r, ct.pts[ri]))[0]
        if (retakeAt) addHold(`${lc}-retake`, id, 'retake', retakeAt, { r: site.center.r })
        const count = holds.filter(h => h.site === id && h.kind !== 'retake').length
        if (count < 3) {
            // Fill up with the best remaining on-site positions that see the main entrance.
            const e = entrances[0], target = { r: e.r.pts[e.i], p: e.r.world[e.i] }
            const extra = holdCands(c => c.r.floor === site.floor && d2(c.r, site.center.r) <= site.contact && !nearHold(c, 3) && !onRoute(c, rs, 1.5) && d2(c.r, target.r) >= 3 && bk.los(c.p, target.p))
                .sort((a, b) => d2(b.r, target.r) - d2(a.r, target.r))
            for (const c of extra) {
                if (holds.filter(h => h.site === id && h.kind !== 'retake').length >= 3) break
                if (nearHold(c, 3)) continue
                addHold(`${lc}-site-x${holds.length}`, id, 'site', c, target)
            }
        }
    }
    // Mid holds: CT-side front line that sees the most T route points away from the sites.
    {
        const tPts = routes.filter(r => r.kind === 't-exec').flatMap(r => r.pts.map((p, i) => ({ r: p, p: r.world[i], i, route: r })))
            .filter(q => (['A', 'B'] as SiteId[]).every(s => d2(q.r, sites[s].center.r) > sites[s].contact + 3) && d2(q.r, spawnCentroid.T) > 10)
        const midAB = { x: (sites.A.center.r.x + sites.B.center.r.x) / 2, y: (sites.A.center.r.y + sites.B.center.r.y) / 2 }
        const pool = cands.filter(c => {
            const dt = fromT.get(c.area)!, dc = fromCT.get(c.area)!, ratio = dc / (dt + dc)
            return ratio > 0.3 && ratio < 0.48 && d2(c.r, midAB) < 0.45 * d2(sites.A.center.r, sites.B.center.r) && (['A', 'B'] as SiteId[]).every(s => d2(c.r, sites[s].center.r) > sites[s].contact + 3)
        })
        const scored: { c: Cand; seen: typeof tPts; score: number }[] = []
        for (let k = 0; k < pool.length; k += 2) {
            const c = pool[k]
            const seen = tPts.filter(q => q.r.floor === c.r.floor && d2(q.r, c.r) < 22 && d2(q.r, c.r) > 3 && bk.los(c.p, q.p))
            if (seen.length) scored.push({ c, seen, score: seen.length + new Set(seen.map(s => s.route.id)).size * 4 })
        }
        scored.sort((a, b) => b.score - a.score || a.c.area - b.c.area)
        const picks: typeof scored = []
        for (const s of scored) {
            if (picks.length >= 2) break
            if (picks.some(p => d2(p.c.r, s.c.r) < 8)) continue
            if (picks.length && s.score < picks[0].score * 0.5) break
            picks.push(s)
        }
        picks.forEach((s, k) => {
            const mid = [...s.seen].sort((a, b) => d2(a.r, s.c.r) - d2(b.r, s.c.r))[Math.floor(s.seen.length / 2)]
            const near = { A: d2(s.c.r, sites.A.center.r), B: d2(s.c.r, sites.B.center.r) }
            addHold(`mid-${k + 1}`, near.A <= near.B ? 'A' : 'B', 'mid', s.c, { r: mid.r })
        })
    }

    // Utility ───────────────────────────────────────────────────────────────
    const utility: RoundMapUtility[] = []
    const snapCand = (p: RPoint) => cands.filter(c => c.r.floor === p.floor).sort((a, b) => d2(a.r, p) - d2(b.r, p))[0]
    const addUtil = (id: string, site: SiteId, side: Side, kind: UtilityKind, at: RPoint, radius: number) => utility.push({ id, site, side, kind, at, radius })
    for (const id of ['A', 'B'] as SiteId[]) {
        const site = sites[id], lc = id.toLowerCase(), rs = tExec(id)
        const main = rs[0]
        const along = (r: WorldRoute, fromIdx: number, distPct: number, dir: 1 | -1) => { let i = fromIdx, acc = 0; while (i + dir >= 0 && i + dir < r.pts.length && acc < distPct) { acc += d2(r.pts[i], r.pts[i + dir]); i += dir } return i }
        // T smokes: where CTs walk into this site (CT setup route + rotation)...
        const smokes: RPoint[] = []
        const ctR = routes.find(r => r.id === `ct-${lc}`)!, rot = routes.find(r => r.kind === 'rotate' && r.site === id)!
        for (const r of [ctR, rot]) {
            const i = Math.max(0, along(r, r.contactIndex, site.contact - site.radius - 1, 1))
            const c = snapCand(r.pts[i])
            if (c && smokes.every(s => d2(s, c.r) >= 4)) smokes.push(c.r)
        }
        // Then smoke off the CT anchor spots that watch the entrances (never the T path itself).
        const siteHolds = holds.filter(h => h.site === id && (h.kind === 'site' || h.kind === 'anchor'))
        for (const h of [...siteHolds].sort((a, b) => (a.kind === 'anchor' ? 0 : 1) - (b.kind === 'anchor' ? 0 : 1))) {
            if (smokes.length >= 3) break
            if (smokes.every(s => d2(s, h.at) >= 3.5) && !rs.some(r => r.pts.slice(0, r.contactIndex + 1).some(p => p.floor === h.at.floor && d2(p, h.at) < 2))) smokes.push(h.at)
        }
        smokes.forEach((s, k) => addUtil(`t-${lc}-smoke-${k + 1}`, id, 'T', 'smoke', s, SMOKE_R))
        // T molotovs on the hold spots that are not already smoked.
        siteHolds.filter(h => smokes.every(s => d2(s, h.at) >= 2.5)).slice(0, 2).forEach((h, k) => addUtil(`t-${lc}-molotov-${k + 1}`, id, 'T', 'molotov', h.at, MOLOTOV_R))
        if (!utility.some(u => u.site === id && u.kind === 'molotov' && u.side === 'T') && siteHolds.length) addUtil(`t-${lc}-molotov-1`, id, 'T', 'molotov', siteHolds[0].at, MOLOTOV_R)
        // T flashes popped just past each entrance.
        rs.slice(0, 2).forEach((r, k) => {
            const i = along(r, r.contactIndex, 2, 1), c = snapCand(r.pts[i])
            if (c && utility.every(u => u.kind !== 'flash' || d2(u.at, c.r) >= 3)) addUtil(`t-${lc}-flash-${k + 1}`, id, 'T', 'flash', c.r, FLASH_R)
        })
        const anchor = holds.find(h => h.site === id && h.kind === 'anchor')
        if (anchor) addUtil(`t-${lc}-he`, id, 'T', 'he', anchor.at, HE_R)
        // CT retake: molotov the default plant, smoke the main T entrance.
        addUtil(`ct-${lc}-molotov`, id, 'CT', 'molotov', site.plantSpots[0].r, MOLOTOV_R)
        const back = along(main, main.contactIndex, 2, -1), cs = snapCand(main.pts[back])
        if (cs) addUtil(`ct-${lc}-smoke`, id, 'CT', 'smoke', cs.r, SMOKE_R)
    }

    // Assemble ──────────────────────────────────────────────────────────────
    const rp = (p: RPoint): RPoint => ({ x: round2(p.x), y: round2(p.y), floor: p.floor })
    const roundSite = (s: SiteInfo): RoundMapSite => ({ center: rp(s.center.r), polygon: s.polygon.map(p => rp({ ...p, floor: s.floor })), plantSpots: s.plantSpots.map(p => rp(p.r)) })
    const map: RoundMap = {
        schemaVersion: 1,
        mapId: config.mapId,
        floors: bk.floors,
        spawns: { T: spawns.T.map(s => rp(s.r)), CT: spawns.CT.map(s => rp(s.r)) },
        sites: { A: roundSite(sites.A), B: roundSite(sites.B) },
        routes: routes.map(r => {
            const pts = r.pts.map(rp)
            return { id: r.id, kind: r.kind, site: r.site, from: r.from, points: pts, length: round2(lengthOf(pts)), contactIndex: r.contactIndex }
        }),
        holds: holds.map(h => ({ id: h.id, site: h.site, kind: h.kind, at: rp(h.at), watch: rp(h.watch) })),
        utility: utility.map(u => ({ ...u, at: rp(u.at) })),
        runSpeed: round2(RIFLE_RUN_SPEED / bk.unitsPerPct),
    }
    for (const r of routes) say(`route ${r.id}: ${r.pts.length} pts, ${r.length.toFixed(1)}%, ${(r.length / map.runSpeed).toFixed(1)} s, contact @${r.contactIndex}`)
    for (const r of routes) {
        const off = r.pts.map((p, i) => ({ p: rp(p), i })).filter(({ p }) => { const w = bk.worldXY(p, p.floor); return ![[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6], [3, 0], [-3, 0], [0, 3], [0, -3]].some(([dx, dy]) => bk.nav.surfaces(w[0] + dx, w[1] + dy).some(q => bk.floorOf(q.point[2]) === p.floor)) })
        if (off.length) say(`route ${r.id}: ${off.length} point(s) off the nav: ${off.map(o => `#${o.i} ${o.p.x},${o.p.y} ${o.p.floor} z${r.world[o.i][2].toFixed(0)}`).join("; ")}`)
    }
    for (const id of ['A', 'B'] as SiteId[]) {
        const rs = routes.filter(r => r.kind === 't-exec' && r.site === id)
        for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) say(`overlap ${rs[i].id}/${rs[j].id}: all ${overlap(rs[i].pts, rs[j].pts).toFixed(2)}, approach ${corridorOverlap(rs[i], rs[j]).toFixed(2)}`)
    }
    return { map, baker: bk, extras: { contact: { A: sites.A.contact, B: sites.B.contact }, world: Object.fromEntries(routes.map(r => [r.id, r.world])) } }
}

// ─── Output ────────────────────────────────────────────────────────────────

/** Pretty JSON with every {x,y,floor} point on one line (keeps files small and diffable). */
function formatMap(map: RoundMap): string {
    return JSON.stringify(map, null, 1)
        .replace(/\{\n\s*"x": (-?[\d.]+),\n\s*"y": (-?[\d.]+),\n\s*"floor": "(upper|lower)"\n\s*\}/g, '{"x":$1,"y":$2,"floor":"$3"}')
        .replace(/\[\n\s*(\{"x"[^\n]*\})((?:,\n\s*\{"x"[^\n]*\})*)\n\s*\]/g, (_m, first: string, rest: string) => `[${first}${rest.replace(/,\n\s*/g, ',')}]`) + '\n'
}

// ─── Review images (tmp/round-maps-review) ─────────────────────────────────

interface ReviewExtras { contact: Record<SiteId, number>; world: Record<string, Vec3[]> }
interface View { x: number; y: number; w: number; h: number }
type Project = (p: Pt & { floor: Floor }) => [number, number] | null
type Layer = (P: Project, k: number) => string[]

const ROUTE_COLOUR = (r: RoundMapRoute) => r.kind === 'ct-setup' ? '#3d8bff' : r.kind === 'rotate' ? '#c8c8c8' : r.kind === 'lurk' ? '#ffd84a'
    : r.id.endsWith('-alt') ? '#ff3a3a' : r.id.endsWith('-split') ? '#ff4dff' : '#ff8a1f'

const layers = {
    sites: (map: RoundMap, extras: ReviewExtras): Layer => (P, k) => (['A', 'B'] as SiteId[]).flatMap(s => {
        const site = map.sites[s], c = P(site.center)
        if (!c) return []
        const poly = site.polygon.map(p => P(p)).filter(Boolean) as [number, number][]
        return [
            `<polygon points="${poly.map(p => p.join(',')).join(' ')}" fill="rgba(255,60,60,0.22)" stroke="#ff4040" stroke-width="1.5"/>`,
            `<circle cx="${c[0]}" cy="${c[1]}" r="${(extras.contact[s] * k).toFixed(1)}" fill="none" stroke="#ff4040" stroke-width="1" stroke-dasharray="4 4"/>`,
            `<text x="${c[0]}" y="${c[1]}" font-size="26" font-weight="bold" fill="#ff4040" stroke="black" stroke-width="1" text-anchor="middle" dy="-14">${s}</text>`,
            ...site.plantSpots.map(p => P(p)).filter(Boolean).map(p => `<circle cx="${p![0]}" cy="${p![1]}" r="3.5" fill="#ff2020" stroke="white" stroke-width="1"/>`),
        ]
    }),
    spawns: (map: RoundMap): Layer => P => (['T', 'CT'] as Side[]).flatMap(side => map.spawns[side].map(p => P(p)).filter(Boolean)
        .map(p => `<circle cx="${p![0]}" cy="${p![1]}" r="5" fill="${side === 'T' ? '#ffb000' : '#00a0ff'}" stroke="black" stroke-width="1.5"/>`)),
    routes: (routes: RoundMapRoute[], labels = true): Layer => P => routes.flatMap(r => {
        const out: string[] = [], col = ROUTE_COLOUR(r)
        let seg: [number, number][] = []
        const flush = () => { if (seg.length > 1) out.push(`<polyline points="${seg.map(p => p.join(',')).join(' ')}" fill="none" stroke="${col}" stroke-width="${r.kind === 't-exec' ? 3 : 2.2}" stroke-opacity="0.92" ${r.kind === 'lurk' ? 'stroke-dasharray="7 4"' : ''}/>`); seg = [] }
        for (const p of r.points) { const q = P(p); if (!q) { flush(); continue } seg.push(q) }
        flush()
        for (const p of r.points.map(P).filter(Boolean)) out.push(`<circle cx="${p![0]}" cy="${p![1]}" r="1.2" fill="${col}"/>`)
        const c = P(r.points[r.contactIndex])
        if (c) out.push(`<circle cx="${c[0]}" cy="${c[1]}" r="6" fill="none" stroke="${col}" stroke-width="2.5"/><circle cx="${c[0]}" cy="${c[1]}" r="2" fill="white"/>`)
        const lbl = P(r.points[Math.floor(r.points.length * 0.6)])
        if (labels && lbl) out.push(`<text x="${lbl[0]}" y="${lbl[1]}" font-size="13" font-weight="bold" fill="${col}" stroke="black" stroke-width="0.5" dx="6" dy="-4">${r.id}</text>`)
        return out
    }),
    holds: (holds: RoundMapHold[], labels = true): Layer => P => holds.flatMap(h => {
        const a = P(h.at), w = P(h.watch)
        if (!a) return []
        const col = h.kind === 'mid' ? '#b060ff' : h.kind === 'retake' ? '#00d0d0' : h.kind === 'anchor' ? '#1030c0' : '#2a6bff'
        return [
            ...(w ? [`<line x1="${a[0]}" y1="${a[1]}" x2="${w[0]}" y2="${w[1]}" stroke="${col}" stroke-width="1.6" stroke-dasharray="4 2"/><circle cx="${w[0]}" cy="${w[1]}" r="3" fill="${col}"/>`] : []),
            `<rect x="${a[0] - 5}" y="${a[1] - 5}" width="10" height="10" fill="${col}" stroke="white" stroke-width="1.2"/>`,
            ...(labels ? [`<text x="${a[0]}" y="${a[1]}" font-size="11" fill="white" stroke="black" stroke-width="0.4" dx="7" dy="-6">${h.id}</text>`] : []),
        ]
    }),
    utility: (utility: RoundMapUtility[], labels = true): Layer => (P, k) => utility.flatMap(u => {
        const a = P(u.at)
        if (!a) return []
        const fill = u.kind === 'smoke' ? (u.side === 'T' ? 'rgba(235,235,235,0.5)' : 'rgba(120,170,255,0.45)') : u.kind === 'molotov' ? (u.side === 'T' ? 'rgba(255,90,0,0.5)' : 'rgba(0,140,255,0.5)') : u.kind === 'flash' ? 'rgba(255,255,120,0.3)' : 'rgba(170,255,100,0.45)'
        return [`<circle cx="${a[0]}" cy="${a[1]}" r="${(u.radius * k).toFixed(1)}" fill="${fill}" stroke="${u.side === 'T' ? '#ffb070' : '#70b0ff'}" stroke-width="1.2"/>`,
            ...(labels ? [`<text x="${a[0]}" y="${a[1]}" font-size="10" fill="black" text-anchor="middle" dy="3">${u.side === 'CT' ? 'ct' : ''}${u.kind[0].toUpperCase()}</text>`] : [])]
    }),
}

async function panel(mapId: string, floor: Floor, view: View, width: number, content: Layer[], title: string): Promise<{ input: Buffer; w: number; h: number }> {
    const img = RADAR_IMAGES[mapId][floor] ?? RADAR_IMAGES[mapId].upper
    const k = width / view.w, height = Math.round(view.h * k), px = 1024 / 100
    const square = await sharp(path.join('public/maps', img)).resize(1024, 1024).png().toBuffer()
    const left = Math.min(1023, Math.round(view.x * px)), top = Math.min(1023, Math.round(view.y * px))
    const base = await sharp(square)
        .extract({ left, top, width: Math.min(1024 - left, Math.round(view.w * px)), height: Math.min(1024 - top, Math.round(view.h * px)) })
        .resize(width, height).png().toBuffer()
    const P: Project = p => p.floor === floor ? [round2((p.x - view.x) * k), round2((p.y - view.y) * k)] : null
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${content.flatMap(l => l(P, k)).join('')}<text x="10" y="24" font-size="20" fill="white" stroke="black" stroke-width="0.6">${title}</text></svg>`
    const input = await sharp({ create: { width, height, channels: 4, background: '#1b1f24' } }).composite([{ input: base }, { input: Buffer.from(svg) }]).png().toBuffer()
    return { input, w: width, h: height }
}

async function grid(rows: { input: Buffer; w: number; h: number }[][], file: string) {
    const W = Math.max(...rows.map(r => r.reduce((s, p) => s + p.w, 0))), H = rows.reduce((s, r) => s + Math.max(...r.map(p => p.h)), 0)
    const overlays: OverlayOptions[] = []
    let top = 0
    for (const row of rows) { let left = 0; for (const p of row) { overlays.push({ input: p.input, left, top }); left += p.w } top += Math.max(...row.map(p => p.h)) }
    await sharp({ create: { width: W, height: H, channels: 4, background: '#101215' } }).composite(overlays).png().toFile(file)
}

async function renderReview(map: RoundMap, extras: ReviewExtras, dir: string) {
    // Crop to the playable content (+ margin) so small-footprint maps (Nuke) stay legible.
    const everything = [...map.routes.flatMap(r => r.points), ...map.spawns.T, ...map.spawns.CT, ...map.sites.A.polygon, ...map.sites.B.polygon]
    const bx0 = Math.max(0, Math.min(...everything.map(p => p.x)) - 5), bx1 = Math.min(100, Math.max(...everything.map(p => p.x)) + 5)
    const by0 = Math.max(0, Math.min(...everything.map(p => p.y)) - 5), by1 = Math.min(100, Math.max(...everything.map(p => p.y)) + 5)
    const full: View = { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 }
    const all = [layers.sites(map, extras), layers.utility(map.utility, false), layers.routes(map.routes, false), layers.holds(map.holds, false), layers.spawns(map)]
    // 1. Overview: everything, one radar image per floor.
    await grid([await Promise.all(map.floors.map(f => panel(map.mapId, f, full, 1024, all, `${map.mapId} ${f}`)))], `${dir}/${map.mapId}.png`)
    // 2. Route groups.
    const groups: [string, RoundMapRoute[], Layer[]][] = [
        ['T to A', map.routes.filter(r => r.kind === 't-exec' && r.site === 'A'), []],
        ['T to B', map.routes.filter(r => r.kind === 't-exec' && r.site === 'B'), []],
        ['CT setup + rotate', map.routes.filter(r => r.kind === 'ct-setup' || r.kind === 'rotate'), []],
        ['lurk + mid holds', map.routes.filter(r => r.kind === 'lurk'), [layers.holds(map.holds.filter(h => h.kind === 'mid'))]],
    ]
    const size = 640
    const panels = await Promise.all(groups.map(([title, rs, extra]) => Promise.all(map.floors.map(f =>
        panel(map.mapId, f, full, size, [layers.sites(map, extras), layers.spawns(map), layers.routes(rs), ...extra], `${map.mapId} ${f}: ${title}`)))))
    const rows = map.floors.length > 1 ? panels : [[...panels[0], ...panels[1]], [...panels[2], ...panels[3]]]
    await grid(rows, `${dir}/${map.mapId}-routes.png`)
    // 2b. Every T route on its own.
    const tRoutes = map.routes.filter(r => r.kind === 't-exec' || r.kind === 'lurk')
    const one = map.floors.length > 1 ? 480 : 440
    const singles = await Promise.all(tRoutes.map(r => Promise.all(map.floors.map(f => panel(map.mapId, f, full, one, [layers.sites(map, extras), layers.spawns(map), layers.routes([r])], `${r.id} (${f})`)))))
    const perRow = map.floors.length > 1 ? 2 : 4
    const singleRows: { input: Buffer; w: number; h: number }[][] = []
    for (let i = 0; i < singles.length; i += perRow) singleRows.push(singles.slice(i, i + perRow).flat())
    await grid(singleRows, `${dir}/${map.mapId}-troutes.png`)
    // 3. Site close-ups: holds, utility, plant spots, routes entering.
    const sitePanels = await Promise.all((['A', 'B'] as SiteId[]).map(s => {
        const c = map.sites[s].center, half = 15
        const view = { x: Math.max(0, Math.min(100 - 2 * half, c.x - half)), y: Math.max(0, Math.min(100 - 2 * half, c.y - half)), w: 2 * half, h: 2 * half }
        return panel(map.mapId, c.floor, view, 760, [layers.sites(map, extras), layers.routes(map.routes, false), layers.utility(map.utility.filter(u => u.site === s)), layers.holds(map.holds), layers.spawns(map)], `${map.mapId} site ${s} (${c.floor})`)
    }))
    await grid([sitePanels], `${dir}/${map.mapId}-sites.png`)
}

async function main() {
    const args = process.argv.slice(2)
    const review = args.includes('--review')
    const only = args.filter(a => !a.startsWith('--'))
    mkdirSync('data/round-maps', { recursive: true })
    if (review) mkdirSync('tmp/round-maps-review', { recursive: true })
    for (const config of MAPS) {
        if (only.length && !only.includes(config.mapId)) continue
        const t0 = Date.now()
        const { map, baker, extras } = bakeMap(config)
        const text = formatMap(map)
        writeFileSync(`data/round-maps/${config.mapId}.json`, text)
        console.log(`\n${config.mapId}: ${(text.length / 1024).toFixed(1)} KB, ${map.routes.length} routes, ${map.holds.length} holds, ${map.utility.length} utility, ${((Date.now() - t0) / 1000).toFixed(1)} s`)
        for (const line of baker.log) console.log('  ' + line)
        if (review) await renderReview(map, extras, 'tmp/round-maps-review')
    }
}

if (/bake-round-maps\.ts$/.test(process.argv[1] || '')) main().catch(error => { console.error(error); process.exit(1) })
