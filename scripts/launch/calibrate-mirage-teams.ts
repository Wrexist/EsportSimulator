import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { CollisionScene } from '../../engine/spatial/geometry'
import { NavigationMesh } from '../../engine/spatial/navigation'
import { parseLabProject } from '../../lib/spatial-lab-project'
import { runLabTeams } from '../../engine/spatial/lab-teams'
import { SPATIAL_ROUND_ENGINE } from '../../engine/spatial/round-replay'
import { distance3, type SpatialReference } from '../../engine/spatial/types'

const reference=JSON.parse(readFileSync('public/map-studio/spatial/Mirage.json','utf8')) as SpatialReference
const source=readFileSync('docs/ui-review/physical-career/mirage-5v5-review.lab.json','utf8')
const mesh=readFileSync('public/map-studio/spatial/Mirage.mesh')
if(createHash('sha256').update(mesh).digest('hex')!==reference.meshSha256)throw Error('Reference mesh changed')
const scene=CollisionScene.fromBinary(mesh.buffer.slice(mesh.byteOffset,mesh.byteOffset+mesh.byteLength) as ArrayBuffer),nav=new NavigationMesh(reference)
const full=process.argv.includes('--full')
const extended=process.argv.includes('--extended')
const simulatorSourceSha256=createHash('sha256').update(['engine/spatial/team-simulation.ts','engine/spatial/team-model.ts','engine/spatial/recovery-support.ts','engine/spatial/utility.ts'].map(path=>readFileSync(path,'utf8')).join('\n')).digest('hex')
const runs=[{seed:4326170,guns:true,seconds:45},{seed:4326171,guns:true,seconds:45},{seed:4326172,guns:true,seconds:45},{seed:4326170,guns:false,seconds:115}]
if(extended)runs.splice(3,0,...[4326173,4326174,4326175].map(seed=>({seed,guns:true,seconds:45})))
const count=(values:string[])=>Object.fromEntries([...new Set(values)].sort().map(v=>[v,values.filter(x=>x===v).length]))
const rows=runs.map(config=>{
    const project=parseLabProject(source,reference)
    Object.assign(project.teams!,config,full ? {seconds:160,roundSeconds:115,bombSeconds:40,plantSeconds:3.2,defuseSeconds:10} : {roundSeconds:config.seconds})
    const start=performance.now(),result=runLabTeams(project,nav,scene,true).result
    if(result.metrics.minSeparation<32-1e-6)throw Error('Team body overlap')
    const end=result.frames.at(-1)!
    const row={...config,seconds:project.teams!.seconds,roundSeconds:project.teams!.roundSeconds,bombSeconds:project.teams!.bombSeconds,elapsedMs:Math.round(performance.now()-start),outcome:result.outcome,reason:result.reason,metrics:result.metrics,
        ticks:end.tick,defuses:result.events.filter(e=>e.type==='defused').length,recoveries:result.events.filter(e=>e.type==='bomb-picked-up').length,
        coverAngles:result.events.filter(e=>e.type==='cover-angle').length,utilityCommits:result.events.filter(e=>e.type==='utility-commit').length,
        recoveryAssignments:result.events.filter(e=>e.type==='recovery-assigned').length,eliminations:end.actors.filter(a=>a.health<=0).length,plants:result.events.filter(e=>e.type==='planted').length,
        movementObstructions:count(result.events.filter(e=>e.type==='spacing-wait').map(e=>e.reason)),
        routeFailures:count(result.events.filter(e=>e.type==='route-blocked').map(e=>e.reason)),
        actors:end.actors.map(a=>({id:a.id,health:a.health,intent:a.intent,position:a.position,distanceFromSpawn:Math.round(distance3(a.position,project.teams!.actors.find(p=>p.id===a.id)!.start.point)),
            shots:result.events.filter(e=>e.type==='shot'&&e.actor===a.id).length,retries:result.events.filter(e=>e.type==='route-retry'&&e.actor===a.id).length})),
        outputSha256:createHash('sha256').update(JSON.stringify(result)).digest('hex')}
    console.log(JSON.stringify({seed:row.seed,guns:row.guns,elapsedMs:row.elapsedMs,eliminations:row.eliminations,plants:row.plants,metrics:row.metrics}))
    return row
})
writeFileSync(`docs/ui-review/physical-career/mirage-${SPATIAL_ROUND_ENGINE}-${full?'full-rounds':'calibration'}${extended?'-extended':''}.json`,JSON.stringify({engine:SPATIAL_ROUND_ENGINE,
    scope:`${extended?'Six':'Three'} combat seeds plus one movement-only round. ${full?'115-second regulation, up to 40 seconds post-plant and a 160-second observation horizon.':'45-second combat observations.'} Existing provisional Mirage fixture; not other-map coverage or balance certification.`,
    simulatorSourceSha256,fixtureSha256:createHash('sha256').update(source).digest('hex'),meshSha256:reference.meshSha256,rows},null,2)+'\n')
