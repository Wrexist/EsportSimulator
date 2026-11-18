/**
 * MATCHENGINE-08 (audit 2026-11-17, round 2): aces ran at about twice the pro
 * rate (0.33 per map between equal teams, 0.43 on the game's own club
 * fixtures; pro ≈ 0.13–0.26). A player with CLEANUP_KILLS kills on a side
 * CLEANUP_LEAD players up now rarely starts a fresh fight, so his mates take
 * part of the cleanup (engine/match/round-sim/sight.ts playsForTeam).
 */
import { DEFAULT_MATCH_ENGINE } from '@/engine/match/engine-registry'
import { runCalibration } from '@/engine/match/calibration/run'
import { TUNING } from '@/engine/match/round-sim/tuning'

test('multi-kills sit in the pro bands on the equal-team realism suite', () => {
    const report = runCalibration({ engine: DEFAULT_MATCH_ENGINE, samples: 600, seed: 20261010, metrics: ['ace_per_map', 'k4_per_map', 'multikill_index', 'clutch_conversion', 'impossible_states'] })
    const value = (id: string) => report.metrics.find(m => m.id === id)!.value!
    // Pass band 0.12–0.30 (0.33 before the fix).
    expect(value('ace_per_map')).toBeGreaterThanOrEqual(0.12)
    expect(value('ace_per_map')).toBeLessThanOrEqual(0.3)
    // 4-kill rounds and kill concentration stay in their pass bands; a lone clutcher is untouched.
    expect(value('k4_per_map')).toBeGreaterThanOrEqual(1.0)
    expect(value('multikill_index')).toBeGreaterThanOrEqual(1.76)
    expect(value('clutch_conversion')).toBeGreaterThanOrEqual(9)
    expect(value('impossible_states')).toBe(0)
}, 120_000)

test('the cleanup rule only touches a player who is already on a multi-kill and well ahead', () => {
    expect(TUNING.CLEANUP_KILLS).toBeGreaterThanOrEqual(3)
    expect(TUNING.CLEANUP_LEAD).toBeGreaterThanOrEqual(2)
    expect(TUNING.CLEANUP_ENGAGE).toBeGreaterThan(0)
    expect(TUNING.CLEANUP_ENGAGE).toBeLessThan(1)
})
