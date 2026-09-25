import { webcrypto } from 'node:crypto'
import { CollisionScene } from '@/engine/spatial/geometry'
import { NavigationMesh } from '@/engine/spatial/navigation'
import type { SpatialReference } from '@/engine/spatial/types'
import { TEAM_DEFAULTS, parseTeamSetup } from '@/engine/spatial/team-model'
import { emptyLabProject } from '@/lib/spatial-lab-project'
import { runLabTeams } from '@/engine/spatial/lab-teams'
import { sealRoundReplay, captureRoundPosition, restoreRoundPosition, verifyRoundReplay, projectRoundReplay, type SpatialRoundReplay } from '@/engine/spatial/round-replay'
import { physicalWeapon } from '@/engine/spatial/weapon-profiles'
import { inPlantZone } from '@/engine/spatial/objective-zones'
import { bindCareerLoadouts } from '@/engine/spatial/career-loadouts'
import { settlePhysicalRoundPreview, type RoundSettlementPreview } from '@/engine/spatial/round-settlement'
import type { CareerRoundBinding } from '@/engine/spatial/career-round-adapter'
import { WEAPONS } from '@/engine/economy-manager'
import { resolveCareerRoundPreview } from '@/engine/spatial/resolve-career-round-preview'
import * as journalApi from '@/engine/spatial/career-round-journal'
import { createPhysicalPreviewSlice } from '@/store/slices/physical-preview-slice'
import type { StoreState } from '@/store/types'
import { produce } from 'immer'
import { buildSaveSnapshot, type SaveSnapshotState } from '@/store/utils/build-save-snapshot'
import { runMigrationLadder } from '@/engine/save-migrations'
import { careerRehearsalInput } from '@/engine/spatial/career-rehearsal-input'
import type { ActiveMatchState } from '@/types'
import { SaveManager } from '@/engine/save-manager'
import { initializePhysicalSeries, purchasePhysicalRound, physicalSeriesRequest, finalizePhysicalSeries } from '@/engine/spatial/match-lifecycle'
import type { Player } from '@/types'
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
const ref = { format: 'esim-spatial-reference', version: 1, mapId: 'Mirage', sourceVersion: 'test', meshSha256: 'floor', areas: [{ id: 1, hull: 0, flags: '0', movable: 4294967295, corners: [[0,0,0],[1000,0,0],[1000,1000,0],[0,1000,0]], edges: [], laddersAbove: [], laddersBelow: [] }], ladders: [] } as unknown as SpatialReference
const nav = new NavigationMesh(ref)
const floor = new CollisionScene(new Float32Array([0,0,0,1000,0,0,1000,1000,0,0,1000,0]), new Uint32Array([0,1,2,0,2,3]))
const point = (x: number,y: number) => ({ area: 1, point: [x,y,0] as [number,number,number] })
function project() {
    const p = emptyLabProject(ref)
    p.teams = { ...TEAM_DEFAULTS, seconds: 12, roundSeconds: 10, openingSeconds: 10, carrier: 'T1', sites: { A: point(600,400), B: point(800,800) }, actors: [
        { id:'T1', side:'T', role:'entry', start:point(200,400), station:point(200,400), yaw:0, health:100, armor:100, ammo:30 },
        { id:'CT1', side:'CT', role:'anchor', start:point(600,400), station:point(600,400), yaw:180, health:100, armor:100, ammo:30 },
    ] }
    return p
}
const binding: CareerRoundBinding = { matchId:'m', mapId:'Mirage', roundNumber:1, homeTeamId:'home', awayTeamId:'away', homeSide:'T', players:[{actorId:'T1',playerId:'p1',teamId:'home'},{actorId:'CT1',playerId:'p2',teamId:'away'}] }
const money = (weapon: string) => ({ cash:2000, weapon, hasArmor:true, hasHelmet:false, hasKit:false, utility:[] as string[] })
const state = (): RoundSettlementPreview => ({ version:1,mode:'preview',matchId:'m',mapId:'Mirage',homeTeamId:'home',awayTeamId:'away',nextRound:1,homeScore:0,awayScore:0,homeLossStreak:0,awayLossStreak:0,homeEconomy:{p1:money('ak47')},awayEconomy:{p2:money('usp')},receipts:{} })
const players = [{id:'p1',rifle:90,awp:20,pistol:40,reaction:80,tactic:60},{id:'p2',rifle:30,awp:40,pistol:80,reaction:30,tactic:40}]

