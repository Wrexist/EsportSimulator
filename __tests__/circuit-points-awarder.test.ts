/**
 * Coverage for engine/processors/circuit-points-awarder.ts.
 *
 * Pins the trophy + circuit-points awarding logic extracted in
 * Phase M3 from atomic-week-processor.ts. The function:
 *   - Adds points to the team's circuit-points entry (creates if missing)
 *   - On placement=1, awards the trophy to team.trophies
 *   - Trophy duplicates guarded by (baseTournamentId, season)
 *   - S_TIER trophy wins bump every roster player's majorWins
 *   - rewardsGranted in tournaments[] short-circuits re-awarding
 *
 * Uses real tournament names from the calendar JSON so we don't have
 * to mock FULL_TOURNAMENT_CALENDAR.
 */

import { awardCircuitPoints } from "@/engine/processors/circuit-points-awarder"
import type { GameSave, TeamSaveData, PlayerSaveData } from "@/engine/save-types"

// Real calendar entries — keeps tests in sync with shipped data.
const S_TIER_TOURNAMENT_NAME = "Northern Major 2025"
const A_TIER_TOURNAMENT_NAME = "Dallas Masters 2025"

function makeTeam(overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id: "team_a", name: "Team A", shortName: "TA",
        budget: 100_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 0, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1,
        ...overrides,
    } as unknown as TeamSaveData
}

function makePlayer(id: string, majorWins?: number): PlayerSaveData {
    return { id, nickname: id, firstName: id, lastName: "P", majorWins } as unknown as PlayerSaveData
}

function makeSave(team: TeamSaveData, players: PlayerSaveData[] = []): GameSave {
    return {
        saveVersion: 6, saveId: "test", saveName: "test",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        currentWeek: 10, currentDay: 6, timeMode: "WEEKLY",
        gameStartDate: new Date().toISOString(),
        managerDetails: {} as any,
        lastRngSeed: 1, playerTeamId: team.id,
        teams: [team], players, contracts: [], staff: [],
        tournaments: [], scheduledMatches: [], completedMatches: [],
        scheduledActivities: [], financeLedger: [], eventsLog: [], newsFeed: [],
        acknowledgedEventIds: [], hallOfFame: [], legendaryPlayers: [],
        circuitPoints: [],
        weekTickState: null,
    } as unknown as GameSave
}

describe("awardCircuitPoints — points awarding", () => {
    test("0 points is a no-op", () => {
        const team = makeTeam()
        const save = makeSave(team)
        awardCircuitPoints(save, team.id, 0, A_TIER_TOURNAMENT_NAME, 1)
        expect(save.circuitPoints.length).toBe(0)
        expect(team.trophies?.length ?? 0).toBe(0)
    })

    test("creates a new circuit entry for a team that didn't have one", () => {
        const team = makeTeam()
        const save = makeSave(team)
        awardCircuitPoints(save, team.id, 200, A_TIER_TOURNAMENT_NAME, 3)

        expect(save.circuitPoints.length).toBe(1)
        expect(save.circuitPoints[0].teamId).toBe(team.id)
        expect(save.circuitPoints[0].points).toBe(200)
        expect(save.circuitPoints[0].results.length).toBe(1)
    })

    test("appends to existing entry; sums points", () => {
        const team = makeTeam()
        const save = makeSave(team)
        save.circuitPoints = [{ teamId: team.id, points: 100, results: [] }]

        awardCircuitPoints(save, team.id, 50, A_TIER_TOURNAMENT_NAME, 5)

        expect(save.circuitPoints.length).toBe(1)
        expect(save.circuitPoints[0].points).toBe(150)
        expect(save.circuitPoints[0].results.length).toBe(1)
    })

    test("each result row carries placement + week", () => {
        const team = makeTeam()
        const save = makeSave(team)
        save.currentWeek = 17
        awardCircuitPoints(save, team.id, 100, A_TIER_TOURNAMENT_NAME, 4)

        const r = save.circuitPoints[0].results[0]
        expect(r.placement).toBe(4)
        expect(r.points).toBe(100)
        expect(r.week).toBe(17)
        expect(r.tournamentName).toBe(A_TIER_TOURNAMENT_NAME)
    })
})

