import { createLaunchFixture, FixtureStorage } from "@/scripts/launch/fixtures"
import { AtomicWeekProcessor } from "@/engine/atomic-week-processor"
import { SaveManager } from "@/engine/save-manager"
import { SeededRNG } from "@/engine/rng"
import { FinanceProcessor } from "@/engine/processors/finance-processor"
import { EconomyEngine } from "@/engine/economy-engine"
import { cashRunway, forecastFinances, quotePlayerSigning } from "@/engine/finance-forecast"
import { applyWeeklyActivity } from "@/engine/processors/weekly-activity-processor"
import { processWeeklySponsorGoals } from "@/engine/processors/sponsor-goals-processor"
import { settlePlayerContractBonuses } from "@/engine/processors/player-contract-bonuses"
import { calculateWeeklyUpkeep } from "@/engine/academy-constants"
import { nextDeterministicId } from "@/store/utils/helpers"
import { WeeklyActivityType } from "@/types"

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))

describe("L15 financial integrity", () => {
    test.each(["first-week", "cash-crisis", "season-boundary"] as const)("%s: replay leaves budgets, morale, insolvency, news, RNG and ledger unchanged", scenario => {
        const save = createLaunchFixture(scenario)
        const team = save.teams.find(t => t.id === save.playerTeamId)!
        const opening = team.budget
        const summary = FinanceProcessor.processFinance(save, save.playerTeamId)
        let running = opening
        for (const row of save.financeLedger.filter(e => e.teamId === team.id)) {
            running += row.type === "INCOME" ? row.amount : -row.amount
            expect(row.balance).toBe(running)
        }
        expect(running).toBe(team.budget)
        expect(team.budget - opening).toBe(summary.net)
        const disk = clone(save)
        expect(FinanceProcessor.processFinance(disk, disk.playerTeamId)).toEqual(summary)
        expect(disk).toEqual(save)
        // Durable receipt still protects all teams after old ledger rows are compacted.
        disk.financeLedger = []
        const compacted = clone(disk)
        expect(FinanceProcessor.processFinance(disk, disk.playerTeamId)).toEqual(summary)
        expect(disk).toEqual(compacted)
        disk.currentWeek++
        FinanceProcessor.processFinance(disk, disk.playerTeamId)
        expect(disk.teams[0].financeSettlement!.week).toBe(disk.currentWeek)
        expect(disk.financeLedger.length).toBeGreaterThan(0)
    })

    test("an old settled save without receipts adopts them without charging any club again", () => {
        const save = createLaunchFixture("first-week")
        const summary = FinanceProcessor.processFinance(save, save.playerTeamId)
        for (const team of save.teams) delete team.financeSettlement
        const opening = save.teams.map(t => t.budget)
        const seed = save.lastRngSeed
        expect(FinanceProcessor.processFinance(save, save.playerTeamId)).toEqual(summary)
        expect(save.teams.map(t => t.budget)).toEqual(opening)
        expect(save.lastRngSeed).toBe(seed)
    })

    test("forecast honors final sponsor payment and player expiry; no conditional goals are booked", () => {
        const save = createLaunchFixture("season-boundary")
        const team = save.teams.find(t => t.id === save.playerTeamId)!
        team.sponsors = [{ id: "s", name: "Test", tier: "STANDARD", weeklyPayout: 80000, remainingWeeks: 1,
            goals: [{ id: "g", description: "Win Matches", current: 0, target: 5, bonusPayout: 999999, isCompleted: false }] }]
        save.contracts.forEach(c => { if (c.teamId === team.id) c.endWeek = save.currentWeek + 2 })
        const before = clone(save)
        const forecast = forecastFinances(team, save.players, save.contracts, save.staff, save.currentWeek, 3)
        expect(save).toEqual(before)
        expect(forecast[0].income).toBeGreaterThan(forecast[1].income)
        expect(forecast[0].expenses).toBeGreaterThan(forecast[1].expenses)
        for (const row of forecast) {
            save.currentWeek++
            FinanceProcessor.processContractExpiry(save, save.playerTeamId)
            FinanceProcessor.processFinance(save, save.playerTeamId)
            expect(team.budget).toBe(row.budget)
            processWeeklySponsorGoals(save)
        }
        expect(save.financeLedger.some(e => e.amount === 999999)).toBe(false)
    })

    test("the same weekly activity cannot pay twice or switch to a second reward after reload", () => {
        const save = createLaunchFixture("first-week")
        const ctx = { playerTeamId: save.playerTeamId, selectedActivity: WeeklyActivityType.STREAMING, nextId: nextDeterministicId }
        applyWeeklyActivity(save, ctx)
        const disk = clone(save)
        applyWeeklyActivity(disk, ctx)
        applyWeeklyActivity(disk, { ...ctx, selectedActivity: WeeklyActivityType.BOOTCAMP })
        expect(disk).toEqual(save)
        disk.currentWeek++
        applyWeeklyActivity(disk, ctx)
        expect(disk.financeLedger.length).toBeGreaterThan(save.financeLedger.length)
    })

    test("unaffordable activity cancels with one notice and no charge or player effects", () => {
        const save = createLaunchFixture("cash-crisis")
        save.teams.find(t => t.id === save.playerTeamId)!.budget = 0
        const before = clone(save)
        const ctx = { playerTeamId: save.playerTeamId, selectedActivity: WeeklyActivityType.BOOTCAMP, nextId: nextDeterministicId }
        applyWeeklyActivity(save, ctx)
        applyWeeklyActivity(save, ctx)
        expect(save.players).toEqual(before.players)
        expect(save.teams).toEqual(before.teams)
        expect(save.financeLedger).toEqual(before.financeLedger)
        expect(save.eventsLog).toHaveLength(before.eventsLog.length + 1)
    })

    test("debt remains negative in projections and has no available runway even with positive cashflow", () => {
        const save = createLaunchFixture("first-week")
        const team = save.teams[0]
        team.budget = -10000000
        expect(cashRunway(team.budget, 500)).toBe(0)
        expect(forecastFinances(team, save.players, save.contracts, save.staff, save.currentWeek)[0].budget).toBeLessThan(0)
        expect(EconomyEngine.processWeeklyFinances(team, save.players, save.contracts, save.staff).runwayWeeks).toBe(0)
    })

    test("expiring an untrained player does not consume another player's training slot", () => {
        const save = createLaunchFixture("first-week")
        const team = save.teams[0]
        const contract = save.contracts.find(c => c.teamId === team.id)!
        contract.endWeek = save.currentWeek
        team.activeRoleTraining = [{ playerId: team.rosterIds.find(id => id !== contract.playerId)! }] as typeof team.activeRoleTraining
        team.trainingSlotsUsed = 1
        FinanceProcessor.processContractExpiry(save, save.playerTeamId)
        expect(team.trainingSlotsUsed).toBe(1)
        expect(team.rosterIds).not.toContain(contract.playerId)
        const after = clone(save)
        FinanceProcessor.processContractExpiry(save, save.playerTeamId)
        expect(save).toEqual(after)
    })
})


