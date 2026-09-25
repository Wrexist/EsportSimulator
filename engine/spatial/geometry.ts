import { mix3, type Vec3 } from "./types"

interface Box { min: Vec3; max: Vec3; left?: Box; right?: Box; triangles?: number[] }
export interface RayHit { point: Vec3; fraction: number; triangle: number; normal?: Vec3 }
export interface CollisionWorld { raycast(from: Vec3, to: Vec3): RayHit | null; movementHit(from: Vec3, to: Vec3, height?: number, radius?: number): RayHit | null; bodyHit?(point: Vec3, height?: number, radius?: number): RayHit | null; occupied?: readonly Vec3[] }
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Static two-sided triangle rays. Meshes are visibility references, not penetration materials. */
export class CollisionScene {
    private root: Box
    readonly triangleCount: number
    constructor(private vertices: Float32Array, private indices: Uint32Array) {
        if (vertices.length % 3 || indices.length % 3 || !indices.length || indices.length > 6_000_000) throw new Error("Invalid collision mesh size")
        if (vertices.some(n => !Number.isFinite(n)) || indices.some(i => i * 3 + 2 >= vertices.length)) throw new Error("Invalid collision mesh coordinates")
        this.triangleCount = indices.length / 3
        this.root = this.build(Array.from({ length: this.triangleCount }, (_, i) => i))
    }
    static fromBinary(buffer: ArrayBuffer) {
        if (buffer.byteLength < 16) throw new Error("Truncated collision mesh")
        const view = new DataView(buffer)
        if (view.getUint32(0, true) !== 0x484d5741 || view.getUint32(4, true) !== 1) throw new Error("Unsupported collision mesh")
        const nv = view.getUint32(8, true), nt = view.getUint32(12, true)
        if (nv > 2_000_000 || nt > 2_000_000 || 16 + nv * 12 + nt * 12 !== buffer.byteLength) throw new Error("Truncated or oversized collision mesh")
        return new CollisionScene(new Float32Array(buffer.slice(16, 16 + nv * 12)), new Uint32Array(buffer.slice(16 + nv * 12)))
    }
    private vertex(index: number): Vec3 { const i = index * 3; return [this.vertices[i], this.vertices[i + 1], this.vertices[i + 2]] }
    private build(triangles: number[]): Box {
        const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity]
        for (const t of triangles) for (let j = 0; j < 3; j++) { const p = this.vertex(this.indices[t * 3 + j]); for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]) } }
        if (triangles.length <= 12) return { min, max, triangles }
        let axis = 0; for (let k = 1; k < 3; k++) if (max[k] - min[k] > max[axis] - min[axis]) axis = k
        const centroid = (t: number) => (this.vertices[this.indices[t * 3] * 3 + axis] + this.vertices[this.indices[t * 3 + 1] * 3 + axis] + this.vertices[this.indices[t * 3 + 2] * 3 + axis]) / 3
        triangles.sort((a, b) => centroid(a) - centroid(b) || a - b)
        const middle = Math.floor(triangles.length / 2)
        return { min, max, left: this.build(triangles.slice(0, middle)), right: this.build(triangles.slice(middle)) }
    }
    raycast(from: Vec3, to: Vec3): RayHit | null {
        if (![...from, ...to].every(Number.isFinite)) throw new Error("Invalid ray coordinates")
        const direction = sub(to, from)
        let nearest = 1, triangle = -1
        // Same left-before-right traversal and arithmetic as the recursive solver,
        // without per-ray closures or per-triangle temporary vectors.
        const pending: Box[] = [this.root]
        while (pending.length) {
            const box = pending.pop()!
            let lo = 0, hi = nearest, intersects = true
            for (let axis = 0; axis < 3; axis++) {
                if (Math.abs(direction[axis]) < 1e-10) {
                    if (from[axis] < box.min[axis] || from[axis] > box.max[axis]) { intersects = false; break }
                    continue
                }
                const a = (box.min[axis] - from[axis]) / direction[axis], b = (box.max[axis] - from[axis]) / direction[axis]
                lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b))
                if (lo > hi) { intersects = false; break }
            }
            if (!intersects) continue
            if (box.left && box.right) { pending.push(box.right, box.left); continue }
            for (const t of box.triangles || []) {
                const ai = this.indices[t * 3] * 3, bi = this.indices[t * 3 + 1] * 3, ci = this.indices[t * 3 + 2] * 3
                const ax = this.vertices[ai], ay = this.vertices[ai + 1], az = this.vertices[ai + 2]
                const e1x = this.vertices[bi] - ax, e1y = this.vertices[bi + 1] - ay, e1z = this.vertices[bi + 2] - az
                const e2x = this.vertices[ci] - ax, e2y = this.vertices[ci + 1] - ay, e2z = this.vertices[ci + 2] - az
                const hx = direction[1] * e2z - direction[2] * e2y
                const hy = direction[2] * e2x - direction[0] * e2z
                const hz = direction[0] * e2y - direction[1] * e2x
                const det = e1x * hx + e1y * hy + e1z * hz
                if (Math.abs(det) < 1e-9) continue
                const sx = from[0] - ax, sy = from[1] - ay, sz = from[2] - az
                const u = (sx * hx + sy * hy + sz * hz) / det
                if (u < -1e-7 || u > 1.0000001) continue
                const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x
                const v = (direction[0] * qx + direction[1] * qy + direction[2] * qz) / det
                if (v < -1e-7 || u + v > 1.0000001) continue
                const fraction = (e2x * qx + e2y * qy + e2z * qz) / det
                if (fraction >= 0 && fraction < nearest) { nearest = fraction; triangle = t }
            }
        }
        if (triangle < 0) return null
        const a = this.vertex(this.indices[triangle * 3]), b = this.vertex(this.indices[triangle * 3 + 1]), c = this.vertex(this.indices[triangle * 3 + 2])
        const n = cross(sub(b, a), sub(c, a)), length = Math.hypot(...n), sign = dot(n, direction) > 0 ? -1 : 1
        const normal = n.map(v => v / length * sign) as Vec3
        return { point: mix3(from, to, nearest), fraction: nearest, triangle, normal }
    }
    /** Conservative sampled body sweep; excludes floor contact. Does not claim a full capsule solver. */
    bodyHit(point: Vec3, height = 72, radius = 16): RayHit | null {
        for (const z of [20, height * 0.65, height - 2]) for (const angle of [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4]) {
            const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius
            const hit = this.raycast([point[0] - x, point[1] - y, point[2] + z], [point[0] + x, point[1] + y, point[2] + z])
            if (hit) return hit
        }
        for (const [x, y] of [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]]) {
            const hit = this.raycast([point[0] + x, point[1] + y, point[2] + 20], [point[0] + x, point[1] + y, point[2] + height - 2])
            if (hit) return hit
        }
        return null
    }
    movementHit(from: Vec3, to: Vec3, height = 72, radius = 16): RayHit | null {
        const dx = to[0] - from[0], dy = to[1] - from[1], length = Math.hypot(dx, dy)
        const side: Vec3 = length > 1e-6 ? [-dy / length * radius, dx / length * radius, 0] : [radius, 0, 0]
        for (const z of [20, height * 0.65, height - 2]) for (const offset of [-1, 0, 1]) {
            const a: Vec3 = [from[0] + side[0] * offset, from[1] + side[1] * offset, from[2] + z]
            const b: Vec3 = [to[0] + side[0] * offset, to[1] + side[1] * offset, to[2] + z]
            const hit = this.raycast(a, b); if (hit) return hit
        }
        return null
    }
}

