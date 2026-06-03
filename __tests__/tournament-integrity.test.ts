/**
 * Regression coverage for the tournament-integrity cluster (Phases 2.1-2.3).
 *
 * 2.1 Swiss standings clobber: recomputeStandings rebuilt wins from
 *     completedMatches every tick, erasing BYE wins (which have no match) and
 *     corrupting Swiss qualification (advance at exactly 3 wins).
 * 2.2 Circuit-points double-award: a duplicate award loop in the week processor
 *     never set rewardsGranted, so points could be awarded twice. updateStandings
 *     is now the single idempotent owner — these pin that it awards exactly once.
 * 2.3 Circuit-points decay: applySeasonalDecay (25% reduction) existed but was
 *     never called; it's now wired into the season-end branch.
 */

import { updateStandings } from "@/engine/processors/standings-processor"
import { CircuitPointsManager } from "@/engine/tournament-qualification"
import type {
    GameSave,
    TournamentSaveData,
    CompletedMatchSaveData,
    TournamentStandingSaveData,
    CircuitPointsEntry,
} from "@/engine/save-types"

function makeStanding(teamId: string, over: Partial<TournamentStandingSaveData> = {}): TournamentStandingSaveData {
    return {
        teamId, matchesPlayed: 0, wins: 0, losses: 0,
        mapsWon: 0, mapsLost: 0, points: 0, mapDiff: 0, roundDiff: 0,
        ...over,
    }
}

function makeMatch(
    homeId: string, awayId: string, homeScore: number, awayScore: number,
    id: string, tournamentId = "t1",
): CompletedMatchSaveData {
    return {
        id, homeTeamId: homeId, awayTeamId: awayId, tournamentId,
        stage: "Swiss Stage", week: 1, day: 5, format: "BO3", seed: 1,
        result: { homeScore, awayScore, winnerId: homeScore > awayScore ? homeId : awayId, maps: [] },
    } as unknown as CompletedMatchSaveData
}

function makeSave(tournament: TournamentSaveData, matches: CompletedMatchSaveData[]): GameSave {
    return {
        saveVersion: 6, saveId: "test", saveName: "test",
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        currentWeek: 5, currentDay: 6, timeMode: "WEEKLY",
        gameStartDate: new Date().toISOString(), managerDetails: {} as any,
        lastRngSeed: 1, playerTeamId: "A",
        teams: tournament.teamIds.map(id => ({
            id, name: id, rosterIds: [], staffIds: [], reputation: 50,
            fanbase: 1000, followers: 1000, trophies: [], facilities: [], sponsors: [], budget: 100_000,
        })) as any,
        players: [], contracts: [], staff: [],
        tournaments: [tournament],
        scheduledMatches: [], completedMatches: matches, scheduledActivities: [],
        financeLedger: [], eventsLog: [], newsFeed: [], acknowledgedEventIds: [],
        hallOfFame: [], legendaryPlayers: [], circuitPoints: [], weekTickState: null,
    } as unknown as GameSave
}

describe("Phase 2.1 — Swiss standings recompute preserves BYE wins", () => {
    function makeSwiss(): TournamentSaveData {
        return {
            id: "t1", name: "Swiss Major", shortName: "SM", tier: "A_TIER", region: "GLOBAL",
            teamIds: ["A", "B", "C"], format: "swiss", currentStage: "Swiss Stage",
            // A has 3 wins from 3 "matches" — but only TWO are real completed
            // matches; the third is a BYE (no completed match record).
            standings: [
                makeStanding("A", { wins: 3, matchesPlayed: 3, points: 0, mapsWon: 4, mapsLost: 1, mapDiff: 3, roundDiff: 18 }),
                makeStanding("B", { wins: 0, matchesPlayed: 1, losses: 1, mapsWon: 0, mapsLost: 2, mapDiff: -2, roundDiff: -10 }),
                makeStanding("C", { wins: 0, matchesPlayed: 1, losses: 1, mapsWon: 1, mapsLost: 2, mapDiff: -1, roundDiff: -8 }),
            ],
            prizePool: 0, startWeek: 1, duration: 8, endWeek: 9,
            isCompleted: false, rewardsGranted: false, playoffBracket: [],
        } as unknown as TournamentSaveData
    }

    test("a BYE win is NOT erased by the per-tick recompute", () => {
        const t = makeSwiss()
        // Only two real matches exist for A (the 3rd win was a BYE).
        const save = makeSave(t, [makeMatch("A", "B", 2, 0, "m1"), makeMatch("A", "C", 2, 1, "m2")])

        updateStandings(save)

        const a = t.standings.find(s => s.teamId === "A")!
        // Pre-fix this collapsed to 2 (match wins only) — dropping the BYE and
        // un-qualifying a team that had reached the 3-win advance threshold.
        expect(a.wins).toBe(3)
        expect(a.matchesPlayed).toBe(3)
        // points kept in sync with wins for the sort.
        expect(a.points).toBe(9)
    })

    test("a NON-Swiss tournament still recomputes wins from matches", () => {
        const t = makeSwiss()
        t.format = "League"
        const save = makeSave(t, [makeMatch("A", "B", 2, 0, "m1"), makeMatch("A", "C", 2, 1, "m2")])

        updateStandings(save)

        const a = t.standings.find(s => s.teamId === "A")!
        // No BYE concept for non-Swiss — wins reflect the two real matches.
        expect(a.wins).toBe(2)
        expect(a.matchesPlayed).toBe(2)
        expect(a.points).toBe(6)
    })
})

