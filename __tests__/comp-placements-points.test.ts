/**
 * COMP-09 / COMP-10 regressions (competition audit 2026-11-03).
 *   COMP-09: prize ledger said "3th Place".
 *   COMP-10: quarter-final losers got 600 or 400 S-tier circuit points
 *            depending only on which quarter-final they lost.
 */
import { updateStandings } from "@/engine/processors/standings-processor"
import { TournamentManager, circuitPointsForPlacement } from "@/engine/tournament-manager"
import { CIRCUIT_POINTS } from "@/data/tournament-calendar"
import type { GameSave, TournamentSaveData, CompletedMatchSaveData, BracketMatchSaveData } from "@/engine/save-types"

const TID = "elite_s1"
const TEAMS = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"]

function row(id: string, stage: string, home: string, away: string, winner: string): BracketMatchSaveData {
    return { id: `${TID}_${id}`, tournamentId: TID, stage, homeTeamId: home, awayTeamId: away, isCompleted: true, winnerId: winner, loserId: winner === home ? away : home, week: 5, format: "BO3", seed: 1, sourceMatchIds: [] } as BracketMatchSaveData
}

function completed(b: BracketMatchSaveData): CompletedMatchSaveData {
    const homeWon = b.winnerId === b.homeTeamId
    return { id: b.id, homeTeamId: b.homeTeamId, awayTeamId: b.awayTeamId, tournamentId: TID, stage: b.stage, week: 5, day: 5, format: "BO3", seed: 1,
        result: { homeScore: homeWon ? 2 : 0, awayScore: homeWon ? 0 : 2, winnerId: b.winnerId, maps: [] } } as unknown as CompletedMatchSaveData
}

function eightTeamBracket(tier: TournamentSaveData["tier"]): GameSave {
    const bracket = [
        row("qf_1", "Quarter-final 1", "t1", "t8", "t1"),
        row("qf_2", "Quarter-final 2", "t2", "t7", "t2"),
        row("qf_3", "Quarter-final 3", "t3", "t6", "t3"),
        row("qf_4", "Quarter-final 4", "t4", "t5", "t4"),
        row("sf_1", "Semi-final 1", "t1", "t4", "t1"),
        row("sf_2", "Semi-final 2", "t2", "t3", "t2"),
        row("3rd_place_decider", "3rd Place Decider", "t4", "t3", "t3"),
        row("grand_final", "Grand Final", "t1", "t2", "t1"),
    ]
    const tournament = {
        id: TID, seriesId: "elite", instanceId: TID, seasonNumber: 1, name: "Elite Cup 2025", shortName: "Elite", tier, region: "EU",
        teamIds: TEAMS, format: "bracket", currentStage: "Grand Final", standings: [], prizePool: 100_000,
        startWeek: 5, duration: 1, endWeek: 6, playoffBracket: bracket,
    } as unknown as TournamentSaveData
    return {
        saveVersion: 6, saveId: "s", saveName: "s", createdAt: "", updatedAt: "", currentWeek: 6, currentDay: 6, timeMode: "WEEKLY",
        gameStartDate: "2026-11-02T00:00:00.000Z", managerDetails: {} as any, lastRngSeed: 1, playerTeamId: "t8",
        teams: TEAMS.map((id, i) => ({ id, name: id, rosterIds: [], staffIds: [], reputation: 50, fanbase: 1000, trophies: [], facilities: [], sponsors: [], followers: 1000, budget: 0, elo: 1500 - i * 10 })) as any,
        players: [], contracts: [], staff: [], tournaments: [tournament], scheduledMatches: [], completedMatches: bracket.map(completed),
        scheduledActivities: [], financeLedger: [], eventsLog: [], newsFeed: [], acknowledgedEventIds: [], hallOfFame: [], legendaryPlayers: [],
        tournamentQualifications: [], circuitPoints: [], contractsHistory: [], weekTickState: null,
    } as unknown as GameSave
}

describe("COMP-10 tied eliminations", () => {
    test("quarter-final losers share the 5-8 block", () => {
        const save = eightTeamBracket("S_TIER")
        const qfLosers = TournamentManager.calculatePlacements(save, save.tournaments[0]).filter(p => ["t5", "t6", "t7", "t8"].includes(p.teamId))
        expect(qfLosers).toHaveLength(4)
        for (const p of qfLosers) expect([p.tiedFrom, p.tiedThrough]).toEqual([5, 8])
        // Positions stay unique (prize tables are per position).
        expect(new Set(qfLosers.map(p => p.position))).toEqual(new Set([5, 6, 7, 8]))
    })

    test("every quarter-final loser gets the same circuit points, and the total is unchanged", () => {
        const save = eightTeamBracket("S_TIER")
        updateStandings(save)
        const pointsOf = (id: string) => save.circuitPoints.find(c => c.teamId === id)?.points ?? 0
        const qf = ["t5", "t6", "t7", "t8"].map(pointsOf)
        expect(new Set(qf).size).toBe(1)
        expect(qf[0]).toBe((600 + 600 + 400 + 400) / 4)
        expect(pointsOf("t1")).toBe(CIRCUIT_POINTS.S_TIER[1])
        expect(pointsOf("t3")).toBe(CIRCUIT_POINTS.S_TIER[3])
        const total = save.circuitPoints.reduce((sum, c) => sum + c.points, 0)
        const tableTotal = [1, 2, 3, 4, 5, 6, 7, 8].reduce((sum, pos) => sum + (CIRCUIT_POINTS.S_TIER as Record<number, number>)[pos], 0)
        expect(total).toBe(tableTotal)
        // The results row names the shared place.
        expect(save.circuitPoints.find(c => c.teamId === "t7")?.results[0].placement).toBe(5)
    })

    test("untied places keep their own table value", () => {
        expect(circuitPointsForPlacement(CIRCUIT_POINTS.A_TIER, { teamId: "x", position: 2 })).toBe(300)
        expect(circuitPointsForPlacement(CIRCUIT_POINTS.A_TIER, { teamId: "x", position: 7, tiedFrom: 5, tiedThrough: 8 })).toBe(75)
        expect(circuitPointsForPlacement(CIRCUIT_POINTS.S_TIER, { teamId: "x", position: 15, tiedFrom: 9, tiedThrough: 16 })).toBe(150)
    })
})

describe("COMP-09 prize ledger ordinals", () => {
    test("3rd/4th/5th place read correctly", () => {
        const save = eightTeamBracket("A_TIER")
        updateStandings(save)
        const descriptions = save.financeLedger.filter(e => e.category === "PRIZE").map(e => e.description)
        expect(descriptions).toEqual(expect.arrayContaining([
            "Elite Cup 2025 - 1st Place", "Elite Cup 2025 - 2nd Place", "Elite Cup 2025 - 3rd Place", "Elite Cup 2025 - 4th Place", "Elite Cup 2025 - 5th Place",
        ]))
        expect(descriptions.join(" ")).not.toMatch(/\b3th\b/)
    })
})
