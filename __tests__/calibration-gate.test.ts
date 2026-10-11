/**
 * Calibration gate (revamp Phase 2B, item H).
 *
 * A fast tripwire on the engine new matches use (DEFAULT_MATCH_ENGINE in
 * engine/match/engine-registry.ts), played through the production series
 * paths (managed + AI). When the default flips to script-v1 this gate
 * measures script-v1 with no change here.
 *
 * Bands are deliberately generous: this catches broken engines, not
 * miscalibrated ones. The real table is the CLI
 * (`npx tsx scripts/calibrate-engine.ts`, docs/revamp/calibration/).
 * The expensive suites (agency decisions, star impact) are skipped.
 */
import { DEFAULT_MATCH_ENGINE, isMatchEngineRunnable, MATCH_ENGINES } from '@/engine/match/engine-registry'
import { runCalibration, SKILL_GAPS, type CalibrationReport } from '@/engine/match/calibration/run'

const SEED = 20261010
const GATE_METRICS = [
    'rounds_per_map', 'ot_rate', 'loser_le3_share', 'kills_per_round', 'trade_share', 'clutches_won_per_map', 'multikill_index',
    'rating_mean', 'impossible_states', 'fav_win_gap_*', 'fav_curve_max_drop', 'path_parity_*', 'nonplayer_cap_*',
]

describe(`calibration gate (${DEFAULT_MATCH_ENGINE})`, () => {
    let report: CalibrationReport
    const value = (id: string): number => {
        const m = report.metrics.find(x => x.id === id)
        if (!m || m.value === null) throw Error(`metric ${id} was not measured`)
        return m.value
    }

    // ~760 BO1 maps: ~2.5 s on legacy-v2; the timeout leaves room for a slower engine.
    beforeAll(() => {
        report = runCalibration({ engine: DEFAULT_MATCH_ENGINE, samples: 120, seed: SEED, metrics: GATE_METRICS })
    }, 50_000)

    test('the default engine is runnable and was measured', () => {
        expect(isMatchEngineRunnable(DEFAULT_MATCH_ENGINE)).toBe(true)
        expect(report.available).toBe(true)
        expect(report.mapsSimulated).toBeGreaterThan(500)
    })

    test('maps are shaped like CS maps', () => {
        expect(value('rounds_per_map')).toBeGreaterThanOrEqual(18)
        expect(value('rounds_per_map')).toBeLessThanOrEqual(24)
        expect(value('ot_rate')).toBeLessThan(20)
        expect(value('loser_le3_share')).toBeLessThan(30)
        expect(value('kills_per_round')).toBeGreaterThan(4)
        expect(value('kills_per_round')).toBeLessThan(9)
        expect(value('rating_mean')).toBeGreaterThan(0.7)
        expect(value('rating_mean')).toBeLessThan(1.3)
    })

    test('no impossible states (timeline, win reasons, scores, stats)', () => {
        expect(report.violations).toEqual({})
        expect(value('impossible_states')).toBe(0)
    })

    test('clutches and trades happen', () => {
        expect(value('clutches_won_per_map')).toBeGreaterThan(0)
        expect(value('trade_share')).toBeGreaterThan(0)
        expect(value('trade_share')).toBeLessThan(40)
        // Kills are neither spread like a coin flip nor piled on one player (HLTV: ≈ 1.88).
        expect(value('multikill_index')).toBeGreaterThan(1.5)
        expect(value('multikill_index')).toBeLessThan(2.3)
    })

    test('the favourite wins more often as the skill gap grows', () => {
        const curve = SKILL_GAPS.map(gap => value(`fav_win_gap_${gap}`))
        for (let i = 1; i < curve.length; i++) expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1] - 6)
        expect(value('fav_curve_max_drop')).toBeLessThanOrEqual(6)
        expect(curve[0]).toBeGreaterThan(45)
        expect(curve[curve.length - 1]).toBeGreaterThan(75)
        expect(curve[curve.length - 1] - curve[0]).toBeGreaterThanOrEqual(15)
    })

    test('the managed and AI paths agree', () => {
        expect(Math.abs(value('path_parity_fav_win'))).toBeLessThanOrEqual(10)
        expect(Math.abs(value('path_parity_rounds'))).toBeLessThanOrEqual(1.5)
    })

    test('the non-player bonus cap holds on both paths', () => {
        // Uncapped, the AI path once gave a level-5 coach +40 map-win points.
        expect(value('nonplayer_cap_managed')).toBeLessThanOrEqual(15)
        expect(value('nonplayer_cap_ai')).toBeLessThanOrEqual(15)
    })

    test('deterministic for a seed', () => {
        const run = () => runCalibration({ engine: DEFAULT_MATCH_ENGINE, samples: 14, seed: SEED + 1, metrics: ['rounds_per_map', 'trade_share', 'fav_win_gap_10'] })
            .metrics.map(m => [m.id, m.value])
        expect(run()).toEqual(run())
    }, 20_000)
})

test('an engine that is not runnable yet is reported, not simulated', () => {
    for (const engine of MATCH_ENGINES.filter(e => !isMatchEngineRunnable(e))) {
        const report = runCalibration({ engine, samples: 10, seed: SEED })
        expect(report.available).toBe(false)
        expect(report.mapsSimulated).toBe(0)
        expect(report.metrics.every(m => m.status === 'n/a')).toBe(true)
    }
})
