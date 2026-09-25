import { buildMapScenario, groundedSpawn, type NativeMapEvidence } from '@/engine/spatial/map-scenarios'
import { inPlantZone, type PlantZone } from '@/engine/spatial/objective-zones'
import { NavigationMesh } from '@/engine/spatial/navigation'
import { CollisionScene } from '@/engine/spatial/geometry'
import type { SpatialReference } from '@/engine/spatial/types'
import { parseTeamSetup } from '@/engine/spatial/team-model'

const reference:SpatialReference={format:'esim-spatial-reference',version:1,mapId:'Anubis',sourceMap:'test',sourceVersion:'test',sourceUrl:'https://example.com',meshSha256:'test',transform:{pos_x:0,pos_y:1000,scale:1},radars:{upper:'/test.png'},ladders:[],areas:[{id:1,hull:0,flags:'0',movable:4294967295,corners:[[0,0,0],[1000,0,0],[1000,1000,0],[0,1000,0]],edges:[],laddersAbove:[],laddersBelow:[]}]}
const nav=new NavigationMesh(reference),floor=new CollisionScene(new Float32Array([0,0,0,1000,0,0,1000,1000,0,0,1000,0]),new Uint32Array([0,1,2,0,2,3]))
const evidence:NativeMapEvidence={mapId:'Anubis',spawns:(['T','CT'] as const).flatMap(side=>Array.from({length:5},(_,i)=>({id:`${side}-${i}`,side,enabled:true,priority:0,origin:[side==='T'?100:900,100+i*64,32],angles:[0,side==='T'?0:180,0]}))),sites:[{site:'A',pieces:[{zMin:-1,zMax:10,vertices:[[450,450,0],[550,450,0],[550,550,0],[450,550,0]]}]},{site:'B',pieces:[{zMin:-1,zMax:10,vertices:[[700,700,0],[800,700,0],[800,800,0],[700,800,0]]}]}]}

test('native spawns are grounded with supported bodies, separated and stable across input order',()=>{
    const before=JSON.stringify(evidence),built=buildMapScenario(evidence,nav,floor)
    expect(built.teams.actors).toHaveLength(10)
    expect(built.bindings.every(b=>b.origin[2]===32&&b.ground[2]===0)).toBe(true)
    expect(buildMapScenario({...evidence,spawns:[...evidence.spawns].reverse()},nav,floor)).toEqual(built)
    expect(JSON.stringify(evidence)).toBe(before)
    expect(groundedSpawn([100,100,200],nav,floor)).toBeUndefined()
    expect(()=>buildMapScenario({...evidence,spawns:evidence.spawns.filter(s=>s.id!=='T-0')},nav,floor)).toThrow('4/5')
})

test('multi-part plant areas preserve gaps, floors and parser round trips',()=>{
    const built=buildMapScenario(evidence,nav,floor),zone:PlantZone={...built.teams.plantZones!.A,pieces:[built.teams.plantZones!.B]}
    expect(inPlantZone([500,500,0],zone)).toBe(true)
    expect(inPlantZone([750,750,0],zone)).toBe(true)
    expect(inPlantZone([620,620,0],zone)).toBe(false)
    expect(inPlantZone([750,750,120],zone)).toBe(false)
    const setup={...built.teams,plantZones:{...built.teams.plantZones!,A:zone}}
    expect(parseTeamSetup(setup,nav).plantZones!.A).toEqual(zone)
    expect(()=>parseTeamSetup({...setup,plantZones:{...setup.plantZones,A:{...zone,pieces:[{...zone,zMax:NaN}]}}},nav)).toThrow()
})

test('a disconnected native spawn is reported and replaced by another enabled spawn',()=>{
    const island={...reference.areas[0],id:2,corners:reference.areas[0].corners.map(p=>[p[0]+1200,p[1],p[2]] as [number,number,number])}
    const mesh=new NavigationMesh({...reference,areas:[...reference.areas,island]})
    const spawns=evidence.spawns.map(s=>s.id==='CT-0'?{...s,origin:[1300,100,32] as [number,number,number]}:s)
    spawns.push({...evidence.spawns.find(s=>s.id==='CT-0')!,id:'CT-5'})
    const built=buildMapScenario({...evidence,spawns},mesh,floor)
    expect(built.teams.actors).toHaveLength(10)
    expect(built.excluded.map(e=>e.entity)).toEqual(['CT-0'])
    expect(built.bindings.some(b=>b.entity==='CT-5')).toBe(true)
    expect(built.bindings.some(b=>b.entity==='CT-0')).toBe(false)
})
