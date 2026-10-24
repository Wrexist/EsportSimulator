/**
 * Durable live checkpoint: a reload mid-match resumes the match that was on
 * screen, and "Skip match" after that reload finishes it with the same rounds
 * it would have played without the reload.
 */
import type { ActiveMatchState } from '@/types'
import type { AsyncStorage } from '@/engine/storage-adapter'
import { contextFor } from '@/scripts/launch/l21-paired-scenarios'
import { createLaunchFixture } from '@/scripts/launch/fixtures'
import { createDefaultTactics } from '@/engine/default-tactics'
import { createLegacySeriesState, playLegacyRound, type LegacySeriesContext, type LegacySeriesState } from '@/engine/match/legacy-series'
import { restoreLivePlayback } from '@/engine/match/live-checkpoint'
import { finishLegacySeriesFromState, restoreLiveSeriesState } from '@/lib/live-match-builders'
import { chooseLiveCheckpoint, createLiveCheckpointStore, LIVE_CHECKPOINT_PREFIX, type StoredLiveCheckpoint } from '@/lib/live-checkpoint-store'

jest.setTimeout(120_000)

function memoryStorage(delayMs = 0) {
    const data = new Map<string, string>()
    const writes: string[] = []
    const wait = () => new Promise(r => setTimeout(r, delayMs))
    const storage: AsyncStorage = {
        async getItem(key) { await wait(); return data.get(key) ?? null },
        async setItem(key, value) { await wait(); writes.push(value); data.set(key, value) },
        async removeItem(key) { await wait(); data.delete(key) },
    }
    return { storage, data, writes }
}

/** The checkpoint the live screen writes after `step` (between rounds or mid-round). */
function liveCheckpoint(ctx: LegacySeriesContext, state: LegacySeriesState, lastEvents: ActiveMatchState['playback'] extends infer P ? P extends { events: infer E } ? E : never : never, opts: { waiting: boolean; processedTime: number }): ActiveMatchState {
    const last = state.sim.lastRound!
    return {
        matchId: 'match_1',
        playback: {
            version: 1, engine: ctx.engineVersion!, saveId: 'save_1', events: lastEvents, processedTime: opts.processedTime, exactTime: true,
            maps: ctx.maps, seed: ctx.seed, homeRoster: ctx.home.players.map(p => p.id), awayRoster: ctx.away.players.map(p => p.id),
        },
        gameState: { round: last.roundNumber, homeScore: last.homeRounds, awayScore: last.awayRounds, homeSeriesScore: state.sim.homeSeriesScore, awaySeriesScore: state.sim.awaySeriesScore, status: 'IN_PROGRESS', time: opts.processedTime, isPaused: false, currentMapIndex: last.mapIndex },
        simState: state.sim,
        homeRoster: [], awayRoster: [], logs: [],
        isWaitingForStrategy: opts.waiting,
        timeoutsRemaining: 2, timeoutBoostRounds: 0,
        matchResult: { maps: state.maps },
    } as unknown as ActiveMatchState
}

describe('reload mid-match, then skip', () => {
    const save = createLaunchFixture('first-week', 3921)

    test.each([
        [11, 6, true],
        [4040, 9, false],
        [90210, 17, true],
        [7, 14, false],
    ])('seed %i after %i rounds (between rounds: %s): same series as without the reload', async (seed, played, waiting) => {
        const tactics = createDefaultTactics()
        const ctx = contextFor(save, seed, tactics)
        let state = createLegacySeriesState(ctx)
        let events: any[] = []
        for (let i = 0; i < played; i++) {
            const step = playLegacyRound(ctx, state, { strategy: i === 3 ? 'FORCE' : undefined, customTactics: tactics })
            state = step.state
            events = step.round.events
        }
        const roundEnd = Math.max(...events.map(e => e.time))
        const checkpoint = liveCheckpoint(ctx, state, events, { waiting, processedTime: waiting ? roundEnd + 1 : roundEnd / 2 })

        // Through the durable store and a JSON round trip, as a reload does.
        const { storage } = memoryStorage()
        const store = createLiveCheckpointStore(storage, () => 2_000)
        await store.write('save_1', checkpoint)
        const stored = await store.read('save_1')
        const resumed = chooseLiveCheckpoint({ stored, saveId: 'save_1', saveUpdatedAt: new Date(1_000).toISOString(), scheduledMatchIds: ['match_1'], completedMatchIds: [], savedActive: null })
        expect(resumed).not.toBeNull()

        const reloadedCtx = contextFor(save, seed, tactics)
        const playback = restoreLivePlayback(resumed!)
        const restored = restoreLiveSeriesState({ ctx: reloadedCtx, checkpoint: resumed!, playback, homePlayers: reloadedCtx.home.players, awayPlayers: reloadedCtx.away.players })
        expect(restored.inFlight).toBe(!waiting)
        expect(restored.sim).toEqual(expect.objectContaining({ homeRounds: state.sim.homeRounds, awayRounds: state.sim.awayRounds, currentRound: state.sim.currentRound }))
        expect(restored.maps.map(m => m.rounds.length)).toEqual(state.maps.map(m => m.rounds.length))

        const withoutReload = finishLegacySeriesFromState(ctx, state, { regroupRounds: 0, customTactics: tactics })
        const afterReload = finishLegacySeriesFromState(reloadedCtx, { sim: restored.sim, maps: restored.maps, finished: false }, { regroupRounds: 0, customTactics: tactics })
        expect(afterReload.state.maps.map(m => `${m.homeScore}-${m.awayScore}`)).toEqual(withoutReload.state.maps.map(m => `${m.homeScore}-${m.awayScore}`))
        expect(afterReload.state.maps).toEqual(withoutReload.state.maps)
        expect(afterReload.state.sim).toEqual(withoutReload.state.sim)
    })
})

