import { SeededRNG } from '../rng'
import { recoverRecoil, settledBurstDelay } from './fire-control'
import type { CollisionWorld } from './geometry'
import { distance3, mix3, type Vec3 } from './types'
import type { MovementFrame } from './movement'
import { UtilitySimulation, UTILITY_MODEL, type UtilitySetup, type UtilityStock, type UtilityEffect, type UtilityEvent, type UtilityFlight, type UtilityCheck } from './utility'

export type ActorId = 'A' | 'B'
export interface CombatProfile { yaw: number; pitch: number; reactionMs: number; aimError: number; armor: number; helmet: boolean; ammo: number }
export interface EncounterSettings { seed: number; seconds: number; fov: number; approach: boolean; a: CombatProfile; b: CombatProfile }
export const DEFAULT_ENCOUNTER: EncounterSettings = {
    seed: 11, seconds: 8, fov: 110, approach: false,
    a: { yaw: 0, pitch: 0, reactionMs: 250, aimError: 0.35, armor: 100, helmet: true, ammo: 30 },
    b: { yaw: 180, pitch: 0, reactionMs: 300, aimError: 0.5, armor: 100, helmet: true, ammo: 30 },
}
/** Original lab tuning, not extracted or calibrated CS2 weapon data. World units, seconds and degrees. */
export const LAB_RIFLE = Object.freeze({ id: 'lab-rifle-v1', damage: 34, headMultiplier: 4, range: 4096, falloffPer500: 0.98, armorAbsorption: 0.35, magazine: 30, reserve: 60, shotTicks: 7, burstSize: 3, burstPauseTicks: 14, reloadTicks: 144, recoilDegrees: 0.55, turnDegreesPerSecond: 300, memoryTicks: 128 })
export function parseEncounterSettings(value: unknown): EncounterSettings {
    const p = value as EncounterSettings
    const number = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max
    const profile = (a: CombatProfile): CombatProfile => {
        if (!a || !number(a.yaw, -180, 180) || !number(a.pitch, -89, 89) || !number(a.reactionMs, 0, 2000) || !number(a.aimError, 0, 5) || !number(a.armor, 0, 100) || !Number.isInteger(a.ammo) || !number(a.ammo, 0, 30) || typeof a.helmet !== 'boolean') throw Error('Invalid encounter player settings')
        return { yaw: a.yaw, pitch: a.pitch, reactionMs: a.reactionMs, aimError: a.aimError, armor: a.armor, helmet: a.helmet, ammo: a.ammo }
    }
    if (!p || !Number.isInteger(p.seed) || !number(p.seed, 0, 0xffffffff) || !number(p.seconds, 1, 20) || !number(p.fov, 30, 160) || typeof p.approach !== 'boolean') throw Error('Invalid encounter settings')
    return { seed: p.seed, seconds: p.seconds, fov: p.fov, approach: p.approach, a: profile(p.a), b: profile(p.b) }
}
export interface Knowledge { point: Vec3; seenTick: number; confidence: number; uncertainty: number; visible: boolean }
export type CombatEventType = 'sight' | 'lost' | 'forgot' | 'react' | 'shot' | 'obstruction' | 'miss' | 'damage' | 'death' | 'reload-start' | 'reload-end' | 'movement-blocked' | UtilityEvent['type']
export interface CombatEvent { tick: number; time: number; type: CombatEventType; actor: ActorId; target?: ActorId; reason: string; from?: Vec3; to?: Vec3; damage?: number; region?: 'head' | 'body'; spread?: number; grenade?: string; blindTicks?: number }
export interface CombatView { id: ActorId; position: Vec3; yaw: number; pitch: number; speed: number; health: number; armor: number; ammo: number; reserve: number; state: 'holding' | 'reacting' | 'tracking' | 'reloading' | 'dead'; knowledge: Knowledge | null; utility?: { inventory: UtilityStock; blindUntil: number; heard: { point: Vec3; tick: number; lastTick: number } | null } }
export interface CombatFrame { tick: number; time: number; actors: [CombatView, CombatView]; grenades?: { id: string; owner: ActorId; kind: string; point: Vec3; state: string }[] }
export interface EncounterResult { version: 1; weapon: typeof LAB_RIFLE; seed: number; frames: CombatFrame[]; events: CombatEvent[]; outcome: 'A' | 'B' | 'trade' | 'timeout'; reason: string; utility?: { model: typeof UTILITY_MODEL; effects: UtilityEffect[]; flights: UtilityFlight[]; checks: UtilityCheck[] } }
export interface EncounterInput { settings: EncounterSettings; a: Vec3; b: Vec3; height: 54 | 72; tracks?: Partial<Record<ActorId, MovementFrame[]>>; utility?: UtilitySetup }
type Actor = CombatView & { profile: CombatProfile; acquired: number | null; ready: boolean; reloadEnd: number; nextShot: number; burst: number; recoil: number; rng: SeededRNG; stopped: boolean; blindUntil: number; heard: { point: Vec3; tick: number; lastTick: number } | null }
const rad = Math.PI / 180
const copy = (p: Vec3): Vec3 => [...p]
const addHeight = (p: Vec3, z: number): Vec3 => [p[0], p[1], p[2] + z]
const angleDelta = (to: number, from: number) => ((to - from + 540) % 360 + 360) % 360 - 180
const direction = (yaw: number, pitch: number): Vec3 => [Math.cos(yaw * rad) * Math.cos(pitch * rad), Math.sin(yaw * rad) * Math.cos(pitch * rad), Math.sin(pitch * rad)]
const angles = (from: Vec3, to: Vec3) => ({ yaw: Math.atan2(to[1] - from[1], to[0] - from[0]) / rad, pitch: Math.atan2(to[2] - from[2], Math.hypot(to[0] - from[0], to[1] - from[1])) / rad })
const eye = (p: Vec3, h: number) => addHeight(p, h - 8)
const snapshot = (a: Actor): CombatView => ({ id: a.id, position: copy(a.position), yaw: a.yaw, pitch: a.pitch, speed: a.speed, health: a.health, armor: a.armor, ammo: a.ammo, reserve: a.reserve, state: a.state, knowledge: a.knowledge ? { ...a.knowledge, point: copy(a.knowledge.point) } : null })

