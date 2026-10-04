/**
 * Regression: L27 long career, week 168. A player's contract expired in the
 * week tick, leaving the manager with four players and a Grand Final due.
 * The TopBar still offered "Play match"; the tactics screen's quick sim was
 * refused by the store (fewer than five players) but navigated to the result
 * page anyway, which showed "MATCH NOT FOUND".
 *
 * The fix: one shared playability predicate (lib/playable-match.ts) for the
 * TopBar offer and the advance-week guard, and simulateInstantMatch reports
 * whether a result was recorded so callers only open the result screen when
 * there is one. The week still advances and resolves the fixture by forfeit.
 *
 * Also covers the same packaged run's game-over screen, where CONTINUE stayed
 * enabled behind "ORGANIZATION DISSOLVED".
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useGameStore } from '@/store/game-store'
import { saveManager } from '@/engine'
import { weekProcessorBridge } from '@/engine/worker/week-processor-bridge'
import { debouncedStorage } from '@/engine/storage-adapter'
import { createLaunchFixture } from '@/scripts/launch/fixtures'
import { TopBar } from '@/components/layout/TopBar'
import type { ComputedWeek } from '@/engine/worker/compute-week'
import type { GameSave } from '@/engine/save-types'

jest.mock('@/engine/worker/week-processor-bridge', () => ({ weekProcessorBridge: { processWeek: jest.fn() } }))
jest.mock('@/engine/manager-career-profile', () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }), usePathname: () => '/', useParams: () => ({}) }))

const initial = { ...useGameStore.getState() }
afterEach(async () => { jest.restoreAllMocks(); await debouncedStorage.flush() })

/** Week-168 shape: Grand Final (BO5, veto not done) due this week. */
function load(opts: { managerPlayers: number }) {
    const save = createLaunchFixture('first-week') as unknown as GameSave
    save.timeMode = 'WEEKLY'
    save.currentDay = 6
    const match = save.scheduledMatches[0]
    Object.assign(match, { format: 'BO5', stage: 'Grand Final', maps: undefined, vetoComplete: undefined })
    const team = save.teams.find(t => t.id === save.playerTeamId)!
    team.rosterIds = team.rosterIds.slice(0, opts.managerPlayers)
    useGameStore.setState({ ...initial, ...structuredClone(save), fplData: undefined, isLoading: false, isInitialized: true, _completedMatchIds: new Set(), addToast: jest.fn() } as never)
    return { save, matchId: match.id }
}

// Server rendering reads zustand's initial-state snapshot (no DOM in this
// jest environment); copy the loaded career into it so the TopBar renders it.
const topBarHtml = () => {
    Object.assign(useGameStore.getInitialState(), useGameStore.getState())
    return renderToStaticMarkup(<TopBar />)
}

test('control: a playable fixture is offered and quick sim records a result the result page can find', async () => {
    const { matchId } = load({ managerPlayers: 5 })
    expect(topBarHtml()).toContain('Play match')
    await expect(useGameStore.getState().simulateInstantMatch(matchId)).resolves.toBe(true)
    expect(useGameStore.getState().completedMatches.some(m => m.id === matchId)).toBe(true)
})

test('a fixture the manager cannot field five for is never offered as "Play match"', () => {
    load({ managerPlayers: 4 })
    const html = topBarHtml()
    expect(html).not.toContain('Play match')
    expect(html).toContain('CONTINUE')
})

test('quick sim of an unplayable fixture reports failure and explains, so no "Match Not Found" navigation', async () => {
    const { matchId } = load({ managerPlayers: 4 })
    const recorded = await useGameStore.getState().simulateInstantMatch(matchId)
    expect(recorded).toBe(false)
    expect(useGameStore.getState().completedMatches.some(m => m.id === matchId)).toBe(false)
    expect(useGameStore.getState().scheduledMatches.some(m => m.id === matchId)).toBe(true)
    expect(useGameStore.getState().addToast).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('5 active players') }))
})

test('a dissolved career (game over) cannot be advanced from the TopBar or the daily controls', async () => {
    const { save } = load({ managerPlayers: 4 })
    useGameStore.setState({ gameOverReason: 'BANKRUPTCY', gameOverWeek: save.currentWeek } as never)
    const html = topBarHtml()
    const continueButton = html.match(/<button[^>]*>(?:(?!<\/button>).)*CONTINUE(?:(?!<\/button>).)*<\/button>/)?.[0]
    expect(continueButton).toMatch(/disabled=""/)
    jest.mocked(weekProcessorBridge.processWeek).mockReset()
    useGameStore.setState({ timeMode: 'HYBRID_DAILY', currentDay: 2 } as never)
    await useGameStore.getState().advanceDay()
    await useGameStore.getState().advanceToWeekEnd()
    expect(useGameStore.getState().currentDay).toBe(2)
    expect(useGameStore.getState().currentWeek).toBe(save.currentWeek)
    expect(weekProcessorBridge.processWeek).not.toHaveBeenCalled()
})

test('the week still advances past the unplayable fixture (no softlock)', async () => {
    const { save } = load({ managerPlayers: 4 })
    jest.spyOn(saveManager, 'saveGame').mockResolvedValue({ success: true })
    jest.mocked(weekProcessorBridge.processWeek).mockReset().mockImplementation(async input => {
        const processed = structuredClone(input)
        processed.scheduledMatches = []
        processed.currentWeek++
        return { save: processed, rngState: 3, result: { success: true } as ComputedWeek['result'] }
    })
    await useGameStore.getState().advanceWeek()
    expect(useGameStore.getState().currentWeek).toBe(save.currentWeek + 1)
})
