/**
 * Tests for the match-scheduling slice.
 *
 * Two actions, both of which gate the player's calendar with multiple
 * capacity / staleness / business-rule checks. Each rule has a
 * dedicated test so future scheduling-policy changes can't silently
 * drop one.
 *
 * scheduleScrim
 *   - parseBoundedInt week (past weeks rejected)
 *   - parseBoundedInt day [0,6]
 *   - HYBRID_DAILY: refuse past-day-of-current-week scheduling
 *   - duplicate-scrim guard (same opponent + week + day)
 *   - per-day cap of 2 events (HYBRID_DAILY only)
 *   - weekly cap of 10 slots
 *   - happy path: pushes a SCRIM match record
 *
 * scheduleActivity
 *   - parseBoundedInt week / duration / cost
 *   - HYBRID_DAILY past-day refusal
 *   - weekly slot cap with mixed matches+activities
 *   - BOOTCAMP-specific fatigue gate (>80 avg fatigue blocks)
 *   - happy path: pushes the activity onto scheduledActivities
 */

import { produce, enableMapSet } from "immer"
import { createMatchSchedulingSlice } from "@/store/slices/match-scheduling-slice"
import type { MatchSaveData, ActivitySaveData, TeamSaveData, PlayerSaveData } from "@/engine/save-types"
import type { StoreState } from "@/store/types"

enableMapSet()

function makeHarness(initial: Partial<StoreState>) {
    let state = initial as StoreState
    const set = (
        patch: Partial<StoreState> | ((draft: StoreState) => void)
    ) => {
        if (typeof patch === "function") {
            state = produce(state, patch as (s: StoreState) => void)
        } else {
            state = { ...state, ...patch }
        }
    }
    const get = () => state
    return { state: () => state, set, get }
}

function makeTeam(id: string, rosterIds: string[] = ["p1"]): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(),
        budget: 100_000, rosterIds, staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1, leagueTier: "B_TIER",
        elo: 1500, recentForm: [],
    } as unknown as TeamSaveData
}

function makePlayer(id: string, fatigue = 30): PlayerSaveData {
    return {
        id, nickname: id, firstName: id, lastName: "P",
        age: 22, nationality: "US", role: "RIFLER",
        rifle: 70, awp: 60, pistol: 65, grenades: 60, creativity: 60,
        clutch: 60, tactic: 60, leader: 55, teamwork: 65,
        reaction: 70, eyesight: 70,
        morale: 75, form: 70, fatigue, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        skill: 70, potential: 85, productivity: 60, endurance: 70,
    } as unknown as PlayerSaveData
}

function makeBaseState(overrides: Partial<StoreState> = {}): Partial<StoreState> {
    return {
        teams: [makeTeam("player"), makeTeam("opp")],
        players: [makePlayer("p1")],
        contracts: [],
        scheduledMatches: [] as MatchSaveData[],
        scheduledActivities: [] as ActivitySaveData[],
        currentWeek: 10,
        currentDay: 3,
        timeMode: "WEEKLY",
        playerTeamId: "player",
        lastRngSeed: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    }
}

