/**
 * Durable live-match checkpoint.
 *
 * The career save (25 MB by week 52) is written by the auto-save timer, on
 * close and after day steps, never mid-match. A reload or crash during a
 * live match therefore restarted it from the last career save: round 1, or
 * the match not played at all, so watching it again (or skipping it) played
 * a different match. The live screen now also writes its checkpoint (the
 * `ActiveMatchState`, a few hundred KB at most) under its own key, and a
 * career load adopts it when it is newer than the save.
 *
 * The checkpoint never replaces anything else in the save: only
 * `activeMatchId` / `activeMatchState`, and only for a match that is still
 * on the loaded save's schedule and not yet played.
 */

import type { ActiveMatchState } from "@/types"
import { asyncStorage, type AsyncStorage } from "@/engine/storage-adapter"

export const LIVE_CHECKPOINT_PREFIX = "esports_live_checkpoint_"
const VERSION = 1

export interface StoredLiveCheckpoint {
    version: number
    saveId: string
    /** Epoch ms when the checkpoint was written. */
    savedAt: number
    state: ActiveMatchState
}

const keyOf = (saveId: string) => LIVE_CHECKPOINT_PREFIX + saveId

/**
 * Writes are chained so an older checkpoint never lands after a newer one,
 * and coalesced: while one write is in flight only the latest pending
 * checkpoint is kept.
 */
export function createLiveCheckpointStore(storage: AsyncStorage = asyncStorage, now: () => number = Date.now) {
    let chain: Promise<void> = Promise.resolve()
    let pending: { saveId: string; text: string } | null = null
    let draining = false

    const drain = (): Promise<void> => {
        if (draining) return chain
        draining = true
        chain = chain.then(async () => {
            while (pending) {
                const next = pending
                pending = null
                try { await storage.setItem(keyOf(next.saveId), next.text) } catch { /* the career save still holds the last auto-save */ }
            }
            draining = false
        })
        return chain
    }

    return {
        write(saveId: string, state: ActiveMatchState): Promise<void> {
            const entry: StoredLiveCheckpoint = { version: VERSION, saveId, savedAt: now(), state }
            pending = { saveId, text: JSON.stringify(entry) }
            return drain()
        },
        async read(saveId: string): Promise<StoredLiveCheckpoint | null> {
            await chain
            try {
                const text = await storage.getItem(keyOf(saveId))
                if (!text) return null
                const parsed = JSON.parse(text) as StoredLiveCheckpoint
                return parsed && parsed.version === VERSION && parsed.saveId === saveId && parsed.state && typeof parsed.state.matchId === "string" && Number.isFinite(parsed.savedAt) ? parsed : null
            } catch {
                return null
            }
        },
        clear(saveId: string): Promise<void> {
            pending = null
            chain = chain.then(() => storage.removeItem(keyOf(saveId))).catch(() => { /* a stale key is ignored once its match is played */ })
            return chain
        },
        /** Resolves when every queued write has been handed to storage. */
        flush(): Promise<void> { return drain() },
    }
}

export const liveCheckpointStore = createLiveCheckpointStore()

/**
 * The checkpoint to resume after loading a career, or null. It must belong to
 * this save, be newer than the save file, and its match must still be on the
 * schedule and unplayed.
 */
export function chooseLiveCheckpoint(args: {
    stored: StoredLiveCheckpoint | null
    saveId: string
    saveUpdatedAt?: string
    scheduledMatchIds: readonly string[]
    completedMatchIds: readonly string[]
    savedActive?: ActiveMatchState | null
}): ActiveMatchState | null {
    const { stored, saveId } = args
    if (!stored || stored.saveId !== saveId) return null
    const state = stored.state
    if (state.playback?.saveId !== undefined && state.playback.saveId !== saveId) return null
    if (!args.scheduledMatchIds.includes(state.matchId) || args.completedMatchIds.includes(state.matchId)) return null
    // The save was written after this checkpoint (auto-save during the match,
    // or the match finished and the career saved): the save is the truth.
    const saveTime = args.saveUpdatedAt ? Date.parse(args.saveUpdatedAt) : NaN
    if (Number.isFinite(saveTime) && saveTime >= stored.savedAt) return null
    // Another match is checkpointed in the save itself: keep that one.
    if (args.savedActive && args.savedActive.matchId !== state.matchId) return null
    return state
}

/**
 * A match result was just committed to the store: write the career save at
 * once (a reload before the next auto-save would otherwise load the save from
 * before the match and play it again), then drop the live checkpoint. If the
 * save fails the checkpoint stays; it resumes the same match, whose result is
 * the same.
 */
export function persistCommittedMatch(saveId: string | null | undefined, saveGame: (() => Promise<void>) | undefined): Promise<void> {
    if (!saveId || typeof saveGame !== "function") return Promise.resolve()
    return Promise.resolve()
        .then(() => saveGame())
        .then(() => liveCheckpointStore.clear(saveId))
        .catch(() => { /* saveGame reports the failure itself */ })
}
