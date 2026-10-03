/**
 * L21.A2: the veto-selected map order, forced starting sides and the match-time
 * lineup survive veto -> tactics -> live/instant/skip -> result -> history,
 * for BO1/BO3/BO5, stale fixtures, back navigation and resume.
 */
import fs from 'node:fs'
import { produce, enableMapSet } from 'immer'
import { createLaunchFixture, FixtureStorage } from '@/scripts/launch/fixtures'
import { createMatchSimulationSlice } from '@/store/slices/match-simulation-slice'
import { createMatchOperationsSlice } from '@/store/slices/match-operations-slice'
import { getActivePlayersByRosterOrder } from '@/lib/live-match-builders'
import { prepareLegacySeries } from '@/engine/match/legacy-prepare'
import { createLegacySeriesState, finalizeLegacySeries, normalizeRestoredSim, playLegacyRound, runLegacySeries } from '@/engine/match/legacy-series'
import { createDefaultTactics } from '@/engine/default-tactics'
import { SaveManager } from '@/engine/save-manager'
import { ACTIVE_MAP_POOL } from '@/data/map-pool'
import type { GameSave } from '@/engine/save-types'
import type { StoreState } from '@/store/types'

enableMapSet()

const VETO = {
    BO1: ['Sandstone'],
    BO3: ['Sandstone', 'Ancient', 'Mirage'],
    BO5: ['Sandstone', 'Ancient', 'Mirage', 'Inferno', 'Anubis'],
} as const

function harness(format: keyof typeof VETO, seed = 2026) {
    const save = createLaunchFixture('first-week', 3921)
    const m = save.scheduledMatches[0]
    m.format = format
    m.seed = seed
    let state = { ...save, saveId: save.saveId, customTactics: createDefaultTactics(), newsFeed: [], addToast: jest.fn(), activeMatchId: null, activeMatchState: null, timeMode: 'WEEKLY' } as unknown as StoreState
    const set = (fn: Partial<StoreState> | ((s: StoreState) => void)) => { state = typeof fn === 'function' ? produce(state, fn) : { ...state, ...fn } }
    const sim = createMatchSimulationSlice(set as never, () => state)
    const ops = createMatchOperationsSlice(set as never, () => state)
    state = { ...state, ...sim, ...ops }
    return { read: () => state, set, sim, ops, id: m.id }
}

function liveCtx(state: StoreState, savedMaps?: string[]) {
    const match = state.scheduledMatches[0]
    const home = state.teams.find(t => t.id === match.homeTeamId)!, away = state.teams.find(t => t.id === match.awayTeamId)!
    return prepareLegacySeries({
        match: { ...match, maps: savedMaps ?? match.maps }, homeTeam: home, awayTeam: away,
        homePlayers: getActivePlayersByRosterOrder(home, state.players), awayPlayers: getActivePlayersByRosterOrder(away, state.players),
        staff: state.staff as never, customTactics: state.customTactics, managedTeamId: state.playerTeamId,
    })
}

describe.each(Object.keys(VETO) as (keyof typeof VETO)[])('%s veto contract', format => {
    test('veto order and forced sides reach live, instant and history; lineups are match-time', async () => {
        const h = harness(format)
        const awayId = h.read().scheduledMatches[0].awayTeamId
        const homeId = h.read().scheduledMatches[0].homeTeamId
        // Veto page writes the full pool and side picks.
        h.ops.updateScheduledMatch(h.id, { maps: [...VETO[format]], vetoComplete: true, mapStartingSides: { Sandstone: awayId, Ancient: homeId } })
        expect(h.read().scheduledMatches[0].maps).toEqual(VETO[format])
        expect(h.read().scheduledMatches[0].vetoComplete).toBe(true)

        // Live preparation (the hook) and a resumed live run.
        const ctx = liveCtx(h.read())
        expect(ctx.maps).toEqual(VETO[format])
        let state = createLegacySeriesState(ctx)
        for (let i = 0; i < 10 && !state.finished; i++) state = playLegacyRound(ctx, state).state
        const resumed = JSON.parse(JSON.stringify(state))
        const resumedCtx = liveCtx(h.read(), ctx.maps) // checkpoint's recorded order
        let live = { ...resumed, sim: normalizeRestoredSim(resumedCtx, resumed.sim, false) }
        while (!live.finished) live = playLegacyRound(resumedCtx, live).state
        const liveResult = finalizeLegacySeries(resumedCtx, live)

        // Instant (tactics quick-sim / dashboard) commits the same series.
        await h.sim.simulateInstantMatch(h.id)
        const done = h.read().completedMatches[0]
        expect(done.maps).toEqual(VETO[format])
        expect(done.result.maps.map(m => m.map)).toEqual(VETO[format].slice(0, done.result.maps.length))
        expect(done.result.maps.map(m => m.rounds)).toEqual(liveResult.maps.map(m => m.rounds))
        const sand = done.result.maps.find(m => m.map === 'Sandstone')!
        expect(sand.ctStartTeamId).toBe(awayId)
        expect(sand.rounds[0].ctTeam).toBe(awayId)
        const anc = done.result.maps.find(m => m.map === 'Ancient')
        if (anc) expect(anc.ctStartTeamId).toBe(homeId)
        expect(done.result.lineups![homeId]).toEqual(h.read().teams.find(t => t.id === homeId)!.rosterIds.slice(0, 5))

        // History: canonical save/load keeps maps, sides and lineups.
        const manager = new SaveManager(new FixtureStorage())
        const asSave = JSON.parse(JSON.stringify(h.read())) as GameSave
        expect((await manager.saveGame(asSave)).success).toBe(true)
        const restored = (await manager.loadGame(asSave.saveId)).save!
        expect(restored.completedMatches[0].maps).toEqual(VETO[format])
        expect(restored.completedMatches[0].result.maps.map(m => [m.map, m.ctStartTeamId])).toEqual(done.result.maps.map(m => [m.map, m.ctStartTeamId]))
        expect(restored.completedMatches[0].result.lineups).toEqual(done.result.lineups)
    })
})