/** The perception boundary is the only decision-facing reader of the opponent's world position. */
export function visibleSample(observer: Pick<CombatView, 'position' | 'yaw' | 'pitch'>, target: Vec3, height: number, fov: number, world: CollisionWorld): Vec3 | null {
    const from = eye(observer.position, height), facing = direction(observer.yaw, observer.pitch)
    const samples = [addHeight(target, height - 8), addHeight(target, height * 0.6), [target[0] - 8, target[1], target[2] + height * 0.6] as Vec3, [target[0] + 8, target[1], target[2] + height * 0.6] as Vec3]
    for (const to of samples) {
        const distance = distance3(from, to)
        if (distance < 1 || distance > LAB_RIFLE.range) continue
        const dot = facing.reduce((sum, d, i) => sum + d * (to[i] - from[i]) / distance, 0)
        if (dot < Math.cos(fov * rad / 2) || world.raycast(from, to)) continue
        return copy(to)
    }
    return null
}

/** Analytic sphere and torso box; this is a declared approximation, not a character mesh. */
export function bodyIntersection(from: Vec3, to: Vec3, feet: Vec3, height: number): { fraction: number; region: 'head' | 'body' } | null {
    const d = to.map((v, i) => v - from[i]) as Vec3, head = addHeight(feet, height - 8)
    const offset = from.map((v, i) => v - head[i]), aa = d.reduce((s, v) => s + v * v, 0)
    const bb = 2 * offset.reduce((s, v, i) => s + v * d[i], 0), cc = offset.reduce((s, v) => s + v * v, 0) - 36
    if (aa < 1e-12) return null
    const disc = bb * bb - 4 * aa * cc, sphere = disc >= 0 ? (-bb - Math.sqrt(disc)) / (2 * aa) : Infinity
    let lo = 0, hi = 1, box = true
    const min = [feet[0] - 12, feet[1] - 12, feet[2] + 2], max = [feet[0] + 12, feet[1] + 12, feet[2] + height - 16]
    for (let i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < 1e-10) { if (from[i] < min[i] || from[i] > max[i]) box = false; continue }
        const a = (min[i] - from[i]) / d[i], b = (max[i] - from[i]) / d[i]
        lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b))
    }
    box = box && lo <= hi
    if (sphere >= 0 && sphere <= 1 && (!box || sphere < lo)) return { fraction: sphere, region: 'head' }
    return box ? { fraction: lo, region: 'body' } : null
}

