import type { Contact } from './team-model'
import type { CollisionWorld } from './geometry'
import { distance3, type Vec3 } from './types'
import { flashExposure, smokeRay, UtilitySimulation, UTILITY_MODEL, type ThrowPlan, type UtilityActor, type UtilitySetup } from './utility'

/** Frozen observations only: callers must not pass live opponent bodies. */
export function recoveryThreat(contacts: Iterable<Contact>, objective: Vec3, tick: number): Contact | undefined {
    return [...contacts].filter(c => c.confidence > 0.5 && tick >= c.received && tick - c.seen <= 128 && distance3(c.point, objective) <= 900)
        .sort((a, b) => b.seen - a.seen || distance3(a.point, objective) - distance3(b.point, objective) || a.enemy.localeCompare(b.enemy))[0]
}

/** Forecast uses copied inventory and known geometry. It never spends a live grenade. */
export function checkRecoveryThrow(plan: ThrowPlan, setup: UtilitySetup, owner: UtilityActor, allies: UtilityActor[], bomb: Vec3, threat: Contact, world: CollisionWorld, height: number): { allowed: boolean; reason: string } {
    const held = (reason: string) => ({ allowed: false, reason })
    if (!plan.origin || !plan.target || !['smoke', 'flash'].includes(plan.kind) || plan.mode === 'running') return held('Recovery throw needs a stationary smoke/flash with release and landing positions.')
    if (distance3(owner.position, plan.origin) > 8) return held('Player is not at the authored release position.')
    if (!setup.inventory[owner.id]?.[plan.kind]) return held('Required grenade is not equipped.')
    if (distance3(plan.target, bomb) > 600) return held('Authored landing is too far from the recovery.')
    const forecast = new UtilitySimulation({ ...setup, inventory: { [owner.id]: { ...setup.inventory[owner.id] } }, throws: [{ ...plan, at: 0 }] }, world, [owner.id])
    for (let tick = 0; tick <= UTILITY_MODEL.maxFlight * 64; tick++) {
        forecast.step(tick, [owner], height)
        if (forecast.effects.length || forecast.flights[0]?.state === 'failed' || tick === 0 && !forecast.flights.length) break
    }
    const effect = forecast.effects[0]
    if (!effect || forecast.checks()[0]?.state !== 'matches-model') return held('Predicted flight does not match the authored landing and bounce targets.')
    if (plan.kind === 'smoke') {
        const pickupEye: Vec3 = [bomb[0], bomb[1], bomb[2] + height - 8]
        if (!smokeRay(threat.point, pickupEye, [effect], effect.start, world)) return held('Predicted smoke does not screen the known threat from the pickup.')
    } else {
        if (distance3(effect.point, threat.point) > 500 || world.raycast(effect.point, threat.point)) return held('Predicted flash is not exposed to the reported threat area.')
        if (allies.some(a => a.health > 0 && flashExposure(effect.point, a, height, world) > 0.1)) return held('Predicted flash exposes a teammate; keep it equipped.')
    }
    return { allowed: true, reason: 'Authored recovery throw passed release, trajectory and current friendly-position checks.' }
}
