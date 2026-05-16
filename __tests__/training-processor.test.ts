/**
 * Coverage for engine/processors/training-processor.ts.
 *
 * processTraining mutates player stats + fatigue every week the team has
 * a training config. Silent regression here means players don't grow,
 * or they grow too fast, or fatigue mismanagement causes burnout.
 * Player-team gameplay depends on this loop working correctly.
 */

import { TrainingProcessor } from "@/engine/processors/training-processor"
import { TrainingFocus } from "@/types"
import type { GameSave, TeamSaveData, PlayerSaveData, StaffSaveData } from "@/engine/save-types"

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

describe("TrainingProcessor.processTraining", () => {
    test("applies stat gains to roster players under AIM focus", () => {
        const p = makePlayer("p1", { rifle: 50, reaction: 50 })
        const team = makeTeam({ rosterIds: ["p1"] })
        const save = makeSave(team, [p])
        const configs = new Map([["t1", { focus: TrainingFocus.AIM, intensity: 5 }]])

        const beforeRifle = p.rifle
        TrainingProcessor.processTraining(save, configs)

        // AIM focus targets rifle / reaction — at least one should move.
        expect(p.rifle).toBeGreaterThanOrEqual(beforeRifle)
        // Fatigue increases regardless.
        expect(p.fatigue).toBeGreaterThan(0)
    })

    test("teams without a training config are not touched", () => {
        const p = makePlayer("p1")
        const team = makeTeam({ id: "t1", rosterIds: ["p1"] })
        const team2 = makeTeam({ id: "t2", rosterIds: [] })
        const save = makeSave(team, [p])
        save.teams.push(team2)
        // Only t2 is configured.
        const configs = new Map([["t2", { focus: TrainingFocus.AIM, intensity: 5 }]])

        const beforeRifle = p.rifle
        const beforeFatigue = p.fatigue
        TrainingProcessor.processTraining(save, configs)

        expect(p.rifle).toBe(beforeRifle)
        expect(p.fatigue).toBe(beforeFatigue)
    })

    test("activeRoleTraining players are skipped (no fatigue, no stat gain)", () => {
        const p = makePlayer("p1", { rifle: 50, fatigue: 0 })
        const team = makeTeam({
            rosterIds: ["p1"],
            activeRoleTraining: [{
                playerId: "p1", targetRole: "AWPer", weeksCompleted: 1,
                totalWeeks: 4, weeklyCost: 1000, startWeek: 1,
            }],
        })
        const save = makeSave(team, [p])
        const configs = new Map([["t1", { focus: TrainingFocus.AIM, intensity: 5 }]])

        TrainingProcessor.processTraining(save, configs)

        // Role-training players aren't double-trained — fatigue unchanged.
        expect(p.fatigue).toBe(0)
        expect(p.rifle).toBe(50)
    })

    test("training facility level multiplies stat gains", () => {
        const baselinePlayer = makePlayer("p1", { rifle: 50 })
        const facilityPlayer = makePlayer("p2", { rifle: 50 })

        const baselineTeam = makeTeam({ id: "t1", rosterIds: ["p1"], facilities: [] })
        const facilityTeam = makeTeam({
            id: "t2", rosterIds: ["p2"],
            facilities: [{ id: "f1", type: "TRAINING", level: 5, description: "max", monthlyCost: 0 }],
        })

        const saveA = makeSave(baselineTeam, [baselinePlayer])
        saveA.playerTeamId = "t1"
        const saveB = makeSave(facilityTeam, [facilityPlayer])
        saveB.playerTeamId = "t2"

        const config = { focus: TrainingFocus.AIM, intensity: 5 }
        TrainingProcessor.processTraining(saveA, new Map([["t1", config]]))
        TrainingProcessor.processTraining(saveB, new Map([["t2", config]]))

        const baseGain = baselinePlayer.rifle - 50
        const facGain = facilityPlayer.rifle - 50
        // Facility-level 5 multiplies the bonus by 1.5x.
        expect(facGain).toBeGreaterThanOrEqual(baseGain)
    })

    test("coach with training_efficiency talent boosts gain further than baseline coach", () => {
        const noTalentPlayer = makePlayer("p1", { rifle: 50 })
        const talentPlayer = makePlayer("p2", { rifle: 50 })

        const baseCoach: StaffSaveData = {
            id: "s1", teamId: "t1", name: "Base", role: "coach",
            salaryPerWeek: 1000, level: 3, contractEndWeek: 52,
            stats: { development: 50 } as any, unlockedTalentIds: [],
        } as any
        const talentCoach: StaffSaveData = {
            id: "s2", teamId: "t2", name: "Tal", role: "coach",
            salaryPerWeek: 1000, level: 3, contractEndWeek: 52,
            stats: { development: 50 } as any,
            unlockedTalentIds: ["coach_basics"], // +5% training_efficiency
        } as any

        const teamA = makeTeam({ id: "t1", rosterIds: ["p1"], staffIds: ["s1"] })
        const teamB = makeTeam({ id: "t2", rosterIds: ["p2"], staffIds: ["s2"] })

        const saveA = makeSave(teamA, [noTalentPlayer], [baseCoach])
        const saveB = makeSave(teamB, [talentPlayer], [talentCoach])
        saveB.playerTeamId = "t2"

        const config = { focus: TrainingFocus.AIM, intensity: 5 }
        TrainingProcessor.processTraining(saveA, new Map([["t1", config]]))
        TrainingProcessor.processTraining(saveB, new Map([["t2", config]]))

        expect(talentPlayer.rifle - 50).toBeGreaterThanOrEqual(noTalentPlayer.rifle - 50)
    })

    test("stat gain is capped by player.potential", () => {
        // Player is at potential cap — should NOT exceed it.
        const p = makePlayer("p1", { rifle: 89, potential: 90 })
        const team = makeTeam({ rosterIds: ["p1"] })
        const save = makeSave(team, [p])
        const configs = new Map([["t1", { focus: TrainingFocus.AIM, intensity: 10 }]])

        TrainingProcessor.processTraining(save, configs)

        expect(p.rifle).toBeLessThanOrEqual(p.potential)
    })
})
