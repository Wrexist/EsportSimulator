import { tournamentFixture } from '@/scripts/launch/l19-tournament-audit'
import { TournamentManager } from '@/engine/tournament-manager'
import { SeededRNG } from '@/engine/rng'
import { matchEngine } from '@/engine/match-engine'
import { simulateMapVeto } from '@/engine/match/map-veto'
import { updateStandings } from '@/engine/processors/standings-processor'
import { hasTerminalTournamentCompletion, terminalTournamentWinner } from '@/engine/processors/tournament-completion'
import { assignMatchDay, scheduleBracketMatch } from '@/engine/tournament/bracket-scheduling'
import { getBracketRoundNumber, resolveCompletedWinner } from '@/engine/tournament/seeding-helpers'
import { CircuitPointsManager, QualificationEngine } from '@/engine/tournament-qualification'
import { FULL_TOURNAMENT_CALENDAR } from '@/data/tournament-calendar'
import { gameCalendarDate, formatGameCalendarDate } from '@/lib/game-calendar'
import { createTournamentSlice } from '@/store/slices/tournament-slice'
import { produce, enableMapSet } from 'immer'
import type { StoreState } from '@/store/types'
import type { BracketMatchSaveData, CompletedMatchSaveData, GameSave } from '@/engine/save-types'

enableMapSet()
function complete(save: GameSave, row: BracketMatchSaveData, winner = row.homeTeamId!) {
    const loser = winner === row.homeTeamId ? row.awayTeamId! : row.homeTeamId!
    const record = { ...row, homeTeamId: row.homeTeamId!, awayTeamId: row.awayTeamId!, day: 5,
        result: { winnerId: winner, homeScore: winner === row.homeTeamId ? 2 : 0, awayScore: winner === row.awayTeamId ? 2 : 0, maps: [] } } as unknown as CompletedMatchSaveData
    save.completedMatches.push(record)
    save.scheduledMatches = save.scheduledMatches.filter(m => m.id !== row.id)
    TournamentManager.processMatchResult(save, row.id, winner, loser)
    return record
}