test("the signing quote agrees with cash, roster and wages at the next settlement", () => {
    const save = createLaunchFixture("first-week")
    const team = save.teams.find(t => t.id === save.playerTeamId)!
    const quote = quotePlayerSigning(team, save.players, save.contracts, save.staff, save.currentWeek, "new-signing", 10000, 4000, 52)
    team.budget -= 10000
    team.rosterIds.push("new-signing")
    save.contracts.push({ playerId: "new-signing", teamId: team.id, salaryPerWeek: 4000, startWeek: save.currentWeek, endWeek: save.currentWeek + 52, buyout: 0 })
    expect(team.budget).toBe(quote.cashAfterSigning)
    save.currentWeek++
    const settled = FinanceProcessor.processFinance(save, save.playerTeamId)
    expect(settled.net).toBe(quote.weeklyNet)
    expect(team.budget).toBe(quote.cashAfterSigning + quote.weeklyNet)
})


test("academy upkeep and dated staff wages use the same preview and settlement", () => {
    const save = createLaunchFixture("first-week")
    const team = save.teams.find(t => t.id === save.playerTeamId)!
    team.academyFacility = { level: 2, builtWeek: 1 }
    save.academyPlayers = [{ playerId: "qa-prospect" }] as typeof save.academyPlayers
    team.staffIds = ["coach"]
    save.staff = [{ id: "coach", name: "QA Coach", teamId: team.id, salaryPerWeek: 2000, contractEndWeek: save.currentWeek + 2 }] as typeof save.staff
    const forecast = forecastFinances(team, save.players, save.contracts, save.staff, save.currentWeek, 3, 1)
    save.currentWeek++
    FinanceProcessor.processContractExpiry(save, save.playerTeamId)
    expect(save.eventsLog.some(e => e.data.staffId === "coach")).toBe(true)
    FinanceProcessor.processFinance(save, save.playerTeamId)
    expect(team.budget).toBe(forecast[0].budget)
    expect(save.financeLedger.find(e => e.id.startsWith("exp_academy_"))!.amount).toBe(calculateWeeklyUpkeep(2, 1))
    save.currentWeek++
    FinanceProcessor.processContractExpiry(save, save.playerTeamId)
    FinanceProcessor.processFinance(save, save.playerTeamId)
    expect(team.budget).toBe(forecast[1].budget)
    expect(team.staffIds).toEqual([])
    expect(save.staff).toHaveLength(0)
    expect(save.marketStaff.filter(s => s.id === "coach")).toHaveLength(1)
    FinanceProcessor.processContractExpiry(save, save.playerTeamId)
    expect(save.marketStaff.filter(s => s.id === "coach")).toHaveLength(1)
})