/** No penetration: opaque triangle at or before a hit volume always wins, including floor slabs. */
export function traceShot(from: Vec3, to: Vec3, target: Vec3, height: number, world: CollisionWorld) {
    const body = bodyIntersection(from, to, target, height), wall = world.raycast(from, to)
    if (wall && (!body || wall.fraction <= body.fraction + 1e-7)) return { type: 'obstruction' as const, point: wall.point }
    if (body) return { type: 'hit' as const, point: mix3(from, to, body.fraction), region: body.region }
    return { type: 'miss' as const, point: to }
}

/** Bounded duel. Sense both, decide both, then apply both shots: a same-tick lethal trade is legal. */
export function simulateEncounter(input: EncounterInput, world: CollisionWorld): EncounterResult {
    const settings = parseEncounterSettings(input.settings), h = input.height
    const validPoint = (p: Vec3) => Array.isArray(p) && p.length === 3 && p.every(v => Number.isFinite(v) && Math.abs(v) <= 100_000)
    if (![54, 72].includes(h) || !validPoint(input.a) || !validPoint(input.b) || distance3(input.a, input.b) < 40) throw Error('Choose two separated encounter positions')
    for (const [id, start] of [['A', input.a], ['B', input.b]] as const) {
        if (world.bodyHit?.(start, h)) throw Error(`Player ${id} starts inside geometry`)
        const track = input.tracks?.[id]
        if (track && (track.length > 1281 || !track.length || distance3(track[0].position, start) > 0.01 || track.some((f, i) => !validPoint(f.position) || f.time !== i / 64))) throw Error('Invalid fixed-step encounter movement track')
    }
    const utility = input.utility ? new UtilitySimulation(input.utility, world) : null
    const create = (id: ActorId, p: Vec3, profile: CombatProfile): Actor => ({ id, position: copy(p), yaw: profile.yaw, pitch: profile.pitch, speed: 0, health: 100, armor: profile.armor, ammo: profile.ammo, reserve: LAB_RIFLE.reserve, state: 'holding', knowledge: null, profile, acquired: null, ready: false, reloadEnd: 0, nextShot: 0, burst: 0, recoil: 0, rng: new SeededRNG((settings.seed ^ (id === 'A' ? 0x12345678 : 0x76543210)) >>> 0), stopped: false, blindUntil: 0, heard: null })
    const actors: [Actor, Actor] = [create('A', input.a, settings.a), create('B', input.b, settings.b)]
    const events: CombatEvent[] = [], frames: CombatFrame[] = []
    const emit = (tick: number, actor: ActorId, type: CombatEventType, reason: string, extra: Partial<CombatEvent> = {}) => events.push({ tick, time: tick / 64, actor, type, reason, ...extra })
    let outcome: EncounterResult['outcome'] = 'timeout'
    for (let tick = 0; tick <= Math.floor(settings.seconds * 64); tick++) {
        // Scenario movement is scripted independently of hidden opponent positions; clearance is checked again.
        for (const a of actors) {
            a.speed = 0
            const next = input.tracks?.[a.id]?.[tick]
            if (tick > 0 && next && !a.stopped && a.health > 0) {
                const length = distance3(a.position, next.position)
                if (length > 300 / 64 || world.movementHit(a.position, next.position, h) || world.bodyHit?.(next.position, h)) {
                    a.stopped = true; emit(tick, a.id, 'movement-blocked', 'Scripted movement failed speed or body clearance; stopped without teleporting.')
                } else { a.speed = length * 64; a.position = copy(next.position) }
            }
        }
        // Grenade effects resolve before this tick's perception and gun decisions; scheduled throws are consumed once.
        for (const event of utility?.step(tick, actors, h) || []) {
            const target = actors.find(a => a.id === event.target)
            if (target && event.type === 'flash') target.blindUntil = Math.max(target.blindUntil, tick + (event.blindTicks || 0))
            if (target && event.type === 'decoy-heard' && event.to) {
                // Repeated pulses refresh the cue position but do not continually restart its reaction clock.
                if (!target.heard || distance3(target.heard.point, event.to) > 1 || tick - target.heard.lastTick >= 128) target.heard = { point: copy(event.to), tick, lastTick: tick }
                else target.heard.lastTick = tick
            }
            let damage = event.damage
            if (target && damage) {
                const absorb = event.type === 'blast-damage' ? Math.min(target.armor, damage * 0.35) : 0
                damage = Math.ceil(damage - absorb); target.armor = Math.max(0, target.armor - Math.ceil(absorb)); target.health = Math.max(0, target.health - damage)
            }
            // A hearing observation belongs to its listener, not to the decoy owner.
            emit(tick, (event.type === 'decoy-heard' ? event.target! : event.actor) as ActorId, event.type, event.reason, { grenade: event.grenade, ...(event.blindTicks !== undefined ? { blindTicks: event.blindTicks } : {}), ...(event.target ? { target: event.target as ActorId } : {}), ...(event.to ? { to: copy(event.to) } : {}), ...(damage !== undefined ? { damage } : {}) })
        }
        for (const a of actors) if (a.heard && tick - a.heard.lastTick >= 128) a.heard = null
        const vision = utility?.visibility(tick) || world
        for (const [i, a] of actors.entries()) {
            if (a.health <= 0) continue
            const enemy = actors[1 - i], sample = enemy.health > 0 && tick >= a.blindUntil ? visibleSample(a, enemy.position, h, settings.fov, vision) : null
            if (sample) {
                if (!a.knowledge?.visible) { a.acquired = tick; a.ready = false; emit(tick, a.id, 'sight', 'Opponent body sample enters the field of view with clear line of sight.', { target: enemy.id, to: copy(sample) }) }
                a.knowledge = { point: sample, seenTick: tick, confidence: 1, uncertainty: 0, visible: true }
            } else if (a.knowledge) {
                if (a.knowledge.visible) { emit(tick, a.id, 'lost', 'Visibility interrupted; reaction resets and last-seen point freezes.'); a.acquired = null; a.ready = false }
                const age = tick - a.knowledge.seenTick
                a.knowledge = age >= LAB_RIFLE.memoryTicks ? null : { ...a.knowledge, visible: false, confidence: 1 - age / LAB_RIFLE.memoryTicks, uncertainty: age / 64 * 220 }
                if (!a.knowledge) emit(tick, a.id, 'forgot', 'Last-seen information expired after two seconds.')
            }
        }
        const shots: { actor: Actor; target: Actor; from: Vec3; to: Vec3 }[] = []
        for (const [i, a] of actors.entries()) {
            if (a.health <= 0) continue
            a.recoil = recoverRecoil(a.recoil)
            if (a.reloadEnd && tick >= a.reloadEnd) { const loaded = Math.min(LAB_RIFLE.magazine - a.ammo, a.reserve); a.ammo += loaded; a.reserve -= loaded; a.reloadEnd = 0; a.burst = 0; emit(tick, a.id, 'reload-end', `Reload complete: ${a.ammo} rounds, ${a.reserve} reserve.`) }
            if (!a.ammo && a.reserve > 0 && !a.reloadEnd) { a.reloadEnd = tick + LAB_RIFLE.reloadTicks; emit(tick, a.id, 'reload-start', 'Empty magazine; cannot fire during the 2.25 second reload.') }
            a.state = a.reloadEnd ? 'reloading' : a.knowledge?.visible ? a.ready ? 'tracking' : 'reacting' : 'holding'
            if (a.acquired !== null && !a.ready && tick - a.acquired >= Math.ceil(a.profile.reactionMs * 64 / 1000)) { a.ready = true; if (!a.reloadEnd) a.state = 'tracking'; emit(tick, a.id, 'react', 'Continuous visual evidence satisfied the reaction delay.') }
            // Decision/aim reads only this actor's knowledge, never the opponent's hidden position.
            if (a.knowledge && a.ready) {
                const desired = angles(eye(a.position, h), a.knowledge.point), turn = LAB_RIFLE.turnDegreesPerSecond / 64
                a.yaw += Math.max(-turn, Math.min(turn, angleDelta(desired.yaw, a.yaw)))
                a.pitch += Math.max(-turn, Math.min(turn, desired.pitch - a.pitch))
            }
            if (!a.knowledge?.visible && a.heard && tick - a.heard.tick >= Math.ceil(a.profile.reactionMs * 64 / 1000)) {
                const desired = angles(eye(a.position, h), a.heard.point), turn = LAB_RIFLE.turnDegreesPerSecond / 64
                a.yaw += Math.max(-turn, Math.min(turn, angleDelta(desired.yaw, a.yaw)))
            }
            if (utility?.setup.ceasefire || tick < a.blindUntil || !a.ready || !a.knowledge?.visible || a.reloadEnd || !a.ammo || tick < a.nextShot) continue
            const desired = angles(eye(a.position, h), a.knowledge.point)
            if (Math.abs(angleDelta(desired.yaw, a.yaw)) > 2 || Math.abs(desired.pitch - a.pitch) > 2) continue
            const spread = (h === 54 ? 0.08 : 0.12) + a.profile.aimError + a.speed / 220 * 2.5
            const aim = direction(a.yaw + a.rng.range(-spread, spread), a.pitch + a.rng.range(-spread, spread) + a.recoil)
            const from = eye(a.position, h), to = from.map((v, axis) => v + aim[axis] * LAB_RIFLE.range) as Vec3
            a.ammo--; a.burst++; a.recoil += LAB_RIFLE.recoilDegrees; a.nextShot = tick + LAB_RIFLE.shotTicks
            if (a.burst >= LAB_RIFLE.burstSize) { a.nextShot = tick + settledBurstDelay(a.recoil, LAB_RIFLE.shotTicks, LAB_RIFLE.burstPauseTicks); a.burst = 0 }
            emit(tick, a.id, 'shot', `Fired with ${a.ammo} rounds left; movement and recoil affect the ray.`, { from, to, spread })
            shots.push({ actor: a, target: actors[1 - i], from, to })
        }
        // Physical resolution may read world truth. Shot rays are already fixed by the decision phase.
        for (const shot of shots) {
            const { actor: a, target, from, to } = shot, hit = traceShot(from, to, target.position, h, world)
            if (hit.type !== 'hit') { emit(tick, a.id, hit.type, hit.type === 'obstruction' ? 'Opaque geometry stopped the bullet. No penetration is modeled.' : 'The resolved ray missed the opponent hit volumes.', { from, to: hit.point }); continue }
            const raw = LAB_RIFLE.damage * (hit.region === 'head' ? LAB_RIFLE.headMultiplier : 1) * Math.pow(LAB_RIFLE.falloffPer500, distance3(from, hit.point) / 500)
            const absorb = hit.region === 'body' || target.profile.helmet ? Math.min(target.armor, raw * LAB_RIFLE.armorAbsorption) : 0
            const damage = Math.ceil(raw - absorb); target.armor = Math.max(0, target.armor - Math.ceil(absorb)); target.health = Math.max(0, target.health - damage)
            emit(tick, a.id, 'damage', `${hit.region} hit; ${damage} damage after range and armor.`, { target: target.id, damage, region: hit.region, from, to: hit.point })
        }
        for (const a of actors) if (a.health <= 0 && a.state !== 'dead') { a.state = 'dead'; a.speed = 0; emit(tick, a.id, 'death', utility ? 'Health reached zero from resolved combat or utility damage.' : 'Health reached zero from resolved shot damage.') }
        frames.push({ tick, time: tick / 64, actors: actors.map(a => ({ ...snapshot(a), ...(utility ? { utility: { inventory: { ...utility.inventory[a.id] }, blindUntil: a.blindUntil, heard: a.heard ? { ...a.heard, point: copy(a.heard.point) } : null } } : {}) })) as [CombatView, CombatView], ...(utility ? { grenades: utility.flights.map(f => ({ id: f.id, owner: f.owner as ActorId, kind: f.kind, point: copy(f.point), state: f.state })) } : {}) })
        if (actors.some(a => a.health <= 0)) { outcome = actors.every(a => a.health <= 0) ? 'trade' : actors[0].health > 0 ? 'A' : 'B'; if (!utility) break }
    }
    return { version: 1, weapon: LAB_RIFLE, seed: settings.seed, frames, events, outcome, reason: outcome === 'timeout' ? 'Time limit reached with both players alive.' : outcome === 'trade' ? utility ? 'Both players died from resolved combat or utility damage.' : 'Both players fired lethal shots in the same simulation tick.' : `Player ${outcome} survived resolved damage.`, ...(utility ? { utility: { model: UTILITY_MODEL, flights: utility.flights, effects: utility.effects, checks: utility.checks() } } : {}) }
}
