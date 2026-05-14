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

type ConfettiOptions = Parameters<typeof import("canvas-confetti").default>[0]
type ConfettiResult = ReturnType<typeof import("canvas-confetti").default>

let modulePromise: Promise<typeof import("canvas-confetti")> | null = null

function loadConfetti() {
    if (!modulePromise) {
        // Reset on failure so a transient network/chunk error doesn't poison
        // the cache for the rest of the session.
        modulePromise = import("canvas-confetti").catch(err => {
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
    return loadConfetti().then(mod => mod.default(options)).catch(() => undefined)
}

/**
 * Preload the lib so subsequent `fireConfetti` calls are synchronous on the
 * next frame. Call from a useEffect on the screen that's about to need it.
 */
export function preloadConfetti(): Promise<void> {
    return loadConfetti().then(() => void 0).catch(() => void 0)
}
