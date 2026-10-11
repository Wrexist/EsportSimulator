/**
 * Phase 4.6: AI club economy.
 *
 * Money pressure is for the managed club; AI clubs must stay healthy and
 * competitive. Unit tests pin the budget rule, cost control, the starter
 * swap, renewals and sponsor look; a two-season economy run over a
 * synthetic world (the week processor's economy steps in their real order)
 * pins the invariants: every AI club fields five every week,
 * administrations are rare and never repeat, AI cash stays within bands and
 * wage bills stay within income.
 */

import type { GameSave, PlayerSaveData, TeamSaveData } from "@/engine/save-types"
import { AI_ECONOMY_TUNING, AI_SQUAD_TUNING } from "@/lib/balance-tuning"
import {
    aiCanCommit, aiClubBudget, aiCostControl, ensureAIRosterViability, fillAIRosterToFive, swapOverpaidStarter,
} from "@/engine/ai/club-budget"
import { renewExpiringContracts, upgradeFromFreeAgency } from "@/engine/ai/squad-maintenance"
import { manageSponsors } from "@/engine/ai/infrastructure"
import { recruitmentSalary } from "@/engine/recruitment"
import { SeededRNG } from "@/engine/rng"
import { FinanceProcessor } from "@/engine/processors/finance-processor"
import { processAIWorldLogic } from "@/engine/processors/ai-world-processor"
import { processWeeklySponsorGoals } from "@/engine/processors/sponsor-goals-processor"
import { EventProcessor } from "@/engine/processors/event-processor"
import { drawDueLeagueSplit, processLeagueWeek } from "@/engine/season/regional-league"
import { processAIAdministration, startingBudgetFor } from "@/engine/season/club-finances"
import { playLeagueWeek } from "./league-fixtures"

function hash(text: string): number {
    let h = 2166136261
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
    return h
}

function player(id: string, skill: number, age = 24, role = "RIFLER"): PlayerSaveData {
    return {
        id, name: id, nickname: id, age, nationality: "Sweden", portraitPath: "", role, tier: "PRO",
        energy: 100, maxEnergy: 100, skill, awp: skill, rifle: skill, pistol: skill, grenades: skill, creativity: skill,
        clutch: skill, tactic: skill, leader: skill, teamwork: skill, morale: 70, amicability: 60, productivity: 60,
        stressResistance: 60, loyalty: 60, reaction: skill, eyesight: skill, health: 90, strength: 60, endurance: 60,
        form: 60, fatigue: 0, potential: Math.min(99, skill + 8), matchesPlayed: 0, roundsPlayed: 0, avgRating: 1,
        clutchSuccessRate: 0.2, level: 1, xp: 0, xpToNextLevel: 1000, talentPoints: 0, unlockedTalentIds: [],
    } as PlayerSaveData
}

function club(id: string, rank: number, region: string, rosterIds: string[]): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4), tier: "PRO", region, rosterIds, staffIds: [],
        reputation: Math.max(10, Math.round(97 - rank * 0.9)), fanbase: 5000, followers: 20_000, chemistry: 60,
        facilitiesLevel: 1, trainingSlotsUsed: 0, maxTrainingSlots: 10, budget: 0, elo: 1700 - rank * 8,
        leagueTier: "B_TIER", worldRanking: rank, sponsors: [], facilities: [], trophies: [], recentForm: [],
    } as unknown as TeamSaveData
}

/**
 * Sixty clubs in one league region (six divisions): four stars on star
 * wages, eight established clubs and 48 small clubs on snapshot-like
 * wages, staggered contracts (so renewals and expiries happen) and a
 * free-agent pool at market asks. Every club starts with 26 weeks of
 * costs, as in a career.
 */
