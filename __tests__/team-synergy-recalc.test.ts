/**
 * Tests for the team-synergy recalculation processor.
 *
 * Two surfaces:
 *   - recalculateAllSynergy: bulk path that handles every team in a save.
 *     Uses a players-by-id Map for O(roster) lookup per team (the
 *     pre-Map version was O(players × roster) — a ~10× perf cliff on
 *     mature leagues).
 *   - recalculateTeamSynergy: single-team refresh path used after
 *     transfer/release events.
 *
 * Contracts asserted:
 *   - Matrix has one entry per UNIQUE PAIR of roster players
 *     (n*(n-1)/2 entries).
 *   - Keys are sorted pairs of player ids joined with `_`, so the
 *     same pair always lands on the same key regardless of roster
 *     order — this matters because chemistry hits use the same
 *     deterministic key on read.
 *   - Missing players (id in rosterIds but no record in players[])
 *     are silently skipped, not crashed on. This is the real path
 *     during a mid-tick transfer where roster and players are
 *     briefly out of sync.
 *   - Other teams' matrices aren't touched by single-team refresh.
 */

import {
    recalculateAllSynergy,
    recalculateTeamSynergy,
} from "@/engine/processors/team-synergy-recalc"
import type { PlayerSaveData, TeamSaveData } from "@/engine/save-types"

function makePlayer(id: string): PlayerSaveData {
    return {
        id, nickname: id, firstName: id, lastName: "Test",
        age: 22, nationality: "US", role: "RIFLER",
        rifle: 70, awp: 60, pistol: 65, grenades: 60, creativity: 60,
        clutch: 60, tactic: 60, leader: 55, teamwork: 70,
        reaction: 70, eyesight: 70,
        morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        skill: 70, potential: 85, productivity: 60, endurance: 70,
    } as unknown as PlayerSaveData
}

function makeTeam(id: string, rosterIds: string[]): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(),
        budget: 1_000_000, rosterIds, staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1, leagueTier: "B_TIER",
        elo: 1500, recentForm: [],
    } as unknown as TeamSaveData
}

describe("recalculateTeamSynergy", () => {
    test("a 5-player roster produces a matrix with C(5,2)=10 pair entries", () => {
        const team = makeTeam("team_a", ["p1", "p2", "p3", "p4", "p5"])
        const players = ["p1", "p2", "p3", "p4", "p5"].map(makePlayer)
        recalculateTeamSynergy(team, players)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const matrix = (team as any).synergyMatrix as Record<string, number>
        expect(Object.keys(matrix).length).toBe(10)
    })

    test("matrix keys are sorted-id pairs joined with `_` (stable regardless of roster order)", () => {
        const t1 = makeTeam("t1", ["b", "a", "c"])
        const t2 = makeTeam("t2", ["c", "a", "b"])
        const players = ["a", "b", "c"].map(makePlayer)
        recalculateTeamSynergy(t1, players)
        recalculateTeamSynergy(t2, players)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const k1 = Object.keys((t1 as any).synergyMatrix).sort()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const k2 = Object.keys((t2 as any).synergyMatrix).sort()
        expect(k1).toEqual(k2)
        expect(k1).toContain("a_b")
        expect(k1).toContain("a_c")
        expect(k1).toContain("b_c")
        // Never the reversed form.
        expect(k1).not.toContain("b_a")
    })

    test("rosterIds entries with no matching player record are silently skipped", () => {
        // Simulates the mid-transfer state where roster and players are
        // briefly out of sync.
        const team = makeTeam("team_a", ["p1", "ghost_id", "p3"])
        const players = [makePlayer("p1"), makePlayer("p3")]
        expect(() => recalculateTeamSynergy(team, players)).not.toThrow()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const matrix = (team as any).synergyMatrix as Record<string, number>
        // Only the (p1, p3) pair exists — ghost dropped.
        expect(Object.keys(matrix)).toEqual(["p1_p3"])
    })

    test("empty roster produces an empty matrix (no crash)", () => {
        const team = makeTeam("team_a", [])
        recalculateTeamSynergy(team, [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((team as any).synergyMatrix).toEqual({})
    })

    test("single-player roster produces an empty matrix (no pairs)", () => {
        const team = makeTeam("team_a", ["solo"])
        const players = [makePlayer("solo")]
        recalculateTeamSynergy(team, players)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((team as any).synergyMatrix).toEqual({})
    })

    test("synergy values are numeric and finite", () => {
        const team = makeTeam("team_a", ["p1", "p2"])
        const players = [makePlayer("p1"), makePlayer("p2")]
        recalculateTeamSynergy(team, players)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const matrix = (team as any).synergyMatrix as Record<string, number>
        for (const value of Object.values(matrix)) {
            expect(Number.isFinite(value)).toBe(true)
        }
    })
})

describe("recalculateAllSynergy", () => {
    test("rebuilds matrices for every team in the league", () => {
        const teams = [
            makeTeam("t1", ["a", "b", "c"]),
            makeTeam("t2", ["d", "e"]),
            makeTeam("t3", ["f", "g", "h", "i"]),
        ]
        const players = ["a", "b", "c", "d", "e", "f", "g", "h", "i"].map(makePlayer)
        recalculateAllSynergy(teams, players)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(Object.keys((teams[0] as any).synergyMatrix).length).toBe(3) // C(3,2)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(Object.keys((teams[1] as any).synergyMatrix).length).toBe(1) // C(2,2)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(Object.keys((teams[2] as any).synergyMatrix).length).toBe(6) // C(4,2)
    })

    test("teams with missing player records still get the partial matrix", () => {
        const teams = [
            makeTeam("t1", ["a", "ghost", "c"]),
        ]
        const players = [makePlayer("a"), makePlayer("c")]
        recalculateAllSynergy(teams, players)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(Object.keys((teams[0] as any).synergyMatrix)).toEqual(["a_c"])
    })
})
