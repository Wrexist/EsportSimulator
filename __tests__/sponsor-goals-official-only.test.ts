/**
 * MARKET-01 (regression of MARKET-06): friendlies and scrims never advance
 * the per-match sponsor goals ("Win Matches", "Win Tournament maps"), on
 * every path a match result is committed:
 *   - the managed path (saveMatchResult: live match, "Sim match", quick sim)
 *   - the week tick's auto path (playAutoMatch)
 * The 2026-11-03 fix only covered the engine helper; the slice kept its own
 * copy of the goal loop without the official-match check.
 */
import { produce, enableMapSet } from 'immer'
import { createLaunchFixture } from '@/scripts/launch/fixtures'
import { createMatchSimulationSlice } from '@/store/slices/match-simulation-slice'
import { playAutoMatch } from '@/engine/processors/auto-match'
import { SeededRNG } from '@/engine/rng'
import type { GameSave, MatchSaveData, SponsorSaveData } from '@/engine/save-types'
import type { StoreState } from '@/store/types'

enableMapSet()

const LEAGUE = 'league_s1_test_d1'

function sponsor(): SponsorSaveData {
    return {
        id: 'sp_wager', name: 'Wagerway Esports', tier: 'STANDARD', weeklyPayout: 1000, remainingWeeks: 12, requirements: '',
        goals: [
            { id: 'g_win', description: 'Win Matches', current: 0, target: 1, bonusPayout: 5000, isCompleted: false },
            { id: 'g_maps', description: 'Win Tournament maps', current: 0, target: 1, bonusPayout: 8000, isCompleted: false },
        ],
    } as SponsorSaveData
}

const goalState = (s: { teams: GameSave['teams'] }, teamId: string) =>
    s.teams.find(t => t.id === teamId)!.sponsors![0].goals!.map(g => [g.current, g.isCompleted])

/** A won BO1 on Nuke for the home side (the managed club). */
function wonResult(state: StoreState) {
    return {
        homeScore: 1, awayScore: 0,
        maps: [{ map: 'Nuke', homeScore: 13, awayScore: 8, rounds: [] }],
        playerStats: Object.fromEntries(state.players.map(p => [p.id, { kills: 10, deaths: 5, assists: 2, rating: 1.1 }])),
        mvpPlayerId: state.teams[0].rosterIds[0],
    }
}

function managedHarness(matchPatch: Partial<MatchSaveData>) {
    const save = createLaunchFixture('first-week')
    save.scheduledMatches[0] = { ...save.scheduledMatches[0], maps: ['Nuke'], ...matchPatch }
    save.teams[0].sponsors = [sponsor()]
    let state = { ...save, saveId: save.saveId, managerDetails: save.managerDetails, newsFeed: [] } as unknown as StoreState
    const set = (fn: Partial<StoreState> | ((s: StoreState) => void)) => { state = typeof fn === 'function' ? produce(state, fn) : { ...state, ...fn } }
    const slice = createMatchSimulationSlice(set, () => state)
    return { read: () => state, slice, match: state.scheduledMatches[0], teamId: save.teams[0].id }
}

describe('managed path (saveMatchResult)', () => {
    test.each([
        ['preseason friendly (SCRIM)', { id: 'scrim_preseason_0_t', tournamentId: 'SCRIM', stage: 'Preseason friendly' }],
        ['friendly without a tournament', { tournamentId: null }],
        ['scrim flag on a league id', { tournamentId: LEAGUE, isScrim: true }],
    ])('a %s win leaves every match goal at 0 and pays nothing', (_label, patch) => {
        const h = managedHarness(patch as Partial<MatchSaveData>)
        const budget = h.read().teams[0].budget
        h.slice.saveMatchResult(h.match.id, wonResult(h.read()))
        expect(h.read().completedMatches).toHaveLength(1)
        expect(goalState(h.read(), h.teamId)).toEqual([[0, false], [0, false]])
        expect(h.read().financeLedger.some(e => e.category === 'SPONSOR')).toBe(false)
        expect(h.read().eventsLog.some(e => e.type === 'SPONSOR_OFFER')).toBe(false)
        expect(h.read().teams[0].budget).toBe(budget)
    })

    test('an official win completes both goals and pays each bonus exactly once', () => {
        const h = managedHarness({ id: 'league_m1', tournamentId: LEAGUE, stage: 'Round 1' })
        const budget = h.read().teams[0].budget
        h.slice.saveMatchResult(h.match.id, wonResult(h.read()))
        expect(goalState(h.read(), h.teamId)).toEqual([[1, true], [1, true]])
        const paid = h.read().financeLedger.filter(e => e.category === 'SPONSOR')
        expect(paid.map(e => e.amount).sort()).toEqual([5000, 8000])
        expect(paid.every(e => e.id.startsWith('fin_sponsor_match_'))).toBe(true)
        expect(h.read().eventsLog.filter(e => e.type === 'SPONSOR_OFFER')).toHaveLength(2)
        // Budget includes both bonuses (contract bonuses are not set in the fixture).
        expect(h.read().teams[0].budget).toBe(budget + 13000)
    })
})

describe('auto path (playAutoMatch, week tick)', () => {
    function autoRun(patch: Partial<MatchSaveData>) {
        const save = createLaunchFixture('first-week')
        const match = { ...save.scheduledMatches[0], ...patch } as MatchSaveData
        const [home, away] = [save.teams.find(t => t.id === match.homeTeamId)!, save.teams.find(t => t.id === match.awayTeamId)!]
        home.sponsors = [sponsor()]
        away.sponsors = [sponsor()]
        const out = playAutoMatch(save, match, home, away, { rng: new SeededRNG(7), playerTeamId: save.playerTeamId!, removedMatchIds: new Set() })
        expect(out.recorded).toBe(true)
        const winner = save.completedMatches.at(-1)!.result.winnerId
        return { save, winner }
    }

    test.each([
        ['preseason friendly (SCRIM)', { tournamentId: 'SCRIM' }],
        ['friendly without a tournament', { tournamentId: null }],
        ['scrim flag on a league id', { tournamentId: LEAGUE, isScrim: true }],
    ])('a %s advances no sponsor goal for either side', (_label, patch) => {
        const { save } = autoRun(patch as Partial<MatchSaveData>)
        for (const t of save.teams.slice(0, 2)) expect(goalState(save, t.id)).toEqual([[0, false], [0, false]])
        expect(save.financeLedger.some(e => e.category === 'SPONSOR')).toBe(false)
    })

    test('an official match advances the winner\'s goals', () => {
        const { save, winner } = autoRun({ tournamentId: LEAGUE, stage: 'Round 1' })
        expect(goalState(save, winner!)).toEqual([[1, true], [1, true]])
    })
})
