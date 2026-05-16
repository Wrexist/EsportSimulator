/**
 * Academy Constants
 * Phase 1: Level progression, costs, and configuration values
 */

import { AcademyLevelInfo, ScoutingTier, AcademyTrainingDrill } from "../types/academy"

import { Crosshair, Zap, Users, Brain, Target, Heart } from "lucide-react"

// ===== ACADEMY DRILLS =====

export const ACADEMY_DRILLS: AcademyTrainingDrill[] = [
    {
        id: "aim_intensive",
        name: "Aim Lab",
        statFocus: ["skill", "rifle", "pistol", "reaction"],
        xpGain: 18,
        energyCost: 12,
        minLevel: 1,
        icon: Crosshair,
        bgColor: "bg-rose-500/20",
        color: "text-rose-400"
    },
    {
        id: "util_expert",
        name: "Utility Flow",
        statFocus: ["grenades", "tactic"],
        xpGain: 15,
        energyCost: 10,
        minLevel: 1,
        icon: Zap,
        bgColor: "bg-amber-500/20",
        color: "text-amber-400"
    },
    {
        id: "scrim_high",
        name: "Scrimmage",
        statFocus: ["teamwork", "trading"],
        xpGain: 25,
        energyCost: 18,
        minLevel: 2,
        icon: Users,
        bgColor: "bg-blue-500/20",
        color: "text-blue-400"
    },
    {
        id: "demo_vod",
        name: "VOD Review",
        statFocus: ["tactic", "creativity"],
        xpGain: 12,
        energyCost: 5,
        minLevel: 2,
        icon: Brain,
        bgColor: "bg-purple-500/20",
        color: "text-purple-400"
    },
    {
        id: "clutch_pit",
        name: "1v1 Duels",
        statFocus: ["skill", "clutch", "stressResistance"],
        xpGain: 20,
        energyCost: 15,
        minLevel: 3,
        icon: Target,
        bgColor: "bg-red-500/20",
        color: "text-red-400"
    },
    {
        id: "zen_rest",
        name: "Active Recovery",
        statFocus: ["health", "endurance"],
        xpGain: 5,
        energyCost: -15, // Recovers energy
        minLevel: 3,
        icon: Heart,
        bgColor: "bg-emerald-500/20",
        color: "text-emerald-400"
    }
]

// ===== ENERGY CONFIGURATION =====

export const ENERGY_CONFIG = {
    maxEnergy: 100,
    matchCost: 15,
    starterRecovery: 25,    // Base weekly recovery for starters
    benchRecovery: 45,     // resting bonus for non-starters
    fatigueThreshold: 15,  // Below this, XP is penalized
    fatiguePenalty: 0.8,   // 20% XP penalty
    exhaustionLimit: 5     // Cannot play matches below this
} as const

// ===== BALANCING CONFIGURATION =====

export const BALANCING_CONFIG = {
    // How much OVR difference affects win probability (0.008 = 0.8% per OVR point)
    winProbFactor: 0.008,
    maxWinProb: 0.92,
    minWinProb: 0.08,

    // MR12 Match Scores
    mr12WinRounds: 13,
    mr12MaxRounds: 24,
} as const

// ===== ACADEMY LEVEL CONFIGURATION =====

export const ACADEMY_LEVELS: Record<number, AcademyLevelInfo> = {
    1: {
        name: "Youth Camp",
        maxProspects: 3,
        devBonus: 1.05,
        buildCost: 25000,
        weeklyCost: 2000,
        perks: ["Basic Training", "Local Scouting"],
        description: "A modest training ground for promising local talents."
    },
    2: {
        name: "Development Center",
        maxProspects: 5,
        devBonus: 1.15,
        buildCost: 75000,
        weeklyCost: 5000,
        perks: ["+15% Dev Speed", "Regional Scouting", "Dev Matches"],
        description: "Professional setup with dedicated coaching staff."
    },
    3: {
        name: "Elite Academy",
        maxProspects: 8,
        devBonus: 1.30,
        buildCost: 150000,
        weeklyCost: 12000,
        perks: ["+30% Dev Speed", "Pro Equipment", "Hidden Stat Reveal"],
        description: "World-class facilities rivaling tier-1 organizations."
    },
    4: {
        name: "Esports Institute",
        maxProspects: 12,
        devBonus: 1.50,
        buildCost: 300000,
        weeklyCost: 25000,
        perks: ["+50% Dev Speed", "International Scouting", "Fast-Track Promo"],
        description: "A full esports institute producing championship-caliber talent."
    },
    5: {
        name: "Legacy Factory",
        maxProspects: 15,
        devBonus: 1.75,
        buildCost: 500000,
        weeklyCost: 40000,
        perks: ["+75% Dev Speed", "Legendary Prospects", "Instant Potential Reveal"],
        description: "The crown jewel of esports development. Legends are born here."
    }
} as const

// ===== SCOUTING COSTS =====

export const SCOUTING_COSTS: Record<ScoutingTier, number> = {
    LOCAL: 5000,        // Same country
    REGIONAL: 15000,    // Same continent
    INTERNATIONAL: 35000 // Global search
} as const

