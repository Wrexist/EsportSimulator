/**
 * Audit 2026-11-17, round 2 (r2econ): economy and player rules.
 */
import { CAREER_DIFFICULTY } from "@/lib/balance-tuning"
import { DIFFICULTY_SETTINGS } from "@/types/team-creator"
import { generateCustomTeamData } from "@/engine/team-creator"
import { EquipmentManager, EQUIPMENT_CATALOG } from "@/engine/equipment-manager"

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

describe("SQUAD-56: the Gaming PC is worth buying, and a full elite set is still +8%", () => {
    const share = (id: string) => EquipmentManager.itemStrengthBonus(EquipmentManager.getCatalogItem(id)!)
    test("PC tiers are +0.5/+1.0/+1.5%; other elite items +1.3%; Standard and Pro elsewhere unchanged", () => {
        expect([share("pc_t1"), share("pc_t2"), share("pc_t3")].map(v => +(v * 100).toFixed(3))).toEqual([0.5, 1, 1.5])
        for (const slot of ["mouse", "keyboard", "monitor", "headset", "chair"]) {
            expect(share(`${slot}_t1`)).toBeCloseTo(2 * 0.08 / 45, 9)
            expect(share(`${slot}_t2`)).toBeCloseTo(5 * 0.08 / 45, 9)
            expect(share(`${slot}_t3`)).toBeCloseTo(0.013, 9)
        }
        // Per dollar of upkeep, the PC is no longer the worst item of its tier.
        for (const tier of [1, 2, 3]) {
            const items = EQUIPMENT_CATALOG.filter(i => i.tier === tier)
            const pc = items.find(i => i.type === "PC")!
            const others = items.filter(i => i.type !== "PC")
            expect(EquipmentManager.itemStrengthBonus(pc)).toBeGreaterThan(Math.max(...others.map(i => EquipmentManager.itemStrengthBonus(i))))
        }
    })

    test("a full elite set is exactly the cap; a saved item's rating cannot inflate it", () => {
        const elite = EQUIPMENT_CATALOG.filter(i => i.tier === 3).map(i => ({ ...i, bonus: { ...i.bonus }, purchasedWeek: 1 }))
        expect(EquipmentManager.strengthBonus({ equipment: elite })).toBeCloseTo(EquipmentManager.STRENGTH_CAP, 9)
        const pc = { ...elite.find(i => i.type === "PC")!, bonus: { stat: "skill", value: 1e9 } }
        expect(EquipmentManager.itemStrengthBonus(pc)).toBeCloseTo(0.015, 9)
        // An item without a tier falls back to its rating, never above the elite share.
        expect(EquipmentManager.itemStrengthBonus({ type: "PC", bonus: { value: 1e9 } })).toBeLessThanOrEqual(0.015)
    })
})
