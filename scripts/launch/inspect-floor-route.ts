import {readFileSync} from 'node:fs'
import {CollisionScene} from '../../engine/spatial/geometry'
import {NavigationMesh,DEFAULT_ROUTE_OPTIONS} from '../../engine/spatial/navigation'
import {simulateMovement} from '../../engine/spatial/movement'
import {distance3} from '../../engine/spatial/types'
const [mapId,actorId]=process.argv.slice(2)
const ref=JSON.parse(readFileSync(`public/map-studio/spatial/${mapId}.json`,'utf8'))
const bytes=readFileSync(`public/map-studio/spatial/${mapId}.mesh`),world=CollisionScene.fromBinary(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer),nav=new NavigationMesh(ref)
const project=JSON.parse(readFileSync(`public/map-studio/teams/map-pool/${mapId.toLowerCase()}.lab.json`,'utf8'))
const actor=project.teams.actors.find((a:{id:string})=>a.id===actorId),r=nav.findRoute(actor.start,actor.station,{...DEFAULT_ROUTE_OPTIONS,...project.settings},world),track=simulateMovement(r,world,220,72,nav),last=track.at(-1)!
console.log(JSON.stringify({last,nearest:r.points.map((p,i)=>({i,p,d:distance3(p,last.position)})).sort((a,b)=>a.d-b.d).slice(0,5),surfaces:nav.surfaces(last.position[0],last.position[1])}))
