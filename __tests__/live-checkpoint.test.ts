import type { ActiveMatchState } from '@/types'
import { restoreLivePlayback, pendingLiveEvents } from '@/engine/match/live-checkpoint'
import { buildSaveSnapshot, type SaveSnapshotState } from '@/store/utils/build-save-snapshot'
import { freeze } from 'immer'
import { buildCanonicalResultMaps } from '@/lib/live-match-builders'
import { MapId, type MapResult } from '@/types'

function checkpoint(): ActiveMatchState {
    return { matchId: 'match', gameState: { currentMapIndex: 0, round: 3, time: 21, status: 'IN_PROGRESS' }, isWaitingForStrategy: false,
        homeRoster: [{ id: 'h', isDead: true, kills: 2, deaths: 1, money: 600, weapon: 'ak47' }], awayRoster: [{ id: 'a', isDead: false }],
        matchResult: { maps: [{ map: 'Nuke', rounds: [{ roundNumber: 3, events: [{ type: 'KILL', time: 20.1, playerId: 'a', targetId: 'h' }, { type: 'PLANT', time: 30.2 }, { type: 'ROUND_END', time: 70 }] }] }] },
    } as unknown as ActiveMatchState
}
test('old mid-round checkpoint restores recorded events without regenerating or resurrecting players', () => {
    const saved = checkpoint(), before = JSON.stringify(saved), playback = restoreLivePlayback(saved)
    expect(playback.engine).toBe('legacy-v2')
    expect(playback.maps).toEqual(['Nuke'])
    expect(pendingLiveEvents(playback.events, playback.processedTime, 70).map(e => e.type)).toEqual(['PLANT', 'ROUND_END'])
    expect(JSON.stringify(saved)).toBe(before)
    expect(saved.homeRoster[0].isDead).toBe(true)
})
test('new event queue, cursor and seed zero survive the actual career snapshot serializer', () => {
    const saved = checkpoint()
    saved.playback = { ...restoreLivePlayback(saved), seed: 0, saveId: 'career' }
    const snapshot = buildSaveSnapshot({ saveId: 'career', activeMatchId: 'match', activeMatchState: saved } as SaveSnapshotState)
    const restored = JSON.parse(JSON.stringify(snapshot)).activeMatchState
    expect(restoreLivePlayback(restored)).toEqual(saved.playback)
    expect(restored.homeRoster).toEqual(saved.homeRoster)
})
test('missing round and unknown version fail instead of simulating a replacement outcome', () => {
    const saved = checkpoint(); (saved.matchResult as any).maps[0].rounds = []
    expect(() => restoreLivePlayback(saved)).toThrow('missing its round events')
    saved.playback = { version: 99 } as any
    expect(() => restoreLivePlayback(saved)).toThrow('unsupported replay engine')
})
test('fractional timestamps apply once across live stepping, skip and a serialized resume', () => {
    const events = restoreLivePlayback(checkpoint()).events
    const live = Array.from({ length: 72 }, (_, i) => pendingLiveEvents(events, i - 1, i)).flat()
    const skipped = pendingLiveEvents(events, -1, 71)
    const resumed = [...pendingLiveEvents(events, -1, 21), ...pendingLiveEvents(JSON.parse(JSON.stringify(events)), 21, 71)]
    expect(live).toEqual(skipped); expect(resumed).toEqual(skipped)
    expect(pendingLiveEvents(events, 71, 71)).toEqual([])
})

test('repeated save-store restores keep recorded playback and future round history independently mutable', () => {
    let saved = checkpoint()
    const original = JSON.stringify(saved)
    for (const nextRound of [4, 5, 6]) {
        const snapshot = buildSaveSnapshot({ saveId: 'career', activeMatchId: 'match', activeMatchState: saved } as SaveSnapshotState)
        const persisted = freeze(JSON.parse(JSON.stringify(snapshot)).activeMatchState as ActiveMatchState, true)
        const before = JSON.stringify(persisted)
        const playback = restoreLivePlayback(persisted)
        expect(pendingLiveEvents(playback.events, playback.processedTime, 70).map(e => e.type)).toEqual(['PLANT', 'ROUND_END'])
        const maps = buildCanonicalResultMaps(persisted.matchResult!.maps as unknown as MapResult[], [MapId.NUKE], 'h', 'a', undefined, 0)
        maps[0].rounds.push({ roundNumber: nextRound, events: playback.events.map(e => ({ ...e })) } as MapResult['rounds'][number])
        expect(JSON.stringify(persisted)).toBe(before)
        expect(maps[0].rounds.map(r => r.roundNumber)).toEqual(Array.from({ length: nextRound - 2 }, (_, i) => i + 3))
        saved = {
            ...persisted,
            gameState: { ...persisted.gameState, round: nextRound },
            matchResult: { ...persisted.matchResult!, maps } as unknown as ActiveMatchState['matchResult'],
        }
    }
    expect(JSON.stringify(checkpoint())).toBe(original)
})
