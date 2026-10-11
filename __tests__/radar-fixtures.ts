/**
 * Shared fixture for the radar tests: one BO1 played through the real series
 * stepper (script-v1 by default) and every round's live script.
 */
import { simulationEngineV2 } from '@/engine/match-simulation'
import { createLegacySeriesState, playLegacyRound, type LegacyRoundStep, type LegacySeriesContext } from '@/engine/match/legacy-series'
import { buildLiveRoundScript, type LiveRoundScript } from '@/lib/live-round-script'
import type { CustomTactics, Match, Player, Team } from '@/types'
import type { MapId } from '@/types/enums'

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

function team(id: string, players: Player[], playstyle: string): Team {
    return { id, name: id, tier: 'PRO', roster: players.map(p => p.id), staff: [], equipment: [], playstyle } as unknown as Team
}

function tactics(): CustomTactics {
    const side = (primary: string, kit: boolean) => ({
        playerLoadouts: UTILITY.map((utility, slotIndex) => ({ slotIndex, primaryWeaponId: primary, secondaryWeaponId: 'deagle', armorTier: 'HEAVY' as const, hasKit: kit, utility })),
    })
    const both = { ct: side('m4a4', true), t: side('ak47', false) }
    return { ECO: both, FORCE: both, SEMIBUY: both, FULL: both, 'DOUBLE AWP': both }
}

export interface RadarFixture {
    map: MapId
    ctx: LegacySeriesContext
    steps: LegacyRoundStep[]
    live: LiveRoundScript[]
}

export function playRadarSeries(map: MapId, seed: number, maxRounds = 40): RadarFixture {
    const hp = ROLES.map((r, i) => player(`H${i}`, r)), ap = ROLES.map((r, i) => player(`A${i}`, r))
    const match = { id: `radar_${seed}_${map}`, homeTeamId: 'HOME', awayTeamId: 'AWAY', format: 'BO1', seed, date: new Date(0), mapVeto: [], vetoComplete: true, maps: [map], mapResults: [], roundHistory: [] } as unknown as Match
    const ctx = simulationEngineV2.createSeriesContext(match, team('HOME', hp, 'aggressive'), team('AWAY', ap, 'structured'), hp, ap, {}, {}, [map], tactics(), 'HOME')
    let state = createLegacySeriesState(ctx)
    const steps: LegacyRoundStep[] = []
    while (!state.finished && steps.length < maxRounds) {
        const step = playLegacyRound(ctx, state)
        steps.push(step)
        state = step.state
    }
    const live = steps.map(step => buildLiveRoundScript({ ctx, mapId: map, mapIndex: 0, round: step.round, loadouts: { ...step.preRound.home, ...step.preRound.away } })!)
    return { map, ctx, steps, live }
}
