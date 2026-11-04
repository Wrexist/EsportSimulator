/**
 * SQUAD-10: the snapshot gives every pro the same leadership (50, or 78 for
 * an IGL), endurance 80, health 90 and loyalty 80. Those are placeholders,
 * not traits: the captain picker offered four "leader 50" players and every
 * profile read Health 90 / Endurance 80 / Loyalty 80.
 *
 * A new career (data/snapshot-loader.ts) and every load (store loadGame)
 * replace a value that is still exactly the placeholder with a derived one:
 * leadership from tactics, age and an id hash; endurance and health from age
 * and a hash; loyalty from a hash. Each spread is centred on the old value,
 * so the averages the balance was tuned on hold. Role thresholds hold too: an
 * IGL keeps leadership above the reconciler's 75, everyone else stays below
 * it (engine/role-reconciler.ts), so no role changes.
 *
 * Deterministic (hashes only, no RNG draws) and idempotent: a derived value
 * never equals the placeholder, so a second pass changes nothing.
 * Legends keep their own values.
 */

import type { PlayerSaveData } from "./save-types"
import { hash01 } from "./personality"

export const SNAPSHOT_PLACEHOLDERS = {
    leader: 50,
    iglLeader: 78,
    endurance: 80,
    health: 90,
    loyalty: 80,
} as const

/** Triangular spread in [-width, width] from two id hashes. */
function spread(id: string, salt: string, width: number): number {
    return (hash01(`${salt}|${id}`) + hash01(`${salt}-b|${id}`) - 1) * width
}

function settle(value: number, min: number, max: number, placeholder: number): number {
    const v = Math.max(min, Math.min(max, Math.round(value)))
    if (v !== placeholder) return v
    return v + 1 <= max ? v + 1 : v - 1
}

type Source = Pick<PlayerSaveData, "id"> & Partial<Pick<PlayerSaveData, "age" | "tactic">>

/** Leadership for a player still on the plain placeholder (50): stays under the IGL bar. */
export function deriveLeader(p: Source): number {
    const age = p.age ?? 23
    const tactic = p.tactic ?? 55
    return settle(50 + (tactic - 55) * 0.35 + (age - 23) * 1.2 + spread(p.id, "leader", 14), 25, 74, SNAPSHOT_PLACEHOLDERS.leader)
}

/** Leadership for a player still on the IGL placeholder (78): stays above the IGL bar. */
export function deriveIglLeader(p: Source): number {
    const age = p.age ?? 24
    return settle(76 + hash01(`igl-leader|${p.id}`) * 10 + Math.max(0, age - 24) * 0.5, 76, 92, SNAPSHOT_PLACEHOLDERS.iglLeader)
}

export function deriveEndurance(p: Source): number {
    const age = p.age ?? 23
    return settle(80 + spread(p.id, "endurance", 12) - Math.max(0, age - 27) * 1.5, 55, 95, SNAPSHOT_PLACEHOLDERS.endurance)
}

export function deriveHealth(p: Source): number {
    const age = p.age ?? 23
    return settle(90 + spread(p.id, "health", 8) - Math.max(0, age - 28), 70, 99, SNAPSHOT_PLACEHOLDERS.health)
}

export function deriveLoyalty(p: Source): number {
    return settle(80 + spread(p.id, "loyalty", 15), 50, 98, SNAPSHOT_PLACEHOLDERS.loyalty)
}

/** Still carries the whole snapshot placeholder set (endurance, health and loyalty). */
export function hasPlaceholderAttributes(p: Partial<PlayerSaveData>): boolean {
    return p.endurance === SNAPSHOT_PLACEHOLDERS.endurance
        && p.health === SNAPSHOT_PLACEHOLDERS.health
        && p.loyalty === SNAPSHOT_PLACEHOLDERS.loyalty
}

/**
 * Give every player still on the snapshot placeholder set derived values
 * (leadership too, when it is still 50 or 78). A player any of whose three
 * values has moved (an injury, an event) is left alone, so a load never
 * undoes what happened in the career. Returns how many players changed.
 */
export function spreadPlaceholderAttributes(players: PlayerSaveData[]): number {
    let changed = 0
    for (const p of players) {
        if (!p || typeof p.id !== "string" || p.isLegendary || !hasPlaceholderAttributes(p)) continue
        if (p.leader === SNAPSHOT_PLACEHOLDERS.leader) p.leader = deriveLeader(p)
        else if (p.leader === SNAPSHOT_PLACEHOLDERS.iglLeader) p.leader = deriveIglLeader(p)
        p.endurance = deriveEndurance(p)
        p.health = deriveHealth(p)
        p.loyalty = deriveLoyalty(p)
        changed++
    }
    return changed
}