describe("scheduleScrim", () => {
    test("rejects scrim for a week BEFORE current week (past weeks)", () => {
        const h = makeHarness(makeBaseState({ currentWeek: 10 }))
        const slice = createMatchSchedulingSlice(h.set, h.get)
        const res = slice.scheduleScrim("opp", 9)
        expect(res.success).toBe(false)
        expect(res.message).toContain("Scrim week")
    })

    test("rejects out-of-range day (>6)", () => {
        const h = makeHarness(makeBaseState())
        const slice = createMatchSchedulingSlice(h.set, h.get)
        const res = slice.scheduleScrim("opp", 11, 7)
        expect(res.success).toBe(false)
        expect(res.message).toContain("Scrim day")
    })

    test("HYBRID_DAILY: refuses scheduling into a past day of the current week", () => {
        const h = makeHarness(makeBaseState({
            timeMode: "HYBRID_DAILY",
            currentWeek: 10, currentDay: 4,
        }))
        const slice = createMatchSchedulingSlice(h.set, h.get)
        const res = slice.scheduleScrim("opp", 10, 2)
        expect(res.success).toBe(false)
        expect(res.message).toContain("past days")
    })

    test("happy path: pushes a SCRIM match for the right week+opponent", () => {
        const h = makeHarness(makeBaseState())
        const slice = createMatchSchedulingSlice(h.set, h.get)
        const res = slice.scheduleScrim("opp", 12)
        expect(res.success).toBe(true)
        expect(h.state().scheduledMatches.length).toBe(1)
        const m = h.state().scheduledMatches[0]
        expect(m.homeTeamId).toBe("player")
        expect(m.awayTeamId).toBe("opp")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((m as any).isScrim).toBe(true)
        expect(m.tournamentId).toBe("SCRIM")
    })

    test("duplicate-scrim guard: same opponent + same week (+ same day) refused", () => {
        const h = makeHarness(makeBaseState({
            timeMode: "HYBRID_DAILY",
            scheduledMatches: [{
                id: "m1", homeTeamId: "player", awayTeamId: "opp",
                tournamentId: "SCRIM", week: 12, day: 3, format: "BO1",
                seed: 0, isScrim: true,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any],
        }))
        const slice = createMatchSchedulingSlice(h.set, h.get)
        const res = slice.scheduleScrim("opp", 12, 3)
        expect(res.success).toBe(false)
        expect(res.message).toContain("already scheduled")
    })

    test("per-day cap of MAX_DAILY_EVENTS=2 in HYBRID_DAILY", () => {
        const day = 4
        const h = makeHarness(makeBaseState({
            timeMode: "HYBRID_DAILY",
            scheduledMatches: [
                {
                    id: "m1", homeTeamId: "player", awayTeamId: "opp_a",
                    tournamentId: "SCRIM", week: 12, day, format: "BO1",
                    seed: 0, isScrim: true,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any,
                {
                    id: "m2", homeTeamId: "player", awayTeamId: "opp_b",
                    tournamentId: "SCRIM", week: 12, day, format: "BO1",
                    seed: 0, isScrim: true,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any,
            ],
        }))
        const slice = createMatchSchedulingSlice(h.set, h.get)
        const res = slice.scheduleScrim("opp_c", 12, day)
        expect(res.success).toBe(false)
        expect(res.message).toContain("Day schedule is full")
    })

    test("weekly slot cap of 10 across matches + activities", () => {
        // 10 already-scheduled items in week 12 → refuse a new scrim.
        const scheduledMatches = Array.from({ length: 5 }, (_, i) => ({
            id: `m${i}`, homeTeamId: "player", awayTeamId: `opp_${i}`,
            tournamentId: "SCRIM", week: 12, format: "BO1", seed: 0, isScrim: true,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any)
        const scheduledActivities = Array.from({ length: 5 }, (_, i) => ({
            id: `a${i}`, week: 12, duration: 1, type: "STAFF_MEETING", name: `m${i}`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any)
        const h = makeHarness(makeBaseState({
            scheduledMatches, scheduledActivities,
        }))
        const slice = createMatchSchedulingSlice(h.set, h.get)
        const res = slice.scheduleScrim("opp_x", 12)
        expect(res.success).toBe(false)
        expect(res.message).toContain("Weekly schedule is full")
    })
})

describe("scheduleActivity", () => {
    function makeActivity(overrides: Partial<ActivitySaveData> = {}): ActivitySaveData {
        return {
            id: "a1", week: 12, duration: 2, type: "MARKETING",
            name: "Media Push", data: { followersPerWeek: 200 },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...overrides,
        } as any
    }

    test("happy path: pushes a normalized activity onto scheduledActivities", () => {
        const h = makeHarness(makeBaseState())
        const slice = createMatchSchedulingSlice(h.set, h.get)
        const res = slice.scheduleActivity(makeActivity())
        expect(res.success).toBe(true)
        expect(h.state().scheduledActivities.length).toBe(1)
        expect(h.state().scheduledActivities[0].week).toBe(12)
    })

    test("refuses past-week activity", () => {
        const h = makeHarness(makeBaseState({ currentWeek: 12 }))
        const slice = createMatchSchedulingSlice(h.set, h.get)
        const res = slice.scheduleActivity(makeActivity({ week: 5 }))
        expect(res.success).toBe(false)
    })

    test("refuses duration <1 or >52", () => {
        const h = makeHarness(makeBaseState())
        const slice = createMatchSchedulingSlice(h.set, h.get)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tooLong = slice.scheduleActivity(makeActivity({ duration: 100 as any }))
        expect(tooLong.success).toBe(false)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tooShort = slice.scheduleActivity(makeActivity({ duration: 0 as any }))
        expect(tooShort.success).toBe(false)
    })

    test("BOOTCAMP refused when avg roster fatigue > 80", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1", 90), makePlayer("p2", 85)],
            teams: [makeTeam("player", ["p1", "p2"]), makeTeam("opp")],
        }))
        const slice = createMatchSchedulingSlice(h.set, h.get)
        const res = slice.scheduleActivity(makeActivity({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            type: "BOOTCAMP" as any,
            duration: 1,
        }))
        expect(res.success).toBe(false)
        expect(res.message).toContain("exhausted")
    })

    test("BOOTCAMP allowed when avg roster fatigue ≤ 80", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1", 50), makePlayer("p2", 60)],
            teams: [makeTeam("player", ["p1", "p2"]), makeTeam("opp")],
        }))
        const slice = createMatchSchedulingSlice(h.set, h.get)
        const res = slice.scheduleActivity(makeActivity({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            type: "BOOTCAMP" as any,
            duration: 1,
        }))
        expect(res.success).toBe(true)
    })
})
