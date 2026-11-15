/**
 * ENGINE-09: only the managed club's matches keep round-by-round detail in
 * save.completedMatches. Tournament bracket matches between two other clubs
 * used to keep every round of every map (several MB in a busy event window).
 */
import { TournamentManager } from "@/engine/tournament-manager"
import { compactPersistentState } from "@/engine/processors/save-compactor"
import { isManagedMatch, resultForSave } from "@/engine/processors/match-detail"
import { SeededRNG } from "@/engine/rng"
import type { GameSave, TeamSaveData, PlayerSaveData, MatchSaveData, TournamentSaveData, BracketMatchSaveData, CompletedMatchSaveData } from "@/engine/save-types"
import type { MatchResult } from "@/types"

const TID = "cup_s1"

function player(id: string, skill = 65): PlayerSaveData {
    return {
        id, name: id, nickname: id, firstName: id, lastName: "P", age: 24, nationality: "Sweden", role: id.endsWith("p0") ? "AWPER" : id.endsWith("p1") ? "IGL" : "RIFLER", tier: "PRO",
        energy: 100, maxEnergy: 100, skill, awp: skill, rifle: skill, pistol: skill, grenades: skill, creativity: skill,
        clutch: skill, tactic: skill, leader: skill, teamwork: skill, morale: 70, amicability: 60, productivity: 60,
        stressResistance: 60, loyalty: 60, reaction: skill, eyesight: skill, health: 90, strength: 60, endurance: 60,
        form: 60, fatigue: 0, potential: skill + 5, matchesPlayed: 0, level: 1, xp: 0, xpToNextLevel: 1000, talentPoints: 0, unlockedTalentIds: [],
    } as unknown as PlayerSaveData
}

function team(id: string): TeamSaveData {
    return {
        id, name: `Team ${id}`, shortName: id.toUpperCase(),
        budget: 100_000, rosterIds: Array.from({ length: 5 }, (_, i) => `${id}_p${i}`), staffIds: [],
        trophies: [], facilities: [], sponsors: [], fanbase: 0, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1, elo: 1500, recentForm: [],
    } as unknown as TeamSaveData
}

const row = (id: string, stage: string, home?: string, away?: string, sources: string[] = []) =>
    ({ id, tournamentId: TID, stage, homeTeamId: home, awayTeamId: away, isCompleted: false, week: 5, format: "BO1", seed: 7, sourceMatchIds: sources }) as BracketMatchSaveData

function makeSave(): GameSave {
    const teams = ["a", "b", "c", "d"].map(team)
    const tournament = {
        id: TID, seriesId: "cup", instanceId: TID, seasonNumber: 1, name: "Cup", shortName: "Cup",
        region: "EU", tier: "B_TIER", teamIds: ["a", "b", "c", "d"], format: "bracket", currentStage: "Semi-finals",
        standings: [], prizePool: 0, startWeek: 5, endWeek: 6, duration: 1,
        playoffBracket: [
            row(`${TID}_sf_1`, "Semi-final 1", "a", "b"),
            row(`${TID}_sf_2`, "Semi-final 2", "c", "d"),
            row(`${TID}_grand_final`, "Grand Final", undefined, undefined, [`${TID}_sf_1`, `${TID}_sf_2`]),
        ],
    } as unknown as TournamentSaveData
    return {
        saveVersion: 6, saveId: "t", saveName: "t", createdAt: "", updatedAt: "",
        currentWeek: 5, currentDay: 5, timeMode: "WEEKLY", gameStartDate: "2026-11-02T00:00:00.000Z",
        managerDetails: {} as never, lastRngSeed: 1, playerTeamId: "c",
        teams, players: teams.flatMap(t => t.rosterIds.map(id => player(id))), contracts: [], staff: [], tournaments: [tournament],
        scheduledMatches: [
            { id: `${TID}_sf_1`, homeTeamId: "a", awayTeamId: "b", tournamentId: TID, stage: "Semi-final 1", week: 5, day: 5, format: "BO1", seed: 7 },
            { id: `${TID}_sf_2`, homeTeamId: "c", awayTeamId: "d", tournamentId: TID, stage: "Semi-final 2", week: 5, day: 5, format: "BO1", seed: 8 },
        ] as MatchSaveData[],
        completedMatches: [], scheduledActivities: [], financeLedger: [], eventsLog: [], newsFeed: [], transferHistory: [],
        acknowledgedEventIds: [], hallOfFame: [], legendaryPlayers: [], tournamentQualifications: [], weekTickState: null,
    } as unknown as GameSave
}