function world(): GameSave {
    const teams: TeamSaveData[] = [], players: PlayerSaveData[] = []
    const contracts: GameSave["contracts"] = []
    const regions = ["EU", "EU", "MENA"]
    for (let rank = 1; rank <= 60; rank++) {
        const id = `c${rank}`
        const wage = rank <= 4 ? 9_000 : rank <= 12 ? 2_500 : 350
        const skill = rank <= 4 ? 82 : rank <= 12 ? 70 : 55
        const ids = [0, 1, 2, 3, 4].map(k => `${id}_p${k}`)
        ids.forEach((pid, k) => {
            players.push(player(pid, skill - k, 20 + (hash(pid) % 14), k === 0 ? "AWPER" : k === 1 ? "IGL" : "RIFLER"))
            contracts.push({ playerId: pid, teamId: id, salaryPerWeek: wage, startWeek: 1, endWeek: 20 + (hash(`${pid}:end`) % 90), buyout: 0 })
        })
        teams.push(club(id, rank, regions[rank % 3], ids))
    }
    for (let i = 0; i < 240; i++) players.push(player(`fa${i}`, 40 + (hash(`fa${i}`) % 42), 18 + (hash(`fa${i}:age`) % 15), i % 5 === 0 ? "AWPER" : "RIFLER"))
    const save = {
        saveVersion: 8, saveId: "ai_economy", saveName: "t", createdAt: "", updatedAt: "", currentWeek: 1, currentDay: 0,
        timeMode: "WEEKLY", gameStartDate: "2026-01-05", playerTeamId: "c45",
        managerDetails: { name: "M", level: 5, xp: 0, reputation: 50, careerWins: 0, careerLosses: 0, championships: 0, tenureStartWeek: 1 },
        teams, players, contracts, tournaments: [], staff: [], scheduledMatches: [], completedMatches: [], scheduledActivities: [],
        marketStaff: [], financeLedger: [], eventsLog: [], newsFeed: [], acknowledgedEventIds: [], hallOfFame: [], lastRngSeed: 7,
        legendaryPlayers: [], weekTickState: null, scoutedPlayers: [], circuitPoints: [], tournamentQualifications: [], transferHistory: [],
        academyPlayers: [], academyMatchHistory: [], academyRoster: {}, academyTrainingSchedule: {}, academyWeeklyReports: [],
        academyScoutingMissions: [], academyPendingProspects: [],
    } as unknown as GameSave
    for (const team of save.teams) team.budget = startingBudgetFor(save, team)
    return save
}

const withIncome = (team: TeamSaveData, weekly: number) => {
    team.sponsors = [{ id: `inc_${team.id}`, name: `Backer ${team.id}`, tier: "STANDARD", weeklyPayout: weekly, remainingWeeks: 52 } as never]
}

describe("AI budget rule", () => {
    test("a new recurring cost must leave the surplus in hand; cash alone is not enough", () => {
        const save = world()
        const team = save.teams[20]
        withIncome(team, 20_000)
        const budget = aiClubBudget(save, team)
        expect(budget.headroom).toBeGreaterThan(0)
        expect(budget.margin).toBe(Math.round(AI_ECONOMY_TUNING.SURPLUS_SHARE * budget.income))
        expect(budget.headroom).toBe(budget.net - budget.margin)
        expect(aiCanCommit(team, budget, Math.max(0, budget.headroom))).toBe(true)
        expect(aiCanCommit(team, budget, budget.headroom + 1)).toBe(false)
        // A fortune in the bank does not fund a structural deficit...
        team.budget = 50_000_000
        expect(aiCanCommit(team, budget, budget.headroom + 1)).toBe(false)
        // ...and a club in debt takes on nothing optional.
        team.budget = -1
        expect(aiCanCommit(team, budget, 0)).toBe(false)
        // A fee keeps FEE_RESERVE_WEEKS of running costs in the bank.
        team.budget = budget.costs * AI_ECONOMY_TUNING.FEE_RESERVE_WEEKS + 10_000
        expect(aiCanCommit(team, budget, 0, 10_000)).toBe(true)
        expect(aiCanCommit(team, budget, 0, 10_001)).toBe(false)
    })
})

