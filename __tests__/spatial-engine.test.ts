import { readFileSync } from "fs"
import { createHash } from "crypto"
import { CollisionScene, withOccupiedBodies } from "@/engine/spatial/geometry"
import { NavigationMesh, DEFAULT_ROUTE_OPTIONS } from "@/engine/spatial/navigation"
import { simulateMovement } from "@/engine/spatial/movement"
import { center, fromRadar, surfaceHeight, toRadar, type NavArea, type SpatialReference, type Vec3 } from "@/engine/spatial/types"
import { emptyLabProject, parseLabProject } from "@/lib/spatial-lab-project"

const area = (id: number, x: number, z = 0): NavArea => ({ id, hull: 0, flags: "0", movable: 4294967295, corners: [[x, 0, z], [x + 100, 0, z], [x + 100, 100, z], [x, 100, z]], edges: [], laddersAbove: [], laddersBelow: [] })
const ref = (areas: NavArea[]): SpatialReference => ({ format: "esim-spatial-reference", version: 1, mapId: "Mirage", sourceMap: "de_mirage", sourceVersion: "test", sourceUrl: "https://example.com", meshSha256: "test", areas, ladders: [], radars: { upper: "/test.png" }, transform: { pos_x: -1000, pos_y: 1000, scale: 5 } })
const clear = () => new CollisionScene(new Float32Array([10000, 0, 0, 10000, 100, 0, 10000, 0, 100]), new Uint32Array([0, 1, 2]))
const wall = () => new CollisionScene(new Float32Array([100, -100, -100, 100, 200, -100, 100, 200, 200, 100, -100, 200]), new Uint32Array([0, 1, 2, 0, 2, 3]))
const location = (a: NavArea) => ({ area: a.id, point: center(a) })

