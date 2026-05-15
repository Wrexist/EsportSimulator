/**
 * Coverage for engine/match-engine.ts.
 *
 * MatchEngine.simulateMatch is the entry point every scheduled match runs
 * through. It adapts save-shape data into the SimulationEngineV2 input
 * shape, derives a seed from the passed RNG, applies talent passive
 * effects (anti_strat reduces opposing tactical bonus; morale_floor
 * enforces a minimum morale), and delegates the actual simulation.
 *
 * The adapter logic was untested before — a regression to any of the
 * mappings or the seed derivation would silently corrupt match results.
 */

import { matchEngine } from "@/engine/match-engine"
import { SeededRNG } from "@/engine/rng"
import type { MatchSaveData, TeamSaveData, PlayerSaveData, StaffSaveData } from "@/engine/save-types"

function makeMatch(overrides: Partial<MatchSaveData> = {}): MatchSaveData {
    return {
        id: "m1",
        homeTeamId: "home",
        awayTeamId: "away",
        tournamentId: "tour1",
        stage: "Group Stage",
        week: 1,
        day: 5,
        format: "BO1",
        seed: 0,
        ...overrides,
    } as MatchSaveData
}

function makeTeam(id: string): TeamSaveData {
    return {
        id,
        name: `Team ${id}`,
        shortName: id.toUpperCase().slice(0, 4),
        budget: 100_000,
        rosterIds: [],
        staffIds: [],
        trophies: [],
        facilities: [],
        sponsors: [],
        fanbase: 1000,
        playstyle: "default",
        reputation: 50,
        region: "EU",
        facilitiesLevel: 1,
    } as unknown as TeamSaveData
}

function makePlayer(id: string, overrides: Partial<PlayerSaveData> = {}): PlayerSaveData {
    return {
        id,
        nickname: id,
        firstName: id,
        lastName: "Player",
        age: 22,
        nationality: "US",
        role: "Rifler",
        rifle: 70, awp: 50, pistol: 65, grenades: 60, creativity: 55, clutch: 60,
        tactic: 60, leader: 50, teamwork: 65, reaction: 65, eyesight: 70,
        morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        salary: 1000, contractWeeks: 52,
        skill: 70, potential: 85,
        ...overrides,
    } as unknown as PlayerSaveData
}

function makeRoster(prefix: string): PlayerSaveData[] {
    return Array.from({ length: 5 }, (_, i) => makePlayer(`${prefix}_p${i}`))
}

