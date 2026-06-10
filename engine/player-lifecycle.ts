import { Player, PLAYER_STAT_CONSTRAINTS } from "@/types/player"
import { calculateProPrestigeScore } from "./prestige-system"
import { HallOfFameManager } from "./hall-of-fame-manager"
import { GameSave, PlayerSaveData } from "./save-types"
import { SeededRNG, generateSeed } from "./rng"

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
        const headroom = potential - skill
        if (headroom <= 0) return

        // Younger + more headroom = more likely. Scales with the gap; peaks
        // around a couple of points per season for a raw high-ceiling teenager,
        // tapering to near-zero as they approach potential.
        const ageFactor = age <= 19 ? 1 : age <= 21 ? 0.7 : age <= 23 ? 0.45 : 0.25
        const growthChance = Math.min(0.04, (headroom / 100) * 0.18 * ageFactor)
        if (this.roll(rng) >= growthChance) return

        // Grow a random developing stat that still has room, capped at potential.
        const growableStats = ['skill', 'rifle', 'reaction', 'clutch', 'tactic', 'awp']
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
     * Handles aging mechanics
     * Players > 27 have a chance to lose physical stats each week
     */
    private static processAging(player: PlayerLike, week: number, rng?: SeededRNG): void {
        if (player.age <= 27) return

        // Chance increases with age, capped to prevent instant stat destruction
        // 28yo: ~0.2% chance/week (~10% per year — gentle decline)
        // 32yo: ~1.0% chance/week (~52% chance of at least one decline per year)
        // 36yo: ~1.8% chance/week (~more frequent but still manageable)
        const declineChance = Math.min(0.03, (player.age - 27) * 0.002)

        if (this.roll(rng) < declineChance) {
            this.applyAgingDecline(player, rng)
        }
    }

    private static applyAgingDecline(player: PlayerLike, rng?: SeededRNG): void {
        // Physical stats decline first
        const physicalStats: (keyof PlayerLike)[] = ['reaction', 'skill', 'rifle', 'clutch']
        const targetStat = physicalStats[Math.floor(this.roll(rng) * physicalStats.length)]

        if (typeof player[targetStat] === 'number' && (player[targetStat] as number) > 10) {
            (player as unknown as Record<string, unknown>)[targetStat as string] = Math.max(10, (player[targetStat] as number) - 1)
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

        // Morale drifts towards 50 (Baseline)
        const targetMorale = 50
        // Facility bonus to morale drift: slightly faster recovery from low morale
        const moraleStep = player.morale < 50 ? (0.05 + recoveryBonus * 0.01) : 0.05
        const drift = (targetMorale - player.morale) * moraleStep
        player.morale = Math.max(0, Math.min(100, player.morale + drift))

        // Form drifts towards 50
        const targetForm = 50
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

    /**
     * Process retirement and Hall of Fame eligibility
     * Called when a player retires
     */
    static processRetirement(save: GameSave, player: PlayerSaveData): void {
        if (!player.isRetired) return
        HallOfFameManager.processRetirement(save, player)
    }
}