describe("awardCircuitPoints — trophy awarding", () => {
    test("placement 1 awards a trophy", () => {
        const team = makeTeam()
        const save = makeSave(team)
        awardCircuitPoints(save, team.id, 100, A_TIER_TOURNAMENT_NAME, 1)

        expect(team.trophies?.length).toBe(1)
        expect(team.trophies?.[0].tournamentName).toBe(A_TIER_TOURNAMENT_NAME)
    })

    test("placement != 1 does NOT award a trophy", () => {
        const team = makeTeam()
        const save = makeSave(team)
        awardCircuitPoints(save, team.id, 100, A_TIER_TOURNAMENT_NAME, 2)

        expect(team.trophies?.length ?? 0).toBe(0)
    })

    test("S_TIER win bumps every roster player's majorWins", () => {
        const team = makeTeam({ rosterIds: ["p1", "p2", "p3"] })
        const players = [
            makePlayer("p1", 0),
            makePlayer("p2"), // undefined → should init to 0 then bump to 1
            makePlayer("p3", 5),
        ]
        const save = makeSave(team, players)

        awardCircuitPoints(save, team.id, 1000, S_TIER_TOURNAMENT_NAME, 1)

        expect(players[0].majorWins).toBe(1)
        expect(players[1].majorWins).toBe(1)
        expect(players[2].majorWins).toBe(6)
    })

    test("A_TIER win does NOT bump majorWins", () => {
        const team = makeTeam({ rosterIds: ["p1"] })
        const players = [makePlayer("p1", 0)]
        const save = makeSave(team, players)

        awardCircuitPoints(save, team.id, 500, A_TIER_TOURNAMENT_NAME, 1)

        expect(players[0].majorWins).toBe(0)
    })

    test("duplicate trophy within the same season is skipped", () => {
        const team = makeTeam()
        const save = makeSave(team)
        // First award: places trophy.
        awardCircuitPoints(save, team.id, 100, A_TIER_TOURNAMENT_NAME, 1)
        // Second award: same team, same tournament, same season.
        awardCircuitPoints(save, team.id, 100, A_TIER_TOURNAMENT_NAME, 1)

        expect(team.trophies?.length).toBe(1)
    })

    test("rewardsGranted on a prior season-instance short-circuits trophy awarding", () => {
        const team = makeTeam()
        const save = makeSave(team)
        // Inject a finalized tournament for the current season.
        save.tournaments.push({
            id: "iem_dallas_s1",
            seasonNumber: 1,
            name: A_TIER_TOURNAMENT_NAME,
            shortName: "DAL",
            tier: "A_TIER",
            region: "GLOBAL",
            format: "Bracket",
            currentStage: "Final",
            startWeek: 1, duration: 1, endWeek: 2,
            teamIds: [], standings: [], prizePool: 0,
            rewardsGranted: true,
        } as any)

        awardCircuitPoints(save, team.id, 100, A_TIER_TOURNAMENT_NAME, 1)

        // No trophy because the season-instance already paid out.
        expect(team.trophies?.length ?? 0).toBe(0)
        // Points still accrue.
        expect(save.circuitPoints[0].points).toBe(100)
    })

    test("unknown tournament name → no crash, points still awarded with 'unknown' id", () => {
        const team = makeTeam()
        const save = makeSave(team)
        awardCircuitPoints(save, team.id, 50, "This Tournament Does Not Exist", 1)

        expect(save.circuitPoints[0].results[0].tournamentId).toBe("unknown")
        // Trophy not awarded because lookup failed.
        expect(team.trophies?.length ?? 0).toBe(0)
    })
})
