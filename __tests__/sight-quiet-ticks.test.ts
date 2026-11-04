/**
 * HOME-08 perf: the sight engine skips the ticks in which nobody walks and no
 * fight is on (quietUntil / sameAsLastTick in round-sim/sight.ts). The skip
 * must never change a round: the same series played with every tick gives the
 * same result, round by round (events, kills, damage, moves, economy).
 */
import { simulationEngineV2 } from '@/engine/match-simulation'
import { createLegacySeriesState, playLegacyRound, runLegacySeries, finalizeLegacySeries } from '@/engine/match/legacy-series'
import { setQuietTickSkip } from '@/engine/match/round-sim/sight'
import { buildSide, even } from '@/engine/match/calibration/fixtures'
import type { Match, Team } from '@/types'
import { MapId } from '@/types/enums'

function context(map: MapId, seed: number, homeSkill: number, awaySkill: number) {
    const home = buildSide({ id: 'H', skills: even(homeSkill) }), away = buildSide({ id: 'A', skills: even(awaySkill) })
    const match = { id: `quiet_${map}_${seed}`, homeTeamId: 'H', awayTeamId: 'A', format: 'BO1', seed, date: new Date(0), mapVeto: [], vetoComplete: true, maps: [map], mapResults: [], roundHistory: [] } as unknown as Match
    return simulationEngineV2.createSeriesContext(match, home.team as unknown as Team, away.team as unknown as Team, home.players, away.players, {}, {}, [map], undefined, 'nobody')
}

/** Every round as played step by step (with its loadouts), then the whole series as the week tick runs it. */
function play(map: MapId, seed: number, homeSkill: number, awaySkill: number, skip: boolean): string {
    setQuietTickSkip(skip)
    try {
        const ctx = context(map, seed, homeSkill, awaySkill)
        const rounds: string[] = []
        let state = createLegacySeriesState(ctx)
        while (!state.finished) {
            const step = playLegacyRound(ctx, state)
            rounds.push(JSON.stringify([step.round, step.preRound]))
            state = step.state
        }
        const runCtx = context(map, seed, homeSkill, awaySkill)
        const run = runLegacySeries(runCtx)
        return JSON.stringify([rounds, finalizeLegacySeries(runCtx, run.state)])
    } finally {
        setQuietTickSkip(true)
    }
}

describe('sight engine quiet-tick skip', () => {
    const maps = [MapId.MIRAGE, MapId.INFERNO, MapId.NUKE, MapId.VERTIGO, MapId.ANUBIS, MapId.ANCIENT, MapId.OVERPASS, MapId.SANDSTONE]
    const skills: [number, number][] = [[70, 70], [78, 62], [60, 75]]
    const cases: [MapId, number, number, number][] = maps.flatMap((map, i) => skills.map(([h, a], k) => [map, 11 + 7 * i + k, h, a] as [MapId, number, number, number]))
    test.each(cases)('%s seed %i: same rounds with and without the skip', (map, seed, h, a) => {
        expect(play(map, seed, h, a, true)).toBe(play(map, seed, h, a, false))
    })

    test('runLegacySeries gives the same result as playing round by round', () => {
        const ctx = context(MapId.MIRAGE, 21, 72, 68)
        let state = createLegacySeriesState(ctx)
        while (!state.finished) state = playLegacyRound(ctx, state).state
        const runCtx = context(MapId.MIRAGE, 21, 72, 68)
        expect(JSON.stringify(finalizeLegacySeries(runCtx, runLegacySeries(runCtx).state))).toBe(JSON.stringify(finalizeLegacySeries(ctx, state)))
    })
})
