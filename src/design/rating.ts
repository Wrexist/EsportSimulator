/**
 * Colour meaning for numbers (design system v2).
 *
 * Ratings use a quiet ladder — grey → white → mint → green → gold — so a low
 * attribute reads as "weak", not as an error. Red is reserved for real
 * problems (injury, expiring contract, negative money), never for a stat.
 */

export type RatingBand = "low" | "mid" | "good" | "high" | "elite"

export function ratingBand(value: number): RatingBand {
    if (value >= 90) return "elite"
    if (value >= 75) return "high"
    if (value >= 60) return "good"
    if (value >= 40) return "mid"
    return "low"
}

export const RATING_TEXT: Record<RatingBand, string> = {
    low: "text-rating-low",
    mid: "text-rating-mid",
    good: "text-rating-good",
    high: "text-rating-high",
    elite: "text-rating-elite",
}

export type ConditionTone = "positive" | "neutral" | "caution" | "negative"

/** Condition meters (morale, form, energy): higher is better. */
export function conditionTone(value: number): ConditionTone {
    if (value >= 70) return "positive"
    if (value >= 40) return "neutral"
    if (value >= 20) return "caution"
    return "negative"
}

export const CONDITION_FILL: Record<ConditionTone, string> = {
    positive: "bg-positive",
    neutral: "bg-ink-2",
    caution: "bg-caution",
    negative: "bg-negative",
}
