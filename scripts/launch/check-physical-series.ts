import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { CollisionScene } from '../../engine/spatial/geometry'
import { NavigationMesh } from '../../engine/spatial/navigation'
import { TEAM_DEFAULTS } from '../../engine/spatial/team-model'
import { SPATIAL_ROUND_ENGINE } from '../../engine/spatial/round-replay'
import { createPhysicalJournal, reservePhysicalRound, commitPhysicalRound } from '../../engine/spatial/career-round-journal'
import { initializePhysicalSeries, purchasePhysicalRound, physicalSeriesRequest, progressPhysicalMap, finalizePhysicalSeries } from '../../engine/spatial/match-lifecycle'
import { resolveCareerRoundPreview } from '../../engine/spatial/resolve-career-round-preview'
import { createRoundStartEconomy } from '../../lib/live-match-utils'
import { ACTIVE_MAP_POOL } from '../../data/map-pool'
import { parseLabProject } from '../../lib/spatial-lab-project'
import { emptyLabProject } from '../../lib/spatial-lab-project'
import { PlayerRole } from '../../types/enums'
import type { SpatialReference } from '../../engine/spatial/types'

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const roster=(prefix:string)=>Array.from({length:5},(_,i)=>({id:`${prefix}${i}`,role:PlayerRole.RIFLER,rifle:75,awp:70,pistol:75,reaction:75,tactic:70}))
const homePlayers=roster('home-'),awayPlayers=roster('away-')
const world=new CollisionScene(new Float32Array([0,0,0,1600,0,0,1600,1600,0,0,1600,0]),new Uint32Array([0,1,2,0,2,3]))
function fixture(mapId:string){
    const ref:SpatialReference={format:'esim-spatial-reference',version:1,mapId,sourceMap:'synthetic-series-floor',sourceVersion:'fixture-v1',sourceUrl:'local-test',meshSha256:hash('synthetic-series-floor-v1'),radars:{upper:'/test.png'},transform:{pos_x:0,pos_y:1600,scale:1},ladders:[],areas:[{id:1,hull:0,flags:'0',movable:4294967295,corners:[[0,0,0],[1600,0,0],[1600,1600,0],[0,1600,0]],edges:[],laddersAbove:[],laddersBelow:[]}]}
    const p=(x:number,y:number)=>({area:1,point:[x,y,0] as [number,number,number]})
    const project=emptyLabProject(ref)
    project.teams={...TEAM_DEFAULTS,seed:712,seconds:156,roundSeconds:115,bombSeconds:40,plantSeconds:3.2,defuseSeconds:10,openingSeconds:2,guns:true,carrier:'T1',sites:{A:p(800,800),B:p(1100,1100)},actors:(['CT','T'] as const).flatMap(side=>Array.from({length:5},(_,i)=>({id:`${side}${i+1}`,side,role:i===0?'entry' as const:'support' as const,start:p(side==='T'?300:1100,400+i*120),station:p(side==='T'?600:1000,400+i*120),yaw:side==='T'?0:180,health:100,armor:0,ammo:20})))}
    return {ref,project,nav:new NavigationMesh(ref)}
}
const realMaps=process.argv.includes('--real')?['Vertigo','Anubis','Sandstone']:null
function realFixture(mapId:string){
    assert.ok(ACTIVE_MAP_POOL.some(id=>id===mapId))
    const ref=JSON.parse(readFileSync(`public/map-studio/spatial/${mapId}.json`,'utf8')) as SpatialReference
    const mesh=readFileSync(`public/map-studio/spatial/${mapId}.mesh`)
    assert.equal(createHash('sha256').update(mesh).digest('hex'),ref.meshSha256)
    const source=readFileSync(`public/map-studio/teams/map-pool/${mapId.toLowerCase()}.lab.json`,'utf8')
    const project=parseLabProject(source,ref)
    Object.assign(project.teams!,{seconds:160,roundSeconds:115,bombSeconds:40,plantSeconds:3.2,defuseSeconds:10,guns:true})
    return {ref,project,nav:new NavigationMesh(ref),world:CollisionScene.fromBinary(mesh.buffer.slice(mesh.byteOffset,mesh.byteOffset+mesh.byteLength) as ArrayBuffer)}
}
async function main(){
    const reports=[]
    for(const homeStartsCT of (realMaps?[true]:[true,false])){
        const maps=(realMaps||['Series-A','Series-B','Series-C']).map((mapId,i)=>({mapId,homeStartsCT:i%2===0?homeStartsCT:!homeStartsCT}))
        let journal=initializePhysicalSeries(createPhysicalJournal('isolated-series','session',0,{version:1,mode:'preview',matchId:`series-${homeStartsCT}`,mapId:maps[0].mapId,homeTeamId:'home',awayTeamId:'away',nextRound:1,homeScore:0,awayScore:0,homeLossStreak:0,awayLossStreak:0,homeEconomy:createRoundStartEconomy(homePlayers.map(p=>p.id),homeStartsCT),awayEconomy:createRoundStartEconomy(awayPlayers.map(p=>p.id),!homeStartsCT),receipts:{}}),{format:'BO3',seed:712,maps,homePlayers,awayPlayers})
        const fixtures=maps.map(m=>realMaps?realFixture(m.mapId):{...fixture(m.mapId),world}),before=hash(fixtures.map(f=>f.project)),rounds=[]
        while(journal.series!.phase!=='finished'){
            assert.ok(rounds.length<150,'Series exceeded the bounded validation horizon')
            if(journal.series!.phase==='map-complete')journal=progressPhysicalMap(journal)
            const f=fixtures[journal.mapIndex]
            journal=purchasePhysicalRound(journal,'FULL','FULL')
            assert.throws(()=>purchasePhysicalRound(journal,'FULL','FULL'))
            const request=physicalSeriesRequest(journal,f.project),round=request.binding.roundNumber,side=request.binding.homeSide
            const homeSlots=request.binding.players.filter(p=>p.teamId==='home')
            assert.equal(homeSlots.length,5)
            assert.ok(homeSlots.every(p=>p.actorId.startsWith(side)&&p.playerId.startsWith('home-')))
            journal=await reservePhysicalRound(journal,request,f.ref,`${journal.mapIndex}:${round}`)
            // Resume the owned pending request through the serialized production journal.
            journal=JSON.parse(JSON.stringify(journal))
            const ticket=journal.pending!.ticket,result=await resolveCareerRoundPreview(journal.pending!.request,f.nav,f.world)
            journal=await commitPhysicalRound(journal,ticket,result.replay)
            assert.deepEqual(await commitPhysicalRound(journal,ticket,result.replay),journal)
            for(const key of ['homeScore','awayScore','nextRound','receipts'] as const)assert.deepEqual(journal.settlement[key],result.settlement[key])
            const nextRound=journal.settlement.nextRound
            const reset=journal.series!.phase==='buy'&&(nextRound===13||nextRound>=25&&(nextRound-25)%3===0)
            if(!reset)assert.deepEqual(journal.settlement,result.settlement)
            else for(const economy of [journal.settlement.homeEconomy,journal.settlement.awayEconomy]){
                assert.ok(Object.values(economy).every(p=>p.cash===(nextRound===13?800:10000)))
            }
            assert.ok(result.replay.result.metrics.minSeparation>=32)
            assert.equal(journal.pending,null)
            rounds.push({map:journal.mapIndex,mapId:f.ref.mapId,blocked:result.replay.result.frames.at(-1)!.actors.filter(a=>a.health>0&&a.intent==='blocked').map(a=>a.id),outcome:result.replay.result.outcome,elapsedSeconds:result.replay.result.frames.at(-1)!.tick/64,round,homeSide:side,winner:result.preview.round.winningTeamId,replaySha256:result.replay.sha256})
            console.log(JSON.stringify({homeStartsCT,...rounds.at(-1)}))
            if(realMaps)writeFileSync('tmp/real-series-progress.json',JSON.stringify({engine:SPATIAL_ROUND_ENGINE,complete:false,rounds,journal},null,2))
        }
        journal=finalizePhysicalSeries(journal)
        assert.deepEqual(finalizePhysicalSeries(journal),journal)
        assert.equal(journal.series!.final!.careerEligible,false)
        assert.ok(journal.series!.completedMaps.length>=2)
        assert.ok(rounds.some(r=>r.round===13&&r.homeSide!==(maps[r.map].homeStartsCT?'CT':'T')))
        assert.equal(hash(fixtures.map(f=>f.project)),before)
        reports.push({homeStartsCT,rounds,homeWins:journal.series!.homeWins,awayWins:journal.series!.awayWins,finalSha256:hash(journal.series!.final)})
    }
    mkdirSync('docs/ui-review/physical-career',{recursive:true})
    if(!realMaps){
    assert.equal(reports[0].rounds.length,reports[1].rounds.length)
    for(const [i,a] of reports[0].rounds.entries()){
        const b:{map:number;round:number;homeSide:string;winner:string|undefined;replaySha256:string}=reports[1].rounds[i]
        assert.equal(a.map,b.map);assert.equal(a.round,b.round)
        assert.notEqual(a.homeSide,b.homeSide);assert.notEqual(a.winner,b.winner)
        assert.equal(a.replaySha256,b.replaySha256,'Identical mirrored rosters changed physical results')
    }
    assert.ok(reports.every(r=>r.rounds.some(round=>round.round>=25)),'Seeded fixture must exercise overtime')
    }
    const sourceFiles=['team-simulation','navigation','movement','geometry','round-replay','career-round-journal','match-lifecycle','resolve-career-round-preview','career-loadouts','round-settlement']
    writeFileSync(`docs/ui-review/physical-career/${SPATIAL_ROUND_ENGINE}-${realMaps?'real-':''}series-integration.json`,JSON.stringify({engine:SPATIAL_ROUND_ENGINE,sourceFiles,sourceSha256:hash(sourceFiles.map(f=>readFileSync(`engine/spatial/${f}.ts`,'utf8'))),passed:true,maps:realMaps,scope:realMaps?'One full BO3 using shipped Vertigo, Anubis and Sandstone reference meshes and fixtures. Synthetic equal rosters; not packaged or production-career acceptance.':'Two mirrored full 5v5 BO3 series on a synthetic open-floor fixture, with real physics, purchases, pending JSON resume, sealed replay settlement, duplicate delivery and map progression. Not real-map or packaged acceptance.',reports},null,2)+'\n')
}
main().catch(error=>{console.error(error);process.exitCode=1})