test('a full roster purchase reaches the real resolver, sealed commit advances once, and changed series sides are rejected',async()=>{
    const p=project(),roster=Array.from({length:10},(_,i)=>({...players[i<5?0:1],id:`real-${i}`,role:'RIFLER'} as Player))
    p.teams!.actors=(['T','CT'] as const).flatMap(side=>Array.from({length:5},(_,i)=>({...p.teams!.actors[side==='T'?0:1],id:`${side}${i+1}`,side,start:point(side==='T'?200:600,100+i*170),station:point(side==='T'?200:600,100+i*170)})))
    p.teams!.carrier='T1'
    const s=state();s.homeEconomy=Object.fromEntries(roster.slice(0,5).map(p=>[p.id,money('usp')]));s.awayEconomy=Object.fromEntries(roster.slice(5).map(p=>[p.id,money('glock')]))
    let journal=initializePhysicalSeries(journalApi.createPhysicalJournal('career','series',0,s),{format:'BO1',seed:42,maps:[{mapId:'Mirage',homeStartsCT:true}],homePlayers:roster.slice(0,5),awayPlayers:roster.slice(5)})
    journal=purchasePhysicalRound(journal,'FULL','FULL')
    const request=physicalSeriesRequest(journal,p)
    const wrong=structuredClone(request);wrong.binding.homeSide='T'
    await expect(journalApi.reservePhysicalRound(journal,wrong,ref,'wrong')).rejects.toThrow('series identities')
    journal=await journalApi.reservePhysicalRound(journal,request,ref,'physical-one')
    const resolved=await resolveCareerRoundPreview(request,nav,floor),ticket=journal.pending!.ticket
    const changed=structuredClone(journal);changed.series!.homeSide='T'
    await expect(journalApi.commitPhysicalRound(changed,ticket,resolved.replay)).rejects.toThrow('Series changed')
    const completed=await journalApi.commitPhysicalRound(JSON.parse(JSON.stringify(journal)),ticket,resolved.replay)
    expect(completed.series!.phase).toBe('buy')
    expect(completed.series!.rounds).toHaveLength(1)
    expect(completed.settlement.nextRound).toBe(2)
    expect(await journalApi.commitPhysicalRound(completed,ticket,resolved.replay)).toEqual(completed)
    const h=storeHarness();h.set({physicalMatchPreview:completed,scheduledMatches:[{...h.get().scheduledMatches[0],seed:42,format:'BO1'}] as StoreState['scheduledMatches']})
    const duplicates=await Promise.allSettled([1,2].map(()=>h.actions.progressPhysicalPreview('career','series',completed.revision,{type:'buy',home:'FULL',away:'ECO'})))
    expect(duplicates.filter(result=>result.status==='fulfilled')).toHaveLength(1)
    expect(h.get().physicalMatchPreview!.revision).toBe(completed.revision+1)
    h.set({physicalMatchPreview:completed})
    await expect(h.actions.progressPhysicalPreview('career','other-session',completed.revision,{type:'buy',home:'FULL',away:'ECO'})).rejects.toThrow('Stale')
    const action=h.actions.progressPhysicalPreview('career','series',completed.revision,{type:'buy',home:'FULL',away:'ECO'})
    h.set({saveId:'another',physicalMatchPreview:null})
    await expect(action).rejects.toThrow('Career changed')
    expect(h.get().physicalMatchPreview).toBeNull()
},60000)
function bound() { const s=state(); return bindCareerLoadouts(project(),ref,binding,players,{...s.homeEconomy,...s.awayEconomy}) }

