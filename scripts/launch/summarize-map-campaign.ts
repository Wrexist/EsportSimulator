import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {ACTIVE_MAP_POOL} from '../../data/map-pool'
import {SPATIAL_ROUND_ENGINE} from '../../engine/spatial/round-replay'
const hash=(s:string)=>createHash('sha256').update(s).digest('hex')
const engineFiles=['team-simulation.ts','team-model.ts','navigation.ts','movement.ts','objective-zones.ts','recovery-support.ts','utility.ts','geometry.ts']
const source=hash(engineFiles.map(f=>readFileSync(`engine/spatial/${f}`,'utf8')).join('\n'))
const movementOnly=process.argv.includes('--movement-only')
if(process.argv.includes('--acceptance')){
 // Acceptance matrix written by `calibrate-map-pool.ts <map> --acceptance --combat-only|--movement-only`.
 const rows=ACTIVE_MAP_POOL.flatMap(mapId=>(['combat','movement'] as const).flatMap(mode=>{
  const file=`docs/ui-review/map-pool/${mapId.toLowerCase()}-${SPATIAL_ROUND_ENGINE}-acceptance-${mode}.json`
  if(!existsSync(file))throw Error(`${mapId}: missing ${mode} acceptance receipt`)
  const r=JSON.parse(readFileSync(file,'utf8'))
  if(!r.complete||r.simulatorSourceSha256!==source)throw Error(`${mapId}: incomplete or stale ${mode} acceptance receipt`)
  const fixture=mapId==='Mirage'?'docs/ui-review/physical-career/mirage-5v5-review.lab.json':`public/map-studio/teams/map-pool/${mapId.toLowerCase()}.lab.json`
  if(r.fixtureSha256!==hash(readFileSync(fixture,'utf8')))throw Error(`${mapId}: fixture changed`)
  return r.rows.map((row:any)=>({mapId,...row}))
 }))
 const count=(f:(r:any)=>boolean)=>rows.filter(f).length
 const summary={engine:SPATIAL_ROUND_ENGINE,simulatorSourceSha256:source,rounds:rows.length,combatRounds:count(r=>r.guns),noGunRounds:count(r=>!r.guns),
  minSeparation:Math.min(...rows.map(r=>r.metrics.minSeparation)),routeFailures:rows.reduce((n,r)=>n+r.routeFailures.length,0),
  combatBlocked:rows.filter(r=>r.guns).reduce((n,r)=>n+r.finalBlocked.length,0),noGunBlocked:rows.filter(r=>!r.guns).reduce((n,r)=>n+r.finalBlocked.length,0),
  noPlantTimeouts:rows.filter(r=>!r.plants&&/Round time/.test(r.reason)).map(r=>`${r.mapId} ${r.objective} ${r.guns?'combat':'no-gun'} ${r.seed}`),
  rows:rows.map(r=>({mapId:r.mapId,seed:r.seed,objective:r.objective,guns:r.guns,outcome:r.outcome,reason:r.reason,seconds:r.seconds,plants:r.plants,defuses:r.defuses,recoveries:r.recoveries,
   routeFailures:r.routeFailures.length,finalBlocked:r.finalBlocked.map((b:any)=>b.id),outputSha256:r.outputSha256}))}
 writeFileSync(`docs/ui-review/map-pool/${SPATIAL_ROUND_ENGINE}-acceptance-summary.json`,JSON.stringify(summary,null,2)+'\n')
 console.log(JSON.stringify({...summary,rows:undefined},null,2))
 process.exit(0)
}
const reports=ACTIVE_MAP_POOL.map(mapId=>{
 const prefix=`docs/ui-review/map-pool/${mapId.toLowerCase()}-${SPATIAL_ROUND_ENGINE}-reviewed`
 const files=movementOnly?[`${prefix}-movement.json`,`${prefix}.json`]:[`${prefix}.json`]
 const r=files.filter(existsSync).map(file=>JSON.parse(readFileSync(file,'utf8'))).find(r=>r.complete&&r.simulatorSourceSha256===source)
 if(!r)throw Error(`${mapId}: no complete current-source report`)
 if(!r.complete||r.simulatorSourceSha256!==source)throw Error(`${mapId}: incomplete or stale campaign`)
 const file=mapId==='Mirage'?'docs/ui-review/physical-career/mirage-5v5-review.lab.json':`public/map-studio/teams/map-pool/${mapId.toLowerCase()}.lab.json`
 if(r.fixtureSha256!==hash(readFileSync(file,'utf8')))throw Error(`${mapId}: fixture changed`)
 return r
})
const rows=reports.flatMap(r=>r.rows.filter((row:any)=>!movementOnly||!row.guns).map((row:any)=>({mapId:r.mapId,...row})))
if(movementOnly&&rows.length!==ACTIVE_MAP_POOL.length)throw Error('Expected one movement case per active map')
const summary={engine:SPATIAL_ROUND_ENGINE,simulatorSourceSha256:source,rounds:rows.length,combatRounds:rows.filter(r=>r.guns).length,minSeparation:Math.min(...rows.map(r=>r.metrics.minSeparation)),combatBlocked:rows.filter(r=>r.guns).reduce((n,r)=>n+r.finalBlocked.length,0),movementBlocked:rows.filter(r=>!r.guns).reduce((n,r)=>n+r.finalBlocked.length,0),movementTimeouts:rows.filter(r=>!r.guns&&!r.plants).map(r=>r.mapId),rows}
writeFileSync(`docs/ui-review/map-pool/${SPATIAL_ROUND_ENGINE}${movementOnly?'-movement':''}-summary.json`,JSON.stringify(summary,null,2)+'\n')
console.log(JSON.stringify({...summary,rows:rows.map(r=>({mapId:r.mapId,objective:r.objective,guns:r.guns,seconds:r.seconds,reason:r.reason,blocked:r.finalBlocked.length,waits:r.metrics.waits}))},null,2))
