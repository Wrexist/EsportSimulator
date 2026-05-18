/**
 * Player model for Pro FPS Esports Manager Simulation
 * Phase 3: Strict, gameplay-meaningful player attributes
 * 
 * RULES:
 * - All stats are 0-100 scale (not 1-20)
 * - No stat may exceed 100 or drop below 0
 * - All stats must be referenced by simulation or progression
 * - Form, fatigue, morale fluctuate weekly
 * - Potential limits stat growth permanently
 */

import { PlayerRole, PlayerTier } from "./enums"

/**
 * Pro Ranking Entry for Prestige System (Phase 6)
 */
export interface ProRankingEntry {
    year: number;      // e.g. 2019-2025
    rank: number;      // 1-100
}

/**
 * Complete player model with strict validation rules
 */
export interface Player {
    // ===== IDENTITY =====
    id: string
    name: string
    nickname: string
    age: number
    nationality: string
    portraitPath: string
    firstName?: string
    lastName?: string

    // ===== GROUNDBREAKING TACTICS (PHASE 17) =====
    perks?: string[]
    traits?: string[] // e.g. "AGGRESSIVE", "PASSIVE", "CLUTCHER"
    availableSkillPoints?: number
    roleMastery?: Record<string, number>
    overallRating?: number

    // Phase 55: Training & Stamina
    energy: number // 0-100, determines match performance and training capacity
    maxEnergy: number // Default 100
    // Phase 6: Prestige System
    proHistory?: ProRankingEntry[]
    prestigeScore?: number // 0-100, calculated from history

    // ===== CLASSIFICATION =====
    role: PlayerRole
    secondaryRole?: PlayerRole
    tier: PlayerTier
    achievements?: { type: string, week: number, description: string }[]

    // ===== TECHNICAL STATS (0-100) =====
    // Core mechanical and game skills
    skill: number         // Overall skill level, weighted average
    awp: number          // AWP proficiency
    rifle: number        // Rifle proficiency (AK, M4, etc.)
    pistol: number       // Pistol round performance
    grenades: number     // Utility usage effectiveness
    creativity: number   // Ability to make unconventional plays
    clutch: number       // Performance in 1vX situations
    tactic: number       // Tactical understanding and execution
    entry: number        // Entry fragging/opening duel proficiency (Phase 61)
    trading: number      // Trade fragging effectiveness (Phase 61)

    // ===== MENTAL STATS (0-100) =====
    // Psychological and team-related attributes
    leader: number           // Leadership ability, affects IGL effectiveness
    teamwork: number         // Team coordination and communication
    morale: number           // Current mental state (fluctuates)
    amicability: number      // Contributes to team chemistry
    productivity: number     // Training efficiency multiplier
    stressResistance: number // Handles pressure in important matches
    loyalty: number          // Resistance to transfer offers

    // ===== PHYSICAL STATS (0-100) =====
    // Physical and health-related attributes
    reaction: number   // Reaction time and reflexes
    eyesight: number   // Visual acuity, affects aim
    health: number     // Current physical health
    strength: number   // Physical endurance for long sessions
    endurance: number  // Stamina over extended tournaments

    // ===== DYNAMIC ATTRIBUTES =====
    // Short-term modifiers that change frequently
    form: number       // 0-100, short-term performance modifier
    fatigue: number    // 0-100, accumulates weekly, affects performance
    potential: number  // 0-100, caps long-term growth (hidden from player)

    // ===== DERIVED/COMPUTED =====
    // Not stored, calculated on-demand
    // injuryRisk: computed from (100 - health) + fatigue + age factors

    // ===== CAREER STATISTICS =====
    // Lifetime performance tracking
    matchesPlayed: number
    roundsPlayed: number
    avgRating: number           // Career average Pro-style rating
    headshots?: number          // Career total headshots
    clutchSuccessRate: number   // Percentage of clutches won

    // ===== CONTRACT & FINANCE =====
    // ===== CONTRACT & FINANCE =====
    contract: PlayerContract

    // Weapon Mastery (Phase 48) - XP per weapon type
    weaponMastery?: {
        RIFLE?: number
        AWP?: number
        PISTOL?: number
        SMG?: number
        [key: string]: number | undefined
    }

    // Talent System
    level?: number
    xp?: number
    xpToNextLevel?: number
    talentPoints?: number
    unlockedTalentIds?: string[]
    totalMVPs?: number
}

/**
 * Player contract details
 */
export interface PlayerContract {
    playerId: string
    salaryPerWeek: number
    startWeek: number      // Game week when contract started
    endWeek: number        // Game week when contract expires
    buyout: number         // Buyout clause amount

    // Performance Bonuses
    matchWinBonus?: number
    mvpBonus?: number
    tournamentWinBonus?: number
    signOnBonus?: number
}

/**
 * Player match statistics (per-match tracking)
 */
export interface PlayerMatchStats {
    playerId: string
    matchId: string

    kills: number
    deaths: number
    assists: number
    headshots: number

    adr: number        // Average damage per round
    kast: number       // Kill/Assist/Survive/Trade % (0-100)
    rating: number     // Pro-style rating (0-2.0 typically)

    clutches: number   // Clutch rounds won
    firstKills: number // Opening kills
    firstDeaths: number // Opening deaths

    mapsPlayed: number
}

/**
 * Validation rules for player stats
 */
export const PLAYER_STAT_CONSTRAINTS = {
    MIN_STAT: 0,
    MAX_STAT: 100,
    MIN_AGE: 16,
    MAX_AGE: 35,
    MIN_POTENTIAL: 0,
    MAX_POTENTIAL: 100,

    // Form fluctuation per week
    FORM_CHANGE_MIN: -10,
    FORM_CHANGE_MAX: 10,

    // Fatigue accumulation
    FATIGUE_PER_MATCH: 15,
    FATIGUE_RECOVERY_PER_WEEK: 10,

    // Morale bounds
    MORALE_MIN: 0,
    MORALE_MAX: 100,
} as const

/**
 * Helper function to calculate injury risk (not stored)
 * Based on health, fatigue, and age
 */
export function calculateInjuryRisk(player: Player): number {
    const healthFactor = (100 - player.health) * 0.4
    const fatigueFactor = player.fatigue * 0.4
    const ageFactor = Math.max(0, (player.age - 28) * 2) * 0.2

    return Math.min(100, healthFactor + fatigueFactor + ageFactor)
}

/**
 * Helper function to validate player stats are within bounds
 */
export function validatePlayerStats(player: Player): boolean {
    const stats = [
        player.skill, player.awp, player.rifle, player.pistol,
        player.grenades, player.creativity, player.clutch, player.tactic, player.entry, player.trading,
        player.leader, player.teamwork, player.morale, player.amicability,
        player.productivity, player.stressResistance, player.loyalty,
        player.reaction, player.eyesight, player.health, player.strength,
        player.endurance, player.form, player.fatigue, player.potential
    ]

    return stats.every(stat =>
        stat >= PLAYER_STAT_CONSTRAINTS.MIN_STAT &&
        stat <= PLAYER_STAT_CONSTRAINTS.MAX_STAT
    ) && player.age >= PLAYER_STAT_CONSTRAINTS.MIN_AGE &&
        player.age <= PLAYER_STAT_CONSTRAINTS.MAX_AGE
}
