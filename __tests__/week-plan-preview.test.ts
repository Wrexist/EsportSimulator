/**
 * Phase 4.2 week plan: the forecast must match what the week update really
 * does. These tests run the real processors (weekly focus, bookings,
 * training, recovery, rest days) on a copy of the same club and compare
 * fatigue and morale with buildWeekPreview, so a processor change that the
 * preview doesn't follow fails here.
 */
import { buildWeekPreview, idleDays, matchFatigue, activitiesThisWeek, type WeekPreviewInput } from "@/components/week/week-preview"
import { trainingModifiers } from "@/components/training/weekly-training"
import { applyWeeklyActivity } from "@/engine/processors/weekly-activity-processor"
import { applyScheduledActivities } from "@/engine/processors/scheduled-activities-processor"
import { TrainingProcessor } from "@/engine/processors/training-processor"
import { SeededRNG } from "@/engine/rng"
import { TrainingFocus, WeeklyActivityType } from "@/types"
import { MEETING_TYPES, consecutiveLosses, meetingActivityId, meetingStatus, type MeetingContext } from "@/components/schedule/staff-meetings"
import type { ActivitySaveData, GameSave, PlayerSaveData, StaffSaveData, TeamSaveData } from "@/engine/save-types"

const WEEK = 12

function makePlayer(id: string, overrides: Partial<PlayerSaveData> = {}): PlayerSaveData {
    return {
        id, nickname: id, firstName: id, lastName: "P", age: 26, nationality: "US", role: "Rifler",
        rifle: 60, awp: 40, pistol: 55, grenades: 50, creativity: 50, clutch: 50,
        tactic: 55, leader: 40, teamwork: 55, reaction: 60, eyesight: 50,
        morale: 62, form: 55, fatigue: 48, energy: 70, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0, totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        salary: 1000, contractWeeks: 52, skill: 60, potential: 85, productivity: 70, endurance: 60,
        ...overrides,
    } as unknown as PlayerSaveData
}

function makeTeam(rosterIds: string[], overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id: "t1", name: "Team", shortName: "T", budget: 200_000, rosterIds, staffIds: [], trophies: [],
        facilities: [{ type: "RECOVERY", level: 2 }], sponsors: [], fanbase: 1000, playstyle: "default",
        reputation: 50, region: "EU", facilitiesLevel: 1, chemistry: 60, trainingSlotsUsed: 0, maxTrainingSlots: 10,
        ...overrides,
    } as unknown as TeamSaveData
}

function makeSave(team: TeamSaveData, players: PlayerSaveData[], activities: ActivitySaveData[], staff: StaffSaveData[] = []): GameSave {
    return {
        saveVersion: 6, saveId: "test", saveName: "test", createdAt: "", updatedAt: "",
        currentWeek: WEEK, currentDay: 0, timeMode: "WEEKLY", gameStartDate: "2026-01-05T00:00:00.000Z",
        managerDetails: {} as never, lastRngSeed: 1, playerTeamId: "t1",
        teams: [team], players, contracts: [], staff, tournaments: [], scheduledMatches: [], completedMatches: [],
        scheduledActivities: activities, financeLedger: [], eventsLog: [], newsFeed: [],
        acknowledgedEventIds: [], hallOfFame: [], legendaryPlayers: [], weekTickState: null,
    } as unknown as GameSave
}

const nextId = (_s: unknown, prefix: string, ...parts: Array<string | number | null | undefined>) => [prefix, ...parts].join("_")

/** The real week, in the order the store and the week processor run it. */
function runRealWeek(save: GameSave, focus: WeeklyActivityType | null) {
    applyWeeklyActivity(save, { playerTeamId: "t1", selectedActivity: focus, nextId })
    applyScheduledActivities(save, { playerTeamId: "t1", nextId })
    save.currentWeek++
    TrainingProcessor.processTraining(save, new Map([["t1", { focus: TrainingFocus.AIM, intensity: 5 }]]))
    TrainingProcessor.processFatigueRecovery(save, new SeededRNG(7))
    TrainingProcessor.processRestDays(save, "t1")
}

function previewFor(save: GameSave, focus: WeeklyActivityType | null) {
    const team = save.teams[0]
    const input: WeekPreviewInput = {
        team, roster: save.players, staff: save.staff, currentWeek: save.currentWeek, selectedWeeklyActivity: focus,
        scheduledActivities: save.scheduledActivities, scheduledMatches: save.scheduledMatches, completedMatches: save.completedMatches,
        trainingMods: trainingModifiers(team, save.staff, save.currentWeek),
    }
    return buildWeekPreview(input)
}

