/**
 * L27.A2: the week overlay shows the stage advanceWeek is really in, and the
 * coordinator hands its private snapshot to the bridge (no second clone) and
 * commits the worker result without Immer (values identical, state unfrozen).
 */
import { useGameStore, waitForPendingGameSave } from "@/store/game-store"
import { saveManager } from "@/engine"
import { weekProcessorBridge } from "@/engine/worker/week-processor-bridge"
import type { ComputedWeek } from "@/engine/worker/compute-week"
import { debouncedStorage } from "@/engine/storage-adapter"

jest.mock("@/engine/worker/week-processor-bridge", () => ({ weekProcessorBridge: { processWeek: jest.fn() } }))
jest.mock("@/engine/manager-career-profile", () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined) }))

describe("week advance progress", () => {
    const initial = useGameStore.getState()
    beforeEach(async () => {
        await Promise.resolve()
        const save = saveManager.createSave("Progress test", { teams: [], players: [], contracts: [], staff: [], playerTeamId: "player", lastRngSeed: 42 })
        useGameStore.setState({ ...initial, ...save, isLoading: false, isInitialized: true, nextMarketRefreshWeek: 99 })
    })
    afterEach(async () => { jest.restoreAllMocks(); await debouncedStorage.flush() })

    test("reports preparing -> simulating -> applying -> saving, then clears", async () => {
        const seen: Array<string | null> = []
        const unsubscribe = useGameStore.subscribe(s => { if (seen[seen.length - 1] !== s.weekProgress) seen.push(s.weekProgress) })
        let options: unknown
        jest.mocked(weekProcessorBridge.processWeek).mockReset().mockImplementation(async (input, _config, _rng, opts) => {
            options = opts
            input.currentWeek++
            return { save: input, rngState: 7, result: { success: true } as ComputedWeek["result"] }
        })
        await useGameStore.getState().advanceWeek()
        await waitForPendingGameSave()
        unsubscribe()
        expect(seen).toEqual(["preparing", "simulating", "applying", "saving", null])
        expect(options).toEqual({ inputOwned: true })
        const state = useGameStore.getState()
        expect(state.currentWeek).toBe(2)
        expect(state.isLoading).toBe(false)
        expect(state.lastRngSeed).toBe(7)
    })

    test("a failed week clears the stage with the error", async () => {
        jest.mocked(weekProcessorBridge.processWeek).mockReset().mockRejectedValue(new Error("Worker terminated"))
        await useGameStore.getState().advanceWeek()
        expect(useGameStore.getState().weekProgress).toBeNull()
        expect(useGameStore.getState().isLoading).toBe(false)
        expect(useGameStore.getState().currentWeek).toBe(1)
    })
})