/** Stationary teammate reservations for planning tests; no implicit crowd teleporting. */
export function withOccupiedBodies(base: CollisionWorld, points: Vec3[], height = 72): CollisionWorld {
    if (!points.length) return base
    // Match the execution solver's circular body footprint. Box corners used to
    // reject legal diagonal starting positions and permanently retire their routes.
    const bodySweep = (from: Vec3, to: Vec3, movingHeight = 72, radius = 16): RayHit | null => {
        let nearest: RayHit | null = null
        for (const p of points) {
            const x=from[0]-p[0],y=from[1]-p[1],dx=to[0]-from[0],dy=to[1]-from[1],dz=to[2]-from[2]
            const a=dx*dx+dy*dy,b=2*(x*dx+y*dy),c=x*x+y*y-(16+radius)**2
            let lo=0,hi=1
            if(a<1e-12){if(c>=0)continue}
            else {const d=b*b-4*a*c;if(d<=0)continue;lo=Math.max(lo,(-b-Math.sqrt(d))/(2*a));hi=Math.min(hi,(-b+Math.sqrt(d))/(2*a))}
            if(Math.abs(dz)<1e-12){if(from[2]>=p[2]+height||from[2]+movingHeight<=p[2])continue}
            else {const low=(p[2]-movingHeight-from[2])/dz,high=(p[2]+height-from[2])/dz;lo=Math.max(lo,Math.min(low,high));hi=Math.min(hi,Math.max(low,high))}
            if(lo>=hi||nearest&&lo>=nearest.fraction)continue
            const point=mix3(from,to,lo),nx=point[0]-p[0],ny=point[1]-p[1],length=Math.hypot(nx,ny)||1
            nearest={point,fraction:lo,triangle:-1,normal:[nx/length,ny/length,0]}
        }
        return nearest
    }
    const nearest = (a: RayHit | null, b: RayHit | null) => !a ? b : !b ? a : a.fraction <= b.fraction ? a : b
    // Reservations cannot become fictitious floor support or world sight blockers.
    return { occupied:[...(base.occupied||[]),...points].map(p=>[...p] as Vec3),raycast: (a,b)=>base.raycast(a,b), movementHit:(a,b,h,r)=>nearest(base.movementHit(a,b,h,r),bodySweep(a,b,h,r)),bodyHit:(p,h,r)=>base.bodyHit?.(p,h,r)||bodySweep(p,p,h,r) }
}
