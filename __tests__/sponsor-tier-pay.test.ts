/**
 * MARKET-03: the wage-bill cap binds for nearly every club, and it used to be
 * one flat share for every tier, so every offer (Standard, Premium, Elite,
 * betting or not) paid the same. The cap is now per tier, spread by each
 * offer's roll and lifted for betting money, with the income of a club that
 * fills its slots kept where it was.
 */
import { SponsorGenerator } from "@/engine/economy-manager"
import { EconomyEngine } from "@/engine/economy-engine"
import { SeededRNG } from "@/engine/rng"
import { SPONSOR_TUNING, sponsorWageBase } from "@/lib/balance-tuning"
import type { SponsorSaveData, TeamSaveData } from "@/engine/save-types"

const team = (reputation: number): TeamSaveData => ({ id: `t_${reputation}`, name: "Club", reputation, followers: 20_000 } as unknown as TeamSaveData)
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length)

/** Offers over many weeks for a club whose cap binds (low reputation, lean payroll, like the audit's rep-39 club). */
function offersFor(reputation: number, wageBill: number, weeks = 200): SponsorSaveData[] {
    const out: SponsorSaveData[] = []
    for (let w = 1; w <= weeks; w++) out.push(...SponsorGenerator.generateVariedOffers(team(reputation), w, new SeededRNG(1000 + w), wageBill))
    return out
}

describe("MARKET-03: sponsor tiers pay differently under the wage cap", () => {
    test("offers in one week are not all the same amount", () => {
        let weeksAllEqual = 0
        for (let w = 1; w <= 50; w++) {
            const pays = SponsorGenerator.generateVariedOffers(team(39), w, new SeededRNG(77 + w), 1_000).map(o => o.weeklyPayout)
            if (new Set(pays).size === 1) weeksAllEqual++
        }
        expect(weeksAllEqual).toBe(0)
    })

    test("Elite pays more than Premium, Premium more than Standard (capped club)", () => {
        const offers = offersFor(55, 2_000).filter(o => !o.brandEffect?.reputationPerWeek || o.brandEffect.reputationPerWeek > 0)
        const byTier = (tier: string) => mean(offers.filter(o => o.tier === tier).map(o => o.weeklyPayout))
        expect(byTier("PREMIUM")).toBeGreaterThan(byTier("STANDARD") * 1.08)
        expect(byTier("ELITE")).toBeGreaterThan(byTier("PREMIUM") * 1.07)
    })

    test("betting money pays a premium over the same tier's other brands", () => {
        const offers = offersFor(39, 1_000)
        const betting = (o: SponsorSaveData) => (o.brandEffect?.reputationPerWeek ?? 0) < 0
        for (const tier of ["STANDARD", "PREMIUM"]) {
            const inTier = offers.filter(o => o.tier === tier)
            expect(mean(inTier.filter(betting).map(o => o.weeklyPayout))).toBeGreaterThan(mean(inTier.filter(o => !betting(o)).map(o => o.weeklyPayout)) * 1.08)
        }
    })

    test("no offer passes the hard share of running costs", () => {
        for (const [rep, bill] of [[39, 1_000], [55, 8_000], [75, 40_000], [95, 120_000]]) {
            const cap = SPONSOR_TUNING.MAX_SHARE_OF_WAGE_BILL * sponsorWageBase(bill, rep)
            for (const o of offersFor(rep, bill, 40)) expect(o.weeklyPayout * EconomyEngine.sponsorReputationFactor(rep)).toBeLessThanOrEqual(cap + 1)
        }
    })

    test("income for a club holding one deal per tier stays near the old flat cap", () => {
        // Old rule: every deal paid 0.3 x running costs (effective). A low club
        // holds a Standard, a mid club Standard + Premium, a top club all three.
        for (const [rep, bill, tiers] of [[30, 1_500, ["STANDARD"]], [60, 10_000, ["STANDARD", "PREMIUM"]], [90, 80_000, ["STANDARD", "PREMIUM", "ELITE"]]] as const) {
            const base = sponsorWageBase(bill, rep)
            const oldDeals = 0.3 * base * tiers.length
            const totals: number[] = []
            for (let w = 1; w <= 100; w++) {
                const offers = SponsorGenerator.generateVariedOffers(team(rep), w, new SeededRNG(500 + w), bill)
                const picked = tiers.map(tier => offers.filter(o => o.tier === tier).sort((a, b) => b.weeklyPayout - a.weeklyPayout)[0]).filter(Boolean)
                if (picked.length !== tiers.length) continue
                const income = EconomyEngine.calculateSponsorIncome({ ...team(rep), sponsors: picked })
                totals.push(income - EconomyEngine.sponsorFloor(rep))
            }
            const avg = mean(totals)
            expect(avg).toBeGreaterThan(oldDeals * 0.85)
            expect(avg).toBeLessThan(oldDeals * 1.1)
        }
    })
})
