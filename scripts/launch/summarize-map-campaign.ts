import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {ACTIVE_MAP_POOL} from '../../data/map-pool'
import {SPATIAL_ROUND_ENGINE} from '../../engine/spatial/round-replay'
const hash=(s:string)=>createHash('sha256').update(s).digest('hex')
const engineFiles=['team-simulation.ts','team-model.ts','navigation.ts','movement.ts','objective-zones.ts','recovery-support.ts','utility.ts','geometry.ts']
const source=hash(engineFiles.map(f=>readFileSync(`engine/spatial/${f}`,'utf8')).join('\n'))
const movementOnly=process.argv.includes('--movement-only')
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
