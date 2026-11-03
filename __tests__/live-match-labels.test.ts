/**
 * Capture scripts (tmp/*, scripts/trailer) and players' muscle memory rely on
 * these live-match labels; the Phase 3 dock / decision card keep them.
 */
import fs from 'fs'
import path from 'path'

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8')

describe('live match labels', () => {
    const dock = read('components/match/LiveMatchControlBar.tsx')
    const card = read('components/match/live/DecisionCard.tsx')
    const decision = read('lib/live-match-decision.ts')
    const page = read('app/match/[id]/live/page.tsx')
    // Text the screens show lives in the English locale files.
    const en = read('locales/en/match.ts')

    it('keeps the dock controls the scripts click', () => {
        for (const label of ['SKIP RND', 'SKIP MATCH', 'Playback speed {{preset}}x', 'Match hub', 'Leave to the match hub', 'Pause match', 'Resume match', 'Auto tactics — let the engine pick the strategy', 'Skip match']) {
            expect(en).toContain(`"${label}"`)
        }
        expect(dock).toContain('{preset}x')
        expect(dock).toContain('pacingModeLabel')
        expect(en).toContain('"pacing.moments": "Key moments"')
        expect(en).toContain('"pacing.full": "Full round"')
    })

    it('keeps the decision card selectors and buy labels', () => {
        expect(card).toContain('tactical-decisions')
        expect(en).toContain('Select strategy')
        expect(en).toContain('Edit {{call}} loadout')
        expect(en).toContain('Tactical timeout (')
        expect(decision).toContain('buy.${STRATEGY_KEY[id]}')
        for (const label of ['"Save"', '"Force buy"', '"Half buy"', '"Full buy"', '"2xAWP"']) expect(en).toContain(label)
    })

    it('keeps the result hand-off', () => {
        expect(page).toContain('live.toResults')
        expect(en).toContain('"live.toResults": "Continue to results"')
        expect(en).toContain('"scoreboard.rnd": "RND {{n}} / 24"')
    })
})
