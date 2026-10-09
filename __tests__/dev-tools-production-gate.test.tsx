/**
 * Regression (revamp audit 2026-10-09, §6): /map-editor and /map-editor/lab
 * shipped in production builds, and DevTools subscribed to the whole store
 * in production before returning null.
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

jest.mock('@/lib/runtime-flags', () => ({ isDevToolsEnabled: () => false, isProductionBuild: () => true, DEV_TOOLS_ENABLED: false, PRODUCTION_BUILD: true }))
jest.mock('@/store/game-store', () => ({ useGameStore: jest.fn(() => { throw new Error('DevTools subscribed to the store') }) }))
jest.mock('next/navigation', () => ({
    notFound: jest.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
    useRouter: () => ({ push: jest.fn() }),
}))

import MapEditorLayout from '@/app/map-editor/layout'
import { DevTools } from '@/components/debug/DevTools'
import { useGameStore } from '@/store/game-store'

test('Map Studio routes are not found when dev tools are disabled', () => {
    expect(() => MapEditorLayout({ children: <div /> })).toThrow('NEXT_NOT_FOUND')
})

test('DevTools renders nothing and never subscribes to the store when disabled', () => {
    expect(renderToStaticMarkup(<DevTools />)).toBe('')
    expect(useGameStore).not.toHaveBeenCalled()
})
