/**
 * CROSSCUT-13 (2026-11-17): a crash inside the live match screen softlocked
 * the career. The live hook marks the match active (the navigation lock)
 * before the UI renders and the lock is restored on load, while instant
 * simulation refuses an active match, so "Simulate instead" could never run
 * and "Resume match" crashed again.
 *
 * resolveMatchWithoutLiveScreen finishes the match without the live screen:
 * from its checkpoint (the rounds played live are kept, the rest is played on
 * auto) or, without a usable checkpoint, as a whole. Either way the result is
 * recorded and the lock is gone.
 */
import { useGameStore } from '@/store/game-store'
import { debouncedStorage } from '@/engine/storage-adapter'
import { createLaunchFixture } from '@/scripts/launch/fixtures'
import { prepareLegacySeries } from '@/engine/match/legacy-prepare'
import { createLegacySeriesState, playLegacyRound, type LegacySeriesState, type LegacySeriesContext } from '@/engine/match/legacy-series'
import { LEGACY_MATCH_ENGINE } from '@/engine/match/live-checkpoint'
import { resolveEngineVersion } from '@/engine/match/engine-version'
import { finishLegacySeriesFromState, getActivePlayersByRosterOrder, getNormalizedSeed } from '@/lib/live-match-builders'
import { finishLiveMatchFromCheckpoint, resolveMatchWithoutLiveScreen } from '@/lib/live-match-rescue'
import type { GameSave } from '@/engine/save-types'
import type { ActiveMatchState } from '@/types'

jest.mock('@/engine/worker/week-processor-bridge', () => ({ weekProcessorBridge: { processWeek: jest.fn() } }))
jest.mock('@/engine/manager-career-profile', () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined) }))
jest.setTimeout(120_000)

const initial = { ...useGameStore.getState() }
afterEach(async () => { jest.restoreAllMocks(); await debouncedStorage.flush() })

function load() {
    const save = createLaunchFixture('first-week') as unknown as GameSave
    save.timeMode = 'WEEKLY'
    save.currentDay = 6
    const match = save.scheduledMatches.find(m => m.homeTeamId === save.playerTeamId || m.awayTeamId === save.playerTeamId)!
    useGameStore.setState({ ...initial, ...structuredClone(save), league: undefined, isLoading: false, isInitialized: true, _completedMatchIds: new Set(), addToast: jest.fn(), saveGame: jest.fn().mockResolvedValue(undefined) } as never)
    return match.id
}

/** The live screen's context for the match (useLiveMatch initialisation). */
function liveContext(matchId: string): LegacySeriesContext {
    const s = useGameStore.getState()
    const match = s.scheduledMatches.find(m => m.id === matchId)!
    const home = s.teams.find(t => t.id === match.homeTeamId)!
    const away = s.teams.find(t => t.id === match.awayTeamId)!
    return prepareLegacySeries({
        match: { ...match, seed: getNormalizedSeed(match.seed, match.id), engineVersion: resolveEngineVersion(match.engineVersion) },
        homeTeam: home, awayTeam: away,
        homePlayers: getActivePlayersByRosterOrder(home, s.players), awayPlayers: getActivePlayersByRosterOrder(away, s.players),
        staff: s.staff, customTactics: s.customTactics, managedTeamId: s.playerTeamId ?? undefined,
    })
}

/** What the live hook checkpoints between rounds after `rounds` rounds. */
function checkpointAfter(matchId: string, rounds: number): { ctx: LegacySeriesContext; state: LegacySeriesState; checkpoint: ActiveMatchState } {
    const ctx = liveContext(matchId)
    let state = createLegacySeriesState(ctx)
    for (let i = 0; i < rounds; i++) state = playLegacyRound(ctx, state, { strategy: i === 3 ? 'ECO' : undefined, customTactics: useGameStore.getState().customTactics }).state
    const checkpoint = {
        matchId,
        playback: {
            version: 1, engine: ctx.engineVersion ?? LEGACY_MATCH_ENGINE, saveId: useGameStore.getState().saveId,
            events: [], processedTime: 0, exactTime: true, maps: ctx.maps, seed: ctx.seed,
            homeRoster: ctx.home.players.map(p => p.id), awayRoster: ctx.away.players.map(p => p.id),
        },
        gameState: { currentMapIndex: state.sim.currentMapIndex, round: state.sim.currentRound, status: 'IN_PROGRESS', time: 0 },
        simState: state.sim,
        homeRoster: [], awayRoster: [], logs: [], roundTime: 115, isBombPlanted: false, bombTime: 40,
        isWaitingForStrategy: true, timeoutsRemaining: 2, timeoutBoostRounds: 0,
        originalHomePlayers: [], originalAwayPlayers: [],
        matchResult: { maps: state.maps },
    } as unknown as ActiveMatchState
    return { ctx, state, checkpoint }
}

