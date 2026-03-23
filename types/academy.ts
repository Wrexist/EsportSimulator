/**
 * Youth Academy Type Definitions
 * Phase 1: Core interfaces for the Academy system
 */

import { PlayerRole } from "./enums"

// ===== ACADEMY PLAYER (Prospect) =====

/**
 * Represents a player enrolled in the youth academy
 * Links to a PlayerSaveData record via playerId
 */
export interface AcademyPlayer {
    id: string                    // Unique academy enrollment ID
    playerId: string              // Reference to PlayerSaveData
    enrolledWeek: number          // Game week when joined academy
    trainingFocus: AcademyTrainingFocus
    developmentProgress: number   // 0-100, progress towards promotion readiness
    potentialRevealed: boolean    // Has full potential been scouted?
    totalXpGained: number         // Cumulative XP earned
    academyMatchesPlayed: number  // Development matches participated
    readyForPromotion: boolean    // Meets promotion criteria
    scoutNotes: string            // Text notes from scouting
    energy: number                // 0-100, current physical state
    weeklyXpBreakdown?: {         // Breakdown of XP for the reports tab
        training: number
        match: number
        bonus: number
    }
}

/**
 * Detailed training drill definition
 */
export interface AcademyTrainingDrill {
    id: string
    name: string
    statFocus: TrainableStat[]
    xpGain: number
    energyCost: number
    minLevel: number
    icon?: any
    bgColor?: string
    color?: string
}

/**
 * Weekly report data for a specific prospect
 */
export interface AcademyProspectReport {
    playerId: string
    nickname: string
    xpGained: number
    statImprovements: Partial<Record<TrainableStat, number>>
    energyChange: number
    isStarter: boolean
}

/**
 * Summarized weekly report for the entire academy
 */
export interface AcademyWeeklyReport {
    week: number
    overallXp: number
    prospectReports: AcademyProspectReport[]
}

/**
 * Training focus options for academy prospects
 * Each focus emphasizes different stat categories
 */
export type AcademyTrainingFocus =
    | "MECHANICAL"   // Aim, rifle, AWP, pistol
    | "TACTICAL"     // Tactics, grenades, positioning
    | "MENTAL"       // Leadership, stress resistance, teamwork
    | "PHYSICAL"     // Reaction, endurance, health
    | "BALANCED"     // Slower but well-rounded development

// ===== ACADEMY FACILITY =====

/**
 * Academy facility attached to a team
 * Level 0 = not built, 1-5 = active facility tiers
 */
export interface AcademyFacility {
    level: number               // 0 = not built, 1-5 = facility tier
    builtWeek?: number          // Week facility was constructed
    lastUpgradeWeek?: number    // Week of most recent upgrade
}

// ===== DEVELOPMENT MATCH =====

/**
 * Result of a simulated academy development match
 */
export interface AcademyMatchResult {
    id: string
    week: number                            // Game week match occurred
    opponentName: string                    // Generated opponent name
    won: boolean
    scoreHome: number                       // Academy team score (rounds)
    scoreAway: number                       // Opponent score (rounds)
    mvpId?: string                          // Prospect with best performance
    xpGained: Record<string, number>        // playerId -> XP awarded
    participantIds: string[]                // Prospect IDs who played
}

// ===== SCOUTING =====

/**
 * Scouting tier determines prospect pool quality and cost
 */
export type ScoutingTier = "LOCAL" | "REGIONAL" | "INTERNATIONAL"

export interface AcademyScoutingMission {
    id: string
    tier: ScoutingTier
    weeksRemaining: number
    cost: number
    startWeek: number
    scoutId: string // ID of the staff member assigned
}

/**
 * Scouting report for a prospective academy player
 */
export interface ScoutingReport {
    playerId: string            // Reference to generated player
    tier: ScoutingTier
    scoutedWeek: number
    estimatedPotential: "LOW" | "MEDIUM" | "HIGH" | "ELITE" | "UNKNOWN"
    strengthAreas: string[]     // e.g., ["Rifle", "Clutch"]
    weaknessAreas: string[]     // e.g., ["Grenades", "Leadership"]
    recommendEnroll: boolean
    notes: string
}

// ===== HELPER TYPES =====

/**
 * Contract offer when promoting a prospect to main roster
 */
export interface ProspectContractOffer {
    salaryPerWeek: number
    contractLengthWeeks: number // Typically 52-156 (1-3 years)
    signingBonus?: number
    buyoutClause?: number
}

/**
 * Academy level information (used by constants)
 */
export interface AcademyLevelInfo {
    name: string
    maxProspects: number
    devBonus: number          // XP multiplier (1.0 = 100%)
    buildCost: number         // Cost to reach this level
    weeklyCost: number        // Operating cost per week
    perks: string[]           // UI-displayed perks
    description: string       // Flavor text
}

export type AcademyRole = "IGL" | "Entry" | "AWPer" | "Support" | "Rifler"

/**
 * Stats that can be improved through academy training
 */
export type TrainableStat =
    | "skill" | "awp" | "rifle" | "pistol" | "grenades"
    | "creativity" | "clutch" | "tactic" | "entry" | "trading"
    | "leader" | "teamwork" | "stressResistance"
    | "reaction" | "endurance" | "health"
