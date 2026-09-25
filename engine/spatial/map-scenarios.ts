import { center, distance3, type Vec3 } from './types'
import type { CollisionWorld } from './geometry'
import { NavigationMesh, DEFAULT_ROUTE_OPTIONS, type NavLocation } from './navigation'
import { simulateMovement } from './movement'
import { inPlantZone, type PlantZone, type PlantZonePiece } from './objective-zones'
import { TEAM_DEFAULTS, parseTeamSetup, type TeamMember, type Side } from './team-model'

export interface NativeMapEvidence {
    mapId: string
    spawns: { id: string; side: Side; enabled: boolean; priority: number; origin: Vec3; angles: Vec3 }[]
    sites: { site: 'A' | 'B'; pieces: { vertices: Vec3[]; zMin: number; zMax: number }[] }[]
}
/** Convex pieces stay separate; never bridge gaps in a multi-part plant zone. */
export function convexFootprint(vertices: Vec3[]): Vec3[] {
    const points = [...new Map(vertices.map(p => [`${p[0]},${p[1]}`, p])).values()].sort((a,b) => a[0]-b[0] || a[1]-b[1])
    const cross = (a: Vec3,b: Vec3,c: Vec3) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    const half = (list: Vec3[]) => { const out: Vec3[] = []; for (const p of list) { while (out.length > 1 && cross(out.at(-2)!,out.at(-1)!,p) <= 0) out.pop(); out.push([...p]) } return out.slice(0,-1) }
    const hull = half(points).concat(half([...points].reverse()))
    if (hull.length < 3) throw Error('Degenerate native plant piece')
    return hull
}
export function groundedSpawn(origin: Vec3, nav: NavigationMesh, world: CollisionWorld): NavLocation | undefined {
    // A bounded downward grounding query cannot jump to a different upper floor.
    return nav.surfaces(origin[0],origin[1]).filter(p => p.point[2] <= origin[2] + 2 && p.point[2] >= origin[2] - 64)
        .sort((a,b) => b.point[2]-a.point[2] || a.area-b.area)
        .find(p => nav.supportedBody(p.point,world) && !world.bodyHit?.(p.point,72)
            && !world.raycast([origin[0],origin[1],origin[2]+20],[p.point[0],p.point[1],p.point[2]+20]))
}
export function buildMapScenario(evidence: NativeMapEvidence, nav: NavigationMesh, world: CollisionWorld) {
    if (evidence.mapId !== nav.reference.mapId) throw Error('Native evidence belongs to another map')
    const sites = {} as Record<'A'|'B',NavLocation>, plantZones = {} as Record<'A'|'B',PlantZone>, sitePositions = {} as Record<'A'|'B',NavLocation[]>
    for (const site of ['A','B'] as const) {
        const sources = evidence.sites.filter(s => s.site === site)
        if (sources.length !== 1 || !sources[0].pieces.length || sources[0].pieces.length > 32) throw Error(`Missing or duplicate ${site} trigger`)
        const pieces: PlantZonePiece[] = sources[0].pieces.map(p => ({ points: convexFootprint(p.vertices), zMin: p.zMin - .01, zMax: p.zMax + .01 }))
        const zone: PlantZone = { ...pieces[0], ...(pieces.length > 1 ? { pieces: pieces.slice(1) } : {}) }
        const positions: NavLocation[] = []
        const consider = (p: NavLocation) => {
            if (inPlantZone(p.point,zone) && nav.supportedBody(p.point,world) && !world.bodyHit?.(p.point,72) && positions.every(q => distance3(p.point,q.point) >= 48)) positions.push(p)
        }
        for (const area of [...nav.areas.values()].sort((a,b) => a.id-b.id)) consider({ area: area.id, point: center(area) })
        // Small native triggers may not contain any navigation polygon center.
        for (const piece of pieces) {
            const xs=piece.points.map(p=>p[0]),ys=piece.points.map(p=>p[1]),loX=Math.min(...xs),hiX=Math.max(...xs),loY=Math.min(...ys),hiY=Math.max(...ys)
            const nx=Math.min(32,Math.max(1,Math.ceil((hiX-loX)/32))),ny=Math.min(32,Math.max(1,Math.ceil((hiY-loY)/32)))
            for(let x=0;x<nx;x++)for(let y=0;y<ny;y++)for(const p of nav.surfaces(loX+(x+.5)*(hiX-loX)/nx,loY+(y+.5)*(hiY-loY)/ny))consider(p)
        }
        if (!positions.length) throw Error(`Site ${site} has no supported standing position inside its native trigger`)
        sites[site]=positions[0];sitePositions[site]=positions;plantZones[site]=zone
    }
    const bindings: { actor: string; entity: string; origin: Vec3; ground: Vec3 }[] = [], actors: TeamMember[] = []
    const excluded: {entity:string;reason:string}[]=[]
    for (const side of ['T','CT'] as const) {
        const chosen: NavLocation[] = []
        for (const spawn of evidence.spawns.filter(p=>p.enabled&&p.side===side).sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id))) {
            const start=groundedSpawn(spawn.origin,nav,world)
            if (!start || chosen.some(p=>distance3(p.point,start.point)<48) || actors.some(a=>distance3(a.start.point,start.point)<48)) continue
            const i=chosen.length,id=`${side}${i+1}`,site=i%2?'B':'A'
            let station=start
            if(side==='CT'){
                // Give each defender a reachable, separate hold point rather than
                // reserving the attackers' representative plant coordinate.
                const candidates=sitePositions[site].filter(p=>actors.every(a=>a.side!=='CT'||distance3(a.station.point,p.point)>=48))
                    .sort((a,b)=>(distance3(a.point,sites[site].point)<64?1:0)-(distance3(b.point,sites[site].point)<64?1:0)||distance3(start.point,a.point)-distance3(start.point,b.point))
                const reachable=candidates.find(goal=>{
                    const path=nav.findRoute(start,goal,{...DEFAULT_ROUTE_OPTIONS,ladders:false},world)
                    return path.points.length&&simulateMovement(path,world,220,72,nav).at(-1)?.state==='arrived'
                })
                if(!reachable){excluded.push({entity:spawn.id,reason:`No collision-tested route to a separate ${site} hold point`});continue}
                station=reachable
            }
            actors.push({id,side,role:side==='CT'?'anchor':i===0?'entry':i===4?'lurk':'support',start,station,yaw:((spawn.angles[1]+180)%360+360)%360-180,health:100,armor:100,ammo:30})
            bindings.push({actor:id,entity:spawn.id,origin:[...spawn.origin],ground:[...start.point]});chosen.push(start)
            if(chosen.length===5)break
        }
        if(chosen.length!==5)throw Error(`${side} only has ${chosen.length}/5 clear grounded native spawns`)
    }
    return { teams:parseTeamSetup({...TEAM_DEFAULTS,seed:4326170,seconds:160,roundSeconds:115,bombSeconds:40,plantSeconds:3.2,defuseSeconds:10,guns:true,carrier:'T2',sites,plantZones,actors},nav),bindings,sitePositions,excluded }
}
