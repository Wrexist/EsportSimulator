import { mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { CollisionScene } from '../../engine/spatial/geometry'
import { NavigationMesh } from '../../engine/spatial/navigation'
import type { SpatialReference } from '../../engine/spatial/types'
import { TEAM_DEFAULTS, type TeamSetup } from '../../engine/spatial/team-model'
import { simulateTeams } from '../../engine/spatial/team-simulation'
import { physicalWeapon } from '../../engine/spatial/weapon-profiles'
import { SPATIAL_ROUND_ENGINE } from '../../engine/spatial/round-replay'

const reference = { format:'esim-spatial-reference',version:1,mapId:'Controlled floor',sourceVersion:'original-fixture-v1',meshSha256:'original-flat-floor',transform:{pos_x:0,pos_y:2000,scale:2},radars:{upper:''},ladders:[],areas:[{id:1,hull:0,flags:'0',movable:0,corners:[[0,0,0],[2000,0,0],[2000,2000,0],[0,2000,0]],edges:[],laddersAbove:[],laddersBelow:[]}]} as unknown as SpatialReference
const nav=new NavigationMesh(reference), world=new CollisionScene(new Float32Array([0,0,0,2000,0,0,2000,2000,0,0,2000,0]),new Uint32Array([0,1,2,0,2,3]))
const point=(x:number)=>({area:1,point:[x,1000,0] as [number,number,number]})
const rows: {left:string;right:string;range:number;mirrored:boolean;seed:number;outcome:string;winnerWeapon:string|null;timeout:boolean;shots:number;damage:number;seconds:number;alive:number}[]=[]
for(const [left,right] of [['ak47','m4a4'],['usp','glock'],['deagle','ak47'],['awp','m4a4'],['nova','mp9']]) for(const range of [256,1000]) for(const mirrored of [false,true]) for(let seed=1;seed<=10;seed++) {
    const ids=mirrored?[right,left]:[left,right]
    const setup:TeamSetup={...TEAM_DEFAULTS,seed,seconds:12,roundSeconds:10,openingSeconds:10,guns:true,carrier:'T1',sites:{A:point(1800),B:point(1700)},actors:ids.map((weapon,index)=>({id:index?'CT1':'T1',side:index?'CT':'T',role:index?'anchor':'entry',start:point(400+range*index),station:point(400+range*index),yaw:index?180:0,health:100,armor:100,ammo:physicalWeapon(weapon).magazine,loadout:{weapon,helmet:true,kit:false},attributes:{aim:.8,reaction:.7,control:.8}}))}
    const result=simulateTeams(setup,nav,world)
    rows.push({left,right,range,mirrored,seed,outcome:result.outcome,winnerWeapon:result.outcome==='unresolved'?null:ids[result.outcome==='T'?0:1],timeout:result.events.some(e=>e.type==='round-timeout'),shots:result.metrics.shots,damage:result.metrics.damage,seconds:result.frames.at(-1)!.tick/64,alive:result.frames.at(-1)!.actors.filter(a=>a.health>0).length})
}
const summary=[...new Set(rows.map(r=>`${r.left}/${r.right}@${r.range}`))].map(key=>{
    const group=rows.filter(r=>`${r.left}/${r.right}@${r.range}`===key)
    return {scenario:key,runs:group.length,timeouts:group.filter(r=>r.timeout).length,leftEliminationWins:group.filter(r=>!r.timeout&&r.winnerWeapon===r.left).length,rightEliminationWins:group.filter(r=>!r.timeout&&r.winnerWeapon===r.right).length,meanSeconds:group.reduce((s,r)=>s+r.seconds,0)/group.length,meanShots:group.reduce((s,r)=>s+r.shots,0)/group.length}
})
mkdirSync('docs/ui-review/physical-career',{recursive:true})
const report={model:SPATIAL_ROUND_ENGINE,scope:'200 deterministic, mirrored, controlled stationary duels. Original provisional tuning; not a map, tactical or production balance certification.',sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex'),summary,rows}
writeFileSync(`docs/ui-review/physical-career/combat-${SPATIAL_ROUND_ENGINE}-calibration.json`,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({sha256:report.sha256,summary},null,2))
