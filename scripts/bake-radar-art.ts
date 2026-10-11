/**
 * Bake project-authored radar art from the navigation meshes (Phase 3 stream A).
 *
 *   npx tsx scripts/bake-radar-art.ts              # all maps → public/radar-art/*.webp + data/radar-art.json
 *   npx tsx scripts/bake-radar-art.ts --review     # also tmp/radar-art-review/<Map>-<floor>[-compare].png
 *   npx tsx scripts/bake-radar-art.ts Mirage Nuke --review
 *
 * Deterministic: pure geometry + fixed palette, no randomness, stable iteration order.
 *
 * Frame
 * Every image is a 1024² square in the LIVE radar percent frame (the frame MapRadarPanel's
 * SVG overlay, data/round-maps and the round script use), so a point (x %, y %) sits at
 * pixel (x · 10.24, y · 10.24). World → live radar % is exactly scripts/bake-round-maps.ts
 * `Baker.radar`: `toRadar` (engine/spatial/types.ts) then the inverse of the floor draft's
 * `registration.matrix`. Floors split at the overview's vertical section
 * (Nuke z < -495, Vertigo z < 11700 → lower), decided per pixel from the surface height.
 *
 * Layers (bottom → top), rendered at 2× and box-filtered down:
 *   ghost      lower-floor images only: the upper floor's footprint, very faint, for orientation
 *   walkable   union of the floor's reachable nav polygons, dilated (nav stops ~16 units short
 *              of walls) and closed so seams vanish, plus player-wide strips over the passages the
 *              round script's walk graph adds (doorways, ledge drops/jumps — bake-round-maps
 *              `Baker`); thin nav spurs (beams, ledge strips) removed; fill shaded by height
 *              (darker = lower)
 *   relief     hillshade on the smoothed height, soft shadow at the foot of ledges/boxes and
 *              thin ledge lines at height steps
 *   tints      T / CT spawn zones (hull of the spawn entities, grown and clipped by walking
 *              distance), A/B plant zones (native bombsite trigger pieces, public/map-studio/drafts)
 *   walls      crisp outline of the walkable union (outer walls and obstacles)
 *   ladders    small ladder glyphs
 * Site letters are NOT drawn (the radar renderer draws them). Background is transparent.
 *
 * QA (--review): every data/round-maps spawn, plant spot, hold and route point must land on the
 * walkable art of its floor (route points on a ladder excepted); the log reports any that do not.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp, { type OverlayOptions } from 'sharp'
import { Baker, MAPS } from './bake-round-maps'
import { toRadar, type NavArea, type SpatialReference, type Vec3 } from '../engine/spatial/types'
import type { Floor, RoundMap, RoundMapRoute } from '../engine/match/round-script-types'

// ─── Configuration ─────────────────────────────────────────────────────────

const OUT = 1024 // output size (px)
const SS = 2 // supersampling factor
const N = OUT * SS // working raster size

/** Design system v2 radar palette. */
const PALETTE = {
    low: rgb('#252D39'), // walkable, lowest ground of the floor
    high: rgb('#344052'), // walkable, highest ground of the floor
    wall: rgb('#566477'),
    site: rgb('#F2B53A'),
    ct: rgb('#5AA9FF'),
    t: rgb('#FF8A3D'),
    ladder: rgb('#8693A6'),
    ghost: rgb('#11161D'), // other floor's footprint on lower-floor images
    ghostEdge: rgb('#202833'),
}
const ALPHA = { site: 0.12, siteEdge: 0.4, spawn: 0.1, ledge: 0.5, shadow: 0.18, light: 0.06, dark: 0.1 }

/** World-unit geometry knobs. */
const DILATE = 12 // grow nav towards the walls (nav stops ~16 units short of them)
const CLOSE = 6 // morphological close radius: nav gaps < 2·(DILATE+CLOSE) units disappear
const BRIDGE_HALF = 16 // half width of a bridged passage (player radius)
const SPUR_RADIUS = 14 // strips narrower than 2× this (after dilation) are spur candidates…
const SPUR_LENGTH = 40 // …removed when they stick out further than this
const LEDGE_DZ = 30 // height step (units) drawn as a ledge; stairs/ramps are continuous in nav
const SHADE_GAIN = 1.2 // hillshade strength per unit of slope
const SPAWN_PAD = 110 // spawn zone: hull of the spawn entities grown by this…
const SPAWN_REACH = 420 // …and within this walking distance of an entity
/** Line widths at output scale (px). */
const WALL_W = 2
const SITE_EDGE_W = 1.1
const GHOST_EDGE_W = 1

const OUT_DIR = 'public/radar-art'
const MANIFEST = 'data/radar-art.json'
const REVIEW_DIR = 'tmp/radar-art-review'

/** Valve overview images the live radar used before this art (review only). */
const VALVE_RADAR: Record<string, { upper: string; lower?: string }> = {
    Sandstone: { upper: 'de_sandstone_radar_psd.png' },
    Mirage: { upper: 'de_mirage_radar_psd.png' },
    Inferno: { upper: 'de_inferno_radar_psd.png' },
    Nuke: { upper: 'de_nuke_radar_psd_1.png', lower: 'de_nuke_lower_radar_psd_2.png' },
    Overpass: { upper: 'de_overpass_radar_psd.png' },
    Vertigo: { upper: 'de_vertigo_radar_psd_1.png', lower: 'de_vertigo_lower_radar_psd_2.png' },
    Ancient: { upper: 'de_ancient_radar_psd.png' },
    Anubis: { upper: 'de_anubis_radar_psd.png' },
}

// ─── Small helpers ─────────────────────────────────────────────────────────

type RGB = [number, number, number]
interface Pt { x: number; y: number }
function rgb(hex: string): RGB { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v
const smoothstep = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t) }
const NUM = '(-?\\d+(?:\\.\\d+)?)'

function pointInPolygon(p: Pt, poly: Pt[]): boolean {
    let inside = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j]
        if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside
    }
    return inside
}

