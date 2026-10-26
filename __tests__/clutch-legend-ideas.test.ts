/**
 * Kill feed tags, "Key rounds only" and "Why you won": the round log carries
 * through-smoke and clutch-kill marks, the live match can skip quiet rounds,
 * and the result screen ranks what leaned toward the result.
 */
import { simulationEngineV2 } from '@/engine/match-simulation'
import { createLegacySeriesState, playLegacyRound, finalizeLegacySeries, type LegacyRoundStep } from '@/engine/match/legacy-series'
import { buildSide, even } from '@/engine/match/calibration/fixtures'
import { keyRoundReason } from '@/lib/live-key-rounds'
import { buildMatchReasons, playerLine } from '@/lib/match-reasons'
import { killTags } from '@/components/match/live/LiveFeed'
import type { Match, MatchEvent, PlayerMatchStats, Team } from '@/types'
import { MapId } from '@/types/enums'

function play(map: MapId, seed: number) {
    const home = buildSide({ id: 'H', skills: even(72) }), away = buildSide({ id: 'A', skills: even(68) })
    const match = { id: `cl_${map}_${seed}`, homeTeamId: 'H', awayTeamId: 'A', format: 'BO1', seed, date: new Date(0), mapVeto: [], vetoComplete: true, maps: [map], mapResults: [], roundHistory: [] } as unknown as Match
    const ctx = simulationEngineV2.createSeriesContext(match, home.team as unknown as Team, away.team as unknown as Team, home.players, away.players, {}, {}, [map], undefined, 'H')
    let state = createLegacySeriesState(ctx)
    const steps: LegacyRoundStep[] = []
    while (!state.finished) {
        const step = playLegacyRound(ctx, state)
        steps.push(step)
        state = step.state
    }
    return { ctx, steps, state, home, away }
}

const games = [play(MapId.MIRAGE, 11), play(MapId.INFERNO, 12), play(MapId.ANCIENT, 13), play(MapId.OVERPASS, 14)]
const allKills = games.flatMap(g => g.steps.flatMap(s => (s.round.events ?? []).filter(e => e.type === 'KILL')))

describe('kill feed tags from the round log', () => {
    test('through-smoke and clutch kills appear, and clutch kills really are 1vN', () => {
        expect(allKills.some(e => e.isThroughSmoke)).toBe(true)
        expect(allKills.some(e => e.isClutchKill)).toBe(true)
        expect(allKills.filter(e => e.isThroughSmoke).every(e => !e.isUtility)).toBe(true)
        for (const g of games) for (const s of g.steps) {
            const r = s.round
            const ids = (r.events ?? []).filter(e => e.type === 'KILL')
            const home = new Set(g.home.players.map(p => p.id))
            const dead = new Set<string>()
            for (const e of ids) {
                const mine = home.has(e.playerId!) ? g.home.players : g.away.players
                const theirs = home.has(e.playerId!) ? g.away.players : g.home.players
                const alone = mine.filter(p => !dead.has(p.id)).length === 1
                const vsTwo = theirs.filter(p => !dead.has(p.id)).length >= 2
                expect(!!e.isClutchKill).toBe(alone && vsTwo)
                dead.add(e.victimId!)
            }
        }
    })

    test('tags read in caster order and stay off ordinary kills', () => {
        expect(killTags({ type: 'KILL', message: '' })).toEqual([])
        const tags = killTags({ type: 'KILL', message: '', isOpening: true, isClutchKill: true, isThroughSmoke: true, isTrade: true })
        expect(tags.map(t => t.label)).toEqual(['Opening', 'Clutch', 'Smoke', 'Trade'])
    })
})

