import { Player, PLAYER_STAT_CONSTRAINTS } from "@/types/player"
import { calculateProPrestigeScore } from "./prestige-system"
import { SeededRNG, generateSeed } from "./rng"
import { CONDITION_TUNING } from "@/lib/balance-tuning"
import { AGE_CURVE, ageDeclineChance, lastsLonger, naturalGrowthChance, NATURAL_GROWTH_STATS } from "./development-rates"

/**
 * Subset of player fields used by processWeeklyUpdates and its internal helpers.
 * Both Player and PlayerSaveData satisfy this interface.
 */
interface PlayerLike {
    age: number
    fatigue: number
    energy: number
    maxEnergy: number
    morale: number
    form: number
    proHistory?: { year: number; rank: number }[]
    prestigeScore?: number
    reaction: number
    skill: number
    rifle: number
    clutch: number
}

/** Form after a committed match result (CONDITION_TUNING); same rule for every club. */
export function applyFormResult(form: number | undefined, won: boolean, factor = 1): number {
    const delta = (won ? CONDITION_TUNING.FORM_PER_WIN : CONDITION_TUNING.FORM_PER_LOSS) * factor
    return Math.max(0, Math.min(100, (form ?? 50) + delta))
}

/**
 * C1: how much a result should move morale and form given the side's
 * pre-match chance (0..1). 1 at even odds; below 1 for the expected result
 * (a favourite's win, an underdog's defeat), above 1 for an upset.
 */
export function resultSurpriseFactor(expected: number | undefined, won: boolean): number {
    if (typeof expected !== "number" || !Number.isFinite(expected)) return 1
    const e = Math.max(0, Math.min(1, expected))
    return Math.max(0, 1 + CONDITION_TUNING.RESULT_SURPRISE * (won ? 0.5 - e : e - 0.5))
}

/**
 * Morale after a committed match result (CONDITION_TUNING). Gains shrink as
 * morale approaches 100 so a winning streak cannot pin a roster at the
 * maximum (+20% strength) indefinitely; losses apply in full. Same rule for
 * every club.
 */
export function applyMoraleResult(morale: number | undefined, delta: number): number {
    const current = morale ?? 50
    const scaled = delta > 0 ? delta * Math.min(1, Math.max(0, 100 - current) / CONDITION_TUNING.MORALE_GAIN_HEADROOM) : delta
    return Math.max(0, Math.min(100, current + Math.round(scaled)))
}

/**
 * Manages player progression, aging, and psychological state
 */
export class PlayerLifecycleManager {
    private static fallbackRng = new SeededRNG(generateSeed())

    private static roll(rng?: SeededRNG): number {
        return rng ? rng.next() : this.fallbackRng.next()
    }

    // XP Curve: Level * 1000? Flat 1000? 
    // Let's go with Flat 1000 per skill point for now for simplicity
    private static readonly XP_PER_LEVEL = 1000

    /**
     * Process weekly updates for a player
     * @param player The player to update (mutable)
     * @param currentYear Current game year
     * @param week Current game week
     * @param recoveryBonus Phase 18: Bonus to recovery from facilities (0-5)
     */
    static processWeeklyUpdates(player: PlayerLike, currentYear: number, week: number, recoveryBonus: number = 0, rng?: SeededRNG): void {
        this.processNaturalGrowth(player, rng)
        this.processAging(player, week, rng)
        this.processPsychology(player, recoveryBonus)
        this.updatePrestige(player, currentYear)
    }

    /**
     * Natural development for young players toward their potential. Runs for
     * EVERY player each week, which is what keeps AI/free-agent talent rising
     * instead of stagnating while only the player team trained — previously the
     * player's squad pulled away and trivially dominated by season 3. Modest
     * and bounded: a single point at a time, gated on potential headroom, never
     * past `potential`. The player team still develops far faster via focused
     * training, so this doesn't erase the value of training — it just stops
     * everyone else from standing still.
     */
    private static processNaturalGrowth(player: PlayerLike, rng?: SeededRNG): void {
        const p = player as unknown as Record<string, number | boolean | undefined>
        const age = player.age ?? 22
        if (age > 24 || p.isRetired === true) return
        const potential = (typeof p.potential === "number" ? p.potential : 75)
        const skill = player.skill ?? 50
        // Younger + more headroom = more likely. Scales with the gap; peaks
        // around a couple of points per season for a raw high-ceiling teenager,
        // tapering to near-zero as they approach potential.
        const growthChance = naturalGrowthChance(age, skill, potential)
        if (growthChance <= 0) return
        if (this.roll(rng) >= growthChance) return

        // Grow a random developing stat that still has room, capped at potential.
        const growableStats = NATURAL_GROWTH_STATS
        const stat = growableStats[Math.floor(this.roll(rng) * growableStats.length)]
        const cur = p[stat]
        if (typeof cur === 'number' && cur < potential && cur < 100) {
            p[stat] = Math.min(potential, cur + 1)
        }
    }

