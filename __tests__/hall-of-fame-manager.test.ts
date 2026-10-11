/**
 * Hall of Fame — the one induction path (Phase 5.1).
 *
 * EventProcessor.processRetirements (season end) and
 * processMidSeasonRetirements judge a retiring career with
 * hall-of-fame-manager.ts on real career numbers: official maps and the
 * rounds-weighted rating, official kills, titles won on a roster, Majors,
 * season awards and career matches. The old HallOfFameManager class
 * (proHistory peaks, match-MVP counts, never called) is gone.
 */

import { EventProcessor } from "@/engine/processors/event-processor"
import { hallOfFameAchievements, qualifiesForHallOfFame } from "@/engine/hall-of-fame-manager"
import { SeededRNG } from "@/engine/rng"
import { HALL_OF_FAME_TUNING as HOF } from "@/lib/balance-tuning"
import { createLaunchFixture } from "../scripts/launch/fixtures"
import type { GameSave, PlayerSaveData } from "@/engine/save-types"

function seasonEnd(): GameSave {
    const save = createLaunchFixture("first-week", 52001)
    save.currentWeek = 52 * 4
    return save
}

function veteran(save: GameSave, id: string, overrides: Partial<PlayerSaveData>): PlayerSaveData {
    const base = structuredClone(save.players.find(p => p.id === "qa_free_agent")!)
    const p = { ...base, id, nickname: id, age: 38, matchesPlayed: 120, totalKills: 0, avgRating: 0, majorWins: 0, ...overrides } as PlayerSaveData
    save.players.push(p)
    return p
}

describe("achievements read real career numbers", () => {
    test("each criterion counts once; two induct", () => {
        const routine = { matchesPlayed: 200, totalKills: 1800, avgRating: 1.1, mapsPlayed: 400, majorWins: 0, careerTrophies: 3 }
        expect(hallOfFameAchievements(routine)).toEqual([])
        expect(qualifiesForHallOfFame(routine)).toBe(false)
        const two = { ...routine, careerTrophies: HOF.CAREER_TITLES, totalKills: HOF.CAREER_KILLS }
        expect(hallOfFameAchievements(two)).toHaveLength(2)
        expect(qualifiesForHallOfFame(two)).toBe(true)
    })

    test("standalone careers: two Majors, two season MVPs, or an elite rating over a real career", () => {
        const none = { matchesPlayed: 10, totalKills: 0, avgRating: 0, majorWins: 0 }
        expect(qualifiesForHallOfFame({ ...none, majorWins: HOF.AUTO_MAJOR_WINS })).toBe(true)
        expect(qualifiesForHallOfFame({ ...none, honours: [{ season: 1, award: "MVP" }, { season: 2, award: "MVP" }] })).toBe(true)
        expect(qualifiesForHallOfFame({ ...none, avgRating: HOF.AUTO_RATING, mapsPlayed: HOF.RATING_MIN_MAPS })).toBe(true)
        expect(qualifiesForHallOfFame({ ...none, avgRating: 1.5, mapsPlayed: HOF.RATING_MIN_MAPS - 1 })).toBe(false)
    })
})

describe("retirement induction", () => {
    test("a qualifying retiree is inducted once, with the career that earned it", () => {
        // A qualifying 37-year-old retires on the season-end roll (a qualifying
        // player who reaches 38 becomes a legend who keeps playing); a routine
        // 40-year-old retires outright. First seed where the roll retires him.
        let save!: GameSave, great!: PlayerSaveData, routine!: PlayerSaveData
        for (let seed = 1; seed < 100; seed++) {
            save = seasonEnd()
            great = veteran(save, "hof_great", { age: 37, skill: 20, form: 10, health: 0, mapsPlayed: 320, avgRating: 1.22, totalKills: 2700, careerTrophies: 8, majorWins: 1, seasonLines: [{ season: 1, clubId: "x", maps: 80, rounds: 1800, kills: 1300, deaths: 1100, adr: 82, rating: 1.2, impact: 100 }] })
            routine = veteran(save, "hof_routine", { age: 40, mapsPlayed: 120, avgRating: 1.02, totalKills: 900 })
            EventProcessor.processRetirements(save, new SeededRNG(seed))
            if (great.isRetired) break
        }
        expect(great.isRetired && routine.isRetired).toBe(true)
        expect(great.isLegendary).toBe(true)
        expect(routine.isLegendary).toBeFalsy()
        expect(save.hallOfFame.map(h => h.id)).toEqual(["hof_great"])
        expect(save.hallOfFame[0].career).toMatchObject({ maps: 320, rating: 1.22, kills: 2700, trophies: 8, majors: 1 })
        expect(save.hallOfFame[0].eraStart).toBe(1)
        expect(save.hallOfFame[0].eraEnd).toBe(4)
        expect(save.hallOfFame[0].inductionReasons.map(r => r.label)).toContain("1x Major champion")
    })

    test("an older save's legacy hof_ entry is not inducted twice", () => {
        let save!: GameSave, great!: PlayerSaveData
        for (let seed = 1; seed < 100; seed++) {
            save = seasonEnd()
            great = veteran(save, "hof_twice", { age: 37, skill: 20, form: 10, health: 0, majorWins: 2 })
            save.hallOfFame.push({ id: "hof_hof_twice", name: "x", portraitPath: "", eraStart: 1, eraEnd: 2, primaryRole: "RIFLER", category: "INDUCTED", inductionReasons: [], nationality: "" })
            EventProcessor.processRetirements(save, new SeededRNG(seed))
            if (great.isRetired) break
        }
        expect(great.isRetired).toBe(true)
        expect(save.hallOfFame).toHaveLength(1)
    })
})
