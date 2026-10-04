/**
 * Free-agent market clock and long-unsigned retirement (FREE_AGENT_TUNING).
 *
 * Weekly, for every active player:
 *   - a player without a club, academy place or active contract gets
 *     `freeAgentSinceWeek` stamped (first week seen unsigned); a signed
 *     player has it cleared. recruitmentSalary decays asks from this clock.
 *   - after RETIRE_GRACE_WEEKS unsigned, a free agent retires with a small
 *     weekly chance (doubled for veterans, halved for youth). This balances
 *     the youth inflow (AI scouting + intake) against an outflow, so the
 *     active pool stays roughly stable instead of growing without bound.
 *
 * The roll is a pure hash of (player id, week), so it consumes nothing from
 * the week RNG and is identical on replay, resume and reload. Legends never
 * retire (unchanged rule). Old saves need no migration: the clock starts the
 * first week the processor runs.
 */

import type { GameSave } from "../save-types"
import { academyHeldPlayerIds } from "../recruitment"
import { FREE_AGENT_TUNING } from "@/lib/balance-tuning"

const FPL_NON_PRO_PREFIX = "fpl_nonpro_"

/** Deterministic [0, 1) roll from a string key (FNV-1a + avalanche). */
export function hashRoll(key: string): number {
    let h = 2166136261
    for (let i = 0; i < key.length; i++) {
        h ^= key.charCodeAt(i)
        h = Math.imul(h, 16777619)
    }
    h ^= h >>> 16
    h = Math.imul(h, 0x85ebca6b)
    h ^= h >>> 13
    return (h >>> 0) / 4294967296
}

/** Weekly retirement chance for a free agent unsigned for `weeksUnsigned` weeks. */
export function freeAgentRetirementChance(age: number, weeksUnsigned: number): number {
    if (weeksUnsigned < FREE_AGENT_TUNING.RETIRE_GRACE_WEEKS) return 0
    const base = FREE_AGENT_TUNING.RETIRE_WEEKLY_CHANCE
    if (age >= FREE_AGENT_TUNING.RETIRE_VETERAN_AGE) return base * 2
    if (age < FREE_AGENT_TUNING.RETIRE_YOUTH_AGE) return base / 2
    return base
}

/** Retirement multiplier from free-agent pool size relative to its target. */
export function freeAgentPoolFactor(freeAgents: number, clubs: number): number {
    const target = Math.max(1, FREE_AGENT_TUNING.POOL_TARGET_PER_CLUB * clubs)
    return Math.max(FREE_AGENT_TUNING.POOL_FACTOR_MIN, Math.min(FREE_AGENT_TUNING.POOL_FACTOR_MAX, freeAgents / target))
}

export function processFreeAgentMarket(save: GameSave): { retired: string[] } {
    const week = save.currentWeek
    const rostered = new Set<string>()
    for (const t of save.teams) for (const id of t.rosterIds) rostered.add(id)
    const held = academyHeldPlayerIds(save)
    const contracted = new Set<string>()
    for (const c of save.contracts) if (c.endWeek > week && (c.startWeek ?? 0) <= week) contracted.add(c.playerId)

    // Pool-size feedback (pass 2): retirements slow while the free-agent pool
    // is short of POOL_TARGET_PER_CLUB per club and speed up when it is large,
    // so the pool neither bottoms out (seasons 3-4) nor grows without bound.
    let freeCount = 0
    for (const p of save.players) if (!p.isRetired && !p.id.startsWith(FPL_NON_PRO_PREFIX) && !rostered.has(p.id) && !held.has(p.id) && !contracted.has(p.id)) freeCount++
    const poolFactor = freeAgentPoolFactor(freeCount, save.teams.length)

    const retired: string[] = []
    for (const p of save.players) {
        if (p.isRetired) continue
        const free = !rostered.has(p.id) && !held.has(p.id) && !contracted.has(p.id)
        if (!free) {
            if (p.freeAgentSinceWeek !== undefined) delete p.freeAgentSinceWeek
            continue
        }
        if (p.freeAgentSinceWeek === undefined) { p.freeAgentSinceWeek = week; continue }
        // Legends never retire; FPL non-pros are an amateur pool the FPL cycle manages.
        if (p.isLegendary || p.id.startsWith(FPL_NON_PRO_PREFIX)) continue
        const chance = freeAgentRetirementChance(p.age ?? 22, week - p.freeAgentSinceWeek) * poolFactor
        if (chance > 0 && hashRoll(`fa_retire:${p.id}:${week}`) < chance) {
            p.isRetired = true
            p.retirementWeek = week
            delete p.freeAgentSinceWeek
            retired.push(p.id)
        }
    }
    return { retired }
}
