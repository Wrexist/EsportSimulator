import { CollisionScene } from '@/engine/spatial/geometry'
import { checkRecoveryThrow, recoveryThreat } from '@/engine/spatial/recovery-support'
import { DEFAULT_UTILITY, EMPTY_STOCK, parseUtilitySetup, UtilitySimulation, type ThrowPlan, type UtilityActor } from '@/engine/spatial/utility'
import type { Contact } from '@/engine/spatial/team-model'
import type { Vec3 } from '@/engine/spatial/types'

const floor = new CollisionScene(new Float32Array([0,0,0,2000,0,0,2000,2000,0,0,2000,0]), new Uint32Array([0,1,2,0,2,3]))
const owner: UtilityActor = { id: 'T2', position: [400,600,0], health: 100, yaw: 180, pitch: 0 }
const contact: Contact = { enemy: 'CT1', point: [800,400,64], seen: 32, received: 64, source: 'T1', visible: false, confidence: .8, uncertainty: 110 }
const bomb: Vec3 = [500,400,0]
function authored(kind: 'smoke' | 'flash' = 'smoke') {
    const plan: ThrowPlan = { id: 'cover', owner: owner.id, kind, at: 0, yaw: -90, pitch: 0, power: .5, mode: 'normal', tolerance: 8, bounceTargets: [], origin: [...owner.position] }
    const setup = { ...DEFAULT_UTILITY, inventory: { T2: { ...EMPTY_STOCK, [kind]: 1 } }, throws: [plan] }
    const probe = new UtilitySimulation(setup, floor, ['T2'])
    for (let tick = 0; tick <= 384 && !probe.effects.length; tick++) probe.step(tick, [owner], 72)
    expect(probe.effects).toHaveLength(1)
    plan.target = [...probe.effects[0].point]; plan.trigger = 'recovery'
    return { plan, setup }
}

test('recovery threat selection uses delivered, recent, credible observations with stable ties', () => {
    expect(recoveryThreat([contact], bomb, 63)).toBeUndefined()
    expect(recoveryThreat([contact], bomb, 64)).toEqual(contact)
    expect(recoveryThreat([contact], bomb, 161)).toBeUndefined()
    expect(recoveryThreat([{ ...contact, confidence: .5 }], bomb, 64)).toBeUndefined()
    expect(recoveryThreat([{ ...contact, point: [1900,1900,64] }], bomb, 64)).toBeUndefined()
    const other = { ...contact, enemy: 'CT2' }
    expect(recoveryThreat([other, contact], bomb, 64)).toEqual(recoveryThreat([contact, other], bomb, 64))
})

test('recovery smoke must physically screen the pickup and match the authored flight without spending live stock', () => {
    const { plan, setup } = authored(), before = JSON.stringify(setup)
    const pickup: Vec3 = [plan.target![0] + 50, plan.target![1], 0]
    const reported = { ...contact, point: [plan.target![0] + 400, plan.target![1], 64] as Vec3 }
    expect(checkRecoveryThrow(plan, setup, owner, [owner], pickup, reported, floor, 72).allowed).toBe(true)
    expect(JSON.stringify(setup)).toBe(before)
    expect(checkRecoveryThrow({ ...plan, target: [400,600,0] }, setup, owner, [owner], bomb, contact, floor, 72).reason).toMatch(/does not match/)
    expect(checkRecoveryThrow(plan, setup, { ...owner, position: [420,600,0] }, [owner], bomb, contact, floor, 72).reason).toMatch(/release position/)
    expect(checkRecoveryThrow(plan, setup, owner, [owner], [700,600,0], { ...contact, point: [1000,600,64] }, floor, 72).reason).toMatch(/does not screen/)
    const empty = { ...setup, inventory: { T2: { ...EMPTY_STOCK } } }
    expect(checkRecoveryThrow(plan, empty, owner, [owner], bomb, contact, floor, 72).reason).toMatch(/not equipped/)
})

test('recovery preflight holds a flash that would expose a friendly player', () => {
    const { plan, setup } = authored('flash')
    const friend: UtilityActor = { id: 'T1', position: [plan.target![0] + 50,plan.target![1],0], health: 100, yaw: 180, pitch: 0 }
    const threat = { ...contact, point: [plan.target![0] + 100,plan.target![1],64] as Vec3 }
    expect(checkRecoveryThrow(plan, setup, owner, [friend], bomb, threat, floor, 72).reason).toMatch(/exposes a teammate/)
    expect(setup.inventory.T2.flash).toBe(1)
    expect(checkRecoveryThrow(plan, setup, owner, [], bomb, threat, floor, 72).allowed).toBe(true)
})

test('an obstructed release fails preflight without consuming inventory', () => {
    const { plan, setup } = authored(), before = JSON.stringify(setup.inventory)
    const wall = new CollisionScene(new Float32Array([350,594,0,450,594,0,450,594,160,350,594,160]), new Uint32Array([0,1,2,0,2,3]))
    const blocked = { raycast: (a: Vec3,b: Vec3) => wall.raycast(a,b) || floor.raycast(a,b), movementHit: floor.movementHit.bind(floor) }
    expect(checkRecoveryThrow(plan, setup, owner, [owner], bomb, contact, blocked, 72).allowed).toBe(false)
    expect(JSON.stringify(setup.inventory)).toBe(before)
})

test('recovery metadata round trips and invalid or incomplete support plans are rejected', () => {
    const { plan, setup } = authored()
    expect(parseUtilitySetup(setup, ['T2']).throws[0]).toEqual(plan)
    for (const edit of [{ origin: undefined }, { target: undefined }, { kind: 'he' }, { mode: 'running' }, { trigger: 'secret' }, { origin: [NaN,0,0] }]) {
        expect(() => parseUtilitySetup({ ...setup, throws: [{ ...plan, ...edit }] }, ['T2'])).toThrow()
    }
    expect(parseUtilitySetup({ ...setup, throws: [{ ...plan, trigger: undefined, origin: undefined, target: undefined }] }, ['T2']).throws[0].trigger).toBeUndefined()
})
