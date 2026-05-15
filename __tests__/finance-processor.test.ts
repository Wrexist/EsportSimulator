/**
 * Coverage for engine/processors/finance-processor.ts.
 *
 * FinanceProcessor.processFinance runs every week tick. A silent bug here
 * means the player's team goes bankrupt with no warning, or AI teams
 * accumulate phantom money. None of this was covered before.
 *
 * The processor wraps EconomyEngine.processWeeklyFinances, so most income
 * math is tested indirectly — these tests focus on the processor's
 * unique responsibilities: equipment cost deduction, financial-state
 * transitions, budget-warning event emission, consecutive-insolvent
 * tracking, and ledger entry generation for the player team.
 */

import { FinanceProcessor } from "@/engine/processors/finance-processor"
import type { GameSave, TeamSaveData, PlayerSaveData, ContractSaveData, StaffSaveData } from "@/engine/save-types"

function makeTeam(overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id: "t1",
        name: "Team 1",
        shortName: "T1",
        budget: 100_000,
        rosterIds: [],
        staffIds: [],
        trophies: [],
        facilities: [],
        sponsors: [],
        fanbase: 1000,
        playstyle: "default",
        reputation: 40,
        region: "EU",
        facilitiesLevel: 0,
        ...overrides,
    } as unknown as TeamSaveData
}

function makeSave(team: TeamSaveData, playerTeamId = "t1", overrides: Partial<GameSave> = {}): GameSave {
    return {
        saveVersion: 6,
        saveId: "test",
        saveName: "test",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        currentWeek: 10,
        currentDay: 6,
        timeMode: "WEEKLY",
        gameStartDate: new Date().toISOString(),
        managerDetails: {} as any,
        lastRngSeed: 12345,
        playerTeamId,
        teams: [team],
        players: [],
        contracts: [],
        tournaments: [],
        staff: [],
        scheduledMatches: [],
        completedMatches: [],
        scheduledActivities: [],
        financeLedger: [],
        eventsLog: [],
        newsFeed: [],
        acknowledgedEventIds: [],
        hallOfFame: [],
        legendaryPlayers: [],
        weekTickState: null,
        ...overrides,
    } as unknown as GameSave
}

