/**
 * Coverage for engine/processors/match-achievement-flags.ts.
 *
 * Pins comeback + underdog detection extracted in Phase M6 from
 * atomic-week-processor.processMatches. These flags drive
 * achievement tracking — silent regression would make
 * "comeback master" / "giant slayer" achievements unreachable.
 *
 * Comeback definition: team was DOWN by 9+ rounds at any point in
 * a map AND ended up winning that map.
 *
 * Underdog definition: winning team's worldRanking is 20+ positions
 * worse than the loser's. Missing rank defaults to 99.
 */

import {
    detectComebackWin,
    detectUnderdogWin,
    detectAchievementFlags,
} from "@/engine/processors/match-achievement-flags"

function buildMap(roundWins: string[], finalScore: { team1: number; team2: number }) {
    return {
        rounds: roundWins.map(w => ({ winningTeamId: w })),
        finalScore,
    }
}

describe("detectComebackWin", () => {
    test("no maps → false", () => {
        expect(detectComebackWin({ maps: [], homeScore: 0, awayScore: 0 }, "home")).toBe(false)
        expect(detectComebackWin({ homeScore: 0, awayScore: 0 } as any, "home")).toBe(false)
    })

    test("team down 9+ rounds and won → true (classic 3-12 → 13-12)", () => {
        // First 15 rounds: away wins 12, home wins 3 (down 9).
        // Remaining 10 rounds: home wins all 10 → final 13-12 home.
        const roundWins: string[] = []
        for (let i = 0; i < 3; i++) roundWins.push("home")
        for (let i = 0; i < 12; i++) roundWins.push("away")
        for (let i = 0; i < 10; i++) roundWins.push("home")

        const result = {
            maps: [buildMap(roundWins, { team1: 13, team2: 12 })],
            homeScore: 1, awayScore: 0,
        }
        expect(detectComebackWin(result, "home")).toBe(true)
    })

    test("team down 8 rounds (not 9+) and won → false (under threshold)", () => {
        const roundWins: string[] = []
        for (let i = 0; i < 4; i++) roundWins.push("home")
        for (let i = 0; i < 12; i++) roundWins.push("away") // home down 8 → 4-12
        for (let i = 0; i < 9; i++) roundWins.push("home")  // home wins 13-12

        const result = {
            maps: [buildMap(roundWins, { team1: 13, team2: 12 })],
            homeScore: 1, awayScore: 0,
        }
        expect(detectComebackWin(result, "home")).toBe(false)
    })

    test("team down 9+ but LOST → false (must win the map)", () => {
        const roundWins: string[] = []
        for (let i = 0; i < 3; i++) roundWins.push("home")
        for (let i = 0; i < 13; i++) roundWins.push("away") // away wins 13-3

        const result = {
            maps: [buildMap(roundWins, { team1: 3, team2: 13 })],
            homeScore: 0, awayScore: 1,
        }
        expect(detectComebackWin(result, "home")).toBe(false)
    })

    test("BO3 — comeback on any single map triggers flag", () => {
        // Map 1: normal home loss (no comeback).
        // Map 2: NO comeback (home wins easily).
        // Map 3: away comeback (3-12 → 13-12).
        const map1 = buildMap(["home"], { team1: 13, team2: 0 })
        const map2 = buildMap(["home"], { team1: 13, team2: 0 })

        const awayComebackRounds: string[] = []
        for (let i = 0; i < 3; i++) awayComebackRounds.push("away")
        for (let i = 0; i < 12; i++) awayComebackRounds.push("home") // away down 9
        for (let i = 0; i < 10; i++) awayComebackRounds.push("away") // away wins 13-12

        const map3 = buildMap(awayComebackRounds, { team1: 12, team2: 13 })

        const result = {
            maps: [map1, map2, map3],
            homeScore: 2, awayScore: 1,
        }
        expect(detectComebackWin(result, "home")).toBe(true)
    })

    test("missing finalScore on a map → that map skipped (no crash)", () => {
        const map = { rounds: [{ winningTeamId: "home" }], finalScore: undefined as any }
        const result = { maps: [map], homeScore: 1, awayScore: 0 }
        expect(detectComebackWin(result, "home")).toBe(false)
    })

    test("empty rounds array → no comeback (no deficit ever observed)", () => {
        const result = {
            maps: [buildMap([], { team1: 13, team2: 0 })],
            homeScore: 1, awayScore: 0,
        }
        expect(detectComebackWin(result, "home")).toBe(false)
    })
})

