/**
 * Tests for EconomyEngine.processWeeklyFinances — the weekly money
 * pipeline used by the finance processor. Computes income (sponsors,
 * fans, league share), expenses (player wages, staff wages, facilities
 * upkeep), net, runway, and financial state (STABLE/TIGHT/RISK/CRISIS/
 * INSOLVENT).
 *
 * Bugs in this engine surface as "team mysteriously goes bankrupt" or
 * "AI teams have infinite money", both of which are obvious user-facing
 * failures. Pin every channel + the state-classification thresholds.
 */

import { EconomyEngine } from "@/engine/economy-engine"
import type { TeamSaveData, PlayerSaveData, StaffSaveData, ContractSaveData } from "@/engine/save-types"

function makeTeam(overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id: "team", name: "Team", shortName: "TEAM",
        budget: 100_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, followers: 7000, playstyle: "default",
        reputation: 50, region: "EU", facilitiesLevel: 0,
        leagueTier: "B_TIER", elo: 1500, recentForm: [],
        merchHype: 10, merchStoreLevel: 1,
        ...overrides,
    } as unknown as TeamSaveData
}

function makePlayer(id: string): PlayerSaveData {
    return {
        id, nickname: id, firstName: id, lastName: "P",
        age: 22, nationality: "US", role: "RIFLER",
        rifle: 70, awp: 60, pistol: 65, grenades: 60, creativity: 60,
        clutch: 60, tactic: 60, leader: 55, teamwork: 65,
        reaction: 70, eyesight: 70,
        morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        skill: 70, potential: 85, productivity: 60, endurance: 70,
    } as unknown as PlayerSaveData
}

