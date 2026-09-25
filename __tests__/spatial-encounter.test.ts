import { CollisionScene, type CollisionWorld } from '@/engine/spatial/geometry'
import { DEFAULT_ENCOUNTER, LAB_RIFLE, bodyIntersection, parseEncounterSettings, simulateEncounter, traceShot, visibleSample, type EncounterInput } from '@/engine/spatial/encounter'
import { emptyLabProject, parseLabProject } from '@/lib/spatial-lab-project'
import type { SpatialReference, Vec3 } from '@/engine/spatial/types'
import type { MovementFrame } from '@/engine/spatial/movement'

const plane = (vertices: number[]) => new CollisionScene(new Float32Array(vertices), new Uint32Array([0, 1, 2, 0, 2, 3]))
const clear: CollisionWorld = { raycast: () => null, movementHit: () => null }
const wall = () => plane([100, -1000, -500, 100, 1000, -500, 100, 1000, 1000, 100, -1000, 1000])
const input = (): EncounterInput => ({ a: [0, 0, 0], b: [200, 0, 0], height: 72, settings: { ...DEFAULT_ENCOUNTER, a: { ...DEFAULT_ENCOUNTER.a, aimError: 0 }, b: { ...DEFAULT_ENCOUNTER.b, aimError: 0 } } })
const track = (at: (tick: number) => Vec3, n = 256): MovementFrame[] => Array.from({ length: n }, (_, i) => ({ time: i / 64, position: at(i), speed: 0, state: 'moving' }))

