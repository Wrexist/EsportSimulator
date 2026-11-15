/**
 * Live match freeze at the start of the second half and of maps 2 and 3
 * (smoke test 2026-11-15, P1). Between a round's end and the next pistol
 * round (half-time / map break) the playback loop found nothing due and
 * stopped. If the hook's `running` flag stayed true through the break (Play
 * or Space pressed on the break card; between maps since MATCHDAY-18 kept the
 * finished map's round time on screen), the loop effect never ran again: the
 * live clock played the new round to its end while the screen stayed at
 * round time 0 until the speed was changed or the page reloaded.
 */
import fs from 'fs'
import path from 'path'
import { LiveClock, liveWakeTimes, startPlaybackLoop } from '@/lib/live-clock'
import { computeRoundPacing, roundWallMs } from '@/lib/live-match-pacing'
import type { MatchEvent } from '@/types'

const ev = (type: MatchEvent['type'], time: number): MatchEvent => ({ type, time })
const roundA: MatchEvent[] = [ev('KILL', 18.4), ev('KILL', 41.7), ev('PLANT', 55.2), ev('KILL', 67.1), ev('ROUND_END', 69.1)]
const roundB: MatchEvent[] = [ev('KILL', 24.2), ev('KILL', 25.9), ev('KILL', 52.3), ev('ROUND_END', 54.3)]
const pacingA = computeRoundPacing(roundA)
const pacingB = computeRoundPacing(roundB)
const src = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8')

/** The hook's side of the loop: the round on screen and the time it shows. */
function screen() {
    const s = { wakes: liveWakeTimes({ events: roundA, pacing: pacingA }) as number[], shown: 0, advances: [] as number[] }
    return {
        s,
        host: (clock: LiveClock) => ({
            clock,
            wakes: () => s.wakes,
            shown: () => s.shown,
            advance: (t: number) => { s.shown = t; s.advances.push(t) },
        }),
        /** startNextRound: a new round on the clock and the screen, the loop left as it is. */
        newRound(clock: LiveClock, events: MatchEvent[]) {
            const pacing = computeRoundPacing(events)
            clock.startRound(pacing, 0, Date.now())
            s.wakes = liveWakeTimes({ events, pacing })
            s.shown = 0
            s.advances = []
        },
    }
}

describe('live playback loop', () => {
    beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(100_000) })
    afterEach(() => jest.useRealTimers())

    it('plays a round to its end', () => {
        const clock = new LiveClock()
        clock.configure(2, 'moments', Date.now())
        clock.startRound(pacingA, 0, Date.now())
        clock.setRunning(true, Date.now())
        const { s, host } = screen()
        const stop = startPlaybackLoop(host(clock), { now: () => Date.now() })
        jest.advanceTimersByTime(roundWallMs(pacingA, 2, 'moments') + 2000)
        expect(s.shown).toBe(pacingA.endTime)
        // Each event is revealed when the clock reaches it (within a timer tick).
        for (const e of roundA) expect(s.advances.some(t => t >= e.time && t - e.time < 0.1)).toBe(true)
        stop()
    })

    it.each([1, 2, 4, 8])('plays the next round when it starts under a loop that kept running through the break (%ix)', speed => {
        const clock = new LiveClock()
        clock.configure(speed, 'moments', Date.now())
        clock.startRound(pacingA, 0, Date.now())
        clock.setRunning(true, Date.now())
        const { s, host, newRound } = screen()
        const stop = startPlaybackLoop(host(clock), { now: () => Date.now() })
        jest.advanceTimersByTime(roundWallMs(pacingA, speed, 'moments') + 2000)
        expect(s.shown).toBe(pacingA.endTime)
        // The half-time card (beat + break) with the loop still running.
        jest.advanceTimersByTime(4400)
        newRound(clock, roundB)
        jest.advanceTimersByTime(roundWallMs(pacingB, speed, 'moments') + 2000)
        // It used to stay at 0 while the clock ran on to the round's end.
        expect(s.advances.length).toBeGreaterThan(3)
        expect(s.shown).toBe(pacingB.endTime)
        stop()
    })

    it('never carries a wait of the previous round into the new one', () => {
        const clock = new LiveClock()
        clock.configure(2, 'moments', Date.now())
        clock.startRound(pacingA, 0, Date.now())
        clock.setRunning(true, Date.now())
        const { s, host, newRound } = screen()
        const stop = startPlaybackLoop(host(clock), { now: () => Date.now() })
        // Mid-round A, waiting for its next wake; then round B starts (a coach call or skip re-anchors the same way).
        while (s.shown < 20) jest.advanceTimersByTime(16)
        newRound(clock, roundB)
        jest.advanceTimersByTime(300)
        // Round A's next wake (41.7) is never applied to round B.
        expect(s.advances.every(t => t <= clock.now(Date.now()) + 1e-6)).toBe(true)
        expect(s.shown).toBeLessThan(10)
        stop()
    })

    it('waits while the clock is paused and stops for good when stopped', () => {
        const clock = new LiveClock()
        clock.configure(2, 'moments', Date.now())
        clock.startRound(pacingA, 0, Date.now())
        const { s, host } = screen()
        const stop = startPlaybackLoop(host(clock), { now: () => Date.now() })
        jest.advanceTimersByTime(5000)
        expect(s.advances).toEqual([])
        clock.setRunning(true, Date.now())
        jest.advanceTimersByTime(roundWallMs(pacingA, 2, 'moments') + 2000)
        expect(s.shown).toBe(pacingA.endTime)
        stop()
        expect(jest.getTimerCount()).toBe(0)
    })
})

describe('live hook wiring', () => {
    const hook = src('hooks/useLiveMatch.ts')
    it('restarts the loop for every new round, not only when `running` changes', () => {
        expect(hook).toMatch(/return startPlaybackLoop\(\{/)
        expect(hook).toMatch(/\}, \[running, liveClock, speed, pacingMode, shownRoundKey\]\)/)
    })
    it('Play / Space during a half-time or map break leaves playback alone (no round to play)', () => {
        expect(hook).toMatch(/if \(!roundInFlightRef\.current\) return\n\s*setIsPlaying\(playing => !playing\)/)
        const bar = src('components/match/LiveMatchControlBar.tsx')
        expect(bar).toMatch(/disabled=\{!inProgress \|\| \(betweenRounds && !\(isWaitingForStrategy && isAutoTactics\)\)\}/)
    })
    it('a map break keeps the finished map\'s sides, loss bonus and roster until the next map starts', () => {
        expect(hook).toMatch(/const mapBreak = transition === "MAP_END"\n\s*if \(!mapBreak\) \{\n\s*setRoundHomeIsCT\(roundState\.homeStartsCT\)\n\s*setShownLossLevels/)
        expect(hook).toMatch(/if \(!mapBreak\) \{\n\s*setHomeRoster\(resetRoster\(/)
    })
})
