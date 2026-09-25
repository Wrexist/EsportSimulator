import { CollisionScene } from '@/engine/spatial/geometry'
import { NavigationMesh, type NavLocation } from '@/engine/spatial/navigation'
import type { NavArea, SpatialReference, Vec3 } from '@/engine/spatial/types'
import { TEAM_DEFAULTS } from '@/engine/spatial/team-model'
import { emptyLabProject, parseLabProject } from '@/lib/spatial-lab-project'
import { runLabTeams } from '@/engine/spatial/lab-teams'

const area = (id: number, x1: number, x2: number, z = 0): NavArea => ({ id, hull: 0, flags: '0', movable: 4294967295, corners: [[x1,0,z],[x2,0,z],[x2,1000,z],[x1,1000,z]], edges: [], laddersAbove: [], laddersBelow: [] })
const reference = (areas: NavArea[]) => ({ format:'esim-spatial-reference',version:1,mapId:'Mirage',sourceMap:'fixture',sourceVersion:'test',sourceUrl:'test',meshSha256:'test',areas,ladders:[],radars:{upper:'/test.png'},transform:{pos_x:0,pos_y:1000,scale:1} }) as SpatialReference
const location = (id: number, x: number, y: number, z = 0): NavLocation => ({ area:id,point:[x,y,z] })
function world(plates: Vec3[][]) {
    const vertices = plates.flat(2), indices = plates.flatMap((_, i) => [i*4,i*4+1,i*4+2,i*4,i*4+2,i*4+3])
    return new CollisionScene(new Float32Array(vertices),new Uint32Array(indices))
}
function fixture(gap = true, dz = 0) {
    const a=area(1,0,gap?200:1000),b=area(2,260,1000,dz),ref=reference(gap?[a,b]:[a]),nav=new NavigationMesh(ref)
    const p=emptyLabProject(ref), end=location(gap?2:1,600,200,dz), ct=location(gap?2:1,800,800,dz)
    p.teams={...TEAM_DEFAULTS,seconds:6,roundSeconds:6,openingSeconds:10,carrier:'T1',sites:{A:end,B:ct},actors:[
        {id:'T1',side:'T',role:'entry',start:location(1,100,200),station:end,yaw:0,health:100,armor:0,ammo:30},
        {id:'CT1',side:'CT',role:'anchor',start:ct,station:ct,yaw:0,health:100,armor:0,ammo:30},
    ]}
    p.settings.jumps=true;p.settings.drops=true
    if(gap)p.links=[{id:'crossing',from:1,to:2,start:[170,200,0],end:[290,200,dz],kind:dz<0?'drop':'jump'}]
    return {p,nav,ref,plates:ref.areas.map(a=>a.corners),scene:world(ref.areas.map(a=>a.corners))}
}
test('team movement executes authored jumps without freezing at the speed check or replanning in midair',()=>{
    const {p,nav,scene,ref}=fixture(), before=JSON.stringify(p)
    const result=runLabTeams(parseLabProject(before,ref),nav,scene).result
    const track=result.frames.map(f=>f.actors.find(a=>a.id==='T1')!)
    expect(track.some(a=>a.movement==='airborne'&&a.position[2]>20)).toBe(true)
    expect(track.at(-1)!.position[0]).toBeGreaterThan(575)
    expect(track.at(-1)!.position[2]).toBe(0)
    expect(result.events.filter(e=>e.actor==='T1'&&e.type==='spacing-wait')).toHaveLength(0)
    expect(JSON.stringify(p)).toBe(before)
    p.settings.jumps=false
    expect(runLabTeams(p,nav,scene).result.frames.at(-1)!.actors.find(a=>a.id==='T1')!.position[0]).toBe(100)
})
test('authored drops land on their lower floor instead of being rejected by the walking speed cap',()=>{
    const {p,nav,scene}=fixture(true,-100)
    // A drop has less horizontal reach than a jump at the same walking speed.
    p.links[0].start=[180,200,0];p.links[0].end=[280,200,-100]
    const track=runLabTeams(p,nav,scene).result.frames.map(f=>f.actors.find(a=>a.id==='T1')!)
    expect(track.some(a=>a.movement==='airborne'&&a.position[2]<-10)).toBe(true)
    expect(track.at(-1)!.position[0]).toBeGreaterThan(575)
    expect(track.at(-1)!.position[2]).toBe(-100)
})
test('stance affects team clearance and visible body height, not just the route preview',()=>{
    const {p,nav,plates}=fixture(false)
    const scene=world([...plates,[[250,0,60],[500,0,60],[500,1000,60],[250,1000,60]]])
    expect(runLabTeams(p,nav,scene).result.frames.at(-1)!.actors.find(a=>a.id==='T1')!.position[0]).toBeLessThan(234)
    p.settings.height=54;p.teams!.seconds=9;p.teams!.roundSeconds=9
    const result=runLabTeams(p,nav,scene).result,track=result.frames.map(f=>f.actors.find(a=>a.id==='T1')!)
    expect(track.every(a=>a.height===54)).toBe(true)
    expect(track.at(-1)!.position[0]).toBeGreaterThan(575)
})
test('a blocked landing is reserved before takeoff; team bodies never overlap on the flight',()=>{
    const {p,nav,scene}=fixture()
    p.teams!.actors[1].start=location(2,290,200);p.teams!.actors[1].station=location(2,290,200)
    const result=runLabTeams(p,nav,scene).result
    expect(result.frames.every(f=>f.actors.find(a=>a.id==='T1')!.position[2]===0)).toBe(true)
    expect(result.metrics.minSeparation).toBeGreaterThanOrEqual(32)
})
