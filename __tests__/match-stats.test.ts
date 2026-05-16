/**
 * Coverage for engine/match/match-stats.ts.
 *
 * Pins the stats aggregation extracted in Phase I2. The math here drives
 * the scoreboard, rating column, and MVP card after every match — silent
 * regression would either mis-rank players or silently award the wrong
 * MVP for a season.
 */

import {
    determineMapMVP,
    generateMatchStats,
    determineMVP,
} from "@/engine/match/match-stats"
import { SeededRNG } from "@/engine/rng"
import type { Player, MapResult, RoundResult, PlayerMatchStats } from "@/types"

function makePlayer(id: string): Player {
    return { id, nickname: id, skill: 60, tactic: 50 } as unknown as Player
}

function makeRound(killsByPlayer: Record<string, number>, deathsByPlayer: Record<string, number> = {}): RoundResult {
    const kills = Object.entries(killsByPlayer).map(([playerId, kills]) => ({ playerId, kills }))
    const deaths = Object.entries(deathsByPlayer).map(([playerId, deaths]) => ({ playerId, deaths }))
    return {
        roundNumber: 1, winner: "HOME", winType: "ELIMINATION",
        kills, deaths, events: [],
    } as unknown as RoundResult
}

function makeMap(rounds: RoundResult[]): MapResult {
    return { mapId: "DUST2", homeScore: 13, awayScore: 7, rounds } as unknown as MapResult
}

describe("determineMapMVP", () => {
    test("picks the player with the most kills across the map", () => {
        const home = [makePlayer("h1"), makePlayer("h2")]
        const away = [makePlayer("a1")]
        const rounds = [
            makeRound({ h1: 2, a1: 1 }),
            makeRound({ h2: 3, h1: 1 }),
        ]
        // h1=3, h2=3, a1=1. h1 hits 3 first via iteration order.
        const mvp = determineMapMVP(rounds, home, away)
        expect(["h1", "h2"]).toContain(mvp)
    })

    test("falls back to first home player if no kills happened", () => {
        const home = [makePlayer("h1")]
        const away = [makePlayer("a1")]
        const mvp = determineMapMVP([], home, away)
        expect(mvp).toBe("h1")
    })
})

describe("generateMatchStats", () => {
    test("aggregates kills + deaths into the per-player stat block", () => {
        const home = [makePlayer("h1"), makePlayer("h2")]
        const away = [makePlayer("a1"), makePlayer("a2")]

        // Map with 2 rounds.
        const map = makeMap([
            makeRound({ h1: 2, h2: 0 }, { a1: 1, a2: 1 }),
            makeRound({ h1: 1, h2: 1 }, { a1: 1, a2: 1 }),
        ])

        const stats = generateMatchStats(new SeededRNG(1), home, away, [map], /*homeWon*/ true)

        expect(stats["h1"].kills).toBe(3)
        expect(stats["h1"].deaths).toBe(0)
        expect(stats["a1"].kills).toBe(0)
        expect(stats["a1"].deaths).toBe(2)
    })

    test("rating is bounded to [0.3, 2.0]", () => {
        const home = [makePlayer("h1")]
        const away = [makePlayer("a1")]
        // Wildly imbalanced: 30 kills, 0 deaths in 2 rounds.
        const map = makeMap([
            makeRound({ h1: 30 }, { a1: 5 }),
            makeRound({ h1: 30 }, { a1: 5 }),
        ])

        const stats = generateMatchStats(new SeededRNG(1), home, away, [map], true)
        expect(stats["h1"].rating).toBeGreaterThanOrEqual(0.3)
        expect(stats["h1"].rating).toBeLessThanOrEqual(2.0)
    })

    test("deterministic: same seed produces identical rating + ADR jitter", () => {
        const home = [makePlayer("h1")]
        const away = [makePlayer("a1")]
        const map = makeMap([
            makeRound({ h1: 5 }, { a1: 5 }),
            makeRound({ h1: 5 }, { a1: 5 }),
        ])

        const a = generateMatchStats(new SeededRNG(42), home, away, [map], true)
        const b = generateMatchStats(new SeededRNG(42), home, away, [map], true)
        expect(a["h1"].rating).toBe(b["h1"].rating)
        expect(a["h1"].adr).toBe(b["h1"].adr)
    })

    test("zero rounds yields all-zero stat block (no NaN / no crash)", () => {
        const home = [makePlayer("h1")]
        const away = [makePlayer("a1")]

        const stats = generateMatchStats(new SeededRNG(1), home, away, [], true)
        expect(stats["h1"].kills).toBe(0)
        expect(stats["h1"].deaths).toBe(0)
        expect(stats["h1"].adr).toBe(0)
        expect(stats["h1"].kast).toBe(0)
        expect(Number.isFinite(stats["h1"].rating)).toBe(true)
    })

    test("winning side gets a small ADR boost vs losing side", () => {
        const home = [makePlayer("h1")]
        const away = [makePlayer("a1")]
        const map = makeMap([
            makeRound({ h1: 5, a1: 5 }, {}),
            makeRound({ h1: 5, a1: 5 }, {}),
        ])

        // Run with home winning, then with home losing — h1's ADR should
        // shift by the ±5% multiplier.
        const winStats = generateMatchStats(new SeededRNG(42), home, away, [map], /*homeWon*/ true)
        const lossStats = generateMatchStats(new SeededRNG(42), home, away, [map], /*homeWon*/ false)

        expect(winStats["h1"].adr).toBeGreaterThan(lossStats["h1"].adr)
    })
})

describe("determineMVP", () => {
    test("picks the highest-rating player from the winning side", () => {
        const winners = [makePlayer("w1"), makePlayer("w2")]
        const stats: Record<string, PlayerMatchStats> = {
            w1: { rating: 1.2 } as PlayerMatchStats,
            w2: { rating: 1.5 } as PlayerMatchStats,
            l1: { rating: 1.9 } as PlayerMatchStats, // higher but not on winning side
        }
        expect(determineMVP(stats, winners)).toBe("w2")
    })

    test("ignores stats from losing players even if they out-rated winners", () => {
        const winners = [makePlayer("w1")]
        const stats: Record<string, PlayerMatchStats> = {
            w1: { rating: 0.8 } as PlayerMatchStats,
            l1: { rating: 1.9 } as PlayerMatchStats,
        }
        expect(determineMVP(stats, winners)).toBe("w1")
    })

    test("returns empty string when winningPlayers is empty", () => {
        expect(determineMVP({}, [])).toBe("")
    })
})