// ─── Raster primitives (N × N working grid) ───────────────────────────────

const INF = 1e20

/**
 * Squared Euclidean distance from every pixel to the nearest set pixel of `src`, plus that
 * pixel's index (Felzenszwalb–Huttenlocher, exact). -1 / INF when `src` is empty.
 */
function edt(src: Uint8Array, W = N, H = N): { d2: Float32Array; near: Int32Array } {
    const row = new Int32Array(W * H) // nearest set row in the same column
    for (let x = 0; x < W; x++) {
        let last = -1
        for (let y = 0; y < H; y++) { const i = y * W + x; if (src[i]) last = y; row[i] = last }
        let next = -1
        for (let y = H - 1; y >= 0; y--) {
            const i = y * W + x
            if (src[i]) next = y
            const up = row[i]
            if (up < 0 || (next >= 0 && next - y < y - up)) row[i] = next
        }
    }
    const d2 = new Float32Array(W * H), near = new Int32Array(W * H)
    const v = new Int32Array(W), z = new Float64Array(W + 1), f = new Float64Array(W)
    for (let y = 0; y < H; y++) {
        let k = -1
        for (let q = 0; q < W; q++) {
            const r = row[y * W + q]
            if (r < 0) continue
            f[q] = (y - r) * (y - r)
            if (k < 0) { k = 0; v[0] = q; z[0] = -INF; z[1] = INF; continue }
            let s = 0
            for (; ;) {
                const p = v[k]
                s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p)
                if (s <= z[k]) k--
                else break
            }
            k++; v[k] = q; z[k] = s; z[k + 1] = INF
        }
        if (k < 0) { for (let x = 0; x < W; x++) { d2[y * W + x] = INF; near[y * W + x] = -1 } continue }
        let j = 0
        for (let x = 0; x < W; x++) {
            while (z[j + 1] < x) j++
            const q = v[j]
            d2[y * W + x] = (x - q) * (x - q) + f[q]
            near[y * W + x] = row[y * W + q] * W + q
        }
    }
    return { d2, near }
}

const invert = (m: Uint8Array) => { const o = new Uint8Array(m.length); for (let i = 0; i < m.length; i++) o[i] = m[i] ? 0 : 1; return o }

/** Signed distance (px, positive inside) of a binary mask, half-pixel corrected. */
function signedDistance(mask: Uint8Array): Float32Array {
    const out = edt(mask).d2, inside = edt(invert(mask)).d2, sd = new Float32Array(mask.length)
    for (let i = 0; i < mask.length; i++) sd[i] = mask[i] ? Math.min(Math.sqrt(inside[i]), 64) - 0.5 : -(Math.min(Math.sqrt(out[i]), 64) - 0.5)
    return sd
}

/** Separable Gaussian blur, clamp-to-edge. */
function blur(src: Float32Array, sigma: number, W = N, H = N): Float32Array {
    const r = Math.max(1, Math.ceil(sigma * 3)), k = new Float32Array(2 * r + 1)
    let sum = 0
    for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += k[i + r] }
    for (let i = 0; i < k.length; i++) k[i] /= sum
    const tmp = new Float32Array(W * H), out = new Float32Array(W * H)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let s = 0
        for (let i = -r; i <= r; i++) { const xx = x + i < 0 ? 0 : x + i >= W ? W - 1 : x + i; s += src[y * W + xx] * k[i + r] }
        tmp[y * W + x] = s
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let s = 0
        for (let i = -r; i <= r; i++) { const yy = y + i < 0 ? 0 : y + i >= H ? H - 1 : y + i; s += tmp[yy * W + x] * k[i + r] }
        out[y * W + x] = s
    }
    return out
}

/** 4-connected components; returns label per pixel (-1 = not set) and component sizes. */
function components(mask: Uint8Array, W = N, H = N): { label: Int32Array; sizes: number[]; touchesBorder: boolean[] } {
    const label = new Int32Array(W * H).fill(-1), sizes: number[] = [], touches: boolean[] = []
    const stack = new Int32Array(W * H)
    for (let s = 0; s < W * H; s++) {
        if (!mask[s] || label[s] >= 0) continue
        const id = sizes.length
        let top = 0, size = 0, border = false
        stack[top++] = s; label[s] = id
        while (top) {
            const c = stack[--top]; size++
            const x = c % W, y = (c - x) / W
            if (x === 0 || y === 0 || x === W - 1 || y === H - 1) border = true
            if (x > 0 && mask[c - 1] && label[c - 1] < 0) { label[c - 1] = id; stack[top++] = c - 1 }
            if (x < W - 1 && mask[c + 1] && label[c + 1] < 0) { label[c + 1] = id; stack[top++] = c + 1 }
            if (y > 0 && mask[c - W] && label[c - W] < 0) { label[c - W] = id; stack[top++] = c - W }
            if (y < H - 1 && mask[c + W] && label[c + W] < 0) { label[c + W] = id; stack[top++] = c + W }
        }
        sizes.push(size); touches.push(border)
    }
    return { label, sizes, touchesBorder: touches }
}

/** Separable square max filter. */
function maxFilter(src: Float32Array, r: number, W = N, H = N): Float32Array {
    const tmp = new Float32Array(W * H), out = new Float32Array(W * H)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let m = -INF
        for (let i = Math.max(0, x - r); i <= Math.min(W - 1, x + r); i++) { const v = src[y * W + i]; if (v > m) m = v }
        tmp[y * W + x] = m
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let m = -INF
        for (let i = Math.max(0, y - r); i <= Math.min(H - 1, y + r); i++) { const v = tmp[i * W + x]; if (v > m) m = v }
        out[y * W + x] = m
    }
    return out
}

/** Fill every pixel centre inside a polygon (pixel coordinates). */
function fillPolygon(mask: Uint8Array, poly: Pt[]) {
    const xs = poly.map(p => p.x), ys = poly.map(p => p.y)
    const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(N - 1, Math.ceil(Math.max(...xs)))
    const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(N - 1, Math.ceil(Math.max(...ys)))
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (pointInPolygon({ x: x + 0.5, y: y + 0.5 }, poly)) mask[y * N + x] = 1
}

