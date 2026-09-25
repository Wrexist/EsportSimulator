import { CollisionScene, type CollisionWorld } from '@/engine/spatial/geometry'
import { NavigationMesh, type NavLocation } from '@/engine/spatial/navigation'
import { distance3, type SpatialReference } from '@/engine/spatial/types'
import { TEAM_DEFAULTS, chooseTeamPlan, parseTeamSetup, type TeamSetup, type DecisionEvidence } from '@/engine/spatial/team-model'
import { simulateTeams, sweptTeamSeparation } from '@/engine/spatial/team-simulation'
import { EMPTY_STOCK, DEFAULT_UTILITY, parseUtilitySetup, UtilitySimulation } from '@/engine/spatial/utility'
import { emptyLabProject, parseLabProject } from '@/lib/spatial-lab-project'
import { teamView } from '@/engine/spatial/team-view'
import * as movement from '@/engine/spatial/movement'
import * as perception from '@/engine/spatial/encounter'

const ref: SpatialReference = { format: 'esim-spatial-reference', version: 1, mapId: 'Mirage', sourceMap: 'test', sourceVersion: 'test', sourceUrl: 'https://example.com', meshSha256: 'test', radars: { upper: '/test.png' }, transform: { pos_x: 0, pos_y: 1000, scale: 1 }, ladders: [], areas: [{ id: 1, hull: 0, flags: '0', movable: 4294967295, corners: [[0,0,0],[1000,0,0],[1000,1000,0],[0,1000,0]], edges: [], laddersAbove: [], laddersBelow: [] }] }
const nav = new NavigationMesh(ref)
const floor = new CollisionScene(new Float32Array([0,0,0,1000,0,0,1000,1000,0,0,1000,0]), new Uint32Array([0,1,2,0,2,3]))
const p = (x: number, y: number): NavLocation => ({ area: 1, point: [x,y,0] })
function setup(): TeamSetup {
    return { ...TEAM_DEFAULTS, seconds: 12, roundSeconds: 10, openingSeconds: 10, carrier: 'T1', sites: { A: p(400,400), B: p(800,800) }, actors: [
        { id: 'T1', side: 'T', role: 'entry', start: p(200,400), station: p(200,400), yaw: 0, health: 100, armor: 100, ammo: 30 },
        { id: 'T2', side: 'T', role: 'support', start: p(200,500), station: p(200,500), yaw: 180, health: 100, armor: 100, ammo: 30 },
        { id: 'CT1', side: 'CT', role: 'anchor', start: p(600,400), station: p(600,400), yaw: 0, health: 100, armor: 100, ammo: 30 },
    ] }
}
const policy = (patch: Partial<DecisionEvidence> = {}): DecisionEvidence => ({ side: 'T', tick: 160, alive: 2, contactsAtSite: 0, credibleEnemies: 0, planted: false, bombSite: 'A', bombRemaining: 10, travelSeconds: 1, roundRemaining: 20, openingSeconds: 2, defuseSeconds: 5, economy: 'balanced', plan: { mode: 'default', site: 'A', since: 0, reason: 'Opening' }, ...patch })

test('a stationary teammate yields a lane without requiring a mutual blockage', () => {
    const s=setup();s.seconds=8;s.roundSeconds=8;s.openingSeconds=10
    s.actors[0].station=p(700,400);s.sites.A=p(900,100)
    s.actors[1].start=p(400,400);s.actors[1].station=p(400,400)
    s.actors[2].start=p(900,900);s.actors[2].station=p(900,900)
    const result=simulateTeams(s,nav,floor)
    expect(result.events.some(e=>e.type==='spacing-yield'&&e.actor==='T2'&&e.target==='T1')).toBe(true)
    expect(distance3(result.frames.at(-1)!.actors.find(a=>a.id==='T1')!.position,s.actors[0].station.point)).toBeLessThanOrEqual(20)
    expect(result.metrics.minSeparation).toBeGreaterThanOrEqual(32)
    const yielding=result.events.find(e=>e.type==='spacing-yield'&&e.actor==='T2')!
    // The waiting pocket must be beside the actual lane, never farther along it.
    expect(Math.abs(yielding.point![1]-400)).toBeGreaterThanOrEqual(48)
    const waiting=result.frames.filter(f=>f.tick>yielding.tick&&distance3(f.actors.find(a=>a.id==='T2')!.position,yielding.point!)<=20&&f.actors.find(a=>a.id==='T1')!.position[0]<450)
    expect(waiting.length).toBeGreaterThan(0)
})

test('a support holding a shortened follow track yields to the bomb carrier',()=>{
    const s=setup();s.seconds=8;s.roundSeconds=8;s.openingSeconds=0;s.carrier='T2';s.sites.A=p(800,400)
    s.actors[0].start=s.actors[0].station=p(672,400)
    s.actors[1].start=s.actors[1].station=p(500,400)
    s.actors[2].start=s.actors[2].station=p(900,900)
    s.actors.push({...s.actors[1],id:'T3',start:p(600,400),station:p(600,400)})
    const r=simulateTeams(s,nav,floor)
    expect(r.events.some(e=>e.type==='spacing-yield'&&e.actor==='T3'&&e.target==='T2')).toBe(true)
    expect(r.frames.some(f=>f.actors.find(a=>a.id==='T2')!.position[0]>632)).toBe(true)
    expect(r.metrics.minSeparation).toBeGreaterThanOrEqual(32)
})

test('physical damage statistics count health removed, not overkill', () => {
    const s = setup(); s.guns = true; s.actors[2].health = 1
    const result = simulateTeams(s, nav, floor)
    const lostHealth = result.frames.at(-1)!.actors.reduce((sum, actor) => sum + s.actors.find(a => a.id === actor.id)!.health - actor.health, 0)
    expect(result.metrics.shots).toBeGreaterThan(0)
    expect(result.metrics.damage).toBeGreaterThan(0)
    expect(result.metrics.damage).toBe(lostHealth)
    const hits = result.events.filter(e => e.type === 'damage' && e.target === 'CT1')
    expect(hits.reduce((sum, e) => sum + (e.damage || 0), 0)).toBe(1)
})

