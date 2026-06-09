/**
 * Regression coverage for Swiss-stage pairing (engine/tournament/swiss-handlers.ts).
 *
 * Bug: generateSwissRound granted a BYE to the odd team in EVERY W-L bucket
 * independently, so a round with N odd-sized buckets handed out N free wins.
 * Real Swiss grants at most ONE BYE per round. Because qualification is
 * "advance at exactly 3 wins", surplus BYEs push the wrong teams over the
 * threshold and corrupt who reaches the playoff bracket.
 *
 * Fix: odd-one-out teams are deferred and cross-paired across adjacent buckets
 * ("float"); only the final unpaired (weakest) team gets a single BYE.
 */

import { generateSwissRound } from "@/engine/tournament/swiss-handlers"
import { SeededRNG } from "@/engine/rng"
import type { GameSave, TournamentSaveData, TournamentStandingSaveData } from "@/engine/save-types"

function standing(teamId: string, wins: number, losses: number): TournamentStandingSaveData {
    return {
        teamId, matchesPlayed: wins + losses, wins, losses,
        mapsWon: 0, mapsLost: 0, points: wins * 3, mapDiff: 0, roundDiff: 0,
    }
}

function makeTournament(standings: TournamentStandingSaveData[]): TournamentSaveData {
    return {
        id: "sw", name: "Swiss", shortName: "SW", tier: "A_TIER", region: "GLOBAL",
        teamIds: standings.map(s => s.teamId), format: "swiss", currentStage: "Swiss Stage",
        standings, prizePool: 0, startWeek: 1, duration: 8, endWeek: 9,
        isCompleted: false, rewardsGranted: false, playoffBracket: [],
    } as unknown as TournamentSaveData
}

function makeSave(tournament: TournamentSaveData): GameSave {
    return {
        saveVersion: 6, saveId: "t", saveName: "t",
        createdAt: "", updatedAt: "", currentWeek: 1, currentDay: 6, timeMode: "WEEKLY",
        gameStartDate: "", managerDetails: {} as any, lastRngSeed: 7, playerTeamId: "x",
        teams: [], players: [], contracts: [], staff: [],
        tournaments: [tournament], scheduledMatches: [], completedMatches: [],
        scheduledActivities: [], financeLedger: [], eventsLog: [], newsFeed: [],
        acknowledgedEventIds: [], hallOfFame: [], legendaryPlayers: [], weekTickState: null,
    } as unknown as GameSave
}

/** Inspect a freshly-generated round: its matches and how many BYEs were granted. */
function inspectRound(tournament: TournamentSaveData, activeCount: number) {
    const roundMatches = (tournament.playoffBracket ?? []).filter(m => m.id.includes("_swiss_r1_"))
    const teamsInMatches = new Set<string>()
    roundMatches.forEach(m => {
        teamsInMatches.add(m.homeTeamId!)
        teamsInMatches.add(m.awayTeamId!)
    })
    const byes = activeCount - teamsInMatches.size
    return { roundMatches, teamsInMatches, byes }
}

describe("generateSwissRound — at most one BYE per round", () => {
    test("two odd buckets cross-pair their leftovers → ZERO byes (was 2 pre-fix)", () => {
        // Bucket 2-1: a1,a2,a3 ; Bucket 1-2: b1,b2,b3. Each bucket pairs one
        // match and leaves one team; the two leftovers float-pair together.
        const standings = [
            standing("a1", 2, 1), standing("a2", 2, 1), standing("a3", 2, 1),
            standing("b1", 1, 2), standing("b2", 1, 2), standing("b3", 1, 2),
        ]
        const t = makeTournament(standings)
        const save = makeSave(t)
        const winsBefore = standings.reduce((s, x) => s + x.wins, 0)

        generateSwissRound(save, t, 1, new SeededRNG(123))

        const { roundMatches, teamsInMatches, byes } = inspectRound(t, 6)
        expect(roundMatches.length).toBe(3)        // 1 per bucket + 1 cross-bucket float
        expect(byes).toBe(0)
        expect(teamsInMatches.size).toBe(6)        // everyone plays — no double-booking
        // No BYE inflation: total wins unchanged by the pairing step.
        expect(standings.reduce((s, x) => s + x.wins, 0)).toBe(winsBefore)
    })

    test("a single odd bucket still grants exactly one legitimate BYE", () => {
        const standings = [standing("a1", 2, 1), standing("a2", 2, 1), standing("a3", 2, 1)]
        const t = makeTournament(standings)
        const save = makeSave(t)
        const winsBefore = standings.reduce((s, x) => s + x.wins, 0)

        generateSwissRound(save, t, 1, new SeededRNG(99))

        const { roundMatches, byes } = inspectRound(t, 3)
        expect(roundMatches.length).toBe(1)
        expect(byes).toBe(1)
        // Exactly one BYE win was added.
        expect(standings.reduce((s, x) => s + x.wins, 0)).toBe(winsBefore + 1)
    })

    test("three odd buckets still cap at ONE bye (odd leftover count)", () => {
        const standings = [
            standing("a1", 2, 0), standing("a2", 2, 0), standing("a3", 2, 0),
            standing("b1", 1, 1), standing("b2", 1, 1), standing("b3", 1, 1),
            standing("c1", 0, 2), standing("c2", 0, 2), standing("c3", 0, 2),
        ]
        const t = makeTournament(standings)
        const save = makeSave(t)

        generateSwissRound(save, t, 1, new SeededRNG(456))

        const { roundMatches, teamsInMatches, byes } = inspectRound(t, 9)
        // 3 in-bucket matches + 1 float match (two of the three leftovers).
        expect(roundMatches.length).toBe(4)
        expect(byes).toBe(1)
        expect(teamsInMatches.size).toBe(8)
    })

    test("no team is scheduled into two matches in the same round", () => {
        const standings = [
            standing("a1", 2, 1), standing("a2", 2, 1), standing("a3", 2, 1),
            standing("b1", 1, 1), standing("b2", 1, 1),
            standing("c1", 0, 2), standing("c2", 0, 2), standing("c3", 0, 2),
        ]
        const t = makeTournament(standings)
        const save = makeSave(t)

        generateSwissRound(save, t, 1, new SeededRNG(2024))

        const roundMatches = (t.playoffBracket ?? []).filter(m => m.id.includes("_swiss_r1_"))
        const seen = new Set<string>()
        for (const m of roundMatches) {
            expect(seen.has(m.homeTeamId!)).toBe(false)
            expect(seen.has(m.awayTeamId!)).toBe(false)
            seen.add(m.homeTeamId!)
            seen.add(m.awayTeamId!)
            expect(m.homeTeamId).not.toBe(m.awayTeamId) // never a self-match
        }
        // Also pins the one-bye cap on a mixed odd/even field (8 active teams).
        const byes = 8 - seen.size
        expect(byes).toBeLessThanOrEqual(1)
    })
})