test('a complete physical 5v5 BO1 carries purchases and verified round receipts through final settlement',async()=>{
    const p=project(),roster=Array.from({length:10},(_,i)=>({id:`series-${i}`,role:'RIFLER',rifle:i<5?100:10,awp:i<5?100:10,pistol:i<5?100:10,reaction:i<5?100:10,tactic:i<5?100:10}))
    p.teams!.actors=(['T','CT'] as const).flatMap(side=>Array.from({length:5},(_,i)=>({...p.teams!.actors[side==='T'?0:1],id:`${side}${i+1}`,side,start:point(side==='T'?200:600,100+i*170),station:point(side==='T'?200:600,100+i*170)})))
    const s=state();s.homeEconomy=Object.fromEntries(roster.slice(0,5).map(p=>[p.id,money('usp')]));s.awayEconomy=Object.fromEntries(roster.slice(5).map(p=>[p.id,money('glock')]))
    let j=initializePhysicalSeries(journalApi.createPhysicalJournal('career','whole-series',0,s),{format:'BO1',seed:19,maps:[{mapId:'Mirage',homeStartsCT:true}],homePlayers:roster.slice(0,5),awayPlayers:roster.slice(5)})
    for(let i=0;i<60&&j.series!.phase!=='finished';i++){
        j=purchasePhysicalRound(JSON.parse(JSON.stringify(j)),'FULL','FULL')
        const request=physicalSeriesRequest(j,p)
        j=await journalApi.reservePhysicalRound(j,request,ref,`round-${i}`)
        const result=await resolveCareerRoundPreview(request,nav,floor)
        j=await journalApi.commitPhysicalRound(j,j.pending!.ticket,result.replay)
    }
    expect(j.series!.phase).toBe('finished')
    const final=finalizePhysicalSeries(j),map=final.series!.final!.maps[0]
    expect(map.rounds.length).toBe(map.homeScore+map.awayScore)
    expect(map.rounds.length).toBeGreaterThanOrEqual(13)
    expect(new Set(map.rounds.map(r=>r.replaySha256)).size).toBe(map.rounds.length)
    expect(map.rounds[11].round.ctTeam).not.toBe(map.rounds[12].round.ctTeam)
    expect(map.rounds.flatMap(r=>r.players).every(player=>roster.some(p=>p.id===player.playerId))).toBe(true)
    expect(finalizePhysicalSeries(JSON.parse(JSON.stringify(final)))).toEqual(final)
},120000)

test('partial armor survives settlement and JSON resume; invalid armor and armor on deaths cannot carry forward', async () => {
    const s=state();s.homeEconomy.p1.armorPoints=37
    const p=bindCareerLoadouts(project(),ref,binding,players,{...s.homeEconomy,...s.awayEconomy})
    expect(p.teams!.actors.find(a=>a.id==='T1')!.armor).toBe(37)
    const replay=await sealRoundReplay(p,ref,runLabTeams(p,nav,floor).result)
    const next=JSON.parse(JSON.stringify(await settlePhysicalRoundPreview(s,replay,binding))) as RoundSettlementPreview
    expect(next.homeEconomy.p1.armorPoints).toBe(37)
    expect(bindCareerLoadouts(project(),ref,{...binding,roundNumber:2},players,{...next.homeEconomy,...next.awayEconomy}).teams!.actors.find(a=>a.id==='T1')!.armor).toBe(37)
    next.homeEconomy.p1.armorPoints=101
    expect(()=>bindCareerLoadouts(project(),ref,binding,players,{...next.homeEconomy,...next.awayEconomy})).toThrow('armor')
    p.teams!.guns=true;p.teams!.actors.find(a=>a.id==='CT1')!.health=1
    const lethal=await sealRoundReplay(p,ref,runLabTeams(p,nav,floor).result)
    const after=await settlePhysicalRoundPreview(s,lethal,binding)
    expect(after.awayEconomy.p2.hasArmor).toBe(false)
    expect(after.awayEconomy.p2.armorPoints).toBe(0)
})

