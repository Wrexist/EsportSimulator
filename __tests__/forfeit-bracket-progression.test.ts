/**
 * COMP-05 regression: a forfeited bracket/league match used to be played a
 * second time (with the opposite winner) by
 * TournamentManager.simulateAllPendingBracketMatches, because the forfeit
 * pushed a completedMatches record but never closed the bracket row.
 *
 * Pins:
 *   - processForfeitMatch closes the bracket row with the forfeit winner and
 *     advances that winner to the next round.
 *   - the pending-bracket simulation never adds a second record for it.
 *   - saves written before the fix (forfeit record present, bracket row still
 *     open — or already two records for one id) load into the same paths
 *     without throwing and without a third record.
 */
import { processForfeitMatch } from "@/engine/processors/match-forfeit"
import { TournamentManager } from "@/engine/tournament-manager"
import { SeededRNG } from "@/engine/rng"
import type {
    GameSave,
    TeamSaveData,
    PlayerSaveData,
    MatchSaveData,
    TournamentSaveData,
    BracketMatchSaveData,
    CompletedMatchSaveData,
} from "@/engine/save-types"

const TID = "cup_s1"

function team(id: string): TeamSaveData {
    return {
        id, name: `Team ${id}`, shortName: id.toUpperCase(),
        budget: 100_000, rosterIds: Array.from({ length: 5 }, (_, i) => `${id}_p${i}`), staffIds: [],
        trophies: [], facilities: [], sponsors: [], fanbase: 0, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1, elo: 1500, recentForm: [],
    } as unknown as TeamSaveData
}

function player(id: string, injured = false): PlayerSaveData {
    return { id, nickname: id, firstName: id, lastName: "P", ...(injured ? { injury: { type: "Wrist", weeksRemaining: 2 } } : {}) } as unknown as PlayerSaveData
}

function bracketRow(id: string, stage: string, home?: string, away?: string, sources: string[] = []): BracketMatchSaveData {
    return { id, tournamentId: TID, stage, homeTeamId: home, awayTeamId: away, isCompleted: false, week: 5, format: "BO1", seed: 7, sourceMatchIds: sources } as BracketMatchSaveData
}

function makeSave(): GameSave {
    const teams = ["a", "b", "c", "d"].map(team)
    // Team "a" has two injured starters → only 3 healthy.
    const players = teams.flatMap(t => t.rosterIds.map((pid, i) => player(pid, t.id === "a" && i < 2)))
    const tournament = {
        id: TID, seriesId: "cup", instanceId: TID, seasonNumber: 1, name: "Cup", shortName: "Cup",
        region: "EU", tier: "B_TIER", teamIds: ["a", "b", "c", "d"], format: "bracket", currentStage: "Semi-finals",
        standings: [], prizePool: 0, startWeek: 5, endWeek: 6, duration: 1,
        playoffBracket: [
            bracketRow(`${TID}_sf_1`, "Semi-final 1", "a", "b"),
            bracketRow(`${TID}_sf_2`, "Semi-final 2", "c", "d"),
            bracketRow(`${TID}_grand_final`, "Grand Final", undefined, undefined, [`${TID}_sf_1`, `${TID}_sf_2`]),
        ],
    } as unknown as TournamentSaveData
    return {
        saveVersion: 6, saveId: "t", saveName: "t", createdAt: "", updatedAt: "",
        currentWeek: 5, currentDay: 5, timeMode: "WEEKLY", gameStartDate: "2026-11-02T00:00:00.000Z",
        managerDetails: {} as any, lastRngSeed: 1, playerTeamId: "c",
        teams, players, contracts: [], staff: [], tournaments: [tournament],
        scheduledMatches: [
            { id: `${TID}_sf_1`, homeTeamId: "a", awayTeamId: "b", tournamentId: TID, stage: "Semi-final 1", week: 5, day: 5, format: "BO1", seed: 7 },
            { id: `${TID}_sf_2`, homeTeamId: "c", awayTeamId: "d", tournamentId: TID, stage: "Semi-final 2", week: 5, day: 5, format: "BO1", seed: 8 },
        ] as MatchSaveData[],
        completedMatches: [], scheduledActivities: [], financeLedger: [], eventsLog: [], newsFeed: [],
        acknowledgedEventIds: [], hallOfFame: [], legendaryPlayers: [], tournamentQualifications: [], weekTickState: null,
    } as unknown as GameSave
}

