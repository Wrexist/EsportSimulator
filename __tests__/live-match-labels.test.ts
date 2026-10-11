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

    it('keeps the dock controls the scripts click', () => {
        for (const label of ['SKIP RND', 'SKIP MATCH', 'Playback speed ${preset}x', '{preset}x', 'Match hub', 'Leave to the match hub', 'Pause match', 'Resume match', 'Auto tactics — let the engine pick the strategy', 'Skip match']) {
            expect(dock).toContain(label)
        }
        expect(dock).toContain('PACING_MODE_LABEL')
        expect(read('lib/live-match-pacing.ts')).toMatch(/moments: "Key moments", full: "Full round"/)
    })

    it('keeps the decision card selectors and buy labels', () => {
        expect(card).toContain('tactical-decisions')
        expect(card).toContain('Select strategy')
        expect(card).toContain('Edit ${label} loadout')
        expect(card).toContain('Tactical timeout (')
        for (const label of ['"Save"', '"Force buy"', '"Half buy"', '"Full buy"', '"2xAWP"']) expect(decision).toContain(label)
    })

    it('keeps the result hand-off', () => {
        expect(page).toContain('Continue to results')
        expect(read('components/match/LiveMatchScoreboard.tsx')).toContain('RND ${gameState.round} / 24')
    })
})
