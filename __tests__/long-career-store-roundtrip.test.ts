/**
 * Save → load must not change a career. The long-career campaign found two
 * load-time rewrites that made a reloaded career diverge from the
 * uninterrupted one: FPL titles/prizes re-added from history on every load,
 * and roles/field defaults applied only on load (never after the weekly tick).
 */
import { useGameStore } from '@/store/game-store'
import { saveManager } from '@/engine'
import { weekProcessorBridge } from '@/engine/worker/week-processor-bridge'
import { debouncedStorage } from '@/engine/storage-adapter'
import { createLaunchFixture } from '@/scripts/launch/fixtures'
import { reconcileAllRoles } from '@/engine/role-reconciler'
import type { ComputedWeek } from '@/engine/worker/compute-week'
import type { GameSave } from '@/engine/save-types'

jest.mock('@/engine/worker/week-processor-bridge', () => ({ weekProcessorBridge: { processWeek: jest.fn() } }))
jest.mock('@/engine/manager-career-profile', () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined) }))

const initial = useGameStore.getState()
afterEach(async () => { jest.restoreAllMocks(); await debouncedStorage.flush() })

function fixture(): GameSave {
    const save = createLaunchFixture('first-week') as unknown as GameSave
    save.scheduledMatches = []
    return save
}

test('reloading a save does not re-award past FPL championships or prize money', async () => {
    const save = fixture()
    const champion = save.players[0].id
    save.fplData = {
        playerStats: { [champion]: { playerId: champion, fplChampionships: 1, totalFPLEarnings: 5000 } },
        seasonHistory: [{ id: 's1', seasonNumber: 1, startWeek: 1, endWeek: 52, isActive: false, prizePool: 5000, champion,
            leaderboard: [{ playerId: champion, points: 10, matchesPlayed: 4, winRate: 1 }], rewards: [{ placement: 1, prize: 5000, xpBonus: 0, prestigeBonus: 0 }] }],
    } as never
    jest.spyOn(saveManager, 'loadGame').mockResolvedValue({ save: structuredClone(save) })
    await useGameStore.getState().loadGame(save.saveId)
    await useGameStore.getState().loadGame(save.saveId)
    const stats = useGameStore.getState().fplData!.playerStats[champion] as unknown as { fplChampionships: number; totalFPLEarnings: number }
    expect(stats.fplChampionships).toBe(1)
    expect(stats.totalFPLEarnings).toBe(5000)
})

test('legacy FPL stats without the fields are still backfilled once from history', async () => {
    const save = fixture()
    const champion = save.players[0].id
    save.fplData = {
        playerStats: { [champion]: { playerId: champion } },
        seasonHistory: [{ id: 's1', seasonNumber: 1, startWeek: 1, endWeek: 52, isActive: false, prizePool: 5000, champion,
            leaderboard: [{ playerId: champion, points: 10, matchesPlayed: 4, winRate: 1 }], rewards: [{ placement: 1, prize: 5000, xpBonus: 0, prestigeBonus: 0 }] }],
    } as never
    jest.spyOn(saveManager, 'loadGame').mockResolvedValue({ save: structuredClone(save) })
    await useGameStore.getState().loadGame(save.saveId)
    const stats = useGameStore.getState().fplData!.playerStats[champion] as unknown as { fplChampionships: number; totalFPLEarnings: number }
    expect(stats.fplChampionships).toBe(1)
    expect(stats.totalFPLEarnings).toBe(5000)
})

test('the weekly commit applies the same role reconciliation and field defaults as loadGame', async () => {
    await Promise.resolve()
    const save = fixture()
    useGameStore.setState({ ...initial, ...structuredClone(save), fplData: undefined, isLoading: false, isInitialized: true, _completedMatchIds: new Set() } as never)
    jest.spyOn(saveManager, 'saveGame').mockResolvedValue({ success: true })
    jest.mocked(weekProcessorBridge.processWeek).mockReset().mockImplementation(async input => {
        const processed = structuredClone(input)
        processed.currentWeek++
        // An AI transfer this tick leaves two IGLs on one roster, and a regen without defaults.
        const ai = processed.teams[1]
        for (const id of ai.rosterIds.slice(0, 2)) (processed.players.find(p => p.id === id) as { role: string }).role = 'IGL'
        const regen = { ...structuredClone(processed.players[0]), id: 'regen_1' } as Record<string, unknown>
        delete regen.perks; delete regen.roleMastery; delete regen.availableSkillPoints
        processed.players.push(regen as never)
        return { save: processed, rngState: 7, result: { success: true } as ComputedWeek['result'] }
    })
    await useGameStore.getState().advanceWeek()
    const committed = structuredClone(useGameStore.getState().players)
    const reloaded = structuredClone(committed)
    reconcileAllRoles(useGameStore.getState().teams, reloaded)
    expect(reloaded.map(p => p.role)).toEqual(committed.map(p => p.role))
    const regen = committed.find(p => p.id === 'regen_1')!
    expect(regen.perks).toEqual([])
    expect(regen.availableSkillPoints).toBe(2)
    expect(regen.roleMastery).toBeDefined()
})
