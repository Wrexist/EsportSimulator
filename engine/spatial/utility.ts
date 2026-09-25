import type { CollisionWorld, RayHit } from './geometry'
import { distance3, mix3, type Vec3 } from './types'

export const UTILITY_KINDS = ['smoke', 'flash', 'he', 'fire', 'decoy'] as const
export type GrenadeKind = typeof UTILITY_KINDS[number]
export type UtilityOwner = string
export type UtilityStock = Record<GrenadeKind, number>
export interface ThrowPlan { id: string; owner: UtilityOwner; kind: GrenadeKind; at: number; yaw: number; pitch: number; power: number; mode: 'normal' | 'lob' | 'running'; target?: Vec3; tolerance: number; bounceTargets: Vec3[]; source?: string; note?: string; trigger?: 'execute' | 'recovery'; origin?: Vec3 }
export interface UtilitySetup { version: 1; ceasefire: boolean; restitution: number; friction: number; inventory: Record<UtilityOwner, UtilityStock>; throws: ThrowPlan[] }
export const EMPTY_STOCK: UtilityStock = { smoke: 0, flash: 0, he: 0, fire: 0, decoy: 0 }
export const DEFAULT_UTILITY: UtilitySetup = { version: 1, ceasefire: true, restitution: 0.45, friction: 0.3, inventory: { A: { ...EMPTY_STOCK }, B: { ...EMPTY_STOCK } }, throws: [] }
/** Original bounded lab tuning in world units/seconds; not calibrated CS2 data. */
export const UTILITY_MODEL = Object.freeze({ id: 'lab-utility-v1', gravity: 320, radius: 2, speed: 500, fuse: 1.5, maxFlight: 6, smokeRadius: 120, smokeHeight: 128, smokeSeconds: 8, flashRange: 1500, flashTicks: 160, heRange: 350, heDamage: 98, fireRadius: 100, fireSeconds: 6, decoyRange: 1200, decoySeconds: 8 })
const bounded = (v: number, a: number, b: number) => Number.isFinite(v) && v >= a && v <= b
const point = (p: Vec3) => Array.isArray(p) && p.length === 3 && p.every(v => bounded(v, -100000, 100000))
export function parseUtilitySetup(value: unknown, owners: string[] = ['A', 'B']): UtilitySetup {
    if (!owners.length || owners.length > 10 || new Set(owners).size !== owners.length || owners.some(id => !/^[A-Za-z0-9-]{1,24}$/.test(id))) throw Error('Invalid utility owners')
    const p = value as UtilitySetup
    if (!p || p.version !== 1 || typeof p.ceasefire !== 'boolean' || !bounded(p.restitution, 0, 0.8) || !bounded(p.friction, 0, 1) || !Array.isArray(p.throws) || p.throws.length > 8) throw Error('Invalid utility setup')
    const stock = (s: UtilityStock): UtilityStock => {
        if (!s || UTILITY_KINDS.some(k => !Number.isInteger(s[k]) || !bounded(s[k], 0, k === 'flash' ? 2 : 1)) || UTILITY_KINDS.reduce((n, k) => n + s[k], 0) > 4) throw Error('Each player can equip up to four test grenades, with at most two flashes')
        return Object.fromEntries(UTILITY_KINDS.map(k => [k, s[k]])) as UtilityStock
    }
    const ids = new Set<string>()
    return { version: 1, ceasefire: p.ceasefire, restitution: p.restitution, friction: p.friction, inventory: Object.fromEntries(owners.map(id => [id, stock(p.inventory?.[id])])), throws: p.throws.map(t => {
        if (!t || typeof t.id !== 'string' || !t.id.length || t.id.length > 80 || ids.has(t.id) || !owners.includes(t.owner) || !UTILITY_KINDS.includes(t.kind) || !bounded(t.at, 0, 18) || !bounded(t.yaw, -180, 180) || !bounded(t.pitch, -85, 85) || !bounded(t.power, 0.1, 1) || !['normal', 'lob', 'running'].includes(t.mode) || !bounded(t.tolerance, 1, 256) || t.target !== undefined && !point(t.target) || !Array.isArray(t.bounceTargets) || t.bounceTargets.length > 8 || t.bounceTargets.some(p => !point(p))) throw Error('Invalid throw plan')
        if (t.source !== undefined && (typeof t.source !== 'string' || t.source.length > 500 || !/^https:\/\//.test(t.source)) || t.note !== undefined && (typeof t.note !== 'string' || t.note.length > 1000)) throw Error('Invalid lineup reference')
        if (t.trigger !== undefined && !['execute', 'recovery'].includes(t.trigger) || t.origin !== undefined && !point(t.origin)) throw Error('Invalid utility trigger or release position')
        if (t.trigger === 'recovery' && (!t.origin || !t.target || !['smoke', 'flash'].includes(t.kind) || t.mode === 'running')) throw Error('Recovery support requires a stationary smoke/flash with authored release and landing positions')
        ids.add(t.id)
        return { id: t.id, owner: t.owner, kind: t.kind, at: t.at, yaw: t.yaw, pitch: t.pitch, power: t.power, mode: t.mode, tolerance: t.tolerance, bounceTargets: t.bounceTargets.map(p => [...p] as Vec3), ...(t.target ? { target: [...t.target] as Vec3 } : {}), ...(t.source ? { source: t.source } : {}), ...(t.note ? { note: t.note } : {}), ...(t.trigger ? { trigger: t.trigger } : {}), ...(t.origin ? { origin: [...t.origin] as Vec3 } : {}) }
    }) }
}
export interface UtilityActor { id: UtilityOwner; position: Vec3; yaw: number; pitch: number; health: number }
export interface UtilityEffect { id: string; owner: UtilityOwner; kind: GrenadeKind; point: Vec3; start: number; end: number; cells?: Vec3[] }
export interface UtilityEvent { tick: number; actor: UtilityOwner; type: 'grenade-throw' | 'grenade-bounce' | 'grenade-detonate' | 'grenade-expire' | 'utility-rejected' | 'flash' | 'blast-damage' | 'fire-damage' | 'decoy-heard'; reason: string; target?: UtilityOwner; to?: Vec3; damage?: number; blindTicks?: number; grenade: string }
export interface UtilityFlight { id: string; owner: UtilityOwner; kind: GrenadeKind; point: Vec3; velocity: Vec3; start: number; state: 'flying' | 'resting' | 'detonated' | 'failed'; bounces: Vec3[]; path: { tick: number; point: Vec3 }[]; grounded: boolean }
export interface UtilityCheck { id: string; state: 'draft' | 'matches-model' | 'mismatch' | 'failed' | 'pending'; landingError?: number; bounceErrors: (number | null)[]; reason: string }
const add = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v + b[i]) as Vec3
const mul = (a: Vec3, k: number): Vec3 => a.map(v => v * k) as Vec3
const dir = (yaw: number, pitch: number): Vec3 => { const y = yaw * Math.PI / 180, p = pitch * Math.PI / 180; return [Math.cos(y) * Math.cos(p), Math.sin(y) * Math.cos(p), Math.sin(p)] }
const dot = (a: Vec3, b: Vec3) => a.reduce((n, v, i) => n + v * b[i], 0)

/** Seven offset rays approximate a radius-two sweep; surfaces without normals fail closed. */
export function grenadeSweep(a: Vec3, b: Vec3, world: CollisionWorld): RayHit | null {
    let closest: RayHit | null = null
    for (const offset of [[0, 0, 0], [2, 0, 0], [-2, 0, 0], [0, 2, 0], [0, -2, 0], [0, 0, 2], [0, 0, -2]] as Vec3[]) {
        const hit = world.raycast(add(a, offset), add(b, offset))
        if (hit && (!closest || hit.fraction < closest.fraction)) closest = { ...hit, point: mix3(a, b, hit.fraction) }
    }
    return closest
}

/** Conservative radial occupancy: every smoke sample must connect to the burst without crossing geometry. */
export function smokeContains(effect: UtilityEffect, p: Vec3, world: CollisionWorld): boolean {
    const r = UTILITY_MODEL.smokeRadius, dz = p[2] - effect.point[2]
    if (dz < -2 || dz > UTILITY_MODEL.smokeHeight || Math.hypot(p[0] - effect.point[0], p[1] - effect.point[1]) > r) return false
    return !world.raycast(add(effect.point, [0, 0, 0.1]), p)
}
export function smokeRay(from: Vec3, to: Vec3, effects: UtilityEffect[], tick: number, world: CollisionWorld): RayHit | null {
    const length = distance3(from, to)
    if (!length) return null
    for (const effect of effects) {
        if (effect.kind !== 'smoke' || tick < effect.start || tick >= effect.end) continue
        // Bound sampling to the segment near the smoke, not the entire weapon range.
        const d = to.map((v, i) => v - from[i]) as Vec3, center = add(effect.point, [0, 0, 64])
        const t = Math.max(0, Math.min(1, dot(center.map((v, i) => v - from[i]) as Vec3, d) / (length * length)))
        if (distance3(mix3(from, to, t), center) > 180) continue
        const start = Math.max(0, t - 180 / length), end = Math.min(1, t + 180 / length), count = Math.max(1, Math.ceil((end - start) * length / 8))
        for (let i = 0; i <= count; i++) { const fraction = start + (end - start) * i / count, p = mix3(from, to, fraction); if (smokeContains(effect, p, world)) return { point: p, fraction, triangle: -2 } }
    }
    return null
}
export function flashExposure(origin: Vec3, actor: UtilityActor, height: number, world: CollisionWorld): number {
    const eye = add(actor.position, [0, 0, height - 8]), distance = distance3(origin, eye)
    if (distance >= UTILITY_MODEL.flashRange || world.raycast(origin, eye)) return 0
    const facing = distance < 0.001 ? 1 : dot(dir(actor.yaw, actor.pitch), origin.map((v, i) => (v - eye[i]) / distance) as Vec3)
    return Math.max(0, 1 - distance / UTILITY_MODEL.flashRange) * (0.15 + 0.85 * Math.max(0, facing))
}
export function blastDamage(origin: Vec3, actor: UtilityActor, height: number, world: CollisionWorld): number {
    const center = add(actor.position, [0, 0, height * 0.5]), distance = distance3(origin, center)
    if (distance >= UTILITY_MODEL.heRange) return 0
    const exposed = [20, height * 0.6, height - 8].filter(z => !world.raycast(origin, add(actor.position, [0, 0, z]))).length / 3
    return Math.floor(UTILITY_MODEL.heDamage * Math.pow(1 - distance / UTILITY_MODEL.heRange, 2) * exposed)
}
function fireCells(origin: Vec3, world: CollisionWorld): Vec3[] {
    const cells: Vec3[] = [], r = UTILITY_MODEL.fireRadius
    for (let x = -r; x <= r; x += 20) for (let y = -r; y <= r; y += 20) {
        if (Math.hypot(x, y) > r) continue
        const p = add(origin, [x, y, 0]), floor = world.raycast(add(p, [0, 0, 12]), add(p, [0, 0, -12]))
        if (!floor || !floor.normal || floor.normal[2] < 0.7 || Math.abs(floor.point[2] - origin[2]) > 10) continue
        const cell = add(floor.point, [0, 0, 2])
        if (!world.raycast(add(origin, [0, 0, 4]), add(cell, [0, 0, 4]))) cells.push(cell)
    }
    return cells
}

export class UtilitySimulation {
    readonly setup: UtilitySetup
    readonly flights: UtilityFlight[] = []
    readonly effects: UtilityEffect[] = []
    readonly inventory: Record<UtilityOwner, UtilityStock>
    private fired = new Set<string>()
    constructor(setup: UtilitySetup, private world: CollisionWorld, private owners: string[] = ['A', 'B']) { this.setup = parseUtilitySetup(setup, owners); this.inventory = Object.fromEntries(owners.map(id => [id, { ...this.setup.inventory[id] }])) }
    /** Add a coordinator-approved throw; inventory and IDs retain the same bounded validation. */
    queue(plan: ThrowPlan) { const next = parseUtilitySetup({ ...this.setup, throws: [...this.setup.throws, plan] }, this.owners); this.setup.throws = next.throws }
    visibility(tick: number): CollisionWorld {
        return { ...this.world, movementHit: (...args) => this.world.movementHit(...args), bodyHit: this.world.bodyHit?.bind(this.world), raycast: (a, b) => this.world.raycast(a, b) || smokeRay(a, b, this.effects, tick, this.world) }
    }
    step(tick: number, actors: UtilityActor[], height: number): UtilityEvent[] {
        const events: UtilityEvent[] = []
        const emit = (f: { id: string; owner: UtilityOwner }, type: UtilityEvent['type'], reason: string, extra: Partial<UtilityEvent> = {}) => events.push({ tick, actor: f.owner, grenade: f.id, type, reason, ...extra })
        for (const plan of this.setup.throws) {
            if (this.fired.has(plan.id) || tick < Math.ceil(plan.at * 64)) continue
            this.fired.add(plan.id)
            const actor = actors.find(a => a.id === plan.owner)
            if (!actor || actor.health <= 0 || !this.inventory[plan.owner][plan.kind]) { emit(plan, 'utility-rejected', 'Throw canceled: player unavailable or grenade not equipped.'); continue }
            const direction = dir(plan.yaw, plan.pitch), eye = add(actor.position, [0, 0, height - 8]), position = add(eye, mul(direction, 12))
            if (grenadeSweep(eye, position, this.world)) { emit(plan, 'utility-rejected', 'Release space is blocked; inventory was not consumed.'); continue }
            this.inventory[plan.owner][plan.kind]--
            const velocity = mul(direction, UTILITY_MODEL.speed * plan.power * (plan.mode === 'lob' ? 0.45 : 1))
            if (plan.mode === 'running') { velocity[0] += Math.cos(plan.yaw * Math.PI / 180) * 120; velocity[1] += Math.sin(plan.yaw * Math.PI / 180) * 120 }
            this.flights.push({ id: plan.id, owner: plan.owner, kind: plan.kind, point: position, velocity, start: tick, state: 'flying', bounces: [], path: [{ tick, point: [...position] }], grounded: false })
            emit(plan, 'grenade-throw', `${plan.kind} released; one equipped grenade consumed.`, { to: [...position] })
        }
        for (const flight of this.flights) {
            if (flight.state === 'detonated' || flight.state === 'failed' || tick === flight.start) continue
            if (flight.state === 'flying') for (let substep = 0; substep < 4; substep++) {
                flight.velocity[2] -= UTILITY_MODEL.gravity / 256
                const next = add(flight.point, mul(flight.velocity, 1 / 256)), hit = grenadeSweep(flight.point, next, this.world)
                if (!hit) { flight.point = next; flight.grounded = false; continue }
                if (!hit.normal || !point(hit.normal) || Math.hypot(...hit.normal) < 0.9) { flight.state = 'failed'; emit(flight, 'utility-rejected', 'Collision normal unavailable; flight stopped instead of guessing a bounce.'); break }
                const normal = hit.normal, speed = dot(flight.velocity, normal)
                flight.point = add(hit.point, mul(normal, 0.05))
                flight.velocity = add(mul(flight.velocity, 1 - this.setup.friction), mul(normal, -(1 - this.setup.friction + this.setup.restitution) * speed))
                flight.grounded = normal[2] > 0.7
                if (flight.bounces.length >= 64) { flight.state = 'failed'; emit(flight, 'utility-rejected', 'Bounce budget exceeded; inspect collision or tuning.'); break }
                flight.bounces.push([...flight.point]); emit(flight, 'grenade-bounce', `Bounce ${flight.bounces.length} against a resolved surface normal.`, { to: [...flight.point] })
                if (flight.grounded && (Math.hypot(...flight.velocity) < 35 || flight.kind === 'fire')) { flight.state = 'resting'; flight.velocity = [0, 0, 0]; break }
            }
            flight.path.push({ tick, point: [...flight.point] })
            if (flight.state === 'failed') continue
            const age = (tick - flight.start) / 64, timed = age >= UTILITY_MODEL.fuse
            const detonate = flight.kind === 'flash' || flight.kind === 'he' ? timed : flight.kind === 'fire' ? flight.grounded && age >= 0.05 : timed && flight.state === 'resting' && flight.grounded
            if (detonate) {
                flight.state = 'detonated'
                const seconds = flight.kind === 'smoke' ? UTILITY_MODEL.smokeSeconds : flight.kind === 'fire' ? UTILITY_MODEL.fireSeconds : flight.kind === 'decoy' ? UTILITY_MODEL.decoySeconds : 0
                const effect: UtilityEffect = { id: flight.id, owner: flight.owner, kind: flight.kind, point: [...flight.point], start: tick, end: tick + seconds * 64 }
                if (flight.kind === 'fire') effect.cells = fireCells(effect.point, this.world)
                if (flight.kind === 'smoke') {
                    effect.cells = []
                    for (let x = -108; x <= 108; x += 24) for (let y = -108; y <= 108; y += 24) {
                        const p = add(effect.point, [x, y, 64])
                        if ([[0, 0, 0], [-10, -10, 0], [10, -10, 0], [-10, 10, 0], [10, 10, 0]].every(o => smokeContains(effect, add(p, o as Vec3), this.world))) effect.cells.push(p)
                    }
                }
                this.effects.push(effect)
                emit(flight, 'grenade-detonate', `${flight.kind} ${seconds ? `active for ${seconds} seconds` : 'burst resolved'}.`, { to: [...flight.point] })
            } else if (age >= UTILITY_MODEL.maxFlight) { flight.state = 'failed'; emit(flight, 'utility-rejected', 'No supported detonation before flight timeout; missing floor or unsettled trajectory.') }
        }
        const vision = this.visibility(tick)
        for (const effect of this.effects) {
            if (tick === effect.end && effect.end > effect.start) emit(effect, 'grenade-expire', `${effect.kind} expired.`)
            for (const actor of actors) {
                if (actor.health <= 0) continue
                if (effect.kind === 'flash' && tick === effect.start) {
                    const exposure = flashExposure(effect.point, actor, height, vision), blindTicks = Math.ceil(exposure * UTILITY_MODEL.flashTicks)
                    if (blindTicks) emit(effect, 'flash', `Flash exposure ${Math.round(exposure * 100)}%; facing, distance and cover checked.`, { target: actor.id, blindTicks })
                }
                if (effect.kind === 'he' && tick === effect.start) { const damage = blastDamage(effect.point, actor, height, this.world); if (damage) emit(effect, 'blast-damage', 'HE exposure resolved against three body samples and range; armor applies next.', { target: actor.id, damage }) }
                if (tick < effect.start || tick >= effect.end) continue
                if (effect.kind === 'fire' && (tick - effect.start) % 16 === 0) {
                    const radius = Math.min(UTILITY_MODEL.fireRadius, 20 + (tick - effect.start) / 64 * 60)
                    if (distance3(actor.position, effect.point) <= radius + 16 && effect.cells?.some(p => Math.abs(p[2] - actor.position[2]) < 12 && Math.hypot(p[0] - actor.position[0], p[1] - actor.position[1]) <= 16) && !this.world.raycast(add(effect.point, [0, 0, 8]), add(actor.position, [0, 0, 8]))) emit(effect, 'fire-damage', 'Standing in a connected, supported fire cell; 6 damage this quarter-second.', { target: actor.id, damage: 6 })
                }
                if (effect.kind === 'decoy' && actor.id !== effect.owner && (tick - effect.start) % 32 === 0) {
                    const ear = add(actor.position, [0, 0, height - 8]), blocked = !!this.world.raycast(effect.point, ear), range = UTILITY_MODEL.decoyRange * (blocked ? 0.45 : 1)
                    if (distance3(effect.point, ear) <= range) emit(effect, 'decoy-heard', 'Unconfirmed gunfire cue; coarse location only, no enemy identity.', { target: actor.id, to: effect.point.map(v => Math.round(v / 64) * 64) as Vec3 })
                }
            }
        }
        return events
    }
    checks(): UtilityCheck[] {
        return this.setup.throws.map(plan => {
            const flight = this.flights.find(f => f.id === plan.id), bounceErrors = plan.bounceTargets.map((p, i) => flight?.bounces[i] ? distance3(p, flight.bounces[i]) : null)
            if (!flight) return { id: plan.id, state: this.fired.has(plan.id) ? 'failed' : 'pending', bounceErrors, reason: this.fired.has(plan.id) ? 'Throw rejected; inspect inventory and release space.' : 'Scheduled throw has not occurred.' }
            if (flight.state !== 'detonated') return { id: plan.id, state: flight.state === 'failed' ? 'failed' : 'pending', bounceErrors, reason: 'Trajectory did not reach a supported detonation in this replay.' }
            const landingError = plan.target ? distance3(plan.target, flight.point) : undefined
            const matches = (landingError === undefined || landingError <= plan.tolerance) && bounceErrors.every(n => n !== null && n <= plan.tolerance)
            return { id: plan.id, state: landingError === undefined && !bounceErrors.length ? 'draft' : matches ? 'matches-model' : 'mismatch', ...(landingError !== undefined ? { landingError } : {}), bounceErrors, reason: matches ? 'Computed trajectory only; real-map lineup review still required.' : 'Landing or bounce target is outside the chosen tolerance.' }
        })
    }
}
