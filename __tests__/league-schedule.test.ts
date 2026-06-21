/**
 * Pre-Steam audit: round-robin schedule compression could place several rounds
 * in one week, so a team got up to 4 BO1s in a single week (only the first
 * playable; the rest auto-sim, and +40 fatigue/-60 energy in one tick). When the
 * rounds fit inside the season we now place one round per week (no team is ever
 * double-booked); when they wouldn't fit we keep the old compression so nothing
 * overruns into the next season's instance.
 */

import { setupLeagueSchedule } from "@/engine/tournament/league-schedule"
import { SeededRNG } from "@/engine/rng"
import type { GameSave, TournamentSaveData } from "@/engine/save-types"

function makeSave(): GameSave {
    return { scheduledMatches: [] } as unknown as GameSave
}

function makeTournament(startWeek: number, endWeek: number): TournamentSaveData {
    return {
        id: "lg",
        startWeek,
        endWeek,
        playoffBracket: [],
    } as unknown as TournamentSaveData
}

function maxMatchesPerTeamPerWeek(save: GameSave): number {
    const counts = new Map<string, number>() // `${team}:${week}` → n
    let max = 0
    for (const m of save.scheduledMatches) {
        for (const team of [m.homeTeamId, m.awayTeamId]) {
            const key = `${team}:${m.week}`
            const n = (counts.get(key) || 0) + 1
            counts.set(key, n)
            if (n > max) max = n
        }
    }
    return max
}

describe("setupLeagueSchedule — no same-week double-booking", () => {
    test("a league whose rounds fit the season plays one round per week", () => {
        const save = makeSave()
        // 12 teams, duration 3 weeks (would compress ~4 rounds/week pre-fix).
        const tournament = makeTournament(1, 4)
        const teamIds = Array.from({ length: 12 }, (_, i) => `t${i}`)
        setupLeagueSchedule(save, tournament, teamIds, new SeededRNG(42))

        // Full round-robin: 12*11/2 = 66 matches; each team exactly once per week.
        expect(save.scheduledMatches.length).toBe(66)
        expect(maxMatchesPerTeamPerWeek(save)).toBe(1)
        // Window extended to cover all 11 rounds, still inside the season.
        const lastWeek = Math.max(...save.scheduledMatches.map(m => m.week))
        expect(lastWeek).toBe(11) // startWeek 1 + (11 rounds - 1)
        expect(tournament.endWeek).toBeGreaterThanOrEqual(lastWeek)
    })

    test("a league that can't fit the season keeps compression (no overrun)", () => {
        const save = makeSave()
        // 24 teams (23 rounds) starting late: 40 + 22 = 62 > season end (52).
        const tournament = makeTournament(40, 46)
        const teamIds = Array.from({ length: 24 }, (_, i) => `t${i}`)
        setupLeagueSchedule(save, tournament, teamIds, new SeededRNG(7))

        expect(save.scheduledMatches.length).toBe(24 * 23 / 2)
        // Fallback compresses into the duration window — nothing overruns the season.
        const lastWeek = Math.max(...save.scheduledMatches.map(m => m.week))
        expect(lastWeek).toBeLessThanOrEqual(52)
    })
})