function forfeitSemi(save: GameSave) {
    const match = save.scheduledMatches.find(m => m.id === `${TID}_sf_1`)!
    const [a, b] = [save.teams[0], save.teams[1]]
    const healthy = (t: TeamSaveData) => t.rosterIds.map(id => save.players.find(p => p.id === id)!).filter(p => !p.injury)
    processForfeitMatch({ save, match, homeTeam: a, awayTeam: b, homePlayers: healthy(a), awayPlayers: healthy(b), playerTeamId: "c", removedMatchIds: new Set() })
}

const rowOf = (save: GameSave, id: string) => save.tournaments[0].playoffBracket!.find(m => m.id === id)!
const recordsFor = (save: GameSave, id: string) => save.completedMatches.filter(m => m.id === id)

describe("COMP-05 forfeit closes the bracket row", () => {
    test("forfeit marks the row completed and advances the forfeit winner", () => {
        const save = makeSave()
        forfeitSemi(save)
        const sf1 = rowOf(save, `${TID}_sf_1`)
        expect(sf1.isCompleted).toBe(true)
        expect(sf1.winnerId).toBe("b")
        expect(sf1.loserId).toBe("a")
        expect(rowOf(save, `${TID}_grand_final`).homeTeamId).toBe("b")
    })

    test("pending-bracket simulation does not replay a forfeited match", () => {
        const save = makeSave()
        forfeitSemi(save)
        // The player's own semi (c vs d) triggers the catch-up of AI rows.
        TournamentManager.simulateConcurrentMatches(save, TID, "c", "Semi-final 2", new SeededRNG(1))
        const records = recordsFor(save, `${TID}_sf_1`)
        expect(records).toHaveLength(1)
        expect(records[0].result.winnerId).toBe("b")
        expect(rowOf(save, `${TID}_sf_1`).winnerId).toBe("b")
    })
})

describe("COMP-05 saves written before the fix", () => {
    function legacyForfeitRecord(save: GameSave, winner: string, homeScore: number): CompletedMatchSaveData {
        const m = save.scheduledMatches.find(x => x.id === `${TID}_sf_1`)!
        return { ...m, result: { homeScore, awayScore: 1 - homeScore, maps: [], playerStats: {}, winnerId: winner, mvpPlayerId: "" } } as unknown as CompletedMatchSaveData
    }

    test("open bracket row with a forfeit record is closed with the recorded winner, not replayed", () => {
        const save = makeSave()
        save.completedMatches.push(legacyForfeitRecord(save, "b", 0))
        save.scheduledMatches = save.scheduledMatches.filter(m => m.id !== `${TID}_sf_1`)
        expect(() => TournamentManager.simulateConcurrentMatches(save, TID, "c", "Semi-final 2", new SeededRNG(2))).not.toThrow()
        expect(recordsFor(save, `${TID}_sf_1`)).toHaveLength(1)
        expect(rowOf(save, `${TID}_sf_1`).isCompleted).toBe(true)
        expect(rowOf(save, `${TID}_sf_1`).winnerId).toBe("b")
        expect(rowOf(save, `${TID}_grand_final`).homeTeamId).toBe("b")
    })

    test("a save that already holds two opposite records for one match does not crash or add a third", () => {
        const save = makeSave()
        save.completedMatches.push(legacyForfeitRecord(save, "b", 0), legacyForfeitRecord(save, "a", 1))
        const sf1 = rowOf(save, `${TID}_sf_1`)
        Object.assign(sf1, { isCompleted: true, winnerId: "a", loserId: "b" })
        rowOf(save, `${TID}_grand_final`).homeTeamId = "a"
        save.scheduledMatches = save.scheduledMatches.filter(m => m.id !== `${TID}_sf_1`)
        expect(() => TournamentManager.simulateConcurrentMatches(save, TID, "c", "Semi-final 2", new SeededRNG(3))).not.toThrow()
        expect(recordsFor(save, `${TID}_sf_1`)).toHaveLength(2)
        expect(() => TournamentManager.calculatePlacements(save, save.tournaments[0])).not.toThrow()
    })
})
