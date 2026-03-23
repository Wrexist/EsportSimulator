import { Player, PLAYER_STAT_CONSTRAINTS } from "@/types/player"
import { calculateHltvPrestigeScore } from "./prestige-system"
import { HallOfFameManager } from "./hall-of-fame-manager"
import { GameSave, PlayerSaveData } from "./save-types"
import { SeededRNG, generateSeed } from "./rng"

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
    static processWeeklyUpdates(player: Player, currentYear: number, week: number, recoveryBonus: number = 0, rng?: SeededRNG): void {
        this.processAging(player, week, rng)
        this.processPsychology(player, recoveryBonus)
        this.updatePrestige(player, currentYear)
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
    private static processAging(player: Player, week: number, rng?: SeededRNG): void {
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

    private static applyAgingDecline(player: Player, rng?: SeededRNG): void {
        // Physical stats decline first
        const physicalStats: (keyof Player)[] = ['reaction', 'skill', 'rifle', 'clutch']
        const targetStat = physicalStats[Math.floor(this.roll(rng) * physicalStats.length)]

        // @ts-ignore - dynamic access
        if (typeof player[targetStat] === 'number' && player[targetStat] > 10) {
            // @ts-ignore
            player[targetStat] = Math.max(10, player[targetStat] - 1)
        }
    }

    /**
     * Drifts morale and fatigue towards baseline
     * @param recoveryBonus Phase 18 bonus (level 1-5)
     */
    private static processPsychology(player: Player, recoveryBonus: number = 0): void {
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
     * Updates the cached HLTV Prestige Score
     */
    private static updatePrestige(player: Player, currentYear: number): void {
        if (player.hltvHistory && player.hltvHistory.length > 0) {
            player.prestigeScore = calculateHltvPrestigeScore(player.hltvHistory, currentYear)
        }
        // If hltvHistory is empty, preserve the initial prestigeScore from snapshot-loader
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