// ─── Map sources ───────────────────────────────────────────────────────────

interface DraftMark { kind: string; label?: string; note?: string; points: Pt[]; spatial?: { site?: 'A' | 'B' } }
interface Draft { floor: Floor; matrix: number[]; marks: DraftMark[] }

function loadDraft(file: string): Draft {
    const doc = JSON.parse(readFileSync(path.join('public/map-studio/drafts', file), 'utf8')) as { floor: Floor; registration?: { matrix: number[] }; marks: DraftMark[] }
    if (!doc.registration?.matrix) throw Error(`${file}: missing registration`)
    return { floor: doc.floor, matrix: doc.registration.matrix, marks: doc.marks }
}

class MapSource {
    readonly ref: SpatialReference
    readonly drafts: Draft[]
    readonly split: number | null
    /** Pixels (working raster) per world unit. */
    readonly pxPerUnit: number
    readonly log: string[] = []

    constructor(readonly mapId: string, drafts: { upper: string; lower?: string }) {
        this.ref = JSON.parse(readFileSync(`public/map-studio/spatial/${mapId}.json`, 'utf8')) as SpatialReference
        this.drafts = [loadDraft(drafts.upper), ...(drafts.lower ? [loadDraft(drafts.lower)] : [])]
        const split = Number(this.ref.transform.verticalsections?.default?.AltitudeMin)
        this.split = this.ref.radars.lower && Number.isFinite(split) ? split : null
        this.pxPerUnit = N / (100 * this.ref.transform.scale * 10.24)
    }

    get floors(): Floor[] { return this.split === null ? ['upper'] : ['upper', 'lower'] }
    floorOf(z: number): Floor { return this.split !== null && z < this.split ? 'lower' : 'upper' }
    matrix(floor: Floor): number[] { return (this.drafts.find(d => d.floor === floor) ?? this.drafts[0]).matrix }

    /** World → live radar percent on `floor` (bake-round-maps `Baker.radar`). */
    radar(p: Vec3, floor: Floor = this.floorOf(p[2])): Pt {
        const [x, y] = toRadar(p, this.ref), [a, b, c, d, e, f] = this.matrix(floor), det = a * e - b * d
        return { x: (e * (x - c) - b * (y - f)) / det, y: (a * (y - f) - d * (x - c)) / det }
    }
    /** World → working raster pixel on `floor`. */
    px(p: Vec3, floor: Floor): Pt { const r = this.radar(p, floor); return { x: r.x * N / 100, y: r.y * N / 100 } }

    /** Spawn entities (world origins) from the native drafts. */
    spawnOrigins(): { side: 'T' | 'CT'; p: Vec3 }[] {
        const out: { side: 'T' | 'CT'; p: Vec3 }[] = []
        for (const d of this.drafts) for (const m of d.marks) {
            const side = /^(T|CT) spawn/.exec(m.label || '')?.[1] as 'T' | 'CT' | undefined
            const o = new RegExp(`World origin ${NUM}, ${NUM}, ${NUM}`).exec(m.note || '')
            if (m.kind === 'callout' && side && o) out.push({ side, p: [Number(o[1]), Number(o[2]), Number(o[3])] })
        }
        return out
    }

    /** Native plant-zone trigger pieces (live radar %) per site and floor. */
    plantZones(): { site: 'A' | 'B'; floor: Floor; poly: Pt[] }[] {
        const out: { site: 'A' | 'B'; floor: Floor; poly: Pt[] }[] = []
        for (const d of this.drafts) for (const m of d.marks) {
            if (m.kind !== 'bombsite') continue
            const site = m.spatial?.site ?? (m.label || '').trim()[0]
            if (site === 'A' || site === 'B') out.push({ site, floor: d.floor, poly: m.points })
        }
        return out
    }

    /**
     * Nav areas reachable from the spawns (nav edges and ladders, either direction).
     * Drops disconnected islands (out-of-bounds roofs, unreachable props).
     */
    reachableAreas(extra: [number, number][] = []): NavArea[] {
        const areas = this.ref.areas, index = new Map(areas.map((a, i) => [a.id, i]))
        const parent = areas.map((_, i) => i)
        const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
        const join = (a: number | undefined, b: number | undefined) => { if (a === undefined || b === undefined) return; const ra = find(a), rb = find(b); if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb) }
        for (const a of areas) for (const e of a.edges) join(index.get(a.id), index.get(e.target))
        for (const l of this.ref.ladders) for (const t of l.topAreas) for (const b of l.bottomAreas) join(index.get(t), index.get(b))
        for (const [a, b] of extra) join(index.get(a), index.get(b))
        const roots = new Set<number>()
        for (const s of this.spawnOrigins()) {
            let best = -1, bestDz = Infinity
            areas.forEach((a, i) => {
                const xs = a.corners.map(c => c[0]), ys = a.corners.map(c => c[1])
                if (s.p[0] < Math.min(...xs) - 32 || s.p[0] > Math.max(...xs) + 32 || s.p[1] < Math.min(...ys) - 32 || s.p[1] > Math.max(...ys) + 32) return
                const dz = Math.abs(a.corners.reduce((sum, c) => sum + c[2], 0) / a.corners.length - s.p[2])
                if (dz < bestDz) { bestDz = dz; best = i }
            })
            if (best >= 0) roots.add(find(best))
        }
        if (!roots.size) throw Error(`${this.mapId}: no spawn on the nav`)
        const kept = areas.filter((_, i) => roots.has(find(i)))
        this.log.push(`nav: ${kept.length}/${areas.length} areas reachable from the spawns`)
        return kept
    }
}

// ─── One floor ─────────────────────────────────────────────────────────────

/** A walkable passage the nav polygons leave uncovered (round-script graph link, world space). */
interface Passage { a: Vec3; b: Vec3 }