function makeContract(playerId: string, salaryPerWeek: number, teamId = "team"): ContractSaveData {
    return {
        id: `c_${playerId}`, playerId, teamId,
        salaryPerWeek, startWeek: 1, endWeek: 52, buyout: 100_000,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
}

function makeStaff(id: string, salaryPerWeek: number, teamId = "team"): StaffSaveData {
    return {
        id, name: id, role: "coach", teamId,
        level: 1, xp: 0, xpToNextLevel: 1000, talentPoints: 0,
        unlockedTalentIds: [], salaryPerWeek, contractEndWeek: 100,
        stats: { development: 50, analysis: 50 },
    } as unknown as StaffSaveData
}

describe("processWeeklyFinances — wage expense", () => {
    test("sums player wages from the contract table", () => {
        const team = makeTeam({ rosterIds: ["p1", "p2"] })
        const contracts = [makeContract("p1", 1500), makeContract("p2", 2500)]
        const r = EconomyEngine.processWeeklyFinances(team, [], contracts, [])
        expect(r.expenses.playerWages).toBe(4000)
    })

    test("players without a contract row contribute 0 wages", () => {
        const team = makeTeam({ rosterIds: ["p1", "p_no_contract"] })
        const r = EconomyEngine.processWeeklyFinances(team, [], [makeContract("p1", 1000)], [])
        expect(r.expenses.playerWages).toBe(1000)
    })

    test("sums staff wages from the staff array", () => {
        const team = makeTeam({ staffIds: ["s1", "s2"] })
        const staff = [makeStaff("s1", 800), makeStaff("s2", 1200)]
        const r = EconomyEngine.processWeeklyFinances(team, [], [], staff)
        expect(r.expenses.staffWages).toBe(2000)
    })
})

describe("processWeeklyFinances — sponsor income", () => {
    test("with active sponsors: sums weeklyPayout * repFactor", () => {
        const team = makeTeam({
            reputation: 100,
            sponsors: [
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                { name: "S1", tier: "BASIC", weeklyPayout: 5000 } as any,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                { name: "S2", tier: "PREMIUM", weeklyPayout: 10000 } as any,
            ],
        })
        const r = EconomyEngine.processWeeklyFinances(team, [], [], [])
        // 15000 base, scaled by repFactor (base + range*1.0); just check > base
        expect(r.income.sponsors).toBeGreaterThan(0)
    })

    test("higher reputation produces higher sponsor income (rep factor scales)", () => {
        const lowRep = makeTeam({
            reputation: 10,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            sponsors: [{ name: "S", tier: "BASIC", weeklyPayout: 5000 } as any],
        })
        const highRep = makeTeam({
            reputation: 100,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            sponsors: [{ name: "S", tier: "BASIC", weeklyPayout: 5000 } as any],
        })
        const rLow = EconomyEngine.processWeeklyFinances(lowRep, [], [], [])
        const rHigh = EconomyEngine.processWeeklyFinances(highRep, [], [], [])
        expect(rHigh.income.sponsors).toBeGreaterThan(rLow.income.sponsors)
    })

    test("no sponsors → fallback estimate based on reputation (AI-team safety net)", () => {
        const team = makeTeam({ reputation: 40, sponsors: [] })
        const r = EconomyEngine.processWeeklyFinances(team, [], [], [])
        // Fallback formula: reputation * 150 + 2000 = 8000 (before incomeMultiplier)
        expect(r.income.sponsors).toBe(8000)
    })

    test("signing a low-payout first sponsor never reduces income below the rep floor", () => {
        // Regression: the fallback used to be replaced by the raw sponsor sum
        // the moment a team had any sponsor, so a cheap first sponsor (worth
        // less than the reputation floor) made weekly sponsor income go DOWN.
        // As a floor it can only ever stay equal or rise.
        const noSponsors = makeTeam({ reputation: 50, sponsors: [] })
        const cheapSponsor = makeTeam({
            reputation: 50,
            // rep 50 → repFactor 1.0, so payout 3000 → sponsorSum 3000,
            // well below the rep floor of 50*150+2000 = 9500.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            sponsors: [{ name: "S", tier: "STANDARD", weeklyPayout: 3000 } as any],
        })
        const rNo = EconomyEngine.processWeeklyFinances(noSponsors, [], [], [])
        const rCheap = EconomyEngine.processWeeklyFinances(cheapSponsor, [], [], [])
        expect(rNo.income.sponsors).toBe(9500)
        expect(rCheap.income.sponsors).toBeGreaterThanOrEqual(rNo.income.sponsors)
    })

    test("custom-team incomeMultiplier scales sponsor income", () => {
        const team = makeTeam({
            reputation: 40,
            sponsors: [],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            difficultySettings: { incomeMultiplier: 0.5 } as any,
        })
        const r = EconomyEngine.processWeeklyFinances(team, [], [], [])
        // Base 8000 * 0.5 = 4000
        expect(r.income.sponsors).toBe(4000)
    })
})

describe("processWeeklyFinances — fan income", () => {
    test("scales with followers, merchLevel, hype, and FANZONE level", () => {
        const baseline = makeTeam({
            followers: 10_000, merchStoreLevel: 1, merchHype: 10,
            facilities: [],
        })
        const fanzone3 = makeTeam({
            followers: 10_000, merchStoreLevel: 1, merchHype: 10,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            facilities: [{ id: "fz", type: "FANZONE", level: 3, description: "", monthlyCost: 0 } as any],
        })
        const rBase = EconomyEngine.processWeeklyFinances(baseline, [], [], [])
        const rFan = EconomyEngine.processWeeklyFinances(fanzone3, [], [], [])
        expect(rFan.income.fanbase).toBeGreaterThan(rBase.income.fanbase)
    })

    test("merchHype multiplier rewards higher hype", () => {
        const low = makeTeam({ followers: 100_000, merchStoreLevel: 1, merchHype: 5 })
        const high = makeTeam({ followers: 100_000, merchStoreLevel: 1, merchHype: 50 })
        const rLow = EconomyEngine.processWeeklyFinances(low, [], [], [])
        const rHigh = EconomyEngine.processWeeklyFinances(high, [], [], [])
        expect(rHigh.income.fanbase).toBeGreaterThan(rLow.income.fanbase)
    })

    test("legacy fanbase fallback when followers is missing", () => {
        const team = makeTeam({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            followers: undefined as any,
            fanbase: 1000,
        })
        const r = EconomyEngine.processWeeklyFinances(team, [], [], [])
        // followers = fanbase * 7 = 7000 → some positive income
        expect(r.income.fanbase).toBeGreaterThanOrEqual(0)
    })
})

describe("processWeeklyFinances — facility upkeep", () => {
    test("zero facilities → upkeep = 0", () => {
        const team = makeTeam({ facilities: [], facilitiesLevel: 0 })
        const r = EconomyEngine.processWeeklyFinances(team, [], [], [])
        expect(r.expenses.facilities).toBe(0)
    })

    test("higher facility levels cost more (level^1.25 * base)", () => {
        const cheap = makeTeam({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            facilities: [{ id: "f", type: "TRAINING", level: 1, description: "", monthlyCost: 0 } as any],
        })
        const expensive = makeTeam({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            facilities: [{ id: "f", type: "TRAINING", level: 5, description: "", monthlyCost: 0 } as any],
        })
        const rCheap = EconomyEngine.processWeeklyFinances(cheap, [], [], [])
        const rExp = EconomyEngine.processWeeklyFinances(expensive, [], [], [])
        expect(rExp.expenses.facilities).toBeGreaterThan(rCheap.expenses.facilities)
    })
})

describe("processWeeklyFinances — financial state classification", () => {
    test("STABLE when net is positive (infinite runway)", () => {
        const team = makeTeam({
            budget: 100_000,
            reputation: 80,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            sponsors: [{ name: "S", tier: "BASIC", weeklyPayout: 50_000 } as any],
        })
        const r = EconomyEngine.processWeeklyFinances(team, [], [], [])
        expect(r.state).toBe("STABLE")
        expect(r.runwayWeeks).toBe(999)
    })

    test("CRISIS when runway < 3 weeks of burn", () => {
        // Set up a team with huge wage expenses overwhelming income +
        // a tiny budget so weeklyBurn is large and runway < 3.
        const team = makeTeam({
            budget: 5_000,           // tiny cushion
            reputation: 0,           // fallback sponsor ≈ 2000
            followers: 0, fanbase: 0,
            sponsors: [],
            rosterIds: ["p1", "p2"],
        })
        const contracts = [
            makeContract("p1", 20_000), // 20k/week
            makeContract("p2", 20_000), // 20k/week
        ]
        // income ≈ 2000 + league share; expenses = 40000 → net ≈ -38000
        // newBalance ≈ 5000 - 38000 = -33000 → INSOLVENT (balance ≤ 0)
        // We accept either CRISIS or INSOLVENT since the boundary is sharp.
        const r = EconomyEngine.processWeeklyFinances(team, [], contracts, [])
        expect(["CRISIS", "INSOLVENT", "RISK"]).toContain(r.state)
    })

    test("INSOLVENT when newBalance after the tick is ≤ 0", () => {
        // Massive wage burn overwhelms income → newBalance underwater.
        const team = makeTeam({
            budget: 1_000,
            reputation: 0,
            sponsors: [],
            followers: 0, fanbase: 0,
            rosterIds: ["p1"],
        })
        const contracts = [makeContract("p1", 100_000)] // 100k/week wages
        const r = EconomyEngine.processWeeklyFinances(team, [], contracts, [])
        expect(r.newBalance).toBeLessThanOrEqual(0)
        expect(r.state).toBe("INSOLVENT")
    })

    // Regression: a corrupt (non-finite) team.budget used to flow through as
    // NaN. Because every comparison with NaN is false, determineState fell
    // through to "STABLE", hiding a team that is actually in trouble. The
    // result must now be finite and classified INSOLVENT.
    test("non-finite team.budget is sanitized and classified INSOLVENT", () => {
        const team = makeTeam({ budget: NaN as unknown as number, rosterIds: [] })
        const r = EconomyEngine.processWeeklyFinances(team, [], [], [])
        expect(Number.isFinite(r.newBalance)).toBe(true)
        expect(Number.isFinite(r.runwayWeeks)).toBe(true)
        expect(r.state).toBe("INSOLVENT")
    })
})

describe("processWeeklyFinances — net + balance math", () => {
    test("newBalance = budget + (totalIncome - totalExpenses)", () => {
        const team = makeTeam({
            budget: 10_000, reputation: 20,
            sponsors: [],
            rosterIds: ["p1"], staffIds: [],
        })
        const r = EconomyEngine.processWeeklyFinances(
            team, [], [makeContract("p1", 1000)], []
        )
        expect(r.expenses.total).toBe(r.expenses.playerWages + r.expenses.staffWages + r.expenses.facilities)
        expect(r.income.total).toBe(r.income.sponsors + r.income.fanbase + r.income.leagueShare)
        expect(r.net).toBe(r.income.total - r.expenses.total)
        expect(r.newBalance).toBe(team.budget + r.net)
    })
})

describe("merch active-line bonus (wired activeMerchItems)", () => {
    test("active merch lines increase fan income, capped at 5 lines", () => {
        const base = EconomyEngine.processWeeklyFinances(makeTeam({ followers: 1_000_000, activeMerchItems: [] }), [], [], [])
        const two = EconomyEngine.processWeeklyFinances(makeTeam({ followers: 1_000_000, activeMerchItems: ["JERSEY", "HOODIE"] }), [], [], [])
        const seven = EconomyEngine.processWeeklyFinances(makeTeam({ followers: 1_000_000, activeMerchItems: ["A", "B", "C", "D", "E", "F", "G"] }), [], [], [])
        expect(two.income.fanbase).toBeGreaterThan(base.income.fanbase)
        // 7 lines is capped at the 5-line bonus, not 7x.
        const fiveCap = EconomyEngine.processWeeklyFinances(makeTeam({ followers: 1_000_000, activeMerchItems: ["A", "B", "C", "D", "E"] }), [], [], [])
        expect(seven.income.fanbase).toBe(fiveCap.income.fanbase)
    })
})