test('a movement-only player replans around a directly seen opposing body',()=>{
    const s=setup();s.seconds=8;s.roundSeconds=8;s.openingSeconds=10;s.sites.A=p(900,100)
    s.actors[0].station=p(700,400)
    s.actors[1].start=p(200,800);s.actors[1].station=p(200,800)
    s.actors[2].start=p(400,400);s.actors[2].station=p(400,400)
    const r=simulateTeams(s,nav,floor)
    expect(r.events.some(e=>e.type==='sight'&&e.actor==='T1'&&e.target==='CT1')).toBe(true)
    expect(distance3(r.frames.at(-1)!.actors.find(a=>a.id==='T1')!.position,s.actors[0].station.point)).toBeLessThanOrEqual(8)
    expect(r.metrics.minSeparation).toBeGreaterThanOrEqual(32)
    const unseen=jest.spyOn(perception,'visibleSample').mockReturnValue(null)
    try{
        const hidden=simulateTeams(s,nav,floor)
        expect(hidden.frames.at(-1)!.actors.find(a=>a.id==='T1')!.position[0]).toBeLessThan(400)
        expect(hidden.events.some(e=>e.type==='sight'&&e.actor==='T1')).toBe(false)
        expect(hidden.metrics.minSeparation).toBeGreaterThanOrEqual(32)
    }finally{unseen.mockRestore()}
})

test('reservation-only route failure does not discard a valid world approach or bypass a live body',()=>{
    const s=setup();s.seconds=8;s.roundSeconds=8;s.openingSeconds=10;s.sites.A=p(900,100)
    s.actors[0].station=p(700,400)
    s.actors[1].start=s.actors[1].station=p(200,800)
    s.actors[2].start=s.actors[2].station=p(400,400)
    const original=nav.findRoute.bind(nav)
    let reservedAttempts=0
    const probe=jest.spyOn(nav,'findRoute').mockImplementation((start,end,options,scene)=>{
        if(scene?.occupied?.length){reservedAttempts++;return {areas:[],points:[],kinds:[],distance:0,rejected:1,reason:'Reserved polygon center unavailable'}}
        return original(start,end,options,scene)
    })
    try{
        const r=simulateTeams(s,nav,floor)
        expect(reservedAttempts).toBeGreaterThan(0)
        expect(r.events.some(e=>e.type==='route-blocked'&&e.actor==='T1')).toBe(false)
        expect(r.frames.at(-1)!.actors.find(a=>a.id==='T1')!.position[0]).toBeLessThan(400)
        expect(r.metrics.minSeparation).toBeGreaterThanOrEqual(32)
    }finally{probe.mockRestore()}
})

test('a repeatedly failed cover route is replaced with a reachable assignment',()=>{
    const s=setup();s.initialBomb='planted';s.bombSeconds=30;s.defuseSeconds=10;s.seconds=8
    s.actors[0].start=p(100,400);s.actors[0].station=p(100,400)
    s.actors[2].start=p(900,900);s.actors[2].station=p(900,900)
    const original=movement.simulateMovement
    let rejected:string|undefined,attempts=0
    const probe=jest.spyOn(movement,'simulateMovement').mockImplementation((route,...args)=>{
        const start=route.points[0],end=route.points.at(-1)
        if(start?.[0]===100&&start[1]===400&&end&&distance3(start,end)>8){
            rejected??=end.join(',')
            if(end.join(',')===rejected&&++attempts>=2)return [{time:0,position:start,speed:0,state:'blocked',reason:'Cover approach became unavailable'}]
        }
        return original(route,...args)
    })
    try{
        const r=simulateTeams(s,nav,floor)
        expect(r.events.some(e=>e.type==='cover-route-rejected'&&e.actor==='T1')).toBe(true)
        const actor=r.frames.at(-1)!.actors.find(a=>a.id==='T1')!
        expect(actor.intent).not.toBe('blocked')
        expect(distance3(actor.position,s.actors[0].start.point)).toBeGreaterThan(40)
        expect(actor.goal!.join(',')).not.toBe(rejected)
        expect(r.metrics.minSeparation).toBeGreaterThanOrEqual(32)
    }finally{probe.mockRestore()}
})

test('a failed partial movement track is discarded and retries stop after three failures', () => {
    const s = setup(); s.seconds = 8; s.roundSeconds = 8; s.actors[0].station = p(300,400)
    const probe = jest.spyOn(movement, 'simulateMovement').mockImplementation(route => [
        { time: 0, position: route.points[0], speed: 0, state: 'moving' },
        { time: 1 / 64, position: [route.points[0][0] + 1, route.points[0][1], 0], speed: 0, state: 'blocked', reason: 'Test clearance failure' },
    ])
    try {
        const result = simulateTeams(s, nav, floor)
        expect(result.events.filter(e => e.type === 'route-blocked' && e.actor === 'T1')).toHaveLength(3)
        expect(result.frames.at(-1)!.actors.find(a => a.id === 'T1')!.intent).toBe('blocked')
        expect(result.frames.every(f => JSON.stringify(f.actors.find(a => a.id === 'T1')!.position) === JSON.stringify(s.actors[0].start.point))).toBe(true)
        expect(result.events.some(e => e.reason === 'Test clearance failure')).toBe(true)
    } finally { probe.mockRestore() }
})

test('a support player ahead of the entry yields space instead of trapping the execute', () => {
    const s = setup(); s.openingSeconds = 0; s.seconds = 6; s.roundSeconds = 6
    s.sites.A = p(800,400); s.actors[1].start = p(250,400); s.actors[1].station = p(250,400)
    s.actors[2].start = p(900,800); s.actors[2].station = p(900,800)
    const result = simulateTeams(s, nav, floor)
    expect(result.frames.some(f => f.actors.find(a => a.id === 'T1')!.position[0] > 400)).toBe(true)
    expect(result.metrics.minSeparation).toBeGreaterThanOrEqual(32)
})

