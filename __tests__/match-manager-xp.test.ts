/**
 * Coverage for engine/processors/match-manager-xp.ts.
 *
 * Pins manager XP + win/loss + reputation update extracted in
 * Phase M9 from atomic-week-processor.processMatches.
 *
 * Effects (player team side only):
 *   - Win:  careerWins++,  xp += 100 × mult, reputation += 5
 *   - Loss: careerLosses++, xp += 25 × mult,  reputation -= 1 (floor 0)
 *   - AI vs AI: no-op
 *
 * Mult is 1 + sum(xp_gain from analyst talents) / 100, capped at 1.5.
 *
 * Important quirk preserved: draws (homeScore === awayScore) take the
 * loss branch when the player participated, because the original
 * inline code used `else if` after a null winnerId. Test pins this so
 * future refactors don't accidentally change it without intention.
 */

import {
    applyMatchManagerXP,
    getAnalystXpMultiplier,
} from "@/engine/processors/match-manager-xp"
import type { GameSave, MatchSaveData, StaffSaveData } from "@/engine/save-types"
import type { MatchResult } from "@/types"

function makeManagerDetails(overrides: Partial<GameSave["managerDetails"]> = {}) {
    return {
        name: "M", level: 1, xp: 0, reputation: 10,
        careerWins: 0, careerLosses: 0, championships: 0,
        ...overrides,
    } as GameSave["managerDetails"]
}

function makeStaff(role: string, talents: string[] = [], teamId = "player"): StaffSaveData {
    return {
        id: `${role}_${Math.random().toString(36).slice(2, 8)}`,
        teamId, name: role, role,
        salaryPerWeek: 1000, level: 3, contractEndWeek: 52,
        unlockedTalentIds: talents,
        stats: {},
    } as unknown as StaffSaveData
}

function makeSave(overrides: Partial<GameSave> = {}): GameSave {
    return {
        saveVersion: 6, saveId: "test", saveName: "test",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        currentWeek: 5, currentDay: 6, timeMode: "WEEKLY",
        gameStartDate: new Date().toISOString(),
        managerDetails: makeManagerDetails(),
        lastRngSeed: 1, playerTeamId: "player",
        teams: [], players: [], contracts: [], staff: [],
        tournaments: [], scheduledMatches: [], completedMatches: [],
        scheduledActivities: [], financeLedger: [], eventsLog: [], newsFeed: [],
        acknowledgedEventIds: [], hallOfFame: [], legendaryPlayers: [],
        weekTickState: null,
        ...overrides,
    } as unknown as GameSave
}

function makeMatch(home: string, away: string): MatchSaveData {
    return {
        id: "m1", homeTeamId: home, awayTeamId: away,
        tournamentId: "t", stage: "Group", week: 5, day: 5,
        format: "BO1", seed: 1,
    } as MatchSaveData
}

function makeResult(homeScore: number, awayScore: number): MatchResult {
    return {
        winnerId: homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : null,
        homeScore, awayScore, maps: [], playerStats: {}, mvpPlayerId: "",
    } as MatchResult
}

describe("getAnalystXpMultiplier", () => {
    test("no analysts → 1.0 (no bonus)", () => {
        const save = makeSave({ staff: [] })
        expect(getAnalystXpMultiplier(save, "player")).toBe(1.0)
    })

    test("analyst with no talent unlocks → 1.0", () => {
        const save = makeSave({ staff: [makeStaff("analyst", [])] })
        expect(getAnalystXpMultiplier(save, "player")).toBe(1.0)
    })

    test("analyst with analyst_demo talent (xp_gain +10) → 1.1", () => {
        // analyst_demo requires analyst_basics prereq in the tree, but
        // getStaffPassiveBonuses just collects effects from unlocked ids
        // without prereq enforcement, so we just put both ids.
        const save = makeSave({ staff: [makeStaff("analyst", ["analyst_basics", "analyst_demo"])] })
        expect(getAnalystXpMultiplier(save, "player")).toBeCloseTo(1.1, 5)
    })

    test("two analysts stack their xp_gain bonuses", () => {
        const save = makeSave({
            staff: [
                makeStaff("analyst", ["analyst_basics", "analyst_demo"]),
                makeStaff("analyst", ["analyst_basics", "analyst_demo"]),
            ],
        })
        // 10 + 10 = 20 → 1.20
        expect(getAnalystXpMultiplier(save, "player")).toBeCloseTo(1.20, 5)
    })

    test("multiplier caps at +50% even with many stacked analysts", () => {
        const save = makeSave({
            staff: Array.from({ length: 10 }, () =>
                makeStaff("analyst", ["analyst_basics", "analyst_demo"])
            ),
        })
        // 10 analysts × 10 = 100, but cap is 50 → multiplier 1.5
        expect(getAnalystXpMultiplier(save, "player")).toBe(1.5)
    })

    test("non-analyst staff with xp_gain are ignored", () => {
        const save = makeSave({
            staff: [
                makeStaff("coach", ["analyst_basics", "analyst_demo"]),
                makeStaff("psychologist", ["analyst_demo"]),
            ],
        })
        expect(getAnalystXpMultiplier(save, "player")).toBe(1.0)
    })

    test("analyst on another team is ignored", () => {
        const save = makeSave({
            staff: [makeStaff("analyst", ["analyst_basics", "analyst_demo"], "other_team")],
        })
        expect(getAnalystXpMultiplier(save, "player")).toBe(1.0)
    })
})

