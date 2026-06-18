/**
 * C_TIER entry division (C8). Adds a bottom rung below B so new orgs (seeded at
 * elo 800 / C_TIER by team-creator) have a real ladder to climb — and so the
 * dormant ZERO_TO_HERO achievement (start C → reach S) becomes reachable.
 */

import { LeagueEngine, LEAGUE_TIERS, TIER_DISPLAY } from "@/engine/league-engine"
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
