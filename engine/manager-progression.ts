/**
 * Manager Progression System
 * Handles Career Mode unlocks, XP gains, and Manager Level persistence.
 */
import type { GameSave } from "./save-types"

/** Minimal shape needed by progression methods (accepts both GameSave and store state) */
type GameLike = Pick<GameSave, "managerDetails" | "eventsLog" | "currentWeek">

export const MANAGER_LEVEL_KEY = "cs2_manager_level"
export const CAREER_MODE_ENABLED_KEY = "cs2_career_mode_enabled"

export enum ManagerTier {
    ROOKIE = 3,    // Start here
    CHALLENGER = 2, // Mid tier
    ELITE = 1       // Top tier
}

export const TIER_THRESHOLDS = {
    [ManagerTier.ELITE]: 10,   // Level 10 needed for Tier 1
    [ManagerTier.CHALLENGER]: 5, // Level 5 needed for Tier 2
    [ManagerTier.ROOKIE]: 1    // Level 1 (Default) for Tier 3
}

export const TEAM_REP_TIERS = {
    TIER_1_MIN_REP: 75, // Top global orgs (reputation is 0-100 scale)
    TIER_2_MIN_REP: 40, // Mid-table
    // Below 40 is Tier 3
}

// XP required to reach each level (cumulative thresholds per level)
const XP_PER_LEVEL = [0, 500, 1200, 2000, 3500, 5000, 7500, 10000, 15000, 20000]

/** Difficulty multipliers used across AI, economy, and match systems */
export const DIFFICULTY_MODIFIERS: Record<string, { aiBudget: number, aiAggression: number, matchStrength: number, income: number }> = {
    easy:      { aiBudget: 0.8, aiAggression: 0.7, matchStrength: 0.9, income: 1.2 },
    normal:    { aiBudget: 1.0, aiAggression: 1.0, matchStrength: 1.0, income: 1.0 },
    hard:      { aiBudget: 1.3, aiAggression: 1.3, matchStrength: 1.1, income: 0.85 },
    legendary: { aiBudget: 1.6, aiAggression: 1.5, matchStrength: 1.2, income: 0.7 },
}

export class ManagerProgression {
    /**
     * Get XP required for a given level
     */
    static getXPForLevel(level: number): number {
        if (level <= 0) return 500
        if (level <= 10) return XP_PER_LEVEL[level - 1] || 20000
        return 20000 + (level - 10) * 5000 // Linear after 10
    }

    /**
     * Get manager level from game state (or fallback to 1)
     */
    static getManagerLevel(game?: GameLike): number {
        if (game?.managerDetails?.level) return game.managerDetails.level
        return 1
    }

    /**
     * Legacy no-op retained for callers that still invoke this method.
     */
    static setManagerLevel(level: number): void {
        void level
    }

    /**
     * Grant XP to the manager. Handles level-ups and events.
     */
    static gainXP(game: GameLike, amount: number): { leveledUp: boolean, newLevel: number } {
        const md = game?.managerDetails
        if (!md) return { leveledUp: false, newLevel: 1 }

        md.xp = (md.xp || 0) + amount
        let xpNeeded = this.getXPForLevel(md.level || 1)

        let leveledUp = false
        while (md.xp >= xpNeeded && (md.level || 1) < 20) {
            md.xp -= xpNeeded
            md.level = (md.level || 1) + 1
            leveledUp = true
            xpNeeded = this.getXPForLevel(md.level)
        }

        if (leveledUp && game.eventsLog) {
            game.eventsLog.unshift({
                id: `mgr_levelup_${game.currentWeek}_${md.level}`,
                week: game.currentWeek,
                type: "MANAGER_LEVEL_UP",
                data: {
                    description: `Manager leveled up to Level ${md.level}!`,
                    importance: "HIGH"
                },
                acknowledged: false
            })
        }

        return { leveledUp, newLevel: md.level || 1 }
    }

    /**
     * Determine a team's tier based on reputation
     */
    static getTeamTier(reputation: number): ManagerTier {
        if (reputation >= TEAM_REP_TIERS.TIER_1_MIN_REP) return ManagerTier.ELITE
        if (reputation >= TEAM_REP_TIERS.TIER_2_MIN_REP) return ManagerTier.CHALLENGER
        return ManagerTier.ROOKIE
    }

    /**
     * Check if a team is unlocked for the current manager
     */
    static isTeamUnlocked(reputation: number, currentLevel: number): boolean {
        const teamTier = this.getTeamTier(reputation)
        const requiredLevel = TIER_THRESHOLDS[teamTier]
        return currentLevel >= requiredLevel
    }

    /**
     * Get required level text for display
     */
    static getRequiredLevel(reputation: number): number {
        const teamTier = this.getTeamTier(reputation)
        return TIER_THRESHOLDS[teamTier]
    }
}