describe("MatchEngine.simulateMatch", () => {
    test("same teams + same seed produce identical results (determinism)", () => {
        const match = makeMatch()
        const home = makeTeam("home")
        const away = makeTeam("away")
        const homePlayers = makeRoster("home")
        const awayPlayers = makeRoster("away")

        const result1 = matchEngine.simulateMatch(match, home, away, homePlayers, awayPlayers, new SeededRNG(42))
        const result2 = matchEngine.simulateMatch(match, home, away, homePlayers, awayPlayers, new SeededRNG(42))

        expect(result1.homeScore).toBe(result2.homeScore)
        expect(result1.awayScore).toBe(result2.awayScore)
    })

    test("different seeds produce different results", () => {
        const match = makeMatch({ format: "BO3" })
        const home = makeTeam("home")
        const away = makeTeam("away")
        const homePlayers = makeRoster("home")
        const awayPlayers = makeRoster("away")

        // Sample several seeds — at least some pair should disagree.
        const results = [1, 2, 3, 4, 5].map(seed =>
            matchEngine.simulateMatch(match, home, away, homePlayers, awayPlayers, new SeededRNG(seed))
        )
        const distinctScores = new Set(results.map(r => `${r.homeScore}:${r.awayScore}`))
        expect(distinctScores.size).toBeGreaterThan(1)
    })

    test("BO1 always produces a 1-0 or 0-1 score", () => {
        const match = makeMatch({ format: "BO1" })
        const home = makeTeam("home")
        const away = makeTeam("away")
        const homePlayers = makeRoster("home")
        const awayPlayers = makeRoster("away")

        for (let seed = 1; seed <= 10; seed++) {
            const r = matchEngine.simulateMatch(match, home, away, homePlayers, awayPlayers, new SeededRNG(seed))
            const total = r.homeScore + r.awayScore
            expect(total).toBe(1)
        }
    })

    test("BO3 max score is 2 for the winner; series ends at 2 wins", () => {
        const match = makeMatch({ format: "BO3" })
        const home = makeTeam("home")
        const away = makeTeam("away")
        const homePlayers = makeRoster("home")
        const awayPlayers = makeRoster("away")

        for (let seed = 1; seed <= 10; seed++) {
            const r = matchEngine.simulateMatch(match, home, away, homePlayers, awayPlayers, new SeededRNG(seed))
            expect(Math.max(r.homeScore, r.awayScore)).toBe(2)
            // Loser has 0, 1, or 2 (sweep or close). Total at most 3.
            expect(r.homeScore + r.awayScore).toBeLessThanOrEqual(3)
        }
    })

    test("anti_strat talent reduces opponent tactical bonus (smoke test — no crash)", () => {
        const match = makeMatch()
        const home = makeTeam("home")
        const away = makeTeam("away")
        const homePlayers = makeRoster("home")
        const awayPlayers = makeRoster("away")
        // Home analyst has anti_strat — should reduce away's tactical bonus.
        const homeStaff: StaffSaveData[] = [{
            id: "ana1", teamId: "home", name: "Ana", role: "analyst",
            salaryPerWeek: 1000, level: 3, contractEndWeek: 52, stats: {} as any,
            unlockedTalentIds: ["analyst_basics", "analyst_demo", "analyst_counter"],
        } as any]

        const r = matchEngine.simulateMatch(
            match, home, away, homePlayers, awayPlayers, new SeededRNG(7),
            0.5, // home tactical
            0.5, // away tactical — should be reduced by anti_strat
            homeStaff,
            [],
        )

        // Talent application path doesn't crash; result is valid.
        expect(r.homeScore + r.awayScore).toBeGreaterThan(0)
    })

    test("morale_floor talent doesn't crash on rosters with low morale", () => {
        const match = makeMatch()
        const home = makeTeam("home")
        const away = makeTeam("away")
        const homePlayers = makeRoster("home").map(p => ({ ...p, morale: 20 }))
        const awayPlayers = makeRoster("away")
        const homeStaff: StaffSaveData[] = [{
            id: "psy1", teamId: "home", name: "Psy", role: "psychologist",
            salaryPerWeek: 1000, level: 1, contractEndWeek: 52, stats: {} as any,
            unlockedTalentIds: ["psych_basics"],
        } as any]

        const r = matchEngine.simulateMatch(
            match, home, away, homePlayers, awayPlayers, new SeededRNG(99),
            0, 0, homeStaff, [],
        )
        expect(r.homeScore + r.awayScore).toBeGreaterThan(0)
    })

    test("uneven team strength: stronger team wins more often across seeds", () => {
        const match = makeMatch({ format: "BO1" })
        const home = makeTeam("home")
        const away = makeTeam("away")
        // Home has 5 elite players; away has 5 weak ones.
        const homePlayers = Array.from({ length: 5 }, (_, i) =>
            makePlayer(`hp${i}`, { rifle: 95, awp: 90, skill: 95, reaction: 90, tactic: 90 } as any))
        const awayPlayers = Array.from({ length: 5 }, (_, i) =>
            makePlayer(`ap${i}`, { rifle: 30, awp: 25, skill: 30, reaction: 30, tactic: 25 } as any))

        let homeWins = 0
        for (let seed = 1; seed <= 30; seed++) {
            const r = matchEngine.simulateMatch(match, home, away, homePlayers, awayPlayers, new SeededRNG(seed))
            if (r.homeScore > r.awayScore) homeWins++
        }
        // Should be a strong majority — not a coin flip.
        expect(homeWins).toBeGreaterThan(20)
    })
})