const meeting = (id: string, day: number): ActivitySaveData => {
    const m = MEETING_TYPES.find(x => x.id === id)!
    return { id: meetingActivityId(id, WEEK), type: "STAFF_MEETING", week: WEEK, day, duration: 0, cost: m.cost, name: m.name, data: { meetingType: id, effects: m.effects } }
}

describe("forecast = the real update", () => {
    test.each([
        ["Team Bonding + staff meeting", WeeklyActivityType.TEAM_BONDING, [meeting("crisis_management", 2)]],
        ["Intensive Bootcamp, nothing booked", WeeklyActivityType.BOOTCAMP, []],
        ["Stream Marathon + local bootcamp block", WeeklyActivityType.STREAMING, [
            { id: "bootcamp_12_LOCAL_2", type: "BOOTCAMP", week: WEEK, duration: 2, cost: 10_000, name: "Local Bootcamp", fatigue: 10, effect: { trainingBonus: 15, morale: -5 } } as ActivitySaveData,
        ]],
        ["Training only, retreat started last week", WeeklyActivityType.TRAINING_ONLY, [
            { id: "bootcamp_11_RETREAT_2", type: "REST", week: WEEK - 1, duration: 2, cost: 16_000, name: "Team Building Retreat", fatigue: -30, effect: { trainingBonus: 0, morale: 20 } } as ActivitySaveData,
        ]],
    ])("%s", (_label, focus, activities) => {
        const players = [
            makePlayer("a"), makePlayer("b", { fatigue: 5, morale: 30, trainingFocus: TrainingFocus.REST }),
            makePlayer("c", { fatigue: 90, morale: 95, trainingFocus: TrainingFocus.TACTICS }),
            makePlayer("d", { fatigue: 0, morale: 50, endurance: 90 }), makePlayer("e", { fatigue: 70, morale: 10 }),
        ]
        const save = makeSave(makeTeam(players.map(p => p.id)), players, activities as ActivitySaveData[])
        const preview = previewFor(save, focus)
        runRealWeek(save, focus)
        for (const p of save.players) {
            const proj = preview.players.find(x => x.id === p.id)!
            expect(proj.fatigueEnd).toBeCloseTo(p.fatigue, 6)
            expect(proj.moraleEnd).toBeCloseTo(p.morale, 6)
        }
    })

    test("chemistry and reputation follow focus, meetings and the bootcamp start", () => {
        const players = ["a", "b", "c", "d", "e"].map(id => makePlayer(id))
        const activities = [meeting("chemistry_workshop", 1),
            { id: "bootcamp_12_LOCAL_1", type: "BOOTCAMP", week: WEEK, duration: 1, cost: 5000, name: "Local Bootcamp", fatigue: 10, effect: { trainingBonus: 15, morale: -5 } } as ActivitySaveData]
        const save = makeSave(makeTeam(players.map(p => p.id), { chemistry: 40 }), players, activities)
        const preview = previewFor(save, WeeklyActivityType.TEAM_BONDING)
        applyWeeklyActivity(save, { playerTeamId: "t1", selectedActivity: WeeklyActivityType.TEAM_BONDING, nextId })
        applyScheduledActivities(save, { playerTeamId: "t1", nextId })
        expect(40 + preview.chemistry).toBe(save.teams[0].chemistry)
        expect(preview.cash.focusCost).toBe(1500)
    })

    test("a focus the club can't afford is shown as cancelled and charges nothing", () => {
        const players = ["a", "b", "c", "d", "e"].map(id => makePlayer(id))
        const save = makeSave(makeTeam(players.map(p => p.id), { budget: 3000 }), players, [])
        const preview = previewFor(save, WeeklyActivityType.MEDIA_CAMPAIGN)
        expect(preview.cash).toMatchObject({ focusCost: 0, focusSkipped: true })
        expect(preview.reputation).toBe(0)
    })
})

