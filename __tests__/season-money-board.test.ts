/**
 * Phase 4.4: money pressure (runway, operations, central payments, AI
 * administration), money and board lines in the weekly report, and the FPL
 * save migration.
 */
import { computeWeek } from "@/engine/worker/compute-week"
import { createLaunchFixture } from "@/scripts/launch/fixtures"
import { TrainingFocus } from "@/types"
import { EconomyEngine } from "@/engine/economy-engine"
import { initialClubBudget, processAIAdministration, runwaySummary, startingBudgetFor, weeklyCosts } from "@/engine/season/club-finances"
import { CLUB_ECONOMY_TUNING, clubOperationsCost, leagueCentralPayment, LEAGUE_TUNING } from "@/lib/balance-tuning"
import { runMigrationLadder, migrateToV8 } from "@/engine/save-migrations"
import { SaveManager } from "@/engine/save-manager"
import { CURRENT_SAVE_VERSION, type GameSave } from "@/engine/save-types"
import type { AsyncStorage } from "@/engine/storage-adapter"
import { makeWorld } from "./league-fixtures"

jest.mock("@/engine/manager-career-profile", () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined) }))

const config = (save: GameSave) => ({ playerTeamId: save.playerTeamId, trainingFocus: new Map([[save.playerTeamId, { focus: TrainingFocus.AIM, intensity: 5 }]]) })

describe("starting cash and runway", () => {
    test("every club starts with the same number of weeks of its own running costs", () => {
        const save = makeWorld({ EU: 6 })
        save.contracts.filter(c => c.teamId === save.teams[0].id).forEach(c => { c.salaryPerWeek = 10_000 })
        for (const team of save.teams) {
            const budget = startingBudgetFor(save, team)
            const costs = weeklyCosts(save, team)
            expect(budget % CLUB_ECONOMY_TUNING.STARTING_BUDGET_ROUND).toBe(0)
            expect(budget).toBeGreaterThanOrEqual(CLUB_ECONOMY_TUNING.STARTING_BUDGET_MIN)
            if (costs * CLUB_ECONOMY_TUNING.STARTING_RUNWAY_WEEKS > CLUB_ECONOMY_TUNING.STARTING_BUDGET_MIN) {
                expect(Math.abs(budget / costs - CLUB_ECONOMY_TUNING.STARTING_RUNWAY_WEEKS)).toBeLessThan(1)
            }
            team.budget = budget
            const runway = runwaySummary(save, team)
            expect(runway.weeklyCosts).toBe(costs)
            expect(runway.grossRunwayWeeks).toBeCloseTo(budget / costs, 6)
        }
        // A big payroll gets proportionally more cash, not a flat sum.
        expect(startingBudgetFor(save, save.teams[0])).toBeGreaterThan(startingBudgetFor(save, save.teams[1]))
    })

    test("an incomplete squad's opening cash covers the missing starters' wages for the same runway", () => {
        const save = makeWorld({ EU: 4 })
        const team = save.teams[1]
        const fullRoster = [...team.rosterIds]
        const full = initialClubBudget(save, team)
        expect(full).toBe(startingBudgetFor(save, team))
        team.rosterIds = fullRoster.slice(0, 3)
        expect(initialClubBudget(save, team)).toBeGreaterThan(startingBudgetFor(save, team))
        expect(initialClubBudget(save, team) - startingBudgetFor(save, team)).toBeGreaterThanOrEqual(2 * 400 * CLUB_ECONOMY_TUNING.STARTING_RUNWAY_WEEKS - CLUB_ECONOMY_TUNING.STARTING_BUDGET_ROUND)
    })

    test("unconditional income no longer covers a club: operations cost money and the central payment follows the division", () => {
        const save = makeWorld({ EU: 4 })
        const team = save.teams[2]
        const out = EconomyEngine.processWeeklyFinances(team, save.players, save.contracts, save.staff, 2, 0)
        expect(out.expenses.operations).toBe(clubOperationsCost(team.reputation))
        expect(out.income.leagueShare).toBe(LEAGUE_TUNING.CENTRAL_PAYMENT_FALLBACK)
        team.leagueDivisionLevel = 1
        expect(EconomyEngine.processWeeklyFinances(team, save.players, save.contracts, save.staff, 2, 0).income.leagueShare).toBe(leagueCentralPayment(1))
        expect(leagueCentralPayment(1)).toBeGreaterThan(leagueCentralPayment(3))
        expect(leagueCentralPayment(9)).toBe(LEAGUE_TUNING.CENTRAL_PAYMENT_BY_LEVEL.at(-1))
        // No deals: a club runs a deficit and must earn (sponsors, prizes) to grow.
        team.leagueDivisionLevel = 3
        expect(EconomyEngine.processWeeklyFinances(team, save.players, save.contracts, save.staff, 2, 0).net).toBeLessThan(0)
    })
})

