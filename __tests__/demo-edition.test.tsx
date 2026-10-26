/**
 * Free Steam demo (lib/edition.ts, electron/edition.cjs): the career stops
 * after DEMO_LAST_WEEK, Steam runs as the demo's own app, and the build and
 * upload scripts refuse the full game's IDs.
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// The edition is fixed at build time; this file runs as a demo build.
process.env.NEXT_PUBLIC_ESM_EDITION = 'demo'

jest.mock('@/engine/worker/week-processor-bridge', () => ({ weekProcessorBridge: { processWeek: jest.fn() } }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }), usePathname: () => '/', useParams: () => ({}) }))

/* eslint-disable @typescript-eslint/no-require-imports */
const { DEMO_LAST_WEEK, IS_DEMO, demoWeekCapReached, demoWeeksLeft } = require('@/lib/edition')
const { useGameStore } = require('@/store/game-store')
const { weekProcessorBridge } = require('@/engine/worker/week-processor-bridge')
const { debouncedStorage } = require('@/engine/storage-adapter')
const { TopBar } = require('@/components/layout/TopBar')
const { DemoEnd } = require('@/components/demo/DemoEnd')
const { editionOf, parseDemoAppId } = require('../electron/edition.cjs')
const { resolveAppId } = require('../electron/steam-app-id.cjs')
const { demoAppIdFrom } = require('../scripts/dist-demo.cjs')
const { demoVdfs } = require('../scripts/upload-steam-demo.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

const initial = { ...useGameStore.getState() }
afterEach(async () => { jest.restoreAllMocks(); await debouncedStorage.flush() })

function career(currentWeek: number, extra: Record<string, unknown> = {}) {
    useGameStore.setState({ ...initial, saveId: 'demo-save', playerTeamId: 'team-1', timeMode: 'WEEKLY', currentWeek, currentDay: 6, isLoading: false, addToast: jest.fn(), ...extra } as never)
}

test('the demo cap starts once the last demo week has been processed', () => {
    expect(IS_DEMO).toBe(true)
    expect(DEMO_LAST_WEEK).toBe(12)
    expect(demoWeekCapReached({ saveId: 's', currentWeek: 12 })).toBe(false)
    expect(demoWeekCapReached({ saveId: 's', currentWeek: 13 })).toBe(true)
    expect(demoWeekCapReached({ saveId: 's', currentWeek: 13 }, false)).toBe(false)
    expect(demoWeekCapReached({ saveId: null, currentWeek: 40 })).toBe(false)
    // Draft Cup runs end on their own and are not capped.
    expect(demoWeekCapReached({ saveId: 's', currentWeek: 40, draftCup: { teamId: 't' } })).toBe(false)
    expect(demoWeeksLeft(1)).toBe(12)
    expect(demoWeeksLeft(12)).toBe(1)
    expect(demoWeeksLeft(13)).toBe(0)
})

test('a demo career past its last week cannot advance', async () => {
    jest.mocked(weekProcessorBridge.processWeek).mockReset()
    career(DEMO_LAST_WEEK + 1)
    await useGameStore.getState().advanceWeek()
    await useGameStore.getState().advanceDay()
    await useGameStore.getState().continueToNextDecision()
    career(DEMO_LAST_WEEK + 1, { timeMode: 'HYBRID_DAILY', currentDay: 2 })
    await useGameStore.getState().advanceDay()
    await useGameStore.getState().advanceToWeekEnd()
    const state = useGameStore.getState()
    expect(weekProcessorBridge.processWeek).not.toHaveBeenCalled()
    expect(state.currentWeek).toBe(DEMO_LAST_WEEK + 1)
    expect(state.currentDay).toBe(2)
    expect(state.isLoading).toBe(false)
    expect(state.continueRun).toBeNull()
})

test('the TopBar advance control is disabled at the end of the demo', () => {
    career(DEMO_LAST_WEEK + 1)
    Object.assign(useGameStore.getInitialState(), useGameStore.getState())
    const html = renderToStaticMarkup(<TopBar />)
    const continueButton = html.match(/<button[^>]*>(?:(?!<\/button>).)*CONTINUE(?:(?!<\/button>).)*<\/button>/)?.[0]
    expect(continueButton).toMatch(/disabled=""/)
})

test('the end screen points to the full game store page and the next week', () => {
    career(DEMO_LAST_WEEK + 1, { teams: [{ id: 'team-1', name: 'Demo Club', trophies: [] }], completedMatches: [] })
    Object.assign(useGameStore.getInitialState(), useGameStore.getState())
    const html = renderToStaticMarkup(<DemoEnd />)
    expect(html).toContain('https://store.steampowered.com/app/4326170/')
    expect(html).toContain(`week ${DEMO_LAST_WEEK + 1}`)
    expect(html).toContain('Demo Club')
})

test('the demo package runs Steam as its own app, never as the full game', () => {
    expect(editionOf({})).toEqual({ edition: 'full', demoAppId: null })
    expect(editionOf({ esmEdition: 'demo', esmDemoAppId: '4500000' })).toEqual({ edition: 'demo', demoAppId: 4500000 })
    expect(editionOf({ esmEdition: 'demo', esmDemoAppId: '4326170' })).toEqual({ edition: 'demo', demoAppId: null })
    expect(editionOf({ esmDemoAppId: '4500000' })).toEqual({ edition: 'full', demoAppId: null })
    for (const bad of ['480', '0', '', 'abc', '45junk', -1, 1.5]) expect(parseDemoAppId(bad)).toBeNull()

    expect(resolveAppId({}, 'demo', 4500000)).toBe(4500000)
    expect(resolveAppId({ SteamAppId: '4500000' }, 'demo', 4500000)).toBe(4500000)
    expect(resolveAppId({ SteamAppId: '4326170' }, 'demo', 4500000)).toBeNull()
    expect(resolveAppId({}, 'demo', null)).toBeNull()
    expect(resolveAppId({}, 'full', 4500000)).toBe(4326170)
})

test('the demo build and upload scripts take only a demo App ID and depot', () => {
    expect(demoAppIdFrom(['--app-id', '4500000'], {})).toBe(4500000)
    expect(demoAppIdFrom([], { ESM_DEMO_APP_ID: '4500000' })).toBe(4500000)
    expect(demoAppIdFrom(['--app-id', '4326170'], {})).toBeNull()
    expect(demoAppIdFrom([], {})).toBeNull()

    const { app, depot } = demoVdfs(4500000, '4500001')
    expect(app).toContain('"appid" "4500000"')
    expect(app).toContain('dist-demo\\win-unpacked')
    expect(app).not.toContain('4326170')
    expect(depot).toContain('"DepotID" "4500001"')
    expect(depot).not.toContain('4326171')
    expect(depot).toContain('"FileExclusion" "steam_appid.txt"')
})