test('back navigation and stale fixtures cannot change maps once a match is live or finished', async () => {
    const h = harness('BO3')
    h.ops.updateScheduledMatch(h.id, { maps: [...VETO.BO3], vetoComplete: true })
    h.set({ activeMatchId: h.id } as Partial<StoreState>)
    h.ops.updateScheduledMatch(h.id, { maps: ['Mirage', 'Inferno', 'Overpass'] })
    expect(h.read().scheduledMatches[0].maps).toEqual(VETO.BO3)
    h.set({ activeMatchId: null } as Partial<StoreState>)
    const stale = structuredClone(h.read().scheduledMatches[0])
    await h.sim.simulateInstantMatch(h.id)
    // A stale copy re-inserted by an old tab/back navigation cannot be re-vetoed or re-committed.
    h.set(s => { s.scheduledMatches.push(stale) })
    h.ops.updateScheduledMatch(h.id, { maps: ['Mirage', 'Inferno', 'Overpass'] })
    expect(h.read().scheduledMatches.find(m => m.id === h.id)!.maps).toEqual(VETO.BO3)
    const before = JSON.stringify(h.read().completedMatches)
    h.sim.saveMatchResult(h.id, { ...h.read().completedMatches[0].result })
    expect(JSON.stringify(h.read().completedMatches)).toBe(before)
})

test('a legacy saved veto with retired Nuke is honoured; engine vetoes only use the active pool', async () => {
    const h = harness('BO1')
    h.set(s => { s.scheduledMatches[0].maps = ['Nuke'] })
    expect(liveCtx(h.read()).maps).toEqual(['Nuke'])
    await h.sim.simulateInstantMatch(h.id)
    expect(h.read().completedMatches[0].result.maps[0].map).toBe('Nuke')
    for (let seed = 1; seed <= 40; seed++) {
        const g = harness('BO3', seed)
        const ctx = liveCtx(g.read())
        expect(ctx.maps).toHaveLength(3)
        expect(ctx.maps.every(m => ACTIVE_MAP_POOL.includes(m))).toBe(true)
        // Instant without a veto uses the same engine veto as the live screen.
        const result = finalizeLegacySeries(ctx, runLegacySeries(ctx).state)
        expect(ctx.maps.slice(0, result.maps.length)).toEqual(result.maps.map(m => m.map))
    }
})

test('the live screen has no map authority of its own and drives the shared stepper', () => {
    const src = fs.readFileSync('hooks/useLiveMatch.ts', 'utf8')
    expect(src).not.toMatch(/useSearchParams|searchParams/)
    expect(src).not.toMatch(/simulationEngineV2\.simulateRound|simulationEngineV2\.simulateMatch/)
    expect(src).toMatch(/prepareLegacySeries\(/)
    expect(src).toMatch(/playLegacyRound\(/)
    expect(src).toMatch(/finalizeLegacySeries\(/)
    // One round at a time: a queued start cannot double-play a round.
    expect(src).toMatch(/if \(roundInFlightRef\.current \|\| latestGameStateRef\.current\.status === "FINISHED"\) return/)
})
