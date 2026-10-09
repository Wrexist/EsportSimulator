/**
 * Round timeline consistency gate (revamp Phase 0, item 5).
 *
 * Ported from the 2026-10-09 audit harness (tmp/audit-2026-10-09/sim/
 * run-realism.ts checkRound). Before the fix, ~900 maps produced 2,095
 * explosions not at plant + 40 s, 1,070 "bomb exploded" rounds with every
 * CT already dead, 157 TIME wins with all Ts dead, 136 ELIMINATION wins
 * with survivors and 67 defuses after the bomb would have gone off.
 *
 * Runs a few hundred seeded rounds through the canonical series runner and
 * requires zero violations.
 */
import { simulationEngineV2 } from '@/engine/match-simulation'
import { runLegacySeries, finalizeLegacySeries } from '@/engine/match/legacy-series'
import type { Match, MatchResult, Player, RoundResult, Team } from '@/types'
import { MapId } from '@/types/enums'

const ROLES = ['AWPER', 'IGL', 'ENTRY_FRAGGER', 'SUPPORT', 'RIFLER']
const MAPS = [MapId.MIRAGE, MapId.INFERNO, MapId.OVERPASS, MapId.VERTIGO, MapId.ANCIENT, MapId.ANUBIS, MapId.SANDSTONE]

