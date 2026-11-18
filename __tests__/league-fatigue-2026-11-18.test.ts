/**
 * COMP-10 follow-up (2026-11-18): a round-robin league now plays inside its
 * listed weeks, up to four BO1 rounds a week. At 10 fatigue a BO1 the clubs of
 * those leagues averaged fatigue 67-74 through the event; a league BO1 (stage
 * "League Match") now costs MATCH_FATIGUE_TUNING.LEAGUE_BO1, on the week
 * tick's path and on the managed club's. Every other match is unchanged.
 */
import { produce, enableMapSet } from 'immer'
import { createLaunchFixture } from '@/scripts/launch/fixtures'
import { createMatchSimulationSlice } from '@/store/slices/match-simulation-slice'
import { playAutoMatch } from '@/engine/processors/auto-match'
import { SeededRNG } from '@/engine/rng'
import { MATCH_FATIGUE_TUNING, matchFatigueCost } from '@/lib/balance-tuning'
import type { MatchSaveData } from '@/engine/save-types'
import type { StoreState } from '@/store/types'

enableMapSet()

test('a league BO1 costs less fatigue; other matches keep 10 / 15 / 25', () => {
    expect(MATCH_FATIGUE_TUNING.LEAGUE_BO1).toBeLessThan(MATCH_FATIGUE_TUNING.BO1)
    expect(matchFatigueCost('BO1', 'League Match')).toBe(MATCH_FATIGUE_TUNING.LEAGUE_BO1)
    expect(matchFatigueCost('BO1', 'Quarter-final')).toBe(10)
    expect(matchFatigueCost('BO1', undefined)).toBe(10)
    expect(matchFatigueCost(undefined)).toBe(10)
    expect(matchFatigueCost('BO3', 'League Match')).toBe(15)
    expect(matchFatigueCost('BO3', 'Semi-final')).toBe(15)
    expect(matchFatigueCost('BO5', 'Grand Final')).toBe(25)
})

describe.each([
    ['League Match', MATCH_FATIGUE_TUNING.LEAGUE_BO1],
    ['Round 1', 10],
])('stage "%s" BO1', (stage, cost) => {
    test('the week tick (playAutoMatch) adds that fatigue to every player who played', () => {
        const save = createLaunchFixture('first-week')
        for (const p of save.players) p.fatigue = 20
        const match = { ...save.scheduledMatches[0], format: 'BO1', stage } as MatchSaveData
        const [home, away] = [save.teams.find(t => t.id === match.homeTeamId)!, save.teams.find(t => t.id === match.awayTeamId)!]
        playAutoMatch(save, match, home, away, { rng: new SeededRNG(7), playerTeamId: save.playerTeamId!, removedMatchIds: new Set() })
        const played = Object.keys(save.completedMatches.find(m => m.id === match.id)!.result.playerStats)
        expect(played.length).toBeGreaterThanOrEqual(10)
        for (const id of played) expect(save.players.find(p => p.id === id)!.fatigue).toBe(20 + cost)
    })

    test("the managed club's match (saveMatchResult) adds the same", () => {
        const save = createLaunchFixture('first-week')
        for (const p of save.players) p.fatigue = 20
        save.scheduledMatches[0] = { ...save.scheduledMatches[0], maps: ['Nuke'], format: 'BO1', stage }
        let state = { ...save, saveId: save.saveId, managerDetails: save.managerDetails, newsFeed: [] } as unknown as StoreState
        const set = (fn: Partial<StoreState> | ((s: StoreState) => void)) => { state = typeof fn === 'function' ? produce(state, fn) : { ...state, ...fn } }
        const slice = createMatchSimulationSlice(set, () => state)
        const homeIds = state.teams.find(t => t.id === state.scheduledMatches[0].homeTeamId)!.rosterIds
        slice.saveMatchResult(state.scheduledMatches[0].id, {
            homeScore: 1, awayScore: 0,
            maps: [{ map: 'Nuke', homeScore: 13, awayScore: 8, rounds: [] }],
            playerStats: Object.fromEntries(homeIds.map(id => [id, { kills: 10, deaths: 5, assists: 2, rating: 1.1 }])),
            mvpPlayerId: homeIds[0],
        } as never)
        for (const id of homeIds) expect(state.players.find(p => p.id === id)!.fatigue).toBe(20 + cost)
    })
})
