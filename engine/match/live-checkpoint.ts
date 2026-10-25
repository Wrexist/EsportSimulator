import { restoreTimeoutState } from "./manager-controls"
import { MapId, type ActiveMatchState } from '@/types'
import type { MatchEvent } from '@/types/match'
import { isEngineVersion, LEGACY_ENGINE_VERSION, type EngineVersion } from './engine-version'

export const LEGACY_MATCH_ENGINE = LEGACY_ENGINE_VERSION
export interface LivePlaybackCheckpoint {
    version: 1
    saveId?: string | null
    /** Engine the match was started on; checkpoints written before script-v1 are legacy-v2 and stay so. */
    engine: EngineVersion
    events: MatchEvent[]
    /**
     * Round time played back so far: every event with `time <= processedTime`
     * has been revealed. Checkpoints without `exactTime` counted whole
     * seconds (`floor(time) <= processedTime`); restore converts them.
     */
    processedTime: number
    /** `processedTime` is exact round time (always set when written or restored now). */
    exactTime?: true
    maps: string[]
    seed: number
    homeRoster: string[]
    awayRoster: string[]
    /** G1: playbook calls each team already ran this series (ScriptSeries.callCounts), so a restore keeps the read penalty. */
    playbookCounts?: [string, number][]
}

/** Valid playbook counts from a checkpoint (anything else is dropped). */
function restorePlaybookCounts(value: unknown): [string, number][] | undefined {
    if (!Array.isArray(value)) return undefined
    const out = value.filter((e): e is [string, number] => Array.isArray(e) && e.length === 2 && typeof e[0] === "string" && e[0].length < 200 && Number.isInteger(e[1]) && e[1] >= 0 && e[1] < 1000)
    return out.length ? out.slice(0, 256) : undefined
}

/** Restore the original event queue; never simulate another round to repair a checkpoint. */
export function restoreLivePlayback(saved: ActiveMatchState): LivePlaybackCheckpoint {
    restoreTimeoutState(saved.timeoutsRemaining, saved.timeoutBoostRounds)
    const existing = saved.playback
    if (existing && (existing.version !== 1 || !isEngineVersion(existing.engine))) throw Error('This match uses an unsupported replay engine')
    const result = saved.matchResult as unknown as { maps?: { map: string; rounds?: { roundNumber?: number; events?: MatchEvent[] }[] }[] }
    const maps = result?.maps || []
    const round = maps[saved.gameState.currentMapIndex]?.rounds?.find(r => r.roundNumber === saved.gameState.round)
    const events = existing?.events || round?.events || []
    if (existing && (!Number.isInteger(existing.seed) || existing.seed < 0 || existing.seed > 4294967295 || !Array.isArray(existing.maps) || !existing.maps.length || existing.maps.length > 5 || new Set(existing.maps).size !== existing.maps.length || existing.maps.some(m => !Object.values(MapId).includes(m as MapId)))) throw Error('Invalid replay map or seed identity')
    const savedTime = existing?.processedTime ?? saved.gameState.time ?? -1
    if (!Array.isArray(events) || events.length > 512 || events.some(e => !e || !['BUY','KILL','PLANT','DEFUSE','EXPLODE','ROUND_END','SAVE','CLUTCH'].includes(e.type) || !Number.isFinite(e.time) || e.time < 0 || e.time > 600) || !Number.isFinite(savedTime) || savedTime < -1 || savedTime > 600) throw Error('Invalid live event checkpoint')
    if (!saved.isWaitingForStrategy && saved.gameState.status === 'IN_PROGRESS' && !events.some(e => e.type === 'ROUND_END')) throw Error('This older checkpoint is missing its round events. Restore a pre-match recovery save; the round cannot be reconstructed safely.')
    const processedTime = existing?.exactTime ? savedTime : exactProcessedTime(events, savedTime)
    return { version: 1, engine: existing?.engine ?? LEGACY_MATCH_ENGINE, ...(existing?.saveId !== undefined ? { saveId: existing.saveId } : {}), events: events.map(e => ({ ...e })), processedTime, exactTime: true, maps: existing?.maps || maps.map(m => m.map), seed: existing?.seed ?? 0, homeRoster: existing?.homeRoster || saved.homeRoster.map(p => p.id), awayRoster: existing?.awayRoster || saved.awayRoster.map(p => p.id), ...(restorePlaybookCounts(existing?.playbookCounts) ? { playbookCounts: restorePlaybookCounts(existing?.playbookCounts) } : {}) }
}

/**
 * A whole-second cursor from an older checkpoint (events with
 * `floor(time) <= t` were played back) as exact round time: the latest such
 * event's time, so exactly the same events count as played.
 */
export function exactProcessedTime(events: readonly MatchEvent[], t: number): number {
    let out = t
    for (const e of events) if (Math.floor(e.time) <= t && e.time > out) out = e.time
    return out
}

/** Events revealed when playback moves from round time `from` to `to`: `from < time <= to`. */
export function pendingLiveEvents(events: MatchEvent[], from: number, to: number): MatchEvent[] {
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return []
    return events.filter(e => e.time > from && e.time <= to).sort((a,b) => a.time - b.time)
}

/** A round is "in flight" while its ROUND_END event has not been played back yet. */
export function roundEndPending(events: MatchEvent[], processedTime: number): boolean {
    return events.some(e => e.type === 'ROUND_END' && e.time > processedTime)
}
