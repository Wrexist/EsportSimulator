/**
 * R3: anti-strat prep. An AI club playing the manager's team keeps to its map
 * habits on full buys; the manager's counters play against them; AI-only
 * matches are untouched; the result screen reports each counter.
 */
import { seriesRunnerFor } from '@/engine/match/calibration/run'
import { buildSide, even } from '@/engine/match/calibration/fixtures'
import { forceHabits } from '@/engine/match/round-sim'
import { adaptHabits, counterSite, sanitizeCounters, sanitizeHabitState, teamHabits, HABIT_ADAPT_CHANCE } from '@/engine/match/habits'
import { counterLines } from '@/lib/match-reasons'
import type { Match, MatchResult, Player, RoundResult, Team } from '@/types'
import { simulationEngineV2 } from '@/engine/match-simulation'
import { MapId } from '@/types/enums'

const runner = seriesRunnerFor('script-v1')!
const home = buildSide({ id: 'HOME', skills: even(70) })
const away = buildSide({ id: 'AWAY', skills: even(70) })
const rounds = (r: MatchResult) => r.maps.flatMap(m => m.rounds as RoundResult[])
const full = (b?: string) => b === 'FULL' || b === 'DOUBLE AWP'

afterEach(() => forceHabits(null))

describe('club habits', () => {
    it('are drawn afresh each season; season one keeps the original draw', () => {
        expect(teamHabits('AWAY', MapId.MIRAGE, { season: 1 })).toEqual(teamHabits('AWAY', MapId.MIRAGE))
        const clubs = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
        const changed = clubs.filter(id => JSON.stringify(teamHabits(id, MapId.MIRAGE, { season: 2 })) !== JSON.stringify(teamHabits(id, MapId.MIRAGE)))
        expect(changed.length).toBeGreaterThan(0)
        expect(changed.length).toBeLessThan(clubs.length)
    })

    it('change after a club is countered, about as often as HABIT_ADAPT_CHANCE', () => {
        let tChanged = 0, ctChanged = 0
        const n = 400
        for (let seed = 0; seed < n; seed++) {
            const before = teamHabits('AWAY', MapId.MIRAGE)
            const state = adaptHabits(undefined, { [MapId.MIRAGE]: { ct: true, t: true } }, 'AWAY', seed)
            const after = teamHabits('AWAY', MapId.MIRAGE, state)
            if (after.t.site !== before.t.site) tChanged++
            if (after.ct.stack !== before.ct.stack) ctChanged++
            // A map nobody countered keeps its habits.
            expect(teamHabits('AWAY', MapId.INFERNO, state)).toEqual(teamHabits('AWAY', MapId.INFERNO))
        }
        for (const c of [tChanged, ctChanged]) expect(Math.abs(c / n - HABIT_ADAPT_CHANCE)).toBeLessThan(0.08)
        // No counters: nothing changes. A saved state survives sanitising; junk does not.
        expect(adaptHabits({ season: 2 }, undefined, 'AWAY', 1)).toEqual({ season: 2, shift: {} })
        expect(sanitizeHabitState({ season: 3, shift: { [MapId.MIRAGE]: { t: true, x: 1 } } })).toEqual({ season: 3, shift: { [MapId.MIRAGE]: { t: true } } })
        expect(sanitizeHabitState('junk')).toBeUndefined()
    })

    it('are fixed per club and map', () => {
        expect(teamHabits('AWAY', MapId.MIRAGE)).toEqual(teamHabits('AWAY', MapId.MIRAGE))
        const all = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(id => teamHabits(id, MapId.MIRAGE).t.site)
        expect(new Set(all).size).toBe(2)
        const h = { t: { site: 'B' as const }, ct: { stack: 'A' as const } }
        expect(counterSite('ct', h)).toBe('B')
        expect(counterSite('t', h)).toBe('B')
    })

    it('are run only by the club playing the manager, on its full buys', () => {
        let tHabit = 0, awayTFull = 0
        for (let i = 0; i < 6; i++) {
            const res = runner.managed({ id: `as-h-${i}`, seed: 500 + i, map: MapId.MIRAGE, home, away, managedTeamId: 'HOME' })
            for (const r of rounds(res)) {
                if (r.plan?.tHabit) expect(r.tTeam === 'AWAY' && full(r.buys?.away)).toBe(true)
                if (r.plan?.ctHabit) expect(r.tTeam === 'HOME' && full(r.buys?.away)).toBe(true)
                if (r.tTeam === 'AWAY' && full(r.buys?.away)) { awayTFull++; if (r.plan?.tHabit) { tHabit++; expect(r.plan.site).toBe(teamHabits('AWAY', MapId.MIRAGE).t.site) } }
                // The manager's club never runs habits.
                if (r.tTeam === 'HOME') expect(r.plan?.tHabit).toBeUndefined()
            }
        }
        expect(tHabit / awayTFull).toBeGreaterThan(0.4)
        expect(tHabit / awayTFull).toBeLessThan(0.9)
    })

    it('are off in an AI fixture that names no managed team (it defaults to the home side)', () => {
        const match = { id: 'as-fixture', homeTeamId: 'HOME', awayTeamId: 'AWAY', format: 'BO1', seed: 5, maps: [MapId.MIRAGE], engineVersion: 'script-v1' } as unknown as Match
        const ctx = simulationEngineV2.createSeriesContext(match, home.team as unknown as Team, away.team as unknown as Team, home.players as unknown as Player[], away.players as unknown as Player[], {}, {})
        expect(ctx.script?.away.habitual).toBeUndefined()
        expect(ctx.script?.home.habitual).toBeUndefined()
        const managed = simulationEngineV2.createSeriesContext(match, home.team as unknown as Team, away.team as unknown as Team, home.players as unknown as Player[], away.players as unknown as Player[], {}, {}, undefined, undefined, 'HOME')
        expect(managed.script?.away.habitual).toBe(true)
    })

    it('leave AI-only matches exactly as they were', () => {
        const play = () => runner.managed({ id: 'as-ai', seed: 77, map: MapId.INFERNO, home, away, managedTeamId: 'nobody' })
        const on = JSON.stringify(rounds(play()).map(r => r.events))
        forceHabits(false)
        expect(JSON.stringify(rounds(play()).map(r => r.events))).toBe(on)
    })
})

