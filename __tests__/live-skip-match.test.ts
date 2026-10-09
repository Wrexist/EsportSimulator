/**
 * "Skip match" on the live screen finishes the series in one go. It must give
 * exactly the rounds the live loop would play on auto tactics (one
 * playLegacyRound per round, no manager call, timeout regroup carried over)
 * and the same result instant simulation gives from that state.
 */
import { contextFor } from '@/scripts/launch/l21-paired-scenarios'
import { createLaunchFixture } from '@/scripts/launch/fixtures'
import { createDefaultTactics } from '@/engine/default-tactics'
import { createLegacySeriesState, playLegacyRound, runLegacySeries, type LegacySeriesState } from '@/engine/match/legacy-series'
import { finishLegacySeriesFromState, tallyLivePlayerStats } from '@/lib/live-match-builders'

jest.setTimeout(120_000)

describe('finishLegacySeriesFromState', () => {
    const save = createLaunchFixture('first-week', 3921)

    test.each([11, 4040, 90210])('seed %i: equals round-by-round auto play and instant simulation', seed => {
        const tactics = createDefaultTactics()
        const ctx = contextFor(save, seed, tactics)
        // A few live rounds with manager calls before the skip.
        let state: LegacySeriesState = createLegacySeriesState(ctx)
        for (let i = 0; i < 7; i++) state = playLegacyRound(ctx, state, { strategy: i === 4 ? 'ECO' : undefined, customTactics: tactics }).state
        const before = JSON.stringify(state)

        const skipped = finishLegacySeriesFromState(ctx, state, { regroupRounds: 2, customTactics: tactics })
        expect(JSON.stringify(state)).toBe(before) // input not mutated
        expect(skipped.state.finished).toBe(true)
        expect(skipped.regroupRounds).toBe(0)

        // What the live loop does on auto: one step per round, regroup consumed per round.
        let live = state, regroup = 2, rounds = 0
        while (!live.finished) {
            live = playLegacyRound(ctx, live, { regroup: regroup > 0, customTactics: tactics }).state
            if (regroup > 0) regroup--
            rounds++
        }
        expect(skipped.state).toEqual(live)
        expect(skipped.roundsPlayed).toBe(rounds)
        expect(skipped.lastStep?.state).toEqual(live)

        // Instant simulation from the same state commits the same series.
        const instant = runLegacySeries(ctx, undefined, { state, timeouts: { remaining: 0, rounds: 2 } })
        expect(instant.state).toEqual(skipped.state)
    })

    test('a finished series is returned untouched', () => {
        const ctx = contextFor(save, 77, createDefaultTactics())
        const done = runLegacySeries(ctx).state
        const again = finishLegacySeriesFromState(ctx, done, { regroupRounds: 0 })
        expect(again.state).toBe(done)
        expect(again.roundsPlayed).toBe(0)
        expect(again.lastStep).toBeUndefined()
    })

    test('player tallies count every recorded kill once', () => {
        const ctx = contextFor(save, 5150, createDefaultTactics())
        const done = runLegacySeries(ctx).state
        const tally = tallyLivePlayerStats(done.maps)
        const kills = done.maps.reduce((s, m) => s + m.rounds.reduce((r, round) => r + round.kills.reduce((k, e) => k + e.kills, 0), 0), 0)
        expect(Object.values(tally).reduce((s, t) => s + t.kills, 0)).toBe(kills)
        const first = done.maps[0].rounds[0]
        const skipped = tallyLivePlayerStats(done.maps, { mapIndex: 0, roundNumber: first.roundNumber })
        const firstKills = first.kills.reduce((k, e) => k + e.kills, 0)
        expect(Object.values(skipped).reduce((s, t) => s + t.kills, 0)).toBe(kills - firstKills)
    })
})
