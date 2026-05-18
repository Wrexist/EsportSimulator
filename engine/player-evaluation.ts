/**
 * Player Evaluation Engine
 * 
 * Implements 5-layer player evaluation model from Thecore:
 * 1. Base Skill Score (raw ability)
 * 2. Role Fit Score (role-specific)
 * 3. Context Modifiers (form/fatigue/morale)
 * 4. Reliability Factor (consistency)
 * 5. Future Value (age + potential)
 * 
 * Plus Pro Reputation Scoring for transfer value
 */

import { PlayerSaveData } from "./save-types"

// ===== TYPES =====

export interface PlayerEvaluation {
    baseSkill: number           // Layer 1: Raw ability (0-100)
    roleFit: number             // Layer 2: Role-specific fit (0-100)
    contextModifier: number     // Layer 3: Current form multiplier (0.75-1.25)
    reliability: number         // Layer 4: Consistency factor (0-1)
    futureValue: number         // Layer 5: Investment potential (0-100)

    // Composite scores
    matchDayRating: number      // In-match effectiveness
    transferValue: number       // Market value in $
    overallRating: number       // Simplified display rating (0-100)
}

export interface ProTop20Entry {
    year: number
    rank: number
}

// ===== LAYER 1: BASE SKILL SCORE =====

/**
 * Calculate base skill from raw stats (role-agnostic)
 * This answers: "How good is this player in a vacuum?"
 */
export function calculateBaseSkill(player: PlayerSaveData): number {
    const stats = [
        { value: player.rifle ?? 50, weight: 0.25 },
        { value: player.awp ?? 50, weight: 0.20 },
        { value: player.pistol ?? 50, weight: 0.10 },
        { value: player.grenades ?? 50, weight: 0.10 },
        { value: player.reaction ?? 50, weight: 0.15 },
        { value: player.clutch ?? 50, weight: 0.10 },
        { value: player.skill ?? 50, weight: 0.10 },
    ]

    // Drop the 2 weakest stats so specialists aren't punished
    // (e.g. a rifler with awp=0 shouldn't lose 20% of their score)
    stats.sort((a, b) => a.value - b.value)
    const top5 = stats.slice(2)
    const totalWeight = top5.reduce((s, v) => s + v.weight, 0)
    const score = top5.reduce((s, v) => s + v.value * v.weight, 0) / totalWeight

    return Math.round(Math.min(99, Math.max(1, score)))
}

// ===== LAYER 2: ROLE FIT SCORE =====

type PlayerRole = "AWPer" | "Entry" | "IGL" | "Support" | "Lurker" | "Rifler" | "Star" | string

/**
 * Role-specific stat weights
 * A great rifler can be a bad AWPer - this prevents "one-stat gods"
 */
const ROLE_WEIGHTS: Record<string, Record<string, number>> = {
    AWPer: {
        awp: 0.45,
        reaction: 0.20,
        clutch: 0.15,
        stressResistance: 0.10,
        skill: 0.10,
    },
    IGL: {
        leader: 0.30,
        tactic: 0.25,
        teamwork: 0.20,
        stressResistance: 0.15,
        rifle: 0.10,
    },
    Entry: {
        reaction: 0.30,
        rifle: 0.25,
        skill: 0.20,
        stressResistance: 0.15,
        creativity: 0.10,
    },
    Support: {
        grenades: 0.30,
        teamwork: 0.25,
        tactic: 0.20,
        rifle: 0.15,
        leader: 0.10,
    },
    Lurker: {
        clutch: 0.30,
        creativity: 0.25,
        rifle: 0.20,
        tactic: 0.15,
        stressResistance: 0.10,
    },
    Rifler: {
        rifle: 0.35,
        skill: 0.25,
        reaction: 0.20,
        clutch: 0.10,
        teamwork: 0.10,
    },
    Star: {
        skill: 0.30,
        rifle: 0.25,
        clutch: 0.20,
        reaction: 0.15,
        creativity: 0.10,
    },
}

/**
 * Calculate role-specific fit score
 * This answers: "How good is this player at what they're supposed to do?"
 */
