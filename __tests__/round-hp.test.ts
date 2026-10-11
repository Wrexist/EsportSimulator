/**
 * Phase 3 polish: exact HP from the script-v1 resolver's per-hit data (KILL
 * `chip`, grenade `hit` / `dmg`), the one HP model behind the live roster and
 * the radar (lib/round-hp), and its estimate for older rounds.
 */
import { simulationEngineV2 } from '@/engine/match-simulation'
import { createLegacySeriesState, playLegacyRound, type LegacyRoundStep, type LegacySeriesContext } from '@/engine/match/legacy-series'
import { hpAt, roundHp } from '@/lib/round-hp'
import { buildRoundTimeline } from '@/lib/live-match-roster'
import type { CustomTactics, Match, MatchEvent, Player, RoundResult, Team } from '@/types'
import { MapId } from '@/types/enums'

const ROLES = ['AWPER', 'IGL', 'ENTRY_FRAGGER', 'SUPPORT', 'RIFLER']
const UTILITY = [['smoke', 'flash'], ['smoke', 'molotov'], ['flash', 'flash'], ['he', 'smoke'], ['molotov', 'he']]
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
const team = (id: string, players: Player[], playstyle: string): Team =>
    ({ id, name: id, tier: 'PRO', roster: players.map(p => p.id), staff: [], equipment: [], playstyle } as unknown as Team)
function tactics(): CustomTactics {
    const side = (primary: string, kit: boolean) => ({
        playerLoadouts: UTILITY.map((utility, slotIndex) => ({ slotIndex, primaryWeaponId: primary, secondaryWeaponId: 'deagle', armorTier: 'HEAVY' as const, hasKit: kit, utility })),
    })
    const both = { ct: side('m4a4', true), t: side('ak47', false) }
    return { ECO: both, FORCE: both, SEMIBUY: both, FULL: both, 'DOUBLE AWP': both }
}
function series(map: MapId, seed: number): { ctx: LegacySeriesContext; steps: LegacyRoundStep[] } {
    const hp = ROLES.map((r, i) => player(`H${i}`, r)), ap = ROLES.map((r, i) => player(`A${i}`, r))
    const match = { id: `hp_${seed}_${map}`, engineVersion: 'script-v1', homeTeamId: 'HOME', awayTeamId: 'AWAY', format: 'BO1', seed, date: new Date(0), mapVeto: [], vetoComplete: true, maps: [map], mapResults: [], roundHistory: [] } as unknown as Match
    const ctx = simulationEngineV2.createSeriesContext(match, team('HOME', hp, 'aggressive'), team('AWAY', ap, 'structured'), hp, ap, {}, {}, [map], tactics(), 'HOME')
    let state = createLegacySeriesState(ctx)
    const steps: LegacyRoundStep[] = []
    while (!state.finished && steps.length < 40) {
        const step = playLegacyRound(ctx, state)
        steps.push(step)
        state = step.state
    }
    return { ctx, steps }
}

const HOME = ['H0', 'H1', 'H2', 'H3', 'H4'], AWAY = ['A0', 'A1', 'A2', 'A3', 'A4']
const kills = (r: RoundResult) => (r.events ?? []).filter((e): e is MatchEvent & { playerId: string; victimId: string } => e.type === 'KILL' && !!e.playerId && !!e.victimId)