interface FloorArt {
    floor: Floor
    /** Final walkable mask and its smoothed signed distance (working raster). */
    walk: Uint8Array
    sd: Float32Array
    /** Straight RGBA at output size. */
    rgba: Buffer
    /** Ladder glyphs (SVG, output scale) and ladder positions (live radar %). */
    ladders: string
    ladderAt: Pt[]
}

/** Rasterise the floor's nav polygons: highest surface height per pixel (NaN = none). */
function rasterNav(src: MapSource, areas: NavArea[], floor: Floor): Float32Array {
    const zb = new Float32Array(N * N).fill(NaN)
    for (const area of areas) {
        const zs = area.corners.map(c => c[2])
        if (src.split !== null && (floor === 'upper' ? Math.max(...zs) < src.split : Math.min(...zs) >= src.split)) continue
        const pts = area.corners.map(c => ({ ...src.px(c, floor), z: c[2] }))
        for (let k = 1; k < pts.length - 1; k++) {
            const a = pts[0], b = pts[k], c = pts[k + 1]
            const den = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y)
            if (Math.abs(den) < 1e-9) continue
            const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x))), x1 = Math.min(N - 1, Math.ceil(Math.max(a.x, b.x, c.x)))
            const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y))), y1 = Math.min(N - 1, Math.ceil(Math.max(a.y, b.y, c.y)))
            for (let y = y0; y <= y1; y++) {
                const py = y + 0.5
                for (let x = x0; x <= x1; x++) {
                    const px = x + 0.5
                    const u = ((b.y - c.y) * (px - c.x) + (c.x - b.x) * (py - c.y)) / den
                    const v = ((c.y - a.y) * (px - c.x) + (a.x - c.x) * (py - c.y)) / den
                    const w = 1 - u - v
                    if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue
                    const z = u * a.z + v * b.z + w * c.z
                    if (src.floorOf(z) !== floor) continue
                    const i = y * N + x
                    if (!(zb[i] >= z)) zb[i] = z
                }
            }
        }
    }
    return zb
}

/** Geodesic (8-neighbour chamfer) distance inside `mask` from seed pixels, up to `limit` px. */
function geodesic(mask: Uint8Array, seeds: number[], limit: number): Float64Array {
    const dist = new Float64Array(N * N).fill(INF) // float64: popped keys must compare exactly
    const heap: [number, number][] = []
    const push = (d: number, i: number) => {
        heap.push([d, i]); let c = heap.length - 1
        while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] < heap[c][0] || (heap[p][0] === heap[c][0] && heap[p][1] <= heap[c][1])) break;[heap[p], heap[c]] = [heap[c], heap[p]]; c = p }
    }
    const pop = (): [number, number] => {
        const top = heap[0], last = heap.pop()!
        if (heap.length) {
            heap[0] = last; let i = 0
            for (; ;) {
                const l = 2 * i + 1, r = l + 1; let m = i
                const less = (a: number, b: number) => heap[a][0] < heap[b][0] || (heap[a][0] === heap[b][0] && heap[a][1] < heap[b][1])
                if (l < heap.length && less(l, m)) m = l
                if (r < heap.length && less(r, m)) m = r
                if (m === i) break;[heap[m], heap[i]] = [heap[i], heap[m]]; i = m
            }
        }
        return top
    }
    for (const s of seeds) if (mask[s] && dist[s] > 0) { dist[s] = 0; push(0, s) }
    const steps: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]]
    while (heap.length) {
        const [d, i] = pop()
        if (d > dist[i] || d > limit) continue
        const x = i % N, y = (i - x) / N
        for (const [dx, dy, w] of steps) {
            const xx = x + dx, yy = y + dy
            if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue
            const j = yy * N + xx, nd = d + w
            if (!mask[j] || nd >= dist[j]) continue
            dist[j] = nd; push(nd, j)
        }
    }
    return dist
}

/** Convex hull (monotone chain). */
function convexHull(pts: Pt[]): Pt[] {
    const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y)
    if (p.length < 3) return p
    const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
    const lower: Pt[] = [], upper: Pt[] = []
    for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q) }
    for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q) }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

