/**
 * Add the spots pros really use to each round map (data/round-maps/<Map>.json):
 * CT set-up spots become holds with their pro share, T waiting spots become
 * `stages`, and each new spot gets a short `spur` route from the route lines,
 * walked on the map's walkable raster (data/round-maps/walk/).
 *
 *   npx tsx scripts/pro-spots.ts <compact demo dir> --out docs/revamp/sight-engine/pro-spots
 *   npx tsx scripts/bake-pro-spots.ts [docs/revamp/sight-engine/pro-spots] [Map ...]
 *   npx tsx scripts/bake-round-visibility.ts      # the walk graph changed
 *
 * Re-runnable: earlier pro holds, stages and spurs are dropped first. Run it
 * again after scripts/bake-round-maps.ts (which rewrites the map without them).
 *
 * A CT spot within HOLD_MERGE of a geometry hold gives that hold its share
 * instead of adding one. Kinds follow the geometry bake: "site" near the site
 * centre, "anchor" further back toward one site, "mid" in between. Each new
 * hold watches the entrance it sees (mesh line of sight): its site's T route
 * points just before their contact point (any T route before it for mid),
 * about WATCH_AT away. A spot that sees none is left out.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DRAFTS, ROOT, World } from './map-world'
import { NavGraph } from '../engine/match/round-script-nav'
import { walkAreaFor, WALK_CELL, WALK_SIZE, type WalkArea } from '../engine/match/round-script-walkable'
import type { HoldKind, RPoint, RoundMap, RoundMapHold, RoundMapRoute, RoundMapStage, SiteId } from '../engine/match/round-script-types'
import type { ProSpot } from './pro-spots'

/** Smallest pro share worth a spot. */
const MIN_SHARE = 0.008
const HOLD_MERGE = 2
/** Spots this close to a spawn are the spawn shuffle, not a set-up. */
const SPAWN_GAP: Record<'CT' | 'T', number> = { CT: 5, T: 9 }
/** Kind by distance from the site centre (map-%). */
const SITE_R = 10
const ANCHOR_R = 24
const WATCH_AT = 11
const MAX_SPUR = 30

const r2 = (v: number) => Math.round(v * 100) / 100
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

/** Nearest point within 1.5 map-% (same floor) with nav ground right under it and a walkable cell, or null. */
function snap(W: World, walk: WalkArea, p: RPoint): RPoint | null {
    const good = (q: RPoint) => walk.ok(q.x, q.y, q.floor) && W.standable(r2(q.x), r2(q.y), q.floor)
    if (good(p)) return p
    let best: RPoint | null = null, bd = 1.5
    for (let dx = -1.5; dx <= 1.5; dx += WALK_CELL / 2) for (let dy = -1.5; dy <= 1.5; dy += WALK_CELL / 2) {
        const q = { x: p.x + dx, y: p.y + dy, floor: p.floor }
        const d = Math.hypot(dx, dy)
        if (d < bd && good(q)) { bd = d; best = q }
    }
    return best
}

/**
 * Walk from a spot to the nearest route node over walkable cells (8-way BFS),
 * pulled straight wherever the raster allows, ≤ 1.2 map-% between points.
 */