test('radio is delayed; a teammate cannot receive another player sight immediately', () => {
    const r = simulateTeams(setup(), nav, floor)
    expect(r.events.find(e => e.type === 'sight' && e.actor === 'T1')?.tick).toBe(0)
    expect(r.frames[0].actors.find(a => a.id === 'T2')!.contacts).toEqual([])
    expect(r.frames.filter(f => f.tick < 32).every(f => !f.reports.T.length)).toBe(true)
    expect(r.events.find(e => e.type === 'report' && e.side === 'T')?.tick).toBe(32)
    expect(r.frames.find(f => f.tick === 32)!.reports.T[0]).toMatchObject({ seen: 0, received: 32, visible: false })
})

test('unseen enemy relocation does not change friendly knowledge, plans or movement', () => {
    const a = setup(); a.actors[0].yaw = 180
    const b = structuredClone(a); b.actors[2].start = p(650,300); b.actors[2].station = p(650,300)
    const view = (s: TeamSetup) => simulateTeams(s, nav, floor).frames.map(f => ({ actors: f.actors.filter(a => a.side === 'T'), reports: f.reports.T, plan: f.plans.T }))
    expect(view(a)).toEqual(view(b))
})

test('blocked sight produces no damage and input ordering does not affect seeded execution', () => {
    const s = setup(); s.guns = true
    const wall = new CollisionScene(new Float32Array([450,0,0,450,1000,0,450,1000,200,450,0,200]), new Uint32Array([0,1,2,0,2,3]))
    const world: CollisionWorld = { raycast: (a,b) => wall.raycast(a,b) || floor.raycast(a,b), bodyHit: floor.bodyHit.bind(floor), movementHit: wall.movementHit.bind(wall) }
    expect(simulateTeams(s, nav, world).metrics.shots).toBe(0)
    const before = JSON.stringify(s), r = simulateTeams(s, nav, floor)
    expect(simulateTeams({ ...s, actors: [...s.actors].reverse() }, nav, floor)).toEqual(r)
    expect(JSON.stringify(s)).toBe(before)
})

test('aim and firing wait for reaction; skill alters execution without outcome overrides', () => {
    const s = setup(); s.guns = true; s.actors[0].yaw = 20; s.skill = { T: 0, CT: 0 }
    const low = simulateTeams(s, nav, floor); s.skill.T = 1; const high = simulateTeams(s, nav, floor)
    expect(low.frames.filter(f => f.tick < 42).every(f => f.actors.find(a => a.id === 'T1')!.yaw === 20)).toBe(true)
    expect(low.events.find(e => e.type === 'shot' && e.actor === 'T1')!.tick).toBeGreaterThanOrEqual(42)
    expect(high.events.find(e => e.type === 'shot' && e.actor === 'T1')!.tick).toBeLessThan(low.events.find(e => e.type === 'shot' && e.actor === 'T1')!.tick)
})

test('policy changes require evidence and a rotation cannot oscillate between sites', () => {
    expect(chooseTeamPlan(policy()).mode).toBe('execute')
    const rotated = chooseTeamPlan(policy({ contactsAtSite: 2 }))
    expect(rotated).toMatchObject({ mode: 'rotate', site: 'B' })
    expect(chooseTeamPlan(policy({ tick: 400, contactsAtSite: 2, plan: rotated }))).toEqual(rotated)
    const save = chooseTeamPlan(policy({ side: 'CT', planted: true, bombRemaining: 4 }))
    expect(save.mode).toBe('save')
    expect(chooseTeamPlan(policy({ side: 'CT', planted: true, bombRemaining: 20, plan: save }))).toEqual(save)
    expect(chooseTeamPlan(policy({ alive: 1, credibleEnemies: 2, economy: 'protect' })).mode).toBe('save')
})

test('entry movement leads to an uninterrupted plant', () => {
    const s = setup(); s.openingSeconds = 0; s.actors[2].yaw = 180
    const r = simulateTeams(s, nav, floor), start = r.events.find(e => e.type === 'plant-start'), end = r.events.find(e => e.type === 'planted')
    expect(start).toBeDefined(); expect(end!.tick - start!.tick).toBe(s.plantSeconds * 64)
    expect(r.metrics.minSeparation).toBeGreaterThanOrEqual(32)
    expect(r.events.filter(e => e.actor === 'T1' && e.type === 'intent' && e.reason.includes('objective action'))).toHaveLength(1)
})

test('defuse requires its full duration and impossible deadlines cause an explained save', () => {
    const s = setup(); s.initialBomb = 'planted'; s.actors[2].start = p(440,400); s.actors[2].station = p(440,400)
    const r = simulateTeams(s, nav, floor)
    expect(r.outcome).toBe('CT'); expect(r.events.find(e => e.type === 'defused')!.tick).toBe(320)
    s.bombSeconds = 5
    const short = simulateTeams(s, nav, floor)
    expect(short.events.find(e => e.type === 'plan' && e.side === 'CT')?.reason).toMatch(/Remaining bomb time/)
    expect(short.outcome).toBe('T'); expect(short.events.find(e => e.type === 'exploded')!.tick).toBe(320)
})

test('objective actions cannot reach through an intervening wall', () => {
    const s = setup(); s.initialBomb = 'planted'; s.economy = 'commit'; s.actors[2].start = p(440,400); s.actors[2].station = p(440,400)
    const wall = new CollisionScene(new Float32Array([420,0,0,420,1000,0,420,1000,200,420,0,200]), new Uint32Array([0,1,2,0,2,3]))
    const world: CollisionWorld = { raycast: (a,b) => wall.raycast(a,b) || floor.raycast(a,b), bodyHit: floor.bodyHit.bind(floor), movementHit: wall.movementHit.bind(wall) }
    expect(simulateTeams(s, nav, world).events.some(e => e.type === 'defuse-start')).toBe(false)
})

