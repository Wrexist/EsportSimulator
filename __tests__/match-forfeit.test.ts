/**
 * Coverage for engine/processors/match-forfeit.ts.
 *
 * Pins the forfeit-handling branch extracted in Phase M7 from
 * atomic-week-processor.processMatches. This runs when either team
 * has fewer than 5 healthy players at match time — the depleted side
 * forfeits and loses 1-0 by default.
 *
 * Tests cover:
 *   - Score direction (home forfeit vs away forfeit)
 *   - Score 0-1 vs 1-0 exact values
 *   - winnerId correctness
 *   - completedMatches push + removedMatchIds add
 *   - recentForm ring buffer behavior (W/L push, 5-entry cap)
 *   - MATCH_RESULT event for player team (both sides)
 *   - NO event when player team isn't involved
 *   - Event message wording differs based on which side forfeited
 *   - matchesPlayed delta is always 1
 *   - Idempotency: removedMatchIds is the same Set as caller's
 */

import { processForfeitMatch } from "@/engine/processors/match-forfeit"
import type {
    GameSave,
    TeamSaveData,
    PlayerSaveData,
    MatchSaveData,
} from "@/engine/save-types"

function makeTeam(id: string, overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: `Team ${id}`, shortName: id.slice(0, 4).toUpperCase(),
        budget: 100_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 0, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1,
        ...overrides,
    } as unknown as TeamSaveData
}

function makePlayer(id: string): PlayerSaveData {
    return { id, nickname: id, firstName: id, lastName: "P" } as unknown as PlayerSaveData
}

function makeMatch(id: string = "m1", homeTeamId = "home", awayTeamId = "away"): MatchSaveData {
    return {
        id,
        homeTeamId,
        awayTeamId,
        tournamentId: "tour1",
        stage: "Group Stage",
        week: 5,
        day: 5,
        format: "BO1",
        seed: 1,
    } as MatchSaveData
}

function makeSave(homeTeam: TeamSaveData, awayTeam: TeamSaveData, playerTeamId = "home"): GameSave {
    return {
        saveVersion: 6, saveId: "test", saveName: "test",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        currentWeek: 5, currentDay: 6, timeMode: "WEEKLY",
        gameStartDate: new Date().toISOString(),
        managerDetails: {} as any,
        lastRngSeed: 1, playerTeamId,
        teams: [homeTeam, awayTeam],
        players: [], contracts: [], staff: [],
        tournaments: [], scheduledMatches: [], completedMatches: [],
        scheduledActivities: [], financeLedger: [], eventsLog: [], newsFeed: [],
        acknowledgedEventIds: [], hallOfFame: [], legendaryPlayers: [],
        weekTickState: null,
    } as unknown as GameSave
}

function makeRoster(count: number, prefix: string): PlayerSaveData[] {
    return Array.from({ length: count }, (_, i) => makePlayer(`${prefix}_p${i}`))
}

describe("processForfeitMatch — score direction", () => {
    test("home has < 5 healthy → home loses 0-1, away wins", () => {
        const home = makeTeam("home")
        const away = makeTeam("away")
        const save = makeSave(home, away)
        const removedMatchIds = new Set<string>()

        const result = processForfeitMatch({
            save, match: makeMatch(), homeTeam: home, awayTeam: away,
            homePlayers: makeRoster(3, "h"),
            awayPlayers: makeRoster(5, "a"),
            playerTeamId: "home", removedMatchIds,
        })

        expect(result.matchesPlayed).toBe(1)
        expect(save.completedMatches.length).toBe(1)
        const r = save.completedMatches[0].result
        expect(r.homeScore).toBe(0)
        expect(r.awayScore).toBe(1)
        expect(r.winnerId).toBe("away")
    })

    test("away has < 5 healthy → away loses 0-1, home wins 1-0", () => {
        const home = makeTeam("home")
        const away = makeTeam("away")
        const save = makeSave(home, away)
        const removedMatchIds = new Set<string>()

        processForfeitMatch({
            save, match: makeMatch(), homeTeam: home, awayTeam: away,
            homePlayers: makeRoster(5, "h"),
            awayPlayers: makeRoster(2, "a"),
            playerTeamId: "home", removedMatchIds,
        })

        const r = save.completedMatches[0].result
        expect(r.homeScore).toBe(1)
        expect(r.awayScore).toBe(0)
        expect(r.winnerId).toBe("home")
    })

    test("both teams under 5 → home is treated as the forfeiter (deterministic tiebreak)", () => {
        const home = makeTeam("home")
        const away = makeTeam("away")
        const save = makeSave(home, away)

        processForfeitMatch({
            save, match: makeMatch(), homeTeam: home, awayTeam: away,
            homePlayers: makeRoster(3, "h"),
            awayPlayers: makeRoster(3, "a"),
            playerTeamId: "home", removedMatchIds: new Set(),
        })

        const r = save.completedMatches[0].result
        // homeForfeits === true wins the tiebreak per implementation.
        expect(r.winnerId).toBe("away")
    })
})

