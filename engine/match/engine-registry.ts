/**
 * Match-engine registry: which round engines exist, which one new matches
 * use, and which ones the production series paths can run today.
 *
 *   legacy-v2   resolver coin flip + invented kills (engine/match-simulation.ts,
 *               engine/match/round-outcome.ts). Every save so far.
 *   script-v1   Phase 2B round engine: the round script decides the round
 *               (engine/match/round-sim/).
 *
 * Both production series paths pick the round engine from the match's
 * `engineVersion` stamp: the managed path (prepareLegacySeries →
 * runLegacySeries → finalizeLegacySeries) and the AI path
 * (MatchEngine.simulateMatch). Today createSeriesContext only accepts
 * 'legacy-v2'.
 *
 * Wiring script-v1 (Phase 2B):
 *   1. make createSeriesContext accept `engineVersion: 'script-v1'`;
 *   2. set RUNNABLE['script-v1'] = true — the calibration harness
 *      (engine/match/calibration/run.ts) and its CLI then measure it;
 *   3. when it ships, set DEFAULT_MATCH_ENGINE = 'script-v1' and have the
 *      new-match stamps (store/slices/match-simulation-slice.ts,
 *      hooks/useLiveMatch.ts) read it — the calibration gate
 *      (__tests__/calibration-gate.test.ts) follows DEFAULT_MATCH_ENGINE.
 */

export const MATCH_ENGINES = ['legacy-v2', 'script-v1'] as const
export type MatchEngineId = typeof MATCH_ENGINES[number]

/** Engine stamped on newly created matches. */
export const DEFAULT_MATCH_ENGINE: MatchEngineId = 'legacy-v2'

/** Engines the production series paths accept in `match.engineVersion`. */
const RUNNABLE: Record<MatchEngineId, boolean> = {
    'legacy-v2': true,
    'script-v1': false,
}

export function isMatchEngineId(value: unknown): value is MatchEngineId {
    return typeof value === 'string' && (MATCH_ENGINES as readonly string[]).includes(value)
}

/** True when a match stamped with this engine can be simulated by the production series paths. */
export function isMatchEngineRunnable(engine: MatchEngineId): boolean {
    return RUNNABLE[engine]
}
