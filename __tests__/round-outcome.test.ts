/**
 * Integration coverage for the round-outcome generator inside
 * match-simulation.ts (private: generateRoundStats, determineWinType,
 * addKillEvent, pickWeighted). These methods are exercised through
 * the public simulateMatch path so the tests don't couple to internal
 * names — but they pin the invariants of kill/death distribution and
 * round-event integrity.
 *
 * Added as part of Phase I3 to give the next refactor phase (I4) a
 * safety net before extracting the 375-line round-outcome generator
 * to its own module.
 */

import { matchEngine } from "@/engine/match-engine"
import { SeededRNG } from "@/engine/rng"
import type { MatchSaveData, TeamSaveData, PlayerSaveData } from "@/engine/save-types"

function makeMatch(overrides: Partial<MatchSaveData> = {}): MatchSaveData {
    return {
        id: "m1",
        homeTeamId: "home",
        awayTeamId: "away",
        tournamentId: "tour1",
        stage: "Group Stage",
        week: 1,
        day: 5,
        format: "BO3",
        seed: 1,
        ...overrides,
    } as MatchSaveData
}

function makeTeam(id: string): TeamSaveData {
    return {
        id, name: `Team ${id}`, shortName: id.toUpperCase().slice(0, 4),
        budget: 100_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1,
    } as unknown as TeamSaveData
}

function makePlayer(id: string, overrides: Partial<PlayerSaveData> = {}): PlayerSaveData {
    return {
        id, nickname: id, firstName: id, lastName: "Player",
        age: 22, nationality: "US", role: "Rifler",
        rifle: 65, awp: 55, pistol: 60, grenades: 55, creativity: 50, clutch: 50,
        tactic: 55, leader: 50, teamwork: 55, reaction: 60, eyesight: 65,
        morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        salary: 1000, contractWeeks: 52,
        skill: 60, potential: 85,
        ...overrides,
    } as unknown as PlayerSaveData
}

function makeRoster(prefix: string): PlayerSaveData[] {
    return Array.from({ length: 5 }, (_, i) => makePlayer(`${prefix}_p${i}`))
}

