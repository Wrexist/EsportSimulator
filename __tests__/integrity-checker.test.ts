/**
 * Tests for IntegrityChecker.check — the post-load consistency
 * inspector that surfaces stat/financial/roster/match anomalies in
 * a save. Used by the debug dialog and as a sanity net for save
 * migrations.
 *
 * Pinning the four issue categories:
 *   - STAT: out-of-range player skill/morale/fatigue
 *   - ROSTER: <5 players, phantom IDs
 *   - FINANCE: budget vs ledger desync, debt severity bands
 *   - MATCH: duplicate ids, schedule/completed overlap
 */

import { IntegrityChecker } from "@/engine/integrity-checker"
import type { GameSave, PlayerSaveData, TeamSaveData, FinanceLedgerEntrySaveData, CompletedMatchSaveData, MatchSaveData } from "@/engine/save-types"

function makePlayer(id: string, overrides: Partial<PlayerSaveData> = {}): PlayerSaveData {
    return {
        id, nickname: id, firstName: id, lastName: "P",
        age: 22, nationality: "US", role: "RIFLER",
        rifle: 70, awp: 60, pistol: 65, grenades: 60, creativity: 60,
        clutch: 60, tactic: 60, leader: 55, teamwork: 65,
        reaction: 70, eyesight: 70,
        morale: 75, form: 70, fatigue: 30, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        skill: 70, potential: 85, productivity: 60, endurance: 70,
        ...overrides,
    } as unknown as PlayerSaveData
}

function makeTeam(id: string, overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(),
        budget: 100_000, rosterIds: ["p1", "p2", "p3", "p4", "p5"], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1, leagueTier: "B_TIER",
        elo: 1500, recentForm: [],
        ...overrides,
    } as unknown as TeamSaveData
}

function makeSave(overrides: Partial<GameSave> = {}): GameSave {
    const players = ["p1", "p2", "p3", "p4", "p5"].map(id => makePlayer(id))
    return {
        currentWeek: 5,
        playerTeamId: "player",
        teams: [makeTeam("player")],
        players,
        contracts: [],
        staff: [],
        scheduledMatches: [],
        completedMatches: [],
        scheduledActivities: [],
        financeLedger: [],
        eventsLog: [],
        newsFeed: [],
        tournaments: [],
        tournamentQualifications: [],
        academyPlayers: [],
        marketStaff: [],
        lastRngSeed: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    } as unknown as GameSave
}

describe("IntegrityChecker — STAT", () => {
    test("clean save with normal stats → no STAT issues", () => {
        const issues = IntegrityChecker.check(makeSave())
        expect(issues.filter(i => i.type === "STAT").length).toBe(0)
    })

    test("player with skill > 100 surfaces a HIGH severity STAT issue", () => {
        const save = makeSave({
            players: [
                makePlayer("p1", { skill: 200 }),
                makePlayer("p2"), makePlayer("p3"), makePlayer("p4"), makePlayer("p5"),
            ],
        })
        const issue = IntegrityChecker.check(save).find(i => i.type === "STAT" && i.entityId === "p1")
        expect(issue).toBeDefined()
        expect(issue!.severity).toBe("HIGH")
        expect(issue!.message).toContain("invalid skill")
    })

    test("player with morale out of [0,100] surfaces a MEDIUM STAT issue", () => {
        const save = makeSave({
            players: [
                makePlayer("p1", { morale: -5 }),
                makePlayer("p2"), makePlayer("p3"), makePlayer("p4"), makePlayer("p5"),
            ],
        })
        const issue = IntegrityChecker.check(save).find(i => i.type === "STAT" && i.message.includes("morale"))
        expect(issue).toBeDefined()
        expect(issue!.severity).toBe("MEDIUM")
    })

    test("player with fatigue > 100 surfaces a MEDIUM STAT issue", () => {
        const save = makeSave({
            players: [
                makePlayer("p1", { fatigue: 150 }),
                makePlayer("p2"), makePlayer("p3"), makePlayer("p4"), makePlayer("p5"),
            ],
        })
        const issue = IntegrityChecker.check(save).find(i => i.type === "STAT" && i.message.includes("fatigue"))
        expect(issue).toBeDefined()
        expect(issue!.severity).toBe("MEDIUM")
    })
})

describe("IntegrityChecker — ROSTER", () => {
    test("team with fewer than 5 players surfaces a HIGH ROSTER issue", () => {
        const save = makeSave({
            teams: [makeTeam("player", { rosterIds: ["p1", "p2", "p3"] })],
            players: [makePlayer("p1"), makePlayer("p2"), makePlayer("p3")],
        })
        const issue = IntegrityChecker.check(save).find(i => i.type === "ROSTER" && i.message.includes("incomplete"))
        expect(issue).toBeDefined()
        expect(issue!.severity).toBe("HIGH")
    })

    test("phantom roster id (no matching player record) surfaces a HIGH ROSTER issue", () => {
        const save = makeSave({
            teams: [makeTeam("player", { rosterIds: ["p1", "p2", "p3", "p4", "ghost"] })],
            players: [makePlayer("p1"), makePlayer("p2"), makePlayer("p3"), makePlayer("p4")],
        })
        const issue = IntegrityChecker.check(save).find(i => i.message.includes("phantom"))
        expect(issue).toBeDefined()
        expect(issue!.severity).toBe("HIGH")
    })
})