function bakeFloor(src: MapSource, areas: NavArea[], links: Passage[], floor: Floor, ghost: Float32Array | null): FloorArt {
    const say = (s: string) => src.log.push(`${floor}: ${s}`)
    const zb = rasterNav(src, areas, floor)
    const raw = new Uint8Array(N * N)
    let rawCount = 0
    for (let i = 0; i < zb.length; i++) if (zb[i] === zb[i]) { raw[i] = 1; rawCount++ }
    if (!rawCount) throw Error(`${src.mapId} ${floor}: no nav on this floor`)

    // Walkable union: dilate + close (in world units).
    const k = src.pxPerUnit
    const near = edt(raw)
    const grown = new Uint8Array(N * N), reach2 = ((DILATE + CLOSE) * k) ** 2
    for (let i = 0; i < grown.length; i++) grown[i] = near.d2[i] <= reach2 ? 1 : 0
    // Passages the nav leaves open (doorways, ledge drops/jumps, extra links): player-wide strips.
    let bridged = 0
    for (const { a, b } of links) {
        if (src.floorOf(a[2]) !== floor || src.floorOf(b[2]) !== floor) continue
        const pa = src.px(a, floor), pb = src.px(b, floor), len = Math.hypot(pb.x - pa.x, pb.y - pa.y)
        if (len < 2 * (DILATE + CLOSE) * k * 0.8) continue
        const h = BRIDGE_HALF * k, nx = -(pb.y - pa.y) / len * h, ny = (pb.x - pa.x) / len * h
        fillPolygon(grown, [{ x: pa.x + nx, y: pa.y + ny }, { x: pb.x + nx, y: pb.y + ny }, { x: pb.x - nx, y: pb.y - ny }, { x: pa.x - nx, y: pa.y - ny }])
        bridged++
    }
    const shrink = edt(invert(grown)).d2, close2 = (CLOSE * k) ** 2
    let walk = new Uint8Array(N * N)
    for (let i = 0; i < walk.length; i++) walk[i] = shrink[i] > close2 ? 1 : 0
    // Thin spurs (nav strips along ledges and beams, a few units wide): pieces an opening removes
    // that reach far from what it keeps. Edge shavings of the opening stay close and are kept.
    {
        const r = SPUR_RADIUS * k, inner = edt(invert(walk)).d2, core = new Uint8Array(N * N)
        for (let i = 0; i < core.length; i++) core[i] = inner[i] > r * r ? 1 : 0
        const opened = edt(core).d2, keep = new Uint8Array(N * N)
        for (let i = 0; i < keep.length; i++) keep[i] = walk[i] && opened[i] <= r * r ? 1 : 0
        const diff = new Uint8Array(N * N)
        for (let i = 0; i < diff.length; i++) diff[i] = walk[i] && !keep[i] ? 1 : 0
        const away = edt(keep).d2, parts = components(diff), reach = new Float32Array(parts.sizes.length)
        for (let i = 0; i < diff.length; i++) if (diff[i] && away[i] > reach[parts.label[i]]) reach[parts.label[i]] = away[i]
        let removed = 0
        const long2 = (SPUR_LENGTH * k) ** 2
        for (let i = 0; i < diff.length; i++) if (diff[i] && reach[parts.label[i]] > long2) { walk[i] = 0; removed++ }
        say(`${[...reach].filter(v => v > long2).length} thin spur(s) removed (${removed} px)`)
    }
    {
        const minIsland = (48 * k) ** 2, minHole = (14 * k) ** 2
        const fg = components(walk)
        for (let i = 0; i < walk.length; i++) if (walk[i] && fg.sizes[fg.label[i]] < minIsland) walk[i] = 0
        const bg = components(invert(walk))
        let holes = 0
        for (let i = 0; i < walk.length; i++) if (!walk[i] && !bg.touchesBorder[bg.label[i]] && bg.sizes[bg.label[i]] < minHole) { walk[i] = 1; holes++ }
        say(`${rawCount} nav px, ${bridged} passage(s) bridged, ${fg.sizes.filter(s => s >= minIsland).length} walkable region(s), ${holes} pinhole px filled`)
    }
    // Smooth the outline: blurred signed distance (≈ 1 px rounding at output scale).
    const sd = blur(signedDistance(walk), 1.4)
    walk = new Uint8Array(N * N)
    for (let i = 0; i < sd.length; i++) walk[i] = sd[i] > 0 ? 1 : 0

    // Height field: every pixel takes the nearest nav surface's height.
    const zf = new Float32Array(N * N)
    for (let i = 0; i < zf.length; i++) zf[i] = near.near[i] >= 0 ? zb[near.near[i]] : 0
    const zs: number[] = []
    for (let i = 0; i < zb.length; i += 7) if (zb[i] === zb[i]) zs.push(zb[i])
    zs.sort((a, b) => a - b)
    const zLo = zs[Math.floor(zs.length * 0.02)], zHi = Math.max(zLo + 1, zs[Math.floor(zs.length * 0.98)])
    say(`height ${zLo.toFixed(0)} … ${zHi.toFixed(0)}`)

    // Relief: hillshade (light from the top left) on the smoothed height, ledge lines at height
    // steps (drawn on the low side) and a soft shadow at the foot of ledges and boxes.
    const zSmooth = blur(zf, 1.5 * SS)
    const shade = new Float32Array(N * N)
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
        const i = y * N + x
        if (!walk[i]) continue
        const gx = (zSmooth[i + 1] - zSmooth[i - 1]) / 2, gy = (zSmooth[i + N] - zSmooth[i - N]) / 2
        shade[i] = Math.max(-1, Math.min(1, (gx + gy) / Math.SQRT2 * k * SHADE_GAIN))
    }
    const ledge = new Float32Array(N * N)
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
        const i = y * N + x
        if (!walk[i]) continue
        const z = zf[i]
        if (zf[i - 1] - z > LEDGE_DZ && walk[i - 1] || zf[i + 1] - z > LEDGE_DZ && walk[i + 1] || zf[i - N] - z > LEDGE_DZ && walk[i - N] || zf[i + N] - z > LEDGE_DZ && walk[i + N]) ledge[i] = 1
    }
    const ledgeLine = blur(ledge, 0.6)
    const zMax = maxFilter(zf, Math.round(5 * SS))
    const shadowRaw = new Float32Array(N * N)
    for (let i = 0; i < shadowRaw.length; i++) shadowRaw[i] = walk[i] ? smoothstep(LEDGE_DZ, 140, zMax[i] - zf[i]) : 0
    const shadow = blur(shadowRaw, 2.2 * SS)

    // Spawn zones: hull of the spawn entities grown by SPAWN_PAD, clipped to the walkable art and
    // to SPAWN_REACH of walking (so the tint never leaks through a wall into the next corridor).
    const walkNear = edt(walk).near
    const spawnCov: Record<'T' | 'CT', Float32Array> = { T: new Float32Array(N * N), CT: new Float32Array(N * N) }
    for (const side of ['T', 'CT'] as const) {
        const pts = src.spawnOrigins().filter(s => s.side === side && src.floorOf(s.p[2]) === floor).map(s => src.px(s.p, floor))
        if (!pts.length) continue
        const pix = (p: Pt) => Math.min(N - 1, Math.max(0, Math.floor(p.y))) * N + Math.min(N - 1, Math.max(0, Math.floor(p.x)))
        const seeds = pts.map(p => walk[pix(p)] ? pix(p) : walkNear[pix(p)]).filter(i => i >= 0)
        const hull = new Uint8Array(N * N), poly = convexHull(pts)
        if (poly.length >= 3) fillPolygon(hull, poly)
        for (const p of pts) hull[pix(p)] = 1
        const fromHull = edt(hull).d2, pad2 = (SPAWN_PAD * k) ** 2, reach = SPAWN_REACH * k
        const dist = geodesic(walk, seeds, reach)
        const zone = new Float32Array(N * N)
        for (let i = 0; i < zone.length; i++) zone[i] = fromHull[i] <= pad2 && dist[i] <= reach ? 1 : 0
        spawnCov[side] = blur(zone, 1)
        say(`${side} spawn zone from ${pts.length} entities`)
    }

    // Plant zones: union of the native trigger pieces, seams closed, outline from its distance field.
    const siteMask = new Uint8Array(N * N)
    for (const z of src.plantZones().filter(z => z.floor === floor)) fillPolygon(siteMask, z.poly.map(p => ({ x: p.x * N / 100, y: p.y * N / 100 })))
    let siteSd: Float32Array | null = null
    if (siteMask.some(v => v)) {
        const g = edt(siteMask).d2, seam = new Uint8Array(N * N)
        for (let i = 0; i < seam.length; i++) seam[i] = g[i] <= 4 ? 1 : 0
        const s = edt(invert(seam)).d2
        for (let i = 0; i < seam.length; i++) seam[i] = s[i] > 4 ? 1 : 0
        siteSd = blur(signedDistance(seam), 0.8)
        say(`plant zones: ${src.plantZones().filter(z => z.floor === floor).map(z => z.site).join('')}`)
    }

    // Composite at 2× (premultiplied), then box-filter to the output size.
    const acc = new Float32Array(N * N * 4)
    const over = (i: number, c: RGB, a: number) => {
        if (a <= 0) return
        const o = i * 4, inv = 1 - a
        acc[o] = c[0] * a + acc[o] * inv; acc[o + 1] = c[1] * a + acc[o + 1] * inv; acc[o + 2] = c[2] * a + acc[o + 2] * inv; acc[o + 3] = a + acc[o + 3] * inv
    }
    const WHITE: RGB = [255, 255, 255], BLACK: RGB = [0, 0, 0]
    const wallHalf = WALL_W * SS / 2, siteHalf = SITE_EDGE_W * SS / 2, ghostHalf = GHOST_EDGE_W * SS / 2
    for (let i = 0; i < N * N; i++) {
        const d = sd[i]
        if (ghost && ghost[i] > -ghostHalf - 1) {
            over(i, PALETTE.ghost, clamp01(ghost[i] + 0.5))
            over(i, PALETTE.ghostEdge, clamp01(ghostHalf + 0.5 - Math.abs(ghost[i])))
        }
        if (d < -wallHalf - 1) continue
        const fill = clamp01(d + 0.5)
        if (fill > 0) {
            const t = clamp01((zf[i] - zLo) / (zHi - zLo))
            over(i, [PALETTE.low[0] + (PALETTE.high[0] - PALETTE.low[0]) * t, PALETTE.low[1] + (PALETTE.high[1] - PALETTE.low[1]) * t, PALETTE.low[2] + (PALETTE.high[2] - PALETTE.low[2]) * t], fill)
            const s = shade[i]
            if (s > 0) over(i, WHITE, ALPHA.light * s * fill)
            else over(i, BLACK, -ALPHA.dark * s * fill)
            over(i, BLACK, ALPHA.shadow * shadow[i] * fill)
            over(i, PALETTE.t, ALPHA.spawn * spawnCov.T[i] * fill)
            over(i, PALETTE.ct, ALPHA.spawn * spawnCov.CT[i] * fill)
            if (siteSd) {
                over(i, PALETTE.site, ALPHA.site * clamp01(siteSd[i] + 0.5) * fill)
                over(i, PALETTE.site, ALPHA.siteEdge * clamp01(siteHalf + 0.5 - Math.abs(siteSd[i])) * clamp01(d - wallHalf))
            }
            over(i, PALETTE.wall, ALPHA.ledge * clamp01(ledgeLine[i] * 2) * clamp01(d - wallHalf))
        }
        over(i, PALETTE.wall, clamp01(wallHalf + 0.5 - Math.abs(d)))
    }
    const rgba = Buffer.alloc(OUT * OUT * 4)
    for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
        const s = [0, 0, 0, 0]
        for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) { const o = ((y * SS + dy) * N + x * SS + dx) * 4; s[0] += acc[o]; s[1] += acc[o + 1]; s[2] += acc[o + 2]; s[3] += acc[o + 3] }
        const a = s[3] / (SS * SS), o = (y * OUT + x) * 4
        if (a <= 0) continue
        rgba[o] = Math.round(s[0] / (SS * SS) / a); rgba[o + 1] = Math.round(s[1] / (SS * SS) / a); rgba[o + 2] = Math.round(s[2] / (SS * SS) / a); rgba[o + 3] = Math.round(a * 255)
    }
    const ladders = ladderMarks(src, floor)
    return { floor, walk, sd, rgba, ladders: ladders.map(l => l.svg).join(''), ladderAt: ladders.map(l => l.at) }
}