describe("processForfeitMatch — completed-match record + scheduled-match cleanup", () => {
    test("completed match has empty maps + empty playerStats + empty mvpPlayerId", () => {
        const home = makeTeam("home")
        const away = makeTeam("away")
        const save = makeSave(home, away)

        processForfeitMatch({
            save, match: makeMatch(), homeTeam: home, awayTeam: away,
            homePlayers: makeRoster(3, "h"),
            awayPlayers: makeRoster(5, "a"),
            playerTeamId: "home", removedMatchIds: new Set(),
        })

        const r = save.completedMatches[0].result
        expect(r.maps).toEqual([])
        expect(r.playerStats).toEqual({})
        expect(r.mvpPlayerId).toBe("")
    })

    test("completed match preserves the original match metadata (id, week, tournamentId)", () => {
        const home = makeTeam("home")
        const away = makeTeam("away")
        const save = makeSave(home, away)
        save.currentWeek = 12
        const match = makeMatch("specific_match_id")
        match.week = 12
        match.tournamentId = "iem_dallas"

        processForfeitMatch({
            save, match, homeTeam: home, awayTeam: away,
            homePlayers: makeRoster(2, "h"),
            awayPlayers: makeRoster(5, "a"),
            playerTeamId: "home", removedMatchIds: new Set(),
        })

        const completed = save.completedMatches[0]
        expect(completed.id).toBe("specific_match_id")
        expect(completed.week).toBe(12)
        expect(completed.tournamentId).toBe("iem_dallas")
    })

    test("match id is added to removedMatchIds (same Set instance)", () => {
        const home = makeTeam("home")
        const away = makeTeam("away")
        const save = makeSave(home, away)
        const removedMatchIds = new Set<string>(["pre_existing"])
        const match = makeMatch("new_match")

        processForfeitMatch({
            save, match, homeTeam: home, awayTeam: away,
            homePlayers: makeRoster(3, "h"),
            awayPlayers: makeRoster(5, "a"),
            playerTeamId: "home", removedMatchIds,
        })

        expect(removedMatchIds.has("new_match")).toBe(true)
        expect(removedMatchIds.has("pre_existing")).toBe(true) // not overwritten
    })

    test("analysis summary mentions the actual healthy-player count", () => {
        const home = makeTeam("home")
        const away = makeTeam("away")
        const save = makeSave(home, away)

        processForfeitMatch({
            save, match: makeMatch(), homeTeam: home, awayTeam: away,
            homePlayers: makeRoster(2, "h"), // 2/5 available
            awayPlayers: makeRoster(5, "a"),
            playerTeamId: "home", removedMatchIds: new Set(),
        })

        const summary = save.completedMatches[0].analysis?.summary || ""
        expect(summary).toContain("2/5")
        expect(summary).toContain("Team home") // forfeiting team
    })
})

describe("processForfeitMatch — recentForm tracking", () => {
    test("winner gets 'W', forfeiter gets 'L' appended", () => {
        const home = makeTeam("home", { recentForm: [] })
        const away = makeTeam("away", { recentForm: [] })
        const save = makeSave(home, away)

        processForfeitMatch({
            save, match: makeMatch(), homeTeam: home, awayTeam: away,
            homePlayers: makeRoster(5, "h"),
            awayPlayers: makeRoster(3, "a"), // away forfeits
            playerTeamId: "home", removedMatchIds: new Set(),
        })

        expect(home.recentForm).toEqual(["W"])
        expect(away.recentForm).toEqual(["L"])
    })

    test("recentForm is created on the fly when missing", () => {
        const home = makeTeam("home") // no recentForm
        const away = makeTeam("away")
        const save = makeSave(home, away)
        delete (home as any).recentForm
        delete (away as any).recentForm

        processForfeitMatch({
            save, match: makeMatch(), homeTeam: home, awayTeam: away,
            homePlayers: makeRoster(3, "h"),
            awayPlayers: makeRoster(5, "a"),
            playerTeamId: "home", removedMatchIds: new Set(),
        })

        expect(home.recentForm).toEqual(["L"])
        expect(away.recentForm).toEqual(["W"])
    })

    test("recentForm caps at 5 entries (oldest dropped)", () => {
        const home = makeTeam("home", { recentForm: ["W", "L", "W", "W", "D"] })
        const away = makeTeam("away", { recentForm: ["L", "W", "L", "L", "D"] })
        const save = makeSave(home, away)

        processForfeitMatch({
            save, match: makeMatch(), homeTeam: home, awayTeam: away,
            homePlayers: makeRoster(3, "h"), // home forfeits
            awayPlayers: makeRoster(5, "a"),
            playerTeamId: "home", removedMatchIds: new Set(),
        })

        // Both should be length 5 still — oldest entry dropped.
        expect(home.recentForm).toHaveLength(5)
        expect(away.recentForm).toHaveLength(5)
        // Newest entry is at the end.
        expect(home.recentForm!.at(-1)).toBe("L")
        expect(away.recentForm!.at(-1)).toBe("W")
        // Oldest dropped.
        expect(home.recentForm![0]).toBe("L") // was 'W' first, dropped
        expect(away.recentForm![0]).toBe("W") // was 'L' first, dropped
    })
})

