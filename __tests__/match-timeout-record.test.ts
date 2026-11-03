/**
 * MATCHDAY-05: a regroup round is recorded (feed "Regroup: …" line, key round,
 * "x of y regroup rounds won") only when the regroup edge applied, i.e. the
 * managed team was on a losing streak. The engine edge itself is unchanged.
 */
import { contextFor } from '@/scripts/launch/l21-paired-scenarios'
import { createLaunchFixture } from '@/scripts/launch/fixtures'
import { createLegacySeriesState, playLegacyRound, type LegacySeriesState } from '@/engine/match/legacy-series'
import { REGROUP_MIN_LOSS_STREAK } from '@/engine/match/manager-controls'

jest.setTimeout(60_000)

describe('regroup record', () => {
    const save = createLaunchFixture('first-week', 3921)
    const ctx = contextFor(save, 4242)
    const managedHome = ctx.managedTeamId === ctx.home.team.id
    // Round 3 of map 1 (no pistol round), with a chosen losing streak for the managed side.
    const at = (streak: number): LegacySeriesState => {
        let state = createLegacySeriesState(ctx)
        for (let i = 0; i < 2; i++) state = playLegacyRound(ctx, state).state
        const sim = { ...state.sim, ...(managedHome ? { homeLossStreak: streak } : { awayLossStreak: streak }) }
        return { ...state, sim }
    }

    test('no losing streak: the regroup has no effect and is not recorded', () => {
        const withTimeout = playLegacyRound(ctx, at(0), { regroup: true })
        const without = playLegacyRound(ctx, at(0))
        expect(withTimeout.round.managerCall?.regroup).toBeUndefined()
        // Same round either way: nothing applied.
        expect(withTimeout.round.winningTeamId).toBe(without.round.winningTeamId)
        expect(withTimeout.round.events).toEqual(without.round.events)
    })

    test('on a losing streak the regroup is recorded', () => {
        const step = playLegacyRound(ctx, at(REGROUP_MIN_LOSS_STREAK), { regroup: true })
        expect(step.round.managerCall?.regroup).toBe(true)
        expect(playLegacyRound(ctx, at(REGROUP_MIN_LOSS_STREAK)).round.managerCall?.regroup).toBeUndefined()
    })
})
