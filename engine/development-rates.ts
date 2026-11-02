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

/**
 * Room to grow a pro of this age starts a career with: [up to age, points of
 * potential above his skill]. The snapshot gives established pros about 15
 * points of headroom (median), so every club trained its whole roster up by
 * that much in the first two seasons: median OVR rose from 58 to 74 and the
 * top ten clubs all reached the mid 90s (scripts/audit/world-drift.ts).
 * Established pros start near their level; teenagers keep room to grow into
 * stars (with no cap they added about ten OVR a season and filled the top of
 * the world within two seasons).
 */
export const STARTING_HEADROOM: ReadonlyArray<readonly [number, number]> = [[19, 12], [21, 6], [23, 3], [26, 1], [99, 0]]

/** A career's starting potential for a snapshot pro: his own, capped by age. */
export function startingPotential(potential: number | undefined, skill: number | undefined, age: number | undefined): number | undefined {
    if (typeof potential !== "number" || typeof skill !== "number") return potential
    const a = age ?? 22
    let room = STARTING_HEADROOM[STARTING_HEADROOM.length - 1][1]
    for (const [upTo, points] of STARTING_HEADROOM) if (a <= upTo) { room = points; break }
    return Math.max(skill, Math.min(potential, skill + room))
}

/**
 * Weapon mastery XP an established pro starts a career with (engine/weapon-
 * mastery-system.ts levels: 300 Skilled, 600 Expert, 1000 Master), by age:
 * [up to age, main weapon, side weapon, pistol]. Every snapshot pro used to
 * start at zero and reach Master within a season of matches, which alone
 * lifted every rating by about six OVR in season one. A pro of 20 and up has
 * mastered his weapon already; a teenager still grows into it.
 */
export const STARTING_MASTERY: ReadonlyArray<readonly [number, number, number, number]> = [[19, 600, 300, 300], [99, 1000, 600, 600]]

/** Starting weapon mastery for a snapshot pro: AWPers' main weapon is the AWP, everyone else's the rifle. */
export function startingWeaponMastery(age: number | undefined, role: string | undefined): Record<string, number> {
    const a = age ?? 22
    const row = STARTING_MASTERY.find(([upTo]) => a <= upTo) ?? STARTING_MASTERY[STARTING_MASTERY.length - 1]
    const [, main, side, pistol] = row
    const awper = /AWP|SNIPER/i.test(role ?? "")
    return awper ? { AWP: main, RIFLE: side, PISTOL: pistol } : { RIFLE: main, AWP: 0, PISTOL: pistol }
}

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

/**
 * Potential for a prospect an AI club brings in (academy scouting and the
 * season-end youth intake), matched to the world the career starts with.
 *
 * Both used the academy generator's ranges (about 60 to 95, the user's
 * scouting ranges), against a starting world whose rostered pros have a
 * median potential of 54 and a 90th percentile of 70. Over ten seasons the
 * AI prospects (about 330 of 1,040 rostered players by season six, median
 * potential 84) filled the top of the world: the top ten clubs went from 80.7
 * to 97 OVR and wages roughly quadrupled (scripts/audit/world-drift.ts 521).
 * Better clubs still find better prospects, and a rare gem can become a star.
 */
export const AI_PROSPECT_POTENTIAL = {
    /** [low, high] by the club's scouting reach. */
    LOCAL: [45, 66] as const,
    REGIONAL: [50, 72] as const,
    INTERNATIONAL: [55, 80] as const,
    /** Chance a prospect is a gem, and the points it adds. */
    GEM_CHANCE: 0.05,
    GEM_BONUS: 10,
}

export function aiProspectPotential(tier: "LOCAL" | "REGIONAL" | "INTERNATIONAL", rng: { next(): number }): number {
    const [lo, hi] = AI_PROSPECT_POTENTIAL[tier]
    const gem = rng.next() < AI_PROSPECT_POTENTIAL.GEM_CHANCE ? AI_PROSPECT_POTENTIAL.GEM_BONUS : 0
    return Math.min(95, Math.round(lo + rng.next() * (hi - lo)) + gem)
}