describe("FinanceProcessor.processFinance", () => {
    test("stable team with no expenses stays STABLE and budget grows", () => {
        const team = makeTeam({ budget: 200_000, reputation: 80, fanbase: 50_000 })
        const save = makeSave(team)

        const before = team.budget
        const result = FinanceProcessor.processFinance(save, "t1")

        expect(team.financialState).toBe("STABLE")
        expect(team.budget).toBeGreaterThan(before)
        expect(result.income).toBeGreaterThan(0)
        expect(result.expenses).toBe(0)
    })

    test("equipment weekly cost is deducted from the player team budget", () => {
        const team = makeTeam({
            budget: 100_000,
            reputation: 60,
            equipment: [
                { id: "eq1", type: "MOUSE", tier: 2, name: "Pro Mouse", bonus: { stat: "reaction", value: 5 }, weeklyCost: 500, purchasedWeek: 1 },
                { id: "eq2", type: "MONITOR", tier: 2, name: "Pro Monitor", bonus: { stat: "eyesight", value: 3 }, weeklyCost: 300, purchasedWeek: 1 },
            ],
        })
        const save = makeSave(team)

        FinanceProcessor.processFinance(save, "t1")

        const equipLedger = save.financeLedger.filter(e => e.id.includes("exp_equip"))
        expect(equipLedger.length).toBe(1)
        expect(equipLedger[0].amount).toBe(800)
        expect(equipLedger[0].category).toBe("FACILITIES")
    })

    test("AI team equipment cost is deducted but NOT logged to ledger", () => {
        const aiTeam = makeTeam({
            id: "ai_team",
            budget: 50_000,
            equipment: [{ id: "eq1", type: "MOUSE", tier: 2, name: "M", bonus: { stat: "reaction", value: 5 }, weeklyCost: 1000, purchasedWeek: 1 }],
        })
        const baselineTeam = makeTeam({ id: "ai_team", budget: 50_000 }) // identical but no equipment

        const saveWithEquip = makeSave(aiTeam, "different_team")
        const saveBaseline = makeSave(baselineTeam, "different_team")

        FinanceProcessor.processFinance(saveWithEquip, "different_team")
        FinanceProcessor.processFinance(saveBaseline, "different_team")

        // Ledger is for the player team only.
        expect(saveWithEquip.financeLedger.length).toBe(0)
        // The equipment cost lands on the AI team's budget — the only
        // difference between the two saves should be exactly the $1000
        // weekly cost.
        expect(baselineTeam.budget - aiTeam.budget).toBe(1000)
    })

    test("budget warning event emits when state degrades from STABLE", () => {
        // LEAGUE_REVENUE_SHARE alone is $15k/week + ~$3.5k sponsor floor for
        // rep 10. To force a deficit, salaries need to be > $18,500/week.
        const team = makeTeam({
            id: "t1",
            budget: 20_000, // small budget so runway is short
            reputation: 10,
            fanbase: 100,
            rosterIds: ["p1", "p2", "p3", "p4", "p5"],
            staffIds: ["s1"],
        })
        team._prevFinancialState = "STABLE"

        const contracts: ContractSaveData[] = ["p1", "p2", "p3", "p4", "p5"].map((pid, i) => ({
            id: `c${i}`, playerId: pid, teamId: "t1",
            salaryPerWeek: 5000, startWeek: 1, endWeek: 52, buyout: 0,
        } as any))
        const staff: StaffSaveData[] = [{
            id: "s1", teamId: "t1", name: "Coach", role: "coach",
            salaryPerWeek: 2000, level: 1, contractEndWeek: 52, stats: {} as any, unlockedTalentIds: [],
        } as any]

        const save = makeSave(team, "t1", { contracts, staff })

        FinanceProcessor.processFinance(save, "t1")

        expect(team.financialState).not.toBe("STABLE")
        // Player team should have gotten a warning event
        const warnings = save.eventsLog.filter(e => e.type === "BUDGET_WARNING")
        expect(warnings.length).toBe(1)
    })

    test("consecutive insolvency counter increments and triggers BANKRUPTCY gameOver after 8 weeks", () => {
        // Force INSOLVENT: massive contracts > league share + sponsor floor,
        // budget already small. With 10 players at $5k each = $50k expenses,
        // ~$17k income, net -$33k. Starting budget $1k → newBalance = -$32k → INSOLVENT.
        const rosterIds = Array.from({ length: 10 }, (_, i) => `p${i}`)
        const team = makeTeam({
            id: "t1",
            budget: 1_000,
            reputation: 5,
            fanbase: 0,
            rosterIds,
            consecutiveInsolventWeeks: 7,
        })
        const contracts: ContractSaveData[] = rosterIds.map((pid, i) => ({
            id: `c${i}`, playerId: pid, teamId: "t1",
            salaryPerWeek: 5000, startWeek: 1, endWeek: 52, buyout: 0,
        } as any))
        const save = makeSave(team, "t1", { contracts })

        FinanceProcessor.processFinance(save, "t1")

        expect(team.financialState).toBe("INSOLVENT")
        expect(team.consecutiveInsolventWeeks).toBe(8)
        expect(save.gameOverReason).toBe("BANKRUPTCY")
        expect(save.gameOverWeek).toBe(10)
    })

    test("recovering from INSOLVENT resets the consecutive counter", () => {
        const team = makeTeam({
            id: "t1",
            budget: 100_000, // healthy now
            reputation: 50,
            consecutiveInsolventWeeks: 3, // was insolvent last week
        })
        const save = makeSave(team, "t1")

        FinanceProcessor.processFinance(save, "t1")

        expect(team.financialState).toBe("STABLE")
        expect(team.consecutiveInsolventWeeks).toBe(0)
    })

    test("CRISIS state drops morale of every roster player by 2", () => {
        // Force CRISIS or INSOLVENT: high wages, no offsetting income.
        const team = makeTeam({
            id: "t1",
            budget: 200,
            reputation: 5,
            fanbase: 0,
            rosterIds: ["p1", "p2", "p3", "p4", "p5", "p6"],
            staffIds: ["s1"],
        })
        const players: PlayerSaveData[] = [
            { id: "p1", morale: 80 } as any,
            { id: "p2", morale: 60 } as any,
            { id: "p3", morale: 50 } as any,
            { id: "p4", morale: 50 } as any,
            { id: "p5", morale: 50 } as any,
            { id: "p6", morale: 50 } as any,
        ]
        const contracts: ContractSaveData[] = players.map((p, i) => ({
            id: `c${i}`, playerId: p.id, teamId: "t1", salaryPerWeek: 5000, startWeek: 1, endWeek: 52, buyout: 0,
        } as any))
        const staff: StaffSaveData[] = [
            { id: "s1", teamId: "t1", name: "C", role: "coach", salaryPerWeek: 2000, level: 1, contractEndWeek: 52, stats: {} as any, unlockedTalentIds: [] } as any,
        ]
        const save = makeSave(team, "t1", { players, contracts, staff })

        FinanceProcessor.processFinance(save, "t1")

        // Either CRISIS or INSOLVENT — both apply the morale hit
        expect(["CRISIS", "INSOLVENT"]).toContain(team.financialState)
        expect(players[0].morale).toBe(78)
        expect(players[1].morale).toBe(58)
        expect(players[2].morale).toBe(48)
    })
})
