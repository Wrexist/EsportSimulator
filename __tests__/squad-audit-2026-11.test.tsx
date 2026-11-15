/**
 * Squad audit 2026-11-15: the pure rules behind the screen fixes.
 *   - SQUAD-27: retraining fees in the finance forecast
 *   - SQUAD-24: KpiStrip skips null/false children
 *   - SQUAD-28: scout bands in whole points
 *   - SQUAD-06: the profile's renewal note uses the renew dialog's terms
 *   - SQUAD-22: weeks until an academy prospect's potential shows
 *   - SQUAD-07: staff "Asking" is the figure the negotiation accepts
 *   - SQUAD-08: legacy staff take their rarity's level and wage band
 */
import { renderToStaticMarkup } from "react-dom/server"
import type { StaffSaveData, TeamSaveData } from "@/engine/save-types"
import { roleTrainingCost } from "@/engine/finance-forecast"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { fuzzyBand, formatScoutedRating } from "@/engine/scouting-system"
import { renewalTerms } from "@/components/player/RenewContractModal"
import { renewalMultiplier, getArchetype } from "@/engine/personality"
import { AI_SQUAD_TUNING } from "@/lib/balance-tuning"
import { POTENTIAL_REVEAL_WEEKS, weeksToPotentialReveal } from "@/app/academy/_components/academy-facts"
import { STAFF_ACCEPT_SHARE, staffAcceptsOffer, staffAskingWage, staffMinAcceptable } from "@/components/staff/staff-asking"
import { StaffGenerator, legacyStaffTerms } from "@/engine/staff-generator"
import { LEGACY_STAFF_POOL } from "@/engine/staff-db"
import { STAFF_SALARY_RANGES } from "@/lib/constants"

describe("SQUAD-27: retraining in the forecast", () => {
    const team = {
        activeRoleTraining: [
            { playerId: "a", targetRole: "AWP", weeksCompleted: 2, totalWeeks: 8, weeklyCost: 5000 },
            { playerId: "b", targetRole: "IGL", weeksCompleted: 7, totalWeeks: 8, weeklyCost: 3000 },
        ],
    } as unknown as Pick<TeamSaveData, "activeRoleTraining">

    test("counts each programme while it still has weeks to run", () => {
        expect(roleTrainingCost(team)).toBe(8000)
        expect(roleTrainingCost(team, 1)).toBe(5000) // b's last week is this one
        expect(roleTrainingCost(team, 6)).toBe(0)
        expect(roleTrainingCost({ activeRoleTraining: undefined })).toBe(0)
    })
})

describe("SQUAD-24: KpiStrip", () => {
    test("null and false children get no empty cell", () => {
        const show = false
        const html = renderToStaticMarkup(
            <KpiStrip>
                <Kpi label="A" value={1} />
                {show && <Kpi label="B" value={2} />}
                {null}
                <Kpi label="C" value={3} />
            </KpiStrip>,
        )
        expect(html.match(/px-5 py-3/g)).toHaveLength(2)
    })
})

describe("SQUAD-28: scout bands", () => {
    test("fractional attributes give whole-number bands", () => {
        for (const v of [48.37, 61.5, 72.04, 0.4, 98.9]) {
            const [lo, hi] = fuzzyBand(v, 6, "player_x")
            expect(Number.isInteger(lo)).toBe(true)
            expect(Number.isInteger(hi)).toBe(true)
            expect(lo).toBeLessThanOrEqual(hi)
        }
        expect(formatScoutedRating([48.6, 60.2])).toBe("49–60")
        expect(formatScoutedRating(61.7)).toBe("62")
    })
})

describe("SQUAD-06: renewal terms", () => {
    test("without a market level the raise is the archetype's usual one", () => {
        const player = { id: "renew_case_1" } as never
        const terms = renewalTerms(player, 1000, 10)
        const mult = renewalMultiplier(getArchetype(player), AI_SQUAD_TUNING.RENEWAL_SALARY_MULTIPLIER)
        expect(terms.newSalary).toBe(Math.round(1000 * mult))
        expect(terms.raisePct).toBe(terms.usualPct)
        expect(terms.market).toBe(false)
        expect(terms.archetype).toEqual(expect.any(String))
    })
})