test('every existing purchasable weapon has an explicit profile; unknown IDs cannot become a rifle', () => {
    for (const weapon of Object.values(WEAPONS)) expect(physicalWeapon(weapon.id).id).toBe(weapon.id)
    expect(physicalWeapon('M4A1-S').id).toBe('m4a1s')
    expect(() => physicalWeapon('invalid')).toThrow()
    expect(physicalWeapon('nova').pellets).toBeGreaterThan(1)
    expect(physicalWeapon('p90').magazine).toBe(50)
})
test('loadout binding snapshots real proficiencies, magazine, armor and utility without mutating career inputs', () => {
    const p=project(), s=state(); s.homeEconomy.p1.utility=['smoke','flash','flash','molotov']
    const before=JSON.stringify({p,s,players}), next=bindCareerLoadouts(p,ref,binding,players,{...s.homeEconomy,...s.awayEconomy})
    expect(next.teams!.actors.find(a=>a.id==='T1')!.attributes).toEqual({aim:.9,reaction:.8,control:.75})
    expect(next.teams!.actors.find(a=>a.id==='CT1')!.ammo).toBe(12)
    expect(next.teams!.utility!.inventory.T1).toEqual({smoke:1,flash:2,he:0,fire:1,decoy:0})
    expect(JSON.stringify({p,s,players})).toBe(before)
    expect(()=>bindCareerLoadouts(p,ref,binding,[players[0],players[0]],{...s.homeEconomy,...s.awayEconomy})).toThrow()
})
test('loadout validation rejects oversized magazines, T kits and invalid attributes', () => {
    const p=bound(), a=p.teams!.actors[0]
    a.ammo=100; expect(()=>parseTeamSetup(p.teams,nav)).toThrow(); a.ammo=30
    a.loadout!.kit=true; expect(()=>parseTeamSetup(p.teams,nav)).toThrow(); a.loadout!.kit=false
    a.attributes!.reaction=NaN; expect(()=>parseTeamSetup(p.teams,nav)).toThrow()
})
test('individual reaction changes first-shot timing without changing the other player attributes', () => {
    const p=bound(); p.teams!.guns=true
    p.teams!.actors.find(a=>a.id==='CT1')!.yaw=0 // isolate reaction; the target is looking away
    p.teams!.actors.find(a=>a.id==='T1')!.attributes!.reaction=0
    const slow=runLabTeams(p,nav,floor,true).result
    p.teams!.actors.find(a=>a.id==='T1')!.attributes!.reaction=1
    const fast=runLabTeams(p,nav,floor,true).result
    expect(fast.events.find(e=>e.type==='shot'&&e.actor==='T1')!.tick).toBeLessThan(slow.events.find(e=>e.type==='shot'&&e.actor==='T1')!.tick)
    expect(fast.events.filter(e=>e.type==='shot'&&e.actor==='T1').every(e=>e.weapon==='ak47')).toBe(true)
})
test('head armor requires a helmet and shotgun trigger pulls do not consume one shell per pellet', () => {
    const p=bound(); p.teams!.guns=true; const t=p.teams!.actors.find(a=>a.id==='T1')!,ct=p.teams!.actors.find(a=>a.id==='CT1')!
    t.attributes={aim:1,reaction:1,control:1};ct.attributes={aim:0,reaction:0,control:0}
    t.loadout!.weapon='m4a4'
    const bare=runLabTeams(p,nav,floor,true).result.events.find(e=>e.type==='damage'&&e.actor==='T1'&&e.headshot)
    ct.loadout!.helmet=true
    const armored=runLabTeams(p,nav,floor,true).result.events.find(e=>e.type==='damage'&&e.actor==='T1'&&e.headshot)
    expect(bare).toBeDefined();expect(armored).toBeDefined();expect(bare!.damage).toBeGreaterThan(armored!.damage!)
    t.loadout!.weapon='nova';t.ammo=8
    const result=runLabTeams(p,nav,floor,true).result
    expect(result.events.filter(e=>e.type==='shot').length).toBe(result.metrics.shots)
    expect(result.events.some(e=>e.weapon==='nova')).toBe(true)
})
test('equipped kits determine uninterrupted defuse duration', () => {
    const p=bound();p.teams!.initialBomb='planted';p.teams!.bombSeconds=40;p.teams!.roundSeconds=115
    const ct=p.teams!.actors.find(a=>a.id==='CT1')!
    const noKit=runLabTeams(p,nav,floor).result
    ct.loadout!.kit=true
    const kit=runLabTeams(p,nav,floor).result
    expect(noKit.events.find(e=>e.type==='defused')!.tick - kit.events.find(e=>e.type==='defused')!.tick).toBe(5*64)
})
test('authored plant area requires entering the polygon on its floor, not merely approaching a site point', () => {
    const p=project();p.teams!.openingSeconds=0;p.teams!.actors[0].start=point(550,400);p.teams!.actors[0].station=point(550,400)
    p.teams!.actors[1].start=point(900,900);p.teams!.actors[1].station=point(900,900)
    p.teams!.plantZones={A:{points:[[590,390,0],[610,390,0],[610,410,0],[590,410,0]],zMin:-1,zMax:1},B:{points:[[780,780,0],[820,780,0],[820,820,0],[780,820,0]],zMin:-1,zMax:1}}
    const result=runLabTeams(p,nav,floor).result
    expect(result.events.find(e=>e.type==='plant-start')!.tick).toBeGreaterThan(0)
    expect(inPlantZone(result.events.find(e=>e.type==='planted')!.point!,p.teams!.plantZones.A)).toBe(true)
    expect(inPlantZone([600,400,100],p.teams!.plantZones.A)).toBe(false)
    p.teams!.plantZones.A.points=[[1,1,0],[2,1,0],[2,2,0]]
    expect(()=>parseTeamSetup(p.teams,nav)).toThrow('Objective point')
})
test('settlement is sequential and idempotent through JSON resume; stale loadouts and conflicting rounds fail', async () => {
    const p=bound(), replay=await sealRoundReplay(p,ref,runLabTeams(p,nav,floor,true).result), s=state(), before=JSON.stringify(s)
    const next=await settlePhysicalRoundPreview(s,replay,binding)
    expect(next.awayScore).toBe(1);expect(next.homeScore).toBe(0);expect(next.nextRound).toBe(2)
    expect(next.homeEconomy.p1.cash).toBe(3900);expect(next.awayEconomy.p2.cash).toBe(5250)
    expect(await settlePhysicalRoundPreview(JSON.parse(JSON.stringify(next)),replay,binding)).toEqual(next)
    expect(JSON.stringify(s)).toBe(before)
    await expect(settlePhysicalRoundPreview(s,replay,{...binding,roundNumber:2})).rejects.toThrow('sequence')
    s.homeEconomy.p1.weapon='awp';await expect(settlePhysicalRoundPreview(s,replay,binding)).rejects.toThrow('loadout')
    const other=structuredClone(p);other.teams!.seed++
    const changed=await sealRoundReplay(other,ref,runLabTeams(other,nav,floor,true).result)
    await expect(settlePhysicalRoundPreview(next,changed,binding)).rejects.toThrow('Conflicting')
})
test('version-one replays and saved cursors remain readable after introducing version two', async () => {
    const p=project(), current=await sealRoundReplay(p,ref,runLabTeams(p,nav,floor,true).result)
    const {sha256: _old,...body}=current
    const legacyBody={...body,engine:'spatial-round-v1' as const}
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(legacyBody)))),n=>n.toString(16).padStart(2,'0')).join('')
    const legacy:SpatialRoundReplay={...legacyBody,sha256:hash}
    expect(current.engine).toBe('spatial-round-v12');expect(await verifyRoundReplay(legacy)).toBe(true)
    const saved=captureRoundPosition(legacy,10);expect(saved.engine).toBe('spatial-round-v1');expect(restoreRoundPosition(legacy,saved).tick).toBe(10)
    expect(()=>restoreRoundPosition(current,saved)).toThrow()
})

