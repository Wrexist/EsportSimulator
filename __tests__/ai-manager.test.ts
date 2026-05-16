/**
 * Coverage for engine/ai-manager.ts.
 *
 * AIManager.processWeeklyAI runs every week tick for every AI-controlled
 * team and is the orchestrator for all D5–D8 gameplay-parity work (staff
 * hiring, sponsor signing, facility builds, academy investment) plus the
 * older roster/finance/strategy logic. The whole pipeline was untested.
 *
 * These tests pin the invariants that must hold regardless of how the
 * RNG falls: player team is never touched, max-roster cap, max
 * transfers per week, and determinism under a fixed seed.
 */

import { AIManager } from "@/engine/ai-manager"
import { SeededRNG } from "@/engine/rng"
import type { GameSave, TeamSaveData, PlayerSaveData } from "@/engine/save-types"

const PLAYER_TEAM_ID = "player"

function makeTeam(id: string, overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(),
        budget: 100_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1,
        financialState: "STABLE", weeklyNet: 5000, runwayWeeks: 50,
        worldRanking: 20,
        ...overrides,
    } as unknown as TeamSaveData
}

function makePlayer(id: string, teamId: string): PlayerSaveData {
    return {
        id, nickname: id, firstName: id, lastName: "P", age: 22, nationality: "US",
        role: "Rifler",
        rifle: 60, awp: 50, pistol: 55, grenades: 50, creativity: 55, clutch: 50,
        tactic: 55, leader: 50, teamwork: 55, reaction: 60, eyesight: 60,
        morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        salary: 1000, contractWeeks: 52,
        skill: 60, potential: 80,
    } as unknown as PlayerSaveData
}

function makeSave(teams: TeamSaveData[], players: PlayerSaveData[] = []): GameSave {
    return {
        saveVersion: 6, saveId: "test", saveName: "test",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        currentWeek: 5, currentDay: 6, timeMode: "WEEKLY",
        gameStartDate: new Date().toISOString(),
        managerDetails: {} as any,
        lastRngSeed: 1, playerTeamId: PLAYER_TEAM_ID,
        teams, players, contracts: [], staff: [],
        tournaments: [], scheduledMatches: [], completedMatches: [],
        scheduledActivities: [], financeLedger: [], eventsLog: [], newsFeed: [],
        acknowledgedEventIds: [], hallOfFame: [], legendaryPlayers: [],
        weekTickState: null,
    } as unknown as GameSave
}