const winners = (maps: { rounds: { roundNumber: number; winningTeamId?: string; winner?: string }[] }[]) =>
    maps.map(m => m.rounds.map(r => `${r.roundNumber}:${r.winningTeamId ?? r.winner}`))

test('finishing from a checkpoint keeps the rounds played live and plays the rest on auto', () => {
    const matchId = load()
    const { ctx, state, checkpoint } = checkpointAfter(matchId, 6)
    const result = finishLiveMatchFromCheckpoint(useGameStore.getState(), checkpoint)
    // The six rounds on the checkpoint are the first six of the result.
    expect(winners(result.maps)[0].slice(0, 6)).toEqual(winners(state.maps)[0])
    // Same series as the live screen's "Skip match" from that state.
    const skipped = finishLegacySeriesFromState(ctx, state, { regroupRounds: 0, customTactics: useGameStore.getState().customTactics }).state
    expect(winners(result.maps)).toEqual(winners(skipped.maps))
    expect(result.homeScore).toBe(skipped.sim.homeSeriesScore)
    expect(result.awayScore).toBe(skipped.sim.awaySeriesScore)
    expect(result.management?.mode).toBe('live')
})

test('a checkpoint of another career or a changed roster is refused', () => {
    const matchId = load()
    const { checkpoint } = checkpointAfter(matchId, 2)
    expect(() => finishLiveMatchFromCheckpoint(useGameStore.getState(), { ...checkpoint, playback: { ...checkpoint.playback!, saveId: 'other-career' } })).toThrow(/another career/)
    expect(() => finishLiveMatchFromCheckpoint(useGameStore.getState(), { ...checkpoint, playback: { ...checkpoint.playback!, homeRoster: ['x', 'y', 'z', 'v', 'w'] } })).toThrow(/roster/)
})

test('control: instant simulation alone refuses a locked match (the softlock)', async () => {
    const matchId = load()
    useGameStore.setState({ activeMatchId: matchId } as never)
    await expect(useGameStore.getState().simulateInstantMatch(matchId)).resolves.toBe(false)
    expect(useGameStore.getState().activeMatchId).toBe(matchId)
})

test('locked before the first checkpoint (crash on the first render): simulated as a whole, lock released', async () => {
    const matchId = load()
    useGameStore.setState({ activeMatchId: matchId, activeMatchState: null } as never)
    await expect(resolveMatchWithoutLiveScreen(matchId)).resolves.toBe(true)
    const s = useGameStore.getState()
    expect(s.completedMatches.some(m => m.id === matchId)).toBe(true)
    expect(s.activeMatchId).toBeNull()
    expect(s.activeMatchState).toBeNull()
})

test('locked with a checkpoint: the recorded result keeps the rounds played live, lock released', async () => {
    const matchId = load()
    const { state, checkpoint } = checkpointAfter(matchId, 9)
    useGameStore.setState({ activeMatchId: matchId, activeMatchState: checkpoint } as never)
    await expect(resolveMatchWithoutLiveScreen(matchId)).resolves.toBe(true)
    const s = useGameStore.getState()
    const recorded = s.completedMatches.find(m => m.id === matchId)
    expect(recorded).toBeDefined()
    expect(s.activeMatchId).toBeNull()
    expect(s.activeMatchState).toBeNull()
    const maps = (recorded!.result ?? recorded) as unknown as { maps: { rounds: { roundNumber: number; winningTeamId?: string; winner?: string }[] }[] }
    expect(winners(maps.maps)[0].slice(0, 9)).toEqual(winners(state.maps)[0])
})

test('a checkpoint that cannot be restored falls back to simulating the whole match', async () => {
    const matchId = load()
    const { checkpoint } = checkpointAfter(matchId, 3)
    const broken = { ...checkpoint, playback: { ...checkpoint.playback!, seed: -5 } } as ActiveMatchState
    useGameStore.setState({ activeMatchId: matchId, activeMatchState: broken } as never)
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(resolveMatchWithoutLiveScreen(matchId)).resolves.toBe(true)
    const s = useGameStore.getState()
    expect(s.completedMatches.some(m => m.id === matchId)).toBe(true)
    expect(s.activeMatchId).toBeNull()
})

test('an already recorded match only drops a stale lock', async () => {
    const matchId = load()
    await useGameStore.getState().simulateInstantMatch(matchId)
    useGameStore.setState({ activeMatchId: matchId } as never)
    await expect(resolveMatchWithoutLiveScreen(matchId)).resolves.toBe(true)
    expect(useGameStore.getState().activeMatchId).toBeNull()
})