export function calculateRoleFit(player: PlayerSaveData): number {
    // Normalize role string (remove duplicates, get primary role)
    const rawRole = player.role || "Rifler"
    const primaryRole = rawRole.split(",")[0].trim()

    // Map common role variations
    let normalizedRole = "Rifler"
    if (primaryRole.toLowerCase().includes("awp") || primaryRole.toLowerCase().includes("sniper")) {
        normalizedRole = "AWPer"
    } else if (primaryRole.toLowerCase().includes("igl") || primaryRole.toLowerCase().includes("leader")) {
        normalizedRole = "IGL"
    } else if (primaryRole.toLowerCase().includes("entry")) {
        normalizedRole = "Entry"
    } else if (primaryRole.toLowerCase().includes("support")) {
        normalizedRole = "Support"
    } else if (primaryRole.toLowerCase().includes("lurk")) {
        normalizedRole = "Lurker"
    } else if (primaryRole.toLowerCase().includes("star")) {
        normalizedRole = "Star"
    }

    const weights = ROLE_WEIGHTS[normalizedRole] || ROLE_WEIGHTS.Rifler

    let score = 0
    for (const [stat, weight] of Object.entries(weights)) {
        const value = (player as unknown as Record<string, number>)[stat] ?? 50
        score += value * weight
    }

    return Math.round(Math.min(99, Math.max(1, score)))
}

// ===== LAYER 3: CONTEXT MODIFIERS =====

/**
 * Calculate current-state multiplier
 * This answers: "How good is the player right now?"
 * 
 * Modifiers are multiplicative and small (never exceed ±25% total)
 */
export function calculateContextModifier(player: PlayerSaveData): number {
    // Form bonus: ±10%
    const formBonus = ((player.form || 50) - 50) / 500 // -0.1 to +0.1

    // Fatigue penalty: up to -15%
    const fatiguePenalty = (player.fatigue || 0) / 666 // 0 to 0.15

    // Morale bonus: ±8%
    const moraleBonus = ((player.morale || 50) - 50) / 625 // -0.08 to +0.08

    // Health/injury penalty: up to -30%
    const healthPenalty = player.injury ? 0.30 : 0

    const modifier = (1 + formBonus) * (1 - fatiguePenalty) * (1 + moraleBonus) * (1 - healthPenalty)

    // Clamp to 0.75-1.25 range
    return Math.min(1.25, Math.max(0.75, modifier))
}

// ===== LAYER 4: RELIABILITY / CONSISTENCY =====

/**
 * Calculate reliability factor
 * This answers: "Can I trust this player?"
 * 
 * High reliability = boring but valuable
 * Low reliability = boom/bust players
 */
export function calculateReliability(player: PlayerSaveData): number {
    const stressResistance = player.stressResistance ?? 50
    const productivity = player.productivity ?? 50

    const reliabilityScore = (stressResistance * 0.5 + productivity * 0.5) / 100

    // Returns 0.85 to 1.0 multiplier
    return 0.85 + reliabilityScore * 0.15
}

// ===== LAYER 5: POTENTIAL & AGE (Future Value) =====

/**
 * Calculate future/investment value
 * This answers: "Is this player worth investing in?"
 * 
 * Used for: Transfers, Scouting, AI roster planning
 * Should NOT affect match-day strength
 */
export function calculateFutureValue(player: PlayerSaveData, baseSkill: number): number {
    const age = player.age || 25
    const potential = player.potential || baseSkill

    // Age factor: young players get bonus, older players get penalty
    let ageFactor = 1.0
    if (age < 20) ageFactor = 1.3
    else if (age < 23) ageFactor = 1.2
    else if (age < 26) ageFactor = 1.0
    else if (age < 29) ageFactor = 0.85
    else if (age < 32) ageFactor = 0.7
    else ageFactor = 0.5

    // Growth room: difference between potential and current skill
    const growthRoom = Math.max(0, potential - baseSkill) / 100

    const futureValue = baseSkill * ageFactor * (1 + growthRoom * 0.5)

    return Math.round(Math.min(99, Math.max(1, futureValue)))
}

// ===== Pro REPUTATION SCORING =====

