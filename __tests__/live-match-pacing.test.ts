/**
 * Phase 3 (stream K): key-moments pacing of the live match, the round
 * timeline behind the roster cards, the round-end summary and the buy
 * preview of the decision card.
 */
import { simulationEngineV2 } from '@/engine/match-simulation'
import { createLegacySeriesState, playLegacyRound, type LegacyRoundStep, type LegacySeriesContext, type ManagerStrategy } from '@/engine/match/legacy-series'
import { buildLiveRoundScript, warmRoundMap } from '@/lib/live-round-script'
import {
    AUTO_CONFIRM_MS, PACING, ROUND_BEAT_MS, computeRoundPacing, defaultLiveSpeed, inMoment, momentSeconds, pacingRate, roundWallMs, tickWallMs,
} from '@/lib/live-match-pacing'
import { adrOf, buildRoundTimeline, samplePlayer, summarizeRound, tallyMatchDamage } from '@/lib/live-match-roster'
import { previewDecision } from '@/lib/live-match-decision'
import type { Match, MatchEvent, Player, RoundResult, Team } from '@/types'
import { MapId } from '@/types/enums'

const ROLES = ['AWPER', 'IGL', 'ENTRY_FRAGGER', 'SUPPORT', 'RIFLER']
function player(id: string, role: string, skill: number): Player {
    return {
        id, name: id, nickname: id, age: 22, nationality: 'X', portraitPath: '', role, tier: 'PRO',
        skill, awp: skill, rifle: skill, pistol: skill, grenades: skill, creativity: skill, clutch: skill, tactic: skill,
        entry: skill, trading: skill, leader: skill, teamwork: skill, morale: 70, amicability: 50, productivity: 50,
        stressResistance: 60, loyalty: 50, reaction: skill, eyesight: skill, health: 100, strength: 50, endurance: 50,
        form: 70, fatigue: 0, potential: skill, energy: 100, maxEnergy: 100, matchesPlayed: 0, roundsPlayed: 0,
        avgRating: 1, clutchSuccessRate: 0,
        contract: { playerId: id, salaryPerWeek: 0, startWeek: 0, endWeek: 52, buyout: 0 }, traits: [], perks: [],
    } as unknown as Player
}
const team = (id: string, players: Player[], playstyle: string): Team =>
    ({ id, name: id, tier: 'PRO', roster: players.map(p => p.id), staff: [], equipment: [], playstyle } as unknown as Team)

function seriesCtx(map: MapId, seed: number): LegacySeriesContext {
    const hp = ROLES.map((r, i) => player(`H${i}`, r, 70 + (seed % 5))), ap = ROLES.map((r, i) => player(`A${i}`, r, 68 + (seed % 7)))
    const match = { id: `pace_${seed}_${map}`, engineVersion: 'script-v1', homeTeamId: 'HOME', awayTeamId: 'AWAY', format: 'BO1', seed, date: new Date(0), mapVeto: [], vetoComplete: true, maps: [map], mapResults: [], roundHistory: [] } as unknown as Match
    return simulationEngineV2.createSeriesContext(match, team('HOME', hp, 'aggressive'), team('AWAY', ap, 'structured'), hp, ap, {}, {}, [map], undefined, 'HOME')
}
function playSeries(map: MapId, seed: number): { ctx: LegacySeriesContext; steps: LegacyRoundStep[] } {
    const ctx = seriesCtx(map, seed)
    let state = createLegacySeriesState(ctx)
    const steps: LegacyRoundStep[] = []
    while (!state.finished) { const step = playLegacyRound(ctx, state); steps.push(step); state = step.state }
    return { ctx, steps }
}

const ev = (type: MatchEvent['type'], time: number, extra: Partial<MatchEvent> = {}): MatchEvent => ({ type, time, ...extra })