test('swept separation catches swaps but allows genuinely distinct floors', () => {
    expect(sweptTeamSeparation([0,0,0],[100,0,0],[100,0,0],[0,0,0])).toBe(0)
    expect(sweptTeamSeparation([0,0,0],[100,0,0],[100,0,80],[0,0,80])).toBe(Infinity)
    const s = setup(); s.actors[1].start = s.actors[0].start
    expect(() => simulateTeams(s, nav, floor)).toThrow(/overlap/)
})

test('open-floor congestion makes passing space with bounded replanning', () => {
    const s = setup(); s.actors[0].station = p(500,400); s.actors[1].start = p(350,400); s.actors[1].station = p(350,400)
    const r = simulateTeams(s, nav, floor)
    expect(r.metrics.waits).toBeGreaterThan(0); expect(r.metrics.minSeparation).toBeGreaterThanOrEqual(32)
    expect(r.events.some(e=>e.type==='spacing-yield'&&e.actor==='T2')).toBe(true)
    expect(r.frames.some(f=>f.actors.find(a=>a.id==='T1')!.position[0]>400)).toBe(true)
    expect(r.metrics.replans).toBeLessThan(15)
})

test('an obstructing lurker yields before its delayed execute assignment',()=>{
    const s=setup();s.openingSeconds=0;s.seconds=12;s.roundSeconds=12
    s.sites.A=p(800,400);s.actors[1].role='lurk';s.actors[1].start=p(350,400);s.actors[1].station=p(350,400)
    s.actors[2].start=p(900,800);s.actors[2].station=p(900,800)
    const r=simulateTeams(s,nav,floor)
    expect(r.events.some(e=>e.type==='spacing-yield'&&e.actor==='T2'&&e.tick<6*64)).toBe(true)
    expect(r.frames.some(f=>f.actors.find(a=>a.id==='T1')!.position[0]>500)).toBe(true)
    expect(r.metrics.minSeparation).toBeGreaterThanOrEqual(32)
})

test('supports clear a single-file doorway without reversing into the entry or crossing its walls', () => {
    const s = setup(); s.openingSeconds = 0; s.seconds = 8; s.roundSeconds = 8
    s.sites.A = p(900,400)
    s.actors[0].start = p(200,400)
    s.actors[1].start = p(280,400); s.actors[1].station = p(280,400)
    s.actors.push({ ...s.actors[1], id: 'T3', start: p(120,400), station: p(120,400) })
    s.actors[2].start = p(950,800); s.actors[2].station = p(950,800)
    const walls = new CollisionScene(new Float32Array([
        500,0,0,500,376,0,500,376,200,500,0,200,
        500,424,0,500,1000,0,500,1000,200,500,424,200,
    ]), new Uint32Array([0,1,2,0,2,3,4,5,6,4,6,7]))
    const world: CollisionWorld = {
        raycast: (a,b) => walls.raycast(a,b) || floor.raycast(a,b),
        bodyHit: (p,h) => walls.bodyHit(p,h) || floor.bodyHit(p,h),
        movementHit: (a,b,h) => walls.movementHit(a,b,h) || floor.movementHit(a,b,h),
    }
    const doorwayNav = new NavigationMesh({ ...ref, areas: [
        { ...ref.areas[0], id: 1, corners: [[0,0,0],[480,0,0],[480,1000,0],[0,1000,0]], edges: [{ edge: 1, target: 2, targetEdge: 3 }] },
        { ...ref.areas[0], id: 2, corners: [[480,376,0],[520,376,0],[520,424,0],[480,424,0]], edges: [{ edge: 3, target: 1, targetEdge: 1 }, { edge: 1, target: 3, targetEdge: 3 }] },
        { ...ref.areas[0], id: 3, corners: [[520,0,0],[1000,0,0],[1000,1000,0],[520,1000,0]], edges: [{ edge: 3, target: 2, targetEdge: 1 }] },
    ] })
    s.sites.A.area=3; s.sites.B.area=3; s.actors[2].start.area=3; s.actors[2].station.area=3
    const r = simulateTeams(s,doorwayNav,world)
    for (const id of ['T1','T2','T3']) expect(r.frames.some(f=>f.actors.find(a=>a.id===id)!.position[0]>550)).toBe(true)
    expect(r.metrics.minSeparation).toBeGreaterThanOrEqual(32)
    for (const frame of r.frames) for (const a of frame.actors) expect(world.bodyHit!(a.position,72)).toBeFalsy()
    expect(r.frames.filter(f=>f.tick<=64).every(f=>f.actors.find(a=>a.id==='T2')!.position[0]>=280)).toBe(true)
    expect(simulateTeams(s,doorwayNav,world)).toEqual(r)
})

test('dropped bomb recovery nominates one reachable teammate and reserves separate cover', () => {
    const s = setup(); s.initialBomb = 'dropped'; s.openingSeconds = 0; s.seconds = 7; s.roundSeconds = 7
    s.actors.push({ ...s.actors[1], id: 'T3', start: p(200,600), station: p(200,600) })
    const r = simulateTeams(s,nav,floor)
    const assigned = r.events.filter(e=>e.type==='recovery-assigned')
    expect(assigned).toHaveLength(1)
    const opening = r.frames[0].actors.filter(a=>a.side==='T')
    expect(opening.filter(a=>a.goal && distance3(a.goal,s.sites.A.point)<32)).toHaveLength(1)
    expect(opening.filter(a=>a.id!==assigned[0].actor).every(a=>a.goal && distance3(a.goal,s.sites.A.point)>=128-1e-6)).toBe(true)
    expect(r.events.some(e=>e.type==='bomb-picked-up'&&e.actor===assigned[0].actor)).toBe(true)
    expect(r.metrics.minSeparation).toBeGreaterThanOrEqual(32)
})

