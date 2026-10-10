/**
 * Match-engine registry: which round engines exist, which one new matches
 * use, which ones the production series paths can run, and the round engine
 * object for each.
 *
 *   legacy-v2   resolver coin flip + invented kills (engine/match-simulation.ts,
 *               engine/match/round-outcome.ts). Every save before Phase 2B.
 *   script-v1   Phase 2B round engine: plans, positions, utility, duels and
 *               the bomb decide the round (engine/match/round-sim/), CS2
 *               economy (round-sim/economy.ts).
 *
 * Both production series paths pick the round engine from the match's
 * `engineVersion` stamp (SimulationEngineV2.createSeriesContext): the managed
 * path (prepareLegacySeries → runLegacySeries → finalizeLegacySeries) and the
 * AI path (MatchEngine.simulateMatch). Version rules
 * (engine/match/engine-version.ts):
 *   - a match that records a version keeps it;
 *   - a live checkpoint keeps the engine it started with (every checkpoint
 *     written before script-v1 says legacy-v2);
 *   - anything new uses DEFAULT_MATCH_ENGINE.
 *
 * To run a series on a given engine: stamp `match.engineVersion` before
 * createSeriesContext / prepareLegacySeries, or re-target a built context
 * with `withEngine(ctx, version)`.
 */

import { simulationEngineV2 } from '../match-simulation'
import type { LegacyRoundEngine, LegacySeriesContext } from './legacy-series'
import {
    DEFAULT_ENGINE_VERSION, ENGINE_VERSIONS, LEGACY_ENGINE_VERSION, SCRIPT_ENGINE_VERSION,
    isEngineVersion, resolveEngineVersion, type EngineVersion,
} from './engine-version'

export { DEFAULT_ENGINE_VERSION, LEGACY_ENGINE_VERSION, SCRIPT_ENGINE_VERSION, resolveEngineVersion, type EngineVersion }

export const MATCH_ENGINES = ENGINE_VERSIONS
export type MatchEngineId = EngineVersion

/** Engine stamped on newly created matches. */
export const DEFAULT_MATCH_ENGINE: MatchEngineId = DEFAULT_ENGINE_VERSION

/** Engines the production series paths accept in `match.engineVersion`. */
const RUNNABLE: Record<MatchEngineId, boolean> = {
    'legacy-v2': true,
    'script-v1': true,
}

export function isMatchEngineId(value: unknown): value is MatchEngineId {
    return isEngineVersion(value)
}

/** True when a match stamped with this engine can be simulated by the production series paths. */
export function isMatchEngineRunnable(engine: MatchEngineId): boolean {
    return RUNNABLE[engine]
}

/** The round engine (stepper seam) for a version. */
export function getRoundEngine(version: MatchEngineId): LegacyRoundEngine {
    return simulationEngineV2.roundEngineFor(version)
}

/** A copy of a built series context re-targeted to another engine (round engine, rules and per-series data). */
export function withEngine(ctx: LegacySeriesContext, version: MatchEngineId): LegacySeriesContext {
    return simulationEngineV2.retargetSeriesContext(ctx, version)
}