test('opaque wall prevents acquisition, aim changes, shots and damage', () => {
    const r = simulateEncounter(input(), wall())
    expect(r.outcome).toBe('timeout'); expect(r.events).toEqual([])
    expect(r.frames.every(f => f.actors.every(a => !a.knowledge && a.health === 100 && a.ammo === 30))).toBe(true)
})
test('out-of-FOV opponents do not provoke a response', () => {
    const p = input(); p.settings.a.yaw = 180; p.settings.b.yaw = 0
    const r = simulateEncounter(p, clear)
    expect(r.events).toEqual([]); expect(r.frames.at(-1)?.actors.map(a => a.yaw)).toEqual([180, 0])
})
test('changing an unseen opponent position cannot change the observers decision state', () => {
    const p = input(), first = simulateEncounter(p, wall()); p.b = [600, 300, 0]
    const second = simulateEncounter(p, wall())
    expect(second.frames.map(f => f.actors[0])).toEqual(first.frames.map(f => f.actors[0]))
    expect(second.events.filter(e => e.actor === 'A')).toEqual(first.events.filter(e => e.actor === 'A'))
})
test('reaction starts with visible evidence and prevents firing before its deadline', () => {
    const p = input(); p.settings.a.reactionMs = 500; p.settings.b.reactionMs = 2000
    const r = simulateEncounter(p, clear)
    expect(r.events.find(e => e.actor === 'A' && e.type === 'sight')?.tick).toBe(0)
    expect(r.events.find(e => e.actor === 'A' && e.type === 'shot')?.tick).toBe(32)
    expect(r.outcome).toBe('A')
})
test('seeded damage and outcome repeat without mutating input', () => {
    const p = input(), before = JSON.stringify(p), r = simulateEncounter(p, clear)
    expect(simulateEncounter(p, clear)).toEqual(r); expect(JSON.stringify(p)).toBe(before)
    expect(r.events.some(e => e.type === 'damage')).toBe(true)
})
test('simultaneous lethal shots produce a trade instead of a first-player advantage', () => {
    const p = input(); p.settings.a = { ...p.settings.a, reactionMs: 250, armor: 0 }; p.settings.b = { ...p.settings.b, reactionMs: 250, armor: 0 }
    const r = simulateEncounter(p, clear)
    expect(r.outcome).toBe('trade')
    expect(r.events.filter(e => e.type === 'death')).toHaveLength(2)
    expect(r.events.filter(e => e.type === 'shot').map(e => e.tick)).toEqual([16, 16])
})
test('a floor slab blocks direct damage between vertically separated players', () => {
    const slab = plane([-500, -500, 100, 500, -500, 100, 500, 500, 100, -500, 500, 100])
    expect(traceShot([0, 0, 64], [250, 0, 239], [200, 0, 140], 72, slab).type).toBe('obstruction')
    const p = input(); p.b[2] = 140; p.settings.a.pitch = 35; p.settings.b.pitch = -35
    expect(simulateEncounter(p, slab).events.filter(e => e.type === 'damage')).toEqual([])
})
test('hit resolution chooses wall before target, but ignores a wall behind the target', () => {
    expect(traceShot([0, 0, 64], [400, 0, 64], [200, 0, 0], 72, wall()).type).toBe('obstruction')
    expect(traceShot([0, 0, 64], [400, 0, 64], [50, 0, 0], 72, wall()).type).toBe('hit')
})
test('partial cover allows visible head acquisition while torso shots still hit cover', () => {
    const cover = plane([100, -100, 0, 100, 100, 0, 100, 100, 55, 100, -100, 55])
    expect(visibleSample({ position: [0, 0, 0], yaw: 0, pitch: 0 }, [200, 0, 0], 72, 110, cover)).toEqual([200, 0, 64])
    expect(traceShot([0, 0, 40], [400, 0, 40], [200, 0, 0], 72, cover).type).toBe('obstruction')
    expect(traceShot([0, 0, 64], [400, 0, 64], [200, 0, 0], 72, cover).type).toBe('hit')
})
test('head and torso hit volumes and misses are distinct', () => {
    expect(bodyIntersection([0, 0, 64], [400, 0, 64], [200, 0, 0], 72)?.region).toBe('head')
    expect(bodyIntersection([0, 0, 35], [400, 0, 35], [200, 0, 0], 72)?.region).toBe('body')
    expect(bodyIntersection([0, 30, 35], [400, 30, 35], [200, 0, 0], 72)).toBeNull()
})
test('armor with a helmet reduces head damage and consumes armor', () => {
    const p = input(); p.settings.b.reactionMs = 2000
    const armored = simulateEncounter(p, clear); p.settings.b.helmet = false
    const unhelmeted = simulateEncounter(p, clear)
    expect(armored.events.find(e => e.type === 'damage')!.damage).toBeLessThan(unhelmeted.events.find(e => e.type === 'damage')!.damage!)
    expect(armored.frames.at(-1)!.actors[1].armor).toBeLessThan(100)
})
test('empty magazines reload before firing and reserve ammo decreases exactly once', () => {
    const p = input(); p.settings.a.ammo = 0; p.settings.b.yaw = 0
    const r = simulateEncounter(p, clear)
    expect(r.events.find(e => e.actor === 'A' && e.type === 'reload-start')?.tick).toBe(0)
    expect(r.events.find(e => e.actor === 'A' && e.type === 'reload-end')?.tick).toBe(LAB_RIFLE.reloadTicks)
    expect(r.events.find(e => e.actor === 'A' && e.type === 'shot')?.tick).toBe(LAB_RIFLE.reloadTicks)
    expect(r.frames[LAB_RIFLE.reloadTicks].actors[0].reserve).toBe(30)
    expect(r.frames.slice(0, LAB_RIFLE.reloadTicks).every(f => f.actors[0].ammo === 0)).toBe(true)
})
test('aim turning is rate-limited after reaction and shots wait for aim alignment', () => {
    const p = input(); p.settings.a.yaw = 45; p.settings.a.reactionMs = 250; p.settings.b.reactionMs = 2000
    const r = simulateEncounter(p, clear), a = r.frames.map(f => f.actors[0])
    expect(a[15].yaw).toBe(45)
    expect(a[16].yaw).toBeCloseTo(45 - LAB_RIFLE.turnDegreesPerSecond / 64)
    expect(r.events.find(e => e.actor === 'A' && e.type === 'shot')!.tick).toBeGreaterThan(16)
})
test('visibility loss freezes knowledge, decays confidence, expires memory, and never fires blind', () => {
    const corner = plane([100, 10, -10, 100, 1000, -10, 100, 1000, 200, 100, 10, 200])
    const p = input(); p.settings.a.reactionMs = 2000; p.settings.b.yaw = 0; p.settings.seconds = 4
    p.tracks = { B: track(i => [200, Math.min(i * 2, 100), 0]) }
    const r = simulateEncounter(p, corner), lost = r.events.find(e => e.actor === 'A' && e.type === 'lost')!
    expect(lost).toBeDefined(); expect(r.events.filter(e => e.actor === 'A' && e.type === 'shot')).toEqual([])
    const first = r.frames[lost.tick].actors[0].knowledge!, later = r.frames[lost.tick + 10].actors[0].knowledge!
    expect(later.point).toEqual(first.point); expect(later.confidence).toBeLessThan(first.confidence); expect(later.uncertainty).toBeGreaterThan(first.uncertainty)
    expect(r.frames.at(-1)!.actors[0].knowledge).toBeNull()
})
test('reacquisition requires a fresh uninterrupted reaction window', () => {
    const corner = plane([100, 10, -10, 100, 1000, -10, 100, 1000, 200, 100, 10, 200])
    const p = input(); p.settings.a.reactionMs = 500; p.settings.b.yaw = 0
    p.tracks = { B: track(i => [200, i < 50 ? Math.min(i * 2, 80) : Math.max(0, 80 - (i - 50) * 2), 0]) }
    const r = simulateEncounter(p, corner), sights = r.events.filter(e => e.actor === 'A' && e.type === 'sight')
    expect(sights.length).toBeGreaterThanOrEqual(2)
    expect(r.events.find(e => e.actor === 'A' && e.type === 'shot')!.tick).toBeGreaterThanOrEqual(sights[1].tick + 32)
})
test('measured movement speed increases shot spread', () => {
    const p = input(); p.b = [2000, 0, 0]; p.settings.b.yaw = 0
    const still = simulateEncounter(p, clear); p.tracks = { A: track(i => [0, i, 0], 128) }
    const moving = simulateEncounter(p, clear)
    expect(moving.events.find(e => e.type === 'shot')!.spread).toBeGreaterThan(still.events.find(e => e.type === 'shot')!.spread!)
})
test('three-shot bursts enforce cadence and accumulated recoil raises later rays', () => {
    const p = input(); p.b = [3000, 0, 0]; p.settings.b.yaw = 0
    const shots = simulateEncounter(p, clear).events.filter(e => e.type === 'shot' && e.actor === 'A')
    expect(shots.length).toBeGreaterThanOrEqual(6)
    const cadence=shots.slice(1,6).map((e,i)=>e.tick-shots[i].tick)
    expect([cadence[0],cadence[1],cadence[3],cadence[4]]).toEqual([7,7,7,7])
    expect(cadence[2]).toBeGreaterThan(21) // Wait for actual recoil recovery before the next burst.
    const pitch = (i: number) => Math.atan2(shots[i].to![2] - shots[i].from![2], Math.hypot(shots[i].to![0] - shots[i].from![0], shots[i].to![1] - shots[i].from![1])) * 180 / Math.PI
    expect(pitch(2) - pitch(0)).toBeGreaterThan(0.2)
    expect(Math.abs(pitch(3)-pitch(0))).toBeLessThan(1.5)
})
test('every shot consumes exactly one round across reloads; ammo cannot be created', () => {
    const p = input(); p.b = [3000, 0, 0]; p.settings.b.yaw = 0; p.settings.a.ammo = 1; p.settings.seconds = 12
    const r = simulateEncounter(p, clear)
    expect(r.events.some(e => e.actor === 'A' && e.type === 'reload-end')).toBe(true)
    for (const f of r.frames) {
        const shots = r.events.filter(e => e.actor === 'A' && e.type === 'shot' && e.tick <= f.tick).length
        expect(f.actors[0].ammo + f.actors[0].reserve + shots).toBe(61)
    }
})
test('invalid motion stops without teleporting', () => {
    const p = input(); p.settings.a.yaw = 180; p.settings.b.yaw = 0
    p.tracks = { A: track(i => [i ? 1000 : 0, 0, 0], 3) }
    const r = simulateEncounter(p, clear)
    expect(r.events.some(e => e.type === 'movement-blocked')).toBe(true)
    expect(r.frames.at(-1)!.actors[0].position).toEqual([0, 0, 0])
})
test('settings reject non-finite values, invalid booleans, excessive duration and magazine sizes', () => {
    for (const patch of [{ seconds: 21 }, { seed: -1 }, { fov: NaN }, { approach: 'yes' }, { a: { ...DEFAULT_ENCOUNTER.a, ammo: 100 } }]) expect(() => parseEncounterSettings({ ...DEFAULT_ENCOUNTER, ...patch })).toThrow()
    expect(parseEncounterSettings({ ...DEFAULT_ENCOUNTER, seed: 0 }).seed).toBe(0)
})
test('lab serialization preserves encounter settings and defaults older drafts without altering annotations', () => {
    const ref: SpatialReference = { format: 'esim-spatial-reference', version: 1, mapId: 'Mirage', sourceMap: 'test', sourceVersion: 'test', sourceUrl: '', meshSha256: '', transform: { pos_x: 0, pos_y: 0, scale: 1 }, radars: { upper: '' }, areas: [], ladders: [] }
    const old = emptyLabProject(ref), p = { ...old, encounter: DEFAULT_ENCOUNTER }
    expect(parseLabProject(JSON.stringify(p), ref)).toEqual(p)
    expect(parseLabProject(JSON.stringify(old), ref).encounter).toBeUndefined()
})
