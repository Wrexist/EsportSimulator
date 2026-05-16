/**
 * Tests for HallOfFameManager — the retirement induction system.
 *
 * Eligibility paths (need ≥2 to qualify):
 *   A) Championship: majorWins ≥ 1
 *   B) Individual greatness — multiple MVPs OR peak rank ≤ 3
 *   C) Longevity: 1000+ kills AND avgRating ≥ 1.10
 *
 * Plus mandatory floor: matchesPlayed ≥ 100.
 *
 * processRetirement: respects the eligibility gate, dedupes against
 * the existing hallOfFame array, and surfaces a NEWS event on
 * successful induction.
 */

import { HallOfFameManager } from "@/engine/hall-of-fame-manager"
import type { GameSave, PlayerSaveData } from "@/engine/save-types"

function makePlayer(overrides: Partial<PlayerSaveData> = {}): PlayerSaveData {
    return {
        id: "p1", name: "Test Player", nickname: "test",
        firstName: "Test", lastName: "P",
        portraitPath: null, nationality: "US", role: "RIFLER",
        age: 28, isRetired: true, retirementWeek: 312,
        rifle: 80, awp: 70, pistol: 75, grenades: 70, creativity: 70,
        clutch: 70, tactic: 70, leader: 65, teamwork: 75,
        reaction: 80, eyesight: 80,
        morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 5, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [],
        matchesPlayed: 200, majorWins: 0, totalKills: 500, totalDeaths: 400,
        totalMVPs: 0, avgRating: 1.05,
        skill: 80, potential: 90, productivity: 70, endurance: 70,
        hltvHistory: [],
        ...overrides,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as PlayerSaveData
}

describe("checkEligibility — mandatory floor", () => {
    test("returns null when matchesPlayed < 100", () => {
        const p = makePlayer({ matchesPlayed: 50, majorWins: 5, totalMVPs: 5 })
        expect(HallOfFameManager.checkEligibility(p, 2030)).toBeNull()
    })

    test("returns null when player has matches but no qualifying paths", () => {
        const p = makePlayer({
            matchesPlayed: 500, majorWins: 0, totalMVPs: 1, totalKills: 100, avgRating: 0.95,
        })
        expect(HallOfFameManager.checkEligibility(p, 2030)).toBeNull()
    })
})

describe("checkEligibility — path A (Championship)", () => {
    test("1 major + 2 MVPs → inducted (2 reasons)", () => {
        const p = makePlayer({
            matchesPlayed: 200, majorWins: 1, totalMVPs: 2,
        })
        const entry = HallOfFameManager.checkEligibility(p, 2030)
        expect(entry).not.toBeNull()
        expect(entry!.inductionReasons.some(r => r.type === "CHAMPION")).toBe(true)
        expect(entry!.inductionReasons.some(r => r.type === "MVP")).toBe(true)
    })

    test("1 major alone is NOT enough (need 2 reasons)", () => {
        const p = makePlayer({
            matchesPlayed: 200, majorWins: 1, totalMVPs: 1,
            totalKills: 50, avgRating: 1.0,
        })
        expect(HallOfFameManager.checkEligibility(p, 2030)).toBeNull()
    })
})

describe("checkEligibility — path B (Individual Greatness)", () => {
    test("2 MVPs + peak rank #3 → inducted", () => {
        const p = makePlayer({
            matchesPlayed: 200, majorWins: 0, totalMVPs: 2,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            hltvHistory: [{ year: 2024, rank: 3 }] as any,
        })
        const entry = HallOfFameManager.checkEligibility(p, 2030)
        expect(entry).not.toBeNull()
        expect(entry!.inductionReasons.some(r => r.type === "MVP")).toBe(true)
        expect(entry!.inductionReasons.some(r => r.type === "IMPACT")).toBe(true)
    })

    test("peak rank #4 is NOT 'Elite' (threshold is top 3)", () => {
        const p = makePlayer({
            matchesPlayed: 200, majorWins: 0, totalMVPs: 1,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            hltvHistory: [{ year: 2024, rank: 4 }] as any,
        })
        const entry = HallOfFameManager.checkEligibility(p, 2030)
        expect(entry).toBeNull()
    })

    test("uses MIN rank across history (peak career achievement)", () => {
        const p = makePlayer({
            matchesPlayed: 200, majorWins: 0, totalMVPs: 2,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            hltvHistory: [
                { year: 2020, rank: 50 },
                { year: 2021, rank: 1 }, // career peak
                { year: 2022, rank: 99 },
            ] as any,
        })
        const entry = HallOfFameManager.checkEligibility(p, 2030)
        expect(entry).not.toBeNull()
        expect(entry!.inductionReasons.some(r => r.type === "IMPACT" && r.label.includes("#1"))).toBe(true)
    })
})

describe("checkEligibility — path C (Longevity)", () => {
    test("1000 kills AND avgRating ≥ 1.10 → inducted (with another path)", () => {
        const p = makePlayer({
            matchesPlayed: 200, majorWins: 1, totalKills: 1500, avgRating: 1.15,
        })
        const entry = HallOfFameManager.checkEligibility(p, 2030)
        expect(entry).not.toBeNull()
        expect(entry!.inductionReasons.some(r => r.type === "LONGEVITY")).toBe(true)
    })

    test("1000 kills WITHOUT elite rating doesn't trigger longevity reason", () => {
        const p = makePlayer({
            matchesPlayed: 200, majorWins: 1, totalKills: 1500, avgRating: 1.05,
            totalMVPs: 2, // ensures eligibility through MVPs
        })
        const entry = HallOfFameManager.checkEligibility(p, 2030)
        expect(entry).not.toBeNull()
        expect(entry!.inductionReasons.some(r => r.type === "LONGEVITY")).toBe(false)
    })

    test("Elite rating WITHOUT 1000 kills doesn't trigger longevity reason", () => {
        const p = makePlayer({
            matchesPlayed: 200, majorWins: 1, totalKills: 500, avgRating: 1.20,
            totalMVPs: 2,
        })
        const entry = HallOfFameManager.checkEligibility(p, 2030)
        expect(entry!.inductionReasons.some(r => r.type === "LONGEVITY")).toBe(false)
    })
})

describe("checkEligibility — induction entry shape", () => {
    test("includes id, name, role, nationality, category, and era estimate", () => {
        const p = makePlayer({
            id: "legend_1", name: "Legend", nationality: "Brazil", role: "AWPER",
            matchesPlayed: 200, majorWins: 2, totalMVPs: 3,
        })
        const entry = HallOfFameManager.checkEligibility(p, 2030)
        expect(entry!.id).toBe("legend_1")
        expect(entry!.name).toBe("Legend")
        expect(entry!.nationality).toBe("Brazil")
        expect(entry!.primaryRole).toBe("AWPER")
        expect(entry!.category).toBe("INDUCTED")
        // Era estimate: currentYear - floor(matchesPlayed/50) = 2030 - 4 = 2026
        expect(entry!.eraStart).toBe(2026)
        expect(entry!.eraEnd).toBe(2030)
    })
})

describe("processRetirement", () => {
    function makeSave(overrides: Partial<GameSave> = {}): GameSave {
        return {
            currentWeek: 312,
            gameStartDate: new Date("2024-01-01").toISOString(),
            teams: [], players: [], contracts: [], staff: [],
            scheduledMatches: [], completedMatches: [],
            scheduledActivities: [],
            financeLedger: [], eventsLog: [], newsFeed: [],
            tournaments: [], tournamentQualifications: [],
            hallOfFame: [],
            marketStaff: [], academyPlayers: [],
            playerTeamId: "player", lastRngSeed: 1,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(overrides as any),
        } as unknown as GameSave
    }

    test("non-retired player is a no-op", () => {
        const save = makeSave()
        const p = makePlayer({ isRetired: false, majorWins: 5, totalMVPs: 5 })
        HallOfFameManager.processRetirement(save, p)
        expect(save.hallOfFame.length).toBe(0)
    })

    test("eligible retiring player gets inducted + event surfaces", () => {
        const save = makeSave()
        const p = makePlayer({ majorWins: 2, totalMVPs: 3 })
        HallOfFameManager.processRetirement(save, p)
        expect(save.hallOfFame.length).toBe(1)
        const evt = save.eventsLog.find(e => e.id.startsWith("hof_induct_"))
        expect(evt).toBeDefined()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((evt as any).data.text).toContain("Hall of Fame")
    })

    test("dedup: re-running on an already-inducted player is a no-op", () => {
        const save = makeSave()
        const p = makePlayer({ majorWins: 2, totalMVPs: 3 })
        HallOfFameManager.processRetirement(save, p)
        HallOfFameManager.processRetirement(save, p)
        expect(save.hallOfFame.length).toBe(1)
        // Also only one event (not double-logged).
        const evts = save.eventsLog.filter(e => e.id.startsWith("hof_induct_"))
        expect(evts.length).toBe(1)
    })

    test("ineligible retiring player is NOT inducted (still no-op)", () => {
        const save = makeSave()
        const p = makePlayer({ matchesPlayed: 50, majorWins: 0 })
        HallOfFameManager.processRetirement(save, p)
        expect(save.hallOfFame.length).toBe(0)
    })
})
