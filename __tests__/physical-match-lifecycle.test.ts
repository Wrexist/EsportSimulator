import { initializePhysicalSeries, purchasePhysicalRound, physicalSeriesRequest, advancePhysicalSeries, progressPhysicalMap, finalizePhysicalSeries, type PhysicalSeriesConfig } from '@/engine/spatial/match-lifecycle'
import { createPhysicalJournal } from '@/engine/spatial/career-round-journal'
import { createRoundStartEconomy } from '@/lib/live-match-utils'
import { PlayerRole } from '@/types/enums'
import type { Player } from '@/types'
import { TEAM_DEFAULTS } from '@/engine/spatial/team-model'
import type { LabProject } from '@/lib/spatial-lab-project'
import { performBuyPhase } from '@/engine/match/buy-phase'
import { SeededRNG } from '@/engine/rng'
import type { CustomTactics } from '@/types'
import { buildSaveSnapshot, type SaveSnapshotState } from '@/store/utils/build-save-snapshot'
import { runMigrationLadder } from '@/engine/save-migrations'

function fixture(format: PhysicalSeriesConfig['format'] = 'BO1') {
    const players = (prefix:string)=>Array.from({length:5},(_,i)=>({id:`${prefix}${i}`,role:i===0?PlayerRole.AWPER:PlayerRole.RIFLER,rifle:70,awp:70,pistol:70,reaction:70,tactic:70} as Player))
    const homePlayers=players('h'),awayPlayers=players('a')
    const config:PhysicalSeriesConfig={format,seed:712,maps:Array.from({length:format==='BO5'?5:format==='BO3'?3:1},(_,i)=>({mapId:`map${i}`,homeStartsCT:i%2===0})),homePlayers,awayPlayers}
    return initializePhysicalSeries(createPhysicalJournal('career','session',0,{version:1,mode:'preview',matchId:'m',mapId:'map0',homeTeamId:'home',awayTeamId:'away',nextRound:1,homeScore:0,awayScore:0,homeLossStreak:0,awayLossStreak:0,homeEconomy:createRoundStartEconomy(homePlayers.map(p=>p.id),true),awayEconomy:createRoundStartEconomy(awayPlayers.map(p=>p.id),false),receipts:{}}),config)
}
type Journal = ReturnType<typeof fixture>
// Lifecycle boundary fixture: actual sealed-artifact ownership is tested separately.
function round(j:Journal,home:boolean) {
    j.series!.phase='ready'
    const number=j.settlement.nextRound++
    j.settlement[home?'homeScore':'awayScore']++
    advancePhysicalSeries(j,{replaySha256:`${j.mapIndex}:${number}`,round:{roundNumber:number,winningTeamId:home?'home':'away'},players:[]} as Parameters<typeof advancePhysicalSeries>[1])
}
function winMap(j:Journal,home:boolean){for(let i=0;i<13;i++)round(j,home)}

test('pistol and between-round purchases charge once, survive JSON and keep inputs immutable',()=>{
    const initial=fixture(),before=JSON.stringify(initial),bought=purchasePhysicalRound(initial,'FULL','FULL')
    expect(JSON.stringify(initial)).toBe(before)
    expect(bought.settlement.homeEconomy.h0).toMatchObject({cash:150,weapon:'usp',hasArmor:true,armorPoints:100,hasHelmet:false,hasKit:false})
    expect(bought.settlement.awayEconomy.a0.weapon).toBe('glock')
    expect(()=>purchasePhysicalRound(JSON.parse(JSON.stringify(bought)),'FULL','FULL')).toThrow('once')
    round(bought,true)
    bought.settlement.homeEconomy.h0={cash:10000,weapon:'awp',hasArmor:true,armorPoints:23,hasHelmet:true,hasKit:true,utility:['smoke']}
    const next=purchasePhysicalRound(bought,'FULL','ECO')
    expect(next.settlement.homeEconomy.h0).toMatchObject({cash:9350,weapon:'awp',armorPoints:100,hasHelmet:true,hasKit:true,utility:['smoke']})
    expect(purchasePhysicalRound(JSON.parse(JSON.stringify(bought)),'FULL','ECO')).toEqual(next)
    expect(()=>purchasePhysicalRound(bought,'PISTOL','FULL')).toThrow('half starts')
})

test('halftime swaps identities, resets money/equipment and preserves the score after exactly 12 rounds',()=>{
    const j=fixture();for(let i=0;i<11;i++)round(j,i%2===0)
    expect(j.series!.homeSide).toBe('CT')
    round(j,false)
    expect(j.settlement).toMatchObject({homeScore:6,awayScore:6,nextRound:13,homeLossStreak:0,awayLossStreak:0})
    expect(j.series!.homeSide).toBe('T')
    expect(j.settlement.homeEconomy.h0).toMatchObject({cash:800,weapon:'glock',hasArmor:false,hasKit:false,utility:[]})
    const ready=purchasePhysicalRound(j,'ECO','ECO'),point={area:1,point:[100,100,0]}
    const project={mapId:'map0',teams:{...TEAM_DEFAULTS,actors:['CT','T'].flatMap(side=>Array.from({length:5},(_,i)=>({id:`${side}${i}`,side,start:point,station:point})))}} as LabProject
    const request=physicalSeriesRequest(ready,project)
    expect(request.binding.players.find(p=>p.actorId==='T0')).toEqual({actorId:'T0',playerId:'h0',teamId:'home'})
    expect(request.binding.players.find(p=>p.actorId==='CT0')!.playerId).toBe('a0')
    expect(request.project.teams!.seed).toBe(712+13*7919)
    expect(project.teams!.seed).toBe(TEAM_DEFAULTS.seed)
    expect(()=>physicalSeriesRequest(ready,{...project,mapId:'other'})).toThrow('current series map')
})

