/**
 * Team and Staff models for Pro FPS Esports Manager Simulation
 * Phase 3: Strict team structure with chemistry and staff effects
 */

import { Player } from "./player"
import { StaffType, PlayerTier } from "./enums"
import { EquipmentItem } from "./game"
import { TeamBranding } from "@/data/snapshot-types"

/**
 * Team model with roster, staff, and facilities
 */
export interface Team {
    // ===== IDENTITY =====
    id: string
    name: string
    tier: PlayerTier // Team tier matches player tier system
    logoPath?: string
    branding?: TeamBranding

    // ===== ROSTER & STAFF =====
    roster: string[]  // Player IDs (5 main players)
    staff: string[]   // Staff IDs (coach, analyst, psychologist)

    // ===== REPUTATION & FANBASE =====
    reputation: number  // 0-100, affects sponsors & transfers
    fanbase: number     // Numeric fan count, affects income

    // ===== CHEMISTRY =====
    // Derived value, recomputed on roster change
    // Based on: role balance, teamwork stats, amicability variance
    // Output: 0-100
    chemistry: number

    // ===== FACILITIES =====
    facilitiesLevel: number // 1-10, affects training & fatigue recovery

    // Phase 55: Training Limits
    trainingSlotsUsed: number
    maxTrainingSlots: number // Default 10 per week

    // ===== FINANCE =====
    budget: number // Current available funds

    // Phase 20: Tactical Perfection
    playstyle?: "balanced" | "aggressive" | "structured" | "default"
    tacticalPrep?: number // 0-100 bonus from VOD reviews
    prepPenalty?: number // transient quick-sim differential (B4); set only on a sim copy, never persisted
    economyStyle?: "standard" | "force" | "eco" // Phase 60: Economy aggressiveness
    targetPlayerId?: string // Phase 60: Antistratting - targeted enemy player

    // Phase 21: Career Narrative
    youthAcademyIds?: string[] // IDs of prospects in the academy
    trophies?: { tournamentId: string; tournamentName: string; week: number; mvpId?: string; trophyPath?: string; tier?: string }[]

    // Phase 30: Equipment
    equipment: EquipmentItem[]
}

/**
 * Staff member base interface
 */
export interface Staff {
    id: string
    name: string
    type: StaffType
    level: number // 1-5, determines effectiveness
    salary: number // Weekly salary

    // Contract
    contractWeeksRemaining: number
}

/**
 * Coach - improves tactics and morale stability
 */
export interface Coach extends Staff {
    type: StaffType.COACH

    // Effects (scale with level 1-5)
    tacticBonus: number      // +2 to +10 tactic stat
    moraleStability: number  // Reduces morale variance by 10-50%
}

/**
 * Analyst - provides map veto advantage
 */
export interface Analyst extends Staff {
    type: StaffType.ANALYST

    // Effects (scale with level 1-5)
    mapVetoAdvantage: number // +5% to +25% win chance in veto phase
}

/**
 * Psychologist - improves morale recovery
 */
export interface Psychologist extends Staff {
    type: StaffType.PSYCHOLOGIST

    // Effects (scale with level 1-5)
    moraleRecoverySpeed: number // +10% to +50% faster morale recovery
    stressReduction: number     // Reduces stress impact by 10-50%
}

/**
 * Chemistry calculation rules:
 * - Role balance: Each unique role = +10 chemistry (max 40)
 * - Teamwork average: Average teamwork stat of all players (0-100)
 * - Amicability variance: Low variance = higher chemistry
 *   - Variance < 10: +20 bonus
 *   - Variance 10-20: +10 bonus
 *   - Variance > 20: 0 bonus
 * 
 * Formula: (roleBalance * 0.3) + (avgTeamwork * 0.5) + (amicabilityBonus * 0.2)
 */
export function calculateTeamChemistry(players: Player[]): number {
    if (players.length === 0) return 0

    // Role balance (0-40 points)
    const uniqueRoles = new Set(players.map(p => p.role)).size
    const roleBalance = uniqueRoles * 10

    // Average teamwork (0-100)
    const avgTeamwork = players.reduce((sum, p) => sum + p.teamwork, 0) / players.length

    // Amicability variance bonus (0-20)
    const amicabilities = players.map(p => p.amicability)
    const avgAmicability = amicabilities.reduce((a, b) => a + b, 0) / amicabilities.length
    const variance = amicabilities.reduce((sum, a) => sum + Math.pow(a - avgAmicability, 2), 0) / amicabilities.length
    const stdDev = Math.sqrt(variance)

    let amicabilityBonus = 0
    if (stdDev < 10) amicabilityBonus = 20
    else if (stdDev < 20) amicabilityBonus = 10

    // Weighted formula
    const chemistry = (roleBalance * 0.3) + (avgTeamwork * 0.5) + (amicabilityBonus * 0.2)

    return Math.min(100, Math.max(0, chemistry))
}

/**
 * Staff effect calculations based on level
 */
export const STAFF_EFFECTS = {
    COACH: {
        tacticBonus: (level: number) => 2 * level,           // 2-10
        moraleStability: (level: number) => 0.1 * level,     // 10-50%
    },
    ANALYST: {
        mapVetoAdvantage: (level: number) => 0.05 * level,   // 5-25%
    },
    PSYCHOLOGIST: {
        moraleRecoverySpeed: (level: number) => 0.1 * level, // 10-50%
        stressReduction: (level: number) => 0.1 * level,     // 10-50%
    },
} as const

/**
 * Create a coach with level-based effects
 */
export function createCoach(id: string, name: string, level: number, salary: number): Coach {
    return {
        id,
        name,
        type: StaffType.COACH,
        level: Math.min(5, Math.max(1, level)),
        salary,
        contractWeeksRemaining: 52, // 1 year default
        tacticBonus: STAFF_EFFECTS.COACH.tacticBonus(level),
        moraleStability: STAFF_EFFECTS.COACH.moraleStability(level),
    }
}

/**
 * Create an analyst with level-based effects
 */
export function createAnalyst(id: string, name: string, level: number, salary: number): Analyst {
    return {
        id,
        name,
        type: StaffType.ANALYST,
        level: Math.min(5, Math.max(1, level)),
        salary,
        contractWeeksRemaining: 52,
        mapVetoAdvantage: STAFF_EFFECTS.ANALYST.mapVetoAdvantage(level),
    }
}

/**
 * Create a psychologist with level-based effects
 */
export function createPsychologist(id: string, name: string, level: number, salary: number): Psychologist {
    return {
        id,
        name,
        type: StaffType.PSYCHOLOGIST,
        level: Math.min(5, Math.max(1, level)),
        salary,
        contractWeeksRemaining: 52,
        moraleRecoverySpeed: STAFF_EFFECTS.PSYCHOLOGIST.moraleRecoverySpeed(level),
        stressReduction: STAFF_EFFECTS.PSYCHOLOGIST.stressReduction(level),
    }
}