/** Small ladder glyphs (two rails, three rungs) along the climb direction, as SVG at output scale. */
function ladderMarks(src: MapSource, floor: Floor): { at: Pt; svg: string }[] {
    const centres = new Map(src.ref.areas.map(a => [a.id, a.corners.reduce((s, c) => [s[0] + c[0] / a.corners.length, s[1] + c[1] / a.corners.length], [0, 0])]))
    const out: { at: Pt; svg: string }[] = []
    for (const l of src.ref.ladders) {
        if (src.floorOf(l.top[2]) !== floor && src.floorOf(l.bottom[2]) !== floor) continue
        const from = centres.get(l.bottomAreas[0]) ?? centres.get(l.topAreas[0])
        if (!from) continue
        const p = src.radar(l.bottom, floor), q = src.radar([from[0], from[1], l.bottom[2]], floor)
        let ux = q.x - p.x, uy = q.y - p.y
        const len = Math.hypot(ux, uy) || 1
        ux /= len; uy /= len
        const c = { x: p.x * OUT / 100, y: p.y * OUT / 100 }, L = 7, Wd = 3.2, pad = 1.4
        const at = (s: number, t: number): [number, number] => [c.x + ux * s - uy * t, c.y + uy * s + ux * t]
        const xy = (s: number, t: number) => at(s, t).map(v => v.toFixed(2)).join(',')
        const line = (a: [number, number], b: [number, number]) => `<line x1="${a[0].toFixed(2)}" y1="${a[1].toFixed(2)}" x2="${b[0].toFixed(2)}" y2="${b[1].toFixed(2)}"/>`
        out.push({
            at: p,
            svg: `<polygon points="${[xy(-L / 2 - pad, -Wd - pad), xy(L / 2 + pad, -Wd - pad), xy(L / 2 + pad, Wd + pad), xy(-L / 2 - pad, Wd + pad)].join(' ')}" fill="#07090C" fill-opacity="0.8"/>`
                + `<g stroke="rgb(${PALETTE.ladder.join(',')})" stroke-width="1.1" stroke-linecap="round">${line(at(-L / 2, -Wd), at(L / 2, -Wd))}${line(at(-L / 2, Wd), at(L / 2, Wd))}${[-L / 3, 0, L / 3].map(s => line(at(s, -Wd), at(s, Wd))).join('')}</g>`,
        })
    }
    return out
}

