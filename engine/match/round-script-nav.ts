/**
 * Walk graph for the round script (Phase 2A).
 *
 * Every RoundMap route polyline becomes a chain of nodes; routes are stitched
 * where they meet, and spawns, holds, plant spots and site centres hang off
 * their nearest route nodes. Scripted players only ever stand on nodes or
 * walk along edges, so every position lies on the map's walkable data.
 *
 * One graph per RoundMap object (cached); shortest paths are memoized per
 * target node, so after the first rounds of a map path queries are lookups.
 */

import type { Floor, RPoint, RoundMap, Side, SiteId } from "./round-script-types"

/** Route points closer than this (same floor) become one node. */
const MERGE_DIST = 0.5
/** Longer route segments are split so nodes stay ≤ this far apart. */
const MAX_EDGE = 1.5
/** Nodes of different routes this close are joined (routes crossing / touching). */
const STITCH_DIST = 1.6
/** Spawns, holds and plant spots link to every route node this close (else to the nearest). */
const LINK_DIST = 3
/** Extra cost for walking *through* a spawn / hold / plant spot, so paths don't cut across a teammate's spot. */
const SPOT_DETOUR = 4
const CELL = 2

const len = (dx: number, dy: number) => Math.sqrt(dx * dx + dy * dy)

interface ShortestPaths {
    dist: Float64Array
    /** Next hop toward the target, -1 at the target / unreachable. */
    next: Int32Array
}

export class NavGraph {
    readonly x: number[] = []
    readonly y: number[] = []
    readonly floor: Floor[] = []
    readonly routeNodes = new Map<string, number[]>()
    readonly holdNodes = new Map<string, number>()
    readonly spawnNodes: Record<Side, number[]> = { T: [], CT: [] }
    readonly plantNodes: Record<SiteId, number[]> = { A: [], B: [] }
    readonly siteNodes: Record<SiteId, number>
    private readonly adj: number[][] = []
    /** Edge lengths, parallel to `adj`. */
    private readonly adjW: number[][] = []
    private readonly grid = new Map<number, number[]>()
    private readonly paths = new Map<number, ShortestPaths>()
    /** Nodes added for spawns / holds / plant spots / site centres (not route points). */
    private readonly spots = new Set<number>()

    constructor(readonly map: RoundMap) {
        for (const route of map.routes) {
            const nodes: number[] = []
            let prev: RPoint | null = null
            for (const p of route.points) {
                if (prev) {
                    const steps = Math.ceil(len(p.x - prev.x, p.y - prev.y) / MAX_EDGE)
                    for (let s = 1; s < steps; s++) {
                        const u = s / steps
                        nodes.push(this.addNode({ x: prev.x + (p.x - prev.x) * u, y: prev.y + (p.y - prev.y) * u, floor: u < 0.5 ? prev.floor : p.floor }))
                    }
                }
                nodes.push(this.addNode(p))
                prev = p
            }
            const chain = nodes.filter((n, i) => i === 0 || n !== nodes[i - 1])
            for (let i = 1; i < chain.length; i++) this.link(chain[i - 1], chain[i])
            this.routeNodes.set(route.id, chain)
        }
        const routeCount = this.size
        for (let n = 0; n < routeCount; n++) {
            for (const m of this.near(this.x[n], this.y[n], STITCH_DIST, this.floor[n])) if (m > n) this.link(n, m)
        }
        for (const side of ["T", "CT"] as const) this.spawnNodes[side] = map.spawns[side].map(p => this.attach(p, routeCount))
        for (const h of map.holds) this.holdNodes.set(h.id, this.attach(h.at, routeCount))
        this.siteNodes = { A: this.attach(map.sites.A.center, routeCount), B: this.attach(map.sites.B.center, routeCount) }
        for (const site of ["A", "B"] as const) this.plantNodes[site] = map.sites[site].plantSpots.map(p => this.attach(p, routeCount))
        this.connectComponents()
    }

    get size(): number {
        return this.x.length
    }

    point(n: number): RPoint {
        return { x: this.x[n], y: this.y[n], floor: this.floor[n] }
    }

    dist(a: number, b: number): number {
        return len(this.x[a] - this.x[b], this.y[a] - this.y[b])
    }

    neighbors(n: number): readonly number[] {
        return this.adj[n]
    }

    /** Walking distance between two nodes (Infinity if disconnected). */
    pathDist(from: number, to: number): number {
        return this.shortest(to).dist[from]
    }

    /** Node list from `from` to `to`, both included. */
    path(from: number, to: number): number[] {
        const sp = this.shortest(to)
        if (!Number.isFinite(sp.dist[from])) return [from]
        const out = [from]
        let c = from
        while (c !== to) {
            c = sp.next[c]
            out.push(c)
        }
        return out
    }

    /** Distances from every node to `to` (memoized; do not mutate). */
    distancesTo(to: number): Float64Array {
        return this.shortest(to).dist
    }

    /** Nodes within `r` of node `n` on its floor (including `n`). */
    around(n: number, r: number): number[] {
        return this.near(this.x[n], this.y[n], r, this.floor[n])
    }

    /** Closest node to a point, preferring its floor. */
    nearest(p: { x: number; y: number; floor?: Floor }): number {
        let best = -1
        let bestD = Infinity
        for (let r = CELL; r <= 16 && best < 0; r *= 2) {
            for (const n of this.near(p.x, p.y, r, p.floor)) {
                const d = len(this.x[n] - p.x, this.y[n] - p.y)
                if (d < bestD) { bestD = d; best = n }
            }
        }
        if (best >= 0) return best
        for (let n = 0; n < this.size; n++) {
            const d = len(this.x[n] - p.x, this.y[n] - p.y) + (p.floor && this.floor[n] !== p.floor ? 1000 : 0)
            if (d < bestD) { bestD = d; best = n }
        }
        return best
    }

