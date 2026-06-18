/**
 * C_TIER entry division (C8). Adds a bottom rung below B so new orgs (seeded at
 * elo 800 / C_TIER by team-creator) have a real ladder to climb — and so the
 * dormant ZERO_TO_HERO achievement (start C → reach S) becomes reachable.
 */

import { LeagueEngine, LEAGUE_TIERS, TIER_DISPLAY } from "@/engine/league-engine"
import { AIManager } from "@/engine/ai-manager"
import type { GameSave } from "@/engine/save-types"

describe("league tiers — C_TIER entry division (C8)", () => {
    test("getTierFromElo classifies the full ladder including the new C floor", () => {
        expect(LeagueEngine.getTierFromElo(1500)).toBe("S_TIER")
        expect(LeagueEngine.getTierFromElo(1400)).toBe("S_TIER")
        expect(LeagueEngine.getTierFromElo(1200)).toBe("A_TIER")
        expect(LeagueEngine.getTierFromElo(1100)).toBe("A_TIER")
        expect(LeagueEngine.getTierFromElo(1000)).toBe("B_TIER")
        expect(LeagueEngine.getTierFromElo(950)).toBe("B_TIER")  // B floor
        expect(LeagueEngine.getTierFromElo(949)).toBe("C_TIER")  // just below → C
        expect(LeagueEngine.getTierFromElo(800)).toBe("C_TIER")  // freshly created org
    })

    test("C_TIER is the bottom — can't relegate below it, but can promote up", () => {
        const save = {
            teams: [
                { id: "a", elo: 940, leagueTier: "C_TIER", name: "A" },
                { id: "b", elo: 900, leagueTier: "C_TIER", name: "B" },
                { id: "c", elo: 850, leagueTier: "C_TIER", name: "C" },
                { id: "d", elo: 800, leagueTier: "C_TIER", name: "D" },
            ],
        } as unknown as GameSave
        // Guard: relegation from the bottom tier is impossible (without it the
        // bottom 3 would be returned).
        expect(LeagueEngine.getRelegationZone(save, LEAGUE_TIERS.C_TIER)).toEqual([])
        // But the top of C can still climb out to B.
        expect(LeagueEngine.getPromotionZone(save, LEAGUE_TIERS.C_TIER).length).toBeGreaterThan(0)
    })

    test("TIER_DISPLAY has a C_TIER entry so the UI never reads undefined", () => {
        expect(TIER_DISPLAY.C_TIER).toBeDefined()
        expect(TIER_DISPLAY.C_TIER.shortLabel).toBe("C")
        expect(TIER_DISPLAY.C_TIER.label).toBe("C-Tier")
    })
})

describe("initializeTeamData — C_TIER start preservation (ZERO_TO_HERO enabler)", () => {
    const team = (id: string, elo: number, extra: Record<string, unknown> = {}) =>
        ({ id, name: id, elo, reputation: 50, ...extra }) as never

    test("preserves an explicit C_TIER even when the team ranks outside the rank window", () => {
        const save = {
            currentWeek: 1,
            teams: [
                team("player", 800, { leagueTier: "C_TIER" }),
                ...Array.from({ length: 45 }, (_, i) => team(`ai${i}`, 1500 - i)),
            ],
        } as unknown as GameSave
        AIManager.initializeTeamData(save)
        // Player has the lowest Elo → ranks ~46th; the rank-based default would
        // assign B_TIER, but the guard keeps the explicit C_TIER so the climb
        // starts at the true bottom (and ZERO_TO_HERO stays reachable).
        expect(save.teams.find(t => t.id === "player")!.leagueTier).toBe("C_TIER")
    })

    test("a low-ranked team with NO tier set still gets the rank-based default (B_TIER)", () => {
        const save = {
            currentWeek: 1,
            teams: [
                team("low", 700), // no leagueTier → rank-based path
                ...Array.from({ length: 45 }, (_, i) => team(`ai${i}`, 1500 - i)),
            ],
        } as unknown as GameSave
        AIManager.initializeTeamData(save)
        expect(save.teams.find(t => t.id === "low")!.leagueTier).toBe("B_TIER")
    })
})
