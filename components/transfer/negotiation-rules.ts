/**
 * Pure rules of a player-signing negotiation (useNegotiation): the hidden
 * price bands, the odds shown for an offer and what the offer controls allow.
 * Kept free of React and the store so they can be tested on their own.
 */
import { NO_CLAUSES, wageWithClauses, type ClauseTerms } from "@/engine/contract-clauses"
import { negotiationBaseWage } from "@/engine/recruitment"
import type { PlayerSaveData, TeamSaveData } from "@/engine/save-types"

/** The club's hidden price is uniform in this band x its asking value. */
export const FEE_BAND = [0.9, 1.1] as const
/** The player's hidden minimum is uniform in this band x his base wage. */
export const WAGE_BAND = [0.9, 1.2] as const
/** An offer within 3% of the hidden price is accepted. */
export const ACCEPT_WITHIN = 0.97

/** Probability that `ratio` (offer / centre) clears a floor drawn uniformly from `band`, accepted within 3%. */
export function bandChance(ratio: number, band: readonly [number, number]): number {
    if (!Number.isFinite(ratio) || ratio <= 0) return 0
    const effective = ratio / ACCEPT_WITHIN
    return Math.max(0, Math.min(1, (effective - band[0]) / (band[1] - band[0])))
}

export interface FeeSanction { maxFee: number; fraction: number }

/** Most the manager may offer as a fee: his funds, and no more than the board sanctions (MARKET-02). */
export function maxFeeOffer(budget: number, sanction: FeeSanction): number {
    return Math.max(0, Math.floor(Math.min(budget, sanction.maxFee)))
}

/** A typed fee, clamped to what may be offered. */
export function clampFeeOffer(value: number, budget: number, sanction: FeeSanction): number {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(Math.floor(value), maxFeeOffer(budget, sanction)))
}

/**
 * Why a fee can't be offered, or null when it can. A fee above the board's
 * limit is blocked here, not after the contract is signed (MARKET-02).
 */
export function feeOfferBlock(offer: number, budget: number, sanction: FeeSanction): "enterFee" | "overFunds" | "overBoard" | null {
    if (offer <= 0) return "enterFee"
    if (offer > budget) return "overFunds"
    if (offer > sanction.maxFee) return "overBoard"
    return null
}

/** The opening fee: the club's asking value, within what may be offered (MARKET-17). */
export function initialFeeOffer(askingValue: number, budget: number, sanction: FeeSanction): number {
    return Math.max(0, Math.round(Math.min(askingValue, maxFeeOffer(budget, sanction))))
}

/**
 * The wage the player accepts at a given point of his hidden band: his base
 * wage x the band point, with the clauses counted after (the acceptance rule).
 * Clause credits are fixed sums, so the band has to be built through this, not
 * by scaling wageWithClauses(base) (MARKET-10).
 */
export function wageThreshold(baseBeforeClauses: number, variance: number, clauses: ClauseTerms): number {
    return Math.round(wageWithClauses(baseBeforeClauses * variance, clauses))
}

/** Lowest wage the player accepts for a hidden band point (accepted within 3%). */
export function acceptedWage(baseBeforeClauses: number, variance: number, clauses: ClauseTerms): number {
    return wageThreshold(baseBeforeClauses, variance, clauses) * ACCEPT_WITHIN
}

/** Where the player's hidden minimum can sit, after the 3% grace: [lowest, sure]. */
export function wageRange(baseBeforeClauses: number, clauses: ClauseTerms): [number, number] {
    return [
        Math.ceil(acceptedWage(baseBeforeClauses, WAGE_BAND[0], clauses)),
        Math.ceil(acceptedWage(baseBeforeClauses, WAGE_BAND[1], clauses)),
    ]
}

/** Probability that the player accepts `offer`: the share of his hidden band it clears. */
export function wageChance(offer: number, baseBeforeClauses: number, clauses: ClauseTerms): number {
    if (!(offer > 0)) return 0
    const [lo, hi] = WAGE_BAND
    if (acceptedWage(baseBeforeClauses, hi, clauses) <= offer) return 1
    if (acceptedWage(baseBeforeClauses, lo, clauses) > offer) return 0
    // The threshold rises with the band point: find where it passes the offer.
    let a: number = lo, b: number = hi
    for (let i = 0; i < 40; i++) {
        const mid = (a + b) / 2
        if (acceptedWage(baseBeforeClauses, mid, clauses) <= offer) a = mid
        else b = mid
    }
    return (a - lo) / (hi - lo)
}

export interface DurationPref { minWeeks: number; maxWeeks: number; idealWeeks: number }

/** He asks a little more the further the length is from the one he wants (0.95 at his ideal). */
export function durationWageFactor(duration: number, pref: DurationPref): number {
    const distFromIdeal = Math.abs(duration - pref.idealWeeks) / Math.max(1, pref.maxWeeks - pref.minWeeks)
    return 0.95 + distFromIdeal * 0.10
}

/**
 * The wage he signs for with certainty at his preferred length and no clauses:
 * the "Wage ask" shown before a negotiation, from the same rule the
 * negotiation accepts by (MARKET-08).
 */
export function signingWageAsk(player: PlayerSaveData, currentWeek: number, buyer?: Pick<TeamSaveData, "reputation"> & Partial<Pick<TeamSaveData, "leagueTier">>): number {
    return wageRange(negotiationBaseWage(player, currentWeek, buyer) * 0.95, NO_CLAUSES)[1]
}
