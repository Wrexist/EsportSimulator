/**
 * League schedules.
 *
 * Pre-Steam audit: compressed rounds once put several BO1s for a club on the
 * same week with no regard to the day. A round-robin round has every club
 * play once, so the rounds that share a week now go on different days.
 *
 * COMP-10 (audit 2026-11-17): one round a week stretched a 23-round "6 wk
 * event" over weeks 20–42. A league now plays inside the window the calendar
 * lists (start .. endWeek), a few rounds a week on their own days, in round
 * order; a league with fewer rounds than weeks keeps one round a week.
 */

import { leagueRoundDays, setupLeagueSchedule } from "@/engine/tournament/league-schedule"
import { SeededRNG } from "@/engine/rng"
import type { GameSave, MatchSaveData, TournamentSaveData } from "@/engine/save-types"

function makeSave(): GameSave {
    return { scheduledMatches: [], completedMatches: [], tournaments: [], currentWeek: 1, currentDay: 0, timeMode: "WEEKLY" } as unknown as GameSave
}

function makeTournament(startWeek: number, endWeek: number): TournamentSaveData {
    return {
        id: "lg",
        startWeek,
        endWeek,
        playoffBracket: [],
    } as unknown as TournamentSaveData
}

function maxMatchesPerTeamPerDay(save: GameSave): number {
    const counts = new Map<string, number>()
    let max = 0
    for (const m of save.scheduledMatches) {
        for (const team of [m.homeTeamId, m.awayTeamId]) {
            const key = `${team}:${m.week}:${m.day}`
            const n = (counts.get(key) || 0) + 1
            counts.set(key, n)
            if (n > max) max = n
        }
    }
    return max
}

function maxMatchesPerTeamPerWeek(save: GameSave): number {
    const counts = new Map<string, number>()
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

const roundOf = (m: MatchSaveData, perRound: number) => Math.floor(Number(m.id.split("_league_")[1]) / perRound)

describe("setupLeagueSchedule — plays inside its listed window (COMP-10)", () => {
    test("24 clubs in a 6-week window (Global Pro League Finals) finish in those 6 weeks, never twice a day", () => {
        const save = makeSave()
        save.currentWeek = 20
        const tournament = makeTournament(20, 26)
        const teamIds = Array.from({ length: 24 }, (_, i) => `t${i}`)
        setupLeagueSchedule(save, tournament, teamIds, new SeededRNG(7))

        expect(save.scheduledMatches.length).toBe(24 * 23 / 2)
        const weeks = save.scheduledMatches.map(m => m.week)
        expect(Math.min(...weeks)).toBe(20)
        expect(Math.max(...weeks)).toBe(25)
        expect(tournament.endWeek).toBe(26)
        expect(maxMatchesPerTeamPerDay(save)).toBe(1)
        expect(maxMatchesPerTeamPerWeek(save)).toBe(4)
    })

    test("rounds sharing a week are played in round order on their own days", () => {
        const save = makeSave()
        const tournament = makeTournament(1, 4)
        const teamIds = Array.from({ length: 12 }, (_, i) => `t${i}`)
        setupLeagueSchedule(save, tournament, teamIds, new SeededRNG(42))

        expect(save.scheduledMatches.length).toBe(66)
        expect(Math.max(...save.scheduledMatches.map(m => m.week))).toBeLessThanOrEqual(3)
        expect(maxMatchesPerTeamPerDay(save)).toBe(1)
        // Every match of one round shares a day; a later round of the same week is on a later day.
        const dayOfRound = new Map<number, Set<string>>()
        for (const m of save.scheduledMatches) {
            const r = roundOf(m, 6)
            dayOfRound.set(r, (dayOfRound.get(r) ?? new Set()).add(`${m.week}:${m.day}`))
        }
        for (const days of dayOfRound.values()) expect(days.size).toBe(1)
        const at = (r: number) => [...dayOfRound.get(r)!][0].split(":").map(Number)
        for (let r = 1; r < 11; r++) {
            const [w0, d0] = at(r - 1), [w1, d1] = at(r)
            expect(w1 > w0 || (w1 === w0 && d1 > d0)).toBe(true)
        }
    })

    test("a league that starts late in the season still ends inside its window", () => {
        const save = makeSave()
        save.currentWeek = 40
        const tournament = makeTournament(40, 46)
        const teamIds = Array.from({ length: 24 }, (_, i) => `t${i}`)
        setupLeagueSchedule(save, tournament, teamIds, new SeededRNG(7))

        expect(save.scheduledMatches.length).toBe(24 * 23 / 2)
        expect(Math.max(...save.scheduledMatches.map(m => m.week))).toBeLessThanOrEqual(45)
        expect(tournament.endWeek).toBe(46)
    })

    test("fewer rounds than weeks: one round a week, weekend first", () => {
        const save = makeSave()
        const tournament = makeTournament(10, 16)
        setupLeagueSchedule(save, tournament, ["A", "B", "C", "D"], new SeededRNG(1))

        expect(maxMatchesPerTeamPerWeek(save)).toBe(1)
        expect(save.scheduledMatches.every(m => m.day === 5)).toBe(true)
        expect(Math.max(...save.scheduledMatches.map(m => m.week))).toBeLessThan(16)
    })

    test("a club busy on a league day plays that round later in the week, not in the next week", () => {
        const save = makeSave()
        // t0 already plays another event on Tuesday and Thursday of week 1.
        save.scheduledMatches.push(
            { id: "other_1", homeTeamId: "t0", awayTeamId: "x1", tournamentId: "cup", stage: "Quarter-final", week: 1, day: 1, format: "BO3", seed: 1 } as MatchSaveData,
            { id: "other_2", homeTeamId: "t0", awayTeamId: "x2", tournamentId: "cup", stage: "Semi-final", week: 1, day: 3, format: "BO3", seed: 2 } as MatchSaveData,
        )
        const tournament = makeTournament(1, 4)
        setupLeagueSchedule(save, tournament, Array.from({ length: 12 }, (_, i) => `t${i}`), new SeededRNG(3))

        expect(maxMatchesPerTeamPerDay(save)).toBe(1)
        const t0League = save.scheduledMatches.filter(m => m.tournamentId === "lg" && (m.homeTeamId === "t0" || m.awayTeamId === "t0"))
        expect(t0League).toHaveLength(11)
        expect(Math.max(...t0League.map(m => m.week))).toBeLessThanOrEqual(3)
    })
})

describe("leagueRoundDays", () => {
    test("one round a week keeps the default; more rounds start Tue/Thu/Sat/Sun and look later first", () => {
        expect(leagueRoundDays(1, 0)).toBeUndefined()
        expect(leagueRoundDays(2, 0)?.[0]).toBe(2)
        expect(leagueRoundDays(2, 1)?.[0]).toBe(5)
        expect(leagueRoundDays(4, 0)).toEqual([1, 2, 3, 4, 5, 6, 0])
        expect(leagueRoundDays(4, 3)).toEqual([6, 5, 4, 3, 2, 1, 0])
        for (const count of [2, 3, 4, 5, 6, 7]) {
            for (let slot = 0; slot < count; slot++) expect([...leagueRoundDays(count, slot)!].sort()).toEqual([0, 1, 2, 3, 4, 5, 6])
        }
    })
})
