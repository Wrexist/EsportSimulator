/**
 * R2: mid-round coach calls. A call replays the round from its seed with the
 * call taking effect at that second: what was already shown stays the same,
 * the playbook counts are not doubled, and the result screen judges each call
 * against the round without it.
 */
import { simulationEngineV2 } from '@/engine/match-simulation'
import { createLegacySeriesState, playLegacyRound, type LegacySeriesContext, type LegacySeriesState } from '@/engine/match/legacy-series'
import { forgetLastRoundCalls } from '@/engine/match/round-sim'
import { coachCallBlocked, coachCallsFor, type CoachCallKind, type CoachCallRecord } from '@/engine/match/coach-calls'
import { coachCallsReason } from '@/lib/match-reasons'
import type { Playbook } from '@/engine/match/playbook'
import type { CustomTactics, Match, MatchResult, Player, Team } from '@/types'
import { MapId } from '@/types/enums'
import { SCRIPT_ENGINE_VERSION } from '@/engine/match/engine-version'

const ROLES = ['AWPER', 'IGL', 'ENTRY_FRAGGER', 'SUPPORT', 'RIFLER']
const UTILITY = [['smoke', 'flash'], ['smoke', 'molotov'], ['flash', 'flash'], ['he', 'smoke'], ['molotov']]