test('one resolution owner returns a sealed round, matching career projection and settlement', async () => {
    const input={project:project(),binding,players,settlement:state()}, before=JSON.stringify(input)
    const result=await resolveCareerRoundPreview(input,nav,floor)
    expect(result.mode).toBe('preview');expect(result.expectedRound).toBe(1)
    expect(await verifyRoundReplay(result.replay)).toBe(true)
    expect(result.preview.replaySha256).toBe(result.replay.sha256)
    expect(result.settlement.homeScore + result.settlement.awayScore).toBe(1)
    expect(result.preview.round.winningTeamId === 'home' ? result.settlement.homeScore : result.settlement.awayScore).toBe(1)
    expect(result.replay.project.teams).toMatchObject({guns:true,roundSeconds:115,bombSeconds:40})
    expect(JSON.stringify(input)).toBe(before)
    expect(await resolveCareerRoundPreview(JSON.parse(before),nav,floor)).toEqual(result)
})

test('a purchased HE is consumed and its lethal damage earns the utility reward once', async () => {
    const s=state();s.homeEconomy.p1.utility=['he'];s.homeEconomy.p1.weapon='awp'
    const p=bindCareerLoadouts(project(),ref,binding,players,{...s.homeEconomy,...s.awayEconomy})
    p.teams!.openingSeconds=0;p.teams!.actors.find(a=>a.id==='CT1')!.health=1
    p.teams!.utility!.throws=[{id:'he-test',owner:'T1',kind:'he',at:0,yaw:0,pitch:0,power:.5,mode:'normal',tolerance:64,bounceTargets:[]}]
    const run=runLabTeams(p,nav,floor,true).result
    expect(run.events.some(e=>e.type==='blast-damage'&&e.target==='CT1'&&e.damage===1)).toBe(true)
    const replay=await sealRoundReplay(p,ref,run),next=await settlePhysicalRoundPreview(s,replay,binding)
    expect(next.homeEconomy.p1.utility).toEqual([])
    expect(next.homeEconomy.p1.cash).toBe(2000+300+3250)
    expect(projectRoundReplay(replay,run.frames.at(-1)!.tick).players.T1.reward).toBe(300+3250)
    expect(await settlePhysicalRoundPreview(next,replay,binding)).toEqual(next)
    expect(s.homeEconomy.p1.utility).toEqual(['he'])
})