describe("AI clubs follow the insolvency rule", () => {
    test("an AI club insolvent for eight weeks goes into administration: bench, staff and academy go, reputation drops", () => {
        const save = makeWorld({ EU: 4 }, "t_EU_0")
        const ai = save.teams[1]
        ai.rosterIds.push("bench_1")
        save.players.push({ id: "bench_1", nickname: "Bench", skill: 50 } as never)
        save.contracts.push({ playerId: "bench_1", teamId: ai.id, salaryPerWeek: 3000, startWeek: 1, endWeek: 100, buyout: 0 })
        save.staff.push({ id: "st_1", teamId: ai.id, name: "Coach", role: "coach", salaryPerWeek: 2000 } as never)
        ai.staffIds = ["st_1"]
        ai.academyFacility = { level: 2, builtWeek: 1 }
        ai.budget = -50_000
        ai.consecutiveInsolventWeeks = CLUB_ECONOMY_TUNING.ADMINISTRATION_WEEKS - 1
        expect(processAIAdministration(save, save.playerTeamId)).toEqual([])
        ai.consecutiveInsolventWeeks = CLUB_ECONOMY_TUNING.ADMINISTRATION_WEEKS
        const rep = ai.reputation
        expect(processAIAdministration(save, save.playerTeamId)).toEqual([ai.id])
        expect(ai.rosterIds).not.toContain("bench_1")
        expect(save.contracts.some(c => c.playerId === "bench_1" && c.teamId === ai.id)).toBe(false)
        expect(ai.staffIds).toEqual([])
        expect(ai.academyFacility.level).toBe(0)
        expect(ai.reputation).toBe(rep - CLUB_ECONOMY_TUNING.ADMINISTRATION_REPUTATION_PENALTY)
        expect(ai.administrations).toBe(1)
        expect(ai.consecutiveInsolventWeeks).toBe(0)
        // The managed club is never put into administration (it goes bankrupt instead).
        const me = save.teams[0]
        me.consecutiveInsolventWeeks = 20
        expect(processAIAdministration(save, save.playerTeamId)).toEqual([])
    })
})

describe("the weekly report carries the new money and board lines with causes", () => {
    test("operations, the league payment and board moves are itemized with a cause", async () => {
        const save = createLaunchFixture("cash-crisis")
        save.scheduledMatches = []
        const before = save.teams.find(t => t.id === save.playerTeamId)!.budget
        const confidenceBefore = save.boardState?.confidence ?? 60
        const { result, save: after } = await computeWeek(save, config(save), 17)
        const changes = result.changes ?? []
        const money = changes.filter(e => e.kind === "money")
        expect(money.find(e => e.label === "Club operations (travel, admin, content)")).toMatchObject({ cause: { type: "finance", label: "Club operations" } })
        expect(money.find(e => e.label.startsWith("League central payment"))?.cause.label).toBe("League")
        expect(money.reduce((s, e) => s + e.delta, 0)).toBe(Math.round(after.teams.find(t => t.id === save.playerTeamId)!.budget - before))
        const board = changes.filter(e => e.kind === "board")
        expect(board.length).toBeGreaterThan(0)
        expect(board.every(e => e.cause.type === "board" && e.cause.label.length > 0)).toBe(true)
        expect(board.some(e => /Financ|insolvent/i.test(e.cause.label))).toBe(true)
        // Board entries sum to the real confidence change.
        expect(board.reduce((s, e) => s + e.delta, 0)).toBeCloseTo(after.boardState!.confidence - confidenceBefore, 1)
    })

    test("the tick draws the league so a new season has a fixture list", async () => {
        const save = createLaunchFixture("first-week")
        save.scheduledMatches = []
        const { save: after } = await computeWeek(save, config(save), 3)
        expect(after.league?.current?.divisions.length).toBeGreaterThan(0)
        const mine = after.scheduledMatches.filter(m => m.tournamentId?.startsWith("league_") && (m.homeTeamId === after.playerTeamId || m.awayTeamId === after.playerTeamId))
        expect(mine.length).toBeGreaterThan(0)
        expect(after.teams.find(t => t.id === after.playerTeamId)!.leagueDivisionLevel).toBe(1)
    })
})