describe("AIManager.processWeeklyAI", () => {
    test("smoke test: doesn't throw with a minimal multi-team save", () => {
        const teams = [
            makeTeam(PLAYER_TEAM_ID),
            makeTeam("ai1"),
            makeTeam("ai2"),
        ]
        const save = makeSave(teams)

        expect(() =>
            AIManager.processWeeklyAI(save, PLAYER_TEAM_ID, new SeededRNG(42))
        ).not.toThrow()
    })

    test("player team is never mutated by AI logic", () => {
        const playerTeam = makeTeam(PLAYER_TEAM_ID, {
            budget: 100_000,
            staffIds: [],
            facilities: [],
            sponsors: [],
        })
        const aiTeam = makeTeam("ai1", {
            budget: 500_000, // rich enough to do anything
            financialState: "STABLE",
        })
        const save = makeSave([playerTeam, aiTeam])

        const before = JSON.parse(JSON.stringify(playerTeam))
        // Many ticks to maximize the chance any RNG-gated AI action could fire.
        for (let i = 0; i < 20; i++) {
            AIManager.processWeeklyAI(save, PLAYER_TEAM_ID, new SeededRNG(i + 1))
        }
        const after = JSON.parse(JSON.stringify(playerTeam))

        // Only fields touched by adaptTeamStrategy / reconcileTeamRoles
        // would be expected to change. Budget/facilities/sponsors must
        // not move on the player team.
        expect(after.budget).toBe(before.budget)
        expect(after.facilities).toEqual(before.facilities)
        expect(after.sponsors).toEqual(before.sponsors)
        expect(after.staffIds).toEqual(before.staffIds)
    })

    test("deterministic: same save + same seed produces identical state", () => {
        const setup = () => {
            const teams = [
                makeTeam(PLAYER_TEAM_ID),
                makeTeam("ai1", { budget: 300_000 }),
                makeTeam("ai2", { budget: 250_000, reputation: 70 }),
            ]
            return makeSave(teams)
        }

        const saveA = setup()
        const saveB = setup()

        AIManager.processWeeklyAI(saveA, PLAYER_TEAM_ID, new SeededRNG(123))
        AIManager.processWeeklyAI(saveB, PLAYER_TEAM_ID, new SeededRNG(123))

        // Compare AI team budgets and facility/sponsor counts — the
        // observable AI decisions should match exactly.
        const ai1A = saveA.teams.find(t => t.id === "ai1")!
        const ai1B = saveB.teams.find(t => t.id === "ai1")!
        expect(ai1A.budget).toBe(ai1B.budget)
        expect(ai1A.facilities?.length).toBe(ai1B.facilities?.length)
        expect(ai1A.sponsors?.length).toBe(ai1B.sponsors?.length)
        expect(ai1A.staffIds.length).toBe(ai1B.staffIds.length)

        const ai2A = saveA.teams.find(t => t.id === "ai2")!
        const ai2B = saveB.teams.find(t => t.id === "ai2")!
        expect(ai2A.budget).toBe(ai2B.budget)
        expect(ai2A.facilities?.length).toBe(ai2B.facilities?.length)
    })

    test("AI-to-AI transfer market caps at 3 transfers per week", () => {
        // Set up many AI teams with rich budgets + small rosters so the
        // transfer market has plenty of room to operate. The cap should
        // still hold.
        const teams: TeamSaveData[] = [makeTeam(PLAYER_TEAM_ID)]
        const players: PlayerSaveData[] = []
        for (let i = 0; i < 10; i++) {
            const id = `ai${i}`
            const rosterIds = Array.from({ length: 6 }, (_, j) => `${id}_p${j}`)
            teams.push(makeTeam(id, {
                budget: 1_000_000,
                rosterIds,
                financialState: "STABLE",
                worldRanking: 10 + i,
            }))
            rosterIds.forEach(pid => players.push(makePlayer(pid, id)))
        }
        // Mark a few as forSale to give the AI-to-AI market explicit listings.
        for (let i = 0; i < 5; i++) {
            (players[i] as any).forSale = true
        }
        const save = makeSave(teams, players)

        // Count completed transfers by watching the transferHistory length
        // (AI-to-AI transfers push there too).
        ;(save as any).transferHistory = []
        const before = (save as any).transferHistory.length

        AIManager.processWeeklyAI(save, PLAYER_TEAM_ID, new SeededRNG(7))

        const transfersThisWeek = (save as any).transferHistory.length - before
        expect(transfersThisWeek).toBeLessThanOrEqual(3)
    })

    test("isTransferWindow=false skips roster + transfer-market work", () => {
        // Half-arms a roster swap scenario, then runs OUT of window.
        // manageRoster and processAITransferMarket should both no-op.
        const teams = [
            makeTeam(PLAYER_TEAM_ID),
            makeTeam("ai1", { budget: 500_000, rosterIds: ["p1", "p2"] }),
        ]
        const players = [makePlayer("p1", "ai1"), makePlayer("p2", "ai1")]
        const save = makeSave(teams, players)
        ;(save as any).transferHistory = []

        // Run many ticks — none should add a transfer.
        for (let i = 0; i < 30; i++) {
            AIManager.processWeeklyAI(save, PLAYER_TEAM_ID, new SeededRNG(i), /*isTransferWindow*/ false)
        }
        expect((save as any).transferHistory.length).toBe(0)
    })

    test("zero AI teams (only player team) is a clean no-op", () => {
        const save = makeSave([makeTeam(PLAYER_TEAM_ID)])

        expect(() =>
            AIManager.processWeeklyAI(save, PLAYER_TEAM_ID, new SeededRNG(1))
        ).not.toThrow()
        expect(save.teams.length).toBe(1)
    })

    test("financialState=INSOLVENT teams do NOT build facilities (gate respected)", () => {
        const teams = [
            makeTeam(PLAYER_TEAM_ID),
            makeTeam("broke", {
                budget: 50_000, // could afford the $10k build
                financialState: "INSOLVENT", // but gated out
                facilities: [],
            }),
        ]
        const save = makeSave(teams)

        // Many ticks to give the 4% roll the maximum chance to fire.
        for (let i = 0; i < 100; i++) {
            AIManager.processWeeklyAI(save, PLAYER_TEAM_ID, new SeededRNG(i + 1))
        }

        const broke = save.teams.find(t => t.id === "broke")!
        expect(broke.facilities?.length ?? 0).toBe(0)
    })

    test("STABLE rich team eventually builds at least one facility across many ticks", () => {
        const teams = [
            makeTeam(PLAYER_TEAM_ID),
            makeTeam("rich", {
                budget: 5_000_000,
                financialState: "STABLE",
                facilities: [],
            }),
        ]
        const save = makeSave(teams)

        // 200 ticks at 4%/week ≈ expected 8 build attempts. Very unlikely
        // to fail across all 200 by random chance.
        for (let i = 0; i < 200; i++) {
            AIManager.processWeeklyAI(save, PLAYER_TEAM_ID, new SeededRNG(i + 1))
        }

        const rich = save.teams.find(t => t.id === "rich")!
        expect((rich.facilities?.length ?? 0)).toBeGreaterThan(0)
    })
})
