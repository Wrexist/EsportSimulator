import { processMatchWeaponMastery } from '@/engine/processors/match-weapon-mastery'
import { WeaponMasteryManager } from '@/engine/weapon-mastery-system'
/**
 * L21 / L14.A1+A3 for the legacy-v2 career engine: the same seeded fixture
 * produces the same canonical result whether it is simulated instantly,
 * stepped round by round (live), skipped (no manager calls), or resumed from
 * a serialized checkpoint, and the result commits rewards exactly once.
 */
import { produce, enableMapSet } from 'immer'
import { createLaunchFixture } from '@/scripts/launch/fixtures'
import { createMatchSimulationSlice } from '@/store/slices/match-simulation-slice'
import { getActivePlayersByRosterOrder } from '@/lib/live-match-builders'
import { prepareLegacySeries, buildManagementRecord } from '@/engine/match/legacy-prepare'
import {
    createLegacySeriesState, finalizeLegacySeries, normalizeRestoredSim, playLegacyRound, runLegacySeries, decisionView,
    applyLegacyTransition, LEGACY_SERIES_RULES, type LegacyDecisionPolicy, type LegacySeriesContext, type LegacySeriesState, type ManagerStrategy,
} from '@/engine/match/legacy-series'
import { restoreTimeoutState, spendTimeout } from '@/engine/match/manager-controls'
import { simulationEngineV2 } from '@/engine/match-simulation'
import { createDefaultTactics } from '@/engine/default-tactics'
import type { GameSave } from '@/engine/save-types'
import type { StoreState } from '@/store/types'
import type { MatchResult, Team } from '@/types'

enableMapSet()

function fixture(format: 'BO1' | 'BO3' | 'BO5', seed: number, maps?: string[]): GameSave {
    const save = createLaunchFixture('first-week', 3921)
    const m = save.scheduledMatches[0]
    m.format = format
    m.seed = seed
    if (maps) m.maps = maps as never
    // Even teams so series go the distance and include overtime on some seeds.
    const own = save.teams[0], opp = save.teams[1]
    own.rosterIds.forEach((id, i) => Object.assign(save.players.find(p => p.id === id)!, { skill: 65, rifle: 66, awp: 62, pistol: 65, tactic: 65 }))
    opp.rosterIds.forEach(id => Object.assign(save.players.find(p => p.id === id)!, { skill: 65, rifle: 66, awp: 62, pistol: 65, tactic: 65 }))
    return save
}

function ctxFor(save: GameSave, managed = save.playerTeamId): LegacySeriesContext {
    const match = save.scheduledMatches[0]
    const home = save.teams.find(t => t.id === match.homeTeamId)!, away = save.teams.find(t => t.id === match.awayTeamId)!
    return prepareLegacySeries({
        match, homeTeam: home, awayTeam: away,
        homePlayers: getActivePlayersByRosterOrder(home, save.players), awayPlayers: getActivePlayersByRosterOrder(away, save.players),
        staff: save.staff as never, customTactics: createDefaultTactics(), managedTeamId: managed,
    })
}

/** The live hook's loop without React: decisions between rounds, optional checkpoint after every round. */
function stepLive(ctx: LegacySeriesContext, choose?: (state: LegacySeriesState, timeouts: { remaining: number; rounds: number }) => { strategy?: ManagerStrategy; timeout?: boolean } | undefined, resumeEvery = 0) {
    let state = createLegacySeriesState(ctx)
    let timeouts = restoreTimeoutState()
    let n = 0
    while (!state.finished) {
        const c = choose?.(state, timeouts)
        if (c?.timeout) timeouts = spendTimeout(timeouts, true, 'IN_PROGRESS') ?? timeouts
        const step = playLegacyRound(ctx, state, { strategy: c?.strategy, regroup: timeouts.rounds > 0 })
        if (timeouts.rounds > 0) timeouts = { ...timeouts, rounds: timeouts.rounds - 1 }
        state = step.state
        if (resumeEvery && ++n % resumeEvery === 0) {
            // Checkpoint → JSON → restore (the save path) between rounds.
            const restored = JSON.parse(JSON.stringify({ state, timeouts }))
            state = { ...restored.state, sim: normalizeRestoredSim(ctx, restored.state.sim, false) }
            timeouts = restoreTimeoutState(restored.timeouts.remaining, restored.timeouts.rounds)
        }
    }
    return { state, timeouts }
}

