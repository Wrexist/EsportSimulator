/**
 * Regression test for the AI emergency-signing path (Phase 8).
 *
 * Previously a team below the 5-player quorum could only sign a free agent
 * if it passed the normal affordability filter (26 weeks of runway + a 50k
 * floor). A broke team therefore signed nobody and stayed sub-quorum
 * forever, forfeiting every match. manageRoster now signs in emergency mode
 * — affordability waived — whenever the roster is below 5.
 */

import { manageRoster } from "@/engine/ai/roster-management"
import type { GameSave, TeamSaveData, PlayerSaveData } from "@/engine/save-types"

function makeTeam(id: string, overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: id, shortName: id.toUpperCase(),
        budget: 100_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1,
        financialState: "STABLE",
        ...overrides,
    } as unknown as TeamSaveData
}

function makePlayer(id: string): PlayerSaveData {
    return {
        id, nickname: id, firstName: id, lastName: "P", age: 22, nationality: "US",
        role: "RIFLER", skill: 55, potential: 70, tier: "PRO",
        rifle: 55, awp: 50, pistol: 55, grenades: 50, creativity: 55, clutch: 50,
        tactic: 55, leader: 50, teamwork: 55, reaction: 55, eyesight: 55,
        morale: 70, form: 70, fatigue: 0,
    } as unknown as PlayerSaveData
}

function makeSave(teams: TeamSaveData[], players: PlayerSaveData[]): GameSave {
    return {
        saveVersion: 7, saveId: "t", saveName: "t",
        createdAt: "", updatedAt: "",
        currentWeek: 5, currentDay: 6, timeMode: "WEEKLY", gameStartDate: "",
        managerDetails: {} as never,
        lastRngSeed: 1, playerTeamId: "player",
        teams, players, contracts: [], staff: [],
        tournaments: [], scheduledMatches: [], completedMatches: [],
        scheduledActivities: [], financeLedger: [], eventsLog: [], newsFeed: [],
        acknowledgedEventIds: [], hallOfFame: [], legendaryPlayers: [],
        transferHistory: [],
    } as unknown as GameSave
}

describe("manageRoster — emergency signing below quorum", () => {
    it("an insolvent sub-quorum team still signs a free agent", () => {
        const broke = makeTeam("broke", {
            budget: -200_000,
            financialState: "INSOLVENT",
            rosterIds: ["p1", "p2", "p3"], // only 3 — below the 5 quorum
        })
        const freeAgents = [makePlayer("fa1"), makePlayer("fa2")]
        const rostered = ["p1", "p2", "p3"].map(makePlayer)
        const save = makeSave([broke], [...rostered, ...freeAgents])

        manageRoster(broke, save)

        expect(broke.rosterIds.length).toBe(4) // signed one toward quorum
    })

    it("a solvent, full roster is unaffected by the emergency path", () => {
        const team = makeTeam("ok", {
            budget: 500_000,
            rosterIds: ["p1", "p2", "p3", "p4", "p5"],
        })
        const save = makeSave([team], ["p1", "p2", "p3", "p4", "p5"].map(makePlayer))
        manageRoster(team, save)
        expect(team.rosterIds.length).toBe(5)
    })
})
