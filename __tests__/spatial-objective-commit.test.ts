import { CollisionScene } from '@/engine/spatial/geometry'
import { NavigationMesh, type NavLocation } from '@/engine/spatial/navigation'
import { distance3, type SpatialReference, type Vec3 } from '@/engine/spatial/types'
import { TEAM_DEFAULTS, chooseTeamPlan, type DecisionEvidence, type TeamSetup } from '@/engine/spatial/team-model'
import { simulateTeams } from '@/engine/spatial/team-simulation'
import { recoveryHandoff } from '@/engine/spatial/recovery-support'
import { DEFAULT_UTILITY, EMPTY_STOCK } from '@/engine/spatial/utility'
import * as movement from '@/engine/spatial/movement'

// Regressions from the v13 acceptance campaign (Overpass B, seed 4326171, combat and no-gun):
// 1. T2 started planting at 21.42 s; two radio reports near B arrived and the T plan rotated to A at
//    23.50 s, resetting a plant 1.1 s from completion. The round then timed out without a plant.
// 2. After the carrier died on narrow stairs, the nominated recoverer (T5) was held by a stationary
//    teammate (T1) standing 38 units from the bomb. T1 had been excluded from recovery because an
//    earlier, unrelated goal had retired; T5 then detoured around the map for 60 s.

const ref: SpatialReference = { format: 'esim-spatial-reference', version: 1, mapId: 'Mirage', sourceMap: 'test', sourceVersion: 'test', sourceUrl: 'https://example.com', meshSha256: 'test', radars: { upper: '/test.png' }, transform: { pos_x: 0, pos_y: 1000, scale: 1 }, ladders: [], areas: [{ id: 1, hull: 0, flags: '0', movable: 4294967295, corners: [[0, 0, 0], [1000, 0, 0], [1000, 1000, 0], [0, 1000, 0]], edges: [], laddersAbove: [], laddersBelow: [] }] }
const nav = new NavigationMesh(ref)
const floor = new CollisionScene(new Float32Array([0, 0, 0, 1000, 0, 0, 1000, 1000, 0, 0, 1000, 0]), new Uint32Array([0, 1, 2, 0, 2, 3]))
const p = (x: number, y: number): NavLocation => ({ area: 1, point: [x, y, 0] })
const member = (id: string, side: 'T' | 'CT', role: 'entry' | 'support' | 'anchor', at: NavLocation, yaw: number) => ({ id, side, role, start: at, station: at, yaw, health: 100, armor: 100, ammo: 30 })
const policy = (patch: Partial<DecisionEvidence> = {}): DecisionEvidence => ({ side: 'T', tick: 400, alive: 2, contactsAtSite: 0, credibleEnemies: 0, planted: false, bombSite: 'A', bombRemaining: 10, travelSeconds: 1, roundRemaining: 20, openingSeconds: 2, defuseSeconds: 5, economy: 'balanced', plan: { mode: 'execute', site: 'A', since: 0, reason: 'Execute' }, ...patch })

test('a carrier already on the planned site keeps the plan instead of rotating on defender reports', () => {
    const executing = policy().plan
    // Without a committed carrier the existing evidence rule still rotates.
    expect(chooseTeamPlan(policy({ contactsAtSite: 2 }))).toMatchObject({ mode: 'rotate', site: 'B' })
    expect(chooseTeamPlan(policy({ contactsAtSite: 2, carrierOnSite: true }))).toEqual(executing)
    // The opening still advances to the execute, and a planted bomb keeps its own rule.
    expect(chooseTeamPlan(policy({ plan: { mode: 'default', site: 'A', since: 0, reason: 'Opening' }, carrierOnSite: true }))).toMatchObject({ mode: 'execute', site: 'A' })
    expect(chooseTeamPlan(policy({ planted: true, bombSite: 'A', carrierOnSite: false, contactsAtSite: 3 }))).toMatchObject({ mode: 'execute', site: 'A' })
})

