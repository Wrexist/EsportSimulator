/**
 * Marquee AI free-agent signing news (AUDIT_WAVE3 AI-churn item).
 *
 * AI signings are always recorded in transferHistory, but only STAR signings
 * (skill ≥ STAR_FA_NEWS_SKILL) also hit the live news feed — routine
 * depth-filling stays out so the feed isn't flooded.
 */

import { signFreeAgent } from "@/engine/ai/roster-management"
import type { GameSave, TeamSaveData, PlayerSaveData } from "@/engine/save-types"

function makeTeam(id: string, overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(),
        budget: 1_000_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1,
        financialState: "STABLE", weeklyNet: 5000, runwayWeeks: 50, worldRanking: 20,
        ...overrides,
    } as unknown as TeamSaveData
}

function makePlayer(id: string, overrides: Partial<PlayerSaveData> = {}): PlayerSaveData {
    return {
        id, nickname: id, firstName: id, lastName: "P", age: 23, nationality: "US",
        role: "RIFLER",
        rifle: 60, awp: 50, pistol: 55, grenades: 50, creativity: 55, clutch: 50,
        tactic: 55, leader: 50, teamwork: 55, reaction: 60, eyesight: 60,
        morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        salary: 1000, contractWeeks: 52,
        skill: 60, potential: 80,
        ...overrides,
    } as unknown as PlayerSaveData
}

function makeSave(teams: TeamSaveData[], players: PlayerSaveData[] = []): GameSave {
    return {
        saveVersion: 6, saveId: "test", saveName: "test",
        currentWeek: 5, currentDay: 6, timeMode: "WEEKLY",
        gameStartDate: new Date().toISOString(),
        lastRngSeed: 1, playerTeamId: "player",
        teams, players, contracts: [], staff: [],
        tournaments: [], scheduledMatches: [], completedMatches: [],
        scheduledActivities: [], financeLedger: [], eventsLog: [], newsFeed: [],
        transferHistory: [],
    } as unknown as GameSave
}

describe("signFreeAgent — marquee FA news gate", () => {
    test("a star free agent (skill ≥ 78) signing hits the news feed", () => {
        const team = makeTeam("ai1", { rosterIds: ["p1", "p2", "p3", "p4"] })
        const save = makeSave([team], [
            makePlayer("p1"), makePlayer("p2"), makePlayer("p3"), makePlayer("p4"),
            makePlayer("star_fa", { skill: 88, potential: 90 }),
        ])
        signFreeAgent(team, save)
        expect(team.rosterIds).toContain("star_fa")
        expect(save.newsFeed.some(n => n.id === "news_ai_signing_5_star_fa")).toBe(true)
        // It's also recorded in transfer history regardless of fame.
        expect(save.transferHistory!.some(t => t.playerId === "star_fa")).toBe(true)
    })

    test("a routine free agent (skill < 78) signing stays OUT of the news feed", () => {
        const team = makeTeam("ai2", { rosterIds: ["p1", "p2", "p3", "p4"] })
        const save = makeSave([team], [
            makePlayer("p1"), makePlayer("p2"), makePlayer("p3"), makePlayer("p4"),
            makePlayer("depth_fa", { skill: 62, potential: 68 }),
        ])
        signFreeAgent(team, save)
        expect(team.rosterIds).toContain("depth_fa")
        expect(save.newsFeed).toHaveLength(0)
        // Still recorded in history — silent in the feed, not in the books.
        expect(save.transferHistory!.some(t => t.playerId === "depth_fa")).toBe(true)
    })
})