async function reserved() {
    const request={project:project(),binding,players,settlement:state()}
    const initial=journalApi.createPhysicalJournal('career','session',0,request.settlement)
    const journal=await journalApi.reservePhysicalRound(initial,request,ref,'round-one')
    const result=await resolveCareerRoundPreview(request,nav,floor)
    return {request,journal,result,ticket:journal.pending!.ticket}
}

test.each(['spatial-round-v3','spatial-round-v4','spatial-round-v5','spatial-round-v6','spatial-round-v7','spatial-round-v8','spatial-round-v9','spatial-round-v10','spatial-round-v11'] as const)('%s recordings remain readable but pending rounds cannot silently change engine rules',async(engine)=>{
    const {journal,result,ticket,request}=await reserved()
    const {sha256:_hash,...body}=result.replay
    const legacyBody={...body,engine}
    const legacy={...legacyBody,sha256:await journalApi.physicalDigest(legacyBody)}
    expect(await verifyRoundReplay(legacy)).toBe(true)
    expect(restoreRoundPosition(legacy,captureRoundPosition(legacy,10)).tick).toBe(10)
    const old=structuredClone(journal);old.engine=engine;old.pending!.engine=engine
    await expect(journalApi.commitPhysicalRound(old,ticket,result.replay)).rejects.toThrow('engine changed')
    const unreserved=structuredClone(old);unreserved.pending=null
    await expect(journalApi.reservePhysicalRound(unreserved,request,ref,'new')).rejects.toThrow('engine changed')
})
test('a durable reservation resumes from JSON, commits once and keeps the original request immutable',async()=>{
    const {journal,result,ticket}=await reserved(), before=JSON.stringify(journal)
    const next=await journalApi.commitPhysicalRound(JSON.parse(before),ticket,result.replay)
    expect(next.revision).toBe(journal.revision+1);expect(next.pending).toBeNull()
    expect(next.settlement).toEqual(result.settlement)
    expect(await journalApi.commitPhysicalRound(JSON.parse(JSON.stringify(next)),ticket,result.replay)).toEqual(next)
    expect(JSON.stringify(journal)).toBe(before)
    const snap=buildSaveSnapshot({saveId:'career',physicalMatchPreview:next} as SaveSnapshotState)
    const restored=runMigrationLadder(JSON.parse(JSON.stringify(snap)))
    expect(restored.physicalMatchPreview).toEqual(next)
    expect(restored.physicalMatchPreview).not.toBe(next)
    expect(runMigrationLadder({...snap,physicalMatchPreview:undefined}).physicalMatchPreview).toBeNull()
    expect(new SaveManager().createSave('New career',{physicalMatchPreview:next}).physicalMatchPreview).toBeNull()
})
test('journal rejects cancelled, cross-career and independently changed settlement results',async()=>{
    const {journal,result,ticket}=await reserved()
    await expect(journalApi.commitPhysicalRound(journalApi.cancelPhysicalRound(journal),ticket,result.replay)).rejects.toThrow('cancelled')
    await expect(journalApi.commitPhysicalRound(journal,{...ticket,saveId:'other'},result.replay)).rejects.toThrow('another career')
    const changed=structuredClone(journal);changed.settlement.homeScore++
    await expect(journalApi.commitPhysicalRound(changed,ticket,result.replay)).rejects.toThrow('Settlement changed')
})
test('a validly sealed replay for different inputs or a changed mesh cannot settle a reservation',async()=>{
    const {journal,result,ticket,request}=await reserved()
    const other=structuredClone(request);other.project.teams!.seed++
    const different=await resolveCareerRoundPreview(other,nav,floor)
    await expect(journalApi.commitPhysicalRound(journal,ticket,different.replay)).rejects.toThrow('reserved inputs')
    const wrongMesh=await sealRoundReplay(result.replay.project,{...ref,meshSha256:'another-mesh'},result.replay.result)
    await expect(journalApi.commitPhysicalRound(journal,ticket,wrongMesh)).rejects.toThrow('reserved inputs')
    const tampered=structuredClone(journal);tampered.pending!.request.players[0].rifle=20
    await expect(journalApi.commitPhysicalRound(tampered,ticket,result.replay)).rejects.toThrow('reserved inputs')
})
function storeHarness(){
    let store={saveId:'career',activeMatchId:'m',scheduledMatches:[{id:'m',homeTeamId:'home',awayTeamId:'away',maps:['Mirage']}],completedMatches:[],physicalMatchPreview:null} as unknown as StoreState
    const set=(patch:Partial<StoreState>|((draft:StoreState)=>void))=>{store=typeof patch==='function'?produce(store,patch):{...store,...patch}}
    const get=()=>store
    return {get,set,actions:createPhysicalPreviewSlice(set,get)}
}
test('store ownership is checked again after async verification; changing careers cannot accept an old reply',async()=>{
    const h=storeHarness(),{request,result}=await reserved()
    await h.actions.startPhysicalPreview('career','owned',0,request.settlement)
    const ticket=await h.actions.reservePhysicalPreview(request,ref,'one')
    const commit= h.actions.commitPhysicalPreview(ticket,result.replay)
    h.set({saveId:'different-career',physicalMatchPreview:null})
    await expect(commit).rejects.toThrow('Career changed')
    expect(h.get().physicalMatchPreview).toBeNull()
})
test('simultaneous duplicate worker replies commit once; a completed match or replaced map rejects further results',async()=>{
    const h=storeHarness(),{request,result}=await reserved()
    await h.actions.startPhysicalPreview('career','owned',0,request.settlement)
    const ticket=await h.actions.reservePhysicalPreview(request,ref,'one')
    await Promise.all([h.actions.commitPhysicalPreview(ticket,result.replay),h.actions.commitPhysicalPreview(ticket,result.replay)])
    expect(h.get().physicalMatchPreview!.settlement.nextRound).toBe(2)
    expect(h.get().physicalMatchPreview!.revision).toBe(2)
    h.set({completedMatches:[{id:'m'}] as StoreState['completedMatches']})
    await expect(h.actions.commitPhysicalPreview(ticket,result.replay)).rejects.toThrow('No owned')
    h.actions.clearPhysicalPreview('different','owned');expect(h.get().physicalMatchPreview).not.toBeNull()
    h.actions.clearPhysicalPreview('career','owned');expect(h.get().physicalMatchPreview).toBeNull()
})

