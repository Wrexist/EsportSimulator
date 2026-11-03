/**
 * AI clubs' prospects are drawn from the starting world's spread of
 * potential (engine/development-rates.ts AI_PROSPECT_POTENTIAL), not the
 * user's academy ranges, so ten seasons of intakes do not crowd the top.
 */
import { AI_PROSPECT_POTENTIAL, aiProspectPotential } from "@/engine/development-rates"
import { SeededRNG } from "@/engine/rng"

const draw = (tier: "LOCAL" | "REGIONAL" | "INTERNATIONAL", n = 4000) => {
    const rng = new SeededRNG(77)
    return Array.from({ length: n }, () => aiProspectPotential(tier, rng)).sort((a, b) => a - b)
}
const median = (v: number[]) => v[Math.floor(v.length / 2)]

test("each tier stays in its range (a rare gem above it), better reach finds better prospects", () => {
    const local = draw("LOCAL"), regional = draw("REGIONAL"), intl = draw("INTERNATIONAL")
    for (const [tier, v] of [["LOCAL", local], ["REGIONAL", regional], ["INTERNATIONAL", intl]] as const) {
        const [lo, hi] = AI_PROSPECT_POTENTIAL[tier]
        expect(v[0]).toBeGreaterThanOrEqual(lo)
        expect(v[v.length - 1]).toBeLessThanOrEqual(Math.min(95, hi + AI_PROSPECT_POTENTIAL.GEM_BONUS))
        const gems = v.filter(x => x > hi).length / v.length
        expect(gems).toBeGreaterThan(0.02)
        expect(gems).toBeLessThan(0.06)
    }
    expect(median(local)).toBeLessThan(median(regional))
    expect(median(regional)).toBeLessThan(median(intl))
    // Near the starting world (rostered pros: median 54, 90th percentile 70), never the academy's 84.
    expect(median(regional)).toBeLessThanOrEqual(65)
    expect(intl[Math.floor(intl.length * 0.9)]).toBeLessThanOrEqual(82)
})
