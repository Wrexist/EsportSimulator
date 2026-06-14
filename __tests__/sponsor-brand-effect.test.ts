/**
 * AUDIT_UX_2026-06 B7 — sponsor brand trade-offs. Verifies the weekly side-effect
 * application (clamped/capped) and that the generator attaches consistent brand
 * profiles.
 */

import { processWeeklySponsorGoals } from "@/engine/processors/sponsor-goals-processor"
import { SponsorGenerator } from "@/engine/economy-manager"
import { SeededRNG } from "@/engine/rng"
import type { GameSave } from "@/engine/save-types"

type BrandEffect = NonNullable<import("@/engine/save-types").SponsorSaveData["brandEffect"]>

function makeSave(brandEffect: BrandEffect): GameSave {
    return {
        currentWeek: 5,
        playerTeamId: "t1",
        teams: [{
            id: "t1", reputation: 50, followers: 10000, rosterIds: ["p1", "p2"],
            sponsors: [{ id: "s1", name: "BrandCo", tier: "PREMIUM", weeklyPayout: 1000, remainingWeeks: 10, goals: [], brandEffect }],
        }],
        players: [{ id: "p1", morale: 60 }, { id: "p2", morale: 70 }],
        financeLedger: [],
        eventsLog: [],
    } as unknown as GameSave
}

describe("sponsor brand effects — weekly application", () => {
    it("a betting brand drags reputation and roster morale", () => {
        const save = makeSave({ reputationPerWeek: -0.3, moralePerWeek: -0.3 })
        processWeeklySponsorGoals(save)
        expect(save.teams[0].reputation).toBeCloseTo(49.7)
        expect(save.players[0].morale).toBeCloseTo(59.7)
        expect(save.players[1].morale).toBeCloseTo(69.7)
    })

    it("a lifestyle brand grows followers and lifts reputation", () => {
        const save = makeSave({ followerGrowthPerWeek: 500, reputationPerWeek: 0.2 })
        processWeeklySponsorGoals(save)
        expect(save.teams[0].followers).toBe(10500)
        expect(save.teams[0].reputation).toBeCloseTo(50.2)
    })

    it("clamps reputation at 100", () => {
        const save = makeSave({ reputationPerWeek: 5 })
        save.teams[0].reputation = 99
        processWeeklySponsorGoals(save)
        expect(save.teams[0].reputation).toBe(100)
    })

    it("respects the 2M follower cap", () => {
        const save = makeSave({ followerGrowthPerWeek: 500 })
        save.teams[0].followers = 1_999_800
        processWeeklySponsorGoals(save)
        expect(save.teams[0].followers).toBe(2_000_000)
    })
})

describe("sponsor generator — brand profiles", () => {
    it("attaches consistent brand effects to some offers", () => {
        const team = { id: "t1", name: "T1", reputation: 75, followers: 50000 } as unknown as Parameters<typeof SponsorGenerator.generateVariedOffers>[0]
        let sawBranded = false
        let bettingConsistent = true
        let fansNonNegative = true

        for (let seed = 1; seed <= 30; seed++) {
            const offers = SponsorGenerator.generateVariedOffers(team, 1, new SeededRNG(seed))
            for (const o of offers) {
                if (!o.brandEffect) continue
                sawBranded = true
                const fx = o.brandEffect
                // Betting signature: a reputation drag always comes with a morale drag.
                if ((fx.reputationPerWeek ?? 0) < 0 && (fx.moralePerWeek ?? 0) >= 0) bettingConsistent = false
                if ((fx.followerGrowthPerWeek ?? 0) < 0) fansNonNegative = false
            }
        }

        expect(sawBranded).toBe(true)
        expect(bettingConsistent).toBe(true)
        expect(fansNonNegative).toBe(true)
    })
})