// ─── Map → files ───────────────────────────────────────────────────────────

const svgDoc = (w: number, h: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`

async function encode(art: FloorArt): Promise<Buffer> {
    const base = sharp(art.rgba, { raw: { width: OUT, height: OUT, channels: 4 } })
    const layers: OverlayOptions[] = art.ladders ? [{ input: Buffer.from(svgDoc(OUT, OUT, art.ladders)) }] : []
    const png = await base.composite(layers).png().toBuffer()
    // Lossless: thin coloured lines survive (no chroma subsampling) and files stay ~30–130 KB.
    return sharp(png).webp({ lossless: true, effort: 6 }).toBuffer()
}

// ─── Review composites ─────────────────────────────────────────────────────

const ROUTE_COLOUR = (r: RoundMapRoute) => r.kind === 'ct-setup' ? '#3d8bff' : r.kind === 'rotate' ? '#c8c8c8' : r.kind === 'lurk' ? '#ffd84a'
    : r.id.endsWith('-alt') ? '#ff3a3a' : r.id.endsWith('-split') ? '#ff4dff' : '#ff8a1f'

/**
 * Round-map overlay for one floor. Points off the walkable art are ringed in magenta; route
 * points on a ladder (within 1 map-% of a ladder glyph) are on the climb, not the floor, and
 * only counted.
 */
function overlay(map: RoundMap, floor: Floor, art: FloorArt, size: number): { svg: string; off: string[]; onLadder: number } {
    const k = size / 100
    const onWalk = (p: Pt) => {
        const cx = Math.floor(p.x * N / 100), cy = Math.floor(p.y * N / 100)
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const x = cx + dx, y = cy + dy
            if (x >= 0 && y >= 0 && x < N && y < N && art.walk[y * N + x]) return true
        }
        return false
    }
    const off: string[] = [], parts: string[] = []
    let onLadder = 0
    const check = (what: string, p: Pt & { floor: Floor }) => {
        if (p.floor !== floor || onWalk(p)) return
        if (what.includes('#') && art.ladderAt.some(l => Math.hypot(l.x - p.x, l.y - p.y) <= 1)) onLadder++
        else off.push(`${what} ${p.x},${p.y}`)
    }
    for (const r of map.routes) {
        let seg: string[] = []
        const flush = () => { if (seg.length > 1) parts.push(`<polyline points="${seg.join(' ')}" fill="none" stroke="${ROUTE_COLOUR(r)}" stroke-width="${r.kind === 't-exec' ? 2.4 : 1.8}" stroke-opacity="0.9"${r.kind === 'lurk' ? ' stroke-dasharray="6 4"' : ''}/>`); seg = [] }
        r.points.forEach((p, i) => { check(`${r.id}#${i}`, p); if (p.floor !== floor) { flush(); return } seg.push(`${(p.x * k).toFixed(1)},${(p.y * k).toFixed(1)}`) })
        flush()
    }
    for (const s of ['A', 'B'] as const) {
        const site = map.sites[s]
        if (site.center.floor === floor) parts.push(`<polygon points="${site.polygon.map(p => `${(p.x * k).toFixed(1)},${(p.y * k).toFixed(1)}`).join(' ')}" fill="none" stroke="#ff4040" stroke-width="1" stroke-dasharray="3 3"/>`)
        for (const p of site.plantSpots) { check(`plant ${s}`, p); if (p.floor === floor) parts.push(`<circle cx="${(p.x * k).toFixed(1)}" cy="${(p.y * k).toFixed(1)}" r="3.2" fill="#ff2020" stroke="white" stroke-width="1"/>`) }
    }
    for (const side of ['T', 'CT'] as const) for (const p of map.spawns[side]) {
        check(`${side} spawn`, p)
        if (p.floor === floor) parts.push(`<circle cx="${(p.x * k).toFixed(1)}" cy="${(p.y * k).toFixed(1)}" r="4.5" fill="${side === 'T' ? '#ffb000' : '#00a0ff'}" stroke="black" stroke-width="1.2"/>`)
    }
    for (const h of map.holds) { check(`hold ${h.id}`, h.at); if (h.at.floor === floor) parts.push(`<rect x="${(h.at.x * k - 3).toFixed(1)}" y="${(h.at.y * k - 3).toFixed(1)}" width="6" height="6" fill="#2a6bff" stroke="white" stroke-width="0.8"/>`) }
    for (const o of off) {
        const m = / (-?[\d.]+),(-?[\d.]+)$/.exec(o)
        if (m) parts.push(`<circle cx="${(Number(m[1]) * k).toFixed(1)}" cy="${(Number(m[2]) * k).toFixed(1)}" r="7" fill="none" stroke="#ff00ff" stroke-width="2"/>`)
    }
    return { svg: parts.join(''), off, onLadder }
}

