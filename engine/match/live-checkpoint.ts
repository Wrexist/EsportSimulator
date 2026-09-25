import { restoreTimeoutState } from "./manager-controls"
import { MapId, type ActiveMatchState } from '@/types'
import type { MatchEvent } from '@/types/match'

export const LEGACY_MATCH_ENGINE = 'legacy-v2' as const
export interface LivePlaybackCheckpoint {
    version: 1
    saveId?: string | null
    engine: typeof LEGACY_MATCH_ENGINE
    events: MatchEvent[]
    processedTime: number
    maps: string[]
    seed: number
    homeRoster: string[]
    awayRoster: string[]
}

/** Restore the original event queue; never simulate another round to repair a checkpoint. */
export function restoreLivePlayback(saved: ActiveMatchState): LivePlaybackCheckpoint {
    restoreTimeoutState(saved.timeoutsRemaining, saved.timeoutBoostRounds)
    const existing = saved.playback
    if (existing && (existing.version !== 1 || existing.engine !== LEGACY_MATCH_ENGINE)) throw Error('This match uses an unsupported replay engine')
    const result = saved.matchResult as unknown as { maps?: { map: string; rounds?: { roundNumber?: number; events?: MatchEvent[] }[] }[] }
    const maps = result?.maps || []
    const round = maps[saved.gameState.currentMapIndex]?.rounds?.find(r => r.roundNumber === saved.gameState.round)
    const events = existing?.events || round?.events || []
    if (existing && (!Number.isInteger(existing.seed) || existing.seed < 0 || existing.seed > 4294967295 || !Array.isArray(existing.maps) || !existing.maps.length || existing.maps.length > 5 || new Set(existing.maps).size !== existing.maps.length || existing.maps.some(m => !Object.values(MapId).includes(m as MapId)))) throw Error('Invalid replay map or seed identity')
    const processedTime = existing?.processedTime ?? saved.gameState.time ?? -1
    if (!Array.isArray(events) || events.length > 512 || events.some(e => !e || !['BUY','KILL','PLANT','DEFUSE','EXPLODE','ROUND_END','SAVE','CLUTCH'].includes(e.type) || !Number.isFinite(e.time) || e.time < 0 || e.time > 600) || !Number.isFinite(processedTime) || processedTime < -1 || processedTime > 600) throw Error('Invalid live event checkpoint')
    if (!saved.isWaitingForStrategy && saved.gameState.status === 'IN_PROGRESS' && !events.some(e => e.type === 'ROUND_END')) throw Error('This older checkpoint is missing its round events. Restore a pre-match recovery save; the round cannot be reconstructed safely.')
    return { version: 1, engine: LEGACY_MATCH_ENGINE, ...(existing?.saveId !== undefined ? { saveId: existing.saveId } : {}), events: events.map(e => ({ ...e })), processedTime, maps: existing?.maps || maps.map(m => m.map), seed: existing?.seed ?? 0, homeRoster: existing?.homeRoster || saved.homeRoster.map(p => p.id), awayRoster: existing?.awayRoster || saved.awayRoster.map(p => p.id) }
}

/** Legacy playback groups fractional event timestamps into simulation-second buckets. */
export function pendingLiveEvents(events: MatchEvent[], from: number, to: number): MatchEvent[] {
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return []
    return events.filter(e => Math.floor(e.time) > from && Math.floor(e.time) <= to).sort((a,b) => a.time - b.time)
}
