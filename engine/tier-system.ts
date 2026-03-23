/**
 * Tier Calculation System
 * 
 * Teams and players have independent tier assignments:
 * - ELITE: Top tier (teams rank 1-35, players OVR 80+)
 * - PRO: Professional tier (teams rank 36-85, players OVR 65-79)
 * - SEMI_PRO: Semi-professional (teams rank 86+, players OVR 50-64)
 * - AMATEUR: Amateur tier (players OVR <50)
 * 
 * Key principle: A player can be ELITE on a SEMI_PRO team
 * (e.g., a star player on a low-ranked team)
 */

export type TierLevel = "ELITE" | "PRO" | "SEMI_PRO" | "AMATEUR"

export interface TierThresholds {
    elite: number
    pro: number
    semiPro: number
}

// Team tier thresholds (based on world ranking position)
export const TEAM_TIER_THRESHOLDS: TierThresholds = {
    elite: 35,    // Rank 1-35 = ELITE
    pro: 85,      // Rank 36-85 = PRO
    semiPro: 150, // Rank 86-150 = SEMI_PRO
    // Beyond 150 = AMATEUR (if we had more teams)
}

// Player tier thresholds (based on overall rating 0-100)
export const PLAYER_TIER_THRESHOLDS: TierThresholds = {
    elite: 80,    // 80+ = ELITE
    pro: 65,      // 65-79 = PRO
    semiPro: 50,  // 50-64 = SEMI_PRO
    // Below 50 = AMATEUR
}

/**
 * Calculate team tier based on world ranking
 */
export function calculateTeamTier(worldRanking: number): TierLevel {
    if (worldRanking <= TEAM_TIER_THRESHOLDS.elite) return "ELITE"
    if (worldRanking <= TEAM_TIER_THRESHOLDS.pro) return "PRO"
    if (worldRanking <= TEAM_TIER_THRESHOLDS.semiPro) return "SEMI_PRO"
    return "AMATEUR"
}

/**
 * Calculate player tier based on overall rating
 * Independent of team tier - a star can shine anywhere
 */
export function calculatePlayerTier(overallRating: number): TierLevel {
    if (overallRating >= PLAYER_TIER_THRESHOLDS.elite) return "ELITE"
    if (overallRating >= PLAYER_TIER_THRESHOLDS.pro) return "PRO"
    if (overallRating >= PLAYER_TIER_THRESHOLDS.semiPro) return "SEMI_PRO"
    return "AMATEUR"
}

/**
 * Display-only tier with team-based floor.
 * Players on ELITE/PRO teams show at minimum SEMI_PRO.
 * Does NOT affect game mechanics (match sim, transfers, AI).
 */
export function getDisplayPlayerTier(overallRating: number, teamTier?: TierLevel): TierLevel {
    const baseTier = calculatePlayerTier(overallRating)
    if (!teamTier) return baseTier

    const TIER_RANK: Record<TierLevel, number> = {
        AMATEUR: 0, SEMI_PRO: 1, PRO: 2, ELITE: 3
    }
    const MIN_TIER: Record<TierLevel, TierLevel> = {
        ELITE: "SEMI_PRO",
        PRO: "SEMI_PRO",
        SEMI_PRO: "AMATEUR",
        AMATEUR: "AMATEUR",
    }

    const floor = MIN_TIER[teamTier] || "AMATEUR"
    return TIER_RANK[baseTier] >= TIER_RANK[floor] ? baseTier : floor
}

/**
 * Get tier display properties (color, label, etc.)
 */
export function getTierStyle(tier: TierLevel): {
    color: string
    bgColor: string
    borderColor: string
    label: string
    shortLabel: string
} {
    switch (tier) {
        case "ELITE":
            return {
                color: "text-amber-400",
                bgColor: "bg-amber-400/10",
                borderColor: "border-amber-400/30",
                label: "Elite",
                shortLabel: "ELT"
            }
        case "PRO":
            return {
                color: "text-purple-400",
                bgColor: "bg-purple-400/10",
                borderColor: "border-purple-400/30",
                label: "Professional",
                shortLabel: "PRO"
            }
        case "SEMI_PRO":
            return {
                color: "text-blue-400",
                bgColor: "bg-blue-400/10",
                borderColor: "border-blue-400/30",
                label: "Semi-Pro",
                shortLabel: "S-PRO"
            }
        case "AMATEUR":
            return {
                color: "text-slate-400",
                bgColor: "bg-slate-400/10",
                borderColor: "border-slate-400/30",
                label: "Amateur",
                shortLabel: "AM"
            }
    }
}

/**
 * Sort teams by reputation and assign world rankings
 */
export function assignTeamRankings<T extends { reputation?: number }>(
    teams: T[]
): (T & { worldRanking: number; tier: TierLevel })[] {
    return teams
        .sort((a, b) => (b.reputation || 0) - (a.reputation || 0))
        .map((team, index) => ({
            ...team,
            worldRanking: index + 1,
            tier: calculateTeamTier(index + 1)
        }))
}
