/**
 * HE grenade damage model, shared by the script-v1 resolver (how much a throw
 * took) and the round script (where it must have landed).
 *
 * CS2: 98 base damage, falling off linearly to 0 at the edge of its reach
 * (~350 u ≈ 6.8 map-% at 51 u per map-%). Armour keeps HE_ARMOUR_SHARE of it.
 * Walls and floors stop it: an obstructed target or one on another floor takes
 * nothing. Distances are map-%. See docs/revamp/TUNING_COMBAT_2026-10.md.
 */

export const HE_DAMAGE_RADIUS = 6.8
export const HE_MAX_DAMAGE = 98
/** Armour keeps this share of HE damage (CS2 armour penetration 57.5 %; the resolver has always used 0.6). */
export const HE_ARMOUR_SHARE = 0.6

export interface HeTarget {
    /** Map-% from the detonation to the target. */
    distance: number
    armoured: boolean
    /** Same floor as the detonation (default true). */
    sameFloor?: boolean
    /** A wall between the detonation and the target (default false). */
    obstructed?: boolean
}

/** HP an HE takes from one target (before the target's own HP caps it). 0 = a miss. */
export function heDamage(target: HeTarget): number {
    const { distance, armoured, sameFloor = true, obstructed = false } = target
    if (!sameFloor || obstructed || !(distance >= 0) || distance >= HE_DAMAGE_RADIUS) return 0
    const raw = HE_MAX_DAMAGE * (1 - distance / HE_DAMAGE_RADIUS)
    return Math.round(raw * (armoured ? HE_ARMOUR_SHARE : 1))
}

/**
 * Landing error of a thrown HE from its target, in map-%: `roll` is a uniform
 * draw in [0, 1), `grenades` the thrower's 0–100 utility skill. Calibrated so
 * the mean damage per throw matches the old 12–45 HP roll (28.5 HP raw) for an
 * average thrower, but about a quarter of throws land too far and miss.
 */
export function heLandingDistance(roll: number, grenades: number): number {
    const lo = 0.2 - (grenades - 50) * 0.003
    return HE_DAMAGE_RADIUS * Math.max(0, lo + 1.1 * roll)
}

/** Inverse of `heDamage` for a hit: the distance a throw that took `dmg` HP landed at (armour assumed when unknown). */
export function heDistanceFor(dmg: number, armoured = true): number {
    const raw = Math.min(HE_MAX_DAMAGE, dmg / (armoured ? HE_ARMOUR_SHARE : 1))
    return HE_DAMAGE_RADIUS * (1 - raw / HE_MAX_DAMAGE)
}
