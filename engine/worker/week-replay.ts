import type { GameSave } from '../save-types'
import type { WeekProcessorConfig } from '../atomic-week-processor'

export const WEEK_REPLAY_VERSION = 1
export interface WeekReplayInput {
    version: typeof WEEK_REPLAY_VERSION
    save: GameSave
    rngState: number
    config: { playerTeamId: string; trainingFocus: Array<[string, { focus: import('@/types').TrainingFocus; intensity: number }]> }
}

export function captureWeekReplay(save: GameSave, config: WeekProcessorConfig, rngState: number): WeekReplayInput {
    return structuredClone({ version: WEEK_REPLAY_VERSION, save, rngState,
        config: { playerTeamId: config.playerTeamId, trainingFocus: Array.from(config.trainingFocus.entries()) } })
}

// Only commit-time metadata is excluded. Nested dates, array order, IDs, amounts,
// match results, progress and RNG remain part of equality.
export function canonicalWeekState(save: GameSave): string {
    const { updatedAt, lastPlayedAt, integrityHash, ...durable } = save
    void updatedAt; void lastPlayedAt; void integrityHash
    const ordered = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(ordered)
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, ordered(child)]))
        if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Replay contains a non-finite number')
        return value
    }
    return JSON.stringify(ordered(durable))
}
