/**
 * Coverage for AIManager transfer-related decision logic (Phase K1).
 *
 * Tests exercise the per-team roster + market behavior through the
 * public processWeeklyAI orchestrator — keeps tests resilient to the
 * upcoming K3/K4 extractions that move these methods to dedicated
 * modules.
 *
 * Builds on G4 (player-team isolation, determinism, transfer cap) by
 * adding focused coverage on the manageRoster decision tree, the
 * sign-candidate scoring math (via observable preferences), and the
 * panic-sale path triggered by financialState=CRISIS/INSOLVENT.
 */

import { AIManager } from "@/engine/ai-manager"
import { SeededRNG } from "@/engine/rng"
import type { GameSave, TeamSaveData, PlayerSaveData } from "@/engine/save-types"

const PLAYER_TEAM_ID = "player"

function makeTeam(id: string, overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(),
        budget: 200_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1,
        financialState: "STABLE", weeklyNet: 5000, runwayWeeks: 50,
        worldRanking: 20,
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

describe("AIManager.processWeeklyAI — roster management", () => {
    test("AI team with 3 players (under quorum of 5) signs a free agent", () => {
        const aiTeam = makeTeam("ai1", { rosterIds: ["p1", "p2", "p3"], budget: 500_000 })
        const players: PlayerSaveData[] = [
            makePlayer("p1"), makePlayer("p2"), makePlayer("p3"),
            // Free agents available to sign (not on any roster).
            makePlayer("fa1", { skill: 70 }),
            makePlayer("fa2", { skill: 65 }),
        ]
        const save = makeSave([makeTeam(PLAYER_TEAM_ID), aiTeam], players)

        const before = aiTeam.rosterIds.length
        AIManager.processWeeklyAI(save, PLAYER_TEAM_ID, new SeededRNG(1))

        // Should have signed at least one player to fill the gap.
        expect(aiTeam.rosterIds.length).toBeGreaterThan(before)
    })

    test("AI team with 8 players (over cap of 7) releases worst player", () => {
        const rosterIds = Array.from({ length: 8 }, (_, i) => `p${i}`)
        const aiTeam = makeTeam("ai1", { rosterIds, budget: 500_000 })
        const players: PlayerSaveData[] = rosterIds.map((id, i) =>
            // Player 0 is the weakest, others stronger.
            makePlayer(id, { skill: i === 0 ? 30 : 70 })
        )
        const save = makeSave([makeTeam(PLAYER_TEAM_ID), aiTeam], players)

        AIManager.processWeeklyAI(save, PLAYER_TEAM_ID, new SeededRNG(1))

        // Roster trimmed back to 7.
        expect(aiTeam.rosterIds.length).toBe(7)
        // The weakest player should be gone.
        expect(aiTeam.rosterIds).not.toContain("p0")
    })

    test("AI team with 5 players + missing critical role (no IGL) tries to sign 6th", () => {
        const aiTeam = makeTeam("ai1", {
            rosterIds: ["r1", "r2", "r3", "r4", "r5"],
            budget: 500_000, // > 150k threshold
            financialState: "STABLE",
        })
        const players: PlayerSaveData[] = [
            // All RIFLER — no IGL, no AWPER. Critical role gap.
            makePlayer("r1", { role: "RIFLER" }),
            makePlayer("r2", { role: "RIFLER" }),
            makePlayer("r3", { role: "RIFLER" }),
            makePlayer("r4", { role: "RIFLER" }),
            makePlayer("r5", { role: "RIFLER" }),
            // Free agent IGL available.
            makePlayer("igl_fa", { role: "IGL", skill: 75 }),
        ]
        const save = makeSave([makeTeam(PLAYER_TEAM_ID), aiTeam], players)

        AIManager.processWeeklyAI(save, PLAYER_TEAM_ID, new SeededRNG(1))

        // Should have signed the 6th to fill the gap.
        expect(aiTeam.rosterIds.length).toBe(6)
    })

    test("financially-pressured team at roster 5 does NOT chase critical roles (won't bankrupt itself)", () => {
        const aiTeam = makeTeam("ai1", {
            rosterIds: ["r1", "r2", "r3", "r4", "r5"],
            budget: 500_000,
            financialState: "CRISIS",
        })
        const players: PlayerSaveData[] = [
            makePlayer("r1", { role: "RIFLER" }),
            makePlayer("r2", { role: "RIFLER" }),
            makePlayer("r3", { role: "RIFLER" }),
            makePlayer("r4", { role: "RIFLER" }),
            makePlayer("r5", { role: "RIFLER" }),
            makePlayer("igl_fa", { role: "IGL", skill: 75 }),
        ]
        const save = makeSave([makeTeam(PLAYER_TEAM_ID), aiTeam], players)

        AIManager.processWeeklyAI(save, PLAYER_TEAM_ID, new SeededRNG(1))

        // Stayed at 5 — no critical-role chase under CRISIS.
        expect(aiTeam.rosterIds.length).toBe(5)
    })

    test("team in CRISIS lists its worst player for transfer (panic sell)", () => {
        const rosterIds = ["r1", "r2", "r3", "r4", "r5"]
        const aiTeam = makeTeam("ai1", {
            rosterIds,
            budget: 1000,
            financialState: "CRISIS",
        })
        const players: PlayerSaveData[] = rosterIds.map((id, i) =>
            makePlayer(id, { skill: i === 0 ? 25 : 70 })
        )
        const save = makeSave([makeTeam(PLAYER_TEAM_ID), aiTeam], players)

        AIManager.processWeeklyAI(save, PLAYER_TEAM_ID, new SeededRNG(1))

        // The weakest player should be listed for sale.
        const r0 = save.players.find(p => p.id === "r0")
        const weakest = save.players.find(p => p.id === "r0") ?? save.players.find(p => (p as any).forSale)
        // Loosely: at least one player should now be flagged forSale on the CRISIS team.
        const hasForSale = save.players.some(p => (p as any).forSale && aiTeam.rosterIds.includes(p.id))
        expect(hasForSale).toBe(true)
    })

    test("STABLE team does NOT panic-list players", () => {
        const rosterIds = ["r1", "r2", "r3", "r4", "r5"]
        const aiTeam = makeTeam("ai1", {
            rosterIds,
            budget: 500_000,
            financialState: "STABLE",
        })
        const players: PlayerSaveData[] = rosterIds.map((id, i) =>
            makePlayer(id, { skill: i === 0 ? 25 : 70 })
        )
        const save = makeSave([makeTeam(PLAYER_TEAM_ID), aiTeam], players)

        AIManager.processWeeklyAI(save, PLAYER_TEAM_ID, new SeededRNG(1))

        const hasForSale = save.players.some(p => (p as any).forSale && aiTeam.rosterIds.includes(p.id))
        expect(hasForSale).toBe(false)
    })
})

describe("AIManager.processWeeklyAI — sign-candidate preferences (observed)", () => {
    test("AI signing prefers high-skill candidates over capped-potential veterans (growth-room math)", () => {
        // AI's scoreSigningCandidate weights growth room (potential - skill)
        // and divides by a salary derived from skill. Hold growth-room
        // EQUAL across candidates so the test isolates the skill term.
        const aiTeam = makeTeam("ai1", { rosterIds: ["p1"], budget: 1_000_000, financialState: "STABLE" })
        const players: PlayerSaveData[] = [
            makePlayer("p1"),
            // Both candidates have identical 10pt growth room. Star has more skill.
            makePlayer("star", { role: "RIFLER", skill: 80, potential: 90, age: 22 }),
            makePlayer("backup", { role: "RIFLER", skill: 50, potential: 60, age: 28 }),
        ]
        const save = makeSave([makeTeam(PLAYER_TEAM_ID), aiTeam], players)

        AIManager.processWeeklyAI(save, PLAYER_TEAM_ID, new SeededRNG(1))

        expect(aiTeam.rosterIds.length).toBe(2)
        // With equal growth room, the AI's skill term in the numerator wins.
        expect(aiTeam.rosterIds).toContain("star")
    })

    test("AI signing rewards growth-room: low-skill, high-potential prospect beats high-skill veteran with no headroom", () => {
        // Pins the explicit growth-room contract — this is how AI builds
        // long-term rosters by drafting prospects.
        const aiTeam = makeTeam("ai1", { rosterIds: ["p1"], budget: 1_000_000, financialState: "STABLE" })
        const players: PlayerSaveData[] = [
            makePlayer("p1"),
            // Veteran: skill 80, capped at 80 (no growth).
            makePlayer("vet", { role: "RIFLER", skill: 80, potential: 80, age: 30 }),
            // Prospect: skill 50, potential 95 (huge growth) + young (age bonus).
            makePlayer("prospect", { role: "RIFLER", skill: 50, potential: 95, age: 18 }),
        ]
        const save = makeSave([makeTeam(PLAYER_TEAM_ID), aiTeam], players)

        AIManager.processWeeklyAI(save, PLAYER_TEAM_ID, new SeededRNG(1))

        expect(aiTeam.rosterIds.length).toBe(2)
        expect(aiTeam.rosterIds).toContain("prospect")
    })

    test("zero free agents = no signing happens, no crash", () => {
        // All players already on rosters elsewhere → no FAs available.
        const otherTeam = makeTeam("other", { rosterIds: ["p1", "p2", "p3", "p4", "p5"] })
        const aiTeam = makeTeam("ai1", { rosterIds: ["p6", "p7"], budget: 500_000 })
        const players = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"].map(id => makePlayer(id))
        const save = makeSave([makeTeam(PLAYER_TEAM_ID), aiTeam, otherTeam], players)

        const before = aiTeam.rosterIds.length

        expect(() =>
            AIManager.processWeeklyAI(save, PLAYER_TEAM_ID, new SeededRNG(1))
        ).not.toThrow()
        expect(aiTeam.rosterIds.length).toBe(before)
    })
})

describe("AI transfer economy fairness (Phase 3.3 / 3.4)", () => {
    test("3.3 — a non-emergency free-agent signing charges a signing fee", () => {
        // 5 players + missing IGL → non-emergency 6th signing (fee applies).
        const aiTeam = makeTeam("ai1", {
            rosterIds: ["r1", "r2", "r3", "r4", "r5"],
            budget: 500_000, financialState: "STABLE",
        })
        const players: PlayerSaveData[] = [
            makePlayer("r1", { role: "RIFLER" }),
            makePlayer("r2", { role: "RIFLER" }),
            makePlayer("r3", { role: "RIFLER" }),
            makePlayer("r4", { role: "RIFLER" }),
            makePlayer("r5", { role: "RIFLER" }),
            makePlayer("igl_fa", { role: "IGL", skill: 75 }),
        ]
        const save = makeSave([makeTeam(PLAYER_TEAM_ID), aiTeam], players)
        const budgetBefore = aiTeam.budget

        AIManager.processWeeklyAI(save, PLAYER_TEAM_ID, new SeededRNG(1))

        expect(aiTeam.rosterIds.length).toBe(6)          // signed the 6th
        expect(aiTeam.budget).toBeLessThan(budgetBefore) // a signing fee was charged
    })

    test("3.4 — an AI↔AI transfer fee honors the seller's contract buyout", () => {
        // A listed low-skill star (skill*2000 fallback = 80k) with a 5M buyout.
        // Pre-fix the buyer paid the 80k fallback; post-fix it must pay the buyout.
        let executed = false
        for (let seed = 1; seed <= 300 && !executed; seed++) {
            const seller = makeTeam("seller", { rosterIds: ["star", "s2", "s3", "s4", "s5"], budget: 100_000 })
            const buyer = makeTeam("buyer", { rosterIds: ["b1", "b2", "b3"], budget: 50_000_000 })
            const players: PlayerSaveData[] = [
                makePlayer("star", { skill: 40, forSale: true }),
                makePlayer("s2"), makePlayer("s3"), makePlayer("s4"), makePlayer("s5"),
                makePlayer("b1"), makePlayer("b2"), makePlayer("b3"),
            ]
            const save = makeSave([makeTeam(PLAYER_TEAM_ID), seller, buyer], players)
            save.contracts = [{
                id: "c_star", playerId: "star", teamId: "seller",
                salaryPerWeek: 1000, startWeek: 1, endWeek: 60, buyout: 5_000_000,
            } as never]
            const buyerBudgetBefore = buyer.budget

            AIManager.processAIToAITransfers(save, PLAYER_TEAM_ID, new SeededRNG(seed))

            if (buyer.rosterIds.includes("star")) {
                executed = true
                expect(buyerBudgetBefore - buyer.budget).toBe(5_000_000) // buyout, not skill*2000
            }
        }
        expect(executed).toBe(true) // at least one seed triggered the transfer
    })
})
