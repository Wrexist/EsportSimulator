import { webcrypto } from 'node:crypto'
import { CollisionScene } from '@/engine/spatial/geometry'
import { NavigationMesh } from '@/engine/spatial/navigation'
import type { SpatialReference } from '@/engine/spatial/types'
import { TEAM_DEFAULTS } from '@/engine/spatial/team-model'
import { emptyLabProject } from '@/lib/spatial-lab-project'
import { runLabTeams } from '@/engine/spatial/lab-teams'
import { sealRoundReplay, verifyRoundReplay, projectRoundReplay, captureRoundPosition, restoreRoundPosition } from '@/engine/spatial/round-replay'
import { previewCareerRound, type CareerRoundBinding } from '@/engine/spatial/career-round-adapter'
import { prepareCareerRadar, replayFloor } from '@/engine/spatial/career-radar'
import { toRadar } from '@/engine/spatial/types'

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
const ref = { mapId: 'Mirage', sourceVersion: 'test', meshSha256: 'controlled-floor', areas: [{ id: 1, hull: 0, flags: '0', movable: 4294967295, corners: [[0,0,0],[1000,0,0],[1000,1000,0],[0,1000,0]], edges: [], laddersAbove: [], laddersBelow: [] }], ladders: [] } as unknown as SpatialReference
const nav = new NavigationMesh(ref)
const floor = new CollisionScene(new Float32Array([0,0,0,1000,0,0,1000,1000,0,0,1000,0]), new Uint32Array([0,1,2,0,2,3]))
const point = (x: number, y: number) => ({ area: 1, point: [x,y,0] as [number,number,number] })
function project() {
    const p = emptyLabProject(ref)
    p.teams = { ...TEAM_DEFAULTS, guns: true, seconds: 12, roundSeconds: 10, openingSeconds: 10, carrier: 'T1', sites: { A: point(400,400), B: point(800,800) }, actors: [
        { id: 'T1', side: 'T', role: 'entry', start: point(200,400), station: point(200,400), yaw: 0, health: 100, armor: 100, ammo: 30 },
        { id: 'CT1', side: 'CT', role: 'anchor', start: point(600,400), station: point(600,400), yaw: 180, health: 100, armor: 100, ammo: 30 },
    ] }
    return p
}
test('physical round drives identical live, instant, skipped and resumed stats/rewards/radar/bomb', async () => {
    const p = project(), raw = runLabTeams(p, nav, floor, true).result, replay = await sealRoundReplay(p, ref, raw)
    const end = raw.frames.at(-1)!.tick, instant = projectRoundReplay(replay, end)
    let live = projectRoundReplay(replay, 0)
    for (const frame of raw.frames) live = projectRoundReplay(replay, frame.tick)
    const saved = JSON.parse(JSON.stringify(captureRoundPosition(replay, Math.floor(end / 2))))
    expect(restoreRoundPosition(replay, saved).tick).toBe(saved.tick)
    expect(projectRoundReplay(replay, end + 100)).toEqual(instant)
    expect(projectRoundReplay(replay, end)).toEqual(live)
    expect(await verifyRoundReplay(JSON.parse(JSON.stringify(replay)))).toBe(true)
    expect(instant.complete).toBe(true); expect(instant.outcome).not.toBe('unresolved')
    expect(Object.values(instant.players).reduce((n,p) => n+p.deaths,0)).toBe(1)
    expect(Object.values(instant.players).reduce((n,p) => n+p.kills,0)).toBe(1)
    expect(raw.events.filter(e => e.type === 'damage').every(e => e.from && e.point)).toBe(true)
    expect(Object.values(projectRoundReplay(replay, 0).players).every(p => p.reward === 0)).toBe(true)
    expect(projectRoundReplay(replay, end)).toEqual(instant) // repeated projection does not mint money
})
test('a different map, seed, height or tactic invalidates a saved position; tampering fails digest', async () => {
    const p = project(), raw = runLabTeams(p, nav, floor, true).result, replay = await sealRoundReplay(p, ref, raw)
    const saved = captureRoundPosition(replay, 10)
    for (const change of [(p: ReturnType<typeof project>) => p.teams!.seed++, (p: ReturnType<typeof project>) => p.teams!.actors[0].start.point[2]++, (p: ReturnType<typeof project>) => p.teams!.economy = 'protect']) {
        const next = structuredClone(p); change(next)
        const different = await sealRoundReplay(next, ref, raw)
        expect(() => restoreRoundPosition(different, saved)).toThrow('different replay')
    }
    const changed = structuredClone(replay); changed.project.mapId = 'Nuke'
    expect(await verifyRoundReplay(changed)).toBe(false)
    expect(() => restoreRoundPosition(replay, { ...saved, engine: 'future' as any })).toThrow()
})
test('contradictory physical damage and radar health cannot be sealed', async () => {
    const p = project(), raw = runLabTeams(p, nav, floor, true).result
    raw.events = raw.events.filter(e => e.type !== 'damage')
    await expect(sealRoundReplay(p, ref, raw)).rejects.toThrow('radar health mismatch')
})

