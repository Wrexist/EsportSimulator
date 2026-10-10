/**
 * Match engine versions (no imports: shared by the stepper, the live
 * checkpoint, the store and the registry without cycles).
 *
 *   legacy-v2  weighted round coin flip + invented kills (engine/match/round-outcome.ts)
 *   script-v1  rounds decided by plans, positions, utility, duels and the bomb
 *              (engine/match/round-sim), CS2 economy
 *
 * Rules (engine/match/engine-registry.ts resolveEngineVersion):
 *   - a match that records a version keeps it;
 *   - a live checkpoint keeps the engine it was started with (every
 *     checkpoint written before script-v1 says legacy-v2);
 *   - anything new uses DEFAULT_ENGINE_VERSION.
 */

export const LEGACY_ENGINE_VERSION = "legacy-v2" as const
export const SCRIPT_ENGINE_VERSION = "script-v1" as const
export type EngineVersion = typeof LEGACY_ENGINE_VERSION | typeof SCRIPT_ENGINE_VERSION
export const ENGINE_VERSIONS: readonly EngineVersion[] = [LEGACY_ENGINE_VERSION, SCRIPT_ENGINE_VERSION]
export const DEFAULT_ENGINE_VERSION: EngineVersion = SCRIPT_ENGINE_VERSION

export function isEngineVersion(v: unknown): v is EngineVersion {
    return v === LEGACY_ENGINE_VERSION || v === SCRIPT_ENGINE_VERSION
}

/**
 * The engine a match plays on: its recorded version, else the default.
 * Throws on an unknown recorded version (never guess an engine for a save).
 */
export function resolveEngineVersion(recorded: unknown): EngineVersion {
    if (recorded === undefined || recorded === null || recorded === "") return DEFAULT_ENGINE_VERSION
    if (isEngineVersion(recorded)) return recorded
    throw Error("Unsupported match engine")
}