test('recorded career identities and seek checkpoints survive save recovery without settling again',async()=>{
    const {savedCareerRadarBinding}=await import('@/engine/spatial/career-radar')
    const {restoreRoundPosition}=await import('@/engine/spatial/round-replay')
    const h=storeHarness(),{request,result}=await reserved()
    await h.actions.startPhysicalPreview('career','owned',0,request.settlement)
    const ticket=await h.actions.reservePhysicalPreview(request,ref,'one')
    await h.actions.commitPhysicalPreview(ticket,result.replay)
    const before=structuredClone(h.get().physicalMatchPreview!.settlement)
    expect(h.actions.savePhysicalReplayPosition('other','owned',result.replay.sha256,10)).toBe(false)
    expect(h.actions.savePhysicalReplayPosition('career','old-session',result.replay.sha256,10)).toBe(false)
    expect(h.actions.savePhysicalReplayPosition('career','owned','wrong-replay',10)).toBe(false)
    expect(h.actions.savePhysicalReplayPosition('career','owned',result.replay.sha256,10)).toBe(true)
    const snapshot=buildSaveSnapshot({saveId:'career',physicalMatchPreview:h.get().physicalMatchPreview} as SaveSnapshot)
    const restored=JSON.parse(JSON.stringify(snapshot)).physicalMatchPreview
    expect(restoreRoundPosition(restored.latest.replay,restored.playback).tick).toBe(10)
    expect(restored.settlement).toEqual(before)
    const canonicalBinding={...request.binding,players:[...request.binding.players].sort((a,b)=>a.actorId.localeCompare(b.actorId))}
    expect(savedCareerRadarBinding(restored,'career','m')).toEqual(canonicalBinding)
    expect(savedCareerRadarBinding(restored,'other','m')).toBeNull()
    expect(savedCareerRadarBinding(restored,'career','different-match')).toBeNull()
    const nextMap=structuredClone(restored)
    nextMap.settlement.mapId='Inferno';nextMap.settlement.receipts={};nextMap.mapIndex=1
    expect(savedCareerRadarBinding(nextMap,'career','m')).toEqual(canonicalBinding)
    // Older journals recover identities from the exact settlement receipt.
    delete restored.latest.binding
    delete restored.latest.receipt
    expect(savedCareerRadarBinding(restored,'career','m')).toEqual(canonicalBinding)
})

