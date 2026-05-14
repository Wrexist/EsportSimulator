/**
 * Lazy wrapper around `canvas-confetti`.
 *
 * The static import of `canvas-confetti` was being bundled into every route
 * that touched celebration components (match result, tournament bracket,
 * advancement animation, legend pick modal, create-team, etc.), pulling
 * ~10 KB into the initial chunk. Almost all of those routes only ever fire
 * confetti as a delayed reward; loading it on demand keeps the cold-path
 * bundle smaller.
 *
 * Usage:
 *   import { fireConfetti } from "@/lib/confetti-lazy"
 *   fireConfetti({ particleCount: 100, spread: 70 })
 */

// `canvas-confetti` ships as a CommonJS module (`export = confetti`), so
// `typeof import("canvas-confetti")` is the bare function namespace — it
// has no `.default`. The runtime dynamic-import value, however, is wrapped
// by esModuleInterop into `{ default: confetti, shapeFromPath, ... }`.
// We capture both shapes separately so the typings line up with reality.
import type confettiFn from "canvas-confetti"

export type ConfettiOptions = Parameters<typeof confettiFn>[0]
export type ConfettiResult = ReturnType<typeof confettiFn>

type ConfettiModule = { default: typeof confettiFn }

let modulePromise: Promise<ConfettiModule> | null = null

function loadConfetti(): Promise<ConfettiModule> {
    if (!modulePromise) {
        // Reset on failure so a transient network/chunk error doesn't poison
        // the cache for the rest of the session.
        modulePromise = (import("canvas-confetti") as unknown as Promise<ConfettiModule>).catch(err => {
            modulePromise = null
            throw err
        })
    }
    return modulePromise
}

/**
 * Trigger a confetti burst. Returns a promise that resolves to the
 * underlying `confetti()` return value once the lib has loaded.
 *
 * If the lib hasn't loaded yet (first call), the burst will appear after a
 * short async delay — for victory bursts this is imperceptible. For
 * animation loops that need synchronous-on-the-frame access, call
 * `preloadConfetti()` ahead of time.
 */
export function fireConfetti(options?: ConfettiOptions): Promise<ConfettiResult | undefined> {
    return loadConfetti()
        .then(mod => mod.default(options))
        .catch(() => undefined)
}

/**
 * Preload the lib so subsequent `fireConfetti` calls are synchronous on the
 * next frame. Call from a useEffect on the screen that's about to need it.
 */
export function preloadConfetti(): Promise<void> {
    return loadConfetti().then(() => void 0).catch(() => void 0)
}
