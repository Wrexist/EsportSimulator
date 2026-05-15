/**
 * Coverage for engine/match/live-match-init.ts (Phase L5).
 *
 * Pins the two pure data builders used by useLiveMatch's init effect
 * for fresh (non-restored) live matches: buildFreshLiveResult zeroes
 * out a baseResult's maps so the live runner plays them round-by-round
 * starting from 0-0, and buildInitialSimState constructs a brand-new
 * SimState with all streaks at zero.
 */

import { buildFreshLiveResult, buildInitialSimState } from "@/engine/match/live-match-init"
import type { MatchResult } from "@/types"

function makeBaseResult(overrides: Partial<MatchResult> = {}): MatchResult {
    return {
        winnerId: "home",
        homeScore: 2,
        awayScore: 1,
        maps: [
            { map: "DUST2", finalScore: { team1: 13, team2: 7 }, rounds: [{ winner: "HOME" } as any], homeScore: 13, awayScore: 7 } as any,
            { map: "MIRAGE", finalScore: { team1: 9, team2: 13 }, rounds: [{ winner: "AWAY" } as any], homeScore: 9, awayScore: 13 } as any,
            { map: "INFERNO", finalScore: { team1: 13, team2: 10 }, rounds: [{ winner: "HOME" } as any], homeScore: 13, awayScore: 10 } as any,
        ],
        ...overrides,
    } as MatchResult
}

describe("buildFreshLiveResult", () => {
    test("zeroes every map's scores + rounds + winner", () => {
        const result = buildFreshLiveResult({
            baseResult: makeBaseResult(),
            canonicalMaps: ["DUST2", "MIRAGE", "INFERNO"] as any,
            homeTeamId: "h", awayTeamId: "a",
            seed: 1,
        })

        for (const m of result.maps ?? []) {
            expect((m as any).homeScore).toBe(0)
            expect((m as any).awayScore).toBe(0)
            expect((m as any).rounds).toEqual([])
            expect((m as any).winner).toBeUndefined()
            expect((m as any).finalScore).toEqual({ team1: 0, team2: 0 })
        }
    })

    test("resets series-level scores: winnerId null, both scores 0", () => {
        const result = buildFreshLiveResult({
            baseResult: makeBaseResult({ winnerId: "home", homeScore: 2, awayScore: 1 }),
            canonicalMaps: ["DUST2", "MIRAGE", "INFERNO"] as any,
            homeTeamId: "h", awayTeamId: "a",
            seed: 1,
        })

        expect(result.winnerId).toBeNull()
        expect(result.homeScore).toBe(0)
        expect(result.awayScore).toBe(0)
    })

    test("returned maps length matches canonicalMaps length", () => {
        const result = buildFreshLiveResult({
            baseResult: makeBaseResult(),
            canonicalMaps: ["DUST2", "MIRAGE"] as any, // BO3-but-only-2 (edge case)
            homeTeamId: "h", awayTeamId: "a",
            seed: 1,
        })
        expect(result.maps?.length).toBe(2)
    })
})

describe("buildInitialSimState", () => {
    test("all streaks + scores + momentum start at zero", () => {
        const state = buildInitialSimState({
            homeEconomy: {}, awayEconomy: {},
            homeStartsCT: true,
        })

        expect(state.homeWinStreak).toBe(0)
        expect(state.awayWinStreak).toBe(0)
        expect(state.homeLossStreak).toBe(0)
        expect(state.awayLossStreak).toBe(0)
        expect(state.homeRounds).toBe(0)
        expect(state.awayRounds).toBe(0)
        expect(state.homeSeriesScore).toBe(0)
        expect(state.awaySeriesScore).toBe(0)
        expect(state.homeMomentumScore).toBe(0)
        expect(state.awayMomentumScore).toBe(0)
    })

    test("currentMapIndex starts at 0, currentRound at 1", () => {
        const state = buildInitialSimState({
            homeEconomy: {}, awayEconomy: {},
            homeStartsCT: true,
        })
        expect(state.currentMapIndex).toBe(0)
        expect(state.currentRound).toBe(1)
    })

    test("not in overtime; OT set 0", () => {
        const state = buildInitialSimState({
            homeEconomy: {}, awayEconomy: {},
            homeStartsCT: true,
        })
        expect(state.isOvertime).toBe(false)
        expect(state.currentOTSet).toBe(0)
    })

    test("homeStartsCT flag is propagated correctly", () => {
        const ctSide = buildInitialSimState({ homeEconomy: {}, awayEconomy: {}, homeStartsCT: true })
        const tSide = buildInitialSimState({ homeEconomy: {}, awayEconomy: {}, homeStartsCT: false })
        expect(ctSide.homeStartsCT).toBe(true)
        expect(tSide.homeStartsCT).toBe(false)
    })

    test("economies are pinned by reference (not copied)", () => {
        const homeEcon = { p1: { id: "p1", cash: 800, weapon: "usp", hasArmor: false, hasHelmet: false, hasKit: false, utility: [] } }
        const awayEcon = { a1: { id: "a1", cash: 800, weapon: "glock", hasArmor: false, hasHelmet: false, hasKit: false, utility: [] } }
        const state = buildInitialSimState({ homeEconomy: homeEcon as any, awayEconomy: awayEcon as any, homeStartsCT: true })

        // Same reference — caller's mutations are reflected in the sim state.
        expect(state.homeEconomy).toBe(homeEcon)
        expect(state.awayEconomy).toBe(awayEcon)
    })
})
