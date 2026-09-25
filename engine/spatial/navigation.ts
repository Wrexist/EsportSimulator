import { center, distance3, mix3, surfaceHeight, type NavArea, type SpatialReference, type Vec3 } from "./types"
import type { CollisionWorld } from "./geometry"
import { airbornePlan } from './airborne'

export type Traversal = "walk" | "step" | "ladder" | "drop" | "jump"
export interface SpatialLink { id: string; from: number; to: number; start: Vec3; end: Vec3; kind: Traversal }
export interface RouteOptions { ladders: boolean; drops: boolean; jumps: boolean; blocked: number[]; links: SpatialLink[]; height: number }
export const DEFAULT_ROUTE_OPTIONS: RouteOptions = { ladders: true, drops: false, jumps: false, blocked: [], links: [], height: 72 }
export interface NavLocation { area: number; point: Vec3 }
export interface Route { areas: number[]; points: Vec3[]; kinds: Traversal[]; distance: number; rejected: number; reason?: string }
const emptyRoute = (reason: string, rejected = 0): Route => ({ areas: [], points: [], kinds: [], distance: 0, rejected, reason })

/** Follow the actual triangle fan of one nav polygon, including its interior creases. */
export function surfaceWalk(area: NavArea, a: Vec3, b: Vec3): Vec3[] {
    const dx=b[0]-a[0],dy=b[1]-a[1],cuts:number[]=[]
    for(let i=2;i<area.corners.length-1;i++){
        const p=area.corners[0],q=area.corners[i],ex=q[0]-p[0],ey=q[1]-p[1]
        const den=dx*ey-dy*ex
        if(Math.abs(den)<1e-8)continue
        const x=p[0]-a[0],y=p[1]-a[1],t=(x*ey-y*ex)/den,u=(x*dy-y*dx)/den
        if(t>1e-8&&t<1-1e-8&&u>=0&&u<=1)cuts.push(t)
    }
    return [a,...[...new Set(cuts)].sort((x,y)=>x-y).map(t=>{
        const p=mix3(a,b,t);p[2]=surfaceHeight(area,p[0],p[1])??p[2];return p
    }),b]
}

function portal(a: NavArea, b: NavArea, edge: number, targetEdge: number, fraction = .5): [Vec3, Vec3] | null {
    if (edge >= a.corners.length || targetEdge >= b.corners.length) return null
    const p = a.corners[edge], q = a.corners[(edge + 1) % a.corners.length], u = b.corners[targetEdge], v = b.corners[(targetEdge + 1) % b.corners.length]
    const dx = q[0] - p[0], dy = q[1] - p[1], length2 = dx * dx + dy * dy
    if (length2 < 1e-6) return null
    const projection = (r: Vec3) => ((r[0] - p[0]) * dx + (r[1] - p[1]) * dy) / length2
    const lo = Math.max(0, Math.min(projection(u), projection(v))), hi = Math.min(1, Math.max(projection(u), projection(v)))
    if (lo > hi + 1e-5) return null
    const start = mix3(p, q, lo + (hi-lo)*fraction)
    const tx = v[0] - u[0], ty = v[1] - u[1], tlen = tx * tx + ty * ty
    if (tlen < 1e-6) return null
    const end = mix3(u, v, Math.max(0, Math.min(1, ((start[0] - u[0]) * tx + (start[1] - u[1]) * ty) / tlen)))
    // An ordinary edge must share its horizontal boundary. Jumps across gaps require an explicit link.
    if (Math.hypot(start[0] - end[0], start[1] - end[1]) > 4) return null
    return [start, end]
}