/** Outline of the walkable art (for drawing over the Valve image). */
function outlineSvg(walk: Uint8Array, size: number): Buffer {
    const s = N / size, img = Buffer.alloc(size * size * 4)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const i = Math.floor(y * s) * N + Math.floor(x * s)
        const edge = walk[i] && ((x > 0 && !walk[i - Math.floor(s)]) || (y > 0 && !walk[i - Math.floor(s) * N]) || (x < size - 1 && !walk[i + Math.floor(s)]) || (y < size - 1 && !walk[i + Math.floor(s) * N]))
        if (edge) { const o = (y * size + x) * 4; img[o] = 0; img[o + 1] = 255; img[o + 2] = 230; img[o + 3] = 255 }
    }
    return img
}

async function review(src: MapSource, art: FloorArt, webp: Buffer, map: RoundMap | null) {
    const bg = { r: 7, g: 9, b: 12, alpha: 1 }
    const title = (t: string) => `<text x="12" y="26" font-family="sans-serif" font-size="18" font-weight="bold" fill="white" stroke="black" stroke-width="0.6">${t}</text>`
    const ov = map ? overlay(map, art.floor, art, OUT) : { svg: '', off: [] as string[], onLadder: 0 }
    const ladderNote = ov.onLadder ? ` (${ov.onLadder} route point(s) on a ladder)` : ''
    if (ov.off.length) src.log.push(`${art.floor}: ${ov.off.length} round-map point(s) off the walkable art${ladderNote}: ${ov.off.slice(0, 8).join('; ')}`)
    else src.log.push(`${art.floor}: all round-map points on the walkable art${ladderNote}`)
    const label = `${src.mapId} ${art.floor} — ${(webp.length / 1024).toFixed(0)} KB${map ? `, ${ov.off.length} off-walkable` : ''}`
    await sharp({ create: { width: OUT, height: OUT, channels: 4, background: bg } })
        .composite([{ input: webp }, { input: Buffer.from(svgDoc(OUT, OUT, ov.svg + title(label))) }])
        .png().toFile(`${REVIEW_DIR}/${src.mapId}-${art.floor}.png`)
    // Side by side: new art | Valve overview with the new walkable outline in cyan.
    const valveFile = VALVE_RADAR[src.mapId]?.[art.floor] ?? VALVE_RADAR[src.mapId]?.upper
    const left = await sharp({ create: { width: OUT, height: OUT, channels: 4, background: bg } }).composite([{ input: webp }, { input: Buffer.from(svgDoc(OUT, OUT, title(`${src.mapId} ${art.floor}: new`))) }]).png().toBuffer()
    const valve = valveFile ? await sharp(path.join('public/maps', valveFile)).resize(OUT, OUT).png().toBuffer() : null
    const right = await sharp({ create: { width: OUT, height: OUT, channels: 4, background: bg } })
        .composite([...(valve ? [{ input: valve }] : []), { input: outlineSvg(art.walk, OUT), raw: { width: OUT, height: OUT, channels: 4 as const } }, { input: Buffer.from(svgDoc(OUT, OUT, title(`${valveFile ?? 'no Valve image'} + new outline`))) }])
        .png().toBuffer()
    await sharp({ create: { width: OUT * 2, height: OUT, channels: 4, background: bg } })
        .composite([{ input: left, left: 0, top: 0 }, { input: right, left: OUT, top: 0 }])
        .png().toFile(`${REVIEW_DIR}/${src.mapId}-${art.floor}-compare.png`)
}

// ─── Main ──────────────────────────────────────────────────────────────────

export const radarArtPath = (mapId: string, floor: Floor) => `/radar-art/${mapId}-${floor}.webp`

async function main() {
    const args = process.argv.slice(2)
    const doReview = args.includes('--review')
    const only = args.filter(a => !a.startsWith('--'))
    mkdirSync(OUT_DIR, { recursive: true })
    if (doReview) mkdirSync(REVIEW_DIR, { recursive: true })
    const manifest: Record<string, { upper: string; lower?: string }> = {}
    for (const config of MAPS) {
        const src = new MapSource(config.mapId, config.drafts)
        manifest[config.mapId] = Object.fromEntries(src.floors.map(f => [f, radarArtPath(config.mapId, f)])) as { upper: string; lower?: string }
        if (only.length && !only.includes(config.mapId)) continue
        const t0 = Date.now()
        // The round script's walk graph (bake-round-maps `Baker`): nav portals plus the doorway,
        // ledge drop/jump and extra links it adds where the nav polygons leave a gap.
        const graph = new Baker(config)
        const passages: Passage[] = [], pairs: [number, number][] = []
        for (const [, edges] of graph.adjacency) for (const e of edges) {
            pairs.push([e.link.from, e.link.to])
            if (/^(gap|door|extra):/.test(e.link.id)) passages.push({ a: e.link.start, b: e.link.end })
        }
        const areas = src.reachableAreas(pairs)
        let roundMap: RoundMap | null = null
        try { roundMap = JSON.parse(readFileSync(`data/round-maps/${config.mapId}.json`, 'utf8')) as RoundMap } catch { roundMap = null }
        const sizes: string[] = []
        // Lower-floor images carry the upper floor's footprint as a faint ghost for orientation.
        let upperSd: Float32Array | null = null
        for (const floor of src.floors) {
            const art = bakeFloor(src, areas, passages, floor, floor === 'lower' ? upperSd : null)
            if (floor === 'upper') upperSd = art.sd
            const webp = await encode(art)
            writeFileSync(path.join(OUT_DIR, `${config.mapId}-${floor}.webp`), webp)
            sizes.push(`${floor} ${(webp.length / 1024).toFixed(0)} KB`)
            if (doReview) await review(src, art, webp, roundMap)
        }
        console.log(`\n${config.mapId}: ${sizes.join(', ')} (${((Date.now() - t0) / 1000).toFixed(1)} s)`)
        for (const line of src.log) console.log('  ' + line)
    }
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
}

if (/bake-radar-art\.ts$/.test(process.argv[1] || '')) main().catch(error => { console.error(error); process.exit(1) })