/**
 * Convert Pro rank to base reputation value
 * Top 3 matters way more than 15-20
 */
function rankToBaseValue(rank: number): number {
    if (rank <= 3) return 100
    if (rank <= 5) return 90
    if (rank <= 10) return 75
    if (rank <= 15) return 60
    return 45 // 16-20
}

/**
 * Year decay for Pro rankings
 * Front-loaded toward recent years, aggressive decay
 */
function yearDecay(yearDiff: number): number {
    if (yearDiff <= 0) return 1.0
    if (yearDiff === 1) return 0.6
    if (yearDiff === 2) return 0.35
    if (yearDiff === 3) return 0.15
    return 0.05
}

/**
 * Calculate Pro reputation score (0-100)
 * Used for transfer value, AI interest, media attention
 */
export function calculateProReputationScore(
    proHistory: ProTop20Entry[] | undefined,
    currentYear: number = 2025,
    currentWeek?: number
): number {
    // Derive year from game week if provided
    if (currentWeek !== undefined && currentYear === 2025) {
        currentYear = 2025 + Math.floor((currentWeek - 1) / 52)
    }
    if (!proHistory || proHistory.length === 0) {
        return 0
    }

    let weightedSum = 0
    let weightTotal = 0

    for (const entry of proHistory) {
        const yearDiff = currentYear - entry.year
        if (yearDiff < 0) continue

        const baseValue = rankToBaseValue(entry.rank)
        const weight = yearDecay(yearDiff)

        weightedSum += baseValue * weight
        weightTotal += weight
    }

    if (weightTotal === 0) return 0

    return Math.min(Math.round(weightedSum / weightTotal), 100)
}

// ===== MARKET VALUE CALCULATION =====

/**
 * Calculate player market value in dollars
 * Based on: overallRating (cubic curve), futureValue, role scarcity, reliability, Pro prestige
 */
export function calculateMarketValue(
    evaluation: Omit<PlayerEvaluation, "transferValue" | "overallRating">,
    player: PlayerSaveData,
    proScore: number = 0,
    overallRating?: number
): number {
    // Use overallRating (the display value, which includes confidence/prestige
    // adjustments) so prices feel consistent with what the user sees.
    // Falls back to matchDayRating for backward compatibility.
    const effectiveRating = overallRating ?? evaluation.matchDayRating

    // Cubic curve: $50k floor at OVR≤25, scaling to ~$8M base at OVR 100.
    // After role/Pro multipliers, top players reach $15-20M+.
    const normalizedRating = Math.max(0, (effectiveRating - 25)) / 75
    const baseValue = 50_000 + Math.pow(normalizedRating, 3) * 8_000_000

    // Future value multiplier (young + high potential = premium)
    const futureMultiplier = 0.7 + (evaluation.futureValue / 100) * 0.6

    // Role scarcity multiplier (AWPers and IGLs are more valuable)
    let roleMultiplier = 1.0
    const role = (player.role || "").toLowerCase()
    if (role.includes("awp")) roleMultiplier = 1.3
    else if (role.includes("igl") || role.includes("leader")) roleMultiplier = 1.25
    else if (role.includes("star")) roleMultiplier = 1.2

    // Multi-role versatility bonus (15% boost)
    if (player.secondaryRole) {
        roleMultiplier *= 1.15
    }

    // Reliability bonus (consistent players = safer investments)
    const reliabilityBonus = evaluation.reliability

    // Pro reputation bonus (up to +50% for elite players)
    const proBonus = 1 + (proScore / 200)

    const totalValue = baseValue * futureMultiplier * roleMultiplier * reliabilityBonus * proBonus

    // Round to nearest $10k
    return Math.round(totalValue / 10000) * 10000
}

// ===== MAIN EVALUATION FUNCTION =====

/**
 * Full player evaluation - returns all layers and composite scores
 */
