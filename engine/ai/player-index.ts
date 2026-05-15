/**
 * Player-id → player Map cached on the GameSave for the duration of
 * one week tick. Used by every AI sub-routine that needs O(1) lookups
 * on the player array instead of repeated O(n) `.find()` calls.
 *
 * Cache invalidation: keyed on (currentWeek, players.length) so the
 * map rebuilds when the week advances OR when the player list grows
 * (new prospect created, free agent signed, retiree removed). The
 * `players.length` check is conservative — it doesn't catch mutations
 * to existing entries, but those don't change the id→ref mapping.
 *
 * Extracted from ai-manager.ts (Phase K2). Lives in engine/ai/ so any
 * AI subsystem can import it without taking a dependency on the
 * orchestrator class.
 */

import type { GameSave, PlayerSaveData } from "../save-types"

const CACHE_KEY = "__aiPlayerIndex" as const

interface CacheEntry {
    week: number
    map: Map<string, PlayerSaveData>
}

export function getPlayerIndex(save: GameSave): Map<string, PlayerSaveData> {
    const bag = save as unknown as Record<string, unknown>
    const cache = bag[CACHE_KEY] as CacheEntry | undefined
    if (cache && cache.week === save.currentWeek && cache.map.size === save.players.length) {
        return cache.map
    }

    const map = new Map<string, PlayerSaveData>()
    for (const p of save.players) {
        map.set(p.id, p)
    }
    bag[CACHE_KEY] = { week: save.currentWeek, map } satisfies CacheEntry
    return map
}
