import { CollisionScene, type CollisionWorld } from '@/engine/spatial/geometry'
import { DEFAULT_ENCOUNTER, simulateEncounter, traceShot, type EncounterInput } from '@/engine/spatial/encounter'
import { DEFAULT_UTILITY, EMPTY_STOCK, UtilitySimulation, blastDamage, flashExposure, parseUtilitySetup, smokeContains, smokeRay, type GrenadeKind, type ThrowPlan, type UtilityActor, type UtilityEffect, type UtilitySetup } from '@/engine/spatial/utility'
import type { Vec3 } from '@/engine/spatial/types'
import { emptyLabProject, parseLabProject } from '@/lib/spatial-lab-project'
import type { SpatialReference } from '@/engine/spatial/types'

const mesh = (polygons: number[][]) => {
    const vertices: number[] = [], indices: number[] = []
    for (const face of polygons) { const n = vertices.length / 3; vertices.push(...face); indices.push(n, n + 1, n + 2, n, n + 2, n + 3) }
    return new CollisionScene(new Float32Array(vertices), new Uint32Array(indices))
}
const floor = [-3000, -3000, 0, 3000, -3000, 0, 3000, 3000, 0, -3000, 3000, 0]
const wall = [100, -1000, -10, 100, 1000, -10, 100, 1000, 1000, 100, -1000, 1000]
const actors = (): UtilityActor[] => [{ id: 'A', position: [0, 0, 0], yaw: 0, pitch: 0, health: 100 }, { id: 'B', position: [200, 0, 0], yaw: 180, pitch: 0, health: 100 }]
const plan = (kind: GrenadeKind): ThrowPlan => ({ id: 'throw-1', owner: 'A', kind, at: 0, yaw: 0, pitch: -80, power: 0.1, mode: 'lob', tolerance: 16, bounceTargets: [] })
const setup = (kind: GrenadeKind): UtilitySetup => ({ ...DEFAULT_UTILITY, inventory: { A: { ...EMPTY_STOCK, [kind]: 1 }, B: { ...EMPTY_STOCK } }, throws: [plan(kind)] })
const run = (kind: GrenadeKind, world = mesh([floor])) => {
    const simulation = new UtilitySimulation(setup(kind), world), events = []
    for (let tick = 0; tick <= 12 * 64; tick++) events.push(...simulation.step(tick, actors(), 72))
    return { simulation, events }
}
const encounter = (kind: GrenadeKind): EncounterInput => ({ settings: { ...DEFAULT_ENCOUNTER, seconds: 12, a: { ...DEFAULT_ENCOUNTER.a }, b: { ...DEFAULT_ENCOUNTER.b } }, a: [0, 0, 0], b: [200, 0, 0], height: 72, utility: setup(kind) })

