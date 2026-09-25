import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { ACTIVE_MAP_POOL } from '../../data/map-pool'
import { CollisionScene } from '../../engine/spatial/geometry'
import { NavigationMesh } from '../../engine/spatial/navigation'
import { runLabTeams } from '../../engine/spatial/lab-teams'
import { parseLabProject } from '../../lib/spatial-lab-project'
import { distance3, type SpatialReference } from '../../engine/spatial/types'
import { SPATIAL_ROUND_ENGINE } from '../../engine/spatial/round-replay'
import { EMPTY_STOCK } from '../../engine/spatial/utility'

const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex')
const combat=process.argv.includes('--combat'),chosen=process.argv.slice(2).find(a=>!a.startsWith('--'))
const maps=chosen?[chosen]:ACTIVE_MAP_POOL,variant=combat?'combat':'moving',folder=combat?'recovery-combat':'recovery-squad'
let failed=false
const source=hash(['team-simulation','team-model','navigation','movement','objective-zones','recovery-support','utility','geometry'].map(f=>readFileSync(`engine/spatial/${f}.ts`,'utf8')).join('\n'))
mkdirSync('docs/ui-review/recovery-utility',{recursive:true})
mkdirSync(`public/map-studio/teams/${folder}`,{recursive:true})
for(const mapId of maps){
    if(!ACTIVE_MAP_POOL.some(m=>m===mapId))throw Error('Choose an active map')
    const ref=JSON.parse(readFileSync(`public/map-studio/spatial/${mapId}.json`,'utf8')) as SpatialReference
    const bytes=readFileSync(`public/map-studio/spatial/${mapId}.mesh`)
    if(hash(bytes)!==ref.meshSha256)throw Error('Mesh changed')
    const nav=new NavigationMesh(ref),world=CollisionScene.fromBinary(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer)
    const project=parseLabProject(readFileSync(`public/map-studio/teams/recovery/${mapId.toLowerCase()}.lab.json`,'utf8'),ref)
    const pool=parseLabProject(readFileSync(`public/map-studio/teams/map-pool/${mapId.toLowerCase()}.lab.json`,'utf8'),ref)
    const teams=project.teams!
    teams.actors.push(...pool.teams!.actors.filter(a=>!teams.actors.some(b=>b.id===a.id)))
    for(const actor of teams.actors)teams.utility!.inventory[actor.id]??={...EMPTY_STOCK}
    if(combat){teams.guns=true;teams.utility!.ceasefire=false}
    if(teams.actors.length!==10)throw Error('Expected two full squads')
    const before=JSON.stringify(project),result=runLabTeams(project,nav,world,true).result
    if(JSON.stringify(project)!==before)throw Error('Simulation mutated its input')
    const event=(type:string)=>result.events.find(e=>e.type===type)
    const wait=event('recovery-screen-wait'),burst=event('grenade-detonate'),ready=event('recovery-screen-ready'),pickup=event('bomb-picked-up')
    const movedDuringFlight=teams.actors.filter(a=>!['T1','T2','CT1'].includes(a.id)&&result.frames.some(f=>f.tick<=(burst?.tick??0)&&distance3(f.actors.find(b=>b.id===a.id)!.position,a.start.point)>32)).map(a=>a.id)
    const held=!!wait&&!!ready&&result.frames.filter(f=>f.tick>=wait.tick&&f.tick<ready.tick).every(f=>distance3(f.actors.find(a=>a.id===wait.actor)!.position,teams.actors.find(a=>a.id===wait.actor)!.start.point)===0)
    const passed=!!wait&&!!burst&&!!ready&&!!pickup&&ready.tick>burst.tick&&pickup.tick>=ready.tick&&held&&movedDuringFlight.length>0&&result.metrics.minSeparation>=32&&result.utility?.checks[0]?.state==='matches-model'&&result.events.filter(e=>e.type==='grenade-throw').length===1&&result.frames.at(-1)!.actors.find(a=>a.id==='T2')!.inventory!.smoke===0&&(!combat||result.metrics.shots>0)
    const serialized=JSON.stringify(project,null,2)+'\n'
    const receipt={engine:SPATIAL_ROUND_ENGINE,mapId,scope:combat?'One seeded 10-second 5v5 recovery with gunfire enabled; requires actual shots and successful screened pickup. Not full-match or real-game lineup certification.':'5v5 moving-squad recovery regression with gunfire disabled; not a combat or real-game lineup certificate.',simulatorSourceSha256:source,meshSha256:ref.meshSha256,fixtureSha256:hash(serialized),passed,held,movedDuringFlight,waitTick:wait?.tick,burstTick:burst?.tick,readyTick:ready?.tick,pickupTick:pickup?.tick,shots:result.metrics.shots,damage:result.metrics.damage,minSeparation:result.metrics.minSeparation,checks:result.utility?.checks,outputSha256:hash(JSON.stringify(result))}
    writeFileSync(`docs/ui-review/recovery-utility/${mapId.toLowerCase()}-${SPATIAL_ROUND_ENGINE}-${variant}.json`,JSON.stringify(receipt,null,2)+'\n')
    console.log(JSON.stringify(receipt))
    if(!passed){failed=true;if(!combat)throw Error(`${mapId}: moving recovery failed`)}
    if(combat)writeFileSync(`tmp/${mapId.toLowerCase()}-${SPATIAL_ROUND_ENGINE}-recovery-combat.json`,JSON.stringify({project,result}))
    if(passed)writeFileSync(`public/map-studio/teams/${folder}/${mapId.toLowerCase()}.lab.json`,serialized)
}
if(failed)process.exitCode=1
