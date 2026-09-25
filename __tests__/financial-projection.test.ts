import { EconomyEngine } from "@/engine/economy-engine"
import { EconomyManager } from "@/engine/economy-manager"
import { FinanceProcessor } from "@/engine/processors/finance-processor"
import type { GameSave, TeamSaveData } from "@/engine/save-types"

describe("one projection for dashboard, Finances, and recurring settlement", () => {
  test.each([false, true])("reconciles legacy upkeep, sponsor floor, difficulty, merch and equipment (sponsored=%s)", sponsored => {
    const team = {
      id: "player", name: "Pulsar", budget: 500000, reputation: 50,
      rosterIds: ["p1"], staffIds: ["s1"], facilities: [], facilitiesLevel: 1,
      followers: 70000, merchHype: 15, merchStoreLevel: 2, activeMerchItems: ["jersey", "mousepad"],
      sponsors: sponsored ? [{ weeklyPayout: 100 }] : [],
      difficultySettings: { incomeMultiplier: 0.8 },
      equipment: [{ id: "pc_t2", type: "PC", tier: 2, name: "Pro Workstation", bonus: { stat: "skill", value: 3 }, weeklyCost: 500, purchasedWeek: 1 }],
      activeRoleTraining: [{ id: "already-paid" }],
    } as unknown as TeamSaveData
    const save = {
      teams: [team], players: [], contracts: [{ playerId: "p1", salaryPerWeek: 1250 }],
      staff: [{ id: "s1", salaryPerWeek: 750 }], playerTeamId: "player",
      currentWeek: 3, lastRngSeed: 42, financeLedger: [], eventsLog: [], newsFeed: [],
    } as unknown as GameSave
    const before = team.budget
    const dashboard = EconomyEngine.processWeeklyFinances(team, save.players, save.contracts, save.staff)
    const finances = new EconomyManager().generateFinancialReport(team, save.players, save.staff, save.contracts)
    expect(finances.weeklyIncome.total).toBe(dashboard.income.total)
    expect(finances.weeklyExpenses.total).toBe(dashboard.expenses.total)
    expect(finances.netCashflow).toBe(dashboard.net)
    expect(dashboard.income.sponsors).toBe(7600)
    expect(dashboard.expenses.facilities).toBeGreaterThan(0)
    expect(dashboard.expenses.equipment).toBe(500)
    expect(dashboard.expenses.total).toBe(2000 + dashboard.expenses.facilities + 500)
    expect(team.budget).toBe(before) // A preview cannot charge the player.

    const settlement = FinanceProcessor.processFinance(save, "player")
    const ledgerNet = save.financeLedger.reduce((sum, entry) => sum + (entry.type === "INCOME" ? entry.amount : -entry.amount), 0)
    expect(settlement.net).toBe(finances.netCashflow)
    expect(team.budget - before).toBe(finances.netCashflow)
    expect(ledgerNet).toBe(finances.netCashflow)
    expect(team.weeklyNet).toBe(finances.netCashflow)
    expect(save.financeLedger.filter(entry => entry.id.startsWith("exp_equip_"))).toHaveLength(1)
  })
})