    /**
     * Grants XP to a player and handles leveling up
     * @param player 
     * @param amount 
     * @returns True if leveled up
     */
    static gainXP(player: Player, amount: number): boolean {
        if (!player.availableSkillPoints) player.availableSkillPoints = 0
        player.xp = (player.xp || 0) + amount
        let leveledUp = false
        let xpNeeded = player.xpToNextLevel || this.XP_PER_LEVEL

        while (player.xp >= xpNeeded) {
            player.xp -= xpNeeded
            player.level = (player.level || 1) + 1
            player.talentPoints = (player.talentPoints || 0) + 1
            // Linear scaling: +200 XP per level (keeps progression achievable at high levels)
            xpNeeded = this.XP_PER_LEVEL + ((player.level || 1) - 1) * 200
            player.xpToNextLevel = xpNeeded
            leveledUp = true
        }
        return leveledUp
    }

    /**
     * Adds Skill Points directly (e.g. from Training or Events)
     */
    static grantSkillPoint(player: Player, points: number = 1): void {
        player.availableSkillPoints = (player.availableSkillPoints || 0) + points
    }

    /**
     * Handles aging mechanics (C7, engine/development-rates.ts AGE_CURVE):
     * from 29 the ceiling falls a little each season, and aim stats above
     * it sink toward it. Game sense and the AWP stat do not sink.
     */
    private static processAging(player: PlayerLike, week: number, rng?: SeededRNG): void {
        void week
        const role = (player as { role?: string }).role, second = (player as { secondaryRole?: string }).secondaryRole
        const chance = ageDeclineChance(player.age, role, second)
        if (chance <= 0) return
        const p = player as unknown as Record<string, number>
        const sink = AGE_CURVE.SINK_CHANCE * (lastsLonger(role, second) ? AGE_CURVE.LASTING_ROLE_FACTOR : 1)
        if (typeof p.potential === "number" && this.roll(rng) < chance) {
            p.potential = Math.max(10, p.potential - 1)
        }
        const ceiling = typeof p.potential === "number" ? p.potential : 100
        for (const stat of AGE_CURVE.SINKING_STATS) {
            const v = p[stat]
            if (typeof v === "number" && v > ceiling && v > 10 && this.roll(rng) < sink) p[stat] = v - 1
        }
    }

    /**
     * Drifts morale and fatigue towards baseline
     * @param recoveryBonus Phase 18 bonus (level 1-5)
     */
    private static processPsychology(player: PlayerLike, recoveryBonus: number = 0): void {
        // Recover fatigue — base 8 ensures players don't spiral even without facilities
        // (matches add +10 per match, so base 8 keeps net gain manageable at +2)
        const fatigueRecovery = 8 + recoveryBonus
        if (player.fatigue > 0) {
            player.fatigue = Math.max(0, player.fatigue - fatigueRecovery)
        }

        // Recover energy (faster than fatigue)
        // Base 15 + recoveryBonus * 2 (facilities help energy recovery more)
        const energyRecovery = 15 + (recoveryBonus * 2)
        const maxEnergy = player.maxEnergy || 100
        if ((player.energy ?? 100) < maxEnergy) {
            player.energy = Math.min(maxEnergy, (player.energy ?? 100) + energyRecovery)
        }

        // Morale and form drift towards 50, lowered by carried fatigue
        // (CONDITION_TUNING): a heavy schedule has a real cost for every club.
        const fatigueNow = Math.max(0, player.fatigue || 0)
        const targetMorale = 50 - fatigueNow * CONDITION_TUNING.FATIGUE_MORALE_DRAG
        // Facility bonus to morale drift: slightly faster recovery from low morale
        const moraleStep = player.morale < 50 ? (0.05 + recoveryBonus * 0.01) : 0.05
        const drift = (targetMorale - player.morale) * moraleStep
        player.morale = Math.max(0, Math.min(100, player.morale + drift))

        const targetForm = 50 - fatigueNow * CONDITION_TUNING.FATIGUE_FORM_DRAG
        const formDrift = (targetForm - player.form) * 0.1
        player.form = Math.max(0, Math.min(100, player.form + formDrift))
    }

    /**
     * Updates the cached Pro Prestige Score
     */
    private static updatePrestige(player: PlayerLike, currentYear: number): void {
        if (player.proHistory && player.proHistory.length > 0) {
            player.prestigeScore = calculateProPrestigeScore(player.proHistory, currentYear)
        }
        // If proHistory is empty, preserve the initial prestigeScore from snapshot-loader
    }

}