test('recovery support turns toward a delivered report after reaction, then acquires its own sight', () => {
    const s = setup(); s.initialBomb = 'dropped'; s.sites.A = p(800,400); s.communicationMs = 0; s.skill.T = 1; s.guns = true; s.actors[0].ammo = 0
    s.actors[0].start = s.actors[0].station = p(680,400)
    s.actors[1].start = s.actors[1].station = p(800 - 128 / Math.sqrt(2),400 + 128 / Math.sqrt(2)); s.actors[1].yaw = 90
    s.actors[2].start = s.actors[2].station = p(900,400)
    const r = simulateTeams(s, nav, floor)
    const cover = r.events.find(e => e.type === 'cover-angle' && e.actor === 'T2')
    expect(cover).toBeDefined(); expect(cover!.tick).toBeGreaterThanOrEqual(r.events.find(e => e.type === 'report' && e.side === 'T')!.tick)
    const reaction = Math.ceil((.65 - s.skill.T * .5) * 64)
    expect(r.frames.filter(f => f.tick < cover!.tick + reaction).every(f => f.actors.find(a => a.id === 'T2')!.yaw === 90)).toBe(true)
    const sight = r.events.find(e => e.type === 'sight' && e.actor === 'T2')!
    expect(sight.tick).toBeGreaterThanOrEqual(cover!.tick + reaction)
    expect(r.events.find(e => e.type === 'shot' && e.actor === 'T2')!.tick).toBeGreaterThanOrEqual(sight.tick + reaction)
    expect(teamView(r.frames.at(-1)!, r.events, 'CT').events.some(e => e.type === 'cover-angle' && e.actor === 'T2')).toBe(false)
    expect(simulateTeams({ ...s, actors: [...s.actors].reverse() }, nav, floor)).toEqual(r)
})

test('a recovery smoke releases from its checked origin, consumes one grenade and stays held outside recovery', () => {
    const s = setup(); s.initialBomb = 'dropped'; s.actors[1].start = s.actors[1].station = p(400,600); s.actors[1].yaw = 0
    s.utility = { ...DEFAULT_UTILITY, inventory: Object.fromEntries(s.actors.map(a => [a.id, { ...EMPTY_STOCK, smoke: a.id === 'T2' ? 1 : 0 }])), throws: [{ id: 'recover-smoke', owner: 'T2', kind: 'smoke', at: 0, yaw: -90, pitch: 0, power: .5, mode: 'normal', tolerance: 8, bounceTargets: [], origin: [400,600,0] }] }
    const probe = new UtilitySimulation(s.utility, floor, s.actors.map(a => a.id))
    for (let tick = 0; tick <= 384 && !probe.effects.length; tick++) probe.step(tick, [{ id: 'T2', position: [400,600,0], yaw: 0, pitch: 0, health: 100 }], 72)
    const landing = probe.effects[0].point, plan = s.utility.throws[0]
    plan.target = [...landing]; plan.trigger = 'recovery'
    s.sites.A = p(landing[0] + 50, landing[1]); s.actors[0].start = s.actors[0].station = p(landing[0] + 50, landing[1] - 100)
    s.actors[2].start = s.actors[2].station = p(landing[0] + 400, landing[1])
    const r = simulateTeams(s, nav, floor)
    expect(r.events.find(e => e.type === 'recovery-assigned')?.actor).toBe('T1')
    expect(r.events.filter(e => e.type === 'grenade-throw')).toHaveLength(1)
    expect(r.utility!.checks[0].state).toBe('matches-model')
    const waiting = r.events.find(e=>e.type==='recovery-screen-wait')!, screened = r.events.find(e=>e.type==='recovery-screen-ready')!
    const burst = r.events.find(e=>e.type==='grenade-detonate')!, pickup = r.events.find(e=>e.type==='bomb-picked-up')!
    expect(screened.tick).toBeGreaterThan(burst.tick)
    expect(pickup.tick).toBeGreaterThanOrEqual(screened.tick)
    expect(r.frames.filter(f=>f.tick>=waiting.tick&&f.tick<screened.tick).every(f=>JSON.stringify(f.actors.find(a=>a.id==='T1')!.position)===JSON.stringify(s.actors[0].start.point))).toBe(true)

    expect(r.frames[0].actors.find(a => a.id === 'T2')!.position).toEqual(plan.origin)
    expect(r.frames.at(-1)!.actors.find(a => a.id === 'T2')!.inventory!.smoke).toBe(0)
    const carried = simulateTeams({ ...s, initialBomb: 'carried' }, nav, floor)
    expect(carried.events.some(e => e.type === 'grenade-throw')).toBe(false)
    expect(carried.frames.at(-1)!.actors.find(a => a.id === 'T2')!.inventory!.smoke).toBe(1)
})