export function evaluatePlayer(
    player: PlayerSaveData,
    proHistory?: ProTop20Entry[],
    currentYear: number = 2025,
    currentWeek?: number
): PlayerEvaluation {
    // Derive year from game week if provided
    if (currentWeek !== undefined && currentYear === 2025) {
        currentYear = 2025 + Math.floor((currentWeek - 1) / 52)
    }
    // Layer 1: Base skill
    const baseSkill = calculateBaseSkill(player)

    // Layer 2: Role fit
    const roleFit = calculateRoleFit(player)

    // Layer 3: Context modifiers
    const contextModifier = calculateContextModifier(player)

    // Layer 4: Reliability
    const reliability = calculateReliability(player)

    // Layer 5: Future value
    const futureValue = calculateFutureValue(player, baseSkill)

    // Pro reputation (use player's stored history if not passed)
    const effectiveHistory = proHistory ?? player.proHistory
    let proScore = calculateProReputationScore(effectiveHistory, currentYear)
    // Fallback: use stored prestigeScore when proHistory yields nothing
    if (proScore === 0 && player.prestigeScore) {
        proScore = player.prestigeScore
    }

    // Composite: Match-day rating
    const matchDayRating = Math.round(
        baseSkill * 0.4 +
        roleFit * 0.4 +
        (contextModifier * 10) + // Context as small bonus
        (reliability * 10)
    )

    // ===== EXPERIENCE & PRESTIGE FACTOR FOR OVR =====
    // Unknown players with few matches should not top rankings

    // Experience factor based on matches played (0.7 to 1.0)
    // New players (0 matches) get 0.7 multiplier
    // Experienced players (500+ matches) get full 1.0
    const matchesPlayed = player.matchesPlayed || 0
    const experienceFactor = Math.min(1.0, 0.85 + (matchesPlayed / 667)) // 100 matches = full experience

    // Prestige bonus: Proven players get up to +25 OVR (non-linear)
    // prestige 95 → +23, prestige 65 → +13, prestige 20 → +2, prestige 0 → 0
    const prestigeBonus = Math.pow(proScore / 100, 1.5) * 25

    // Confidence modifier: How "proven" is this rating?
    // High prestige + high matches = high confidence = full rating
    // Low prestige + low matches = low confidence = reduced rating
    const confidenceFactor = experienceFactor * 0.4 + (proScore / 100) * 0.6 // 0.34 to 1.0
    const confidenceMultiplier = 0.92 + (confidenceFactor * 0.08) // 0.92 to 1.0

    // Composite: Overall rating (current ability + prestige, no futureValue)
    // futureValue is for transfers/scouting only, not display OVR
    const rawOverall =
        baseSkill * 0.50 +
        roleFit * 0.35 +
        prestigeBonus

    // Apply confidence multiplier to prevent unknown players from topping charts
    const overallRating = Math.min(99, Math.max(1, Math.round(rawOverall * confidenceMultiplier)))

    const partialEval = {
        baseSkill,
        roleFit,
        contextModifier,
        reliability,
        futureValue,
        matchDayRating: Math.min(99, Math.max(1, matchDayRating)),
    }

    // Composite: Transfer value (uses overallRating for price consistency with UI)
    const transferValue = calculateMarketValue(partialEval, player, proScore, overallRating)

    return {
        ...partialEval,
        transferValue,
        overallRating,
    }
}

// ===== FOR SALE DETERMINATION =====

/**
 * Determine if a player is available for transfer
 * ~30% of players randomly available
 * Based on: team ranking, player rating, random variance
 */
export function isPlayerForSale(
    player: PlayerSaveData,
    evaluation: PlayerEvaluation,
    teamWorldRanking: number = 50,
    seed?: number
): boolean {
    // Use deterministic "random" based on player ID if no seed
    const hash = seed ?? player.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    const pseudoRandom = (hash * 9301 + 49297) % 233280 / 233280

    // Base chance: 30%
    let chance = 0.30

    // Low-rated players more likely for sale
    if (evaluation.overallRating < 60) chance += 0.15
    else if (evaluation.overallRating > 85) chance -= 0.20

    // Players on low-ranked teams more likely for sale
    if (teamWorldRanking > 30) chance += 0.10
    else if (teamWorldRanking < 10) chance -= 0.10

    // Older players more likely for sale
    if ((player.age || 25) > 28) chance += 0.10

    return pseudoRandom < Math.min(0.60, Math.max(0.10, chance))
}