class MemoryStorage implements AsyncStorage {
    private store = new Map<string, string>()
    async getItem(key: string) { return this.store.get(key) ?? null }
    async setItem(key: string, value: string) { this.store.set(key, value) }
    async removeItem(key: string) { this.store.delete(key) }
    async clear() { this.store.clear() }
    async getAllKeys() { return [...this.store.keys()] }
}

describe("FPL removal: save migration v8", () => {
    const legacy = () => ({
        saveVersion: 7, saveId: "old", saveName: "Old", currentWeek: 80, currentDay: 6, timeMode: "WEEKLY",
        playerTeamId: "t1",
        teams: [{ id: "t1", name: "T1", rosterIds: ["p1", "fpl_nonpro_1_2_3"], facilities: [], sponsors: [], fanbase: 0, branding: {} }],
        players: [
            { id: "p1", nickname: "Pro" },
            { id: "fpl_nonpro_1_2_3", nickname: "Signed amateur", isFPLNonPro: true, initialFplElo: 2100 },
            { id: "fpl_nonpro_4_5_6", nickname: "Unsigned amateur", isFPLNonPro: true, initialFplElo: 1700 },
        ],
        contracts: [{ playerId: "p1", teamId: "t1", salaryPerWeek: 500, startWeek: 1, endWeek: 200 }, { playerId: "fpl_nonpro_1_2_3", teamId: "t1", salaryPerWeek: 300, startWeek: 1, endWeek: 200 }],
        fplData: { playerStats: {}, matchHistory: new Array(500).fill({ id: "m" }), seasonHistory: [], nonProPlayers: [] },
        financeLedger: [], tournaments: [], scheduledMatches: [], completedMatches: [],
    })

    test("drops FPL data, retires the unsigned amateur pool and keeps signed amateurs as ordinary players", () => {
        const migrated = runMigrationLadder(legacy()) as unknown as Record<string, unknown> & GameSave
        expect(CURRENT_SAVE_VERSION).toBe(8)
        expect(migrated.saveVersion).toBe(8)
        expect("fplData" in migrated).toBe(false)
        const byId = new Map(migrated.players.map(p => [p.id, p as unknown as Record<string, unknown>]))
        expect(byId.get("fpl_nonpro_4_5_6")!.isRetired).toBe(true)
        expect(byId.get("fpl_nonpro_4_5_6")!.retirementWeek).toBe(80)
        expect(byId.get("fpl_nonpro_1_2_3")!.isRetired).toBeUndefined()
        expect(byId.get("p1")!.isRetired).toBeUndefined()
        for (const p of byId.values()) { expect(p.isFPLNonPro).toBeUndefined(); expect(p.initialFplElo).toBeUndefined() }
        // Everything else flows through.
        expect(migrated.teams[0].rosterIds).toEqual(["p1", "fpl_nonpro_1_2_3"])
        expect(migrated.currentWeek).toBe(80)
    })

    test("is a no-op beyond the version stamp for a save without FPL data", () => {
        const out = migrateToV8({ saveVersion: 7, players: [{ id: "p1" }], teams: [], contracts: [] })
        expect(out).toEqual({ saveVersion: 8, players: [{ id: "p1" }], teams: [], contracts: [] })
    })

    test("an old save goes through the SaveManager ladder and loads", () => {
        const sm = new SaveManager(new MemoryStorage())
        const migrated = sm.migrateSave(legacy()) as GameSave
        expect(migrated.saveVersion).toBe(CURRENT_SAVE_VERSION)
        expect((migrated as unknown as Record<string, unknown>).fplData).toBeUndefined()
    })
})