const binding = (homeSide: 'T' | 'CT' = 'T'): CareerRoundBinding => ({
    matchId: 'career-match-42', mapId: 'Mirage', roundNumber: 13, homeTeamId: 'club-home', awayTeamId: 'club-away', homeSide,
    players: ['T1', 'CT1'].map(actorId => ({ actorId, playerId: `career-player-${actorId}`, teamId: (actorId === 'T1' ? 'T' : 'CT') === homeSide ? 'club-home' : 'club-away' })),
})
test('career adapter maps identities and side swaps without changing replay or granting rewards', async () => {
    const p = project(), replay = await sealRoundReplay(p, ref, runLabTeams(p, nav, floor, true).result)
    const before = JSON.stringify(replay)
    for (const side of ['T', 'CT'] as const) {
        const next = await previewCareerRound(replay, binding(side))
        expect(next.careerEligible).toBe(false)
        expect(next.blockers).toContain('A full 5v5 roster is required.')
        expect(next.round.winningTeamId).toBe(next.round.winner.toUpperCase() === side ? 'club-home' : 'club-away')
        expect(next.round.kills.reduce((n, k) => n + k.kills, 0)).toBe(next.players.reduce((n, p) => n + p.kills, 0))
        expect(next.round.events!.filter(e => e.type === 'KILL').every(e => e.killerId?.startsWith('career-player-') && e.victimId?.startsWith('career-player-'))).toBe(true)
        expect(next.round.events!.at(-1)!.type).toBe('ROUND_END')
        expect(next.players.every(p => !('reward' in p))).toBe(true)
        expect(await previewCareerRound(JSON.parse(before), binding(side))).toEqual(next)
    }
    expect(JSON.stringify(replay)).toBe(before)
})
test('adapter rejects tampered, unresolved and invalid identity bindings', async () => {
    const p = project(), replay = await sealRoundReplay(p, ref, runLabTeams(p, nav, floor, true).result)
    for (const bad of [
        { ...binding(), mapId: 'Nuke' },
        { ...binding(), players: binding().players.slice(0, 1) },
        { ...binding(), players: [binding().players[0], binding().players[0]] },
        { ...binding(), homeSide: 'CT' as const },
    ]) await expect(previewCareerRound(replay, bad)).rejects.toThrow()
    const corrupt = structuredClone(replay); corrupt.result.outcome = 'unresolved'
    await expect(previewCareerRound(corrupt, binding())).rejects.toThrow('integrity')
    const unresolved = structuredClone(replay.result); unresolved.outcome = 'unresolved'
    await expect(previewCareerRound(await sealRoundReplay(p, ref, unresolved), binding())).rejects.toThrow('unresolved')
})
test('time expiry stays TIME when converted to a career result', async () => {
    const p = project(); p.teams!.guns = false; p.teams!.roundSeconds = 5; p.teams!.openingSeconds = 10
    const replay = await sealRoundReplay(p, ref, runLabTeams(p, nav, floor, true).result)
    const next = await previewCareerRound(replay, binding())
    expect(next.round.winType).toBe('TIME')
    expect(next.round.kills).toEqual([])
    expect(next.round.winner).toBe('ct')
})