describe('L19 calendar and tournament boundaries', () => {
    test.each([['BO1', 1, 1], ['BO3', 3, 2], ['BO5', 5, 3]])('%s supplies enough unique maps and plays to the required wins', (format, maps, wins) => {
        const veto = simulateMapVeto(new SeededRNG(19), 'home', 'away', [], [], undefined, undefined, undefined, undefined, String(format))
        expect(veto.maps).toHaveLength(Number(maps))
        expect(new Set(veto.maps).size).toBe(Number(maps))
        const save = tournamentFixture('bracket', 8)
        const [home, away] = save.teams
        const result = matchEngine.simulateMatch({ id: 'series', homeTeamId: home.id, awayTeamId: away.id, week: 1, format, seed: 19 } as any,
            home, away, save.players.filter(p => home.rosterIds.includes(p.id)), save.players.filter(p => away.rosterIds.includes(p.id)), new SeededRNG(19))
        expect(Math.max(result.homeScore, result.awayScore)).toBe(Number(wins))
        expect(result.maps.length).toBe(result.homeScore + result.awayScore)
    })

    test('UTC day offsets agree across DST, historical fixtures and week 53', () => {
        expect(gameCalendarDate('2026-09-07T00:00:00.000Z', 8, 6).toISOString()).toBe('2026-11-01T00:00:00.000Z')
        expect(gameCalendarDate('2026-09-07T00:00:00.000Z', 53).toISOString()).toBe('2027-09-06T00:00:00.000Z')
        expect(formatGameCalendarDate(gameCalendarDate('2026-09-07T00:00:00Z', 1, 6), { weekday: 'long' })).toBe('Sunday')
    })

    test('12 entrants receive four distinct top-seed byes and a complete bracket', () => {
        const save = tournamentFixture('bracket', 12)
        const tournament = save.tournaments[0]
        TournamentManager.initializeTournament(save, tournament.id, tournament.teamIds, new SeededRNG(19))
        const byes = tournament.playoffBracket!.filter(m => m.isCompleted)
        expect(byes).toHaveLength(4)
        expect(new Set(byes.map(m => m.winnerId))).toEqual(new Set(tournament.teamIds.slice(0, 4)))
        expect(byes.every(m => m.winnerId !== 'BYE')).toBe(true)
        for (let iteration = 0; iteration < 8; iteration++) {
            for (const scheduled of [...save.scheduledMatches]) {
                const row = tournament.playoffBracket!.find(m => m.id === scheduled.id)!
                complete(save, row)
            }
            TournamentManager.repairTournamentProgression(save, tournament.id)
        }
        updateStandings(save)
        expect(tournament.rewardsGranted).toBe(true)
        expect(save.completedMatches).toHaveLength(12)
        expect(new Set(TournamentManager.calculatePlacements(save, tournament).map(p => p.teamId)).size).toBe(12)
    })

    test('replayed or foreign winners cannot replace an already resolved source slot', () => {
        const save = tournamentFixture('bracket', 8), tournament = save.tournaments[0]
        TournamentManager.initializeTournament(save, tournament.id, tournament.teamIds, new SeededRNG(19))
        const first = tournament.playoffBracket![0]
        TournamentManager.processMatchResult(save, first.id, 'outsider', first.homeTeamId!)
        expect(first.isCompleted).toBe(false)
        complete(save, first)
        const snapshot = JSON.stringify(tournament.playoffBracket)
        TournamentManager.processMatchResult(save, first.id, first.awayTeamId!, first.homeTeamId!)
        expect(JSON.stringify(tournament.playoffBracket)).toBe(snapshot)
    })

    test('a full calendar moves a match to the next week and repeated scheduling is inert', () => {
        const save = tournamentFixture('bracket', 8)
        const [homeTeamId, awayTeamId] = save.tournaments[0].teamIds
        save.scheduledMatches = Array.from({ length: 7 }, (_, day) => ({ id: `busy${day}`, homeTeamId, awayTeamId: 'other', week: 1, day })) as any
        expect(assignMatchDay(save, [homeTeamId], 1)).toBe(-1)
        const row = { id: 'next', tournamentId: save.tournaments[0].id, homeTeamId, awayTeamId, week: 1, stage: 'Final', format: 'BO3', seed: 1, isCompleted: false } as BracketMatchSaveData
        scheduleBracketMatch(save, row); scheduleBracketMatch(save, row)
        expect(row.week).toBe(2)
        expect(save.scheduledMatches.filter(m => m.id === 'next')).toHaveLength(1)
        save.timeMode = 'HYBRID_DAILY'; save.currentDay = 6; save.scheduledMatches = []
        expect(assignMatchDay(save, [homeTeamId], 1)).toBe(6)
        save.completedMatches = [{ homeTeamId, awayTeamId, week: 1, day: 6 }] as any
        expect(assignMatchDay(save, [homeTeamId], 1)).toBe(-1)
    })

    test('stage order puts round of 32 before round of 16', () => {
        const row = (stage: string) => ({ id: 'fixture', stage, week: 1 } as BracketMatchSaveData)
        expect(getBracketRoundNumber(row('Round of 32 Match 1'))).toBeLessThan(getBracketRoundNumber(row('Round of 16 Match 1')))
        expect(getBracketRoundNumber(row('Round of 16 Match 1'))).toBeLessThan(getBracketRoundNumber(row('Quarter-final 1')))
    })

    test('an empty remaining schedule cannot finish a partially played league', () => {
        const save = tournamentFixture('league', 4), tournament = save.tournaments[0]
        const [homeTeamId, awayTeamId] = tournament.teamIds
        save.completedMatches = [{ id: 'one', tournamentId: tournament.id, homeTeamId, awayTeamId, result: { winnerId: homeTeamId, homeScore: 2, awayScore: 0, maps: [] } }] as any
        expect(hasTerminalTournamentCompletion(save, tournament)).toBe(false)
    })

    test('an upset final decides the champion; third place must finish before rewards', () => {
        const save = tournamentFixture('bracket', 4), tournament = save.tournaments[0]
        TournamentManager.initializeTournament(save, tournament.id, tournament.teamIds, new SeededRNG(19))
        for (const row of tournament.playoffBracket!.filter(m => m.stage.startsWith('Semi-final'))) complete(save, row)
        const final = tournament.playoffBracket!.find(m => m.stage === 'Grand Final')!
        complete(save, final, final.awayTeamId)
        updateStandings(save)
        expect(tournament.rewardsGranted).toBe(false)
        complete(save, tournament.playoffBracket!.find(m => m.stage === '3rd Place Decider')!)
        updateStandings(save)
        expect(terminalTournamentWinner(save, tournament)).toBe(final.awayTeamId)
        const after = JSON.stringify(save)
        updateStandings(save)
        expect(JSON.stringify(save)).toBe(after)
    })

    test('missing scores and forged participant winners remain unresolved', () => {
        expect(resolveCompletedWinner({ homeTeamId: 'a', awayTeamId: 'b', result: { winnerId: 'outsider' } } as any)).toBeUndefined()
        expect(resolveCompletedWinner({ homeTeamId: 'a', awayTeamId: 'b', result: {} } as any)).toBeUndefined()
    })

    test('circular head-to-head ties sort consistently after input reordering and duplicate records', () => {
        const save = tournamentFixture('league', 3), tournament = save.tournaments[0]
        const [a,b,c] = tournament.teamIds
        save.completedMatches = [[a,b],[b,c],[c,a]].map(([homeTeamId, awayTeamId], i) => ({ id: String(i), tournamentId: tournament.id, homeTeamId, awayTeamId, result: { winnerId: homeTeamId, homeScore: 2, awayScore: 0, maps: [] } })) as any
        save.scheduledMatches = [{ tournamentId: tournament.id }] as any
        updateStandings(save)
        const order = tournament.standings.map(s => s.teamId)
        tournament.standings.reverse(); save.completedMatches.push(save.completedMatches[0])
        updateStandings(save)
        expect(tournament.standings.map(s => s.teamId)).toEqual(order)
        expect(tournament.standings.every(s => s.matchesPlayed === 2)).toBe(true)
    })

    test('circuit points store action uses season identity and awards only once', () => {
        let state = tournamentFixture('bracket', 8, 53) as unknown as StoreState
        const set = (fn: any) => { state = produce(state, fn) }
        const actions = createTournamentSlice(set, () => state)
        const definition = FULL_TOURNAMENT_CALENDAR.find(t => t.tier === 'S_TIER')!
        actions.awardCircuitPoints(state.teams[0].id, definition.id, 2)
        const snapshot = JSON.stringify(state.circuitPoints)
        actions.awardCircuitPoints(state.teams[0].id, `${definition.id}_s2`, 2)
        expect(JSON.stringify(state.circuitPoints)).toBe(snapshot)
        expect(state.circuitPoints[0].results[0].tournamentId).toBe(`${definition.id}_s2`)
        const repeated = CircuitPointsManager.awardPoints(state.circuitPoints, state.teams[0].id, { ...definition, id: `${definition.id}_s2` }, 2, 53)
        expect(repeated).toEqual(state.circuitPoints)
    })

    test('qualification does not reuse a previous season or count duplicate roster IDs', () => {
        const save = tournamentFixture('bracket', 8)
        const definition = FULL_TOURNAMENT_CALENDAR.find(t => t.entryType === 'QUALIFIER')!
        const team = save.teams[0]
        const qualification = { tournamentId: `${definition.id}_s1`, teamId: team.id, status: 'QUALIFIED' } as any
        expect(QualificationEngine.checkEligibility({ ...definition, id: `${definition.id}_s2` }, team, 1, [], [qualification]).canRegister).toBe(false)
        expect(QualificationEngine.checkEligibility({ ...definition, id: `${definition.id}_s1` }, team, 1, [], [qualification]).canRegister).toBe(true)
        team.rosterIds = Array(5).fill(team.rosterIds[0])
        expect(QualificationEngine.checkEligibility({ ...definition, id: `${definition.id}_s1` }, team, 1, [], [qualification]).canRegister).toBe(false)
    })
})
