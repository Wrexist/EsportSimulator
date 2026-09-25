import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { ACTIVE_MAP_POOL } from '../../data/map-pool'
import { CollisionScene } from '../../engine/spatial/geometry'
import { NavigationMesh, DEFAULT_ROUTE_OPTIONS } from '../../engine/spatial/navigation'
import { simulateMovement } from '../../engine/spatial/movement'
import { buildMapScenario, type NativeMapEvidence } from '../../engine/spatial/map-scenarios'
import { emptyLabProject, parseLabProject } from '../../lib/spatial-lab-project'
import type { SpatialReference } from '../../engine/spatial/types'

const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex')
const directory='public/map-studio/teams/map-pool'
mkdirSync(directory,{recursive:true});mkdirSync('docs/ui-review/map-pool',{recursive:true})
const rows=[]
for(const mapId of ACTIVE_MAP_POOL){
    if(mapId==='Mirage'){
        const path=`${directory}/mirage.lab.json`
        writeFileSync(path,readFileSync('docs/ui-review/physical-career/mirage-5v5-review.lab.json'))
        rows.push({mapId,project:'/map-studio/teams/map-pool/mirage.lab.json',ready:false,note:'Existing authored fixture; consult the separate full-round campaign.'});continue
    }
    try{
        const reference=JSON.parse(readFileSync(`public/map-studio/spatial/${mapId}.json`,'utf8')) as SpatialReference
        const bytes=readFileSync(`public/map-studio/spatial/${mapId}.mesh`),evidenceBytes=readFileSync(`public/map-studio/reviews/native/${mapId}/audit.json`)
        if(hash(bytes)!==reference.meshSha256)throw Error('Reference mesh checksum mismatch')
        const scene=CollisionScene.fromBinary(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer),nav=new NavigationMesh(reference)
        const built=buildMapScenario(JSON.parse(evidenceBytes.toString()) as NativeMapEvidence,nav,scene)
        const project=parseLabProject(JSON.stringify({...emptyLabProject(reference),settings:{height:72,speed:220,ladders:false,jumps:false,drops:false},teams:built.teams}),reference)
        const routes=(['T','CT'] as const).flatMap(side=>(['A','B'] as const).map(site=>{
            const r=nav.findRoute(built.teams.actors.find(a=>a.side===side)!.start,built.teams.sites[site],{...DEFAULT_ROUTE_OPTIONS,ladders:false},scene)
            const track=r.points.length?simulateMovement(r,scene,220,72,nav):[]
            return {side,site,arrived:track.at(-1)?.state==='arrived',reason:r.reason||track.at(-1)?.reason||null,seconds:track.at(-1)?.time||0}
        }))
        const path=`${directory}/${mapId.toLowerCase()}.lab.json`,serialized=JSON.stringify(project,null,2)+'\n'
        writeFileSync(path,serialized)
        const row={mapId,project:`/${path.slice(7)}`,meshSha256:reference.meshSha256,evidenceSha256:hash(evidenceBytes),projectSha256:hash(serialized),bindings:built.bindings,excluded:built.excluded,siteSamples:Object.fromEntries(Object.entries(built.sitePositions).map(([site,p])=>[site,p.length])),routes,ready:routes.every(r=>r.arrived)}
        rows.push(row);console.log(JSON.stringify({mapId,spawns:built.bindings.length,routes,ready:row.ready}))
    }catch(error){const row={mapId,ready:false,error:error instanceof Error?error.message:String(error)};rows.push(row);console.log(JSON.stringify(row))}
}
writeFileSync('docs/ui-review/map-pool/scenario-build.json',JSON.stringify({scope:'Grounded native spawns and projected plant-piece unions. Provisional static reference checks; no geometry certification or career adoption.',rows},null,2)+'\n')
writeFileSync('data/physical-map-scenarios.json',JSON.stringify(rows.map(r=>({mapId:r.mapId,project:'project'in r?r.project:null,ready:r.ready,...('error'in r?{error:r.error}:{})})),null,2)+'\n')
