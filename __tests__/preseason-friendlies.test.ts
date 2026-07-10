/**
 * Preseason friendlies seeding — a new career's Week-1 calendar must not be
 * empty. seedPreseasonFriendlies books a few practice scrims against
 * similarly-ranked opponents, deterministically, without touching anything
 * else on the save.
 */

import { seedPreseasonFriendlies } from "@/engine/preseason-friendlies"
import type { GameSave, TeamSaveData, MatchSaveData } from "@/engine/save-types"

function makeTeam(id: string, worldRanking: number, roster = 5): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(),
        budget: 100_000,
        rosterIds: Array.from({ length: roster }, (_, i) => `${id}_p${i}`),
        staffIds: [], trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1, leagueTier: "B_TIER",
        elo: 1500, recentForm: [], worldRanking,
    } as unknown as TeamSaveData
}

function makeSave(teams: TeamSaveData[], seed = 12345): GameSave {
    return {
        saveId: "save_test",
        currentWeek: 1,
        currentDay: 0,
        teams,
        players: [],
        scheduledMatches: [] as MatchSaveData[],
        lastRngSeed: seed,
    } as unknown as GameSave
}

describe("seedPreseasonFriendlies", () => {
    const teams = [
        makeTeam("player", 50),
        makeTeam("close_a", 48),
        makeTeam("close_b", 52),
        makeTeam("close_c", 45),
        makeTeam("far", 5),
    ]

    it("seeds three preseason friendlies for a valid five-player roster", () => {
        const save = makeSave(teams)
        const added = seedPreseasonFriendlies(save, "player")
        expect(added).toBe(3)
        expect(save.scheduledMatches).toHaveLength(3)
    })

    it("books the player team at home with scrim/preseason metadata across the opening weeks", () => {
        const save = makeSave(teams)
        seedPreseasonFriendlies(save, "player")
        for (const m of save.scheduledMatches) {
            expect(m.homeTeamId).toBe("player")
            expect(m.awayTeamId).not.toBe("player")
            expect(m.isScrim).toBe(true)
            expect(m.tournamentId).toBe("SCRIM")
            expect(m.stage).toBe("Preseason Friendly")
            expect(m.format).toBe("BO1")
        }
        // Something is playable in Week 1.
        expect(save.scheduledMatches.some(m => m.week === 1)).toBe(true)
        // Days are mid-week (avoid the weekend tournament slots).
        for (const m of save.scheduledMatches) {
            expect(m.day).toBeGreaterThanOrEqual(1)
            expect(m.day).toBeLessThanOrEqual(4)
        }
    })

    it("prefers opponents close in world ranking over distant ones", () => {
        const save = makeSave(teams)
        seedPreseasonFriendlies(save, "player")
        const opponents = save.scheduledMatches.map(m => m.awayTeamId)
        // The far-ranked team (#5 vs player #50) should not be chosen when three
        // closely-ranked opponents exist.
        expect(opponents).not.toContain("far")
        expect(new Set(opponents).size).toBe(opponents.length) // no duplicate opponents
    })

    it("is deterministic for a given seed and varies across seeds", () => {
        const a = makeSave(teams, 111)
        const b = makeSave(teams, 111)
        const c = makeSave(teams, 999)
        seedPreseasonFriendlies(a, "player")
        seedPreseasonFriendlies(b, "player")
        seedPreseasonFriendlies(c, "player")
        expect(a.scheduledMatches).toEqual(b.scheduledMatches)
        // seeds affect ids-independent fields (match seed); ids are stable by index.
        expect(a.scheduledMatches.map(m => m.seed)).not.toEqual(c.scheduledMatches.map(m => m.seed))
    })

    it("no-ops when the player team cannot field five players", () => {
        const understrength = [makeTeam("player", 50, 3), makeTeam("opp", 48)]
        const save = makeSave(understrength)
        const added = seedPreseasonFriendlies(save, "player")
        expect(added).toBe(0)
        expect(save.scheduledMatches).toHaveLength(0)
    })

    it("no-ops when there are no eligible opponents", () => {
        const soloValid = [makeTeam("player", 50), makeTeam("weak", 48, 2)]
        const save = makeSave(soloValid)
        const added = seedPreseasonFriendlies(save, "player")
        expect(added).toBe(0)
    })

    it("no-ops for an unknown player team id", () => {
        const save = makeSave(teams)
        expect(seedPreseasonFriendlies(save, "nope")).toBe(0)
        expect(save.scheduledMatches).toHaveLength(0)
    })
})
