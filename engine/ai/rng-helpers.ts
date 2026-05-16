/**
 * RNG helpers shared between AIManager and the extracted AI subsystem
 * modules (infrastructure.ts, transfer-logic.ts when extracted, etc.).
 *
 * `aiRoll` wraps `rng.next()` with a module-level fallback RNG so callers
 * don't have to thread an RNG through every helper. `hashTeamId` is a
 * small deterministic FNV-style hash used as an RNG seed salt so that
 * per-team decisions in the same tick remain de-correlated even when
 * multiple teams share the same upstream RNG.
 *
 * Both are pure utilities — no save state, no side effects — so they
 * live in a leaf module and can be imported from anywhere in the AI
 * graph without creating cycles.
 */

import { SeededRNG, generateSeed } from "../rng"

const FALLBACK_RNG = new SeededRNG(generateSeed())

/** RNG draw with module-level fallback when no RNG is passed. */
export function aiRoll(rng?: SeededRNG): number {
    return rng ? rng.next() : FALLBACK_RNG.next()
}

/** Deterministic small hash of a team ID for RNG salting. */
export function hashTeamId(id: string): number {
    let h = 0
    for (let i = 0; i < id.length; i++) {
        h = ((h * 31) + id.charCodeAt(i)) | 0
    }
    return h >>> 0
}
