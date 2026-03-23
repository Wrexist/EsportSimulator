import {
    processWeeklyChemistryGrowth,
    applyRosterChangePenalty,
    applyBootcampChemistryBonus,
    CHEMISTRY_GROWTH_PER_WEEK,
    CHEMISTRY_PENALTY_PER_SWAP,
    MAX_CHEMISTRY_PENALTY,
    STABILITY_THRESHOLD_WEEKS,
} from "@/engine/chemistry-engine"

const makeTeam = (overrides: Record<string, any> = {}) =>
    ({ id: "t1", chemistry: 50, lastRosterChangeWeek: 1, ...overrides } as any)

describe("Chemistry Engine", () => {
    describe("processWeeklyChemistryGrowth", () => {
        test("grows by CHEMISTRY_GROWTH_PER_WEEK per stable week", () => {
            const team = makeTeam({ lastRosterChangeWeek: 1 })
            processWeeklyChemistryGrowth(team, 10)
            expect(team.chemistry).toBe(50 + CHEMISTRY_GROWTH_PER_WEEK)
        })

        test("does not grow within stability threshold", () => {
            const team = makeTeam({ lastRosterChangeWeek: 9 })
            processWeeklyChemistryGrowth(team, 10) // Only 1 week stable
            expect(team.chemistry).toBe(50)
        })

        test("grows at exactly the threshold boundary", () => {
            const team = makeTeam({ lastRosterChangeWeek: 8 })
            processWeeklyChemistryGrowth(team, 10) // Exactly 2 weeks stable
            expect(team.chemistry).toBe(50 + CHEMISTRY_GROWTH_PER_WEEK)
        })

        test("caps at 100", () => {
            const team = makeTeam({ chemistry: 99.8, lastRosterChangeWeek: 1 })
            processWeeklyChemistryGrowth(team, 10)
            expect(team.chemistry).toBe(100)
        })

        test("defaults lastRosterChangeWeek to 1 when undefined", () => {
            const team = makeTeam({ lastRosterChangeWeek: undefined })
            processWeeklyChemistryGrowth(team, 10)
            expect(team.chemistry).toBe(50 + CHEMISTRY_GROWTH_PER_WEEK)
        })

        test("defaults chemistry to 50 when undefined", () => {
            const team = makeTeam({ chemistry: undefined, lastRosterChangeWeek: 1 })
            processWeeklyChemistryGrowth(team, 10)
            expect(team.chemistry).toBe(50 + CHEMISTRY_GROWTH_PER_WEEK)
        })

        test("accumulates over multiple weeks", () => {
            const team = makeTeam({ chemistry: 50, lastRosterChangeWeek: 1 })
            for (let week = 5; week <= 14; week++) {
                processWeeklyChemistryGrowth(team, week)
            }
            expect(team.chemistry).toBe(50 + CHEMISTRY_GROWTH_PER_WEEK * 10)
        })
    })

    describe("applyRosterChangePenalty", () => {
        test("applies penalty per player changed", () => {
            const team = makeTeam({ chemistry: 70 })
            applyRosterChangePenalty(team, 20, 1)
            expect(team.chemistry).toBe(70 - CHEMISTRY_PENALTY_PER_SWAP)
        })

        test("scales penalty with multiple players", () => {
            const team = makeTeam({ chemistry: 70 })
            applyRosterChangePenalty(team, 20, 3)
            expect(team.chemistry).toBe(70 - CHEMISTRY_PENALTY_PER_SWAP * 3)
        })

        test("caps penalty at MAX_CHEMISTRY_PENALTY", () => {
            const team = makeTeam({ chemistry: 70 })
            applyRosterChangePenalty(team, 20, 5) // 5 * 10 = 50, capped at 30
            expect(team.chemistry).toBe(70 - MAX_CHEMISTRY_PENALTY)
        })

        test("resets lastRosterChangeWeek", () => {
            const team = makeTeam({ lastRosterChangeWeek: 1 })
            applyRosterChangePenalty(team, 20, 1)
            expect(team.lastRosterChangeWeek).toBe(20)
        })

        test("does not go below 0", () => {
            const team = makeTeam({ chemistry: 5 })
            applyRosterChangePenalty(team, 20, 3)
            expect(team.chemistry).toBe(0)
        })

        test("pauses growth after penalty", () => {
            const team = makeTeam({ chemistry: 70, lastRosterChangeWeek: 1 })
            applyRosterChangePenalty(team, 20, 1)
            // Try to grow on week 21 (only 1 week after change)
            processWeeklyChemistryGrowth(team, 21)
            expect(team.chemistry).toBe(70 - CHEMISTRY_PENALTY_PER_SWAP) // No growth
            // Grow on week 22 (2 weeks after change, meets threshold)
            processWeeklyChemistryGrowth(team, 22)
            expect(team.chemistry).toBe(70 - CHEMISTRY_PENALTY_PER_SWAP + CHEMISTRY_GROWTH_PER_WEEK)
        })
    })

    describe("applyBootcampChemistryBonus", () => {
        test("RETREAT (REST) gives +5 chemistry", () => {
            const team = makeTeam({ chemistry: 60 })
            const bonus = applyBootcampChemistryBonus(team, "REST")
            expect(bonus).toBe(5)
            expect(team.chemistry).toBe(65)
        })

        test("INTERNATIONAL (TRAVEL) gives +3 chemistry", () => {
            const team = makeTeam({ chemistry: 60 })
            const bonus = applyBootcampChemistryBonus(team, "TRAVEL")
            expect(bonus).toBe(3)
            expect(team.chemistry).toBe(63)
        })

        test("LOCAL (BOOTCAMP) gives +8 chemistry", () => {
            const team = makeTeam({ chemistry: 60 })
            const bonus = applyBootcampChemistryBonus(team, "BOOTCAMP")
            expect(bonus).toBe(8)
            expect(team.chemistry).toBe(68)
        })

        test("caps at 100", () => {
            const team = makeTeam({ chemistry: 98 })
            const bonus = applyBootcampChemistryBonus(team, "REST")
            expect(bonus).toBe(5)
            expect(team.chemistry).toBe(100)
        })

        test("unknown type gives 0 bonus", () => {
            const team = makeTeam({ chemistry: 60 })
            const bonus = applyBootcampChemistryBonus(team, "UNKNOWN")
            expect(bonus).toBe(0)
            expect(team.chemistry).toBe(60)
        })
    })
})
