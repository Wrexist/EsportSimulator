/** Original model-calibration fixtures, not imported or certified CS2 lineups. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { ACTIVE_MAP_POOL } from '../../data/map-pool'
import { CollisionScene } from '../../engine/spatial/geometry'
import { NavigationMesh, DEFAULT_ROUTE_OPTIONS, type NavLocation } from '../../engine/spatial/navigation'
import { simulateMovement } from '../../engine/spatial/movement'
import { simulateTeams } from '../../engine/spatial/team-simulation'
import { TEAM_DEFAULTS, type TeamMember, type TeamSetup } from '../../engine/spatial/team-model'
import { DEFAULT_UTILITY, EMPTY_STOCK, UtilitySimulation, smokeRay, type ThrowPlan } from '../../engine/spatial/utility'
import { distance3, type SpatialReference, type Vec3 } from '../../engine/spatial/types'
import { emptyLabProject } from '../../lib/spatial-lab-project'
import { SPATIAL_ROUND_ENGINE } from '../../engine/spatial/round-replay'

const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex')
const maps=process.argv[2]?[process.argv[2]]:ACTIVE_MAP_POOL
const sourceHash=hash(['team-simulation','team-model','navigation','movement','recovery-support','utility','geometry'].map(f=>readFileSync(`engine/spatial/${f}.ts`,'utf8')).join('\n'))
mkdirSync('public/map-studio/teams/recovery',{recursive:true})
mkdirSync('docs/ui-review/recovery-utility',{recursive:true})
for(const mapId of maps){
    if(!ACTIVE_MAP_POOL.some(m=>m===mapId))throw Error('Active maps only')
    const ref=JSON.parse(readFileSync(`public/map-studio/spatial/${mapId}.json`,'utf8')) as SpatialReference
    const bytes=readFileSync(`public/map-studio/spatial/${mapId}.mesh`)
    if(hash(bytes)!==ref.meshSha256)throw Error('Mesh hash mismatch')
    const world=CollisionScene.fromBinary(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer),nav=new NavigationMesh(ref)
    const pool=JSON.parse(readFileSync(`public/map-studio/teams/map-pool/${mapId.toLowerCase()}.lab.json`,'utf8'))
    const valid=(p:NavLocation)=>nav.supportedBody(p.point,world)&&!world.bodyHit(p.point,72)
    const ground=(p:Vec3)=>nav.surfaces(p[0],p[1]).filter(q=>Math.abs(q.point[2]-p[2])<20&&valid(q)).sort((a,b)=>Math.abs(a.point[2]-p[2])-Math.abs(b.point[2]-p[2]))[0]
    const candidates=[...nav.centers].map(([area,point])=>({area,point})).filter(valid)
        .sort((a,b)=>Math.min(...Object.values(pool.teams.sites as Record<string,NavLocation>).map(s=>distance3(a.point,s.point)))-Math.min(...Object.values(pool.teams.sites as Record<string,NavLocation>).map(s=>distance3(b.point,s.point)))||a.area-b.area).slice(0,100)
    let attempts=0,done=false
    search:for(const origin of candidates)for(let direction=0;direction<8;direction++){
        const yaw=direction*45-180,angle=yaw*Math.PI/180,ux=Math.cos(angle),uy=Math.sin(angle)
        const plan:ThrowPlan={id:`${mapId.toLowerCase()}-recovery-smoke`,owner:'T2',kind:'smoke',at:0,yaw,pitch:-15,power:.3,mode:'lob',tolerance:4,bounceTargets:[],origin:[...origin.point]}
        const inventory={T1:{...EMPTY_STOCK},T2:{...EMPTY_STOCK,smoke:1},CT1:{...EMPTY_STOCK}}
        const utility={...DEFAULT_UTILITY,inventory,throws:[plan]}
        const probe=new UtilitySimulation(utility,world,['T1','T2','CT1'])
        for(let tick=0;tick<=384&&!probe.effects.length&&probe.flights[0]?.state!=='failed';tick++)probe.step(tick,[{id:'T2',position:origin.point,yaw,pitch:0,health:100}],72)
        const effect=probe.effects[0];if(!effect)continue
        const bomb=ground([effect.point[0]+ux*40,effect.point[1]+uy*40,effect.point[2]])
        if(!bomb||distance3(origin.point,bomb.point)<120)continue
        for(const sign of [1,-1]){
            const recoverer=ground([bomb.point[0]-uy*sign*90,bomb.point[1]+ux*sign*90,bomb.point[2]])
            const threat=ground([bomb.point[0]+ux*280,bomb.point[1]+uy*280,bomb.point[2]])
            if(!recoverer||!threat||distance3(origin.point,recoverer.point)<48)continue
            const eye=(p:Vec3):Vec3=>[p[0],p[1],p[2]+64]
            if(world.raycast(eye(origin.point),eye(threat.point))||world.raycast(eye(threat.point),eye(bomb.point))||!smokeRay(eye(threat.point),eye(bomb.point),[effect],effect.start,world))continue
            const route=nav.findRoute(recoverer,bomb,DEFAULT_ROUTE_OPTIONS,world)
            if(simulateMovement(route,world,220,72,nav).at(-1)?.state!=='arrived')continue
            plan.target=[...effect.point];plan.bounceTargets=probe.flights[0].bounces.slice(0,8).map(p=>[...p]);plan.trigger='recovery'
            const member=(id:string,side:'T'|'CT',start:NavLocation,role:TeamMember['role']):TeamMember=>({id,side,start,station:start,role,yaw:Math.atan2(threat.point[1]-start.point[1],threat.point[0]-start.point[0])*180/Math.PI,health:100,armor:100,ammo:30})
            const teams:TeamSetup={...TEAM_DEFAULTS,seed:4326170,seconds:10,roundSeconds:10,bombSeconds:5,openingSeconds:10,initialBomb:'dropped',carrier:'T1',sites:{A:bomb,B:origin},actors:[member('T1','T',recoverer,'entry'),member('T2','T',origin,'support'),member('CT1','CT',threat,'anchor')],utility}
            attempts++
            const result=simulateTeams(teams,nav,world,[],true)
            const event=(type:string)=>result.events.find(e=>e.type===type)
            const ready=event('recovery-screen-ready'),pickup=event('bomb-picked-up'),burst=event('grenade-detonate'),wait=event('recovery-screen-wait')
            if(!wait||!ready||!pickup||!burst||ready.tick<=burst.tick||pickup.tick<ready.tick||result.metrics.minSeparation<32||result.utility?.checks[0].state!=='matches-model'||result.events.filter(e=>e.type==='grenade-throw').length!==1)continue
            const project={...emptyLabProject(ref),teams},serialized=JSON.stringify(project,null,2)+'\n'
            writeFileSync(`public/map-studio/teams/recovery/${mapId.toLowerCase()}.lab.json`,serialized)
            const receipt={engine:SPATIAL_ROUND_ENGINE,mapId,scope:'Controlled 2T/1CT recovery smoke against actual reference collision. Original simulator calibration, not a real-game lineup or full 5v5 certification.',meshSha256:ref.meshSha256,simulatorSourceSha256:sourceHash,fixtureSha256:hash(serialized),attempts,origin:origin.point,bomb:bomb.point,threat:threat.point,landing:effect.point,bounces:probe.flights[0].bounces,waitTick:wait.tick,burstTick:burst.tick,screenReadyTick:ready.tick,pickupTick:pickup.tick,checks:result.utility.checks,minSeparation:result.metrics.minSeparation,outputSha256:hash(JSON.stringify(result))}
            writeFileSync(`docs/ui-review/recovery-utility/${mapId.toLowerCase()}-${SPATIAL_ROUND_ENGINE}.json`,JSON.stringify(receipt,null,2)+'\n')
            console.log(JSON.stringify(receipt));done=true;break search
        }
    }
    if(!done)throw Error(`No validated recovery smoke found on ${mapId}; keep the failure visible`)
}