describe("AI cost control", () => {
    test("a club in deficit sheds bench wages first, then staff, a facility level and an overpaid starter while its runway is short", () => {
        const save = world()
        const team = save.teams[15]
        save.players.push(player("bench_a", 50), player("bench_b", 50))
        team.rosterIds.push("bench_a", "bench_b")
        save.contracts.push({ playerId: "bench_a", teamId: team.id, salaryPerWeek: 4_000, startWeek: 1, endWeek: 200, buyout: 0 },
            { playerId: "bench_b", teamId: team.id, salaryPerWeek: 6_000, startWeek: 1, endWeek: 200, buyout: 0 })
        save.staff.push({ id: "st1", teamId: team.id, name: "Coach", role: "coach", salaryPerWeek: 5_000 } as never)
        team.staffIds = ["st1"]
        team.facilities = [{ id: "f1", type: "TRAINING", level: 2, monthlyCost: 4_757, description: "" }]
        // A star on a wage the club cannot carry.
        save.contracts.find(c => c.playerId === team.rosterIds[0])!.salaryPerWeek = 12_000
        team.budget = 60_000
        expect(aiClubBudget(save, team).net).toBeLessThan(0)
        expect(aiCostControl(save, team)).toBe("bench")
        expect(team.rosterIds).not.toContain("bench_b") // highest-paid bench player first
        expect(aiCostControl(save, team)).toBe("bench")
        expect(team.rosterIds).toHaveLength(5)
        expect(aiCostControl(save, team)).toBe("staff")
        expect(team.staffIds).toEqual([])
        expect(aiCostControl(save, team)).toBe("facility")
        expect(team.facilities).toEqual([expect.objectContaining({ type: "TRAINING", level: 1 })])
        expect(aiCostControl(save, team)).toBe("facility")
        expect(team.facilities).toEqual([])
        const star = team.rosterIds[0]
        const wagesBefore = save.contracts.filter(c => c.teamId === team.id).reduce((n, c) => n + c.salaryPerWeek, 0)
        expect(aiCostControl(save, team)).toBe("swap")
        expect(team.rosterIds).toHaveLength(5)
        expect(team.rosterIds).not.toContain(star)
        const replacement = team.rosterIds[0] // takes the starter's lineup slot
        expect(save.contracts.find(c => c.playerId === replacement && c.teamId === team.id)!.salaryPerWeek)
            .toBeLessThanOrEqual(12_000 * AI_ECONOMY_TUNING.SWAP_MAX_WAGE_SHARE)
        expect(save.contracts.filter(c => c.teamId === team.id).reduce((n, c) => n + c.salaryPerWeek, 0)).toBeLessThan(wagesBefore)
        expect(team.aiWageSwapWeek).toBe(save.currentWeek)
        // One swap per SWAP_EVERY_WEEKS.
        expect(aiCostControl(save, team)).toBeNull()
    })

    test("a rich club with a modest deficit keeps its squad; a club in debt cuts even when it breaks even", () => {
        const save = world()
        const rich = save.teams[15]
        save.staff.push({ id: "st_r", teamId: rich.id, name: "Coach", role: "coach", salaryPerWeek: 3_000 } as never)
        rich.staffIds = ["st_r"]
        const deficit = -aiClubBudget(save, rich).net
        expect(deficit).toBeGreaterThan(0)
        rich.budget = deficit * (AI_ECONOMY_TUNING.CUT_RUNWAY_WEEKS + 10)
        expect(aiCostControl(save, rich)).toBeNull()
        expect(rich.staffIds).toEqual(["st_r"])
        const indebted = save.teams[16]
        withIncome(indebted, 50_000)
        save.staff.push({ id: "st_d", teamId: indebted.id, name: "Coach", role: "coach", salaryPerWeek: 3_000 } as never)
        indebted.staffIds = ["st_d"]
        indebted.budget = -10_000
        expect(aiClubBudget(save, indebted).net).toBeGreaterThan(0)
        expect(aiCostControl(save, indebted)).toBe("staff")
    })

    test("a profitable club changes nothing", () => {
        const save = world()
        const team = save.teams[20]
        withIncome(team, 20_000)
        const before = structuredClone(team)
        expect(aiCostControl(save, team)).toBeNull()
        expect(team).toEqual(before)
    })

    test("with nobody cheap enough in free agency, a trialist on the minimum wage takes the overpaid starter's place", () => {
        const save = world()
        save.players = save.players.filter(p => !p.id.startsWith("fa"))
        const team = save.teams[8]
        const star = team.rosterIds[0]
        expect(swapOverpaidStarter(save, team)).toBe(true)
        expect(team.rosterIds).not.toContain(star)
        expect(team.rosterIds[0]).toMatch(/^trialist_/)
        expect(save.contracts.find(c => c.playerId === team.rosterIds[0])!.salaryPerWeek).toBe(200)
        // Starters already on (near) the minimum are never swapped.
        const cheap = save.teams[40]
        for (const c of save.contracts.filter(c => c.teamId === cheap.id)) c.salaryPerWeek = 300
        expect(swapOverpaidStarter(save, cheap)).toBe(false)
    })
})

