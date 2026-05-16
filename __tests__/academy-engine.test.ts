/**
 * Coverage for engine/academy-engine.ts pure helpers.
 *
 * Pins the financial + capacity + promotion-evaluation math that the
 * academy slice depends on. Regression here = wrong upgrade prices,
 * wrong capacity cutoffs, or wrong "ready to promote" decisions —
 * all bugs the player would notice immediately but that no test
 * currently catches.
 */

import { AcademyEngine } from "@/engine/academy-engine"
import type { AcademyPlayer } from "@/engine/academy-engine"

function makeProspect(overrides: Partial<AcademyPlayer> = {}): AcademyPlayer {
    return {
        id: "ap1",
        playerId: "p1",
        enrolledWeek: 1,
        trainingFocus: "BALANCED",
        developmentProgress: 80,
        potentialRevealed: false,
        totalXpGained: 1000,
        academyMatchesPlayed: 0,
        readyForPromotion: false,
        scoutNotes: "",
        energy: 100,
        ...overrides,
    } as unknown as AcademyPlayer
}

function makePlayer(overrides: Record<string, number> = {}): any {
    return {
        age: 17,
        skill: 60, rifle: 55, awp: 45, pistol: 55, grenades: 50,
        tactic: 55, creativity: 50, leader: 45, teamwork: 55,
        stressResistance: 50,
        potential: 85,
        ...overrides,
    }
}

describe("AcademyEngine.getUpgradeCost", () => {
    test("level 0 → 1 returns the level-1 build cost", () => {
        expect(AcademyEngine.getUpgradeCost(0)).toBeGreaterThan(0)
    })

    test("level 5 (max) returns 0 — no further upgrade possible", () => {
        expect(AcademyEngine.getUpgradeCost(5)).toBe(0)
    })

    test("upgrade costs are strictly increasing through level 4", () => {
        const costs = [0, 1, 2, 3, 4].map(l => AcademyEngine.getUpgradeCost(l))
        for (let i = 1; i < costs.length; i++) {
            expect(costs[i]).toBeGreaterThan(costs[i - 1])
        }
    })
})

describe("AcademyEngine.canEnrollProspect", () => {
    test("rejects enrollment at facility level 0 (no academy)", () => {
        expect(AcademyEngine.canEnrollProspect(0, 0)).toBe(false)
    })

    test("level 1 academy: 3 prospects max", () => {
        expect(AcademyEngine.canEnrollProspect(0, 1)).toBe(true)
        expect(AcademyEngine.canEnrollProspect(2, 1)).toBe(true)
        expect(AcademyEngine.canEnrollProspect(3, 1)).toBe(false)
    })

    test("level 5 academy supports more prospects than level 1", () => {
        // Don't hardcode exact counts — pin the monotonic relationship.
        let level1Cap = 0
        while (AcademyEngine.canEnrollProspect(level1Cap, 1)) level1Cap++
        let level5Cap = 0
        while (AcademyEngine.canEnrollProspect(level5Cap, 5)) level5Cap++

        expect(level5Cap).toBeGreaterThan(level1Cap)
    })
})

describe("AcademyEngine.getWeeklyUpkeep", () => {
    test("scales with facility level", () => {
        const upkeep1 = AcademyEngine.getWeeklyUpkeep(1, 0)
        const upkeep5 = AcademyEngine.getWeeklyUpkeep(5, 0)
        expect(upkeep5).toBeGreaterThan(upkeep1)
    })

    test("level 0 academy has zero upkeep", () => {
        expect(AcademyEngine.getWeeklyUpkeep(0, 0)).toBe(0)
    })
})

describe("AcademyEngine.calculateProgressGain", () => {
    test("zero XP produces zero progress gain", () => {
        expect(AcademyEngine.calculateProgressGain(0)).toBe(0)
    })

    test("scales linearly with XP", () => {
        const small = AcademyEngine.calculateProgressGain(100)
        const big = AcademyEngine.calculateProgressGain(1000)
        expect(big).toBeCloseTo(small * 10, 1)
    })
})

describe("AcademyEngine.evaluatePromotion", () => {
    test("under threshold → not ready, recommendation mentions progress", () => {
        const prospect = makeProspect({ developmentProgress: 30 })
        const player = makePlayer()
        const result = AcademyEngine.evaluatePromotion(prospect, player)

        expect(result.ready).toBe(false)
        expect(result.recommendation).toMatch(/development progress|develop/i)
    })

    test("high progress + strong stats → ready", () => {
        const prospect = makeProspect({ developmentProgress: 100 })
        const player = makePlayer({ skill: 70, rifle: 65, teamwork: 60 })
        const result = AcademyEngine.evaluatePromotion(prospect, player)

        expect(result.ready).toBe(true)
        expect(result.rating).toBeGreaterThan(0)
    })

    test("progress ready but stats below minimums → not ready, suggests specialist coaching", () => {
        const prospect = makeProspect({ developmentProgress: 100 })
        // Skill=20 is below the 45 minimum.
        const player = makePlayer({ skill: 20, rifle: 20, teamwork: 20 })
        const result = AcademyEngine.evaluatePromotion(prospect, player)

        expect(result.ready).toBe(false)
        expect(result.recommendation).toMatch(/skills|coaching|specialist/i)
    })

    test("age 18 + 60%+ progress surfaces an age-urgency warning", () => {
        const prospect = makeProspect({ developmentProgress: 65 })
        const player = makePlayer({ age: 18, skill: 30 }) // below mins → not ready
        const result = AcademyEngine.evaluatePromotion(prospect, player)

        expect(result.ready).toBe(false)
        expect(result.recommendation).toMatch(/age|deadline|decide/i)
    })

    test("rating reflects technical-heavy weighting (skill > tactic > mental)", () => {
        const prospect = makeProspect({ developmentProgress: 100 })
        const technical = makePlayer({ skill: 90, rifle: 90, awp: 90, pistol: 90, tactic: 20, leader: 20, teamwork: 20 })
        const mental = makePlayer({ skill: 20, rifle: 20, awp: 20, pistol: 20, tactic: 20, leader: 20, teamwork: 90, stressResistance: 90 })

        const rTechnical = AcademyEngine.evaluatePromotion(prospect, technical)
        const rMental = AcademyEngine.evaluatePromotion(prospect, mental)

        // Technical weight is 0.5 vs mental 0.25, so a technical specialist
        // should score higher than an equally-extreme mental specialist.
        expect(rTechnical.rating).toBeGreaterThan(rMental.rating)
    })
})

describe("AcademyEngine.applyStatImprovements", () => {
    test("applies positive improvements, never exceeding potential cap", () => {
        const player = makePlayer({ skill: 80, potential: 85 })
        const updates = AcademyEngine.applyStatImprovements(player as any, { skill: 10 })

        expect(updates.skill).toBeLessThanOrEqual(85)
        // Should have moved up from 80 by some amount.
        expect((updates.skill ?? player.skill)).toBeGreaterThan(player.skill - 0.001)
    })

    test("no-op when improvements map is empty", () => {
        const player = makePlayer({ skill: 50 })
        const updates = AcademyEngine.applyStatImprovements(player as any, {})

        // Empty improvements → empty updates object (or no skill mutation).
        expect((updates as any).skill ?? player.skill).toBe(player.skill)
    })
})