describe("SQUAD-22: potential reveal countdown", () => {
    test("counts down from the academy level's reveal time", () => {
        expect(weeksToPotentialReveal(10, 1, 10)).toBe(POTENTIAL_REVEAL_WEEKS[1])
        expect(weeksToPotentialReveal(10, 1, 14)).toBe(POTENTIAL_REVEAL_WEEKS[1] - 4)
        expect(weeksToPotentialReveal(10, 3, 30)).toBe(0)
        expect(weeksToPotentialReveal(10, 9, 10)).toBe(12) // unknown level: the slice's default
    })
})

describe("SQUAD-07: staff asking wage", () => {
    const member = (rarity: StaffSaveData["rarity"], id = `m_${rarity}`) => ({ id, salaryPerWeek: 1000, rarity })
    const ctx = { isRenewal: false, saveId: "save_1", currentWeek: 5, teamId: "us" }

    test("the asking figure is accepted, a dollar less is not", () => {
        for (const rarity of ["Common", "Rare", "Epic", "Legendary"] as const) {
            for (const isRenewal of [false, true]) {
                const c = { ...ctx, isRenewal }
                const asking = staffAskingWage(member(rarity), c)
                const min = staffMinAcceptable(member(rarity), { ...c, duration: 52 })
                expect(staffAcceptsOffer(asking, min)).toBe(true)
                expect(staffAcceptsOffer(asking - 1, min)).toBe(false)
                expect(asking).toBe(Math.ceil(min * STAFF_ACCEPT_SHARE))
            }
        }
    })

    test("rarity and renewal raise the asking figure; two-year deals accept less", () => {
        const sameSeed = (rarity: StaffSaveData["rarity"]) => member(rarity, "same")
        expect(staffAskingWage(sameSeed("Legendary"), ctx)).toBeGreaterThan(staffAskingWage(sameSeed("Common"), ctx))
        expect(staffMinAcceptable(sameSeed("Common"), { ...ctx, duration: 104 })).toBeLessThan(staffMinAcceptable(sameSeed("Common"), { ...ctx, duration: 52 }))
        expect(staffAskingWage(member("Common"), ctx)).toBe(staffAskingWage(member("Common"), ctx)) // deterministic
    })
})

describe("SQUAD-08: legacy staff pool", () => {
    test("a legacy entry's level and wage sit in its rarity's band", () => {
        expect(legacyStaffTerms({ rarity: "Legendary", level: 4, salaryPerWeek: 1000 })).toEqual({ level: 5, salaryPerWeek: STAFF_SALARY_RANGES.Legendary.min, salaryTier: "Legendary" })
        expect(legacyStaffTerms({ rarity: "Epic", level: 4, salaryPerWeek: 2500 })).toMatchObject({ level: 4, salaryPerWeek: STAFF_SALARY_RANGES.Epic.min })
        expect(legacyStaffTerms({ rarity: "Rare", level: 4, salaryPerWeek: 1500 })).toMatchObject({ level: 4, salaryPerWeek: STAFF_SALARY_RANGES.High.min })
        expect(legacyStaffTerms({ rarity: "Common", level: 4, salaryPerWeek: 1000 })).toMatchObject({ level: 3, salaryPerWeek: 1000 })
        expect(legacyStaffTerms({ level: 2, salaryPerWeek: 900 })).toMatchObject({ level: 2, salaryPerWeek: 900 })
    })

    test("no legacy Legendary in a market is cheaper than a generated Common", () => {
        for (let week = 1; week <= 30; week++) {
            const market = StaffGenerator.generateWeeklyMarket(week, 20)
            for (const s of market.filter(m => !m.id.startsWith("gen_"))) {
                const base = LEGACY_STAFF_POOL.find(l => s.id.startsWith(`${l.id}_`))
                expect(base).toBeDefined()
                if (s.rarity === "Legendary") {
                    expect(s.level).toBe(5)
                    expect(s.salaryPerWeek).toBeGreaterThanOrEqual(STAFF_SALARY_RANGES.Legendary.min)
                }
            }
        }
    })
})