    private addNode(p: RPoint): number {
        for (const n of this.near(p.x, p.y, MERGE_DIST, p.floor)) return n
        const id = this.size
        this.x.push(p.x)
        this.y.push(p.y)
        this.floor.push(p.floor)
        this.adj.push([])
        this.adjW.push([])
        const key = this.cellKey(Math.floor(p.x / CELL), Math.floor(p.y / CELL))
        const cell = this.grid.get(key)
        if (cell) cell.push(id)
        else this.grid.set(key, [id])
        return id
    }

    /** Add a point off the routes and link it to the route nodes around it. */
    private attach(p: RPoint, routeCount: number): number {
        const n = this.addNode(p)
        if (n >= routeCount) this.spots.add(n)
        const close = this.near(p.x, p.y, LINK_DIST, p.floor).filter(m => m !== n && m < routeCount)
        if (close.length) for (const m of close) this.link(n, m)
        else if (!this.adj[n].length) {
            let best = -1
            let bestD = Infinity
            for (let m = 0; m < routeCount; m++) {
                const d = len(this.x[m] - p.x, this.y[m] - p.y) + (this.floor[m] !== p.floor ? 1000 : 0)
                if (m !== n && d < bestD) { bestD = d; best = m }
            }
            if (best >= 0) this.link(n, best)
        }
        return n
    }

    private link(a: number, b: number): void {
        if (a === b || this.adj[a].includes(b)) return
        const w = this.dist(a, b)
        this.adj[a].push(b)
        this.adjW[a].push(w)
        this.adj[b].push(a)
        this.adjW[b].push(w)
    }

    /** Join any island to the main component through its closest node pair. */
    private connectComponents(): void {
        for (;;) {
            const comp = new Int32Array(this.size).fill(-1)
            let count = 0
            for (let s = 0; s < this.size; s++) {
                if (comp[s] >= 0) continue
                const stack = [s]
                comp[s] = count
                while (stack.length) for (const v of this.adj[stack.pop()!]) if (comp[v] < 0) { comp[v] = count; stack.push(v) }
                count++
            }
            if (count <= 1) return
            let best: [number, number] | null = null
            let bestD = Infinity
            for (let a = 0; a < this.size; a++) {
                if (comp[a] !== 0) continue
                for (let b = 0; b < this.size; b++) {
                    if (comp[b] === 0) continue
                    const d = this.dist(a, b) + (this.floor[a] !== this.floor[b] ? 50 : 0)
                    if (d < bestD) { bestD = d; best = [a, b] }
                }
            }
            this.link(best![0], best![1])
        }
    }

    private cellKey(cx: number, cy: number): number {
        return (cx + 64) * 1024 + (cy + 64)
    }

    private near(x: number, y: number, r: number, floor?: Floor): number[] {
        const out: number[] = []
        const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL)
        const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL)
        for (let cx = x0; cx <= x1; cx++) {
            for (let cy = y0; cy <= y1; cy++) {
                const cell = this.grid.get(this.cellKey(cx, cy))
                if (!cell) continue
                for (const n of cell) {
                    if (floor && this.floor[n] !== floor) continue
                    if (len(this.x[n] - x, this.y[n] - y) <= r) out.push(n)
                }
            }
        }
        return out
    }

    private shortest(target: number): ShortestPaths {
        const cached = this.paths.get(target)
        if (cached) return cached
        const n = this.size
        const dist = new Float64Array(n).fill(Infinity)
        const next = new Int32Array(n).fill(-1)
        const heapNode: number[] = []
        const heapKey: number[] = []
        const push = (v: number, k: number) => {
            let i = heapNode.length
            heapNode.push(v)
            heapKey.push(k)
            while (i > 0) {
                const p = (i - 1) >> 1
                if (heapKey[p] <= k) break
                heapNode[i] = heapNode[p]; heapKey[i] = heapKey[p]
                i = p
            }
            heapNode[i] = v; heapKey[i] = k
        }
        const pop = (): number => {
            const top = heapNode[0]
            const lastNode = heapNode.pop()!
            const lastKey = heapKey.pop()!
            if (heapNode.length) {
                let i = 0
                for (;;) {
                    const l = 2 * i + 1
                    if (l >= heapNode.length) break
                    const c = l + 1 < heapNode.length && heapKey[l + 1] < heapKey[l] ? l + 1 : l
                    if (heapKey[c] >= lastKey) break
                    heapNode[i] = heapNode[c]; heapKey[i] = heapKey[c]
                    i = c
                }
                heapNode[i] = lastNode; heapKey[i] = lastKey
            }
            return top
        }
        dist[target] = 0
        push(target, 0)
        while (heapNode.length) {
            const d = heapKey[0]
            const u = pop()
            if (d > dist[u]) continue
            const detour = u !== target && this.spots.has(u) ? SPOT_DETOUR : 0
            const nbrs = this.adj[u]
            const ws = this.adjW[u]
            for (let e = 0; e < nbrs.length; e++) {
                const v = nbrs[e]
                const nd = d + detour + ws[e]
                if (nd < dist[v]) {
                    dist[v] = nd
                    next[v] = u
                    push(v, nd)
                }
            }
        }
        const sp = { dist, next }
        this.paths.set(target, sp)
        return sp
    }
}

const graphs = new WeakMap<RoundMap, NavGraph>()

/** The (cached) walk graph of a round map. */
export function navGraphFor(map: RoundMap): NavGraph {
    let g = graphs.get(map)
    if (!g) {
        g = new NavGraph(map)
        graphs.set(map, g)
    }
    return g
}