const withRounds = (id: string, home: string, away: string, week: number): CompletedMatchSaveData => ({
    id, homeTeamId: home, awayTeamId: away, week, format: "BO1",
    result: { homeScore: 1, awayScore: 0, winnerId: home, playerStats: {}, mvpPlayerId: "", maps: [{ map: "de_mirage", homeScore: 13, awayScore: 7, rounds: [{ roundNumber: 1 }, { roundNumber: 2 }] }] },
}) as unknown as CompletedMatchSaveData

describe("resultForSave", () => {
    const result = { homeScore: 1, awayScore: 0, maps: [{ map: "de_mirage", homeScore: 13, awayScore: 7, rounds: [{ roundNumber: 1 }] }] } as unknown as MatchResult
    test("keeps the managed club's rounds and strips everyone else's, without touching the input", () => {
        expect(resultForSave(result, { homeTeamId: "me", awayTeamId: "x" }, "me")).toBe(result)
        const stored = resultForSave(result, { homeTeamId: "x", awayTeamId: "y" }, "me")
        expect(stored.maps[0].rounds).toEqual([])
        expect(stored.maps[0].homeScore).toBe(13)
        expect(result.maps[0].rounds).toHaveLength(1)
        expect(isManagedMatch({ homeTeamId: "x", awayTeamId: "y" }, "")).toBe(false)
    })
})

describe("tournament bracket matches between other clubs are stored without rounds (ENGINE-09)", () => {
    test("simulateConcurrentMatches: the other semi-final keeps its scoreboard, not its rounds; careers still count it", () => {
        const save = makeSave()
        TournamentManager.simulateConcurrentMatches(save, TID, "c", "Semi-final 2", new SeededRNG(1))
        const semi = save.completedMatches.find(m => m.id === `${TID}_sf_1`)!
        expect(semi).toBeDefined()
        expect(semi.result.maps.length).toBeGreaterThan(0)
        for (const map of semi.result.maps) {
            expect(map.rounds).toEqual([])
            expect((map.homeScore ?? 0) + (map.awayScore ?? 0)).toBeGreaterThan(0)
        }
        expect(Object.keys(semi.result.playerStats).length).toBe(10)
        // Official stats were taken from the full result before it was stripped.
        expect(save.players.find(p => p.id === "a_p0")!.seasonTally?.maps).toBeGreaterThan(0)
    })
})

describe("the compactor strips rounds of other clubs' matches at once (ENGINE-09)", () => {
    test("a bloated save shrinks on the next tick; the managed club keeps recent rounds", () => {
        const save = makeSave()
        save.currentWeek = 20
        save.completedMatches = [
            withRounds("ai_recent", "a", "b", 19),
            withRounds("own_recent", "c", "d", 19),
            withRounds("own_old", "d", "c", 10),
        ]
        compactPersistentState(save)
        const rounds = (id: string) => save.completedMatches.find(m => m.id === id)!.result.maps[0].rounds.length
        expect(rounds("ai_recent")).toBe(0)
        expect(rounds("own_recent")).toBe(2)
        expect(rounds("own_old")).toBe(0)
    })

    test("between jobs (no managed club) only the age rule applies", () => {
        const save = makeSave()
        save.currentWeek = 20
        save.playerTeamId = "" as never
        save.completedMatches = [withRounds("recent", "a", "b", 19), withRounds("old", "a", "b", 10)]
        compactPersistentState(save)
        expect(save.completedMatches.map(m => m.result.maps[0].rounds.length)).toEqual([2, 0])
    })
})