describe("detectUnderdogWin", () => {
    test("winner ranked 20+ positions worse than loser → underdog win", () => {
        // Home rank 30 (worse) beats Away rank 5 (better) → underdog.
        const result = { homeScore: 1, awayScore: 0 } as any
        expect(detectUnderdogWin(result, { worldRanking: 30 }, { worldRanking: 5 })).toBe(true)
    })

    test("winner ranked exactly 20 worse → underdog (boundary)", () => {
        const result = { homeScore: 1, awayScore: 0 } as any
        expect(detectUnderdogWin(result, { worldRanking: 25 }, { worldRanking: 5 })).toBe(true)
    })

    test("winner ranked 19 worse (not 20+) → NOT underdog (boundary)", () => {
        const result = { homeScore: 1, awayScore: 0 } as any
        expect(detectUnderdogWin(result, { worldRanking: 24 }, { worldRanking: 5 })).toBe(false)
    })

    test("winner ranked higher → NOT underdog (favorite winning)", () => {
        const result = { homeScore: 1, awayScore: 0 } as any
        expect(detectUnderdogWin(result, { worldRanking: 1 }, { worldRanking: 30 })).toBe(false)
    })

    test("missing ranking → 99 default for both teams (no underdog match)", () => {
        const result = { homeScore: 1, awayScore: 0 } as any
        expect(detectUnderdogWin(result, {}, {})).toBe(false)
    })

    test("ranked team beats unranked: ranked is better, so unranked is the underdog if it wins", () => {
        // Away has rank 5 (better), home is unranked (99). Home wins.
        // Home (rank 99) - Away (rank 5) = 94 ≥ 20 → home is the underdog.
        const result = { homeScore: 1, awayScore: 0 } as any
        expect(detectUnderdogWin(result, {}, { worldRanking: 5 })).toBe(true)
    })

    test("away winning side: same boundary logic applies", () => {
        const result = { homeScore: 0, awayScore: 1 } as any
        expect(detectUnderdogWin(result, { worldRanking: 3 }, { worldRanking: 25 })).toBe(true)
    })

    test("draw (homeScore === awayScore) → never an underdog win", () => {
        const result = { homeScore: 1, awayScore: 1 } as any
        expect(detectUnderdogWin(result, { worldRanking: 99 }, { worldRanking: 1 })).toBe(false)
    })
})

describe("detectAchievementFlags (composition)", () => {
    test("returns both flags computed independently", () => {
        // Build a result that triggers BOTH comeback (home down 9+ then wins)
        // AND underdog (home rank 30, away rank 5).
        const roundWins: string[] = []
        for (let i = 0; i < 3; i++) roundWins.push("home")
        for (let i = 0; i < 12; i++) roundWins.push("away")
        for (let i = 0; i < 10; i++) roundWins.push("home")
        const result = {
            maps: [buildMap(roundWins, { team1: 13, team2: 12 })],
            homeScore: 1, awayScore: 0,
        } as any

        const flags = detectAchievementFlags(
            result,
            { id: "home", worldRanking: 30 },
            { worldRanking: 5 },
        )
        expect(flags.comebackWin).toBe(true)
        expect(flags.underdogWin).toBe(true)
    })

    test("both false when neither condition met", () => {
        const result = {
            maps: [buildMap(["home", "home"], { team1: 13, team2: 0 })],
            homeScore: 1, awayScore: 0,
        } as any
        const flags = detectAchievementFlags(
            result,
            { id: "home", worldRanking: 1 },
            { worldRanking: 30 },
        )
        expect(flags.comebackWin).toBe(false)
        expect(flags.underdogWin).toBe(false)
    })
})
