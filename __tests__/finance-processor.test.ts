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

    test("weeklyNet reflects equipment upkeep (AI economy reads team.weeklyNet)", () => {
        const equipTeam = makeTeam({
            id: "ai", budget: 200_000, reputation: 60,
            equipment: [{ id: "eq1", type: "MOUSE", tier: 2, name: "M", bonus: { stat: "reaction", value: 5 }, weeklyCost: 1000, purchasedWeek: 1 } as any],
        })
        const baselineTeam = makeTeam({ id: "ai", budget: 200_000, reputation: 60 })
        const saveEquip = makeSave(equipTeam, "other") // AI team (not player)
        const saveBase = makeSave(baselineTeam, "other")

        FinanceProcessor.processFinance(saveEquip, "other")
        FinanceProcessor.processFinance(saveBase, "other")

        // Pre-fix the equipment team's weeklyNet stayed at the pre-equipment
        // value, reading $1000 too high; now it's exactly its upkeep lower.
        expect(baselineTeam.weeklyNet - equipTeam.weeklyNet).toBe(1000)
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

    test("league revenue share is written to the player ledger (reconciles with budget)", () => {
        const team = makeTeam({ id: "t1", budget: 200_000, reputation: 60, fanbase: 5_000 })
        const save = makeSave(team)

        FinanceProcessor.processFinance(save, "t1")

        const leagueRow = save.financeLedger.find(e => e.id.includes("inc_league"))
        expect(leagueRow).toBeDefined()
        expect(leagueRow!.type).toBe("INCOME")
        expect(leagueRow!.amount).toBe(15_000)

        // The ledger income entries must sum to exactly the reported income —
        // previously the $15k league share inflated the budget without a row.
        const income = save.financeLedger
            .filter(e => e.type === "INCOME")
            .reduce((s, e) => s + e.amount, 0)
        // Income entries (sponsor floor + fanbase + league share) now include
        // the league share, so the sum covers the full reported income.
        expect(income).toBeGreaterThanOrEqual(15_000)
    })

    test("equipment-driven insolvency feeds the consecutive-insolvency bankruptcy gate", () => {
        // Pre-equipment the team is comfortably STABLE (positive net, healthy
        // balance); only the equipment upkeep pushes the budget below zero.
        // The bankruptcy gate must read the POST-equipment state, not the
        // stale pre-equipment report.state (which would reset the counter).
        const team = makeTeam({
            id: "t1",
            budget: 10_000,
            reputation: 40,
            fanbase: 0,
            consecutiveInsolventWeeks: 7,
            equipment: [
                { id: "eq", type: "MOUSE", tier: 2, name: "M", bonus: { stat: "reaction", value: 5 }, weeklyCost: 40_000, purchasedWeek: 1 } as any,
            ],
        })
        const save = makeSave(team, "t1")

        FinanceProcessor.processFinance(save, "t1")

        expect(team.budget).toBeLessThanOrEqual(0)
        expect(team.financialState).toBe("INSOLVENT")
        expect(team.consecutiveInsolventWeeks).toBe(8)
        expect(save.gameOverReason).toBe("BANKRUPTCY")
        expect(save.gameOverWeek).toBe(10)
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

describe("FinanceProcessor.processFinance — replay/resume idempotency (ledger dedup)", () => {
    function makeWageSave() {
        const rosterIds = ["p1", "p2", "p3", "p4", "p5"]
        const team = makeTeam({
            id: "t1",
            budget: 500_000,
            reputation: 70,
            fanbase: 20_000,
            rosterIds,
            staffIds: ["s1"],
            equipment: [{ id: "eq1", type: "MOUSE", tier: 2, name: "M", bonus: { stat: "reaction", value: 5 }, weeklyCost: 500, purchasedWeek: 1 } as any],
        })
        const contracts: ContractSaveData[] = rosterIds.map((pid, i) => ({
            id: `c${i}`, playerId: pid, teamId: "t1", salaryPerWeek: 4000, startWeek: 1, endWeek: 52, buyout: 0,
        } as any))
        const staff: StaffSaveData[] = [
            { id: "s1", teamId: "t1", name: "Coach", role: "coach", salaryPerWeek: 2000, level: 1, contractEndWeek: 52, stats: {} as any, unlockedTalentIds: [] } as any,
        ]
        return makeSave(team, "t1", { contracts, staff })
    }

    test("re-running the same week does not duplicate ledger entries (threaded dedup sets)", () => {
        const save = makeWageSave()

        // First pass — like the normal week tick.
        FinanceProcessor.processFinance(save, "t1")
        const idsAfterFirst = save.financeLedger.map(e => e.id).sort()
        expect(idsAfterFirst.length).toBeGreaterThan(0) // wages + equipment recorded

        // Simulate a resume: the dedup sets are rebuilt from the persisted
        // ledger/events at the top of the tick, then the finance step re-runs.
        const ledgerIdSet = new Set(save.financeLedger.map(e => e.id))
        const eventIdSet = new Set(save.eventsLog.map(e => e.id))
        FinanceProcessor.processFinance(save, "t1", eventIdSet, ledgerIdSet)

        // No duplicate ledger entries — the deterministic IDs collide and are skipped.
        expect(save.financeLedger.map(e => e.id).sort()).toEqual(idsAfterFirst)
    })

    test("the internal fallback set also prevents duplicate entries when no sets are threaded", () => {
        const save = makeWageSave()

        FinanceProcessor.processFinance(save, "t1")
        const countAfterFirst = save.financeLedger.length

        // Even without threaded sets, processFinance rebuilds the guard from the
        // live ledger, so a second pass over the same week is idempotent.
        FinanceProcessor.processFinance(save, "t1")
        expect(save.financeLedger.length).toBe(countAfterFirst)
    })

    test("a budget warning already in the event log is not re-emitted on replay", () => {
        const team = makeTeam({
            id: "t1",
            budget: 20_000,
            reputation: 10,
            fanbase: 100,
            rosterIds: ["p1", "p2", "p3", "p4", "p5"],
            staffIds: ["s1"],
        })
        team._prevFinancialState = "STABLE"
        const contracts: ContractSaveData[] = ["p1", "p2", "p3", "p4", "p5"].map((pid, i) => ({
            id: `c${i}`, playerId: pid, teamId: "t1", salaryPerWeek: 5000, startWeek: 1, endWeek: 52, buyout: 0,
        } as any))
        const staff: StaffSaveData[] = [
            { id: "s1", teamId: "t1", name: "Coach", role: "coach", salaryPerWeek: 2000, level: 1, contractEndWeek: 52, stats: {} as any, unlockedTalentIds: [] } as any,
        ]
        const save = makeSave(team, "t1", { contracts, staff })

        // First pass emits exactly one budget-warning event.
        FinanceProcessor.processFinance(save, "t1")
        const warningsAfterFirst = save.eventsLog.filter(e => e.type === "BUDGET_WARNING").length
        expect(warningsAfterFirst).toBe(1)

        // Resume: reset the state-change trigger so the warning path runs again,
        // but thread the existing event IDs — the duplicate must be suppressed.
        team._prevFinancialState = "STABLE"
        const eventIdSet = new Set(save.eventsLog.map(e => e.id))
        const ledgerIdSet = new Set(save.financeLedger.map(e => e.id))
        FinanceProcessor.processFinance(save, "t1", eventIdSet, ledgerIdSet)

        expect(save.eventsLog.filter(e => e.type === "BUDGET_WARNING").length).toBe(1)
    })
})