export class NavigationMesh {
    private readonly floorSegments = new WeakMap<CollisionWorld, Map<string, boolean>>()
    private readonly bodySegments = new WeakMap<CollisionWorld, Map<string, boolean>>()
    private readonly grid = new Map<string, NavArea[]>()
    readonly areas: Map<number, NavArea>
    readonly links = new Map<number, SpatialLink[]>()
    private readonly passingPortals = new Map<string, SpatialLink[]>()
    private readonly portalOrigins = new Map<string, string>()
    readonly centers = new Map<number, Vec3>()
    excludedPortals = 0
    constructor(readonly reference: SpatialReference) {
        this.areas = new Map(reference.areas.map(area => [area.id, area]))
        for (const area of reference.areas) {
            const xs = area.corners.map(p => p[0]), ys = area.corners.map(p => p[1])
            for (let x = Math.floor(Math.min(...xs) / 128); x <= Math.floor(Math.max(...xs) / 128); x++) for (let y = Math.floor(Math.min(...ys) / 128); y <= Math.floor(Math.max(...ys) / 128); y++) {
                const key = `${x}:${y}`, bucket = this.grid.get(key) || []; bucket.push(area); this.grid.set(key, bucket)
            }
        }
        for (const area of reference.areas) {
            this.centers.set(area.id, center(area))
            const links: SpatialLink[] = []
            for (const edge of area.edges) {
                const target = this.areas.get(edge.target)
                const points = target && portal(area, target, edge.edge, edge.targetEdge)
                if (!points) { this.excludedPortals++; continue }
                const z0=surfaceHeight(area,points[0][0],points[0][1]),z1=surfaceHeight(target!,points[1][0],points[1][1])
                if(z0===null||z1===null){this.excludedPortals++;continue}
                points[0][2]=z0;points[1][2]=z1
                const dz = points[1][2] - points[0][2]
                const link:SpatialLink={ id: `${area.id}:${edge.target}:${edge.edge}`, from: area.id, to: edge.target, start: points[0], end: points[1], kind: dz > 20 ? "jump" : dz < -20 ? "drop" : Math.abs(dz) > .01 ? "step" : "walk" }
                links.push(link)
                if(link.kind==='walk'||link.kind==='step'){
                    const alternatives:SpatialLink[]=[]
                    for(const fraction of [.25,.75,.125,.875]){
                        const pair=portal(area,target!,edge.edge,edge.targetEdge,fraction)
                        if(!pair||distance3(pair[0],link.start)<16)continue
                        const z0=surfaceHeight(area,pair[0][0],pair[0][1]),z1=surfaceHeight(target!,pair[1][0],pair[1][1])
                        if(z0===null||z1===null||Math.abs(z1-z0)>20)continue
                        pair[0][2]=z0;pair[1][2]=z1
                        const id=`${link.id}:${fraction}`
                        alternatives.push({...link,id,start:pair[0],end:pair[1],kind:Math.abs(z1-z0)>.01?'step':'walk'})
                        this.portalOrigins.set(id,link.id)
                    }
                    this.passingPortals.set(link.id,alternatives)
                }
            }
            for (const ladder of reference.ladders) {
                if (area.laddersAbove.includes(ladder.id)) for (const target of ladder.topAreas) if (this.areas.has(target)) links.push({ id: `ladder:${ladder.id}:${area.id}:${target}`, from: area.id, to: target, start: ladder.bottom, end: ladder.top, kind: "ladder" })
                if (area.laddersBelow.includes(ladder.id)) for (const target of ladder.bottomAreas) if (this.areas.has(target)) links.push({ id: `ladder:${ladder.id}:${area.id}:${target}`, from: area.id, to: target, start: ladder.top, end: ladder.bottom, kind: "ladder" })
            }
            this.links.set(area.id, links)
        }
    }
    surfaces(x: number, y: number): NavLocation[] {
        return (this.grid.get(`${Math.floor(x / 128)}:${Math.floor(y / 128)}`) || []).flatMap(area => { const z = surfaceHeight(area, x, y); return z === null ? [] : [{ area: area.id, point: [x, y, z] as Vec3 }] }).sort((a, b) => a.point[2] - b.point[2] || a.area - b.area)
    }
    validLocation(location: NavLocation) {
        const area = this.areas.get(location.area), z = area && surfaceHeight(area, location.point[0], location.point[1])
        return z !== undefined && z !== null && Math.abs(z - location.point[2]) < 2
    }
    supported(point: Vec3, radius = 0, tolerance = 2): boolean {
        const samples = radius ? [[0, 0], ...Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4) * radius, Math.sin(i * Math.PI / 4) * radius])] : [[0, 0]]
        return samples.every(([x, y]) => this.surfaces(point[0] + x, point[1] + y).some(s => Math.abs(s.point[2] - point[2]) <= (radius ? 20 : tolerance)))
    }
    supportedSegment(a: Vec3, b: Vec3): boolean {
        const count = Math.max(1, Math.ceil(distance3(a, b) / 4))
        if (count > 10000) return false
        for (let i = 0; i <= count; i++) if (!this.supported(mix3(a, b, i / count), 0, 1.5)) return false
        return true
    }
    supportedBody(point: Vec3, scene: CollisionWorld, radius = 16): boolean {
        if (!this.supported(point)) return false
        // Nav boundaries describe center traversal and may be inset from physical floors.
        // Use actual downward floor rays at the footprint where nav coverage ends.
        return Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4) * radius, Math.sin(i * Math.PI / 4) * radius]).every(([x, y]) => {
            const px = point[0] + x, py = point[1] + y
            return this.surfaces(px, py).some(s => Math.abs(s.point[2] - point[2]) <= 20) || !!scene.raycast([px, py, point[2] + 20], [px, py, point[2] - 20])
        })
    }
    findRoute(start: NavLocation, end: NavLocation, options: RouteOptions = DEFAULT_ROUTE_OPTIONS, scene?: CollisionWorld): Route {
        // Worlds are immutable for a run; crowd reservations create a new world.
        // Reuse static edge sweeps across all ten actors without weakening checks.
        const blockedSweep = (a: Vec3,b: Vec3) => {
            if(!scene)return false
            let cache=this.bodySegments.get(scene)
            if(!cache){cache=new Map();this.bodySegments.set(scene,cache)}
            const key=[options.height,...a,...b].join(','),saved=cache.get(key)
            if(saved!==undefined)return saved
            const hit=!!scene.movementHit(a,b,options.height)
            if(cache.size>=100000)cache.clear()
            cache.set(key,hit);return hit
        }
        const supportedFootprint = (a: Vec3,b: Vec3) => {
            if (!scene) return true
            let cache=this.floorSegments.get(scene)
            if(!cache){cache=new Map();this.floorSegments.set(scene,cache)}
            const key=[options.height,...a,...b].join(','),saved=cache.get(key)
            if(saved!==undefined)return saved
            const count=Math.max(1,Math.ceil(distance3(a,b)/4))
            let clear=count<=10000
            for(let i=0;clear&&i<=count;i++){
                const p=mix3(a,b,i/count)
                clear=this.supportedBody(p,scene)&&!scene.bodyHit?.(p,options.height)
            }
            if(cache.size>=40000)cache.clear()
            cache.set(key,clear);return clear
        }
        const walking = (area:number,a:Vec3,b:Vec3):Vec3[]|null => {
            const tile=this.areas.get(area)!
            const clear=(points:Vec3[])=>points.slice(1).every((p,i)=>this.supportedSegment(points[i],p)&&supportedFootprint(points[i],p)&&!blockedSweep(points[i],p))
            const points=surfaceWalk(tile,a,b)
            if(clear(points))return points
            // Local passing pockets around explicitly supplied body reservations.
            // Never leave this polygon, ignore a floor, or read hidden opponents.
            const length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<1)return null
            const ux=(b[0]-a[0])/length,uy=(b[1]-a[1])/length
            for(const body of scene?.occupied||[]){
                const along=(body[0]-a[0])*ux+(body[1]-a[1])*uy,across=(body[0]-a[0])*uy-(body[1]-a[1])*ux
                if(along<0||along>length||Math.abs(across)>64||Math.abs(body[2]-a[2])>=72)continue
                for(const radius of [40,56])for(const sign of [1,-1]){
                    const corners=[Math.max(0,along-radius),Math.min(length,along+radius)].map(t=>{
                        const x=a[0]+ux*t-uy*radius*sign,y=a[1]+uy*t+ux*radius*sign,z=surfaceHeight(tile,x,y)
                        return z===null?null:[x,y,z] as Vec3
                    })
                    if(!corners[0]||!corners[1])continue
                    const waypoints=[a,corners[0],corners[1],b],detour:Vec3[]=[a]
                    for(let i=1;i<waypoints.length;i++)detour.push(...surfaceWalk(tile,waypoints[i-1],waypoints[i]).slice(1))
                    if(clear(detour))return detour
                }
            }
            return null
        }
        if (!this.validLocation(start) || !this.validLocation(end)) return emptyRoute("An endpoint is not on its selected navigation surface.")
        const blocked = new Set(options.blocked)
        if (blocked.has(start.area) || blocked.has(end.area)) return emptyRoute("A selected endpoint is in a blocked area.")
        if (scene && (scene.bodyHit?.(start.point, options.height) || scene.bodyHit?.(end.point, options.height))) return emptyRoute('An endpoint has insufficient body or head clearance.')
        if (start.area === end.area) {
            const points=walking(start.area,start.point,end.point)
            if(!points)return emptyRoute('The direct segment lacks supported floor or body clearance.')
            return { areas: [start.area], points, kinds: points.slice(1).map(()=>"walk"), distance: points.slice(1).reduce((sum,p,i)=>sum+distance3(points[i],p),0), rejected: 0 }
        }
        // Stable Dijkstra queue. Costs include transition distance and slower ladder traversal.
        const queue: { id: number; cost: number }[] = [{ id: start.area, cost: 0 }], costs = new Map([[start.area, 0]]), previous = new Map<number, SpatialLink>()
        const visited = new Set<number>()
        let rejected = 0
        while (queue.length) {
            queue.sort((a, b) => b.cost - a.cost || b.id - a.id)
            const next = queue.pop()!
            if (visited.has(next.id)) continue
            if (next.id === end.area) break
            visited.add(next.id)
            // A reserved body at the midpoint must not close an otherwise wide
            // shared edge. Alternative crossings retain every floor/body check.
            const native=(this.links.get(next.id)||[]).flatMap(link=>scene?.occupied?.length?[link,...(this.passingPortals.get(link.id)||[])]:[link])
            const clearPortals=new Set<string>()
            for (const link of [...native, ...options.links.filter(link => link.from === next.id)]) {
                const origin=this.portalOrigins.get(link.id)||link.id
                if(clearPortals.has(origin))continue
                if (!this.areas.has(link.to) || blocked.has(link.to) || visited.has(link.to)) continue
                if ((link.kind === "walk" || link.kind === "step") && Math.abs(link.start[2] - link.end[2]) > 20) { rejected++; continue }
                if ((link.kind === "ladder" && !options.ladders) || (link.kind === "drop" && !options.drops) || (link.kind === "jump" && !options.jumps)) continue
                if ((link.kind === 'jump' || link.kind === 'drop') && (!(scene ? this.supportedBody(link.start, scene) && this.supportedBody(link.end, scene) : this.supported(link.start, 16) && this.supported(link.end, 16)) || !airbornePlan(link.start, link.end, link.kind, scene, options.height, options.height === 54 ? 85 : 220))) { rejected++; continue }
                const a = next.id === start.area ? start.point : this.centers.get(next.id)!, b = link.to === end.area ? end.point : this.centers.get(link.to)!
                if (!this.validLocation({ area: link.from, point: link.start }) || !this.validLocation({ area: link.to, point: link.end }) || !walking(link.from,a,link.start) || !walking(link.to,link.end,b)) { rejected++; continue }
                if (link.kind === 'walk' && !this.supportedSegment(link.start, link.end)) { rejected++; continue }
                if (link.kind === 'step' && Math.hypot(link.start[0] - link.end[0], link.start[1] - link.end[1]) > 4) { rejected++; continue }
                if (link.kind === 'ladder' && (Math.hypot(link.start[0] - link.end[0], link.start[1] - link.end[1]) > 64 || distance3(link.start, link.end) > 512)) { rejected++; continue }
                if(link.kind==='walk'&&!supportedFootprint(link.start,link.end)){rejected++;continue}
                if (link.kind !== 'jump' && link.kind !== 'drop' && blockedSweep(link.start, link.end)) { rejected++; continue }
                // Preserve the original crossing whenever it works. Side samples
                // are a fallback, not extra route churn around distant teammates.
                clearPortals.add(origin)
                const cost = next.cost + distance3(a, link.start) + distance3(link.start, link.end) * (link.kind === "ladder" ? 2.5 : 1) + distance3(link.end, b)
                if (cost >= (costs.get(link.to) ?? Infinity)) continue
                costs.set(link.to, cost); previous.set(link.to, link); queue.push({ id: link.to, cost })
            }
        }
        if (!previous.has(end.area)) return emptyRoute("No supported route connects these surfaces with the current obstacles and stance. Try crouching or inspect the connections.", rejected)
        const chain: SpatialLink[] = []; let id = end.area
        while (id !== start.area) { const link = previous.get(id); if (!link || chain.length > this.areas.size) return emptyRoute("Invalid connection chain."); chain.unshift(link); id = link.from }
        const points: Vec3[] = [start.point], kinds: Traversal[] = []
        const push = (p: Vec3, kind: Traversal) => { if (distance3(points[points.length - 1], p) > 0.001) { points.push(p); kinds.push(kind) } }
        let valid=true
        const pushWalk=(area:number,target:Vec3)=>{
            const path=walking(area,points[points.length-1],target)
            if(!path){valid=false;return}
            path.slice(1).forEach(p=>push(p,'walk'))
        }
        chain.forEach((link, index) => {
            // Smooth only within the current surface; never skip directed portals or height transitions.
            if (index) {
                const a = points[points.length - 1], direct=walking(link.from,a,link.start)
                if(direct) { direct.slice(1).forEach(p=>push(p,'walk'));push(link.end,link.kind);return }
                pushWalk(link.from,this.centers.get(link.from)!)
            }
            pushWalk(link.from,link.start); push(link.end, link.kind)
        })
        pushWalk(end.area,end.point)
        if(!valid)return emptyRoute('Reconstructed route failed supported body clearance.',rejected)
        return { areas: [start.area, ...chain.map(link => link.to)], points, kinds, distance: points.slice(1).reduce((sum, p, index) => sum + distance3(points[index], p), 0), rejected }
    }
}