const radarReference = () => ({...ref,transform:{pos_x:-100,pos_y:1100,scale:2},radars:{upper:'/map-studio/spatial/Mirage-upper.png'}} as SpatialReference)
test('career radar retains recorded positions, heading, exact hit endpoints and death timing across seeks',async()=>{
    const p=project(),replay=await sealRoundReplay(p,ref,runLabTeams(p,nav,floor,true).result),reference=radarReference()
    const view=await prepareCareerRadar(replay,binding(),reference)
    const hit=replay.result.events.find(e=>e.type==='damage')!
    const data=view.at(hit.tick),position=projectRoundReplay(replay,hit.tick).frame.actors.find(a=>a.id===binding().players[0].actorId)!
    const dot=data.dots.find(d=>d.playerId===binding().players[0].playerId)!
    expect([dot.x,dot.y]).toEqual(toRadar(position.position,reference))
    expect(dot.angle).toBe(-position.yaw*Math.PI/180)
    expect(data.killLines).toEqual(expect.arrayContaining([expect.objectContaining({fromX:toRadar(hit.from!,reference)[0],toY:toRadar(hit.point!,reference)[1],time:hit.tick/64})]))
    const end=view.at(view.endTick),dead=end.dots.find(d=>!d.isAlive)!
    expect(dead.deathTime).toBeGreaterThan(0)
    expect(view.at(Math.floor(dead.deathTime!*64)-1).dots.find(d=>d.playerId===dead.playerId)!.isAlive).toBe(true)
    expect(view.at(Math.floor(dead.deathTime!*64)).dots.find(d=>d.playerId===dead.playerId)!.isAlive).toBe(false)
    view.at(0)
    expect(view.at(view.endTick)).toEqual(end)
    // The immutable projector does not depend on mutable draft inputs.
    reference.transform.pos_x=99999;replay.result.frames[0].actors[0].position[0]=99999
    expect(view.at(view.endTick)).toEqual(end)
})

test('radar rejects stale references and wrong identities, and uses world height at a floor boundary',async()=>{
    const p=project(),replay=await sealRoundReplay(p,ref,runLabTeams(p,nav,floor,true).result),reference=radarReference()
    for(const changed of [{...reference,meshSha256:'changed'},{...reference,sourceVersion:'old'},{...reference,mapId:'Nuke'}])
        await expect(prepareCareerRadar(replay,binding(),changed)).rejects.toThrow('reference mismatch')
    const swapped={...binding(),homeSide:'CT' as const}
    await expect(prepareCareerRadar(replay,swapped,reference)).rejects.toThrow('wrong-side')
    reference.radars.lower='/map-studio/spatial/Mirage-lower.png'
    reference.transform.verticalsections={lower:{AltitudeMin:'-1000',AltitudeMax:'100'}}
    expect(replayFloor([0,0,99],reference)).toBe('lower')
    expect(replayFloor([0,0,100],reference)).toBe('upper')
    const data=structuredClone(replay.result),hit=data.events.find(e=>e.type==='damage')!
    for(const event of data.events.filter(e=>e.type==='damage'&&e.tick===hit.tick)){event.from![2]=101;event.point![2]=99}
    const crossFloor=await sealRoundReplay(p,ref,data)
    const view=await prepareCareerRadar(crossFloor,binding(),reference)
    expect(view.at(hit.tick).killLines.filter(l=>l.time===hit.tick/64)).toHaveLength(0)
})