describe("rest days mirror processRestDays", () => {
    const fx = (id: string, day: number | undefined, isScrim = false) => ({ id, week: WEEK, day, homeTeamId: "t1", awayTeamId: "x", isScrim })
    test("match days and a meeting day are not rest days", () => {
        expect(idleDays("t1", WEEK, [fx("m1", 5)], [meeting("general_strategy", 2)])).toEqual([0, 1, 3, 4, 6])
    })
    test("a block starting this week (bootcamp, marketing) removes every rest day; one started earlier does not", () => {
        const starts = { id: "mk", type: "MARKETING", week: WEEK, duration: 2, cost: 0, name: "Push" } as ActivitySaveData
        const earlier = { id: "bc", type: "BOOTCAMP", week: WEEK - 1, duration: 2, cost: 0, name: "Camp" } as ActivitySaveData
        expect(idleDays("t1", WEEK, [], [starts])).toEqual([])
        expect(idleDays("t1", WEEK, [], [earlier])).toEqual([0, 1, 2, 3, 4, 5, 6])
    })
    test("legacy fixtures without a day keep the old spread (by sorted index: scrims 3/4, others 5/6)", () => {
        // a: index 0, scrim → day 3; b: index 1, official → day 6.
        expect(idleDays("t1", WEEK, [fx("a", undefined, true), fx("b", undefined)], [])).toEqual([0, 1, 2, 4, 5])
    })
    test("same answer as the processor", () => {
        const players = ["a", "b", "c", "d", "e"].map(id => makePlayer(id))
        const save = makeSave(makeTeam(players.map(p => p.id)), players, [meeting("general_strategy", 4)])
        ;(save.scheduledMatches as unknown[]).push({ id: "m1", week: WEEK, day: 1, homeTeamId: "t1", awayTeamId: "x", format: "BO3" })
        const predicted = idleDays("t1", WEEK, save.scheduledMatches, save.scheduledActivities)
        save.currentWeek++
        TrainingProcessor.processRestDays(save, "t1")
        const rows = save.scheduledActivities.filter(a => a.id.startsWith(`rest_w${WEEK}_d`)).map(a => a.day)
        expect(rows).toEqual(predicted)
    })
})

describe("fixtures and bookings", () => {
    test("match fatigue by format", () => {
        expect([matchFatigue("BO1"), matchFatigue("BO3"), matchFatigue("BO5"), matchFatigue(undefined)]).toEqual([10, 15, 25, 10])
    })
    test("only the five who play carry the match fatigue", () => {
        const players = ["a", "b", "c", "d", "e", "f"].map(id => makePlayer(id, { fatigue: 0 }))
        const save = makeSave(makeTeam(players.map(p => p.id)), players, [])
        ;(save.scheduledMatches as unknown[]).push({ id: "m1", week: WEEK, day: 6, homeTeamId: "t1", awayTeamId: "x", format: "BO3" })
        const preview = previewFor(save, null)
        expect(preview.fixturesToPlay.map(m => m.id)).toEqual(["m1"])
        const starter = preview.players.find(p => p.id === "a")!, bench = preview.players.find(p => p.id === "f")!
        expect(starter.fatigueEnd).toBeGreaterThan(bench.fatigueEnd)
    })
    test("bookings this week include blocks still running", () => {
        const acts = [
            { id: "now", type: "BOOTCAMP", week: WEEK, duration: 1, cost: 1, name: "" },
            { id: "running", type: "TRAVEL", week: WEEK - 1, duration: 2, cost: 1, name: "" },
            { id: "over", type: "TRAVEL", week: WEEK - 2, duration: 2, cost: 1, name: "" },
        ] as ActivitySaveData[]
        expect(activitiesThisWeek(acts, WEEK).map(a => a.id)).toEqual(["now", "running"])
    })
})

describe("staff meetings (booking in the week plan)", () => {
    const ctx = (over: Partial<MeetingContext> = {}): MeetingContext => ({
        playerTeamId: "t1", currentWeek: WEEK, managerLevel: 1, staffRoles: [], rosterMorale: [60, 70], results: [], ...over,
    })
    test("unlock rules", () => {
        const byId = (id: string) => MEETING_TYPES.find(m => m.id === id)!
        expect(meetingStatus(byId("general_strategy"), ctx()).unlocked).toBe(true)
        expect(meetingStatus(byId("tactical_deep_dive"), ctx()).unlocked).toBe(false)
        expect(meetingStatus(byId("tactical_deep_dive"), ctx({ staffRoles: ["coach"] })).unlocked).toBe(true)
        expect(meetingStatus(byId("motivation_boost"), ctx({ rosterMorale: [39] })).unlocked).toBe(true)
        expect(meetingStatus(byId("post_match_debrief"), ctx({ results: [{ week: WEEK - 1, won: true }] })).unlocked).toBe(true)
        expect(meetingStatus(byId("chemistry_workshop"), ctx({ managerLevel: 3 })).unlocked).toBe(true)
    })
    test("losing streak counts the newest results first", () => {
        expect(consecutiveLosses([{ week: 9, won: true }, { week: 10, won: false }, { week: 11, won: false }, { week: 11, day: 5, won: false }])).toBe(3)
    })
    test("a booked meeting has a duration the store accepts and the processor applies", () => {
        const players = ["a", "b", "c", "d", "e"].map(id => makePlayer(id, { morale: 40 }))
        const save = makeSave(makeTeam(players.map(p => p.id)), players, [meeting("motivation_boost", 3)])
        applyScheduledActivities(save, { playerTeamId: "t1", nextId })
        expect(save.players.every(p => p.morale === 60)).toBe(true)
        expect(save.scheduledActivities[0].duration).toBe(0)
    })
})
