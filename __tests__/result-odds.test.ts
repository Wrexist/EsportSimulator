import { applyFormResult, resultSurpriseFactor } from '@/engine/player-lifecycle'
import { oddsLine } from '@/lib/match-reasons'
import { CONDITION_TUNING } from '@/lib/balance-tuning'

describe('C1: results judged against the odds', () => {
    it('leaves an even match unchanged', () => {
        expect(resultSurpriseFactor(0.5, true)).toBe(1)
        expect(resultSurpriseFactor(0.5, false)).toBe(1)
        expect(resultSurpriseFactor(undefined, false)).toBe(1)
    })

    it('softens an expected result and sharpens an upset', () => {
        // An underdog (10%) losing barely hurts; the same side winning lifts more.
        expect(resultSurpriseFactor(0.1, false)).toBeCloseTo(0.6)
        expect(resultSurpriseFactor(0.1, true)).toBeCloseTo(1.4)
        // A favourite's mirror image.
        expect(resultSurpriseFactor(0.9, true)).toBeCloseTo(0.6)
        expect(resultSurpriseFactor(0.9, false)).toBeCloseTo(1.4)
    })

    it('keeps the average swing of a fair coin at the old value', () => {
        // Over both outcomes weighted by their chance, a side's expected form
        // change shrinks toward zero instead of compounding a spiral.
        const e = 0.2
        const before = e * CONDITION_TUNING.FORM_PER_WIN + (1 - e) * CONDITION_TUNING.FORM_PER_LOSS
        const after = e * (applyFormResult(50, true, resultSurpriseFactor(e, true)) - 50)
            + (1 - e) * (applyFormResult(50, false, resultSurpriseFactor(e, false)) - 50)
        expect(Math.abs(after)).toBeLessThan(Math.abs(before))
    })

    it('explains the swing on the result screen', () => {
        expect(oddsLine(0.2, false)).toMatch(/costs less morale/)
        expect(oddsLine(0.2, true)).toMatch(/upset/)
        expect(oddsLine(0.8, false)).toMatch(/drop more/)
        expect(oddsLine(0.5, true)).toMatch(/even match/)
        expect(oddsLine(undefined, true)).toBeNull()
    })
})