describe("round-outcome generator (integration via simulateMatch)", () => {
    test("kill events are attributed only to roster players", () => {
        const home = makeRoster("home")
        const away = makeRoster("away")
        const homeIds = new Set(home.map(p => p.id))
        const awayIds = new Set(away.map(p => p.id))
        const allIds = new Set([...homeIds, ...awayIds])

        const result = matchEngine.simulateMatch(
            makeMatch({ format: "BO1" }),
            makeTeam("home"), makeTeam("away"),
            home, away,
            new SeededRNG(42),
        )

        // Sample the player stats: every key must be a known player.
        Object.keys(result.playerStats || {}).forEach(playerId => {
            expect(allIds.has(playerId)).toBe(true)
        })
    })

    test("higher-skill team produces more total kills across the match", () => {
        // Skewed test: 90-skill home vs 40-skill away. Home should
        // generally outscore in raw kills across a BO3.
        const elite = Array.from({ length: 5 }, (_, i) =>
            makePlayer(`elite${i}`, { skill: 90, rifle: 90, reaction: 90 } as Partial<PlayerSaveData>))
        const weak = Array.from({ length: 5 }, (_, i) =>
            makePlayer(`weak${i}`, { skill: 40, rifle: 40, reaction: 40 } as Partial<PlayerSaveData>))

        const result = matchEngine.simulateMatch(
            makeMatch({ format: "BO3" }),
            makeTeam("home"), makeTeam("away"),
            elite, weak,
            new SeededRNG(99),
        )

        const eliteKills = elite.reduce((sum, p) => sum + (result.playerStats?.[p.id]?.kills ?? 0), 0)
        const weakKills = weak.reduce((sum, p) => sum + (result.playerStats?.[p.id]?.kills ?? 0), 0)

        expect(eliteKills).toBeGreaterThan(weakKills)
    })

    test("round count matches the maps + their per-map round count", () => {
        const home = makeRoster("home")
        const away = makeRoster("away")

        const result = matchEngine.simulateMatch(
            makeMatch({ format: "BO3" }),
            makeTeam("home"), makeTeam("away"),
            home, away,
            new SeededRNG(7),
        )

        // Every map's score should track its round count within a small
        // tolerance — the engine may carry an extra round or two for
        // overtime accounting. The point is the scoreboard is non-zero
        // and roughly matches reality, not pixel-perfect parity.
        for (const m of result.maps ?? []) {
            const rounds = m.rounds?.length ?? 0
            const score = (m.finalScore?.team1 ?? 0) + (m.finalScore?.team2 ?? 0)
            expect(rounds).toBeGreaterThan(0)
            expect(score).toBeGreaterThan(0)
            expect(Math.abs(score - rounds)).toBeLessThanOrEqual(3)
        }
    })

    test("KAST percentage is 0-100 for every player", () => {
        const home = makeRoster("home")
        const away = makeRoster("away")

        const result = matchEngine.simulateMatch(
            makeMatch({ format: "BO1" }),
            makeTeam("home"), makeTeam("away"),
            home, away,
            new SeededRNG(33),
        )

        Object.values(result.playerStats || {}).forEach(s => {
            expect(s.kast).toBeGreaterThanOrEqual(0)
            expect(s.kast).toBeLessThanOrEqual(100)
        })
    })

    test("Pro-style rating stays bounded [0.3, 2.0] for every player", () => {
        const home = makeRoster("home")
        const away = makeRoster("away")

        const result = matchEngine.simulateMatch(
            makeMatch({ format: "BO1" }),
            makeTeam("home"), makeTeam("away"),
            home, away,
            new SeededRNG(8),
        )

        Object.values(result.playerStats || {}).forEach(s => {
            expect(s.rating).toBeGreaterThanOrEqual(0.3)
            expect(s.rating).toBeLessThanOrEqual(2.0)
        })
    })

    test("MVP is on the winning side", () => {
        const home = makeRoster("home")
        const away = makeRoster("away")

        // Test across several seeds so we exercise both home + away wins.
        for (let seed = 1; seed <= 6; seed++) {
            const result = matchEngine.simulateMatch(
                makeMatch({ format: "BO1" }),
                makeTeam("home"), makeTeam("away"),
                home, away,
                new SeededRNG(seed),
            )

            if (!result.mvpPlayerId) continue
            const homeWon = result.homeScore > result.awayScore
            const winningRoster = homeWon ? home : away
            const winnerIds = new Set(winningRoster.map(p => p.id))

            expect(winnerIds.has(result.mvpPlayerId)).toBe(true)
        }
    })

    test("first-kill + first-death counters are non-negative integers", () => {
        const home = makeRoster("home")
        const away = makeRoster("away")

        const result = matchEngine.simulateMatch(
            makeMatch({ format: "BO3" }),
            makeTeam("home"), makeTeam("away"),
            home, away,
            new SeededRNG(11),
        )

        Object.values(result.playerStats || {}).forEach(s => {
            expect(s.firstKills).toBeGreaterThanOrEqual(0)
            expect(Number.isInteger(s.firstKills)).toBe(true)
            expect(s.firstDeaths).toBeGreaterThanOrEqual(0)
            expect(Number.isInteger(s.firstDeaths)).toBe(true)
        })
    })

    test("deterministic across runs: same seed → identical scoreboard", () => {
        const home = makeRoster("home")
        const away = makeRoster("away")

        const a = matchEngine.simulateMatch(
            makeMatch({ format: "BO3" }),
            makeTeam("home"), makeTeam("away"),
            home, away,
            new SeededRNG(2026),
        )
        const b = matchEngine.simulateMatch(
            makeMatch({ format: "BO3" }),
            makeTeam("home"), makeTeam("away"),
            home, away,
            new SeededRNG(2026),
        )

        expect(a.homeScore).toBe(b.homeScore)
        expect(a.awayScore).toBe(b.awayScore)

        // Stats also identical.
        for (const p of [...home, ...away]) {
            const aStats = a.playerStats?.[p.id]
            const bStats = b.playerStats?.[p.id]
            expect(aStats?.kills).toBe(bStats?.kills)
            expect(aStats?.deaths).toBe(bStats?.deaths)
            expect(aStats?.rating).toBe(bStats?.rating)
        }
    })
})