// Weeks to complete scouting mission
export const SCOUTING_DURATIONS: Record<ScoutingTier, number> = {
    LOCAL: 1,        // 1 week
    REGIONAL: 2,     // 2 weeks
    INTERNATIONAL: 4 // 4 weeks
} as const

// ===== SCOUTING TIER UNLOCK REQUIREMENTS =====

export const SCOUTING_TIER_REQUIREMENTS: Record<ScoutingTier, number> = {
    LOCAL: 1,           // Unlocked at academy level 1
    REGIONAL: 2,        // Unlocked at academy level 2
    INTERNATIONAL: 4    // Unlocked at academy level 4
} as const

// ===== PROSPECT GENERATION =====

export const PROSPECT_CONFIG = {
    ageRange: { min: 15, max: 18 },

    // Base stat ranges by age (younger = lower base, higher potential)
    statRangesByAge: {
        15: { base: { min: 30, max: 45 }, potential: { min: 70, max: 95 } },
        16: { base: { min: 35, max: 50 }, potential: { min: 65, max: 92 } },
        17: { base: { min: 40, max: 55 }, potential: { min: 60, max: 88 } },
        18: { base: { min: 45, max: 60 }, potential: { min: 55, max: 85 } }
    } as Record<number, { base: { min: number; max: number }; potential: { min: number; max: number } }>,

    // Role stat bonuses (primary stat gets +15-25)
    roleStatBonus: { min: 15, max: 25 },

    // Variance applied to each stat
    statVariance: 5
} as const

// ===== DEVELOPMENT CONFIGURATION =====

export const DEVELOPMENT_CONFIG = {
    // Base XP per week from training
    baseWeeklyXP: 50,

    // XP bonus from development matches
    matchXPBonus: 75,

    // XP bonus for MVP of development match
    mvpXPBonus: 25,

    // Stat improvement per 100 XP (varies by training focus)
    statGainPer100XP: 0.3,

    // Development progress per 100 XP gained
    progressPer100XP: 2,

    // Threshold to be considered "ready for promotion"
    promotionThreshold: 85
} as const

// ===== DEVELOPMENT MATCH CONFIG =====

export const DEV_MATCH_CONFIG = {
    // Budget cost to schedule a development match
    matchCost: 2500,

    // Minimum academy level required
    minAcademyLevel: 2,

    // Number of prospects required to play
    minProspects: 3,

    // Generated opponent names (random selection)
    opponentNames: [
        "Rising Stars Academy",
        "Talent Forge",
        "Next Gen Gaming",
        "Youth United",
        "Prodigy Camp",
        "Future Legends",
        "Aspire Academy",
        "Elite Youth",
        "Greenhorn Gaming",
        "Academy All-Stars"
    ]
} as const

// ===== WEEKLY COSTS =====

export const ACADEMY_WEEKLY_COSTS = {
    // Per-prospect stipend (weekly)
    prospectStipend: 500,

    // Training materials per prospect
    trainingMaterials: 200
} as const

// Maximum number of scounted players awaiting review
export const PENDING_POOL_MAX_SIZE = 5

// ===== HELPER FUNCTIONS =====

/**
 * Get academy level info, returns null for level 0
 */
export function getAcademyLevelInfo(level: number): AcademyLevelInfo | null {
    if (level < 1 || level > 5) return null
    return ACADEMY_LEVELS[level]
}

/**
 * Get upgrade cost from current level to next
 */
export function getUpgradeCost(currentLevel: number): number {
    const nextLevel = currentLevel + 1
    if (nextLevel > 5) return 0
    return ACADEMY_LEVELS[nextLevel].buildCost
}

/**
 * Calculate total weekly operating cost
 */
export function calculateWeeklyUpkeep(level: number, prospectCount: number): number {
    if (level < 1) return 0
    const levelInfo = ACADEMY_LEVELS[level]
    const baseCost = levelInfo.weeklyCost
    const prospectCosts = prospectCount * (ACADEMY_WEEKLY_COSTS.prospectStipend + ACADEMY_WEEKLY_COSTS.trainingMaterials)
    return baseCost + prospectCosts
}

/**
 * Manager-level thresholds for scouting tier unlock. Acts as a parallel
 * path: a player with a high-level manager can access better scouting
 * tiers without needing the corresponding academy facility level. The
 * tier unlocks if EITHER gate is met.
 */
export const SCOUTING_TIER_MANAGER_REQUIREMENTS: Record<ScoutingTier, number> = {
    LOCAL: 1,
    REGIONAL: 5,
    INTERNATIONAL: 10,
} as const

/**
 * Check if a scouting tier is unlocked. Manager level acts as a parallel
 * gate alongside academy level — meet either threshold to unlock.
 */
export function isScoutingTierUnlocked(
    tier: ScoutingTier,
    academyLevel: number,
    managerLevel: number = 1,
): boolean {
    return academyLevel >= SCOUTING_TIER_REQUIREMENTS[tier]
        || managerLevel >= SCOUTING_TIER_MANAGER_REQUIREMENTS[tier]
}