const canon = (r: MatchResult) => JSON.stringify(r)

describe('legacy-v2 instant / live / skip / resume agree', () => {
    for (const format of ['BO1', 'BO3', 'BO5'] as const) {
        test(`${format}: instant == live stepping == skip == resumed at every round and every 7 rounds`, () => {
            const save = fixture(format, 4242)
            const ctx = ctxFor(save)
            const instant = finalizeLegacySeries(ctx, runLegacySeries(ctx).state)
            const live = finalizeLegacySeries(ctx, stepLive(ctx).state)
            const resumedEach = finalizeLegacySeries(ctx, stepLive(ctx, undefined, 1).state)
            const resumed7 = finalizeLegacySeries(ctx, stepLive(ctx, undefined, 7).state)
            expect(canon(live)).toBe(canon(instant))
            expect(canon(resumedEach)).toBe(canon(instant))
            expect(canon(resumed7)).toBe(canon(instant))
            // Engine facade (AI/tournament adapters) is the same runner.
            const facade = simulationEngineV2.simulateMatch({ ...save.scheduledMatches[0] } as never, ctx.home.team, ctx.away.team, ctx.home.players, ctx.away.players, ctx.home.staff, ctx.away.staff, undefined, createDefaultTactics(), save.playerTeamId)
            expect(canon(facade)).toBe(canon(instant))
            expect(Math.max(instant.homeScore, instant.awayScore)).toBe(format === 'BO1' ? 1 : format === 'BO3' ? 2 : 3)
            // Every recorded round carries the economy record live used to omit.
            expect(instant.maps.every(m => m.rounds.every(r => r.playerEconomy?.length === 10 && r.buys))).toBe(true)
        })
    }

    test('a live decision log replayed as a policy reproduces the live result exactly (home or away managed)', () => {
        for (const managedHome of [true, false]) {
            const save = fixture('BO3', 777)
            const managed = managedHome ? save.teams[0].id : save.teams[1].id
            const ctx = ctxFor(save, managed)
            const log: Record<string, { strategy?: ManagerStrategy; timeout?: boolean }> = {}
            const live = stepLive(ctx, (state, timeouts) => {
                const v = decisionView(ctx, state.sim, timeouts)!
                const call = v.pistolRound ? undefined : v.ownLossStreak >= 2 ? { strategy: 'FORCE' as const, timeout: v.timeoutsRemaining > 0 && !v.regroupActive } : v.round % 5 === 0 ? { strategy: 'ECO' as const } : undefined
                if (call) log[`${v.mapIndex}:${v.round}`] = call
                return call
            })
            const policy: LegacyDecisionPolicy = v => { const c = log[`${v.mapIndex}:${v.round}`]; return c && { strategy: c.strategy, callTimeout: c.timeout } }
            const replay = runLegacySeries(ctx, policy)
            expect(canon(finalizeLegacySeries(ctx, replay.state))).toBe(canon(finalizeLegacySeries(ctx, live.state)))
            expect(replay.timeouts).toEqual(live.timeouts)
            // Calls only touched the managed side.
            const rounds = replay.state.maps.flatMap(m => m.rounds)
            expect(rounds.some(r => r.managerCall?.strategy)).toBe(true)
            const auto = finalizeLegacySeries(ctx, runLegacySeries(ctx).state)
            expect(canon(auto)).not.toBe(canon(finalizeLegacySeries(ctx, replay.state)))
        }
    })

    test('overtime series agree across instant, live and resumed paths', () => {
        let found = 0
        for (let seed = 1; seed <= 400 && found < 2; seed++) {
            const save = fixture('BO1', seed)
            const ctx = ctxFor(save)
            const instant = finalizeLegacySeries(ctx, runLegacySeries(ctx).state)
            if (instant.maps[0].rounds.length <= 24) continue
            found++
            expect(canon(finalizeLegacySeries(ctx, stepLive(ctx, undefined, 1).state))).toBe(canon(instant))
            const r = instant.maps[0].rounds
            // MR12: sides swap after 12 and at each MR3 overtime half.
            expect(r[12].ctTeam).not.toBe(r[11].ctTeam)
            expect(r[24].ctTeam).toBe(r[0].ctTeam)
            expect(Math.abs(instant.maps[0].finalScore.team1 - instant.maps[0].finalScore.team2)).toBeGreaterThanOrEqual(1)
        }
        expect(found).toBe(2)
    })

    test('restoring a pre-v2 checkpoint applies a pending halftime exactly once', () => {
        const ctx = ctxFor(fixture('BO1', 9))
        let state = createLegacySeriesState(ctx)
        for (let i = 0; i < 11; i++) state = playLegacyRound(ctx, state).state
        // Old live code: round 12 computed, transition deferred to ROUND_END playback.
        const step = playLegacyRound(ctx, state)
        expect(step.transition).toBe('HALFTIME')
        const legacy = { ...state.sim, ...{ homeRounds: step.state.sim.lastRound!.homeRounds, awayRounds: step.state.sim.lastRound!.awayRounds }, currentRound: 13, homeEconomy: { stale: true }, rulesVersion: undefined, lastRound: undefined } as never
        const pending = normalizeRestoredSim(ctx, legacy, true)
        expect(pending.homeStartsCT).toBe(!state.sim.homeStartsCT)
        expect(Object.values(pending.homeEconomy).every((e: { cash: number }) => e.cash === 800)).toBe(true)
        expect(pending.lastRound?.transition).toBe('HALFTIME')
        expect(normalizeRestoredSim(ctx, pending, true)).toEqual(pending)
        // Already played back by the old hook: no second swap.
        const played = normalizeRestoredSim(ctx, { ...(legacy as object), homeStartsCT: !state.sim.homeStartsCT } as never, false)
        expect(played.homeStartsCT).toBe(!state.sim.homeStartsCT)
        expect(played.rulesVersion).toBe(LEGACY_SERIES_RULES)
        // The raw transition is NOT idempotent (it would swap again); the v2 marker is what guards it.
        expect(applyLegacyTransition(ctx, { ...step.state.sim })).toBe('HALFTIME')
        expect(normalizeRestoredSim(ctx, step.state.sim, true)).toEqual({ ...step.state.sim })
    })
})