test('reported defenders at the site do not interrupt a plant already in progress', () => {
    const s: TeamSetup = { ...TEAM_DEFAULTS, seconds: 8, roundSeconds: 30, openingSeconds: 0, plantSeconds: 4, carrier: 'T1', sites: { A: p(400, 400), B: p(800, 800) }, actors: [
        member('T1', 'T', 'entry', p(400, 400), 0),
        member('T2', 'T', 'support', p(300, 500), 0),
        member('CT1', 'CT', 'anchor', p(600, 400), 180),
        member('CT2', 'CT', 'anchor', p(600, 300), 180),
    ] }
    const r = simulateTeams(s, nav, floor)
    const start = r.events.find(e => e.type === 'plant-start'), planted = r.events.find(e => e.type === 'planted')
    // The defenders are seen and reported while the plant runs: the rotate evidence is present.
    expect(r.events.filter(e => e.type === 'report' && e.side === 'T' && start && e.tick > start.tick).length).toBeGreaterThanOrEqual(2)
    expect(start?.actor).toBe('T1')
    expect(planted).toBeDefined()
    expect(planted!.tick - start!.tick).toBe(s.plantSeconds * 64)
    expect(r.events.some(e => e.type === 'objective-interrupted')).toBe(false)
    expect(r.events.some(e => e.type === 'plan' && e.side === 'T' && e.reason.includes('alternate objective'))).toBe(false)
    // No position changes beyond normal movement: the planter stayed inside the test radius on its own feet.
    expect(r.frames.filter(f => f.tick >= start!.tick && f.tick <= planted!.tick).every(f => distance3(f.actors.find(a => a.id === 'T1')!.position, s.sites.A.point) <= 64)).toBe(true)
    expect(r.metrics.minSeparation).toBeGreaterThanOrEqual(32)
})

test('a stalled recoverer hands the pickup to the closer teammate holding its approach', () => {
    const bomb: Vec3 = [-2643.4, 1431.7, 465.7]
    // Recorded Overpass positions: recoverer T5 on the stairs, T1 standing 38 units from the bomb.
    const team = [{ id: 'T1', position: [-2653.4, 1462.5, 444.8] as Vec3 }, { id: 'T5', position: [-2640, 1492.2, 425.2] as Vec3 }]
    expect(recoveryHandoff(team[1].position, 'T1', team, bomb, () => true)).toBe('T1')
    // The holding teammate must have its own checked route, be closer, and be a living teammate.
    expect(recoveryHandoff(team[1].position, 'T1', team, bomb, () => false)).toBeNull()
    expect(recoveryHandoff(team[0].position, 'T5', team, bomb, () => true)).toBeNull()
    expect(recoveryHandoff(team[1].position, 'CT1', team, bomb, () => true)).toBeNull()
})

test('a bomb drop clears earlier failed goals so a nearby teammate can recover it', () => {
    const s: TeamSetup = { ...TEAM_DEFAULTS, seconds: 9, roundSeconds: 30, openingSeconds: 0, plantSeconds: 4, carrier: 'T1', sites: { A: p(400, 400), B: p(800, 800) }, actors: [
        { ...member('T1', 'T', 'entry', p(200, 400), 0), health: 1, armor: 0 },
        // A lurker holds its separate station for the first six seconds; that station is unreachable here.
        { ...member('T2', 'T', 'support', p(200, 600), 0), role: 'lurk' as const, station: p(200, 900) },
        // A farther teammate that never failed: before the fix it was nominated while T2 was still retired.
        { ...member('T3', 'T', 'support', p(50, 950), 0), role: 'lurk' as const },
        member('CT1', 'CT', 'anchor', p(900, 900), 180),
    ] }
    // The carrier's own HE ends the plant; the blast lands after T2 has already retired its goal.
    s.utility = { ...DEFAULT_UTILITY, inventory: Object.fromEntries(s.actors.map(a => [a.id, { ...EMPTY_STOCK, he: a.id === 'T1' ? 1 : 0 }])), throws: [{ id: 'interrupt', owner: 'T1', kind: 'he', at: 2, yaw: 0, pitch: -80, power: 0.1, mode: 'lob', tolerance: 16, bounceTargets: [] }] }
    const original = movement.simulateMovement
    // T2's pre-drop goal (its lurk station) is made unreachable so it retires after three attempts.
    // Any route ending near the site, where the bomb will drop, uses the real solver.
    const probe = jest.spyOn(movement, 'simulateMovement').mockImplementation((route, ...args) => {
        const start = route.points[0], end = route.points.at(-1)
        if (start && end && start[0] === 200 && start[1] === 600 && distance3(end, s.sites.A.point) > 64) return [{ time: 0, position: start, speed: 0, state: 'blocked', reason: 'Test: pre-drop goal unavailable' }]
        return original(route, ...args)
    })
    try {
        const r = simulateTeams(s, nav, floor)
        const dropped = r.events.find(e => e.type === 'bomb-dropped'), retired = r.events.find(e => e.type === 'intent' && e.actor === 'T2' && e.reason.includes('failed'))
        expect(retired).toBeDefined()
        expect(dropped).toBeDefined()
        expect(retired!.tick).toBeLessThan(dropped!.tick)
        // The first nomination after the drop goes to the nearer teammate, not the distant one.
        expect(r.events.find(e => e.type === 'recovery-assigned' && e.tick >= dropped!.tick)?.actor).toBe('T2')
        expect(r.events.some(e => e.type === 'bomb-picked-up' && e.actor === 'T2')).toBe(true)
        expect(r.metrics.minSeparation).toBeGreaterThanOrEqual(32)
    } finally { probe.mockRestore() }
})
