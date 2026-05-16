/**
 * Coverage for engine/match/apply-talents.ts (Phase H4).
 *
 * Pins the centralised pre-match talent application that match-engine,
 * match-simulation-slice, and useLiveMatch all now share. Catches the
 * exact class of bug this helper was created to fix: a new talent
 * added to one path but not the others.
 */

import { applyPreMatchTalents } from "@/engine/match/apply-talents"

function makePlayer(morale = 50) {
    return { morale }
}

function makeStaff(role: string, unlockedTalentIds: string[]) {
    return { role, unlockedTalentIds }
}

describe("applyPreMatchTalents", () => {
    test("no staff → no mutations, anti_strat values are 0", () => {
        const home = [makePlayer(50), makePlayer(60)]
        const away = [makePlayer(70)]

        const result = applyPreMatchTalents(home, away, [], [])

        expect(home[0].morale).toBe(50)
        expect(home[1].morale).toBe(60)
        expect(away[0].morale).toBe(70)
        expect(result.homeAntiStrat).toBe(0)
        expect(result.awayAntiStrat).toBe(0)
    })

    test("tilt_immunity talent lifts player morale below 40 up to the floor", () => {
        const home = [makePlayer(20), makePlayer(60)]
        const away = [makePlayer(50)]
        // Psychologist with full tree → tilt_immunity sets floor to 40.
        const homeStaff = [makeStaff("psychologist", ["psych_basics", "psych_meditate", "psych_tilt"])]

        applyPreMatchTalents(home, away, homeStaff, [])

        // Floor is 40 — player at 20 lifts to 40, player at 60 stays.
        expect(home[0].morale).toBe(40)
        expect(home[1].morale).toBe(60)
        expect(away[0].morale).toBe(50)
    })

    test("timeout_morale (coach Timeout Whisperer) lifts every player additively, capped at 100", () => {
        const home = [makePlayer(50), makePlayer(98)]
        const away = [makePlayer(80)]
        // Coach with timeout_morale = +5 (requires the prereq chain).
        const homeStaff = [makeStaff("coach", ["coach_basics", "coach_tac_1", "coach_tac_2"])]

        applyPreMatchTalents(home, away, homeStaff, [])

        // +5 boost, capped at 100.
        expect(home[0].morale).toBe(55)
        expect(home[1].morale).toBe(100)  // 98 + 5 = 103 → capped at 100
        expect(away[0].morale).toBe(80)   // away unaffected
    })

    test("anti_strat fraction returned matches the talent value / 100", () => {
        const home = [makePlayer(50)]
        const away = [makePlayer(50)]
        // Analyst with analyst_counter unlocked (chain: analyst_basics → analyst_demo → analyst_counter, value 5).
        const homeStaff = [makeStaff("analyst", ["analyst_basics", "analyst_demo", "analyst_counter"])]

        const result = applyPreMatchTalents(home, away, homeStaff, [])

        expect(result.homeAntiStrat).toBeCloseTo(0.05, 5)
        expect(result.awayAntiStrat).toBe(0)
    })

    test("stacking: tilt_immunity floor + timeout boost compose correctly", () => {
        // Player at morale 20 → lifted to tilt_immunity floor 40 → +5 timeout = 45.
        const home = [makePlayer(20)]
        const homeStaff = [
            makeStaff("psychologist", ["psych_basics", "psych_meditate", "psych_tilt"]),
            makeStaff("coach", ["coach_basics", "coach_tac_1", "coach_tac_2"]),
        ]

        applyPreMatchTalents(home, [], homeStaff, [])

        expect(home[0].morale).toBe(45)
    })

    test("both teams get independent talent application", () => {
        const home = [makePlayer(40)]
        const away = [makePlayer(40)]
        const homeStaff = [makeStaff("coach", ["coach_basics", "coach_tac_1", "coach_tac_2"])]  // timeout_morale +5
        const awayStaff = [makeStaff("psychologist", ["psych_basics"])]                          // morale_floor 40

        applyPreMatchTalents(home, away, homeStaff, awayStaff)

        expect(home[0].morale).toBe(45)  // home gets timeout +5
        expect(away[0].morale).toBe(40)  // away already at floor
    })
})
