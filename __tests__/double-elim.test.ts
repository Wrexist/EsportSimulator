/**
 * End-to-end coverage for real double-elimination (Phase 2.5).
 *
 * `double_elim` used to silently run as single-elim (the format routed to
 * setupGenericBracket and the real machinery was dead + structurally incomplete
 * — the lower bracket orphaned a round). This drives a full 16-team double-elim
 * from setup to a champion and asserts it never stalls.
 */

import { TournamentManager } from "@/engine/tournament-manager"
import { SeededRNG } from "@/engine/rng"
import type { GameSave, TeamSaveData, TournamentSaveData } from "@/engine/save-types"

function makeTeam(id: string): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(), budget: 100_000,
        rosterIds: [], staffIds: [], trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, followers: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1, worldRanking: 10,
    } as unknown as TeamSaveData
}

function makeTournament(teamIds: string[]): TournamentSaveData {
    return {
        id: "t1", name: "Double Elim Cup", shortName: "DEC", tier: "B_TIER",
        region: "INTERNATIONAL", teamIds, format: "double_elim",
        currentStage: "Registration", standings: [], prizePool: 100_000,
        startWeek: 1, endWeek: 10, isCompleted: false, rewardsGranted: false,
        playoffBracket: [],
    } as unknown as TournamentSaveData
}

function makeSave(teams: TeamSaveData[], tournament: TournamentSaveData): GameSave {
    return {
        saveVersion: 6, saveId: "t", saveName: "t",
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        currentWeek: 1, currentDay: 6, timeMode: "WEEKLY",
        gameStartDate: new Date().toISOString(), managerDetails: {} as never,
        lastRngSeed: 1, playerTeamId: "none",
        teams, players: [], contracts: [], staff: [],
        tournaments: [tournament], scheduledMatches: [], completedMatches: [],
        scheduledActivities: [], financeLedger: [], eventsLog: [], newsFeed: [],
        acknowledgedEventIds: [], hallOfFame: [], legendaryPlayers: [],
        tournamentQualifications: [], circuitPoints: [], weekTickState: null,
    } as unknown as GameSave
}

describe("double-elimination", () => {
    test("a 16-team double_elim builds two groups and runs to a single champion (no stall)", () => {
        const teamIds = Array.from({ length: 16 }, (_, i) => `t${i}`)
        const tournament = makeTournament(teamIds)
        const save = makeSave(teamIds.map(makeTeam), tournament)

        TournamentManager.initializeTournament(save, "t1", teamIds, new SeededRNG(1))

        // Two GSL-style groups, each with 4 opening matches (both teams seeded).
        expect(tournament.groups?.length).toBe(2)
        const openings = tournament.playoffBracket!.filter(m => m.id.includes("opening"))
        expect(openings.length).toBe(8)
        for (const o of openings) {
            expect(o.homeTeamId).toBeTruthy()
            expect(o.awayTeamId).toBeTruthy()
        }

        // Drain every ready match (winner = home) — proves the whole bracket
        // (upper + lower + the previously-orphaned lower R2 + playoffs) resolves.
        let guard = 0
        for (; guard < 400; guard++) {
            const next = tournament.playoffBracket!.find(m =>
                !m.isCompleted && m.homeTeamId && m.awayTeamId &&
                m.homeTeamId !== "BYE" && m.awayTeamId !== "BYE"
            )
            if (!next) break
            TournamentManager.processMatchResult(save, "t1", next.id, next.homeTeamId!, next.awayTeamId!)
        }
        expect(guard).toBeLessThan(400) // terminated naturally (no infinite churn)

        // The tournament completed with a real champion via the Grand Final.
        expect(tournament.isCompleted).toBe(true)
        expect(teamIds).toContain(tournament.winnerId)
        const gf = tournament.playoffBracket!.find(m => m.stage === "Grand Final")
        expect(gf?.isCompleted).toBe(true)

        // A real double-elim built a lower bracket (incl. the lower-final) and a
        // playoff bracket (QF/SF) — not just a single-elim tree.
        expect(tournament.playoffBracket!.some(m => m.id.includes("lower_final") && m.isCompleted)).toBe(true)
        expect(tournament.playoffBracket!.some(m => m.id.includes("_qf_"))).toBe(true)

        // Nothing left stuck with both teams assigned (3rd-place decider aside).
        const stuck = tournament.playoffBracket!.filter(m =>
            !m.isCompleted && m.homeTeamId && m.awayTeamId && m.stage !== "3rd Place Decider"
        )
        expect(stuck).toEqual([])
    })
})
