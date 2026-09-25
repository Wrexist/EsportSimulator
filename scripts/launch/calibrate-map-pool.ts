import { readFileSync,writeFileSync,mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { ACTIVE_MAP_POOL } from '../../data/map-pool'
import { CollisionScene } from '../../engine/spatial/geometry'
import { NavigationMesh } from '../../engine/spatial/navigation'
import { runLabTeams } from '../../engine/spatial/lab-teams'
import { parseLabProject } from '../../lib/spatial-lab-project'
import { SPATIAL_ROUND_ENGINE } from '../../engine/spatial/round-replay'
import type { SpatialReference } from '../../engine/spatial/types'

const mapId=process.argv[2]
if(!ACTIVE_MAP_POOL.some(m=>m===mapId))throw Error('Choose one active map; Nuke stays retired')
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex')
const files=['team-simulation.ts','team-model.ts','navigation.ts','movement.ts','objective-zones.ts','recovery-support.ts','utility.ts','geometry.ts']
const simulatorSourceSha256=hash(files.map(f=>readFileSync(`engine/spatial/${f}`,'utf8')).join('\n'))
const reference=JSON.parse(readFileSync(`public/map-studio/spatial/${mapId}.json`,'utf8')) as SpatialReference
const bytes=readFileSync(`public/map-studio/spatial/${mapId}.mesh`)
if(hash(bytes)!==reference.meshSha256)throw Error('Mesh changed')
const nav=new NavigationMesh(reference),scene=CollisionScene.fromBinary(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer)
const file=mapId==='Mirage'?'docs/ui-review/physical-career/mirage-5v5-review.lab.json':`public/map-studio/teams/map-pool/${mapId.toLowerCase()}.lab.json`
const source=readFileSync(file,'utf8'),runs=[{seed:4326170,objective:'A',guns:true},{seed:4326171,objective:'B',guns:true},{seed:4326170,objective:'A',guns:false}]
if(mapId==='Mirage')runs.push({seed:4326174,objective:'A',guns:true})
const suffix=process.argv.includes('--performance')?'-performance':process.argv.includes('--reviewed')?'-reviewed':process.argv.includes('--cached')?'-cached':process.argv.includes('--final')?'-final':''
const rows=[]
mkdirSync('docs/ui-review/map-pool',{recursive:true})
const selectedRuns=process.argv.includes('--movement-only')?runs.filter(r=>!r.guns):process.argv.includes('--combat-only')?runs.filter(r=>r.guns):runs
for(const config of selectedRuns){
    const project=parseLabProject(source,reference)
    Object.assign(project.teams!,config,{seconds:160,roundSeconds:115,bombSeconds:40,plantSeconds:3.2,defuseSeconds:10})
    console.log(JSON.stringify({mapId,starting:config}))
    const start=performance.now(),result=runLabTeams(project,nav,scene,true).result,end=result.frames.at(-1)!
    if(result.metrics.minSeparation<32-1e-6)throw Error('Swept body separation regressed')
    if(result.outcome==='unresolved')throw Error('Round did not settle inside the bounded observation horizon')
    const row={...config,seconds:end.tick/64,outcome:result.outcome,reason:result.reason,elapsedMs:Math.round(performance.now()-start),metrics:result.metrics,
        plants:result.events.filter(e=>e.type==='planted').length,defuses:result.events.filter(e=>e.type==='defused').length,recoveries:result.events.filter(e=>e.type==='bomb-picked-up').length,
        yields:result.events.filter(e=>e.type==='spacing-yield').length,routeFailures:result.events.filter(e=>e.type==='route-blocked'),
        finalBlocked:end.actors.filter(a=>a.health>0&&a.intent==='blocked').map(a=>({id:a.id,point:a.position,goal:a.goal,reason:a.reason,lastObstruction:result.events.filter(e=>e.actor===a.id&&['spacing-wait','route-blocked'].includes(e.type)).at(-1)})),
        outputSha256:hash(JSON.stringify(result))}
    if(process.argv.includes('--cached')){
        const prior=JSON.parse(readFileSync(`docs/ui-review/map-pool/${mapId.toLowerCase()}-${SPATIAL_ROUND_ENGINE}-final.json`,'utf8')).rows.find((r:{seed:number;objective:string;guns:boolean})=>r.seed===config.seed&&r.objective===config.objective&&r.guns===config.guns)
        if(!prior||prior.outputSha256!==row.outputSha256)throw Error('Cache changed a recorded round result')
    }
    rows.push(row)
    if(process.argv.includes('--trace')||mapId==='Mirage'&&config.seed===4326174)writeFileSync(`tmp/${mapId.toLowerCase()}-${SPATIAL_ROUND_ENGINE}-${config.objective}-${config.guns?'combat':'movement'}-trace.json`,JSON.stringify({project,result}))
    const report={engine:SPATIAL_ROUND_ENGINE,mapId,fixtureSha256:hash(source),simulatorSourceSha256,meshSha256:reference.meshSha256,complete:rows.length===selectedRuns.length,
        scope:`${selectedRuns.filter(r=>r.guns).length} combat and ${selectedRuns.filter(r=>!r.guns).length} no-gun movement/objective cases; provisional reference geometry, no verified utility lineups or career adoption.`,rows}
    writeFileSync(`docs/ui-review/map-pool/${mapId.toLowerCase()}-${SPATIAL_ROUND_ENGINE}${suffix}${process.argv.includes('--movement-only')?'-movement':process.argv.includes('--combat-only')?'-combat':''}.json`,JSON.stringify(report,null,2)+'\n')
    console.log(JSON.stringify(row))
}