test('buy-phase rehearsal preserves current side assignments, real roster order and purchased inventory',()=>{
    const p=project(),rosters=Array.from({length:10},(_,i)=>({...players[i<5?0:1],id:`career-${i}`}))
    p.teams!.actors=(['T','CT'] as const).flatMap(side=>Array.from({length:5},(_,i)=>({...p.teams!.actors[side==='T'?0:1],id:`${side}${i+1}`,side})))
    const active={matchId:'m',isWaitingForStrategy:true,gameState:{status:'IN_PROGRESS'},playback:{maps:['Mirage']},homeRoster:rosters.slice(0,5),awayRoster:rosters.slice(5),simState:{homeStartsCT:true,currentMapIndex:0,currentRound:13,homeRounds:7,awayRounds:5,homeLossStreak:0,awayLossStreak:0,homeEconomy:Object.fromEntries(rosters.slice(0,5).map(p=>[p.id,money('m4a4')])),awayEconomy:Object.fromEntries(rosters.slice(5).map(p=>[p.id,money('ak47')]))}} as unknown as ActiveMatchState
    const before=JSON.stringify(active),request=careerRehearsalInput(p,active,'home','away',rosters)
    expect(request.binding.homeSide).toBe('CT')
    expect(request.binding.players.find(p=>p.actorId==='CT1')!.playerId).toBe('career-0')
    expect(request.binding.players.find(p=>p.actorId==='T5')!.playerId).toBe('career-9')
    expect(request.settlement).toMatchObject({nextRound:13,homeScore:7,awayScore:5})
    request.settlement.homeEconomy['career-0'].cash=0
    expect(JSON.stringify(active)).toBe(before)
    active.isWaitingForStrategy=false
    expect(()=>careerRehearsalInput(p,active,'home','away',rosters)).toThrow('buy-phase')
})