describe("IntegrityChecker — FINANCE", () => {
    test("team with mild debt (-100k < budget < 0) surfaces a MEDIUM FINANCE issue", () => {
        const save = makeSave({
            teams: [makeTeam("player", { budget: -100_000 })],
        })
        const issue = IntegrityChecker.check(save).find(i => i.type === "FINANCE" && i.message.includes("debt"))
        expect(issue).toBeDefined()
        expect(issue!.severity).toBe("MEDIUM")
    })

    test("team with extreme debt (< -1M) surfaces a HIGH FINANCE issue ('bankrupt?')", () => {
        const save = makeSave({
            teams: [makeTeam("player", { budget: -2_000_000 })],
        })
        const issue = IntegrityChecker.check(save).find(i => i.type === "FINANCE" && i.message.includes("bankrupt"))
        expect(issue).toBeDefined()
        expect(issue!.severity).toBe("HIGH")
    })

    test("ledger running-balance mismatch surfaces a MEDIUM FINANCE issue", () => {
        const save = makeSave({
            financeLedger: [
                { id: "e1", week: 1, teamId: "player", type: "INCOME", category: "PRIZE", amount: 10_000, description: "first", balance: 110_000 },
                // Should be 100_000 - 5_000 = 105_000 but we set 999_000 to trigger mismatch
                { id: "e2", week: 2, teamId: "player", type: "EXPENSE", category: "WAGES_PLAYER", amount: 5_000, description: "wages", balance: 999_000 },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ] as any as FinanceLedgerEntrySaveData[],
        })
        const issue = IntegrityChecker.check(save).find(i => i.type === "FINANCE" && i.message.includes("Ledger mismatch"))
        expect(issue).toBeDefined()
        expect(issue!.severity).toBe("MEDIUM")
    })

    test("budget vs final-ledger-balance desync surfaces a HIGH FINANCE issue", () => {
        const save = makeSave({
            teams: [makeTeam("player", { budget: 50_000 })], // budget says 50k
            financeLedger: [
                { id: "e1", week: 1, teamId: "player", type: "INCOME", category: "PRIZE", amount: 10_000, description: "x", balance: 999_000 }, // ledger says 999k
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ] as any as FinanceLedgerEntrySaveData[],
        })
        const issue = IntegrityChecker.check(save).find(i => i.message.includes("Budget desync"))
        expect(issue).toBeDefined()
        expect(issue!.severity).toBe("HIGH")
    })
})

describe("IntegrityChecker — MATCH", () => {
    test("duplicate scheduled match ids surfaces a HIGH MATCH issue", () => {
        const save = makeSave({
            scheduledMatches: [
                { id: "m1", homeTeamId: "player", awayTeamId: "opp", week: 5, format: "BO1", seed: 0 },
                { id: "m1", homeTeamId: "player", awayTeamId: "opp2", week: 5, format: "BO1", seed: 0 },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ] as any as MatchSaveData[],
        })
        const issue = IntegrityChecker.check(save).find(i => i.type === "MATCH" && i.message.includes("scheduled"))
        expect(issue).toBeDefined()
        expect(issue!.severity).toBe("HIGH")
    })

    test("match in BOTH scheduled and completed surfaces a HIGH MATCH issue", () => {
        const save = makeSave({
            scheduledMatches: [
                { id: "m1", homeTeamId: "player", awayTeamId: "opp", week: 5, format: "BO1", seed: 0 },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ] as any as MatchSaveData[],
            completedMatches: [
                {
                    id: "m1", homeTeamId: "player", awayTeamId: "opp", week: 5, format: "BO1", seed: 0,
                    result: { homeScore: 16, awayScore: 8, maps: [] },
                },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ] as any as CompletedMatchSaveData[],
        })
        const issue = IntegrityChecker.check(save).find(i => i.type === "MATCH" && i.message.includes("both Schedule and Completed"))
        expect(issue).toBeDefined()
        expect(issue!.severity).toBe("HIGH")
    })
})

describe("IntegrityChecker — clean save", () => {
    test("a fully consistent save produces ZERO issues", () => {
        const save = makeSave({
            financeLedger: [
                { id: "e1", week: 1, teamId: "player", type: "INCOME", category: "PRIZE", amount: 10_000, description: "x", balance: 100_000 },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ] as any as FinanceLedgerEntrySaveData[],
            teams: [makeTeam("player", { budget: 100_000 })],
        })
        expect(IntegrityChecker.check(save).length).toBe(0)
    })
})