describe("Phase 2.2 — circuit points are awarded exactly once (single owner)", () => {
    function makeCompletedBracket(): TournamentSaveData {
        return {
            id: "t1", name: "Test Major", shortName: "TM", tier: "A_TIER", region: "GLOBAL",
            teamIds: ["A", "B"], format: "bracket", currentStage: "Playoffs",
            standings: [makeStanding("A"), makeStanding("B")],
            prizePool: 100_000, startWeek: 1, duration: 8, endWeek: 9,
            isCompleted: true, rewardsGranted: false, winnerId: "A",
            playoffBracket: [{
                id: "gf", tournamentId: "t1", stage: "Grand Final",
                homeTeamId: "A", awayTeamId: "B", isCompleted: true,
                winnerId: "A", loserId: "B", week: 8, format: "BO3", seed: 1, sourceMatchIds: [],
            }],
        } as unknown as TournamentSaveData
    }

    test("running updateStandings twice does not double the circuit points", () => {
        const t = makeCompletedBracket()
        const save = makeSave(t, [makeMatch("A", "B", 2, 1, "gf")])

        updateStandings(save)
        const afterFirst = (save.circuitPoints ?? []).find(cp => cp.teamId === "A")?.points ?? 0
        expect(afterFirst).toBeGreaterThan(0) // A_TIER champion earns points

        updateStandings(save)
        const afterSecond = (save.circuitPoints ?? []).find(cp => cp.teamId === "A")?.points ?? 0

        expect(afterSecond).toBe(afterFirst) // idempotent — rewardsGranted guard
        expect(t.rewardsGranted).toBe(true)
    })
})

describe("Phase 2.3 — applySeasonalDecay", () => {
    test("reduces every entry's points by 25% (floored)", () => {
        const input: CircuitPointsEntry[] = [
            { teamId: "A", points: 1000, results: [] },
            { teamId: "B", points: 401, results: [] },
        ]
        const out = CircuitPointsManager.applySeasonalDecay(input)
        expect(out.find(e => e.teamId === "A")!.points).toBe(750)   // floor(1000*0.75)
        expect(out.find(e => e.teamId === "B")!.points).toBe(300)   // floor(401*0.75)=300
    })

    test("drops entries that decay to zero", () => {
        const input: CircuitPointsEntry[] = [
            { teamId: "A", points: 3, results: [] }, // floor(3*0.75)=2 -> kept
            { teamId: "B", points: 1, results: [] }, // floor(1*0.75)=0 -> dropped
        ]
        const out = CircuitPointsManager.applySeasonalDecay(input)
        expect(out.some(e => e.teamId === "A")).toBe(true)
        expect(out.some(e => e.teamId === "B")).toBe(false)
    })

    test("preserves results history", () => {
        const input: CircuitPointsEntry[] = [
            { teamId: "A", points: 1000, results: [{ tournamentId: "x", tournamentName: "X", placement: 1, points: 500, week: 3 }] },
        ]
        const out = CircuitPointsManager.applySeasonalDecay(input)
        expect(out[0].results).toHaveLength(1)
    })
})