describe('key-moments pacing', () => {
    it('builds windows around kills, the plant, defuse, utility executes and the round end, and merges them', () => {
        const events = [
            ev('KILL', 20, { playerId: 'a', victimId: 'b' }),
            ev('KILL', 21.5, { playerId: 'c', victimId: 'a' }),
            ev('PLANT', 50, { playerId: 'd' }),
            ev('KILL', 70, { playerId: 'e', victimId: 'd' }),
            ev('DEFUSE', 80, { playerId: 'e' }),
            ev('ROUND_END', 82),
        ]
        const script = {
            utility: [{ t: 40, throwerId: 'd', kind: 'smoke' as const, at: { x: 0, y: 0, floor: 'upper' as const }, radius: 2, duration: 18 },
                { t: 41.5, throwerId: 'c', kind: 'flash' as const, at: { x: 0, y: 0, floor: 'upper' as const }, radius: 2, duration: 0.3 }],
            bomb: { carrier: [], defuse: { tStart: 75, tEnd: 80, defuserId: 'e', success: true } },
        }
        const p = computeRoundPacing(events, script)
        expect(p.endTime).toBe(82)
        // Opening duel has the longer lead-in; the trade 1.5 s later merges into it.
        expect(p.windows[0]).toMatchObject({ start: 20 - PACING.OPENING_LEAD, end: 21.5 + PACING.KILL_TAIL })
        expect(p.windows[0].kinds).toEqual(expect.arrayContaining(['opening', 'kill']))
        // The execute's two grenades are one window; the plant (2.5 s later) is its own.
        const exec = p.windows.find(w => w.kinds.includes('utility'))!
        expect(exec).toMatchObject({ start: 40 - PACING.UTILITY_LEAD, end: 41.5 + PACING.UTILITY_TAIL, kinds: ['utility'] })
        expect(p.windows.find(w => w.kinds.includes('plant'))).toMatchObject({ start: 50 - PACING.PLANT_LEAD, end: 50 + PACING.PLANT_TAIL })
        // Retake kill, defuse start, defuse end and round end are one closing window.
        const last = p.windows[p.windows.length - 1]
        expect(last.kinds).toEqual(expect.arrayContaining(['kill', 'defuse-start', 'defuse-end', 'round-end']))
        expect(last.end).toBeCloseTo(82, 2)
        // Windows never overlap and are in order.
        for (let i = 1; i < p.windows.length; i++) expect(p.windows[i].start).toBeGreaterThan(p.windows[i - 1].end + PACING.MERGE_GAP - 1e-9)
        expect(inMoment(p, 20)).toBe(true)
        expect(inMoment(p, 30)).toBe(false)
    })

    it('a round lost on time ends with a short window at the clock, not from the last kill', () => {
        const p = computeRoundPacing([ev('KILL', 40, { playerId: 'a', victimId: 'b' }), ev('ROUND_END', 117)])
        const last = p.windows[p.windows.length - 1]
        expect(last.kinds).toEqual(['round-end'])
        expect(last.start).toBeCloseTo(115 - PACING.ROUND_END_LEAD, 5)
        expect(momentSeconds(p)).toBeLessThan(15)
    })

    it('eases the speed: the rate is 1 inside moments, up to QUIET_FACTOR between them, and continuous', () => {
        const p = computeRoundPacing([ev('KILL', 30, { playerId: 'a', victimId: 'b' }), ev('KILL', 70, { playerId: 'b', victimId: 'c' }), ev('ROUND_END', 72)])
        expect(pacingRate(p, 30)).toBe(1)
        expect(pacingRate(p, 50)).toBe(PACING.QUIET_FACTOR)
        let maxStep = 0
        for (let t = 0; t < 72; t += 0.05) maxStep = Math.max(maxStep, Math.abs(pacingRate(p, t + 0.05) - pacingRate(p, t)))
        // smoothstep over RAMP_SECONDS: max slope 1.5 × (QUIET_FACTOR − 1) / RAMP_SECONDS per second.
        expect(maxStep).toBeLessThan(0.05 * 1.5 * (PACING.QUIET_FACTOR - 1) / PACING.RAMP_SECONDS + 1e-6)
        // Freeze time (round start, before any moment) is fast-forwarded.
        expect(pacingRate(p, 0.5)).toBe(PACING.QUIET_FACTOR)
    })

    it('times each tick deterministically: moments at speed × MOMENT_SPEED, quiet capped, full rounds at speed', () => {
        const p = computeRoundPacing([ev('KILL', 30, { playerId: 'a', victimId: 'b' }), ev('ROUND_END', 32)])
        for (const speed of [1, 2, 4, 8]) {
            expect(tickWallMs(p, 30, speed, 'moments')).toBeCloseTo(1000 / (speed * PACING.MOMENT_SPEED), 6)
            expect(tickWallMs(p, 10, speed, 'moments')).toBeGreaterThanOrEqual(PACING.MIN_TICK_MS)
            expect(tickWallMs(p, 10, speed, 'moments')).toBeLessThan(tickWallMs(p, 30, speed, 'moments'))
            expect(tickWallMs(p, 30, speed, 'full')).toBe(1000 / speed)
            expect(tickWallMs(null, 30, speed, 'moments')).toBe(1000 / speed)
        }
        expect(tickWallMs(p, 12, 2, 'moments')).toBe(tickWallMs(p, 12, 2, 'moments'))
        // Faster speeds never make a round longer.
        expect(roundWallMs(p, 1, 'moments')).toBeGreaterThan(roundWallMs(p, 2, 'moments'))
        expect(roundWallMs(p, 2, 'moments')).toBeGreaterThan(roundWallMs(p, 8, 'moments'))
    })

    it('starts key moments at 2× and full rounds at 1× for the normal speed setting', () => {
        expect(defaultLiveSpeed('moments', 'normal')).toBe(2)
        expect(defaultLiveSpeed('moments', 'very-fast')).toBe(8)
        expect(defaultLiveSpeed('full', 'normal')).toBe(1)
        expect(defaultLiveSpeed('full', 'fast')).toBe(2)
    })

    it('plays a script-v1 BO1 map in ~5-8 minutes at the default speed (full rounds take ~4× longer)', () => {
        const maps = [MapId.MIRAGE, MapId.INFERNO, MapId.NUKE, MapId.ANCIENT]
        let keyMs = 0, fullMs = 0, rounds = 0
        for (const map of maps) {
            warmRoundMap(map)
            const { ctx, steps } = playSeries(map, 3)
            for (const step of steps) {
                const live = buildLiveRoundScript({ ctx, mapId: map, mapIndex: 0, round: step.round, loadouts: { ...step.preRound.home, ...step.preRound.away } })
                const p = computeRoundPacing(step.round.events ?? [], live?.script)
                const ms = roundWallMs(p, defaultLiveSpeed('moments', 'normal'), 'moments')
                expect(ms).toBeGreaterThan(2000)
                expect(ms).toBeLessThan(45000)
                keyMs += ms
                fullMs += roundWallMs(p, 1, 'full')
                rounds++
            }
        }
        // Between rounds on auto tactics: the round-end beat and the auto-confirm countdown.
        const perMapMin = (keyMs + rounds * (ROUND_BEAT_MS + AUTO_CONFIRM_MS)) / maps.length / 60000
        expect(perMapMin).toBeGreaterThan(4)
        expect(perMapMin).toBeLessThan(8.5)
        expect(fullMs).toBeGreaterThan(3 * keyMs)
    })
})

