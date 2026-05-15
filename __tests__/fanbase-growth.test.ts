/**
 * Tests for the weekly fanbase-growth processor.
 *
 * Mutates team.followers each tick based on five additive channels:
 *   1. Organic growth from reputation (0–105/week)
 *   2. Fan-Zone facility multiplier (+15% per level)
 *   3. Recent match results — wins boost, losses stagnate
 *   4. Top-30 world-ranking clout
 *   5. Active MARKETING campaigns
 *
 * Each channel is locked independently here so a future refactor
 * can't silently lose one. The whole-formula integration is already
 * smoke-tested via week-tick, so these tests focus on the math.
 */

import { processFanbaseGrowth } from "@/engine/processors/fanbase-growth"
import { SeededRNG } from "@/engine/rng"
import type { GameSave, TeamSaveData, CompletedMatchSaveData } from "@/engine/save-types"

function makeTeam(id: string, overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(),
        budget: 1_000_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        followers: 0, fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1, leagueTier: "B_TIER",
        elo: 1500, recentForm: [],
        ...overrides,
    } as unknown as TeamSaveData
}

function makeSave(teams: TeamSaveData[], overrides: Partial<GameSave> = {}): GameSave {
    return {
        currentWeek: 10,
        playerTeamId: "t1",
        teams,
        players: [],
        contracts: [],
        staff: [],
        marketStaff: [],
        scheduledMatches: [],
        completedMatches: [],
        scheduledActivities: [],
        financeLedger: [],
        eventsLog: [],
        newsFeed: [],
        tournaments: [],
        tournamentQualifications: [],
        academyPlayers: [],
        lastRngSeed: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    } as unknown as GameSave
}

