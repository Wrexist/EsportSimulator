import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PlayerPage from '@/app/player/[id]/page'

let mockState = { players: [] as Array<{id: string}>, _hasHydrated: false, isLoading: false }
const mockNotFound = jest.fn(() => { throw new Error('PROFILE_NOT_FOUND') })
jest.mock('@/store/game-store', () => ({ useGameStore: (selector: (state: typeof mockState) => unknown) => selector(mockState) }))
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'stock-player' }),
  useRouter: () => ({ back: jest.fn() }),
  notFound: () => mockNotFound(),
}))
jest.mock('@/components/player/player-detail', () => ({ PlayerDetail: () => 'Loaded profile' }))

beforeEach(() => { mockNotFound.mockClear() })

test('a direct profile URL waits for the career after settings hydration', () => {
  mockState = { players: [], _hasHydrated: true, isLoading: true }
  expect(renderToStaticMarkup(React.createElement(PlayerPage))).toContain('Loading player profile')
  expect(mockNotFound).not.toHaveBeenCalled()
  mockState = { players: [{id:'stock-player'}], _hasHydrated: true, isLoading: false }
  expect(renderToStaticMarkup(React.createElement(PlayerPage))).toContain('Loaded profile')
})

test('a genuinely absent player still returns not-found after loading', () => {
  mockState = { players: [], _hasHydrated: true, isLoading: false }
  expect(() => renderToStaticMarkup(React.createElement(PlayerPage))).toThrow('PROFILE_NOT_FOUND')
})

test('an open player stays visible during a background simulation', () => {
  mockState = { players: [{id:'stock-player'}], _hasHydrated: true, isLoading: true }
  expect(renderToStaticMarkup(React.createElement(PlayerPage))).toContain('Loaded profile')
})