describe('counters', () => {
    it('stack the habit site as CT and hit the light site as T, on full buys only', () => {
        const h = teamHabits('AWAY', MapId.MIRAGE)
        let ct = 0, t = 0
        for (let i = 0; i < 4; i++) {
            const res = runner.managed({ id: `as-c-${i}`, seed: 900 + i, map: MapId.MIRAGE, home, away, managedTeamId: 'HOME', counters: { [MapId.MIRAGE]: { ct: true, t: true } } })
            for (const r of rounds(res)) {
                if (r.plan?.counter) expect(full(r.buys?.home)).toBe(true)
                if (r.plan?.counter === 'ct') { ct++; expect(r.plan.ctSetup).toBe(`stack-${counterSite('ct', h)}`) }
                if (r.plan?.counter === 't') { t++; expect(r.plan.site).toBe(counterSite('t', h)) }
            }
        }
        expect(ct).toBeGreaterThan(10)
        expect(t).toBeGreaterThan(10)
    })

    it('keep only valid entries from a save', () => {
        expect(sanitizeCounters({ de_mirage: { ct: true, t: 'yes' }, de_nuke: {}, bad: 3 })).toEqual({ de_mirage: { ct: true } })
    })

    it('are reported per map and side on the result screen', () => {
        const r = (n: number, winner: string, plan: Record<string, unknown>) => ({ roundNumber: n, winningTeamId: winner, plan: { tStrategy: 'execute', ...plan } })
        const result = { maps: [{ map: 'de_mirage', rounds: [
            r(1, 'US', { counter: 'ct', ctSetup: 'stack-B', site: 'B', read: 'right' }),
            r(2, 'THEM', { counter: 'ct', ctSetup: 'stack-B', site: 'A', read: 'wrong' }),
            r(3, 'US', { counter: 't', site: 'A', ctSetup: 'stack-B', ctHabit: true }),
            r(4, 'US', { site: 'A', ctSetup: '2-1-2' }),
        ] }] } as unknown as MatchResult
        const lines = counterLines(result, 'US')
        expect(lines).toHaveLength(2)
        expect(lines[0]).toMatchObject({ side: 'ct', label: 'Stack B', rounds: 2, met: 1, won: 1 })
        expect(lines[1]).toMatchObject({ side: 't', label: 'Hit A', rounds: 1, met: 1, won: 1 })
    })
})
