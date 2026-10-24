/**
 * Phase 3 radar: scrubber ticks / span / clamping, earlier-round review
 * rebuilt from the recorded rounds, and the playback clock.
 */
import { prepareRadarScript } from '@/lib/radar-scene'
import { clampReviewTime, formatRoundClock, scrubberClock, ROUND_SECONDS, scrubberSpan, scrubberTicks } from '@/lib/radar-scrubber'
import { reviewableRounds, reviewRound, reviewScript } from '@/lib/radar-review'
import { clockSetPlayback, clockSetTick, clockTime, createRadarClock } from '@/lib/radar-clock'
import { MapId } from '@/types/enums'
import { playRadarSeries } from './radar-fixtures'

const fixture = playRadarSeries(MapId.INFERNO, 31, 14)
const names = Object.fromEntries([...fixture.ctx.home.players, ...fixture.ctx.away.players].map(p => [p.id, { name: `N_${p.id}` }]))
const prepared = fixture.live.map((live, i) => prepareRadarScript(live.script, { events: fixture.steps[i].round.events, players: names }))

describe('round scrubber', () => {
    it('ticks every kill (killer colour), grenade, plant and defuse / explosion in time order', () => {
        for (const prep of prepared) {
            const ticks = scrubberTicks(prep)
            for (let i = 1; i < ticks.length; i++) expect(ticks[i].t).toBeGreaterThanOrEqual(ticks[i - 1].t)
            const kills = ticks.filter(t => t.kind === 'kill')
            expect(kills).toHaveLength(prep.deaths.length)
            for (const [i, d] of prep.deaths.entries()) {
                expect(kills[i].side).toBe(d.killerSide)
                expect(kills[i].label).toContain(`N_${prep.players[d.killer].id}`)
                expect(kills[i].label).toContain(scrubberClock(prep, d.t))
            }
            expect(ticks.filter(t => t.kind === 'utility')).toHaveLength(prep.utility.length)
            expect(ticks.some(t => t.kind === 'plant')).toBe(!!prep.plant)
            expect(ticks.some(t => t.kind === 'defuse')).toBe(!!prep.defuse?.success)
            expect(ticks.some(t => t.kind === 'explode')).toBe(prep.explodeAt !== undefined)
        }
        expect(prepared.some(p => p.plant)).toBe(true)
    })

    it('shows nothing from the future of the live round', () => {
        const prep = prepared.find(p => p.deaths.length >= 3)!
        const at = prep.deaths[1].t
        const ticks = scrubberTicks(prep, at)
        expect(ticks.every(t => t.t <= at)).toBe(true)
        expect(ticks.filter(t => t.kind === 'kill')).toHaveLength(2)
    })

    it('spans the regular round time while live (stretched after a plant) and the script once finished', () => {
        const planted = prepared.find(p => p.plant)!
        expect(scrubberSpan(planted, 10)).toBe(ROUND_SECONDS)
        expect(scrubberSpan(planted, planted.plant!.t + 1)).toBeGreaterThanOrEqual(planted.plant!.t + 40)
        expect(scrubberSpan(planted)).toBe(Math.ceil(planted.endTime))
        expect(clampReviewTime(50, 115, 30)).toBe(30)
        expect(clampReviewTime(-3, 115)).toBe(0)
        expect(clampReviewTime(500, 90)).toBe(90)
        expect(clampReviewTime(Number.NaN, 90)).toBe(0)
        expect(formatRoundClock(0)).toBe('0:00')
        expect(formatRoundClock(75.9)).toBe('1:15')
    })
})

describe('earlier rounds for review', () => {
    const source = { ctx: fixture.ctx, mapIndex: 0, rounds: fixture.steps.map(s => s.round) }

    it('lists recorded rounds and rebuilds each script deterministically, once', () => {
        expect(reviewableRounds(source)).toEqual(fixture.steps.map(s => s.round.roundNumber))
        expect(reviewableRounds(null)).toEqual([])
        for (const [i, step] of fixture.steps.entries()) {
            const n = step.round.roundNumber
            expect(reviewRound(source, n)).toBe(step.round)
            const script = reviewScript(source, fixture.map, n)!
            // script-v1 records its grenades, so the rebuilt round equals the live one.
            expect(script).toEqual(fixture.live[i].script)
            expect(reviewScript(source, fixture.map, n)).toBe(script)
        }
        expect(reviewScript(source, fixture.map, 999)).toBeNull()
    })
})

describe('radar clock', () => {
    it('glides through a tick, freezes on pause and resumes where it was', () => {
        const c = createRadarClock(0, 0)
        clockSetPlayback(c, true, 1000, 0)
        expect(clockTime(c, 500)).toBeCloseTo(0.5)
        expect(clockTime(c, 2000)).toBe(1) // never runs past the next tick
        clockSetTick(c, 1, 1000)
        expect(clockTime(c, 1250)).toBeCloseTo(1.25)
        clockSetPlayback(c, false, 1000, 1250)
        expect(clockTime(c, 5000)).toBeCloseTo(1.25)
        clockSetPlayback(c, true, 1000, 6000)
        expect(clockTime(c, 6250)).toBeCloseTo(1.5)
        // Speed change keeps the position.
        clockSetPlayback(c, true, 250, 6250)
        expect(clockTime(c, 6250)).toBeCloseTo(1.5)
        expect(clockTime(c, 6300)).toBeCloseTo(1.7)
        // A new tick restarts the glide; the same tick again is a no-op.
        clockSetTick(c, 2, 7000)
        clockSetTick(c, 2, 9000)
        expect(clockTime(c, 7125)).toBeCloseTo(2.5)
        // Reduced motion / paused: whole ticks.
        const still = createRadarClock(5, 0)
        expect(clockTime(still, 999)).toBe(5)
    })
})