describe('store instant simulation == live preparation; rewards commit once', () => {
    function storeHarness(format: 'BO1' | 'BO3' | 'BO5', maps?: string[]) {
        const save = fixture(format, 5150, maps)
        let state = { ...save, saveId: save.saveId, customTactics: createDefaultTactics(), newsFeed: [], addToast: jest.fn() } as unknown as StoreState
        const set = (fn: Partial<StoreState> | ((s: StoreState) => void)) => { state = typeof fn === 'function' ? produce(state, fn) : { ...state, ...fn } }
        const slice = createMatchSimulationSlice(set as never, () => state)
        state = { ...state, ...slice }
        return { save, read: () => state, set, slice }
    }

    for (const format of ['BO1', 'BO3', 'BO5'] as const) test(`${format}: store quick-sim result equals the live path for the same fixture`, async () => {
        const h = storeHarness(format, format === 'BO1' ? ['Sandstone'] : format === 'BO3' ? ['Sandstone', 'Mirage', 'Inferno'] : ['Sandstone', 'Mirage', 'Inferno', 'Ancient', 'Anubis'])
        const before = h.read()
        const ctx = ctxFor(before as unknown as GameSave)
        const live = stepLive(ctx)
        const liveResult = finalizeLegacySeries(ctx, live.state, buildManagementRecord({ ctx, match: before.scheduledMatches[0], mode: 'instant', timeoutsUsed: 0, maps: live.state.maps }))
        await h.slice.simulateInstantMatch(before.scheduledMatches[0].id)
        const committed = h.read().completedMatches[0]
        expect(committed.result.maps.map(m => m.map)).toEqual(liveResult.maps.map(m => m.map))
        expect(committed.result.maps.map(m => m.rounds)).toEqual(liveResult.maps.map(m => m.rounds))
        expect([committed.result.homeScore, committed.result.awayScore]).toEqual([liveResult.homeScore, liveResult.awayScore])
        expect(committed.result.mvpPlayerId).toBe(liveResult.mvpPlayerId)
        expect(committed.result.lineups).toEqual(liveResult.lineups)
        for (const [pid, s] of Object.entries(liveResult.playerStats)) expect(committed.result.playerStats[pid].kills).toBe(s.kills)
        expect(committed.result.management).toMatchObject({ teamId: before.playerTeamId, mode: 'instant', timeoutsUsed: 0 })
    })

    test('a second commit (live finish after quick-sim, or a double click) changes nothing', async () => {
        const h = storeHarness('BO3')
        const match = h.read().scheduledMatches[0]
        const ctx = ctxFor(h.read() as unknown as GameSave)
        const liveResult = finalizeLegacySeries(ctx, stepLive(ctx).state)
        h.slice.saveMatchResult(match.id, liveResult)
        const once = JSON.stringify(h.read())
        const xp = h.read().players.find(p => p.id === liveResult.lineups![ctx.home.team.id][0])!.xp
        h.slice.saveMatchResult(match.id, liveResult)
        await h.slice.simulateInstantMatch(match.id)
        expect(JSON.stringify(h.read())).toBe(once)
        expect(h.read().completedMatches).toHaveLength(1)
        expect(h.read().players.find(p => p.id === liveResult.lineups![ctx.home.team.id][0])!.xp).toBe(xp)
        expect(h.read().managerDetails.careerMatches).toBe(1)
    })

    test('a committed match grants the same weapon-category mastery as the weekly tick (balance parity)', () => {
        const h = storeHarness('BO1')
        const match = h.read().scheduledMatches[0]
        const ctx = ctxFor(h.read() as unknown as GameSave)
        const result = finalizeLegacySeries(ctx, runLegacySeries(ctx).state)
        const expected = { players: JSON.parse(JSON.stringify(h.read().players)) } as unknown as GameSave
        processMatchWeaponMastery(expected, result)
        h.slice.saveMatchResult(match.id, result)
        for (const pid of ctx.home.players.map(p => p.id)) {
            const got = WeaponMasteryManager.getPlayerMastery(h.read().players.find(p => p.id === pid) as never)
            const want = WeaponMasteryManager.getPlayerMastery(expected.players.find(p => p.id === pid) as never)
            expect(got.RIFLE).toBe(want.RIFLE)
            expect(got.PISTOL).toBe(want.PISTOL)
        }
        const rifleXp = ctx.home.players.map(p => WeaponMasteryManager.getPlayerMastery(h.read().players.find(x => x.id === p.id) as never).RIFLE)
        expect(rifleXp.some(x => x > 0)).toBe(true)
    })

    test('recorded lineups survive a roster change between simulation and commit', () => {
        const h = storeHarness('BO1')
        const match = h.read().scheduledMatches[0]
        const ctx = ctxFor(h.read() as unknown as GameSave)
        const result = finalizeLegacySeries(ctx, runLegacySeries(ctx).state)
        h.set(s => { s.teams[0].rosterIds.reverse() })
        h.slice.saveMatchResult(match.id, result)
        expect(h.read().completedMatches[0].result.lineups![ctx.home.team.id]).toEqual(ctx.home.players.map(p => p.id))
    })
})

test('managed decisions never alter the opponent buy and are absent from AI-vs-AI series', () => {
    const save = fixture('BO1', 31)
    const ctx = ctxFor(save)
    const calls = runLegacySeries(ctx, v => (v.pistolRound ? undefined : { strategy: 'ECO' })).state.maps[0].rounds
    const plain = runLegacySeries(ctx).state.maps[0].rounds
    // Opponent buys are decided by its own economy only; before the first divergence they match.
    expect(calls[1].buys!.away).toBe(plain[1].buys!.away)
    expect(calls.filter(r => r.roundNumber !== 1 && r.roundNumber !== 13).every(r => r.buys!.home === 'ECO')).toBe(true)
    const ai = { ...ctx, managedTeamId: 'nobody' }
    expect(decisionView(ai, createLegacySeriesState(ai).sim, restoreTimeoutState())).toBeNull()
    void ({} as Team)
})