test('a former follower replaces its shortened path when the nearby entry drops the bomb', () => {
    const s=setup();s.openingSeconds=0;s.seconds=8;s.roundSeconds=8;s.sites.A=p(900,400)
    s.actors[0].start=p(400,400);s.actors[0].health=1;s.actors[0].armor=0
    s.actors[1].start=p(200,400);s.actors[1].station=p(200,400)
    s.actors[2].start=p(950,800);s.actors[2].station=p(950,800)
    s.utility={...DEFAULT_UTILITY,inventory:Object.fromEntries(s.actors.map(a=>[a.id,{...EMPTY_STOCK,he:a.id==='T1'?1:0}])),throws:[{id:'carrier-loss',owner:'T1',kind:'he',at:0,yaw:0,pitch:-80,power:.1,mode:'lob',tolerance:16,bounceTargets:[]}]}
    const original=movement.simulateMovement
    // Keep the entry at its angle while its follower completes a shortened route.
    // Utility damage then creates a genuine drop at that same following endpoint.
    const probe=jest.spyOn(movement,'simulateMovement').mockImplementation((r,...args)=>
        r.points[0]?.[0]===400 && r.points.at(-1)?.[0]===900
            ? [{time:0,position:r.points[0],speed:0,state:'arrived'}] : original(r,...args))
    const wall=new CollisionScene(new Float32Array([0,700,0,1000,700,0,1000,700,200,0,700,200]),new Uint32Array([0,1,2,0,2,3]))
    const world:CollisionWorld={raycast:(a,b)=>wall.raycast(a,b)||floor.raycast(a,b),movementHit:(a,b,h)=>wall.movementHit(a,b,h)||floor.movementHit(a,b,h),bodyHit:(p,h)=>wall.bodyHit(p,h)||floor.bodyHit(p,h)}
    try {
        const r=simulateTeams(s,nav,world),drop=r.events.find(e=>e.type==='bomb-dropped')!
        expect(drop).toBeDefined()
        const before=r.frames.filter(f=>f.tick<drop.tick).at(-1)!.actors.find(a=>a.id==='T2')!
        expect(distance3(before.goal!,drop.point!)).toBeLessThan(24)
        expect(distance3(before.position,drop.point!)).toBeGreaterThan(64)
        expect(r.events.some(e=>e.type==='bomb-picked-up'&&e.actor==='T2'&&e.tick>drop.tick)).toBe(true)
        expect(r.metrics.minSeparation).toBeGreaterThanOrEqual(32)
    } finally { probe.mockRestore() }
})

test('post-plant teammates stay near the bomb and cover players leave the defuser approach clear', () => {
    expect(chooseTeamPlan(policy({planted:true,bombSite:'B',contactsAtSite:3,tick:640}))).toMatchObject({mode:'execute',site:'B'})
    const s = setup(); s.initialBomb='planted'; s.economy='commit'; s.seconds=12; s.bombSeconds=12
    s.actors[0].start=p(360,400);s.actors[0].station=p(40,40)
    s.actors[1].start=p(400,500);s.actors[1].station=p(40,900)
    s.actors.push({...s.actors[2],id:'CT2',start:p(600,650),station:p(950,950)})
    const r=simulateTeams(s,nav,floor)
    const opening=r.frames[0].actors
    for(const a of opening.filter(a=>a.side==='T')) {
        expect(a.goal).not.toEqual(s.actors.find(p=>p.id===a.id)!.station.point)
        expect(distance3(a.goal!,s.sites.A.point)).toBeGreaterThanOrEqual(128-1e-6)
        expect(distance3(a.goal!,s.sites.A.point)).toBeLessThanOrEqual(192+1e-6)
    }
    expect(opening.filter(a=>a.side==='CT'&&a.goal&&distance3(a.goal,s.sites.A.point)<32)).toHaveLength(1)
    expect(r.events.some(e=>e.type==='defused')).toBe(true)
    expect(r.metrics.minSeparation).toBeGreaterThanOrEqual(32)
    expect(simulateTeams(s,nav,floor)).toEqual(r)
})

test('retake follows an off-center plant instead of walking to the site label', () => {
    const s=setup();s.openingSeconds=0;s.economy='commit';s.seconds=18;s.roundSeconds=12;s.bombSeconds=12;s.plantSeconds=1
    s.sites.A=p(600,400);s.actors[0].start=p(400,400);s.actors[0].station=p(200,200)
    s.actors[2].start=p(400,100);s.actors[2].station=p(400,100)
    s.plantZones={A:{points:[[350,350,0],[650,350,0],[650,450,0],[350,450,0]],zMin:-2,zMax:2},B:{points:[[750,750,0],[850,750,0],[850,850,0],[750,850,0]],zMin:-2,zMax:2}}
    const r=simulateTeams(s,nav,floor),planted=r.events.find(e=>e.type==='planted')
    expect(planted).toBeDefined()
    expect(distance3(planted!.point!,s.sites.A.point)).toBeGreaterThan(64)
    expect(r.frames.some(f=>f.bomb.state==='planted'&&f.actors.some(a=>a.side==='CT'&&a.goal&&distance3(a.goal,planted!.point!)<1))).toBe(true)
    expect(r.events.some(e=>e.type==='defused')).toBe(true)
})

test('team inventory is isolated, validated and spends an authored throw only once', () => {
    const s = setup(); s.openingSeconds = 0
    s.utility = { ...DEFAULT_UTILITY, inventory: Object.fromEntries(s.actors.map(a => [a.id, { ...EMPTY_STOCK, smoke: a.id === 'T2' ? 1 : 0 }])), throws: [{ id: 'support-smoke', owner: 'T2', kind: 'smoke', at: 0, yaw: 0, pitch: -80, power: 0.1, mode: 'lob', tolerance: 16, bounceTargets: [] }] }
    const r = simulateTeams(s, nav, floor)
    expect(r.events.filter(e => e.type === 'grenade-throw')).toHaveLength(1)
    expect(r.frames.at(-1)!.actors.find(a => a.id === 'T2')!.inventory!.smoke).toBe(0)
    expect(r.frames.at(-1)!.actors.find(a => a.id === 'T1')!.inventory!.smoke).toBe(0)
    expect(() => parseUtilitySetup(s.utility)).toThrow()
    const u = new UtilitySimulation({ ...s.utility, throws: [] }, floor, s.actors.map(a => a.id))
    expect(() => u.queue({ ...s.utility!.throws[0], owner: 'unknown' })).toThrow()
    expect(u.setup.throws).toEqual([])
})

test('portable teams round-trip and malformed identities or timing are rejected', () => {
    const teams = setup(), project = { ...emptyLabProject(ref), teams }
    expect(parseLabProject(JSON.stringify(project), ref).teams).toEqual(parseTeamSetup(teams, nav))
    teams.actors[0].id = 'CT3'; expect(() => parseTeamSetup(teams, nav)).toThrow()
    expect(() => parseTeamSetup({ ...setup(), seconds: Infinity }, nav)).toThrow()
})

