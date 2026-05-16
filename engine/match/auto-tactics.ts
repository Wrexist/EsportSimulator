/**
 * Auto-tactics strategy selection — picks the round strategy a team
 * should pursue given its average per-player cash.
 *
 * Extracted from hooks/useLiveMatch.ts (Phase L2). The live-match
 * auto-tactics toggle calls this each non-pistol round to decide
 * what buy the team should run on a budget basis.
 *
 * Pure function. No React, no hooks. Takes the SimState economy
 * shape (per-player record with .cash) and returns one of five
 * strategies.
 *
 * Thresholds:
 *   ≥ $4500 → FULL    (everyone can afford rifle + armor + utility)
 *   ≥ $2001 → SEMIBUY (rifles for most, partial armor/utility)
 *   ≥ $1401 → FORCE   (cheap rifles or SMGs, no armor)
 *   below   → ECO     (save the round, pistols only)
 */

export type AutoStrategy = "ECO" | "FORCE" | "SEMIBUY" | "FULL"

interface EconomyEntry {
    cash?: number
}

/** Compute average cash across a team's economy entries. */
export function averageEconomyCash(economy: Record<string, EconomyEntry | undefined>): number {
    const entries = Object.values(economy).filter((e): e is EconomyEntry => e != null)
    if (entries.length === 0) return 0
    const total = entries.reduce((sum, e) => sum + (e.cash || 0), 0)
    return Math.floor(total / entries.length)
}

/**
 * Pick the buy-strategy that matches the team's current cash level.
 * Mirrors the user-facing tactical-strategy mapping so manual + auto
 * toggles produce equivalent decisions at equivalent cash.
 */
export function selectAutoStrategy(avgCash: number): AutoStrategy {
    if (avgCash > 4500) return "FULL"
    if (avgCash > 2000) return "SEMIBUY"
    if (avgCash > 1400) return "FORCE"
    return "ECO"
}

/**
 * Convenience: read a team's economy, average it, pick a strategy.
 * Used by useLiveMatch's auto-tactics effect.
 */
export function pickAutoStrategy(economy: Record<string, EconomyEntry | undefined>): AutoStrategy {
    return selectAutoStrategy(averageEconomyCash(economy))
}