describe('key rounds only', () => {
    const quiet: MatchEvent[] = [{ type: 'KILL', time: 30, playerId: 'a' }, { type: 'KILL', time: 40, playerId: 'b' }, { type: 'ROUND_END', time: 60 }]
    const base = { roundNumber: 6, isOvertime: false, homeRounds: 3, awayRounds: 2, events: quiet }

    test('a mid-half round with nothing special is skipped', () => {
        expect(keyRoundReason(base)).toBeNull()
    })

    test('pistols, half end, map point, close finish, overtime and manager calls always play', () => {
        expect(keyRoundReason({ ...base, roundNumber: 1, homeRounds: 0, awayRounds: 0 })).toBe('pistol')
        expect(keyRoundReason({ ...base, roundNumber: 13 })).toBe('pistol')
        expect(keyRoundReason({ ...base, roundNumber: 12 })).toBe('half-end')
        expect(keyRoundReason({ ...base, roundNumber: 20, homeRounds: 12, awayRounds: 7 })).toBe('map-point')
        expect(keyRoundReason({ ...base, roundNumber: 21, homeRounds: 10, awayRounds: 10 })).toBe('close-finish')
        expect(keyRoundReason({ ...base, roundNumber: 26, isOvertime: true })).toBe('overtime')
        expect(keyRoundReason({ ...base, managerCall: true })).toBe('manager-call')
    })

    test('clutches, four-kill rounds and defuses play', () => {
        expect(keyRoundReason({ ...base, events: [...quiet, { type: 'CLUTCH', time: 59, playerId: 'a', details: '1v2' }] })).toBe('clutch')
        const four = [1, 2, 3, 4].map(i => ({ type: 'KILL' as const, time: i * 5, playerId: 'a' }))
        expect(keyRoundReason({ ...base, events: four })).toBe('multi-kill')
        expect(keyRoundReason({ ...base, events: [...quiet, { type: 'DEFUSE', time: 70 }] })).toBe('defuse')
    })

    test('a real map skips a share of rounds but keeps every pistol', () => {
        const g = games[0]
        let home = 0, away = 0, skipped = 0
        for (const s of g.steps) {
            const r = s.round
            const reason = keyRoundReason({ roundNumber: r.roundNumber, isOvertime: r.roundNumber > 24, homeRounds: home, awayRounds: away, events: r.events ?? [] })
            if (r.roundNumber === 1 || r.roundNumber === 13) expect(reason).toBe('pistol')
            if (!reason) skipped++
            if (r.winningTeamId === 'H') home++
            else away++
        }
        expect(skipped).toBeGreaterThan(0)
        expect(skipped).toBeLessThan(g.steps.length)
    })
})

describe('why you won', () => {
    test('reasons lean toward the result, at most three, ranked by swing', () => {
        for (const g of games) {
            const result = finalizeLegacySeries(g.ctx, g.state)
            const own = g.home.players.map(p => p.id), opp = g.away.players.map(p => p.id)
            for (const [teamId, isHome, a, b] of [['H', true, own, opp], ['A', false, opp, own]] as const) {
                const why = buildMatchReasons({ result, teamId, isHome, ownLineup: [...a], opponentLineup: [...b] })
                const won = result.winnerId === teamId
                expect(why.reasons.length).toBeGreaterThan(0)
                expect(why.reasons.length).toBeLessThanOrEqual(3)
                for (const r of why.reasons) expect(won ? r.swing > 0 : r.swing < 0).toBe(true)
                for (let i = 1; i < why.reasons.length; i++) expect(Math.abs(why.reasons[i - 1].swing)).toBeGreaterThanOrEqual(Math.abs(why.reasons[i].swing))
                expect(why.players.map(p => p.playerId).sort()).toEqual([...a].sort())
                for (const p of why.players) expect(p.line).toMatch(/\.$/)
            }
        }
    })

    test('opening duels add up to the rounds with a kill', () => {
        const g = games[1]
        const result = finalizeLegacySeries(g.ctx, g.state)
        const why = buildMatchReasons({ result, teamId: 'H', isHome: true, ownLineup: g.home.players.map(p => p.id), opponentLineup: g.away.players.map(p => p.id) })
        const roundsWithKill = result.maps[0].rounds.filter(r => (r.events ?? []).some(e => e.type === 'KILL')).length
        const opening = [...why.reasons].find(r => r.key === 'opening')
        if (opening) {
            const [a, b] = opening.text.match(/Opening duels (\d+)–(\d+)/)!.slice(1).map(Number)
            expect(a + b).toBe(roundsWithKill)
        }
    })

    test('player lines name strengths first, then one weakness', () => {
        const s = { playerId: 'p', matchId: 'm', kills: 20, deaths: 14, assists: 3, headshots: 9, adr: 92, kast: 74, rating: 1.25, clutches: 1, firstKills: 5, firstDeaths: 1, mapsPlayed: 1 } as PlayerMatchStats
        expect(playerLine(s, { openings: 5, openingDeaths: 1, trades: 0, clutches: ['1v2'], multikills: 0, utility: 0 })).toBe('Won a 1v2 clutch, 5 opening kills.')
        const weak = { ...s, adr: 51, kast: 55, rating: 0.7 }
        expect(playerLine(weak, { openings: 0, openingDeaths: 4, trades: 0, clutches: [], multikills: 0, utility: 0 })).toBe('Died first in 4 rounds.')
        expect(playerLine({ ...s, adr: 72, kast: 70 }, { openings: 1, openingDeaths: 1, trades: 1, clutches: [], multikills: 0, utility: 0 })).toBe('20–14, 72 damage per round: a steady game.')
    })
})