function player(id: string, role: string): Player {
    const skill = 70
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

const team = (id: string, players: Player[], playstyle: string, playbook?: Playbook) => ({ id, name: id, tier: 'PRO', roster: players.map(p => p.id), staff: [], equipment: [], playstyle, ...(playbook ? { playbook } : {}) } as unknown as Team)
// A playbook, so the rounds count their calls (the counts a replay must not double).
const BOOK: Playbook = { [MapId.MIRAGE]: { t: { pistol: { strategy: 'execute' }, full: { strategy: 'split' } }, ct: { full: 'stack-A' } } }

function tactics(): CustomTactics {
    const side = (primary: string, kit: boolean) => ({
        playerLoadouts: UTILITY.map((utility, slotIndex) => ({ slotIndex, primaryWeaponId: primary, secondaryWeaponId: 'deagle', armorTier: 'HEAVY' as const, hasKit: kit, utility })),
    })
    const both = { ct: side('m4a4', true), t: side('ak47', false) }
    return { ECO: both, FORCE: both, SEMIBUY: both, FULL: both, 'DOUBLE AWP': both }
}

function context(map: MapId, seed: number): LegacySeriesContext {
    const hp = ROLES.map((r, i) => player(`H${i}`, r)), ap = ROLES.map((r, i) => player(`A${i}`, r))
    const match = { id: `coach_${seed}_${map}`, engineVersion: SCRIPT_ENGINE_VERSION, homeTeamId: 'HOME', awayTeamId: 'AWAY', format: 'BO1', seed, date: new Date(0), mapVeto: [], vetoComplete: true, maps: [map], mapResults: [], roundHistory: [] } as unknown as Match
    return simulationEngineV2.createSeriesContext(match, team('HOME', hp, 'aggressive', BOOK), team('AWAY', ap, 'structured'), hp, ap, {}, {}, [map], tactics(), 'HOME')
}

const counts = (ctx: LegacySeriesContext) => JSON.stringify([...(ctx.script?.callCounts ?? new Map()).entries()].sort())

describe('coach call rules', () => {
    const base = { t: 20, ct: true, calls: [] as { t: number; kind: CoachCallKind }[], planted: false, over: false }
    it('allows a side its own calls only', () => {
        for (const k of coachCallsFor(true)) expect(coachCallBlocked(k, base)).toBeNull()
        expect(coachCallBlocked('go', base)).toBe('Not a call for this side')
        expect(coachCallBlocked('rotateA', { ...base, ct: false })).toBe('Not a call for this side')
    })
    it('limits calls per round, spaces them and waits for the round to start', () => {
        expect(coachCallBlocked('hold', { ...base, t: 1 })).toBe('Let the round start')
        expect(coachCallBlocked('hold', { ...base, calls: [{ t: 15, kind: 'rotateA' }] })).toBe('Wait 5 s')
        expect(coachCallBlocked('hold', { ...base, calls: [{ t: 5, kind: 'rotateA' }] })).toBeNull()
        expect(coachCallBlocked('hold', { ...base, t: 40, calls: [{ t: 5, kind: 'rotateA' }, { t: 20, kind: 'hold' }] })).toBe('2 calls per round')
        expect(coachCallBlocked('hold', { ...base, over: true })).toBe('The round is over')
    })
    it('only allows a save once the bomb is down', () => {
        expect(coachCallBlocked('rotateB', { ...base, planted: true })).toBe('The bomb is down')
        expect(coachCallBlocked('save', { ...base, planted: true })).toBeNull()
    })
})

describe('coach calls in the round engine', () => {
    it('keep the round as shown before the call and do not double the playbook counts', () => {
        const ctx = context(MapId.MIRAGE, 4242)
        let state: LegacySeriesState = createLegacySeriesState(ctx)
        let changed = 0, checked = 0
        for (let r = 0; r < 12 && !state.finished; r++) {
            const before = counts(ctx)
            const plain = playLegacyRound(ctx, state)
            const after = counts(ctx)
            const managedCT = plain.round.ctTeam === 'HOME'
            const kind: CoachCallKind = managedCT ? (r % 2 ? 'rotateA' : 'rotateB') : (r % 2 ? 'go' : 'swing')
            const t = 12
            forgetLastRoundCalls(ctx.script!)
            expect(counts(ctx)).toBe(before)
            const called = playLegacyRound(ctx, state, { coachCalls: [{ t, kind, without: plain.round.winningTeamId === 'HOME' ? 'won' : 'lost' }] })
            // One round's worth of counts, not two: the plan is set before any call.
            expect(counts(ctx)).toBe(after)
            const prefix = (evs: typeof plain.round.events) => JSON.stringify((evs ?? []).filter(e => e.time < t))
            expect(prefix(called.round.events)).toBe(prefix(plain.round.events))
            expect(called.round.managerCall?.coachCalls?.[0]?.kind).toBe(kind)
            if (JSON.stringify(called.round.events) !== JSON.stringify(plain.round.events)) changed++
            checked++
            // Carry on from the called round, as the live match does.
            state = called.state
        }
        expect(checked).toBeGreaterThan(8)
        expect(changed).toBeGreaterThan(checked / 2)
        expect(counts(ctx)).not.toBe('[]')
    })
})

describe('coach calls on the result screen', () => {
    const round = (n: number, winner: string, coachCalls?: CoachCallRecord[]) => ({ roundNumber: n, winningTeamId: winner, managerCall: coachCalls ? { coachCalls } : undefined })
    it('judges each call against the round without it', () => {
        const result = { maps: [{ map: 'de_mirage', rounds: [
            round(1, 'US'),
            round(2, 'US', [{ t: 20, kind: 'rotateA', without: 'lost' }]),
            round(3, 'THEM', [{ t: 10, kind: 'go', without: 'lost' }]),
            // The first call won the round, the second gave it away again.
            round(4, 'THEM', [{ t: 10, kind: 'hold', without: 'lost' }, { t: 25, kind: 'save', without: 'won' }]),
        ] }] } as unknown as MatchResult
        const why = coachCallsReason(result, 'US')!
        expect(why.calls.map(c => c.flipped)).toEqual(['won', null, 'won', 'lost'])
        expect(why.swing).toBe(1)
        expect(why.text).toBe('You made 4 calls during rounds. 2 calls won a round that was lost without it. 1 call lost a round that was won without it.')
        expect(why.calls[0]).toMatchObject({ round: 2, label: 'Rotate to A' })
    })
    it('is absent without calls', () => {
        expect(coachCallsReason({ maps: [{ map: 'de_mirage', rounds: [round(1, 'US')] }] } as unknown as MatchResult, 'US')).toBeNull()
    })
})