describe("processForfeitMatch — player-team event surfacing", () => {
    test("player team is the forfeiter → event has 'Your team forfeited' message", () => {
        const home = makeTeam("home")
        const away = makeTeam("away")
        const save = makeSave(home, away, /*playerTeamId*/ "home")

        processForfeitMatch({
            save, match: makeMatch(), homeTeam: home, awayTeam: away,
            homePlayers: makeRoster(3, "h"),
            awayPlayers: makeRoster(5, "a"),
            playerTeamId: "home", removedMatchIds: new Set(),
        })

        expect(save.eventsLog.length).toBe(1)
        const event = save.eventsLog[0]
        expect(event.type).toBe("MATCH_RESULT")
        expect((event.data as any).description).toContain("Your team forfeited")
        expect((event.data as any).importance).toBe("HIGH")
    })

    test("player team is the winner → event has 'forfeited your match' message", () => {
        const home = makeTeam("home")
        const away = makeTeam("away")
        const save = makeSave(home, away, /*playerTeamId*/ "home")

        processForfeitMatch({
            save, match: makeMatch(), homeTeam: home, awayTeam: away,
            homePlayers: makeRoster(5, "h"),
            awayPlayers: makeRoster(2, "a"), // away forfeits to player
            playerTeamId: "home", removedMatchIds: new Set(),
        })

        expect(save.eventsLog.length).toBe(1)
        const desc = (save.eventsLog[0].data as any).description
        expect(desc).toContain("forfeited your match")
        expect(desc).toContain("win by default")
    })

    test("AI-vs-AI forfeit (player not on either team) → NO event emitted", () => {
        const home = makeTeam("ai_1")
        const away = makeTeam("ai_2")
        const save = makeSave(home, away, /*playerTeamId*/ "player_team")

        processForfeitMatch({
            save, match: makeMatch("m1", "ai_1", "ai_2"),
            homeTeam: home, awayTeam: away,
            homePlayers: makeRoster(3, "h"),
            awayPlayers: makeRoster(5, "a"),
            playerTeamId: "player_team", removedMatchIds: new Set(),
        })

        expect(save.eventsLog.length).toBe(0)
        // But the completed match is still recorded.
        expect(save.completedMatches.length).toBe(1)
    })

    test("event id scopes to (week, match) — no double-emission", () => {
        const home = makeTeam("home")
        const away = makeTeam("away")
        const save = makeSave(home, away, "home")
        save.currentWeek = 17

        processForfeitMatch({
            save, match: makeMatch("ml"),
            homeTeam: home, awayTeam: away,
            homePlayers: makeRoster(3, "h"),
            awayPlayers: makeRoster(5, "a"),
            playerTeamId: "home", removedMatchIds: new Set(),
        })

        expect(save.eventsLog[0].id).toBe("forfeit_17_ml")
        expect(save.eventsLog[0].week).toBe(17)
    })
})

describe("processForfeitMatch — return value", () => {
    test("always returns matchesPlayed: 1", () => {
        const home = makeTeam("home")
        const away = makeTeam("away")
        const save = makeSave(home, away)

        const result = processForfeitMatch({
            save, match: makeMatch(), homeTeam: home, awayTeam: away,
            homePlayers: makeRoster(3, "h"),
            awayPlayers: makeRoster(5, "a"),
            playerTeamId: "home", removedMatchIds: new Set(),
        })

        expect(result.matchesPlayed).toBe(1)
    })
})
