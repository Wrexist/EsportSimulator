import { contextFor } from '@/scripts/launch/l21-paired-scenarios'
import { createLaunchFixture } from '@/scripts/launch/fixtures'
import { mapWinChance, matchWinOdds, seriesWinChance, winOddsInputs, WIN_ODDS_CHECK, WIN_ODDS_FIT } from '@/engine/match/win-odds'

describe('win odds', () => {
    test('even sides are 50/50 and the curve is symmetric and monotone', () => {
        expect(mapWinChance({ ratingGap: 0, edgeGap: 0 })).toBeCloseTo(0.5, 10)
        for (const gap of [0.5, 2, 5]) {
            const fav = mapWinChance({ ratingGap: gap, edgeGap: 0.03 })
            expect(fav).toBeGreaterThan(0.5)
            expect(fav + mapWinChance({ ratingGap: -gap, edgeGap: -0.03 })).toBeCloseTo(1, 10)
            expect(mapWinChance({ ratingGap: gap + 1, edgeGap: 0.03 })).toBeGreaterThan(fav)
        }
    })

    test('series chance from map chances', () => {
        expect(seriesWinChance([0.6], 1)).toBeCloseTo(0.6)
        // BO3 at p: p² + 2p²(1-p)
        const p = 0.6
        expect(seriesWinChance([p, p, p], 3)).toBeCloseTo(p * p + 2 * p * p * (1 - p))
        expect(seriesWinChance([0.5, 0.5, 0.5, 0.5, 0.5], 5)).toBeCloseTo(0.5)
        expect(seriesWinChance([0.7, 0.4, 0.55], 3)).toBeCloseTo(0.7 * 0.4 + 0.7 * 0.6 * 0.55 + 0.3 * 0.4 * 0.55)
        // A longer series favours the favourite more.
        expect(seriesWinChance([0.6, 0.6, 0.6, 0.6, 0.6], 5)).toBeGreaterThan(seriesWinChance([0.6, 0.6, 0.6], 3))
    })

    test('inputs come from the series the match is played with', () => {
        const save = createLaunchFixture('first-week', 3921)
        const ctx = contextFor(save, 11)
        const inputs = winOddsInputs(ctx)
        expect(Number.isFinite(inputs.ratingGap)).toBe(true)
        expect(Math.abs(inputs.edgeGap)).toBeLessThanOrEqual(0.1 + 1e-9)
        const odds = matchWinOdds(ctx, 1)
        expect(odds.series).toBeCloseTo(mapWinChance(inputs))
        expect(odds.maps.map(m => m.map)).toEqual(ctx.maps)
    })

    test('the fit and its check are recorded', () => {
        expect(WIN_ODDS_FIT.rating).toBeGreaterThan(0)
        expect(WIN_ODDS_FIT.edge).toBeGreaterThan(0)
        expect(WIN_ODDS_CHECK.maps).toBeGreaterThanOrEqual(3000)
        expect(WIN_ODDS_CHECK.meanErrorPts).toBeLessThan(3)
    })
})
