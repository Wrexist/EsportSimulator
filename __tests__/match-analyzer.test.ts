/**
 * Tests for MatchAnalyzer.analyze — the post-match insight pipeline
 * that the result page reads. Outputs a MatchAnalysis with
 * summary text, primary-factor classification, and three ratings
 * (economy / aim / utility) on a 0-99 scale.
 *
 * Pinning the public contract: returns sane shapes for plausible
 * match results, factor classification routes to the right branch
 * for clutch/pistol/firepower scenarios.
 */

import { MatchAnalyzer } from "@/engine/match-analyzer"
import type { MatchResult, PlayerStats } from "@/types"

function makePlayerStats(
    overrides: Partial<PlayerStats> = {}
): PlayerStats {
    return {
        kills: 20,
        deaths: 15,
        assists: 5,
        adr: 80,
        kast: 70,
        rating: 1.10,
        clutches: 0,
        openingKills: 3,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    } as PlayerStats
}

interface RoundLike {
    winner: "ct" | "t"
    ctTeamId?: string
    tTeamId?: string
}

interface MapResultLike {
    name: string
    finalScore: { ct: number; t: number }
    rounds: RoundLike[]
    mvp?: string
}

function makeMatchResult(opts: {
    homeScore: number
    awayScore: number
    homePlayerStats: Record<string, PlayerStats>
    awayPlayerStats: Record<string, PlayerStats>
    /** Optional explicit map summary; defaults to a single map */
    maps?: MapResultLike[]
}): MatchResult {
    return {
        homeScore: opts.homeScore,
        awayScore: opts.awayScore,
        playerStats: { ...opts.homePlayerStats, ...opts.awayPlayerStats },
        maps: opts.maps ?? [
            {
                name: "Mirage",
                finalScore: { ct: opts.homeScore, t: opts.awayScore },
                rounds: Array.from({ length: opts.homeScore + opts.awayScore }, (_, i) => ({
                    winner: i % 2 === 0 ? "ct" : "t",
                    ctTeamId: "home", tTeamId: "away",
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                }) as any),
            },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as unknown as MatchResult
}

describe("MatchAnalyzer.analyze — return shape", () => {
    test("produces a non-empty summary + a known keyFactor + ratings in [0, 99]", () => {
        const result = makeMatchResult({
            homeScore: 16, awayScore: 10,
            homePlayerStats: {
                h1: makePlayerStats(), h2: makePlayerStats(),
                h3: makePlayerStats(), h4: makePlayerStats(), h5: makePlayerStats(),
            },
            awayPlayerStats: {
                a1: makePlayerStats(), a2: makePlayerStats(),
                a3: makePlayerStats(), a4: makePlayerStats(), a5: makePlayerStats(),
            },
        })
        const analysis = MatchAnalyzer.analyze(
            { id: "m1", homeTeamId: "home", awayTeamId: "away" },
            result,
            "Home", "Away",
            [{ id: "h1" }, { id: "h2" }, { id: "h3" }, { id: "h4" }, { id: "h5" }],
            [{ id: "a1" }, { id: "a2" }, { id: "a3" }, { id: "a4" }, { id: "a5" }],
        )
        expect(analysis.summary.length).toBeGreaterThan(0)
        expect(["CLUTCH", "ECONOMY", "FIREPOWER", "TRADING"]).toContain(analysis.keyFactor)
        for (const rating of [analysis.teamPerformance.economyRating, analysis.teamPerformance.aimRating, analysis.teamPerformance.utilityRating]) {
            expect(rating).toBeGreaterThanOrEqual(0)
            expect(rating).toBeLessThanOrEqual(99)
            expect(Number.isFinite(rating)).toBe(true)
        }
    })
})

describe("MatchAnalyzer — keyFactor classification", () => {
    test("CLUTCH path fires when winner has 2+ more clutches than loser", () => {
        const result = makeMatchResult({
            homeScore: 16, awayScore: 14,
            homePlayerStats: {
                h1: makePlayerStats({ clutches: 2 }),
                h2: makePlayerStats({ clutches: 2 }),
                h3: makePlayerStats(), h4: makePlayerStats(), h5: makePlayerStats(),
            },
            awayPlayerStats: {
                a1: makePlayerStats(), a2: makePlayerStats(),
                a3: makePlayerStats(), a4: makePlayerStats(), a5: makePlayerStats(),
            },
        })
        const analysis = MatchAnalyzer.analyze(
            { id: "m1", homeTeamId: "home", awayTeamId: "away" },
            result, "Home", "Away",
            [{ id: "h1" }, { id: "h2" }, { id: "h3" }, { id: "h4" }, { id: "h5" }],
            [{ id: "a1" }, { id: "a2" }, { id: "a3" }, { id: "a4" }, { id: "a5" }],
        )
        expect(analysis.keyFactor).toBe("CLUTCH")
        expect(analysis.winningFactor.toLowerCase()).toContain("clutch")
    })

    test("FIREPOWER path fires when winner's avgRating exceeds loser by 0.15+", () => {
        const result = makeMatchResult({
            homeScore: 16, awayScore: 8,
            homePlayerStats: {
                h1: makePlayerStats({ rating: 1.50 }),
                h2: makePlayerStats({ rating: 1.50 }),
                h3: makePlayerStats({ rating: 1.50 }),
                h4: makePlayerStats({ rating: 1.50 }),
                h5: makePlayerStats({ rating: 1.50 }),
            },
            awayPlayerStats: {
                a1: makePlayerStats({ rating: 0.80 }),
                a2: makePlayerStats({ rating: 0.80 }),
                a3: makePlayerStats({ rating: 0.80 }),
                a4: makePlayerStats({ rating: 0.80 }),
                a5: makePlayerStats({ rating: 0.80 }),
            },
        })
        const analysis = MatchAnalyzer.analyze(
            { id: "m1", homeTeamId: "home", awayTeamId: "away" },
            result, "Home", "Away",
            [{ id: "h1" }, { id: "h2" }, { id: "h3" }, { id: "h4" }, { id: "h5" }],
            [{ id: "a1" }, { id: "a2" }, { id: "a3" }, { id: "a4" }, { id: "a5" }],
        )
        expect(analysis.keyFactor).toBe("FIREPOWER")
    })
})

describe("MatchAnalyzer — edge cases", () => {
    test("zero deaths on winner side doesn't divide-by-zero (K/D defaults sanely)", () => {
        const result = makeMatchResult({
            homeScore: 16, awayScore: 0,
            homePlayerStats: {
                h1: makePlayerStats({ kills: 20, deaths: 0 }),
                h2: makePlayerStats({ kills: 20, deaths: 0 }),
                h3: makePlayerStats({ kills: 20, deaths: 0 }),
                h4: makePlayerStats({ kills: 20, deaths: 0 }),
                h5: makePlayerStats({ kills: 20, deaths: 0 }),
            },
            awayPlayerStats: {
                a1: makePlayerStats({ kills: 0, deaths: 16 }),
                a2: makePlayerStats({ kills: 0, deaths: 16 }),
                a3: makePlayerStats({ kills: 0, deaths: 16 }),
                a4: makePlayerStats({ kills: 0, deaths: 16 }),
                a5: makePlayerStats({ kills: 0, deaths: 16 }),
            },
        })
        const analysis = MatchAnalyzer.analyze(
            { id: "m1", homeTeamId: "home", awayTeamId: "away" },
            result, "Home", "Away",
            [{ id: "h1" }, { id: "h2" }, { id: "h3" }, { id: "h4" }, { id: "h5" }],
            [{ id: "a1" }, { id: "a2" }, { id: "a3" }, { id: "a4" }, { id: "a5" }],
        )
        expect(Number.isFinite(analysis.teamPerformance.aimRating)).toBe(true)
        expect(analysis.teamPerformance.aimRating).toBeLessThanOrEqual(99)
    })

    test("empty player-stats object doesn't crash (returns reasonable defaults)", () => {
        const result = makeMatchResult({
            homeScore: 16, awayScore: 14,
            homePlayerStats: {},
            awayPlayerStats: {},
        })
        const analysis = MatchAnalyzer.analyze(
            { id: "m1", homeTeamId: "home", awayTeamId: "away" },
            result, "Home", "Away", [], [],
        )
        expect(analysis.summary.length).toBeGreaterThan(0)
        expect(Number.isFinite(analysis.teamPerformance.economyRating)).toBe(true)
        expect(Number.isFinite(analysis.teamPerformance.aimRating)).toBe(true)
        expect(Number.isFinite(analysis.teamPerformance.utilityRating)).toBe(true)
    })

    test("zero rounds on a map doesn't break the rounds-scanning loop", () => {
        const result = makeMatchResult({
            homeScore: 16, awayScore: 8,
            homePlayerStats: { h1: makePlayerStats() },
            awayPlayerStats: { a1: makePlayerStats() },
            maps: [
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                { name: "Mirage", finalScore: { ct: 16, t: 8 }, rounds: [] } as any,
            ],
        })
        const analysis = MatchAnalyzer.analyze(
            { id: "m1", homeTeamId: "home", awayTeamId: "away" },
            result, "Home", "Away",
            [{ id: "h1" }], [{ id: "a1" }],
        )
        // Survived; key factor still classified.
        expect(["CLUTCH", "ECONOMY", "FIREPOWER", "TRADING"]).toContain(analysis.keyFactor)
    })
})
