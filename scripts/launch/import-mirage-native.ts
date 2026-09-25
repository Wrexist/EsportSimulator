import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {parseProject} from '../../lib/map-annotations'
import {toRadar,type SpatialReference} from '../../engine/spatial/types'
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'))
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex')
const project=parseProject(readFileSync('public/map-studio/drafts/mirage-v13-repaired.json','utf8'))
const ref=read('public/map-studio/spatial/Mirage.json') as SpatialReference
const nav=read('tmp/mirage-installed-nav.json')
const areas=nav.areas.filter((a:any)=>a.hull===0&&a.movable===4294967295)
const ids=new Set(areas.map((a:any)=>a.id))
for(const a of areas)a.edges=a.edges.filter((e:any)=>ids.has(e.target))
if(JSON.stringify(areas)!==JSON.stringify(ref.areas)||JSON.stringify(nav.ladders)!==JSON.stringify(ref.ladders))throw Error('Installed navigation differs; registration must be reviewed')
const radar=(p:number[])=>{const [x,y]=toRadar(p as [number,number,number],ref);const [a,b,c,d,e,f]=project.registration!.matrix,det=a*e-b*d;return{x:(e*(x-c)-b*(y-f))/det,y:(a*(y-f)-d*(x-c))/det}}
function hull(points:number[][]){const ps=[...new Map(points.map(p=>[`${p[0]},${p[1]}`,p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const cross=(o:number[],a:number[],b:number[])=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);const lower:number[][]=[],upper:number[][]=[];for(const p of ps){while(lower.length>1&&cross(lower.at(-2)!,lower.at(-1)!,p)<=0)lower.pop();lower.push(p)}for(const p of [...ps].reverse()){while(upper.length>1&&cross(upper.at(-2)!,upper.at(-1)!,p)<=0)upper.pop();upper.push(p)}return lower.slice(0,-1).concat(upper.slice(0,-1))}
const raw=readFileSync('tmp/mirage-entities.txt');const text=raw[0]===255&&raw[1]===254?raw.toString('utf16le'):raw.toString('utf8')
const spawns:any[]=[]
let nativeTargets=0
for(const match of text.matchAll(/values\s*=\s*\{([^{}]*)\}/g)){
 const block=match[1],cls=/classname\s*=\s*"([^"]+)"/.exec(block)?.[1]
 if(cls==='func_bomb_target'){
  const vector=(key:string)=>new RegExp(key+'\\s*=\\s*\\[([^\\]]+)\\]').exec(block)?.[1].split(',').map(Number)
  if(JSON.stringify(vector('origin'))!=='[0,0,0]'||JSON.stringify(vector('angles'))!=='[0,0,0]'||JSON.stringify(vector('scales'))!=='[1,1,1]')throw Error('Transformed native trigger requires model-space conversion')
  nativeTargets++
 }
 if(!['info_player_counterterrorist','info_player_terrorist'].includes(cls||''))continue
 const origin=/origin\s*=\s*\[([^\]]+)\]/.exec(block),id=/hammerUniqueId\s*=\s*"([^"]+)"/.exec(block)?.[1]
 if(!origin||!id)throw Error('Malformed native spawn')
 const p=origin[1].split(',').map(Number),enabled=/enabled\s*=\s*true/.test(block),priority=Number(/priority\s*=\s*(-?\d+)/.exec(block)?.[1]||0)
 spawns.push({id,side:cls==='info_player_counterterrorist'?'CT':'T',origin:p,radar:radar(p),enabled,priority})
}
if(!spawns.some(s=>s.side==='CT'&&s.enabled)||!spawns.some(s=>s.side==='T'&&s.enabled))throw Error('Missing native spawns')
if(nativeTargets!==2)throw Error('Unexpected number of bomb targets')
const sites:any[]=[]
for(const site of ['A','B']){
 const path=`tmp/mirage-native-${site.toLowerCase()}.json`,physics=read(path)
 if(physics.hulls.length!==1||physics.meshes.length)throw Error('Complex trigger requires union support')
 const h=physics.hulls[0],polygon=hull(h.vertices),mark=project.marks.find(m=>m.kind==='bombsite'&&m.spatial?.site===site)!
 if(!mark)throw Error('Missing site')
 sites.push({site,vertices:h.vertices,min:h.min,max:h.max,previousPoints:mark.points,points:polygon.map(radar)})
 mark.points=polygon.map(radar);mark.label=`${site} native plant footprint`;mark.status='draft'
 mark.note=`Footprint extracted from installed func_bomb_target convex hull. Native trigger Z ${h.min[2]} to ${h.max[2]}. Floor binding remains a separate navigation constraint; this 2D projection does not implement Source trigger/player overlap semantics.`
}
for(const s of spawns.filter(s=>s.enabled))project.marks.push({id:`native-spawn:${s.id}`,kind:'callout',points:[s.radar],label:`${s.side} spawn ${s.id.split(':').at(-1)}`,note:`Installed enabled spawn entity; priority ${s.priority}. World origin ${s.origin.join(', ')}. Entity origin is not a certified standing-foot position.`,side:s.side,status:'draft'})
delete project.validation
const out='public/map-studio/reviews/mirage-native';mkdirSync(out,{recursive:true})
const write=(p:string,v:unknown)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n')
write('public/map-studio/drafts/mirage-v13-native-sites.json',parseProject(JSON.stringify(project)))
const world=read('tmp/mirage-native-world.json')
write(`${out}/audit.json`,{format:'esim-native-map-audit',version:1,navMatches:true,navAreas:areas.length,spawns,sites,world:{hulls:world.hulls.length,meshes:world.meshes,collisionAttributeIndices:[...new Set(world.hulls.map((h:any)=>h.collisionAttributeIndex))]},sourceHashes:{nav:hash('tmp/mirage-local/maps/de_mirage.nav'),physics:hash('tmp/mirage-local/maps/de_mirage/world_physics.vmdl_c'),entities:hash('tmp/mirage-local/maps/de_mirage/entities/default_ents.vents_c')},limits:['Static reference mesh has not been replaced or certified against every native collision mask.','Authored wall heights remain unbound; no guessed extrusion added.','Spawn entity origins are review pins; runtime grounding and priority selection remain pending.','Native trigger footprints are draft projections; exact 3D trigger overlap remains pending.']})
console.log(JSON.stringify({spawns:spawns.length,enabled:spawns.filter(s=>s.enabled).length,sites:sites.map(s=>({site:s.site,min:s.min,max:s.max})),hulls:world.hulls.length,meshes:world.meshes.length}))