describe('per-hit data from the script-v1 resolver', () => {
    const rounds = [series(MapId.MIRAGE, 7), series(MapId.INFERNO, 19), series(MapId.NUKE, 4)].flatMap(s => s.steps.map(step => step.round))

    it('records every non-lethal hit: damage dealt = chip on others + kill damage, per player', () => {
        let chips = 0, grenadeHits = 0
        for (const r of rounds) {
            const dealt: Record<string, number> = {}
            for (const k of kills(r)) {
                dealt[k.playerId] = (dealt[k.playerId] ?? 0) + (k.damage ?? 0)
                if (k.chip) { chips++; dealt[k.victimId] = (dealt[k.victimId] ?? 0) + k.chip }
            }
            for (const u of r.utility ?? []) {
                if (!u.hit) continue
                grenadeHits++
                expect(u.kind === 'he' || u.kind === 'molotov').toBe(true)
                dealt[u.playerId] = (dealt[u.playerId] ?? 0) + u.dmg!
            }
            for (const id of [...HOME, ...AWAY]) expect(dealt[id] ?? 0).toBe(r.damage?.[id] ?? 0)
        }
        expect(chips).toBeGreaterThan(20)
        expect(grenadeHits).toBeGreaterThan(5)
    })

    it('gives exact HP: a victim dies with the HP the kill took, survivors keep 100 minus their hits', () => {
        let survivorsChipped = 0
        for (const r of rounds) {
            const hp = roundHp({ round: r, homeIds: HOME, awayIds: AWAY })
            expect(hp.exact).toBe(true)
            expect(hp.estimated).toBe(false)
            const deaths = new Map(kills(r).map(k => [k.victimId, k]))
            for (const id of [...HOME, ...AWAY]) {
                const k = deaths.get(id)
                const taken = hp.hits.filter(h => h.victimId === id && (!k || h.t <= k.time)).reduce((s, h) => s + h.dmg, 0)
                if (k) {
                    expect(hpAt(hp.steps[id], k.time - 1e-6)).toBe(k.damage)
                    expect(hpAt(hp.steps[id], k.time)).toBe(0)
                    expect(100 - taken).toBe(k.damage)
                } else {
                    expect(hpAt(hp.steps[id], 999)).toBe(100 - taken)
                    if (taken > 0) survivorsChipped++
                }
                // HP never rises during a round.
                const steps = hp.steps[id] ?? []
                for (let i = 1; i < steps.length; i++) expect(steps[i].hp).toBeLessThanOrEqual(steps[i - 1].hp)
            }
        }
        expect(survivorsChipped).toBeGreaterThan(10)
    })

    it('the roster timeline uses it and no longer marks HP as estimated', () => {
        const r = rounds.find(x => (x.utility ?? []).some(u => u.hit))!
        const tl = buildRoundTimeline({ round: r, homeIds: HOME, awayIds: AWAY })
        expect(tl.exactHp).toBe(true)
        expect(tl.estimatedHp).toBe(false)
        expect(tl.hp).toEqual(roundHp({ round: r, homeIds: HOME, awayIds: AWAY }).steps)
    })
})

describe('older rounds (no per-hit data)', () => {
    const old: Pick<RoundResult, 'events' | 'damage' | 'utility'> = {
        events: [
            { type: 'KILL', time: 10, playerId: 'H0', victimId: 'A0', damage: 100 },
            { type: 'KILL', time: 20, playerId: 'A1', victimId: 'H0', damage: 64 },
            { type: 'ROUND_END', time: 30 },
        ],
        damage: { H0: 100, A1: 64 + 36 + 20 },
    }

    it('falls back to the estimate (victims exact at death, survivors split)', () => {
        const hp = roundHp({ round: old, homeIds: ['H0', 'H1'], awayIds: ['A0', 'A1'] })
        expect(hp.exact).toBe(false)
        expect(hp.estimated).toBe(true)
        expect(hpAt(hp.steps.H0, 19.9)).toBe(64)
        expect(hpAt(hp.steps.H1, 30)).toBe(80)
    })

    it('legacy-v2 rounds (no damage at all) have no HP data', () => {
        const hp = roundHp({ round: { events: [{ type: 'KILL', time: 5, playerId: 'H0', victimId: 'A0' }] }, homeIds: ['H0'], awayIds: ['A0'] })
        expect(hp.known).toBe(false)
        expect(hpAt(hp.steps.A0, 4.9)).toBe(100)
        expect(hpAt(hp.steps.A0, 5)).toBe(0)
    })
})