test('triangle normals oppose both ray directions and remain normalized', () => {
    const world = mesh([wall])
    expect(world.raycast([0, 0, 50], [200, 0, 50])!.normal).toEqual([-1, -0, -0])
    expect(world.raycast([200, 0, 50], [0, 0, 50])!.normal).toEqual([1, 0, 0])
})
test.each(['smoke', 'flash', 'he', 'fire', 'decoy'] as const)('%s travels, bounces and detonates once; inventory is consumed once', kind => {
    const { simulation: s, events } = run(kind)
    expect(events.filter(e => e.type === 'grenade-throw')).toHaveLength(1)
    expect(events.filter(e => e.type === 'grenade-detonate')).toHaveLength(1)
    expect(s.inventory.A[kind]).toBe(0)
    expect(s.flights[0].bounces.length).toBeGreaterThan(0)
    expect(s.flights[0].path.every(p => p.point[2] >= 1.9)).toBe(true)
    expect(s.checks()[0].state).toBe('draft')
})
test('an unequipped or repeated throw is rejected without negative inventory', () => {
    const p = setup('he'); p.throws.push({ ...p.throws[0], id: 'second', at: 0.5 })
    const s = new UtilitySimulation(p, mesh([floor])), events = []
    for (let tick = 0; tick < 100; tick++) events.push(...s.step(tick, actors(), 72))
    expect(events.filter(e => e.type === 'grenade-throw')).toHaveLength(1)
    expect(events.filter(e => e.type === 'utility-rejected')).toHaveLength(1)
    expect(s.inventory.A.he).toBe(0)
})
test('dead throwers and blocked release positions do not spend inventory', () => {
    const s = new UtilitySimulation(setup('smoke'), mesh([floor])), dead = actors(); dead[0].health = 0
    expect(s.step(0, dead, 72)[0].type).toBe('utility-rejected'); expect(s.inventory.A.smoke).toBe(1)
    const w = mesh([[5, -100, 0, 5, 100, 0, 5, 100, 100, 5, -100, 100]]), p = setup('smoke'); p.throws[0].pitch = 0
    const blocked = new UtilitySimulation(p, w)
    expect(blocked.step(0, actors(), 72)[0].type).toBe('utility-rejected'); expect(blocked.inventory.A.smoke).toBe(1)
})
test('bounce reflection does not tunnel through a wall even at running throw speed', () => {
    const p = setup('he'); p.throws[0] = { ...p.throws[0], pitch: 0, power: 1, mode: 'running' }
    const s = new UtilitySimulation(p, mesh([floor, wall]))
    for (let tick = 0; tick < 100; tick++) s.step(tick, actors(), 72)
    expect(s.flights[0].path.every(p => p.point[0] < 99)).toBe(true)
    expect(s.flights[0].bounces.length).toBeGreaterThan(0)
})
test('missing floor or collision normals produces a failed trajectory, not a fabricated landing', () => {
    const clear: CollisionWorld = { raycast: () => null, movementHit: () => null }
    const s = new UtilitySimulation(setup('smoke'), clear)
    for (let tick = 0; tick <= 400; tick++) s.step(tick, actors(), 72)
    expect(s.flights[0].state).toBe('failed'); expect(s.effects).toHaveLength(0)
    const noNormal: CollisionWorld = { raycast: (a, b) => Math.abs(b[2] - a[2]) < 1 ? null : { fraction: 0.5, point: [a[0], a[1], (a[2] + b[2]) / 2], triangle: 0 }, movementHit: () => null }
    const p = setup('smoke'); p.throws[0].pitch = 0
    const other = new UtilitySimulation(p, noNormal)
    for (let tick = 0; tick < 200; tick++) other.step(tick, actors(), 72)
    expect(other.flights[0].state).toBe('failed')
})
test('smoke is confined by walls and floors and expires without becoming bullet geometry', () => {
    const world = mesh([floor, wall, [-1000, -1000, 90, 1000, -1000, 90, 1000, 1000, 90, -1000, 1000, 90]])
    const smoke: UtilityEffect = { id: 'smoke', kind: 'smoke', owner: 'A', point: [50, 0, 2], start: 10, end: 100 }
    expect(smokeContains(smoke, [70, 0, 64], world)).toBe(true)
    expect(smokeContains(smoke, [120, 0, 64], world)).toBe(false)
    expect(smokeContains(smoke, [50, 0, 120], world)).toBe(false)
    expect(smokeRay([0, 0, 64], [80, 0, 64], [smoke], 9, world)).toBeNull()
    expect(smokeRay([0, 0, 64], [80, 0, 64], [smoke], 10, world)).not.toBeNull()
    expect(smokeRay([0, 0, 64], [80, 0, 64], [smoke], 100, world)).toBeNull()
    expect(traceShot([0, 0, 64], [90, 0, 64], [70, 0, 0], 72, world).type).toBe('hit')
})
test('flash exposure decreases when looking away and is zero behind opaque geometry', () => {
    const a = actors()[0], world = mesh([floor]), origin: Vec3 = [200, 0, 64]
    const front = flashExposure(origin, a, 72, world), away = flashExposure(origin, { ...a, yaw: 180 }, 72, world)
    expect(front).toBeGreaterThan(away * 4); expect(away).toBeGreaterThan(0)
    expect(flashExposure(origin, a, 72, mesh([floor, wall]))).toBe(0)
})
test('HE damage falls off with range and respects complete wall and floor cover', () => {
    const a = actors()[0], world = mesh([floor])
    expect(blastDamage([50, 0, 40], a, 72, world)).toBeGreaterThan(blastDamage([250, 0, 40], a, 72, world))
    expect(blastDamage([200, 0, 40], a, 72, mesh([floor, wall]))).toBe(0)
    const ceiling = [-1000, -1000, 90, 1000, -1000, 90, 1000, 1000, 90, -1000, 1000, 90]
    expect(blastDamage([0, 0, 130], a, 72, mesh([floor, ceiling]))).toBe(0)
})
test('fire cells remain supported and do not spread through a wall or onto another floor', () => {
    const nearbyWall = [30, -1000, -10, 30, 1000, -10, 30, 1000, 1000, 30, -1000, 1000]
    const { simulation: s, events } = run('fire', mesh([floor, nearbyWall]))
    expect(s.effects[0].cells!.length).toBeGreaterThan(0)
    expect(s.effects[0].cells!.every(p => p[0] < 30 && p[2] <= 3)).toBe(true)
    expect(events.some(e => e.type === 'fire-damage' && e.target === 'A')).toBe(true)
    expect(events.some(e => e.type === 'fire-damage' && e.target === 'B')).toBe(false)
    expect(events.filter(e => e.type === 'fire-damage').every(e => e.tick < s.effects[0].end)).toBe(true)
})
test('smoke interrupts encounter perception and sight returns after expiry', () => {
    const r = simulateEncounter(encounter('smoke'), mesh([floor]))
    expect(r.events.some(e => e.type === 'lost')).toBe(true)
    const effect = r.utility!.effects[0]
    expect(r.events.some(e => e.type === 'sight' && e.tick >= effect.end)).toBe(true)
    expect(r.events.some(e => e.type === 'shot')).toBe(false)
})
test('flash blinds actual actors and prevents shots during the effect', () => {
    const p = encounter('flash'); p.utility!.ceasefire = false; p.settings.a.reactionMs = 2000; p.settings.b.reactionMs = 2000
    const r = simulateEncounter(p, mesh([floor]))
    expect(r.events.some(e => e.type === 'flash')).toBe(true)
    for (const shot of r.events.filter(e => e.type === 'shot')) expect(r.frames[shot.tick].actors.find(a => a.id === shot.actor)!.utility!.blindUntil).toBeLessThanOrEqual(shot.tick)
})
test('HE and fire alter authoritative health; effects continue after a utility death', () => {
    const he = simulateEncounter(encounter('he'), mesh([floor])), fire = simulateEncounter(encounter('fire'), mesh([floor]))
    expect(he.frames.at(-1)!.actors[0].health).toBeLessThan(100)
    expect(fire.frames.at(-1)!.actors[0].health).toBe(0)
    expect(fire.events.some(e => e.type === 'grenade-expire')).toBe(true)
    expect(fire.frames).toHaveLength(12 * 64 + 1)
})
test('decoy gives an uncertain gunfire cue and turns a distracted opponent without leaking thrower coordinates', () => {
    const p = encounter('decoy'); p.settings.b.yaw = 0
    const r = simulateEncounter(p, mesh([floor])), heard = r.events.filter(e => e.type === 'decoy-heard')
    expect(heard.length).toBeGreaterThan(0)
    expect(heard.every(e => e.actor === 'B' && e.to!.every(n => n % 64 === 0))).toBe(true)
    expect(r.frames.some(f => f.actors[1].yaw !== 0)).toBe(true)
    expect(r.events.some(e => e.type === 'shot')).toBe(false)
})
test('target and bounce checks report mismatches and do not certify source lineups', () => {
    const p = setup('smoke'); p.throws[0].target = [2000, 0, 0]; p.throws[0].bounceTargets = [[1000, 0, 0]]; p.throws[0].source = 'https://example.com/lineup'
    const s = new UtilitySimulation(p, mesh([floor]))
    for (let i = 0; i < 400; i++) s.step(i, actors(), 72)
    expect(s.checks()[0].state).toBe('mismatch'); expect(s.setup.throws[0].source).toBe(p.throws[0].source)
})
test('repeated decoy pulses refresh expiry without restarting a slow reaction', () => {
    const p = encounter('decoy'); p.settings.b.yaw = 0; p.settings.b.reactionMs = 2000
    const r = simulateEncounter(p, mesh([floor])), first = r.events.find(e => e.type === 'decoy-heard')!
    expect(r.frames[first.tick + 127].actors[1].yaw).toBe(0)
    expect(r.frames[first.tick + 128].actors[1].yaw).not.toBe(0)
    expect(r.frames.at(-1)!.actors[1].utility!.heard).toBeNull()
    expect(r.events.filter(e => e.type === 'decoy-heard').every(e => e.grenade === 'throw-1')).toBe(true)
})
test('utility encounter replay is repeatable and does not mutate portable input', () => {
    const p = encounter('he'), before = JSON.stringify(p)
    expect(simulateEncounter(p, mesh([floor]))).toEqual(simulateEncounter(p, mesh([floor])))
    expect(JSON.stringify(p)).toBe(before)
})
test('portable utility setup survives lab serialization and rejects invalid budgets and coordinates', () => {
    const ref: SpatialReference = { format: 'esim-spatial-reference', version: 1, mapId: 'Mirage', sourceMap: 'test', sourceVersion: 'test', sourceUrl: '', meshSha256: '', transform: { pos_x: 0, pos_y: 0, scale: 1 }, radars: { upper: '' }, areas: [], ladders: [] }
    const p = { ...emptyLabProject(ref), utility: setup('flash') }
    expect(parseLabProject(JSON.stringify(p), ref)).toEqual(p)
    for (const bad of [{ ...p.utility, restitution: NaN }, { ...p.utility, throws: Array(9).fill(plan('he')) }, { ...p.utility, inventory: { ...p.utility.inventory, A: { ...EMPTY_STOCK, he: 2 } } }, { ...p.utility, throws: [{ ...plan('he'), target: [Infinity, 0, 0] }] }]) expect(() => parseUtilitySetup(bad)).toThrow()
})
