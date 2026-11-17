/**
 * Save → load must not change a career. The long-career campaign found
 * load-time rewrites that made a reloaded career diverge from the
 * uninterrupted one: roles/field defaults applied only on load (never after
 * the weekly tick), synergy built before the roles were reconciled (ENGINE-01). (FPL, whose titles were re-added on every load, was cut.)
 */
import { useGameStore } from '@/store/game-store'
import { saveManager } from '@/engine'
import { weekProcessorBridge } from '@/engine/worker/week-processor-bridge'
import { debouncedStorage } from '@/engine/storage-adapter'
import { createLaunchFixture } from '@/scripts/launch/fixtures'
import { reconcileAllRoles } from '@/engine/role-reconciler'
import { recalculateAllSynergy } from '@/engine/processors/team-synergy-recalc'
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

test('the weekly commit applies the same role reconciliation and field defaults as loadGame', async () => {
    await Promise.resolve()
    const save = fixture()
    useGameStore.setState({ ...initial, ...structuredClone(save), league: undefined, isLoading: false, isInitialized: true, _completedMatchIds: new Set() } as never)
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

test('a fixture against an opponent who cannot field five does not block the week (it is forfeited in the tick)', async () => {
    const save = createLaunchFixture('first-week') as unknown as GameSave
    save.timeMode = 'WEEKLY'
    const match = save.scheduledMatches[0]
    const opponentId = match.awayTeamId
    useGameStore.setState({ ...initial, ...structuredClone(save), league: undefined, isLoading: false, isInitialized: true, _completedMatchIds: new Set() } as never)
    jest.spyOn(saveManager, 'saveGame').mockResolvedValue({ success: true })
    jest.mocked(weekProcessorBridge.processWeek).mockReset().mockImplementation(async input => {
        const processed = structuredClone(input)
        processed.scheduledMatches = []
        processed.currentWeek++
        return { save: processed, rngState: 9, result: { success: true } as ComputedWeek['result'] }
    })
    // Playable fixture: the guard holds the week.
    await useGameStore.getState().advanceWeek()
    expect(useGameStore.getState().currentWeek).toBe(save.currentWeek)
    // Opponent drops to four: the manager cannot play it, so the week must advance.
    useGameStore.setState(s => { s.teams.find(t => t.id === opponentId)!.rosterIds.pop() })
    await useGameStore.getState().advanceWeek()
    expect(useGameStore.getState().currentWeek).toBe(save.currentWeek + 1)
})

test('ENGINE-01: the weekly commit builds synergy from the reconciled roles, as loadGame does', async () => {
    await Promise.resolve()
    const save = fixture()
    useGameStore.setState({ ...initial, ...structuredClone(save), league: undefined, isLoading: false, isInitialized: true, _completedMatchIds: new Set() } as never)
    jest.spyOn(saveManager, 'saveGame').mockResolvedValue({ success: true })
    jest.mocked(weekProcessorBridge.processWeek).mockReset().mockImplementation(async input => {
        const processed = structuredClone(input)
        processed.currentWeek++
        // An AI transfer this tick leaves one roster with no IGL or entry
        // fragger while two players qualify: the reconcile hands those roles
        // out, and IGL + entry is a complementary pair (+8 synergy).
        const roster = processed.teams[1].rosterIds.map(id => processed.players.find(p => p.id === id)!)
        for (const p of roster) (p as { role: string }).role = 'RIFLER'
        Object.assign(roster[0], { leader: 99, tactic: 99 })
        Object.assign(roster[1], { reaction: 99, rifle: 99 })
        return { save: processed, rngState: 7, result: { success: true } as ComputedWeek['result'] }
    })
    await useGameStore.getState().advanceWeek()
    const state = useGameStore.getState()
    const reloadedTeams = structuredClone(state.teams)
    const reloadedPlayers = structuredClone(state.players)
    reconcileAllRoles(reloadedTeams, reloadedPlayers)
    recalculateAllSynergy(reloadedTeams, reloadedPlayers)
    const [igl, entry] = state.teams[1].rosterIds.map(id => state.players.find(p => p.id === id)!)
    expect([igl.role, entry.role]).toEqual(['IGL', 'ENTRY_FRAGGER'])
    expect(state.teams.map(t => t.synergyMatrix)).toEqual(reloadedTeams.map(t => t.synergyMatrix))
})