function spur(walk: WalkArea, g: NavGraph, routeNodes: number, from: RPoint): RPoint[] | null {
    const fl = from.floor
    const cell = (x: number, y: number) => Math.floor(x / WALK_CELL) * WALK_SIZE + Math.floor(y / WALK_CELL)
    const centre = (c: number) => ({ x: (Math.floor(c / WALK_SIZE) + 0.5) * WALK_CELL, y: ((c % WALK_SIZE) + 0.5) * WALK_CELL })
    const targets = new Map<number, number>()
    for (let n = 0; n < routeNodes; n++) if (g.floor[n] === fl) targets.set(cell(g.x[n], g.y[n]), n)
    const start = cell(from.x, from.y)
    const prev = new Map<number, number>([[start, -1]])
    const queue = [start]
    let hit = -1
    for (let qi = 0; qi < queue.length && hit < 0; qi++) {
        const c = queue[qi]
        if (targets.has(c)) { hit = c; break }
        const gx = Math.floor(c / WALK_SIZE), gy = c % WALK_SIZE
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const nx = gx + dx, ny = gy + dy
            if (nx < 0 || ny < 0 || nx >= WALK_SIZE || ny >= WALK_SIZE) continue
            const k = nx * WALK_SIZE + ny
            if (prev.has(k)) continue
            const p = centre(k)
            if (!walk.ok(p.x, p.y, fl)) continue
            prev.set(k, c)
            queue.push(k)
        }
    }
    if (hit < 0) return null
    const cells: { x: number; y: number }[] = []
    for (let c = hit; c !== -1; c = prev.get(c)!) cells.push(centre(c))
    cells.reverse()
    const node = targets.get(hit)!
    const raw = [{ x: from.x, y: from.y }, ...cells.slice(1, -1), { x: g.x[node], y: g.y[node] }]
    // String-pull: keep a point only when the straight line past it leaves the walkable raster.
    const pulled = [raw[0]]
    let i = 0
    while (i < raw.length - 1) {
        let j = raw.length - 1
        while (j > i + 1 && !walk.clear(raw[i].x, raw[i].y, raw[j].x, raw[j].y, fl)) j--
        pulled.push(raw[j])
        i = j
    }
    const out: RPoint[] = []
    let length = 0
    for (let k = 0; k < pulled.length; k++) {
        const p = pulled[k]
        if (k > 0) {
            const q = pulled[k - 1], d = dist(p, q)
            length += d
            const steps = Math.ceil(d / 1.2)
            for (let s = 1; s < steps; s++) out.push({ x: r2(q.x + (p.x - q.x) * s / steps), y: r2(q.y + (p.y - q.y) * s / steps), floor: fl })
        }
        out.push({ x: r2(p.x), y: r2(p.y), floor: fl })
    }
    return length <= MAX_SPUR ? out.filter((p, k) => k === 0 || p.x !== out[k - 1].x || p.y !== out[k - 1].y) : null
}

function routeOf(id: string, site: SiteId, points: RPoint[]): RoundMapRoute {
    let length = 0
    for (let i = 1; i < points.length; i++) length += dist(points[i - 1], points[i])
    return { id, kind: 'spur', site, from: site, points, length: r2(length), contactIndex: 0 }
}

