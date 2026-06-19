/**
 * Coverage for engine/processors/match-tactical-bonus.ts.
 *
 * Pins the tactical-bonus math used twice per simulated match in
 * atomic-week-processor.processMatches. Two contributions:
 *   1. Analyst stat sum — every analyst on the team contributes
 *      (stats.analysis ?? 50), rescaled to give ~5pt per "100 analysis".
 *   2. Playstyle rock-paper-scissors counter:
 *        AGGRESSIVE > STRUCTURED (+5)
 *        STRUCTURED > BALANCED   (+5)
 *        BALANCED > AGGRESSIVE   (+5)
 */

import { getTacticalBonus } from "@/engine/processors/match-tactical-bonus"
import type { StaffSaveData } from "@/engine/save-types"

function makeStaff(role: string, analysisStat?: number, id = `s_${role}`): StaffSaveData {
    return {
        id, teamId: "t1", name: id, role,
        salaryPerWeek: 1000, level: 3, contractEndWeek: 52,
        stats: analysisStat !== undefined ? { analysis: analysisStat } : undefined,
        unlockedTalentIds: [],
    } as unknown as StaffSaveData
}

describe("getTacticalBonus — analyst contribution", () => {
    test("no staff at all → 0 analyst bonus, 0 RPS bonus", () => {
        expect(getTacticalBonus(undefined, "balanced", "balanced")).toBe(0)
        expect(getTacticalBonus([], "balanced", "balanced")).toBe(0)
    })

    test("non-analyst staff contribute nothing to analyst bonus", () => {
        const staff = [makeStaff("coach", 90), makeStaff("psychologist", 90)]
        // No analysts → analyst bonus = 0. Both styles balanced → no RPS bonus.
        expect(getTacticalBonus(staff, "balanced", "balanced")).toBe(0)
    })

    test("single analyst with 100 analysis stat → +5 analyst bonus", () => {
        const staff = [makeStaff("analyst", 100)]
        expect(getTacticalBonus(staff, "balanced", "balanced")).toBe(5)
    })

    test("single analyst with default 50 analysis stat → +2.5 bonus", () => {
        // No stats object at all → falls back to 50.
        const staff = [makeStaff("analyst")]
        expect(getTacticalBonus(staff, "balanced", "balanced")).toBeCloseTo(2.5, 5)
    })

    test("stats.analysis = 0 falls back to default 50 (|| operator semantics)", () => {
        // Important contract: the code uses `s.stats?.analysis || 50` so
        // an explicit 0 still triggers the fallback. Pin this so future
        // refactor doesn't switch to ?? and silently change behavior.
        const staff = [makeStaff("analyst", 0)]
        expect(getTacticalBonus(staff, "balanced", "balanced")).toBeCloseTo(2.5, 5)
    })

    test("two analysts stack their analysis contributions", () => {
        const staff = [makeStaff("analyst", 100, "a1"), makeStaff("analyst", 60, "a2")]
        // (100 + 60) / 100 * 5 = 8
        expect(getTacticalBonus(staff, "balanced", "balanced")).toBe(8)
    })

    test("mixed roster: only analysts count; coaches/psych ignored", () => {
        const staff = [
            makeStaff("coach", 100),       // ignored
            makeStaff("analyst", 100),     // +5
            makeStaff("psychologist", 100), // ignored
        ]
        expect(getTacticalBonus(staff, "balanced", "balanced")).toBe(5)
    })

    test("a TACTICAL-specialist analyst contributes +10% (specialization wired)", () => {
        const specialist = { ...makeStaff("analyst", 100), specialization: "Data Science" }
        // 100 × 1.1 = 110 → (110/100)*5 = 5.5
        expect(getTacticalBonus([specialist], "balanced", "balanced")).toBeCloseTo(5.5, 5)
    })

    test("an off-domain analyst contributes at face value (no specialist bonus)", () => {
        const offDomain = { ...makeStaff("analyst", 100), specialization: "Narrative & History" }
        expect(getTacticalBonus([offDomain], "balanced", "balanced")).toBe(5)
    })
})

describe("getTacticalBonus — RPS counter triangle", () => {
    const noStaff: StaffSaveData[] = []

    test("AGGRESSIVE beats STRUCTURED (+5)", () => {
        expect(getTacticalBonus(noStaff, "aggressive", "structured")).toBe(5)
    })

    test("STRUCTURED beats BALANCED (+5)", () => {
        expect(getTacticalBonus(noStaff, "structured", "balanced")).toBe(5)
    })

    test("BALANCED beats AGGRESSIVE (+5)", () => {
        expect(getTacticalBonus(noStaff, "balanced", "aggressive")).toBe(5)
    })

    test("reverse pairings get no bonus (defender of RPS doesn't auto-gain)", () => {
        expect(getTacticalBonus(noStaff, "structured", "aggressive")).toBe(0)
        expect(getTacticalBonus(noStaff, "balanced", "structured")).toBe(0)
        expect(getTacticalBonus(noStaff, "aggressive", "balanced")).toBe(0)
    })

    test("mirror matchups get no RPS bonus", () => {
        for (const style of ["aggressive", "structured", "balanced"]) {
            expect(getTacticalBonus(noStaff, style, style)).toBe(0)
        }
    })

    test("'default' style normalizes to 'balanced'", () => {
        // default vs aggressive should behave like balanced vs aggressive → +5
        expect(getTacticalBonus(noStaff, "default", "aggressive")).toBe(5)
        // aggressive vs default = aggressive vs balanced → 0 (balanced beats agg)
        expect(getTacticalBonus(noStaff, "aggressive", "default")).toBe(0)
    })

    test("empty / null / undefined style normalizes to 'balanced'", () => {
        expect(getTacticalBonus(noStaff, "", "aggressive")).toBe(5)
        expect(getTacticalBonus(noStaff, undefined, "aggressive")).toBe(5)
        expect(getTacticalBonus(noStaff, null, "aggressive")).toBe(5)
    })

    test("unknown style names produce no bonus", () => {
        expect(getTacticalBonus(noStaff, "berserker", "aggressive")).toBe(0)
        expect(getTacticalBonus(noStaff, "aggressive", "berserker")).toBe(0)
    })
})

describe("getTacticalBonus — composition (analyst + RPS)", () => {
    test("analyst bonus stacks additively with RPS bonus", () => {
        const staff = [makeStaff("analyst", 100)] // +5 analyst
        // Plus AGGRESSIVE vs STRUCTURED → +5 RPS = 10 total.
        expect(getTacticalBonus(staff, "aggressive", "structured")).toBe(10)
    })

    test("max-realistic scenario: 2 elite analysts + winning RPS", () => {
        const staff = [makeStaff("analyst", 100, "a1"), makeStaff("analyst", 100, "a2")]
        // (200/100)*5 = 10 analyst + 5 RPS = 15.
        expect(getTacticalBonus(staff, "structured", "balanced")).toBe(15)
    })

    test("result is always finite (no NaN under any input combo)", () => {
        const result = getTacticalBonus([makeStaff("analyst", 50)], "unknown", "unknown")
        expect(Number.isFinite(result)).toBe(true)
    })
})
