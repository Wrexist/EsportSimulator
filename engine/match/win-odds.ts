/**
 * Pre-match win chance (C1 "honest odds").
 *
 * A logistic curve over the two things the engine actually plays with:
 *   - the duel-rating gap: each side's mean rifle aim points plus condition
 *     (form, morale, energy, fatigue), from the same profiles the rounds use;
 *   - the non-player edge gap (staff, prep, counter, chemistry...), capped at
 *     ±10% exactly as the engine caps it.
 * Day form, side and the round dice are what the curve leaves to chance.
 *
 * The coefficients are FITTED to simulated matches between the game's own
 * clubs and CHECKED on separate ones (scripts/odds/win-odds-calibration.ts;
 * report: docs/revamp/calibration/WIN_ODDS_2026-10.md). Re-run that script
 * and update WIN_ODDS_FIT whenever match tuning changes; the calibration test
 * keeps the curve inside its measured band.
 */

import type { MapId } from "@/types"
import type { LegacySeriesContext } from "./legacy-series"
import { aimPoints, buildProfile } from "./round-sim/profile"
import { cappedEdge } from "./round-sim/team-edge"

/** Fitted 2026-10-24 on 5,902 simulated maps (sight engine, main 18577654 tuning). */
export const WIN_ODDS_FIT = {
    /** Log-odds per duel-rating point of mean gap. */
    rating: 0.19,
    /** Log-odds per 1.0 of capped team edge (0.10 = the cap). */
    edge: 2.5,
} as const

/** The check the match screen quotes: an independent set of simulated maps. */
export const WIN_ODDS_CHECK = {
    maps: 4424,
    /** Mean gap between shown and actual win rate, per 10% bucket weighted by maps (points). */
    meanErrorPts: 0.9,
} as const

export interface WinOddsInputs {
    /** Home mean duel rating minus away's (points). */
    ratingGap: number
    /** Capped non-player edge, home minus away. */
    edgeGap: number
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

/** Mean rifle aim points + condition of a lineup, from the series profiles. */
function lineupRating(ctx: LegacySeriesContext, side: "home" | "away"): number {
    const s = ctx[side]
    const profiles = s.players.map(p => ctx.script?.[side].profiles.get(p.id) ?? buildProfile(p))
    if (!profiles.length) return 0
    return profiles.reduce((sum, prof) => sum + aimPoints(prof, "rifle") + prof.condition, 0) / profiles.length
}

export function winOddsInputs(ctx: LegacySeriesContext): WinOddsInputs {
    const edge = ctx.script ? cappedEdge(ctx.script.home.edge.total, ctx.script.away.edge.total) : 0
    return { ratingGap: lineupRating(ctx, "home") - lineupRating(ctx, "away"), edgeGap: edge }
}

/** Chance the home side wins one map. */
export function mapWinChance(inputs: WinOddsInputs, fit: { rating: number; edge: number } = WIN_ODDS_FIT): number {
    return sigmoid(fit.rating * inputs.ratingGap + fit.edge * inputs.edgeGap)
}

/** Chance to win a best-of-N from per-map chances (maps in play order; missing maps use the mean). */
export function seriesWinChance(mapChances: readonly number[], bestOf: number): number {
    const need = Math.floor(bestOf / 2) + 1
    if (bestOf <= 1) return mapChances[0] ?? 0.5
    const mean = mapChances.length ? mapChances.reduce((a, b) => a + b, 0) / mapChances.length : 0.5
    const p = (i: number) => mapChances[i] ?? mean
    // Walk the maps: state = (our wins, their wins).
    let states = new Map<string, number>([["0:0", 1]])
    let win = 0
    for (let i = 0; i < bestOf; i++) {
        const next = new Map<string, number>()
        for (const [key, prob] of states) {
            const [w, l] = key.split(":").map(Number)
            const add = (k: string, v: number) => next.set(k, (next.get(k) ?? 0) + v)
            if (w + 1 === need) win += prob * p(i); else add(`${w + 1}:${l}`, prob * p(i))
            if (l + 1 !== need) add(`${w}:${l + 1}`, prob * (1 - p(i)))
        }
        states = next
    }
    return win
}

export interface MatchWinOdds {
    /** Home side's chance per map, in the series' map order. */
    maps: { map: MapId; home: number }[]
    /** Home side's chance to win the series. */
    series: number
}

/** The home side's win chances for a prepared series (same context the match is played with). */
export function matchWinOdds(ctx: LegacySeriesContext, bestOf: number): MatchWinOdds {
    const home = mapWinChance(winOddsInputs(ctx))
    const maps = ctx.maps.map(map => ({ map, home }))
    return { maps, series: seriesWinChance(maps.map(m => m.home), bestOf) }
}
