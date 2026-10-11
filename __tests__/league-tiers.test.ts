/**
 * League tiers are world-rank bands (Phase 4.8; C_TIER entry division from
 * C8). New orgs (team-creator: elo 800, C_TIER) start at the bottom band, so
 * the ZERO_TO_HERO achievement (start C → reach S) stays reachable.
 */

import { LeagueEngine, LEAGUE_TIERS, TIER_DISPLAY } from "@/engine/league-engine"
import { AIManager } from "@/engine/ai-manager"
import type { GameSave } from "@/engine/save-types"

describe("league tiers — rank bands with a C_TIER entry division", () => {
    test("getTierFromRank: S 1-16, A 17-48, B 49-111, C below in the 198-club world", () => {
        const tier = (rank: number) => LeagueEngine.getTierFromRank(rank, 198)
        expect([1, 16].map(tier)).toEqual(["S_TIER", "S_TIER"])
        expect([17, 48].map(tier)).toEqual(["A_TIER", "A_TIER"])
        expect([49, 111].map(tier)).toEqual(["B_TIER", "B_TIER"])
        expect([112, 198].map(tier)).toEqual(["C_TIER", "C_TIER"])
    })

    test("C_TIER is the bottom — can't relegate below it, but its best clubs are in the promotion zone", () => {
        const save = {
            teams: [
                { id: "a", elo: 940, leagueTier: "C_TIER", name: "A" },
                { id: "b", elo: 900, leagueTier: "C_TIER", name: "B" },
                { id: "c", elo: 850, leagueTier: "C_TIER", name: "C" },
                { id: "d", elo: 800, leagueTier: "C_TIER", name: "D" },
            ],
        } as unknown as GameSave
        LeagueEngine.refreshWorldRankings(save)
        // Guard: relegation from the bottom tier is impossible.
        expect(LeagueEngine.getRelegationZone(save, LEAGUE_TIERS.C_TIER)).toEqual([])
        // The top of C ranks inside a higher band, so it would go up.
        expect(LeagueEngine.getPromotionZone(save, LEAGUE_TIERS.C_TIER).map(t => t.id)).toContain("a")
    })

    test("TIER_DISPLAY has a C_TIER entry so the UI never reads undefined", () => {
        expect(TIER_DISPLAY.C_TIER).toBeDefined()
        expect(TIER_DISPLAY.C_TIER.shortLabel).toBe("C")
        expect(TIER_DISPLAY.C_TIER.label).toBe("C-Tier")
    })
})

describe("initializeTeamData — rank bands on a new career and on load", () => {
    const team = (id: string, elo: number, extra: Record<string, unknown> = {}) =>
        ({ id, name: id, elo, reputation: 50, ...extra }) as never

    test("a new org at the bottom of the ranking starts in C_TIER", () => {
        const save = {
            currentWeek: 1,
            teams: [
                team("player", 800, { leagueTier: "C_TIER" }),
                ...Array.from({ length: 45 }, (_, i) => team(`ai${i}`, 1500 - i)),
            ],
        } as unknown as GameSave
        AIManager.initializeTeamData(save)
        expect(save.teams.find(t => t.id === "player")!.leagueTier).toBe("C_TIER")
    })

    test("clubs without a tier (or with Elo-threshold tiers from an old save) get their rank band", () => {
        const save = {
            currentWeek: 30,
            teams: [
                team("low", 700),
                ...Array.from({ length: 45 }, (_, i) => team(`ai${i}`, 1500 - i, { leagueTier: "S_TIER" })),
            ],
        } as unknown as GameSave
        AIManager.initializeTeamData(save)
        const count = (tier: string) => save.teams.filter(t => t.leagueTier === tier).length
        // 46 clubs: S = round(0.08 x 46) = 4, A up to 11, B up to 26, C the rest.
        expect([count("S_TIER"), count("A_TIER"), count("B_TIER"), count("C_TIER")]).toEqual([4, 7, 15, 20])
        expect(save.teams.find(t => t.id === "low")!.leagueTier).toBe("C_TIER")
        expect(save.teams.find(t => t.id === "ai0")!.leagueTier).toBe("S_TIER")
    })

    test("a banded save is left alone on load, so a reload never moves a club mid-season", () => {
        const save = {
            currentWeek: 30,
            teams: Array.from({ length: 46 }, (_, i) => team(`ai${i}`, 1500 - i)),
        } as unknown as GameSave
        AIManager.initializeTeamData(save)
        // Mid-season the order changes (results), tiers stay until season end.
        const last = save.teams[45]
        last.elo = 2000
        AIManager.initializeTeamData(save)
        expect(last.worldRanking).toBe(1)
        expect(last.leagueTier).toBe("C_TIER")
    })
})
