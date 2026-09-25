import{readFileSync}from'node:fs'
import{CollisionScene,withOccupiedBodies}from'../../engine/spatial/geometry'
import{NavigationMesh,DEFAULT_ROUTE_OPTIONS}from'../../engine/spatial/navigation'
import{simulateMovement}from'../../engine/spatial/movement'
import{distance3}from'../../engine/spatial/types'
const [mapId,id,site='A',tick,mode='movement',engine='spatial-round-v11']=process.argv.slice(2),data=JSON.parse(readFileSync(`tmp/${mapId.toLowerCase()}-${engine}-${site}-${mode}-trace.json`,'utf8'))
const ref=JSON.parse(readFileSync(`public/map-studio/spatial/${mapId}.json`,'utf8')),bytes=readFileSync(`public/map-studio/spatial/${mapId}.mesh`),world=CollisionScene.fromBinary(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)as ArrayBuffer),nav=new NavigationMesh(ref)
const frame=tick?data.result.frames.find((f:any)=>f.tick>=Number(tick)):data.result.frames.at(-1)
const actor=frame.actors.find((a:any)=>a.id===id),pos=actor.position,goal=actor.goal
const starts=nav.surfaces(pos[0],pos[1]).filter(p=>Math.abs(p.point[2]-pos[2])<2),ends=nav.surfaces(goal[0],goal[1]).filter(p=>Math.abs(p.point[2]-goal[2])<2)
for(const height of[72,54])for(const occupied of[false,true])for(const start of starts)for(const end of ends){
 const scene=occupied?withOccupiedBodies(world,frame.actors.filter((a:any)=>a.id!==id&&a.side===actor.side&&a.health>0).map((a:any)=>a.position)):world
 const r=nav.findRoute(start,end,{...DEFAULT_ROUTE_OPTIONS,...data.project.settings,height},scene),track=simulateMovement(r,world,height===54?85:220,height,nav),hit=track.find(f=>world.bodyHit(f.position,height))
 console.log(JSON.stringify({height,occupied,start,end,last:track.at(-1),reason:r.reason,firstBodyHit:hit,remaining:hit?distance3(pos,hit.position):null}))
 if(track.at(-1)?.state==='blocked')console.log(JSON.stringify({nearbyRoute:r.points.map((p,i)=>({p,i,kind:r.kinds[i-1],distance:distance3(p,track.at(-1)!.position)})).sort((a,b)=>a.distance-b.distance).slice(0,6)}))
}
