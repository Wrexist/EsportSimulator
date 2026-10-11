/**
 * Regression (revamp audit 2026-10-09, §6 P1): with no career loaded, the
 * top-bar Next day / CONTINUE stayed enabled. Weekly mode then called
 * advanceWeek, which built a snapshot for team "unknown" under a recovery
 * saveId and logged "Invalid save: playerTeamId 'unknown'".
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useGameStore } from '@/store/game-store'
import { weekProcessorBridge } from '@/engine/worker/week-processor-bridge'
import { debouncedStorage } from '@/engine/storage-adapter'
import { TopBar } from '@/components/layout/TopBar'

jest.mock('@/engine/worker/week-processor-bridge', () => ({ weekProcessorBridge: { processWeek: jest.fn() } }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }), usePathname: () => '/', useParams: () => ({}) }))

const initial = { ...useGameStore.getState() }
afterEach(async () => { jest.restoreAllMocks(); await debouncedStorage.flush() })

function noCareer(timeMode: 'WEEKLY' | 'HYBRID_DAILY') {
    useGameStore.setState({ ...initial, saveId: null, playerTeamId: null, timeMode, currentDay: 2, isLoading: false, addToast: jest.fn() } as never)
}

test('advance actions are no-ops without a loaded career (no phantom save)', async () => {
    jest.mocked(weekProcessorBridge.processWeek).mockReset()
    noCareer('WEEKLY')
    const week = useGameStore.getState().currentWeek
    await useGameStore.getState().advanceWeek()
    await useGameStore.getState().advanceDay()
    noCareer('HYBRID_DAILY')
    await useGameStore.getState().advanceDay()
    await useGameStore.getState().advanceToWeekEnd()
    const state = useGameStore.getState()
    expect(weekProcessorBridge.processWeek).not.toHaveBeenCalled()
    expect(state.saveId).toBeNull()
    expect(state.currentWeek).toBe(week)
    expect(state.currentDay).toBe(2)
    expect(state.isLoading).toBe(false)
})

test('the TopBar advance control is disabled without a loaded career', () => {
    noCareer('WEEKLY')
    Object.assign(useGameStore.getInitialState(), useGameStore.getState())
    const html = renderToStaticMarkup(<TopBar />)
    const continueButton = html.match(/<button[^>]*>(?:(?!<\/button>).)*CONTINUE(?:(?!<\/button>).)*<\/button>/)?.[0]
    expect(continueButton).toMatch(/disabled=""/)
})
