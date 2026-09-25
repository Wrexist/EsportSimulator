import { useGameStore } from '@/store/game-store'
import { saveManager } from '@/engine'
import { createLaunchFixture } from '@/scripts/launch/fixtures'
import { buildSaveSnapshot } from '@/store/utils/build-save-snapshot'
import { canonicalWeekState } from '@/engine/worker/week-replay'
import { debouncedStorage } from '@/engine/storage-adapter'

jest.mock('@/engine/worker/week-processor-bridge', () => {
    const { WeekProcessorBridge } = require('@/engine/worker/week-processor-client')
    return { weekProcessorBridge: new WeekProcessorBridge(() => { throw new Error('No browser worker in Node fixture') }) }
})
jest.mock('@/engine/manager-career-profile', () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined) }))

test.each([0, 3402])('full application coordinator replays seed %s after a JSON reload', async seed => {
    await Promise.resolve()
    const initial = useGameStore.getState()
    const fixture = createLaunchFixture('strong-club')
    fixture.scheduledMatches = []
    fixture.lastRngSeed = seed
    const run = async () => {
        useGameStore.setState({ ...initial, ...JSON.parse(JSON.stringify(fixture)), isInitialized: true, isLoading: false, _completedMatchIds: new Set() })
        await useGameStore.getState().advanceWeek()
        expect(useGameStore.getState().currentWeek).toBe(fixture.currentWeek + 1)
        expect(useGameStore.getState().isLoading).toBe(false)
        return canonicalWeekState(buildSaveSnapshot(useGameStore.getState()))
    }
    const write = jest.spyOn(saveManager, 'saveGame')
    const cosmeticRandom = jest.spyOn(Math, 'random').mockReturnValue(0.1)
    try {
        const first = await run()
        cosmeticRandom.mockReturnValue(0.9)
        const second = await run()
        expect(first).toBe(second)
        expect(write).toHaveBeenCalledTimes(2)
    } finally { jest.restoreAllMocks(); await debouncedStorage.flush() }
})