describe("spatial foundation", () => {
    it('uses clear width of a shared edge when a body occupies its midpoint',()=>{
        const a=area(1,0),b=area(2,100)
        a.corners=[[0,0,0],[100,0,0],[100,240,0],[0,240,0]]
        b.corners=[[100,0,0],[200,0,0],[200,240,0],[100,240,0]]
        a.edges=[{target:2,edge:1,targetEdge:3}]
        const mesh=new NavigationMesh(ref([a,b])),scene=withOccupiedBodies(clear(),[[100,120,0]])
        const route=mesh.findRoute({area:1,point:[40,120,0]},{area:2,point:[160,120,0]},DEFAULT_ROUTE_OPTIONS,scene)
        expect(simulateMovement(route,scene,220,72,mesh).at(-1)?.state).toBe('arrived')
        expect(route.points.some(p=>p[0]===100&&Math.abs(p[1]-120)>=32)).toBe(true)
        const narrowA={...a,corners:a.corners.map(p=>[p[0],p[1]/5,p[2]] as Vec3)}
        const narrowB={...b,corners:b.corners.map(p=>[p[0],p[1]/5,p[2]] as Vec3)}
        const narrow=new NavigationMesh(ref([narrowA,narrowB]))
        expect(narrow.findRoute({area:1,point:[40,24,0]},{area:2,point:[160,24,0]},DEFAULT_ROUTE_OPTIONS,withOccupiedBodies(clear(),[[100,24,0]])).points).toHaveLength(0)
    })
    it('rejects an intermediate low ceiling missed by horizontal sweep samples',()=>{
        const tile=area(1,0);tile.corners=[[0,0,0],[400,0,0],[400,240,0],[0,240,0]]
        const mesh=new NavigationMesh(ref([tile]))
        const roof=new CollisionScene(new Float32Array([150,0,60,250,0,60,250,240,60,150,240,60]),new Uint32Array([0,1,2,0,2,3]))
        const a={area:1,point:[60,120,0] as Vec3},b={area:1,point:[340,120,0] as Vec3}
        expect(mesh.findRoute(a,b,DEFAULT_ROUTE_OPTIONS,roof).points).toHaveLength(0)
        const crouch=mesh.findRoute(a,b,{...DEFAULT_ROUTE_OPTIONS,height:54},roof)
        expect(simulateMovement(crouch,roof,85,54,mesh).at(-1)?.state).toBe('arrived')
        const forced={areas:[1],points:[a.point,b.point],kinds:['walk' as const],distance:280,rejected:0}
        expect(simulateMovement(forced,roof,220,72,mesh).at(-1)?.state).toBe('blocked')
    })
    it('resolves even small portal height changes as supported steps',()=>{
        const a=area(1,0),b=area(2,100,1.8)
        a.edges=[{target:2,edge:1,targetEdge:3}]
        const mesh=new NavigationMesh(ref([a,b])),scene=clear()
        const route=mesh.findRoute(location(a),location(b),DEFAULT_ROUTE_OPTIONS,scene)
        expect(route.kinds).toContain('step')
        expect(simulateMovement(route,scene,220,72,mesh).at(-1)?.state).toBe('arrived')
    })
    it('passes a reserved body within an open polygon while preserving full-body separation', () => {
        const tile=area(1,0);tile.corners=[[0,0,0],[400,0,0],[400,240,0],[0,240,0]]
        const mesh=new NavigationMesh(ref([tile])),scene=withOccupiedBodies(clear(),[[200,120,0]])
        const a={area:1,point:[167,120,0] as Vec3},b={area:1,point:[350,120,0] as Vec3}
        const route=mesh.findRoute(a,b,DEFAULT_ROUTE_OPTIONS,scene)
        expect(route.points.length).toBeGreaterThan(2)
        const frames=simulateMovement(route,scene,220,72,mesh)
        expect(frames.at(-1)?.state).toBe('arrived')
        for(const frame of frames)expect(Math.hypot(frame.position[0]-200,frame.position[1]-120)).toBeGreaterThanOrEqual(32)
        const narrow={...tile,corners:[[0,100,0],[400,100,0],[400,140,0],[0,140,0]] as Vec3[]}
        expect(new NavigationMesh(ref([narrow])).findRoute(a,b,DEFAULT_ROUTE_OPTIONS,scene).points).toHaveLength(0)
    })
    it('walks a creased polygon through its actual triangle seam instead of hovering across it', () => {
        const tile=area(1,0);tile.corners=[[0,0,0],[100,0,0],[100,100,0],[0,100,20]]
        const mesh=new NavigationMesh(ref([tile])),scene=clear()
        const a={area:1,point:[20,70,10] as Vec3},b={area:1,point:[70,20,0] as Vec3}
        expect(mesh.supportedSegment(a.point,b.point)).toBe(false)
        const route=mesh.findRoute(a,b,DEFAULT_ROUTE_OPTIONS,scene)
        expect(route.points).toContainEqual([45,45,0])
        const frames=simulateMovement(route,scene,220,72,mesh)
        expect(frames.at(-1)?.state).toBe('arrived')
        for(const frame of frames)expect(mesh.supported(frame.position,0,.001)).toBe(true)
    })
    it('reuses immutable-world sweeps but separates body heights and reservation worlds', () => {
        const tile=area(1,0),mesh=new NavigationMesh(ref([tile])),scene=clear()
        const probe=jest.spyOn(scene,'movementHit'),a={area:1,point:[25,50,0] as Vec3},b={area:1,point:[75,50,0] as Vec3}
        const first=mesh.findRoute(a,b,DEFAULT_ROUTE_OPTIONS,scene)
        expect(mesh.findRoute(a,b,DEFAULT_ROUTE_OPTIONS,scene)).toEqual(first)
        const checks=probe.mock.calls.length
        expect(checks).toBeGreaterThan(0)
        mesh.findRoute(a,b,DEFAULT_ROUTE_OPTIONS,scene)
        expect(probe).toHaveBeenCalledTimes(checks)
        mesh.findRoute(a,b,{...DEFAULT_ROUTE_OPTIONS,height:54},scene)
        expect(probe.mock.calls.length).toBeGreaterThan(checks)
        expect(mesh.findRoute(a,b,DEFAULT_ROUTE_OPTIONS,withOccupiedBodies(scene,[[50,50,0]])).points).toHaveLength(0)
        expect(mesh.findRoute(a,b,DEFAULT_ROUTE_OPTIONS,scene)).toEqual(first)
    })
    it('uses round teammate reservations without treating their heads as floor support', () => {
        const scene=clear(),reserved=withOccupiedBodies(scene,[[0,0,0]])
        expect(reserved.bodyHit!([24,24,0],72)).toBeNull()
        expect(reserved.bodyHit!([22,22,0],72)).not.toBeNull()
        expect(reserved.movementHit([-50,0,0],[50,0,0],72)).not.toBeNull()
        expect(reserved.movementHit([-50,40,0],[50,40,0],72)).toBeNull()
        expect(reserved.movementHit([-50,0,72],[50,0,72],72)).toBeNull()
        expect(reserved.raycast([0,0,90],[0,0,50])).toBeNull()
    })
    it('avoids a center-connected corridor that cannot support the whole foot radius', () => {
        const a=area(1,0),thin=area(2,100),b=area(3,200),down=[area(4,0),area(5,100),area(6,200)]
        thin.corners=[[100,40,0],[200,40,0],[200,60,0],[100,60,0]]
        for(const tile of down)tile.corners=tile.corners.map(p=>[p[0],p[1]+100,p[2]])
        a.edges=[{target:2,edge:1,targetEdge:3},{target:4,edge:2,targetEdge:0}]
        thin.edges=[{target:3,edge:1,targetEdge:3}]
        down[0].edges=[{target:5,edge:1,targetEdge:3}];down[1].edges=[{target:6,edge:1,targetEdge:3}];down[2].edges=[{target:3,edge:0,targetEdge:2}]
        const mesh=new NavigationMesh(ref([a,thin,b,...down])),scene=clear()
        const route=mesh.findRoute(location(a),location(b),DEFAULT_ROUTE_OPTIONS,scene)
        expect(route.areas).toEqual([1,4,5,6,3])
        expect(simulateMovement(route,scene,220,72,mesh).at(-1)?.state).toBe('arrived')
    })
    it("keeps overlapping floors distinct and rejects missing vertical connections", () => {
        const mesh = new NavigationMesh(ref([area(1, 0), area(2, 0, 120)]))
        expect(mesh.surfaces(50, 50).map(p => p.point[2])).toEqual([0, 120])
        expect(mesh.findRoute({ area: 1, point: [50, 50, 0] }, { area: 2, point: [50, 50, 120] }).points).toHaveLength(0)
    })
    it("interpolates a sloped surface and rejects points outside it", () => {
        const slope = area(1, 0); slope.corners[1][2] = 100; slope.corners[2][2] = 100
        expect(surfaceHeight(slope, 25, 40)).toBeCloseTo(25)
        expect(surfaceHeight(slope, 101, 40)).toBeNull()
        expect(center(slope)[2]).toBeCloseTo(50)
    })
    it("uses source world/radar scale and round-trips XY without losing height context", () => {
        const r = ref([]), point: Vec3 = [150, -250, 120]
        const radar = toRadar(point, r), world = fromRadar(...radar, r)
        expect(world[0]).toBeCloseTo(point[0]); expect(world[1]).toBeCloseTo(point[1])
    })
    it("respects directed connections instead of inventing reverse routes", () => {
        const a = area(1, 0), b = area(2, 100); a.edges = [{ target: 2, edge: 1, targetEdge: 3 }]
        const mesh = new NavigationMesh(ref([a, b]))
        expect(mesh.findRoute(location(a), location(b)).areas).toEqual([1, 2])
        expect(mesh.findRoute(location(b), location(a)).areas).toEqual([])
        expect(mesh.findRoute(location(a), location(b), { ...DEFAULT_ROUTE_OPTIONS, blocked: [2] }).reason).toMatch(/blocked/)
    })
    it("does not bridge horizontal gaps with ordinary walking edges", () => {
        const a = area(1, 0), b = area(2, 150); a.edges = [{ target: 2, edge: 1, targetEdge: 3 }]
        const mesh = new NavigationMesh(ref([a, b]))
        expect(mesh.findRoute(location(a), location(b)).areas).toEqual([])
        expect(mesh.excludedPortals).toBe(1)
    })
    it("allows explicitly connected ladders and honors the ladder toggle", () => {
        const a = area(1, 0), b = area(2, 0, 120); a.laddersAbove = [7]
        const reference = ref([a, b]); reference.ladders = [{ id: 7, width: 32, bottom: [50, 50, 0], top: [50, 50, 120], bottomAreas: [1], topAreas: [2] }]
        const mesh = new NavigationMesh(reference)
        expect(mesh.findRoute(location(a), location(b)).kinds).toContain("ladder")
        expect(mesh.findRoute(location(a), location(b), { ...DEFAULT_ROUTE_OPTIONS, ladders: false }).points).toEqual([])
        expect(mesh.findRoute(location(b), location(a)).points).toEqual([])
    })
    it("blocks both directions of a wall ray and reports the actual hit point", () => {
        const scene = wall()
        expect(scene.raycast([0, 50, 64], [200, 50, 64])?.point).toEqual([100, 50, 64])
        expect(scene.raycast([200, 50, 64], [0, 50, 64])?.point).toEqual([100, 50, 64])
        expect(scene.raycast([0, 50, 250], [200, 50, 250])).toBeNull()
    })
    it("blocks sight between floors even at identical XY coordinates", () => {
        const scene = new CollisionScene(new Float32Array([0, 0, 100, 100, 0, 100, 100, 100, 100, 0, 100, 100]), new Uint32Array([0, 1, 2, 0, 2, 3]))
        expect(scene.raycast([50, 50, 64], [50, 50, 184])?.point[2]).toBe(100)
    })
    it("checks body width instead of accepting only a clear center ray", () => {
        const scene = new CollisionScene(new Float32Array([50, 10, 0, 50, 30, 0, 50, 30, 100, 50, 10, 100]), new Uint32Array([0, 1, 2, 0, 2, 3]))
        expect(scene.raycast([0, 0, 64], [100, 0, 64])).toBeNull()
        expect(scene.movementHit([0, 0, 0], [100, 0, 0])).not.toBeNull()
    })
    it("stops before a movement obstruction and never teleports across it", () => {
        const route = { areas: [1], points: [[0, 50, 0], [200, 50, 0]] as Vec3[], kinds: ["walk" as const], distance: 200, rejected: 0 }
        const frames = simulateMovement(route, wall())
        expect(frames.at(-1)?.state).toBe("blocked")
        expect(frames.every(f => f.position[0] < 100)).toBe(true)
        expect(simulateMovement(route, wall())).toEqual(frames)
    })
    it("accelerates, arrives exactly, and produces the same fixed-step replay", () => {
        const a = area(1, 0), b = area(2, 100); a.edges = [{ target: 2, edge: 1, targetEdge: 3 }]
        const route = new NavigationMesh(ref([a, b])).findRoute(location(a), location(b), DEFAULT_ROUTE_OPTIONS, clear())
        const frames = simulateMovement(route, clear())
        expect(frames[1].speed).toBeGreaterThan(0); expect(frames[1].speed).toBeLessThan(220)
        expect(frames.at(-1)?.state).toBe("arrived"); expect(frames.at(-1)?.position).toEqual(center(b))
        expect(simulateMovement(route, clear())).toEqual(frames)
    })
    it("rejects corrupt collision buffers and non-finite geometry", () => {
        expect(() => CollisionScene.fromBinary(new ArrayBuffer(8))).toThrow()
        expect(() => new CollisionScene(new Float32Array([NaN, 0, 0]), new Uint32Array([0, 0, 0]))).toThrow()
        expect(() => clear().raycast([NaN, 0, 0], [1, 2, 3])).toThrow()
    })
    it("does not pause at tile boundaries and caps ladder movement speed", () => {
        const points: Vec3[] = Array.from({ length: 201 }, (_, i) => [i, 50, 0])
        const fine = simulateMovement({ areas: [1], points, kinds: points.slice(1).map(() => "walk"), distance: 200, rejected: 0 }, clear())
        const coarse = simulateMovement({ areas: [1], points: [points[0], points[200]], kinds: ["walk"], distance: 200, rejected: 0 }, clear())
        expect(fine.at(-1)?.time).toBe(coarse.at(-1)?.time)
        const climb = simulateMovement({ areas: [1, 2], points: [[0, 50, 0], [200, 50, 0], [200, 50, 120]], kinds: ["walk", "ladder"], distance: 320, rejected: 0 }, clear())
        expect(climb.filter(f => f.state === "ladder").every(f => f.speed <= 85)).toBe(true)
        expect(climb.at(-1)?.state).toBe("arrived")
    })
    it("round-trips authored tests and refuses a stale map version or illegal connection", () => {
        const r = ref([area(1, 0), area(2, 0, 120)]), p = { ...emptyLabProject(r), a: location(r.areas[0]), b: location(r.areas[1]), blocked: [2] }
        expect(parseLabProject(JSON.stringify(p), r)).toEqual(p)
        expect(() => parseLabProject(JSON.stringify({ ...p, sourceVersion: "old" }), r)).toThrow()
        expect(() => parseLabProject(JSON.stringify({ ...p, links: [{ id: "bad", from: 1, to: 2, start: p.a.point, end: p.b.point, kind: "walk" }] }), r)).toThrow()
        expect(() => parseLabProject(JSON.stringify({ ...p, a: { area: 1, point: [50, 50, 120] } }), r)).toThrow()
    })
    it("preserves movement settings and migrates earlier lab drafts", () => {
        const r = ref([area(1, 0)]), p = emptyLabProject(r)
        p.settings = { height: 54, speed: 130, ladders: false }
        expect(parseLabProject(JSON.stringify(p), r).settings).toEqual(p.settings)
        expect(parseLabProject(JSON.stringify({ ...p, settings: undefined }), r).settings).toEqual({ height: 72, speed: 220, ladders: true })
        expect(() => parseLabProject(JSON.stringify({ ...p, settings: { ...p.settings, speed: -1 } }), r)).toThrow()
    })
    it.each(["Mirage", "Nuke", "Sandstone", "Inferno", "Anubis", "Ancient", "Overpass", "Vertigo"])("validates the pinned %s reference and collision checksum", map => {
        const reference = JSON.parse(readFileSync(`public/map-studio/spatial/${map}.json`, "utf8")) as SpatialReference
        const mesh = readFileSync(`public/map-studio/spatial/${map}.mesh`)
        expect(createHash("sha256").update(mesh).digest("hex")).toBe(reference.meshSha256)
        expect(reference.sourceVersion).toBe("2000908")
        const ids = new Set(reference.areas.map(a => a.id))
        expect(ids.size).toBe(reference.areas.length)
        expect(reference.areas.every(a => a.corners.length >= 3 && a.corners.every(p => p.every(Number.isFinite)) && a.edges.every(e => ids.has(e.target)))).toBe(true)
        const nav = new NavigationMesh(reference)
        expect(nav.links.size).toBeGreaterThan(1000)
    })
})