describe("AI squad decisions respect the budget", () => {
    test("renewals: a starter cheaper than his market ask is renewed even over budget; a bench player is not", () => {
        const save = world()
        save.currentWeek = 10
        const team = save.teams[20]
        const players = new Map(save.players.map(p => [p.id, p]))
        save.players.push(player("bench_x", 40))
        team.rosterIds.push("bench_x")
        save.contracts.push({ playerId: "bench_x", teamId: team.id, salaryPerWeek: 300, startWeek: 1, endWeek: 15, buyout: 0 })
        players.set("bench_x", save.players.at(-1)!)
        for (const c of save.contracts.filter(c => c.teamId === team.id)) c.endWeek = 15
        // Over budget: wages far beyond income.
        save.contracts.find(c => c.playerId === team.rosterIds[0])!.salaryPerWeek = 30_000
        expect(aiClubBudget(save, team).headroom).toBeLessThan(0)
        renewExpiringContracts(team, save, players)
        const ends = (id: string) => save.contracts.find(c => c.playerId === id && c.teamId === team.id)!.endWeek
        // Snapshot-wage starters ($350, ask far higher) are bargains: renewed.
        for (const id of team.rosterIds.slice(1, 5)) {
            const p = players.get(id)!
            expect(350 * AI_SQUAD_TUNING.RENEWAL_SALARY_MULTIPLIER).toBeLessThanOrEqual(recruitmentSalary(p, save.currentWeek, team))
            expect(ends(id)).toBe(15 + AI_SQUAD_TUNING.RENEWAL_EXTENSION_WEEKS)
        }
        // The overpaid star and the bench player are left to expire.
        expect(ends(team.rosterIds[0])).toBe(15)
        expect(ends("bench_x")).toBe(15)
    })

    test("an upgrade that only fits like-for-like releases the weakest starter instead of benching him", () => {
        const save = world()
        save.currentWeek = 4
        const team = save.teams[20]
        const players = new Map(save.players.map(p => [p.id, p]))
        const pool = save.players.filter(p => p.id.startsWith("fa")).sort((a, b) => b.skill - a.skill)
        const star = pool[0]
        const ask = recruitmentSalary(star, save.currentWeek, team)
        const weakest = team.rosterIds[4]
        save.contracts.find(c => c.playerId === weakest)!.salaryPerWeek = ask
        // Headroom covers the star only once the weakest starter's wage is gone.
        withIncome(team, 0)
        const gap = aiClubBudget(save, team).headroom
        withIncome(team, Math.max(0, Math.ceil(-gap + ask / 2)))
        const budget = aiClubBudget(save, team)
        expect(aiCanCommit(team, budget, ask)).toBe(false)
        expect(aiCanCommit(team, budget, 0)).toBe(true)
        for (let w = 1; w <= AI_SQUAD_TUNING.UPGRADE_EVERY_WEEKS && !team.rosterIds.includes(star.id); w++) {
            save.currentWeek = w
            upgradeFromFreeAgency(team, save, pool, players)
        }
        expect(team.rosterIds).toContain(star.id)
        expect(team.rosterIds).not.toContain(weakest)
        expect(team.rosterIds).toHaveLength(5)
    })

    test("an AI club with an open sponsor slot it qualifies for signs every week, and does not look when none qualifies", () => {
        const save = world()
        const small = save.teams[35]
        small.worldRanking = 120
        manageSponsors(small, save, new SeededRNG(1))
        expect(small.sponsors!.map(s => s.tier)).toEqual(["STANDARD"])
        // Only PREMIUM/ELITE slots left, neither within reach: no offers generated, no RNG used.
        const rng = new SeededRNG(9), state = rng.getState()
        manageSponsors(small, save, rng)
        expect(rng.getState()).toBe(state)
        const top = save.teams[0]
        top.worldRanking = 3
        manageSponsors(top, save, new SeededRNG(2))
        expect(top.sponsors!.map(s => s.tier).sort()).toEqual(["ELITE", "PREMIUM", "STANDARD"])
    })
})

describe("roster viability is a hard invariant", () => {
    test("the best player the budget allows, else the cheapest on credit, else a trialist; never an academy prospect of another club", () => {
        const save = world()
        const team = save.teams[10]
        withIncome(team, 30_000)
        team.rosterIds = team.rosterIds.slice(0, 3)
        save.contracts = save.contracts.filter(c => c.teamId !== team.id || team.rosterIds.includes(c.playerId))
        const share = Math.floor(aiClubBudget(save, team).headroom / 2)
        const free = save.players.filter(p => p.id.startsWith("fa"))
        const best = free.filter(p => recruitmentSalary(p, save.currentWeek, team) <= share).sort((a, b) => b.skill - a.skill)[0]
        expect(fillAIRosterToFive(save, team)).toBe(2)
        expect(team.rosterIds).toHaveLength(5)
        expect(save.players.find(p => p.id === team.rosterIds[3])!.skill).toBeGreaterThanOrEqual(best.skill - 1)
        // Broke and no free agents: trialists keep the club playing.
        const broke = save.teams[11]
        broke.budget = -500_000
        broke.rosterIds = broke.rosterIds.slice(0, 2)
        save.contracts = save.contracts.filter(c => c.teamId !== broke.id || broke.rosterIds.includes(c.playerId))
        save.players = save.players.filter(p => save.teams.some(t => t.rosterIds.includes(p.id)))
        expect(ensureAIRosterViability(save, save.playerTeamId)).toEqual([broke.id])
        expect(broke.rosterIds).toHaveLength(5)
        expect(broke.rosterIds.slice(2).every(id => id.startsWith("trialist_"))).toBe(true)
        expect(new Set(save.players.map(p => p.id)).size).toBe(save.players.length)
        expect(broke.budget).toBe(-500_000)
    })

    test("the managed club is never filled by the AI", () => {
        const save = world()
        const me = save.teams.find(t => t.id === save.playerTeamId)!
        me.rosterIds = me.rosterIds.slice(0, 3)
        ensureAIRosterViability(save, save.playerTeamId)
        expect(me.rosterIds).toHaveLength(3)
    })
})

