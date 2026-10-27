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

/**
 * C7 age curve (scripts/audit/age-curve-sim.ts). Before it, a 17-year-old
 * trained to his potential within two seasons and nobody declined, so
 * careers peaked at about 21 and stayed flat until retirement. Now:
 *  - training gains shrink with age (AGE_CURVE.TRAINING), so talent fills
 *    out over the early twenties and peaks around 24 to 27;
 *  - from 29 the ceiling (potential) falls a little each season
 *    (AGE_CURVE.CEILING_LOSS), and aim, reaction and clutch above it sink
 *    toward it (AGE_CURVE.SINK_CHANCE a week per stat). Game sense (tactics,
 *    leadership, teamwork) and the AWP itself do not sink, and IGLs and
 *    AWPers decline at half the rate, so they last into their 30s.
 * Same rules for every club.
 */
export const AGE_CURVE = {
    /** Training gain multiplier by age: [up to age, factor]. */
    TRAINING: [[18, 0.3], [20, 0.32], [22, 0.34], [24, 0.3], [26, 0.24], [28, 0.18], [99, 0.12]] as ReadonlyArray<readonly [number, number]>,
    /** Potential lost per season by age: [from age, points]. */
    CEILING_LOSS: [[29, 0.4], [31, 0.7], [33, 1.1], [35, 1.5]] as ReadonlyArray<readonly [number, number]>,
    /** In-game leaders and AWPers age slower (their decline × this). */
    LASTING_ROLE_FACTOR: 0.5,
    /** Stats that sink toward a falling ceiling. */
    SINKING_STATS: ["skill", "rifle", "reaction", "clutch", "pistol"] as const,
    /** Weekly chance a sinking stat above the ceiling drops one point. */
    SINK_CHANCE: 0.04,
} as const

/** Share of a training session's gains a player of this age keeps. */
export function trainingAgeFactor(age: number | undefined): number {
    const a = age ?? 22
    for (const [upTo, f] of AGE_CURVE.TRAINING) if (a <= upTo) return f
    return AGE_CURVE.TRAINING[AGE_CURVE.TRAINING.length - 1][1]
}

/** Potential (the ceiling) lost per season at this age. */
export function ceilingLossPerSeason(age: number | undefined): number {
    const a = age ?? 22
    let loss = 0
    for (const [from, points] of AGE_CURVE.CEILING_LOSS) if (a >= from) loss = points
    return loss
}

/** In-game leaders and AWPers (primary or second role) age slower. */
export function lastsLonger(role: string | undefined, secondaryRole?: string): boolean {
    return /IGL|AWP/i.test(`${role ?? ""} ${secondaryRole ?? ""}`)
}

/** Age decline chance per week (PlayerLifecycleManager.processAging): the ceiling's weekly chance to drop a point. */
export function ageDeclineChance(age: number, role?: string, secondaryRole?: string): number {
    return ceilingLossPerSeason(age) / 52 * (lastsLonger(role, secondaryRole) ? AGE_CURVE.LASTING_ROLE_FACTOR : 1)
}