test('12-12 enters overtime, tied sets repeat, and a threshold reached on a boundary wins before swapping',()=>{
    const j=fixture();for(let i=0;i<24;i++)round(j,i%2===0)
    expect(j.series).toMatchObject({overtimeSet:1,homeSide:'CT',phase:'buy'})
    expect(j.settlement.homeEconomy.h0.cash).toBe(10000)
    for(let i=0;i<3;i++)round(j,true)
    expect(j.series).toMatchObject({overtimeSet:1,homeSide:'T',phase:'buy'})
    expect(j.settlement.homeScore).toBe(15)
    for(let i=0;i<3;i++)round(j,false)
    expect(j.series).toMatchObject({overtimeSet:2,homeSide:'CT',phase:'buy'})
    for(let i=0;i<3;i++)round(j,true)
    expect(j.series!.phase).toBe('buy')
    round(j,true)
    expect(j.settlement).toMatchObject({homeScore:19,awayScore:15})
    expect(j.series).toMatchObject({phase:'finished',homeWins:1,awayWins:0})
    expect(j.series!.completedMaps[0].rounds).toHaveLength(34)
    const clinch=fixture();for(let i=0;i<24;i++)round(clinch,i%2===0)
    for(let i=0;i<3;i++)round(clinch,true)
    round(clinch,false);round(clinch,false);round(clinch,true)
    expect(clinch.series).toMatchObject({phase:'finished',homeSide:'T',overtimeSet:1})
})

test.each(['BO1','BO3','BO5'] as const)('%s clinches early and final settlement is immutable, preview-only and idempotent',format=>{
    let j=fixture(format);const needed=format==='BO5'?3:format==='BO3'?2:1
    expect(()=>finalizePhysicalSeries(j)).toThrow('not ready')
    expect(()=>progressPhysicalMap(j)).toThrow('not complete')
    for(let i=0;i<needed;i++){
        winMap(j,true)
        if(i<needed-1){
            expect(j.series!.phase).toBe('map-complete')
            j=progressPhysicalMap(JSON.parse(JSON.stringify(j)))
            expect(j.settlement).toMatchObject({mapId:`map${i+1}`,nextRound:1,homeScore:0,awayScore:0,receipts:{}})
            expect(j.series!.overtimeSet).toBe(0)
            expect(j.settlement.homeEconomy.h0.cash).toBe(800)
        }
    }
    expect(j.series!.phase).toBe('finished')
    const before=JSON.stringify(j),final=finalizePhysicalSeries(j)
    expect(JSON.stringify(j)).toBe(before)
    expect(final.series!.final).toMatchObject({mode:'preview',careerEligible:false,winnerId:'home',homeWins:needed,awayWins:0})
    expect(final.series!.final!.maps).toHaveLength(needed)
    expect(finalizePhysicalSeries(JSON.parse(JSON.stringify(final)))).toEqual(final)
    expect(()=>purchasePhysicalRound(final,'FULL','FULL')).toThrow()
    expect(()=>progressPhysicalMap(final)).toThrow()
})

test('split BO3 reaches the decider, overtime state clears for the next map and away can win',()=>{
    let j=fixture('BO3');for(let i=0;i<24;i++)round(j,i%2===0);for(let i=0;i<4;i++)round(j,true)
    j=progressPhysicalMap(j)
    expect(j.series).toMatchObject({homeWins:1,awayWins:0,overtimeSet:0,homeSide:'T'})
    winMap(j,false);j=progressPhysicalMap(j);winMap(j,false)
    expect(finalizePhysicalSeries(j).series!.final).toMatchObject({homeWins:1,awayWins:2,winnerId:'away'})
})

test('exhausted armor with surviving helmet repairs for vest cost; unknown utility cannot be acquired free',()=>{
    const player={id:'p',role:PlayerRole.RIFLER} as Player
    const economy={p:{id:'p',cash:2000,weapon:'ak47',hasArmor:false,armorPoints:0,hasHelmet:true,hasKit:false,utility:[] as string[]}}
    performBuyPhase([player],economy,'FULL',false,new SeededRNG(1))
    expect(economy.p).toMatchObject({cash:1350,armorPoints:100,hasArmor:true,hasHelmet:true})
    const tactic={FULL:{t:{playerLoadouts:[{slotIndex:0,utility:['unknown-free-item']}]}}} as unknown as CustomTactics
    performBuyPhase([player],economy,'FULL',false,new SeededRNG(1),tactic)
    expect(economy.p.utility).toEqual([])
})

test('canonical save snapshots and migration preserve the series without sharing live mutations',()=>{
    const j=purchasePhysicalRound(fixture('BO3'),'FULL','FULL')
    const snapshot=buildSaveSnapshot({physicalMatchPreview:j} as unknown as SaveSnapshotState)
    expect(snapshot.physicalMatchPreview).toEqual(j)
    j.series!.homeWins=1
    expect(snapshot.physicalMatchPreview!.series!.homeWins).toBe(0)
    const migrated=runMigrationLadder({...snapshot,saveVersion:7} as never)
    expect(migrated.physicalMatchPreview).toEqual(snapshot.physicalMatchPreview)
})