describe('round timeline (roster cards)', () => {
    const round = {
        events: [
            ev('KILL', 10, { playerId: 'H0', victimId: 'A0', damage: 100, weapon: 'ak47' }),
            ev('KILL', 20, { playerId: 'A1', victimId: 'H0', damage: 64, weapon: 'm4a4', isHeadshot: true }),
            ev('KILL', 30, { playerId: 'H1', victimId: 'A1', damage: 80, weapon: 'ak47' }),
            ev('KILL', 31, { playerId: 'H1', victimId: 'A2', damage: 100 }),
            ev('KILL', 33, { playerId: 'H1', victimId: 'A3', damage: 90 }),
            ev('ROUND_END', 40),
        ],
        // Home dealt 100 + 80 (+20 chip on A1 before) + 100 + 100; away dealt 36 chip on H0 + 64 kill + 30 on survivors.
        damage: { H0: 100, H1: 310, A1: 64 + 36 + 30 },
        utility: [{ t: 15, playerId: 'H2', kind: 'smoke' as const, spot: 's', site: 'A' as const }],
    }
    const tl = buildRoundTimeline({
        round, homeIds: ['H0', 'H1', 'H2'], awayIds: ['A0', 'A1', 'A2', 'A3'],
        loadouts: { H2: { utility: ['smoke', 'flash'] }, H1: { utility: ['incendiary'] } },
    })

    it('shows deaths with the killer from the tick that reveals them', () => {
        expect(samplePlayer(tl, 'H0', 19).dead).toBe(false)
        expect(samplePlayer(tl, 'H0', 20)).toMatchObject({ dead: true, killerId: 'A1', killerWeapon: 'm4a4', hp: 0 })
    })

    it('drops a victim to the HP they died with before the kill (at their last won duel)', () => {
        // H0 killed A0 at 10 and died at 20 with 64 HP left: the 36 chip lands at 10.
        expect(samplePlayer(tl, 'H0', 9).hp).toBe(100)
        expect(samplePlayer(tl, 'H0', 10).hp).toBe(64)
        // A1 won the duel at 20, so its 20 chip lands there.
        expect(samplePlayer(tl, 'A1', 19).hp).toBe(100)
        expect(samplePlayer(tl, 'A1', 20).hp).toBe(80)
        // A3 never won a duel: its chip is shown just before the death.
        expect(samplePlayer(tl, 'A3', 30).hp).toBe(100)
        expect(samplePlayer(tl, 'A3', 31).hp).toBe(90)
    })

    it('splits the other team\'s remaining damage over the survivors (team totals match the engine)', () => {
        expect(tl.estimatedHp).toBe(true)
        const missing = ['H1', 'H2'].reduce((s, id) => s + (100 - samplePlayer(tl, id, 40).hp), 0)
        expect(missing).toBe(30)
    })

    it('counts grenades held: bought minus thrown', () => {
        expect(samplePlayer(tl, 'H2', 14).nades).toEqual(['smoke', 'flash'])
        expect(samplePlayer(tl, 'H2', 15).nades).toEqual(['flash'])
        expect(samplePlayer(tl, 'H1', 0).nades).toEqual(['molotov'])
    })

    it('flags multi-kills and summarises the round', () => {
        expect(tl.multiKills).toEqual([{ t: 33, playerId: 'H1', count: 3 }])
        const r = { ...round, roundNumber: 5, winner: 't', winningTeamId: 'HOME', winType: 'ELIMINATION', ctTeam: 'AWAY', tTeam: 'HOME', kills: [], buys: { home: 'ECO', away: 'FULL' } } as unknown as RoundResult
        const s = summarizeRound(r, 'HOME', ['H0', 'H1', 'H2'], ['A0', 'A1', 'A2', 'A3'])
        expect(s.winner).toBe('home')
        expect(s.mvp).toEqual({ playerId: 'H1', kills: 3, damage: 310 })
        expect(s.callouts.map(c => c.kind)).toEqual(['eco-win', '3k'])
    })

    it('ADR is damage over revealed rounds of the match', () => {
        const maps = [{ rounds: [{ damage: { H1: 120 } }, { damage: { H1: 60 } }, { damage: { H1: 300 } }] }] as never
        const tally = tallyMatchDamage(maps, 0, 2)
        expect(adrOf(tally, 'H1')).toBe(90)
        expect(adrOf(tallyMatchDamage([{ rounds: [{}] }] as never, 0, 1), 'H1')).toBeUndefined()
    })
})

