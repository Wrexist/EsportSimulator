/**
 * Prestige System for CS2 Esports Manager (Phase 6)
 * Implements the user-defined "Pro Prestige" model.
 * 
 * CORE RULES:
 * - 7-year rolling window (0-6 years ago)
 * - Non-linear decay for older years
 * - Rank-based value curve (Top 3 > Top 20 > Top 100)
 * - Confidence modifier (Top 20 > Top 100)
 */

import { ProRankingEntry } from "@/types/player"

/**
 * Calculates the weight of a ranking based on how many years ago it happened.
 * Non-linear decay: 1.0 -> 0.65 -> 0.42 -> 0.26 -> 0.15 -> 0.08 -> 0.04
 */
export function getYearWeight(yearDiff: number): number {
    const weights = [1.0, 0.65, 0.42, 0.26, 0.15, 0.08, 0.04]
    return weights[yearDiff] ?? 0
}

/**
 * Calculates the base value of a rank.
 * Curve is steep at the top to reward elite peak performance.
 */
export function getRankBaseValue(rank: number): number {
    if (rank <= 3) return 100
    if (rank <= 5) return 92
    if (rank <= 10) return 82
    if (rank <= 20) return 70
    if (rank <= 30) return 55
    if (rank <= 50) return 40
    if (rank <= 75) return 28
    if (rank <= 100) return 18
    return 0
}

/**
 * Modifies value based on confidence in the ranking source.
 * Top 20 is heavily curated/editorialized (High confidence).
 * Top 100 is often stat-based (Lower confidence).
 */
export function getConfidenceModifier(rank: number): number {
    if (rank <= 20) return 1.0
    if (rank <= 50) return 0.75
    return 0.6
}

/**
 * Calculates the final Pro Prestige Score (0-100).
 * This score represents "Historical Excellence" and is used for:
 * - Transfer Value
 * - AI Interest
 * - Media / Fanbase
 * 
 * It does NOT affect match simulation RNG.
 */
export function calculateProPrestigeScore(
    proHistory: ProRankingEntry[] | undefined,
    currentYear: number
): number {
    if (!proHistory || proHistory.length === 0) return 0

    let weightedSum = 0
    let weightTotal = 0

    for (const entry of proHistory) {
        const yearDiff = currentYear - entry.year

        // Ignore future years or years older than 6 years ago
        if (yearDiff < 0 || yearDiff > 6) continue

        const yearW = getYearWeight(yearDiff)
        const base = getRankBaseValue(entry.rank)
        const confidence = getConfidenceModifier(entry.rank)

        const value = base * confidence * yearW

        weightedSum += value
        weightTotal += yearW
    }

    // Prevent division by zero if all entries were filtered out
    if (weightTotal === 0) return 0

    const score = weightedSum / weightTotal

    // Hard cap to 100
    return Math.min(Math.round(score), 100)
}

/**
 * Returns a qualitative label for a given prestige score.
 * Use this in UI instead of the raw number.
 */
export function getPrestigeLabel(score: number): string {
    if (score >= 90) return "Global Superstar"
    if (score >= 80) return "World-Class"
    if (score >= 70) return "Elite"
    if (score >= 60) return "Star Player"
    if (score >= 50) return "Established Pro"
    if (score >= 40) return "Proven Competitor"
    if (score >= 30) return "Notable Name"
    if (score >= 10) return "Rising Talent"
    return "Unknown"
}
