/** Weekly chances shared by PlayerLifecycleManager and the development outlook. */

/** Natural growth chance per week (PlayerLifecycleManager.processNaturalGrowth). */
export function naturalGrowthChance(age: number, skill: number, potential: number): number {
    if (age > 24) return 0
    const headroom = potential - skill
    if (headroom <= 0) return 0
    const ageFactor = age <= 19 ? 1 : age <= 21 ? 0.7 : age <= 23 ? 0.45 : 0.25
    return Math.min(0.04, (headroom / 100) * 0.18 * ageFactor)
}

/** Stats natural growth picks from (one at random; a capped pick adds nothing). */
export const NATURAL_GROWTH_STATS = ["skill", "rifle", "reaction", "clutch", "tactic", "awp"] as const

/**
 * Expected natural-growth points per week: the roll chance times the share
 * of growth stats still below potential (and 100).
 */
export function naturalGrowthPerWeek(player: Record<string, unknown> & { age?: number; skill?: number; potential?: number }): number {
    const potential = typeof player.potential === "number" ? player.potential : 75
    const chance = naturalGrowthChance(player.age ?? 22, player.skill ?? 50, potential)
    if (chance <= 0) return 0
    const open = NATURAL_GROWTH_STATS.filter(s => { const v = player[s]; return typeof v === "number" && v < potential && v < 100 }).length
    return chance * open / NATURAL_GROWTH_STATS.length
}

/** Age decline chance per week (PlayerLifecycleManager.processAging). */
export function ageDeclineChance(age: number): number {
    return age <= 27 ? 0 : Math.min(0.03, (age - 27) * 0.002)
}