describe('decision card buy preview', () => {
    it('previews exactly what each call buys, per player, as the round step will', () => {
        const ctx = seriesCtx(MapId.MIRAGE, 11)
        let state = createLegacySeriesState(ctx)
        // Play into the half so the economy is uneven.
        for (let i = 0; i < 4; i++) state = playLegacyRound(ctx, state).state
        const preview = previewDecision(ctx, state.sim)!
        expect(preview).not.toBeNull()
        expect(preview.options.map(o => o.id)).toEqual(['ECO', 'FORCE', 'SEMIBUY', 'FULL', 'DOUBLE AWP'])
        expect(preview.reason.length).toBeGreaterThan(10)
        expect(typeof preview.lossBonus).toBe('number')
        for (const option of preview.options) {
            const step = playLegacyRound(ctx, state, { strategy: option.id as ManagerStrategy })
            for (const p of option.players) {
                const real = step.preRound.home[p.id]
                expect(real.weapon).toBe(p.weapon)
                expect(p.cash - p.spend).toBe(real.cash)
                expect(real.hasArmor).toBe(p.armor)
            }
        }
        // The recommendation is the call the engine makes without one.
        const auto = playLegacyRound(ctx, state)
        const rec = preview.options.find(o => o.id === preview.auto)
        if (rec) for (const p of rec.players) expect(auto.preRound.home[p.id].weapon).toBe(p.weapon)
    })

    it('has no decision on pistol rounds', () => {
        const ctx = seriesCtx(MapId.MIRAGE, 2)
        expect(previewDecision(ctx, createLegacySeriesState(ctx).sim)).toBeNull()
    })
})