function makeWin(teamId: string, week: number, opp = "opponent"): CompletedMatchSaveData {
    return {
        id: `m_${teamId}_${week}`,
        homeTeamId: teamId, awayTeamId: opp,
        week, format: "BO1",
        result: { homeScore: 16, awayScore: 5, maps: [] },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
}

function makeLoss(teamId: string, week: number, opp = "opponent"): CompletedMatchSaveData {
    return {
        id: `m_${teamId}_${week}`,
        homeTeamId: teamId, awayTeamId: opp,
        week, format: "BO1",
        result: { homeScore: 5, awayScore: 16, maps: [] },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
}

const rng = new SeededRNG(1)

describe("processFanbaseGrowth — organic + Fan-Zone", () => {
    test("zero reputation team gains zero organic followers", () => {
        const team = makeTeam("t1", { reputation: 0, followers: 100 })
        const save = makeSave([team])
        processFanbaseGrowth(save, rng)
        expect(team.followers).toBe(100)
    })

    test("reputation=100 + no Fan-Zone → +105/week organic (15/day × 7)", () => {
        const team = makeTeam("t1", { reputation: 100, followers: 0 })
        const save = makeSave([team])
        processFanbaseGrowth(save, rng)
        expect(team.followers).toBe(105)
    })

    test("Fan-Zone level 1 multiplies organic by 1.15", () => {
        const team = makeTeam("t1", {
            reputation: 100, followers: 0,
            facilities: [{ id: "fz", type: "FANZONE", level: 1, description: "", monthlyCost: 0 } as never],
        })
        const save = makeSave([team])
        processFanbaseGrowth(save, rng)
        // 105 * 1.15 = 120.75 → floored to 120
        expect(team.followers).toBe(120)
    })

    test("Fan-Zone level 3 multiplies organic by 1.45", () => {
        const team = makeTeam("t1", {
            reputation: 100, followers: 0,
            facilities: [{ id: "fz", type: "FANZONE", level: 3, description: "", monthlyCost: 0 } as never],
        })
        const save = makeSave([team])
        processFanbaseGrowth(save, rng)
        // 105 * 1.45 = 152.25 → floored to 152
        expect(team.followers).toBe(152)
    })
})

describe("processFanbaseGrowth — match-result channel", () => {
    test("a win adds 500 + (reputation * 5) followers", () => {
        const team = makeTeam("t1", { reputation: 60, followers: 0 })
        const save = makeSave([team], {
            completedMatches: [makeWin("t1", 10)],
            currentWeek: 10,
        })
        processFanbaseGrowth(save, rng)
        // Organic: 60/100 * 15 * 7 = 63
        // Win bonus: 500 + (60 * 5) = 800
        // Total: 63 + 800 = 863
        expect(team.followers).toBe(863)
    })

    test("a loss subtracts 100 followers (stagnation)", () => {
        const team = makeTeam("t1", { reputation: 0, followers: 500 })
        const save = makeSave([team], {
            completedMatches: [makeLoss("t1", 10)],
            currentWeek: 10,
        })
        processFanbaseGrowth(save, rng)
        // Organic: 0 (rep=0)
        // Loss penalty: -100
        // Total: 500 - 100 = 400
        expect(team.followers).toBe(400)
    })

    test("followers can never go below 0 (floor at zero, no debt)", () => {
        const team = makeTeam("t1", { reputation: 0, followers: 50 })
        const save = makeSave([team], {
            completedMatches: [makeLoss("t1", 10), makeLoss("t1", 10, "opp2")],
            currentWeek: 10,
        })
        processFanbaseGrowth(save, rng)
        // 50 - 200 = -150, but clamped to 0.
        expect(team.followers).toBe(0)
    })

    test("matches from OTHER weeks are ignored", () => {
        const team = makeTeam("t1", { reputation: 0, followers: 1000 })
        const save = makeSave([team], {
            completedMatches: [makeWin("t1", 5)], // 5 weeks ago
            currentWeek: 10,
        })
        processFanbaseGrowth(save, rng)
        // No followers change (organic=0, win is for wrong week, so no bonus).
        expect(team.followers).toBe(1000)
    })
})

describe("processFanbaseGrowth — ranking + marketing", () => {
    test("worldRanking 1 grants bonus 30 * 50 = 1500 followers", () => {
        const team = makeTeam("t1", { reputation: 0, followers: 0, worldRanking: 1 })
        const save = makeSave([team])
        processFanbaseGrowth(save, rng)
        // (31 - 1) * 50 = 1500
        expect(team.followers).toBe(1500)
    })

    test("worldRanking 30 still grants a small bonus", () => {
        const team = makeTeam("t1", { reputation: 0, followers: 0, worldRanking: 30 })
        const save = makeSave([team])
        processFanbaseGrowth(save, rng)
        // (31 - 30) * 50 = 50
        expect(team.followers).toBe(50)
    })

    test("worldRanking 31+ gets NO ranking bonus", () => {
        const team = makeTeam("t1", { reputation: 0, followers: 0, worldRanking: 31 })
        const save = makeSave([team])
        processFanbaseGrowth(save, rng)
        expect(team.followers).toBe(0)
    })

    test("active MARKETING campaign adds followersPerWeek for each week in its duration", () => {
        const team = makeTeam("t1", { reputation: 0, followers: 0 })
        const save = makeSave([team], {
            currentWeek: 12,
            scheduledActivities: [
                // Campaign started week 10, 4 weeks long, so weeks 10..13 are active.
                {
                    id: "mkt1", type: "MARKETING", week: 10, duration: 4,
                    data: { followersPerWeek: 250 },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any,
            ],
        })
        processFanbaseGrowth(save, rng)
        expect(team.followers).toBe(250)
    })

    test("MARKETING campaign that just ended does not contribute", () => {
        const team = makeTeam("t1", { reputation: 0, followers: 0 })
        const save = makeSave([team], {
            currentWeek: 14,
            scheduledActivities: [
                // Campaign started week 10, 4 weeks long, so weeks 10..13 are active; week 14 is past.
                {
                    id: "mkt1", type: "MARKETING", week: 10, duration: 4,
                    data: { followersPerWeek: 250 },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any,
            ],
        })
        processFanbaseGrowth(save, rng)
        expect(team.followers).toBe(0)
    })
})
