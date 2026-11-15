/**
 * Browser tabs: write a change to disk shortly after it happens.
 *
 * A save started from `beforeunload` cannot finish: the leave prompt blocks
 * the page and the reload then tears it down mid-write, so every action since
 * the last save was lost on reload. With auto-save on, a career action
 * (signing, hiring, a roster pick) is saved a moment later instead, so the
 * write has completed long before the player reloads.
 */
import { DURABLE_CAREER_KEYS } from "@/lib/unsaved-changes"

interface SaveSoonState {
    saveId?: string | null
    isInitialized?: boolean
    isLoading?: boolean
    continueRun?: unknown
}

interface SaveSoonOptions<S extends SaveSoonState> {
    subscribe: (listener: (state: S, previous: S) => void) => () => void
    getState: () => S
    /** Auto-save on and nothing else owns saving right now (desktop close path, live match). */
    enabled: () => boolean
    hasUnsavedChanges: (state: S) => boolean
    save: () => Promise<void>
    delayMs?: number
}

/** True when a field the save writes changed (toasts and other UI state do not count). */
export function durableStateChanged(state: object, previous: object): boolean {
    const a = state as Record<string, unknown>
    const b = previous as Record<string, unknown>
    return DURABLE_CAREER_KEYS.some(key => a[key] !== b[key])
}

export function createSaveSoon<S extends SaveSoonState>(options: SaveSoonOptions<S>) {
    const delayMs = options.delayMs ?? 1200
    let timer: ReturnType<typeof setTimeout> | null = null
    let disposed = false

    const ready = (state: S) =>
        !!state.saveId && state.isInitialized !== false && !state.isLoading && !state.continueRun && options.enabled()

    const fire = () => {
        timer = null
        if (disposed) return
        const state = options.getState()
        // A week tick or Continue run saves when it ends.
        if (!ready(state) || !options.hasUnsavedChanges(state)) return
        void options.save().catch(() => { /* saveGame shows its own error */ })
    }

    const unsubscribe = options.subscribe((state, previous) => {
        if (disposed || !durableStateChanged(state, previous) || !ready(state)) return
        if (timer) clearTimeout(timer)
        timer = setTimeout(fire, delayMs)
    })

    return {
        dispose() {
            disposed = true
            if (timer) clearTimeout(timer)
            timer = null
            unsubscribe()
        },
    }
}