describe('createLiveCheckpointStore', () => {
    const state = (round: number) => ({ matchId: 'm', gameState: { round } }) as unknown as ActiveMatchState

    test('keeps the newest checkpoint when writes overlap, and clear removes it', async () => {
        const { storage, data, writes } = memoryStorage(5)
        const store = createLiveCheckpointStore(storage)
        const all = [1, 2, 3, 4].map(r => store.write('s', state(r)))
        await Promise.all(all)
        expect((await store.read('s'))!.state.gameState.round).toBe(4)
        // Overlapping writes are coalesced: the first and the last reach storage.
        expect(writes.length).toBeLessThan(4)
        await store.write('s', state(5))
        await store.clear('s')
        expect(data.has(LIVE_CHECKPOINT_PREFIX + 's')).toBe(false)
        expect(await store.read('s')).toBeNull()
    })

    test('unreadable or foreign entries are ignored', async () => {
        const { storage, data } = memoryStorage()
        const store = createLiveCheckpointStore(storage)
        data.set(LIVE_CHECKPOINT_PREFIX + 's', '{not json')
        expect(await store.read('s')).toBeNull()
        data.set(LIVE_CHECKPOINT_PREFIX + 's', JSON.stringify({ version: 1, saveId: 'other', savedAt: 1, state: state(1) }))
        expect(await store.read('s')).toBeNull()
    })
})

describe('chooseLiveCheckpoint', () => {
    const stored = (over: Partial<StoredLiveCheckpoint> = {}): StoredLiveCheckpoint => ({
        version: 1, saveId: 's', savedAt: Date.parse('2026-10-24T12:00:05Z'),
        state: { matchId: 'm', playback: { saveId: 's' } } as unknown as ActiveMatchState, ...over,
    })
    const base = { saveId: 's', saveUpdatedAt: '2026-10-24T12:00:00Z', scheduledMatchIds: ['m'], completedMatchIds: [] as string[], savedActive: null }

    test('a checkpoint newer than the save resumes its match', () => {
        expect(chooseLiveCheckpoint({ ...base, stored: stored() })?.matchId).toBe('m')
        expect(chooseLiveCheckpoint({ ...base, stored: stored(), savedActive: { matchId: 'm' } as ActiveMatchState })?.matchId).toBe('m')
    })
    test('the save wins when it is newer, the match is played or gone, or it belongs elsewhere', () => {
        expect(chooseLiveCheckpoint({ ...base, stored: stored(), saveUpdatedAt: '2026-10-24T12:00:06Z' })).toBeNull()
        expect(chooseLiveCheckpoint({ ...base, stored: stored(), completedMatchIds: ['m'] })).toBeNull()
        expect(chooseLiveCheckpoint({ ...base, stored: stored(), scheduledMatchIds: [] })).toBeNull()
        expect(chooseLiveCheckpoint({ ...base, stored: stored({ saveId: 'x' }) })).toBeNull()
        expect(chooseLiveCheckpoint({ ...base, stored: stored({ state: { matchId: 'm', playback: { saveId: 'x' } } as unknown as ActiveMatchState }) })).toBeNull()
        expect(chooseLiveCheckpoint({ ...base, stored: stored(), savedActive: { matchId: 'other' } as ActiveMatchState })).toBeNull()
        expect(chooseLiveCheckpoint({ ...base, stored: null })).toBeNull()
    })
})
