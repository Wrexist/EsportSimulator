/**
 * Audit 2026-11-17, round 2 (r2econ): economy and player rules.
 */
import { CAREER_DIFFICULTY } from "@/lib/balance-tuning"
import { DIFFICULTY_SETTINGS } from "@/types/team-creator"
import { generateCustomTeamData } from "@/engine/team-creator"
import { EquipmentManager, EQUIPMENT_CATALOG } from "@/engine/equipment-manager"
import { WORKLOAD_TUNING, needsWorkloadWarning, workloadOf } from "@/engine/workload"

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

describe("SQUAD-64: form also follows the player's own match rating", () => {
    // Imported here so the earlier blocks stay independent of the lifecycle module.
    const { applyFormResult } = jest.requireActual("@/engine/player-lifecycle") as typeof import("@/engine/player-lifecycle")
    const { CONDITION_TUNING } = jest.requireActual("@/lib/balance-tuning") as typeof import("@/lib/balance-tuning")

    test("same result, different ratings: the better match gives the better form", () => {
        expect(applyFormResult(70, true, 1, 1.46)).toBeGreaterThan(applyFormResult(70, true, 1, 0.97))
        expect(applyFormResult(70, true, 1, 1.1)).toBeCloseTo(70 + CONDITION_TUNING.FORM_PER_WIN + 1, 9)
        expect(applyFormResult(70, false, 1, 0.9)).toBeCloseTo(70 + CONDITION_TUNING.FORM_PER_LOSS - 1, 9)
        // A 1.0 rating, or no rating at all, is the old result-only rule.
        expect(applyFormResult(70, true, 1, 1)).toBe(70 + CONDITION_TUNING.FORM_PER_WIN)
        expect(applyFormResult(70, true, 1)).toBe(70 + CONDITION_TUNING.FORM_PER_WIN)
        expect(applyFormResult(70, true, 1, Number.NaN)).toBe(70 + CONDITION_TUNING.FORM_PER_WIN)
    })

    test("the result still dominates: the rating part is capped below the result part", () => {
        expect(CONDITION_TUNING.FORM_RATING_CAP).toBeLessThan(CONDITION_TUNING.FORM_PER_WIN)
        // A great game in a loss still loses form; a poor game in a win still gains it.
        expect(applyFormResult(70, false, 1, 3)).toBeLessThan(70)
        expect(applyFormResult(70, true, 1, 0)).toBeGreaterThan(70)
        expect(applyFormResult(99, true, 1, 2)).toBe(100)
        expect(applyFormResult(1, false, 1, 0)).toBe(0)
    })
})

describe("NEWPLAYER-04: a scout's wage follows his report tier", () => {
    const { StaffGenerator, SCOUT_TIER_SALARY, scoutReportTierOf } = jest.requireActual("@/engine/staff-generator") as typeof import("@/engine/staff-generator")
    const RANK = ["BASIC", "ADVANCED", "EXPERT", "ELITE"] as const

    test("every generated scout lists inside his tier's band, and a better tier never lists for less", () => {
        let scouts = 0
        for (let week = 1; week <= 120; week++) {
            const market = StaffGenerator.generateWeeklyMarket(week, 20).filter(s => s.role === "scout")
            for (const s of market) {
                const band = SCOUT_TIER_SALARY[scoutReportTierOf(s)]
                expect(s.salaryPerWeek).toBeGreaterThanOrEqual(band.min)
                expect(s.salaryPerWeek).toBeLessThanOrEqual(band.max)
                scouts++
            }
            for (const a of market) for (const b of market) {
                if (RANK.indexOf(scoutReportTierOf(a)) < RANK.indexOf(scoutReportTierOf(b))) expect(a.salaryPerWeek).toBeLessThan(b.salaryPerWeek)
            }
        }
        expect(scouts).toBeGreaterThan(200)
        for (let i = 1; i < RANK.length; i++) expect(SCOUT_TIER_SALARY[RANK[i]].min).toBeGreaterThanOrEqual(SCOUT_TIER_SALARY[RANK[i - 1]].max)
    })

    test("other roles keep their rarity bands", () => {
        const coach = StaffGenerator.generateFakeStaff("coach", 77)
        const again = StaffGenerator.generateFakeStaff("coach", 77)
        expect(coach.salaryPerWeek).toBe(again.salaryPerWeek)
        expect(coach.salaryPerWeek).toBeGreaterThanOrEqual(800)
    })
})