function bake(mapId: string, spotsDir: string): void {
    const file = path.join(ROOT, `data/round-maps/${mapId}.json`)
    const src = path.join(spotsDir, `${mapId}.json`)
    if (!existsSync(src)) { console.log(`${mapId}: no pro spots, skipped`); return }
    const map = JSON.parse(readFileSync(file, 'utf8')) as RoundMap
    map.holds = map.holds.filter(h => !h.pro).map(h => { const { share: _s, ...rest } = h; void _s; return rest })
    map.routes = map.routes.filter(r => r.kind !== 'spur')
    delete map.stages
    const pro = JSON.parse(readFileSync(src, 'utf8')) as { ct: ProSpot[]; t: ProSpot[] }
    const g = new NavGraph(map)
    const routeNodes = countRouteNodes(g, map)
    const walk = walkAreaFor(mapId)
    const W = new World(mapId)
    const sees = (a: RPoint, b: RPoint) => {
        const ga = W.grounds(a.x, a.y, a.floor), gb = W.grounds(b.x, b.y, b.floor)
        return ga.some(p => gb.some(q => W.los(p, q)))
    }
    const centre = { A: map.sites.A.center, B: map.sites.B.center }
    let added = 0, merged = 0, stages = 0, dropped = 0, blind = 0

    // CT set-up spots → holds.
    const kinds: Record<string, number> = {}
    for (const s of pro.ct) {
        if (s.share < MIN_SHARE) continue
        const at = snap(W, walk, { x: s.x, y: s.y, floor: s.floor })
        if (!at || map.spawns.CT.some(p => p.floor === at.floor && dist(p, at) < SPAWN_GAP.CT)) { dropped++; continue }
        const geo = map.holds.find(h => !h.pro && h.at.floor === at.floor && dist(h.at, at) < HOLD_MERGE)
        if (geo) { geo.share = Math.round(((geo.share ?? 0) + s.share) * 1e4) / 1e4; merged++; continue }
        const dA = dist(at, centre.A), dB = dist(at, centre.B)
        const site: SiteId = dA <= dB ? 'A' : 'B'
        const dS = Math.min(dA, dB), dO = Math.max(dA, dB)
        const kind: HoldKind = dS <= SITE_R ? 'site' : dS <= ANCHOR_R && dS < dO * 0.7 ? 'anchor' : 'mid'
        const walkTo = spur(walk, g, routeNodes, at)
        if (!walkTo) { dropped++; continue }
        // Watch: the entrance Ts come through, seen from here (mesh line of sight). Site and
        // anchor holds look at the stretch of their site's T routes just before the contact
        // point; mid holds at any T route before its contact point. Else any T route point in sight.
        let watch = null as RPoint | null, best = Infinity
        for (const pass of [0, 1]) {
            for (const r of map.routes) {
                if (r.kind !== 't-exec' && r.kind !== 'lurk') continue
                if (pass === 0 && kind !== 'mid' && r.site !== site) continue
                r.points.forEach((p, i) => {
                    if (p.floor !== at.floor) return
                    const d = dist(p, at)
                    if (d < 3 || d > 24) return
                    const k = i - r.contactIndex
                    if (pass === 0 && (k < -12 || k > 2)) return
                    const score = (pass === 0 ? Math.abs(k) * 0.5 : 0) + Math.abs(d - WATCH_AT) * 0.3 + (r.site !== site ? 3 : 0)
                    if (score < best && sees(at, p)) { best = score; watch = p }
                })
            }
            if (watch) break
            // A set-up that sees no T way in is a passive spot the sight engine would never play: leave it out.
            break
        }
        if (!watch) { blind++; continue }
        const n = (kinds[`${site}${kind}`] = (kinds[`${site}${kind}`] ?? 0) + 1)
        const id = `${site.toLowerCase()}-pro-${kind}-${n}`
        const hold: RoundMapHold = { id, site, kind, at: { x: r2(at.x), y: r2(at.y), floor: at.floor }, watch: { x: watch.x, y: watch.y, floor: watch.floor }, share: s.share, pro: true }
        map.holds.push(hold)
        if (walkTo.length > 1) map.routes.push(routeOf(`spur-${id}`, site, walkTo))
        added++
    }

    // T waiting spots → stages.
    const list: RoundMapStage[] = []
    for (const s of pro.t) {
        if (s.share < MIN_SHARE) continue
        const at = snap(W, walk, { x: s.x, y: s.y, floor: s.floor })
        if (!at || map.spawns.T.some(p => p.floor === at.floor && dist(p, at) < SPAWN_GAP.T)) { dropped++; continue }
        const site: SiteId = dist(at, centre.A) <= dist(at, centre.B) ? 'A' : 'B'
        const walkTo = spur(walk, g, routeNodes, at)
        if (!walkTo) { dropped++; continue }
        const id = `t-pro-${list.length + 1}`
        list.push({ id, site, at: { x: r2(at.x), y: r2(at.y), floor: at.floor }, share: s.share })
        if (walkTo.length > 1) map.routes.push(routeOf(`spur-${id}`, site, walkTo))
        stages++
    }
    if (list.length) map.stages = list
    writeFileSync(file, formatMap(map))
    console.log(`${mapId}: ${added} pro holds, ${merged} merged into geometry holds, ${blind} without a view of a T way in, ${stages} T stages, ${dropped} dropped`)
}

/** Nodes the routes made (they come first in the graph). */
function countRouteNodes(g: NavGraph, map: RoundMap): number {
    let max = -1
    for (const r of map.routes) for (const n of g.routeNodes.get(r.id) ?? []) if (n > max) max = n
    return max + 1
}

/** Same layout as scripts/bake-round-maps.ts: every point on one line. */
function formatMap(map: RoundMap): string {
    return JSON.stringify(map, null, 1)
        .replace(/\{\n\s*"x": (-?[\d.]+),\n\s*"y": (-?[\d.]+),\n\s*"floor": "(upper|lower)"\n\s*\}/g, '{"x":$1,"y":$2,"floor":"$3"}')
        .replace(/\[\n\s*(\{"x"[^\n]*\})((?:,\n\s*\{"x"[^\n]*\})*)\n\s*\]/g, (_m, first: string, rest: string) => `[${first}${rest.replace(/,\n\s*/g, ',')}]`) + '\n'
}

const args = process.argv.slice(2)
const dir = args[0] && !DRAFTS[args[0]] ? args.shift()! : path.join(ROOT, 'docs/revamp/sight-engine/pro-spots')
for (const id of Object.keys(DRAFTS)) if (!args.length || args.includes(id)) bake(id, dir)
