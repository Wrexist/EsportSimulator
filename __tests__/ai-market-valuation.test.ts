/**
 * Regression coverage for the AI transfer-market valuation (Phase 3.1 fix).
 *
 * `potential` is on a 0-100 scale, but the potentialMultiplier / overpayBuffer
 * thresholds were 0-20-scale leftovers (16/14 and 17/15) — so virtually every
 * listed player cleared them and always got the max 1.5× / 1.2× boost, making
 * the tiers dead branches and any benched player sellable for an inflated
 * fortune. These tests pin the corrected 0-100 thresholds.
 */

import { aiMarketValuation } from "@/engine/ai/transfer-market"

describe("aiMarketValuation — potential is 0-100 scale", () => {
    test("mid-potential player gets NO boost (was always-max under the 0-20 bug)", () => {
        // potential 50 is a perfectly ordinary value. Pre-fix it cleared the
        // 16/14 and 17/15 thresholds and got 1.5 / 1.2.
        const { potentialMultiplier, overpayBuffer } = aiMarketValuation(60, 50, "PRO")
        expect(potentialMultiplier).toBe(1.0)
        expect(overpayBuffer).toBe(1.0)
    })

    test("only genuinely high-potential prospects get the top boosts", () => {
        const elite = aiMarketValuation(70, 90, "PRO")
        expect(elite.potentialMultiplier).toBe(1.5) // 90 > 80
        expect(elite.overpayBuffer).toBe(1.2)       // 90 > 85

        const strong = aiMarketValuation(70, 75, "PRO")
        expect(strong.potentialMultiplier).toBe(1.2) // 75 > 70, not > 80
        expect(strong.overpayBuffer).toBe(1.0)       // 75 not > 75

        const mid = aiMarketValuation(70, 71, "PRO")
        expect(mid.potentialMultiplier).toBe(1.2)    // 71 > 70
    })

    test("multiplier tiers are monotonic in potential (no dead branches)", () => {
        const lo = aiMarketValuation(60, 40, "PRO").potentialMultiplier
        const mid = aiMarketValuation(60, 75, "PRO").potentialMultiplier
        const hi = aiMarketValuation(60, 95, "PRO").potentialMultiplier
        expect(lo).toBeLessThan(mid)
        expect(mid).toBeLessThan(hi)
    })

    test("tier scales base value (ELITE > PRO > other) and stays finite", () => {
        const elite = aiMarketValuation(80, 80, "ELITE").baseValue
        const pro = aiMarketValuation(80, 80, "PRO").baseValue
        const other = aiMarketValuation(80, 80, "AMATEUR").baseValue
        expect(elite).toBeGreaterThan(pro)
        expect(pro).toBeGreaterThan(other)
        for (const v of [elite, pro, other]) {
            expect(Number.isFinite(v)).toBe(true)
            expect(v).toBeGreaterThan(0)
        }
    })
})
