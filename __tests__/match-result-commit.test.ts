import { produce, enableMapSet } from 'immer'
import { createLaunchFixture } from '@/scripts/launch/fixtures'
import { createMatchSimulationSlice } from '@/store/slices/match-simulation-slice'
import type { StoreState } from '@/store/types'

enableMapSet()
function harness() {
    const save = createLaunchFixture('first-week')
    save.scheduledMatches[0].maps = ['Nuke']
    let state = { ...save, saveId: save.id, managerDetails: save.managerDetails, newsFeed: [] } as unknown as StoreState
    const set = (fn: Partial<StoreState> | ((s: StoreState) => void)) => { state = typeof fn === 'function' ? produce(state, fn) : { ...state, ...fn } }
    const slice = createMatchSimulationSlice(set, () => state)
    const match = state.scheduledMatches[0]
    const result = { homeScore: 1, awayScore: 0, maps: [{ map: 'Nuke', homeScore: 13, awayScore: 8, rounds: [] }], playerStats: Object.fromEntries(state.players.map(p => [p.id, { kills: 10, deaths: 5, assists: 2, rating: 1.1 }])), mvpPlayerId: state.teams[0].rosterIds[0] }
    return { read: () => state, set, slice, match, result }
}
test('a repeated completion with a stale scheduled copy cannot repeat XP, standings, news or results', () => {
    const h = harness()
    h.slice.saveMatchResult(h.match.id, h.result)
    expect(h.read().completedMatches).toHaveLength(1)
    expect(h.read().completedMatches[0].result.engineVersion).toBe('legacy-v2')
    expect(Object.keys(h.read().completedMatches[0].result.xpGains || {})).toHaveLength(10)
    h.set(s => { s.scheduledMatches.push(h.match) })
    const committed = JSON.stringify(h.read())
    h.slice.saveMatchResult(h.match.id, h.result)
    expect(JSON.stringify(h.read())).toBe(committed)
})
test('wrong map and unsupported spatial/future results leave the complete career untouched', () => {
    for (const change of [{ maps: [{ map: 'Sandstone' }] }, { engineVersion: 'spatial-round-v1' }, { engineVersion: 'future' }]) {
        const h = harness(), before = JSON.stringify(h.read())
        h.slice.saveMatchResult(h.match.id, { ...h.result, ...change })
        expect(JSON.stringify(h.read())).toBe(before)
    }
})


test('L15 live/instant result commit settles contractual bonuses exactly once', () => {
    const h = harness()
    h.set(s => { const c = s.contracts.find(c => c.playerId === h.result.mvpPlayerId)!; c.matchWinBonus = 1000; c.mvpBonus = 500 })
    const opening = h.read().teams[0].budget
    h.slice.saveMatchResult(h.match.id, h.result)
    expect(h.read().teams[0].budget).toBe(opening - 1500)
    expect(h.read().financeLedger.filter(e => e.id.startsWith('contract_bonus_'))).toHaveLength(2)
    h.slice.saveMatchResult(h.match.id, h.result)
    expect(h.read().teams[0].budget).toBe(opening - 1500)
})


test('L17 unused substitutes receive no stats, XP, fatigue, appearances or win bonus', () => {
    const h = harness()
    const benchId = h.read().players.find(p => !h.read().teams.some(t => t.rosterIds.includes(p.id)))!.id
    h.set(s => {
        s.teams[0].rosterIds.push(benchId)
        s.contracts.push({ playerId: benchId, teamId: s.teams[0].id, salaryPerWeek: 100, startWeek: 0, endWeek: 52, matchWinBonus: 9999 } as never)
    })
    const before = JSON.stringify(h.read().players.find(p => p.id === benchId))
    h.slice.saveMatchResult(h.match.id, h.result)
    const committed = h.read().completedMatches[0].result
    expect(committed.playerStats[benchId]).toBeUndefined()
    expect(committed.xpGains?.[benchId]).toBeUndefined()
    expect(JSON.stringify(h.read().players.find(p => p.id === benchId))).toBe(before)
    expect(h.read().financeLedger.some(e => e.description.includes(benchId))).toBe(false)
})


test('L21 quick simulation cannot replace an active or recoverable match', async () => {
    for (const active of [{ activeMatchId: 'other' }, { activeMatchState: { matchId: 'other' } }]) {
        const h = harness(), addToast = jest.fn()
        h.set(s => { Object.assign(s, active); s.addToast = addToast })
        const before = JSON.stringify(h.read())
        await h.slice.simulateInstantMatch(h.match.id)
        expect(JSON.stringify(h.read())).toBe(before)
        expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Resume') }))
    }
})
