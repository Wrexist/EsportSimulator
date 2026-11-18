/**
 * Tests for MatchAnalyzer.analyze — the post-match insight pipeline
 * that /stats reads. Outputs a MatchAnalysis with summary text, the
 * primary-factor classification and the winning / losing lines.
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
    test("produces a non-empty summary + a known keyFactor, and no teamPerformance ratings (MATCHENGINE-09)", () => {
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
        expect(analysis).not.toHaveProperty("teamPerformance")
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
    test("zero deaths on winner side doesn't break the analysis", () => {
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
        expect(analysis.keyFactor).toBe("FIREPOWER")
        expect(analysis.summary.length).toBeGreaterThan(0)
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
        expect(analysis.winningFactor.length).toBeGreaterThan(0)
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

// MATCHENGINE-01: homeScore/awayScore are maps won; the summary must read the
// rounds from result.maps, and the economy factor must work for either winner.
describe("MatchAnalyzer — summary reads rounds, not the series score", () => {
    const roster = (prefix: string) => Object.fromEntries([1, 2, 3, 4, 5].map(i => [`${prefix}${i}`, makePlayerStats()]))
    const ids = (prefix: string) => [1, 2, 3, 4, 5].map(i => ({ id: `${prefix}${i}` }))
    /**
     * One map; `pistolWinner` takes rounds 1 and 13 and converts them (rounds 2-3
     * and 14-15, MATCHENGINE-10 of 2026-11-17), the others go to whoever still has rounds left.
     */
    function map(home: number, away: number, pistolWinner?: "home" | "away") {
        const winners: ("home" | "away")[] = []
        let h = home, a = away
        for (let i = 0; i < home + away; i++) {
            const forced = [0, 1, 2, 12, 13, 14].includes(i) ? pistolWinner : undefined
            const pick = forced === "home" && h > 0 ? "home"
                : forced === "away" && a > 0 ? "away"
                : (forced === "home" ? a > 0 : !(h > 0 && (forced === "away" || h >= a))) ? "away" : "home"
            winners.push(pick)
            if (pick === "home") h--; else a--
        }
        return {
            name: "Mirage", homeScore: home, awayScore: away,
            rounds: winners.map((w, i) => ({ roundNumber: i + 1, winner: w === "home" ? "ct" : "t", ctTeam: "home", tTeam: "away" })),
        }
    }
    const analyze = (homeMaps: number, awayMaps: number, maps: ReturnType<typeof map>[]) => MatchAnalyzer.analyze(
        { id: "m1", homeTeamId: "home", awayTeamId: "away" },
        { homeScore: homeMaps, awayScore: awayMaps, playerStats: { ...roster("h"), ...roster("a") }, maps } as unknown as MatchResult,
        "Home", "Away", ids("h"), ids("a"),
    )

    test("a BO1 rout shows the map score and is not 'tightly contested'", () => {
        const a = analyze(1, 0, [map(13, 4)])
        expect(a.summary).toContain("Home secure the 13-4 win")
        expect(a.summary).toMatch(/^A crushing victory as /)
    })

    test("an away BO1 win shows the winner's rounds first", () => {
        const a = analyze(0, 1, [map(3, 13)])
        expect(a.summary).toContain("Away secure the 13-3 win")
        expect(a.summary).toMatch(/^A crushing victory as /)
    })

    test("a close BO1 is tightly contested; a series shows the maps", () => {
        expect(analyze(1, 0, [map(13, 11)]).summary).toMatch(/^In a tightly contested battle, Home secure the 13-11 win/)
        const series = analyze(2, 1, [map(13, 2), map(5, 13), map(13, 3)])
        expect(series.summary).toContain("Home secure the 2-1 win")
        expect(series.summary).not.toMatch(/crushing/)
    })

    test("the economy factor works for an away winner and reads as a noun phrase", () => {
        const away = analyze(0, 1, [map(10, 13, "away")])
        expect(away.keyFactor).toBe("ECONOMY")
        expect(away.summary).toContain("The match was defined by pistol-round snowballs.")
        expect(analyze(1, 0, [map(13, 10, "home")]).keyFactor).toBe("ECONOMY")
    })
})

// MATCHENGINE-03: "better trading" only when the winner made more trade kills.
describe("MatchAnalyzer — the trading verdict reads the trade kills", () => {
    const roster = (prefix: string) => Object.fromEntries([1, 2, 3, 4, 5].map(i => [`${prefix}${i}`, makePlayerStats()]))
    const ids = (prefix: string) => [1, 2, 3, 4, 5].map(i => ({ id: `${prefix}${i}` }))
    const kill = (killer: string, isTrade: boolean) => ({ type: "KILL", time: 30, playerId: killer, isTrade })
    /** A 13-11 home win, no pistol edge, even ratings; `trades` = [home, away] trade kills. */
    function analyze(trades: [number, number]) {
        const rounds = Array.from({ length: 24 }, (_, i) => ({
            roundNumber: i + 1,
            // Rounds 1 and 13 split, so no pistol factor.
            winner: i === 0 ? "ct" : i === 12 ? "t" : (i % 2 === 0 ? "ct" : "t"),
            ctTeam: "home", tTeam: "away",
            events: [] as ReturnType<typeof kill>[],
        }))
        for (let k = 0; k < trades[0]; k++) rounds[k % 24].events.push(kill("h1", true))
        for (let k = 0; k < trades[1]; k++) rounds[k % 24].events.push(kill("a1", true))
        rounds[2].events.push(kill("h2", false), kill("a2", false))
        return MatchAnalyzer.analyze(
            { id: "m1", homeTeamId: "home", awayTeamId: "away" },
            { homeScore: 1, awayScore: 0, playerStats: { ...roster("h"), ...roster("a") }, maps: [{ name: "Mirage", homeScore: 13, awayScore: 11, rounds }] } as unknown as MatchResult,
            "Home", "Away", ids("h"), ids("a"),
        )
    }

    test("the winner traded more: TRADING, with a meaningful losing line", () => {
        const a = analyze([20, 12])
        expect(a.keyFactor).toBe("TRADING")
        expect(a.winningFactor).toBe("Better trade fragging and spacing")
        expect(a.losingFactor).toBe("Lost the trade battle")
    })

    test("the winner traded less (20 against 24): no trading claim", () => {
        const a = analyze([20, 24])
        expect(a.keyFactor).not.toBe("TRADING")
        expect(a.summary).not.toMatch(/trading/)
        expect(a.winningFactor).toBe("Won more of the key duels")
        expect(a.losingFactor).toBe("Came up short in the key duels")
    })

    test("the firepower loser line no longer claims every player was outclassed", () => {
        const result = makeMatchResult({
            homeScore: 16, awayScore: 8,
            homePlayerStats: Object.fromEntries([1, 2, 3, 4, 5].map(i => [`h${i}`, makePlayerStats({ rating: 1.3 })])),
            // The loser has the best player on the server.
            awayPlayerStats: { a1: makePlayerStats({ rating: 1.6 }), ...Object.fromEntries([2, 3, 4, 5].map(i => [`a${i}`, makePlayerStats({ rating: 0.7 })])) },
        })
        const a = MatchAnalyzer.analyze({ id: "m1", homeTeamId: "home", awayTeamId: "away" }, result, "Home", "Away", ids("h"), ids("a"))
        expect(a.keyFactor).toBe("FIREPOWER")
        expect(a.losingFactor).toBe("Outgunned in the aim duels")
    })
})