describe("two seasons of the AI economy", () => {
    // The week processor's economy steps, in its order (matches are league
    // results only; the managed club takes no decisions).
    function run(seasons: number) {
        const save = world()
        const pt = save.playerTeamId
        const rng = new SeededRNG(11)
        const ai = save.teams.filter(t => t.id !== pt)
        const band = new Map(ai.map(t => [t.id, (t.worldRanking ?? 99) <= 4 ? "star" : (t.worldRanking ?? 99) <= 12 ? "established" : "small"]))
        let minRoster = Infinity
        const seasonsOut: Array<{ cashDelta: Record<string, number[]>; wagesStart: Record<string, number[]>; wagesEnd: Record<string, number[]> }> = []
        const wageBill = (t: TeamSaveData) => save.contracts.filter(c => c.teamId === t.id && t.rosterIds.includes(c.playerId) && c.endWeek > save.currentWeek).reduce((n, c) => n + c.salaryPerWeek, 0)
        let open = new Map(ai.map(t => [t.id, { cash: t.budget, wages: wageBill(t) }]))
        const check = () => { for (const t of ai) minRoster = Math.min(minRoster, t.rosterIds.length) }
        for (let week = 1; week <= seasons * 52; week++) {
            save.currentWeek = week
            FinanceProcessor.processContractExpiry(save, pt)
            ensureAIRosterViability(save, pt)
            check()
            FinanceProcessor.processFinance(save, pt)
            drawDueLeagueSplit(save)
            playLeagueWeek(save, week, (h, a) => hash(`${h}|${a}|${week}`) % 3 === 0)
            processLeagueWeek(save, pt)
            processAIWorldLogic(save, pt, rng)
            processAIAdministration(save, pt)
            processWeeklySponsorGoals(save)
            EventProcessor.processRetirements(save, rng)
            EventProcessor.processMidSeasonRetirements(save, pt, rng)
            ensureAIRosterViability(save, pt)
            check()
            if (week % 52 === 0) {
                const out = { cashDelta: {} as Record<string, number[]>, wagesStart: {} as Record<string, number[]>, wagesEnd: {} as Record<string, number[]> }
                for (const t of ai) {
                    const b = band.get(t.id)!, o = open.get(t.id)!
                    ;(out.cashDelta[b] ??= []).push(t.budget - o.cash)
                    ;(out.wagesStart[b] ??= []).push(o.wages)
                    ;(out.wagesEnd[b] ??= []).push(wageBill(t))
                }
                seasonsOut.push(out)
                open = new Map(ai.map(t => [t.id, { cash: t.budget, wages: wageBill(t) }]))
            }
        }
        return { save, ai, minRoster, seasonsOut }
    }
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

    test("every AI club fields five every week, administrations are rare and never repeat, cash and wages stay within bands", () => {
        const { ai, minRoster, seasonsOut } = run(2)
        expect(minRoster).toBeGreaterThanOrEqual(5)
        const administrations = ai.map(t => t.administrations ?? 0)
        expect(administrations.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1)
        expect(Math.max(...administrations)).toBeLessThanOrEqual(1)
        for (const season of seasonsOut) {
            // Stars and established clubs: roughly break-even to mildly positive.
            for (const b of ["star", "established"]) {
                expect(median(season.cashDelta[b])).toBeGreaterThanOrEqual(-50_000)
                expect(median(season.cashDelta[b])).toBeLessThanOrEqual(300_000)
            }
            // Small clubs: small and positive.
            expect(median(season.cashDelta.small)).toBeGreaterThanOrEqual(0)
            expect(median(season.cashDelta.small)).toBeLessThanOrEqual(150_000)
            // Wage bills stay within what the clubs earn (no 3x inflation).
            for (const b of ["star", "established", "small"]) expect(median(season.wagesEnd[b])).toBeLessThanOrEqual(median(season.wagesStart[b]) * 2)
        }
    }, 120_000)
})