describe("SQUAD-39: opening wages are an existing deal at OPENING_WAGE_SHARE of the market wage", () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const path = require("node:path") as typeof import("node:path")
    const { SnapshotLoader } = jest.requireActual("@/data/snapshot-loader") as typeof import("@/data/snapshot-loader")
    const { recruitmentSalary, MIN_ASKING_WAGE } = jest.requireActual("@/engine/recruitment") as typeof import("@/engine/recruitment")
    const { renewalSalary } = jest.requireActual("@/engine/personality") as typeof import("@/engine/personality")
    const { AI_SQUAD_TUNING } = jest.requireActual("@/lib/balance-tuning") as typeof import("@/lib/balance-tuning")
    /* eslint-enable @typescript-eslint/no-require-imports */
    let save: import("@/engine/save-types").GameSave
    let loader: InstanceType<typeof SnapshotLoader>
    beforeAll(async () => {
        loader = new SnapshotLoader(path.join(process.cwd(), "public/data/snapshot"))
        expect((await loader.loadSnapshot()).success).toBe(true)
        save = loader.createCareerFromSnapshot("SQUAD-39", loader.getSnapshot()!.teams[0].id, 1, 3917)!
    }, 60_000)

    test("every opening contract pays the share of the club's signing wage; buyouts keep their multiple", () => {
        expect(AI_SQUAD_TUNING.OPENING_WAGE_SHARE).toBe(0.75)
        const players = new Map(save.players.map(p => [p.id, p]))
        const teams = new Map(save.teams.map(t => [t.id, t]))
        expect(save.contracts.length).toBeGreaterThan(500)
        for (const c of save.contracts) {
            const market = recruitmentSalary(players.get(c.playerId)!, 1, teams.get(c.teamId)!)
            expect(c.salaryPerWeek).toBe(Math.max(MIN_ASKING_WAGE, Math.round(market * AI_SQUAD_TUNING.OPENING_WAGE_SHARE)))
            expect([26, 52, 78].some(weeks => Math.abs(c.buyout - weeks * c.salaryPerWeek) <= 1)).toBe(true)
        }
    })

    test("wages follow rating, and the typical first renewal is the usual raise, not +150%", () => {
        const wageOf = (id: string) => save.contracts.find(c => c.playerId === id)!.salaryPerWeek
        const rostered = save.teams.flatMap(t => t.rosterIds).map(id => save.players.find(p => p.id === id)!)
        expect(new Set(rostered.map(p => wageOf(p.id))).size).toBeGreaterThan(rostered.length / 3)
        const ratios = rostered.map(p => renewalSalary(p, wageOf(p.id), 1) / wageOf(p.id)).sort((a, b) => a - b)
        expect(ratios[Math.floor(ratios.length / 2)]).toBeLessThanOrEqual(1.25)
        // Before, almost every deal was $250: 45% of first renewals were above +25%, the top tenth +150%.
        expect(ratios.filter(r => r > 1.25).length / ratios.length).toBeLessThan(0.4)
        expect(ratios[Math.floor(ratios.length * 0.9)]).toBeLessThan(1.6)
    })

    test("same seed, same opening wages", () => {
        const again = loader.createCareerFromSnapshot("SQUAD-39b", loader.getSnapshot()!.teams[0].id, 1, 3917)!
        expect(again.contracts.map(c => c.salaryPerWeek)).toEqual(save.contracts.map(c => c.salaryPerWeek))
    }, 60_000)
})

describe("HOME-21: the workload warning fires at 0.8% weekly risk, not 0.5%", () => {
    const p = (fatigue: number, over: Record<string, unknown> = {}) =>
        ({ id: "a", nickname: "a", fatigue, health: 100, age: 22, ...over }) as never
    test("threshold is 0.8%", () => {
        expect(WORKLOAD_TUNING.WARN_RISK).toBe(0.008)
    })
    test("a fit 22-year-old is warned from about fatigue 90, not 75-89", () => {
        expect(needsWorkloadWarning(p(75))).toBe(false)
        expect(needsWorkloadWarning(p(85))).toBe(false)
        expect(needsWorkloadWarning(p(88))).toBe(false)
        expect(needsWorkloadWarning(p(90))).toBe(true)
        expect(workloadOf(p(80)).band).toBe("HIGH")
        expect(workloadOf(p(90)).band).toBe("OVERLOADED")
    })
    test("age still brings the warning earlier", () => {
        // age 34: x1.2, so fatigue 80 is 0.62% x 1.2 = 0.744% (no) and 85 is 0.864% (yes)
        expect(needsWorkloadWarning(p(80, { age: 34 }))).toBe(false)
        expect(needsWorkloadWarning(p(85, { age: 34 }))).toBe(true)
    })
})