test('mutually blocked teammates make checked passing space and resume their routes', () => {
    const s=setup();s.seconds=8;s.roundSeconds=8
    s.actors[0].start=p(400,400);s.actors[0].station=p(600,400);s.actors[0].yaw=180
    s.actors[1].start=p(434,410);s.actors[1].station=p(200,400);s.actors[1].yaw=180
    s.actors[2].start=s.actors[2].station=p(900,900)
    const result=simulateTeams(s,nav,floor),end=result.frames.at(-1)!
    expect(result.events.some(e=>e.type==='spacing-yield'&&e.actor==='T2')).toBe(true)
    expect(distance3(end.actors.find(a=>a.id==='T1')!.position,s.actors[0].station.point)).toBeLessThanOrEqual(20)
    expect(distance3(end.actors.find(a=>a.id==='T2')!.position,s.actors[1].station.point)).toBeLessThanOrEqual(20)
    expect(result.metrics.minSeparation).toBeGreaterThanOrEqual(32)
})

test('one player cannot release two authored grenades on the same tick', () => {
    const s = setup()
    s.utility = { ...DEFAULT_UTILITY, inventory: Object.fromEntries(s.actors.map(a => [a.id, { ...EMPTY_STOCK, smoke: a.id === 'T2' ? 1 : 0, decoy: a.id === 'T2' ? 1 : 0 }])), throws: (['smoke','decoy'] as const).map(kind => ({ id: `support-${kind}`, owner: 'T2', kind, at: 0, yaw: 0, pitch: -80, power: .1, mode: 'lob', tolerance: 16, bounceTargets: [] })) }
    const result = simulateTeams(s, nav, floor), releases = result.events.filter(e => e.type === 'grenade-throw')
    expect(releases).toHaveLength(2)
    expect(releases[1].tick - releases[0].tick).toBeGreaterThanOrEqual(32)
    expect(result.frames.at(-1)!.actors.find(a => a.id === 'T2')!.inventory).toEqual(EMPTY_STOCK)
})

test('team replay excludes private sightings, enemy resources and a hidden carrier', () => {
    const r = simulateTeams(setup(), nav, floor), ct = teamView(r.frames[0], r.events, 'CT'), t = teamView(r.frames[0], r.events, 'T')
    expect(ct.bomb).toBeNull(); expect(ct.actors.every(a => a.side === 'CT')).toBe(true)
    expect(t.actors.every(a => !a.contacts.length)).toBe(true); expect(t.contacts).toEqual([])
    expect(t.events.some(e => e.type === 'sight' || e.type === 'damage')).toBe(false)
    expect(teamView(r.frames[0], r.events, 'world').actors).toHaveLength(3)
})

test('moving behind cover freezes a sighting and expires stale team information', () => {
    const s = setup(); s.actors[2].station = p(600,700); s.memorySeconds = 1
    const wall = new CollisionScene(new Float32Array([450,450,0,450,1000,0,450,1000,200,450,450,200]), new Uint32Array([0,1,2,0,2,3]))
    const world: CollisionWorld = { raycast: (a,b) => wall.raycast(a,b) || floor.raycast(a,b), bodyHit: floor.bodyHit.bind(floor), movementHit: wall.movementHit.bind(wall) }
    const r = simulateTeams(s, nav, world)
    expect(r.events.some(e => e.type === 'lost' && e.actor === 'T1')).toBe(true)
    expect(r.events.some(e => e.type === 'stale-report' && e.side === 'T')).toBe(true)
    expect(r.frames.at(-1)!.reports.T).toEqual([])
    const memory = r.frames.flatMap(f => f.actors.find(a => a.id === 'T1')!.contacts.filter(c => !c.visible))
    expect(memory.length).toBeGreaterThan(0)
    expect(memory.at(-1)!.uncertainty).toBeGreaterThan(memory[0].uncertainty)
})

test('a dead planter drops the bomb and cannot complete its interrupted action', () => {
    const s = setup(); s.openingSeconds = 0; s.actors[0].start = p(400,400); s.actors[0].station = p(400,400); s.actors[0].health = 1; s.actors[0].armor = 0
    s.utility = { ...DEFAULT_UTILITY, inventory: Object.fromEntries(s.actors.map(a => [a.id, { ...EMPTY_STOCK, he: a.id === 'T1' ? 1 : 0 }])), throws: [{ id: 'interrupt', owner: 'T1', kind: 'he', at: 0, yaw: 0, pitch: -80, power: 0.1, mode: 'lob', tolerance: 16, bounceTargets: [] }] }
    const r = simulateTeams(s, nav, floor), dropped = r.events.find(e => e.type === 'bomb-dropped')
    expect(r.events.some(e => e.type === 'plant-start' && e.actor === 'T1')).toBe(true)
    expect(dropped).toBeDefined()
    expect(r.frames.filter(f => f.tick >= dropped!.tick).every(f => f.actors.find(a => a.id === 'T1')!.intent === 'dead')).toBe(true)
    expect(r.frames.filter(f => f.tick >= dropped!.tick).every(f => f.bomb.actor !== 'T1')).toBe(true)
})

test('a lurker holds a separate assignment while entry advances', () => {
    const s = setup(); s.openingSeconds = 0; s.actors[1].role = 'lurk'
    const r = simulateTeams(s, nav, floor), early = r.frames.find(f => f.tick === 32)!
    expect(early.actors.find(a => a.id === 'T2')!.position).toEqual(s.actors[1].start.point)
    expect(early.actors.find(a => a.id === 'T2')!.intent).toBe('lurk')
    expect(early.actors.find(a => a.id === 'T1')!.position).not.toEqual(s.actors[0].start.point)
})