function player(id: string, skill: number, role: string): Player {
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

function team(id: string, players: Player[], economyStyle?: string): Team {
    return {
        id, name: id, tier: 'PRO', logoPath: '', roster: players.map(p => p.id), staff: [], reputation: 50, fanbase: 0,
        chemistry: 60, facilitiesLevel: 1, trainingSlotsUsed: 0, maxTrainingSlots: 10, budget: 0, tacticalPrep: 0,
        economyStyle, equipment: [],
    } as unknown as Team
}

function playMap(seed: number, homeSkill: number, awaySkill: number, map: MapId, economyStyle?: string): { result: MatchResult; homeIds: Set<string> } {
    const hp = ROLES.map((r, i) => player(`H${i}`, homeSkill, r))
    const ap = ROLES.map((r, i) => player(`A${i}`, awaySkill, r))
    const home = team('HOME', hp, economyStyle), away = team('AWAY', ap)
    const match = { id: `tl_${seed}`, homeTeamId: 'HOME', awayTeamId: 'AWAY', format: 'BO1', seed, date: new Date(0), mapVeto: [], vetoComplete: false, maps: [], mapResults: [], roundHistory: [] } as unknown as Match
    const ctx = simulationEngineV2.createSeriesContext(match, home, away, hp, ap, {}, {}, [map], undefined, 'nobody')
    const run = runLegacySeries(ctx)
    return { result: finalizeLegacySeries(ctx, run.state), homeIds: new Set(hp.map(p => p.id)) }
}

/** Every rule violation in one round, as readable strings. */
function roundViolations(r: RoundResult, homeIds: Set<string>, homeId: string): string[] {
    const out: string[] = []
    const ev = r.events ?? []
    const endEv = ev.find(e => e.type === 'ROUND_END')
    const plant = ev.find(e => e.type === 'PLANT')
    const defuse = ev.find(e => e.type === 'DEFUSE')
    const explode = ev.find(e => e.type === 'EXPLODE')
    const killEv = ev.filter(e => e.type === 'KILL')
    if (!endEv || ev[ev.length - 1] !== endEv) out.push('ROUND_END is not the last event')
    for (let i = 1; i < ev.length; i++) if (ev[i].time < ev[i - 1].time) out.push('events out of time order')
    if (ev.filter(e => e.type === 'PLANT').length > 1) out.push('more than one plant')
    const dead = new Set<string>()
    let homeKills = 0, awayKills = 0
    for (const e of ev) {
        if (!Number.isFinite(e.time)) out.push('NaN event time')
        if (e.type !== 'KILL') continue
        if (dead.has(e.playerId!)) out.push('dead player got a kill')
        if (dead.has(e.victimId!)) out.push('dead player killed again')
        dead.add(e.victimId!)
        if (homeIds.has(e.playerId!) === homeIds.has(e.victimId!)) out.push('same-side kill')
        if (homeIds.has(e.playerId!)) homeKills++; else awayKills++
        if ((!plant || e.time < plant.time) && e.time > 115) out.push('pre-plant kill after the 1:55 round clock')
        if (plant && e.time >= plant.time + 40) out.push('kill at/after the bomb exploded')
        if (defuse && e.time > defuse.time) out.push('kill after the defuse')
    }
    if (homeKills > 5 || awayKills > 5) out.push('more than 5 kills by one team')
    const winnerHome = r.winningTeamId === homeId
    const winnersDead = killEv.filter(e => homeIds.has(e.victimId!) === winnerHome).length
    const losersDead = killEv.length - winnersDead
    const ctWon = r.winner === 'ct'
    const tDead = ctWon ? losersDead : winnersDead
    const ctDead = ctWon ? winnersDead : losersDead
    if (winnersDead >= 5) out.push('round winner fully eliminated')
    if (r.winType === 'ELIMINATION' && losersDead < 5) out.push('ELIMINATION win with loser survivors')
    if (r.winType === 'ELIMINATION' && ctWon && plant) out.push('CT elimination win after a plant (must defuse)')
    if (r.winType === 'TIME' && !ctWon) out.push('TIME win for T')
    if (r.winType === 'TIME' && tDead >= 5) out.push('TIME win although all Ts dead')
    if (r.winType === 'TIME' && plant) out.push('TIME win after a plant')
    if (r.winType === 'BOMB_DEFUSE' && !plant) out.push('defuse without plant')
    if (r.winType === 'BOMB_DEFUSE' && !defuse) out.push('BOMB_DEFUSE without DEFUSE event')
    if (r.winType === 'BOMB_EXPLODED' && !plant) out.push('explode without plant')
    if (r.winType === 'BOMB_EXPLODED' && !explode) out.push('BOMB_EXPLODED without EXPLODE event')
    if (r.winType === 'BOMB_EXPLODED' && ctDead >= 5) out.push('BOMB_EXPLODED though all CTs dead (should end on elimination)')
    if (explode && r.winType !== 'BOMB_EXPLODED') out.push('EXPLODE event in a non-explosion round')
    if (defuse && r.winType !== 'BOMB_DEFUSE') out.push('DEFUSE event in a non-defuse round')
    if (plant && defuse && defuse.time >= plant.time + 40) out.push('defuse after the bomb would have exploded')
    if (plant && defuse && defuse.time < plant.time) out.push('defuse before plant')
    if (plant && explode && explode.time !== plant.time + 40) out.push('explode not at plant + 40 s')
    if (plant && plant.time > 115) out.push('plant after the 1:55 round clock')
    const clutch = ev.find(e => e.type === 'CLUTCH')
    if (clutch && (dead.has(clutch.playerId!) || homeIds.has(clutch.playerId!) !== winnerHome)) out.push('CLUTCH by a dead or losing player')
    if (clutch && winnersDead !== 4) out.push('CLUTCH without a lone survivor')
    const kSum = r.kills.reduce((s, k) => s + k.kills, 0)
    if (kSum !== killEv.length) out.push('kills[] total != KILL events')
    return out
}

describe('round timeline consistency over seeded maps', () => {
    const violations: Record<string, number> = {}
    let rounds = 0, clutches = 0, trades = 0, kills = 0
    const winTypes = new Set<string>()

    beforeAll(() => {
        const gaps: [number, number][] = [[70, 70], [75, 65], [85, 55], [60, 80]]
        let n = 0
        for (const [hs, as] of gaps) {
            for (let i = 0; i < 6; i++) {
                const seed = 9_000 + n * 7_919
                const { result, homeIds } = playMap(seed, hs, as, MAPS[n % MAPS.length], n % 3 === 0 ? 'force' : undefined)
                n++
                for (const m of result.maps) for (const r of m.rounds) {
                    rounds++
                    winTypes.add(`${r.winner}:${r.winType}`)
                    for (const v of roundViolations(r, homeIds, 'HOME')) violations[v] = (violations[v] || 0) + 1
                    for (const e of r.events ?? []) {
                        if (e.type === 'CLUTCH') clutches++
                        if (e.type === 'KILL') { kills++; if (e.isTrade) trades++ }
                    }
                }
            }
        }
    })

    test('covers a few hundred rounds and every win type', () => {
        expect(rounds).toBeGreaterThan(300)
        for (const t of ['ct:ELIMINATION', 'ct:BOMB_DEFUSE', 'ct:TIME', 't:ELIMINATION', 't:BOMB_EXPLODED']) expect(winTypes).toContain(t)
    })

    test('zero timeline / win-reason violations', () => {
        expect(violations).toEqual({})
    })

    test('clutches and trades happen', () => {
        expect(clutches).toBeGreaterThan(0)
        expect(trades / kills).toBeGreaterThan(0.1)
        expect(trades / kills).toBeLessThan(0.3)
    })
})