describe("applyMatchManagerXP — player team wins", () => {
    test("player home win → +100 XP, +5 reputation, +1 careerWins", () => {
        const save = makeSave()
        applyMatchManagerXP(save, makeMatch("player", "ai_1"), makeResult(2, 0), "player")

        expect(save.managerDetails!.careerWins).toBe(1)
        expect(save.managerDetails!.careerLosses).toBe(0)
        expect(save.managerDetails!.xp).toBe(100)
        expect(save.managerDetails!.reputation).toBe(15) // started at 10
    })

    test("player away win → same +100 XP / +5 reputation", () => {
        const save = makeSave()
        applyMatchManagerXP(save, makeMatch("ai_1", "player"), makeResult(0, 2), "player")

        expect(save.managerDetails!.careerWins).toBe(1)
        expect(save.managerDetails!.xp).toBe(100)
        expect(save.managerDetails!.reputation).toBe(15)
    })

    test("win XP multiplied by analyst talent (1 analyst → +110 instead of +100)", () => {
        const save = makeSave({
            staff: [makeStaff("analyst", ["analyst_basics", "analyst_demo"])],
        })
        applyMatchManagerXP(save, makeMatch("player", "ai_1"), makeResult(2, 0), "player")

        // 100 × 1.1 = 110
        expect(save.managerDetails!.xp).toBe(110)
    })
})

describe("applyMatchManagerXP — player team loses", () => {
    test("player home loss → +25 XP participation, -1 reputation, +1 careerLosses", () => {
        const save = makeSave({ managerDetails: makeManagerDetails({ reputation: 10 }) })
        applyMatchManagerXP(save, makeMatch("player", "ai_1"), makeResult(0, 2), "player")

        expect(save.managerDetails!.careerLosses).toBe(1)
        expect(save.managerDetails!.careerWins).toBe(0)
        expect(save.managerDetails!.xp).toBe(25)
        expect(save.managerDetails!.reputation).toBe(9)
    })

    test("reputation floors at 0 (never negative)", () => {
        const save = makeSave({ managerDetails: makeManagerDetails({ reputation: 0 }) })
        applyMatchManagerXP(save, makeMatch("player", "ai_1"), makeResult(0, 2), "player")
        expect(save.managerDetails!.reputation).toBe(0)
    })

    test("loss XP multiplied by analyst talent (1 analyst → +28 instead of +25)", () => {
        const save = makeSave({
            staff: [makeStaff("analyst", ["analyst_basics", "analyst_demo"])],
        })
        applyMatchManagerXP(save, makeMatch("player", "ai_1"), makeResult(0, 2), "player")

        // 25 × 1.1 = 27.5 → rounded to 28
        expect(save.managerDetails!.xp).toBe(28)
    })
})

describe("applyMatchManagerXP — non-participation + draws", () => {
    test("AI vs AI match → no manager XP, no rep change, no career change", () => {
        const save = makeSave({
            managerDetails: makeManagerDetails({ xp: 50, reputation: 12, careerWins: 5, careerLosses: 5 }),
        })
        applyMatchManagerXP(save, makeMatch("ai_1", "ai_2"), makeResult(2, 0), "player")

        expect(save.managerDetails!.xp).toBe(50)
        expect(save.managerDetails!.reputation).toBe(12)
        expect(save.managerDetails!.careerWins).toBe(5)
        expect(save.managerDetails!.careerLosses).toBe(5)
    })

    test("draw involving player → counts as loss (PRESERVED CONTRACT)", () => {
        // The original inline code's `else if` makes draws fall into the
        // loss branch when player participated. This pins the behavior so
        // a future refactor doesn't accidentally change it.
        const save = makeSave()
        applyMatchManagerXP(save, makeMatch("player", "ai_1"), makeResult(1, 1), "player")

        expect(save.managerDetails!.careerLosses).toBe(1)
        expect(save.managerDetails!.careerWins).toBe(0)
        expect(save.managerDetails!.xp).toBe(25)
        expect(save.managerDetails!.reputation).toBe(9)
    })

    test("draw NOT involving player → no-op", () => {
        const save = makeSave({ managerDetails: makeManagerDetails({ reputation: 12 }) })
        applyMatchManagerXP(save, makeMatch("ai_1", "ai_2"), makeResult(1, 1), "player")

        expect(save.managerDetails!.reputation).toBe(12)
        expect(save.managerDetails!.careerWins).toBe(0)
        expect(save.managerDetails!.careerLosses).toBe(0)
        expect(save.managerDetails!.xp).toBe(0)
    })

    test("missing managerDetails → silent no-op (no crash)", () => {
        const save = makeSave({ managerDetails: undefined as any })
        expect(() =>
            applyMatchManagerXP(save, makeMatch("player", "ai_1"), makeResult(2, 0), "player")
        ).not.toThrow()
    })
})
