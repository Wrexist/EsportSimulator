/**
 * G4: the development outlook must match what the week applies, so the
 * player page never promises growth the engine does not deliver.
 */

import { TrainingProcessor } from "@/engine/processors/training-processor"
import { TrainingFocus } from "@/types"
import type { GameSave, TeamSaveData, PlayerSaveData, StaffSaveData } from "@/engine/save-types"
import { developmentOutlook, DEFAULT_TEAM_TRAINING, ageDeclineChance, naturalGrowthChance } from "@/engine/development-outlook"

function makePlayer(id: string, overrides: Partial<PlayerSaveData> = {}): PlayerSaveData {
    return {
        id, nickname: id, firstName: id, lastName: "P", age: 22, nationality: "US",
        role: "Rifler",
        rifle: 50, awp: 40, pistol: 50, grenades: 40, creativity: 40, clutch: 40,
        tactic: 50, leader: 40, teamwork: 50, reaction: 50, eyesight: 50,
        morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        salary: 1000, contractWeeks: 52,
        skill: 50, potential: 90, productivity: 60, endurance: 70,
        // Same archetype for every fixture (no training modifier), so each
        // test compares only the variable it sets (Phase 5.2).
        personality: { archetype: "QUIET" },
        ...overrides,
    } as unknown as PlayerSaveData
}

function makeTeam(overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id: "t1", name: "Team", shortName: "T", budget: 100_000,
        rosterIds: [], staffIds: [], trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50, region: "EU",
        facilitiesLevel: 0,
        ...overrides,
    } as unknown as TeamSaveData
}

function makeSave(team: TeamSaveData, players: PlayerSaveData[], staff: StaffSaveData[] = []): GameSave {
    return {
        saveVersion: 6, saveId: "test", saveName: "test",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        currentWeek: 5, currentDay: 6, timeMode: "WEEKLY",
        gameStartDate: new Date().toISOString(),
        managerDetails: {} as any, lastRngSeed: 1, playerTeamId: "t1",
        teams: [team], players, contracts: [], staff,
        tournaments: [], scheduledMatches: [], completedMatches: [],
        scheduledActivities: [], financeLedger: [], eventsLog: [], newsFeed: [],
        acknowledgedEventIds: [], hallOfFame: [], legendaryPlayers: [],
        weekTickState: null,
    } as unknown as GameSave
}

function outlookFor(save: GameSave, p: PlayerSaveData, weeks = 12) {
    const byId = new Map(save.players.map(x => [x.id, x]))
    return developmentOutlook({ player: p, team: save.teams[0], playerTeamId: "t1", staff: save.staff, lookup: id => byId.get(id), currentWeek: save.currentWeek, weeks })
}

describe("developmentOutlook", () => {
    test("forecast equals twelve real training weeks (facility, professional)", () => {
        const p = makePlayer("p1", { rifle: 50, reaction: 60, potential: 80, personality: { archetype: "PROFESSIONAL" } as PlayerSaveData["personality"] })
        const team = makeTeam({ rosterIds: ["p1"], facilities: [{ type: "TRAINING", level: 2 }] as TeamSaveData["facilities"] })
        const save = makeSave(team, [p])
        const outlook = outlookFor(save, p)
        expect(outlook.focus).toBe("Aim")
        expect(outlook.factors.map(f => f.label)).toEqual(expect.arrayContaining(["Training facility L2", "Professional"]))
        const configs = new Map([["t1", { ...DEFAULT_TEAM_TRAINING }]])
        for (let w = 0; w < 12; w++) TrainingProcessor.processTraining(save, configs)
        for (const f of outlook.forecast) {
            expect((p as unknown as Record<string, number>)[f.stat]).toBeCloseTo(f.after, 6)
        }
    })

    test("forecast stops at potential and says so", () => {
        const p = makePlayer("p2", { rifle: 70, awp: 70, pistol: 70, reaction: 70, skill: 70, potential: 70 })
        const save = makeSave(makeTeam({ rosterIds: ["p2"] }), [p])
        const outlook = outlookFor(save, p)
        expect(outlook.atCeiling).toBe(true)
        expect(outlook.forecast.every(f => f.after === f.now)).toBe(true)
    })

    test("personal focus overrides the club regimen", () => {
        const p = makePlayer("p3", { trainingFocus: TrainingFocus.TACTICS } as Partial<PlayerSaveData>)
        const save = makeSave(makeTeam({ rosterIds: ["p3"] }), [p])
        const outlook = outlookFor(save, p)
        expect(outlook.focus).toBe("Tactics")
        expect(outlook.focusIsPersonal).toBe(true)
        expect(outlook.forecast.map(f => f.stat)).toContain("tactic")
    })

    test("players on another club are not forecast to train", () => {
        const p = makePlayer("p4")
        const save = makeSave(makeTeam({ id: "other", rosterIds: ["p4"] }), [p])
        const byId = new Map(save.players.map(x => [x.id, x]))
        const outlook = developmentOutlook({ player: p, team: save.teams[0], playerTeamId: "t1", staff: [] as StaffSaveData[], lookup: id => byId.get(id), currentWeek: 5 })
        expect(outlook.trainsWithClub).toBe(false)
        expect(outlook.forecast.every(f => f.after === f.now)).toBe(true)
    })

    test("natural growth and decline match the lifecycle rates", () => {
        expect(naturalGrowthChance(18, 50, 90)).toBeCloseTo(Math.min(0.04, 0.4 * 0.18), 9)
        expect(naturalGrowthChance(25, 50, 90)).toBe(0)
        expect(ageDeclineChance(27)).toBe(0)
        expect(ageDeclineChance(32)).toBeCloseTo(0.01, 9)
        const young = makePlayer("p5", { age: 18 })
        const save = makeSave(makeTeam({ rosterIds: ["p5"] }), [young])
        expect(outlookFor(save, young).naturalPerSeason).toBeCloseTo(naturalGrowthChance(18, 50, 90) * 52, 9)
        // Only skill below potential: one pick in six adds a point.
        const capped = makePlayer("p6", { age: 18, potential: 60, skill: 50, rifle: 60, reaction: 60, clutch: 60, tactic: 60, awp: 60 })
        const save2 = makeSave(makeTeam({ rosterIds: ["p6"] }), [capped])
        expect(outlookFor(save2, capped).naturalPerSeason).toBeCloseTo(naturalGrowthChance(18, 50, 60) * 52 / 6, 9)
    })

    test("the weekly gain counts the tactical multiplier for a tactics focus", () => {
        const p = makePlayer("p7", { trainingFocus: TrainingFocus.TACTICS } as Partial<PlayerSaveData>)
        const plain = outlookFor(makeSave(makeTeam({ rosterIds: ["p7"] }), [p]), p)
        const withRoom = outlookFor(makeSave(makeTeam({ rosterIds: ["p7"], facilities: [{ id: "f", type: "TACTICAL", level: 2 }] as never }), [p]), p)
        expect(plain.weeklyGain).toBeGreaterThan(0)
        expect(withRoom.weeklyGain / plain.weeklyGain).toBeCloseTo(1.4, 6)
        const primary = withRoom.forecast[0]
        expect((primary.after - primary.now) / 12).toBeCloseTo(withRoom.weeklyGain, 6)
    })
})