test("win and MVP bonuses pay only eligible participants and cannot be replayed", () => {
    const save = createLaunchFixture("first-week")
    const team = save.teams.find(t => t.id === save.playerTeamId)!
    const [first, bench] = save.contracts.filter(c => c.teamId === team.id)
    first.matchWinBonus = 1000
    first.mvpBonus = 500
    bench.matchWinBonus = 5000
    const opening = team.budget
    settlePlayerContractBonuses(save, "match-bonus", team.id, true, [first.playerId], first.playerId)
    expect(team.budget).toBe(opening - 1500)
    expect(save.financeLedger).toHaveLength(2)
    const paid = clone(save)
    settlePlayerContractBonuses(save, "match-bonus", team.id, true, [first.playerId], first.playerId)
    expect(save).toEqual(paid)
    settlePlayerContractBonuses(save, "lost", team.id, false, [first.playerId])
    expect(save).toEqual(paid)
})


test("weekly match integration pays contractual bonuses once and reconciles the managed club", async () => {
    const save = createLaunchFixture("first-week")
    for (const c of save.contracts) { c.matchWinBonus = 100; c.mvpBonus = 50 }
    const opening = save.teams[0].budget
    const processor = new AtomicWeekProcessor(new SaveManager(new FixtureStorage()))
    const result = await processor.processWeek(save, { playerTeamId: save.playerTeamId, trainingFocus: new Map() }, new SeededRNG(save.lastRngSeed))
    expect(result.success).toBe(true)
    expect(save.completedMatches).toHaveLength(1)
    const bonuses = save.financeLedger.filter(e => e.id.startsWith("contract_bonus_"))
    expect(bonuses.reduce((n, e) => n + e.amount, 0)).toBe(550)
    const net = save.financeLedger.filter(e => e.teamId === save.playerTeamId).reduce((n, e) => n + (e.type === "INCOME" ? e.amount : -e.amount), 0)
    expect(save.teams[0].budget).toBe(opening + net)
})
