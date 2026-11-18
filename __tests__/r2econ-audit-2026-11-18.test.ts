/**
 * Audit 2026-11-17, round 2 (r2econ): economy and player rules.
 */
import { CAREER_DIFFICULTY } from "@/lib/balance-tuning"
import { DIFFICULTY_SETTINGS } from "@/types/team-creator"
import { generateCustomTeamData } from "@/engine/team-creator"

describe("MODES-18: difficulty carries only the levers the game applies", () => {
    test("career difficulty: cash and recurring income, no unused fans or prize multipliers", () => {
        for (const d of Object.values(CAREER_DIFFICULTY)) {
            expect(Object.keys(d).sort()).toEqual(["cash", "hint", "incomeMultiplier", "label"])
        }
    })

    test("a created club stores only the income multiplier; its fans multiplier seeds the starting fanbase", () => {
        for (const difficulty of Object.keys(DIFFICULTY_SETTINGS) as (keyof typeof DIFFICULTY_SETTINGS)[]) {
            expect(DIFFICULTY_SETTINGS[difficulty]).not.toHaveProperty("tournamentPrizeMultiplier")
            const team = generateCustomTeamData({ name: "New Club", shortName: "NEW", region: "EU", difficulty, logoIndex: 0, primaryColor: "#111111", secondaryColor: "#222222" }, "custom_1")
            expect(team.difficultySettings).toEqual({ incomeMultiplier: DIFFICULTY_SETTINGS[difficulty].incomeMultiplier })
            expect(team.fanbase).toBe(Math.round(1000 * DIFFICULTY_SETTINGS[difficulty].fansMultiplier))
        }
    })
})
