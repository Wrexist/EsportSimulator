/**
 * Phase 3 polish: the continuous live clock (lib/live-clock). Round time
 * flows with the key-moments pacing (each round second takes exactly
 * `tickWallMs`), pauses and speed changes keep the round time, and the hook
 * wakes only when the screen changes.
 */
import { LiveClock, liveWakeTimes, nextWakeAfter } from '@/lib/live-clock'
import { FAST_FORWARD_LEAD, computeRoundPacing, inMoment, roundWallMs, tickWallMs } from '@/lib/live-match-pacing'
import { exactProcessedTime, pendingLiveEvents, restoreLivePlayback } from '@/engine/match/live-checkpoint'
import type { ActiveMatchState, MatchEvent } from '@/types'

const ev = (type: MatchEvent['type'], time: number, extra: Partial<MatchEvent> = {}): MatchEvent => ({ type, time, ...extra })
const events: MatchEvent[] = [
    ev('KILL', 18.4, { playerId: 'a', victimId: 'b' }),
    ev('KILL', 41.7, { playerId: 'c', victimId: 'd' }),
    ev('PLANT', 55.2),
    ev('KILL', 71.3, { playerId: 'e', victimId: 'f' }),
    ev('ROUND_END', 73.3),
]
const pacing = computeRoundPacing(events)

describe('live clock', () => {
    it('plays a round in exactly the wall time of the one-second ticks it replaces', () => {
        for (const speed of [1, 2, 4, 8]) {
            const clock = new LiveClock()
            clock.configure(speed, 'moments', 0)
            clock.startRound(pacing, 0, 0)
            clock.setRunning(true, 0)
            const total = clock.wallBetween(0, Math.floor(pacing.endTime))
            expect(total).toBeCloseTo(roundWallMs(pacing, speed, 'moments'), 6)
            // Each second takes its tick's length.
            for (const t of [0, 10, 18, 40, 60]) expect(clock.wallBetween(t, t + 1)).toBeCloseTo(tickWallMs(pacing, t, speed, 'moments'), 6)
        }
    })

    it('flows continuously and monotonically, and reaches each time at wallAt(t)', () => {
        const clock = new LiveClock()
        clock.configure(2, 'moments', 0)
        clock.startRound(pacing, 0, 1000)
        clock.setRunning(true, 1000)
        let prev = -1
        let maxStep = 0
        for (let w = 1000; w < 1000 + roundWallMs(pacing, 2, 'moments') + 500; w += 16) {
            const t = clock.now(w)
            expect(t).toBeGreaterThanOrEqual(prev)
            if (prev >= 0) maxStep = Math.max(maxStep, t - prev)
            prev = t
        }
        expect(prev).toBe(pacing.endTime)
        // No jumps: one 60 Hz frame of fast-forward (~20 round s per s, the ramp
        // inside a clamped second a little more) moves the radar well under a second.
        expect(maxStep).toBeLessThan(0.4)
        for (const e of events) expect(clock.now(clock.wallAt(e.time, 1000))).toBeCloseTo(e.time, 6)
    })

    it('keeps the round time across a pause, a speed change and the mode switch', () => {
        const clock = new LiveClock()
        clock.configure(2, 'moments', 0)
        clock.startRound(pacing, 0, 0)
        clock.setRunning(true, 0)
        const t1 = clock.now(3000)
        clock.setRunning(false, 3000)
        expect(clock.now(9000)).toBe(t1)
        expect(clock.wallAt(t1 + 1, 9000)).toBe(Infinity)
        clock.setRunning(true, 9000)
        expect(clock.now(9000)).toBeCloseTo(t1, 9)
        clock.configure(8, 'moments', 9000)
        expect(clock.now(9000)).toBeCloseTo(t1, 9)
        clock.configure(1, 'full', 9000)
        expect(clock.now(10000)).toBeCloseTo(t1 + 1, 6)
    })

    it('seeks (skip round) and starts a restored round where it stopped', () => {
        const clock = new LiveClock()
        clock.startRound(pacing, 41.7, 0)
        expect(clock.now(5000)).toBe(41.7)
        const v = clock.version
        clock.seek(500, 0)
        expect(clock.now(0)).toBe(pacing.endTime)
        expect(clock.version).toBe(v + 1)
    })
})

describe('wake times', () => {
    it('lists every event and the key-moment indicator boundaries, sorted and unique', () => {
        const wakes = liveWakeTimes({ events, pacing })
        for (const e of events) expect(wakes).toContain(e.time)
        for (const w of pacing.windows) expect(wakes).toContain(w.start - FAST_FORWARD_LEAD)
        for (let i = 1; i < wakes.length; i++) expect(wakes[i]).toBeGreaterThan(wakes[i - 1])
        // The indicator state only changes at a wake.
        let state = inMoment(pacing, FAST_FORWARD_LEAD)
        for (let t = 0; t < pacing.endTime; t += 0.05) {
            const now = inMoment(pacing, t + FAST_FORWARD_LEAD)
            if (now !== state) expect(wakes.some(w => w <= t + 1e-9 && w > t - 0.05 - 1e-9)).toBe(true)
            state = now
        }
        expect(nextWakeAfter(wakes, 18.4)).toBeGreaterThan(18.4)
        expect(nextWakeAfter(wakes, 73.3)).toBe(Infinity)
    })
})

describe('event reveal rule (feed, roster and radar: time <= now)', () => {
    it('reveals an event exactly when the clock reaches it', () => {
        expect(pendingLiveEvents(events, 18, 18.39)).toEqual([])
        expect(pendingLiveEvents(events, 18, 18.4).map(e => e.time)).toEqual([18.4])
        expect(pendingLiveEvents(events, 18.4, 41.7).map(e => e.time)).toEqual([41.7])
    })

    it('converts a whole-second checkpoint cursor so no event is played twice', () => {
        // An older checkpoint at second 18 had already revealed the kill at 18.4.
        expect(exactProcessedTime(events, 18)).toBe(18.4)
        const saved = {
            matchId: 'm', gameState: { currentMapIndex: 0, round: 3, time: 18, status: 'IN_PROGRESS' }, isWaitingForStrategy: false,
            homeRoster: [], awayRoster: [], matchResult: { maps: [{ map: 'Nuke', rounds: [{ roundNumber: 3, events }] }] },
        } as unknown as ActiveMatchState
        const playback = restoreLivePlayback(saved)
        expect(playback.exactTime).toBe(true)
        expect(playback.processedTime).toBe(18.4)
        expect(pendingLiveEvents(playback.events, playback.processedTime, 80).map(e => e.time)).toEqual([41.7, 55.2, 71.3, 73.3])
        // A new checkpoint keeps its exact cursor.
        expect(restoreLivePlayback({ ...saved, playback: { ...playback, processedTime: 41.7 } }).processedTime).toBe(41.7)
    })
})