test('higher execution skill improves a seeded duel batch', () => {
    const wins = (skill: number) => Array.from({ length: 24 }, (_, seed) => {
        const s = setup(); s.seed = seed; s.guns = true; s.actors = [s.actors[0], s.actors[2]]
        s.actors[1].yaw = 180; s.skill = { T: skill, CT: 0.65 }
        return simulateTeams(s, nav, floor).outcome === 'T' ? 1 : 0
    }).reduce<number>((a,b) => a+b, 0)
    expect(wins(0.8)).toBeGreaterThan(wins(0.2))
})

test('death of the assigned recoverer cancels its smoke wait without a ghost pickup', () => {
    const s = setup(); s.initialBomb = 'dropped'; s.actors[1].start = s.actors[1].station = p(400,600); s.actors[1].yaw = 0
    s.utility = { ...DEFAULT_UTILITY, inventory: Object.fromEntries(s.actors.map(a => [a.id, { ...EMPTY_STOCK, smoke: a.id === 'T2' ? 1 : 0 }])), throws: [{ id: 'recover-smoke', owner: 'T2', kind: 'smoke', at: 0, yaw: -90, pitch: 0, power: .5, mode: 'normal', tolerance: 8, bounceTargets: [], origin: [400,600,0] }] }
    const probe = new UtilitySimulation(s.utility, floor, s.actors.map(a => a.id))
    for (let tick = 0; tick <= 384 && !probe.effects.length; tick++) probe.step(tick, [{ id: 'T2', position: [400,600,0], yaw: 0, pitch: 0, health: 100 }], 72)
    const landing = probe.effects[0].point, plan = s.utility.throws[0]
    plan.target = [...landing]; plan.trigger = 'recovery'
    s.sites.A = p(landing[0] + 50, landing[1]); s.actors[0].start = s.actors[0].station = p(landing[0] + 50, landing[1] - 100)
    s.actors[2].start = s.actors[2].station = p(landing[0] + 400, landing[1])
    s.guns=true;s.communicationMs=0
    s.actors[0].health=1;s.actors[0].armor=0;s.actors[0].ammo=0
    s.actors[1].ammo=0;s.actors[2].yaw=180
    const r=simulateTeams(s,nav,floor)
    const wait=r.events.find(e=>e.type==='recovery-screen-wait'&&e.actor==='T1')
    expect(wait).toBeDefined()
    expect(r.frames.some(f=>f.actors.find(a=>a.id==='T1')!.health===0)).toBe(true)
    const cancelled=r.events.find(e=>e.type==='recovery-screen-cancelled'&&e.actor==='T1')
    expect(cancelled).toBeDefined()
    expect(cancelled!.tick).toBeGreaterThanOrEqual(wait!.tick)
    expect(cancelled!.tick).toBeLessThan(r.events.find(e=>e.type==='grenade-detonate')!.tick)
    expect(r.events.some(e=>e.type==='recovery-screen-ready'&&e.actor==='T1')).toBe(false)
    expect(r.events.some(e=>e.type==='bomb-picked-up'&&e.actor==='T1')).toBe(false)
    expect(r.events.filter(e=>e.type==='grenade-throw')).toHaveLength(1)
    expect(r.metrics.minSeparation).toBeGreaterThanOrEqual(32)
})

test('a failed in-flight recovery smoke cancels the wait and cannot spend a second grenade', () => {
    const s = setup(); s.initialBomb = 'dropped'; s.actors[1].start = s.actors[1].station = p(400,600); s.actors[1].yaw = 0
    s.utility = { ...DEFAULT_UTILITY, inventory: Object.fromEntries(s.actors.map(a => [a.id, { ...EMPTY_STOCK, smoke: a.id === 'T2' ? 1 : 0 }])), throws: [{ id: 'recover-smoke', owner: 'T2', kind: 'smoke', at: 0, yaw: -90, pitch: 0, power: .5, mode: 'normal', tolerance: 8, bounceTargets: [], origin: [400,600,0] }] }
    const probe = new UtilitySimulation(s.utility, floor, s.actors.map(a => a.id))
    for (let tick = 0; tick <= 384 && !probe.effects.length; tick++) probe.step(tick, [{ id: 'T2', position: [400,600,0], yaw: 0, pitch: 0, health: 100 }], 72)
    const landing = probe.effects[0].point, plan = s.utility.throws[0]
    plan.target = [...landing]; plan.trigger = 'recovery'
    s.sites.A = p(landing[0] + 50, landing[1]); s.actors[0].start = s.actors[0].station = p(landing[0] + 50, landing[1] - 100)
    s.actors[2].start = s.actors[2].station = p(landing[0] + 400, landing[1])
    const original=UtilitySimulation.prototype.step
    const step=jest.spyOn(UtilitySimulation.prototype,'step').mockImplementation(function(this:UtilitySimulation,...args:Parameters<UtilitySimulation['step']>){
        const events=original.apply(this,args)
        if(args[0]===16&&args[1].length>1){const flight=this.flights.find(f=>f.id==='recover-smoke');if(flight)flight.state='failed'}
        return events
    })
    try{
        const r=simulateTeams(s,nav,floor)
        expect(r.events.some(e=>e.type==='recovery-screen-wait')).toBe(true)
        const cancel=r.events.find(e=>e.type==='recovery-screen-cancelled')!
        expect(cancel).toBeDefined();expect(cancel.tick).toBeLessThanOrEqual(17)
        expect(r.events.some(e=>e.type==='recovery-screen-ready')).toBe(false)
        expect(r.events.filter(e=>e.type==='grenade-throw')).toHaveLength(1)
        expect(r.frames.at(-1)!.actors.find(a=>a.id==='T2')!.inventory!.smoke).toBe(0)
        expect(r.metrics.minSeparation).toBeGreaterThanOrEqual(32)
    }finally{step.mockRestore()}
})
