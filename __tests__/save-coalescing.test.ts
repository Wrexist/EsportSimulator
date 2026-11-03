/**
 * HOME-08: fire-and-forget saves (each day step, a match, an answered
 * decision) queued one full save each and ran them inside the next week tick
 * before its own save (2–4 full saves per tick). A save request while another
 * save is queued and not started now joins it: that queued save snapshots the
 * freshest state when its turn comes, so nothing a caller changed is lost.
 */
import { createLaunchFixture } from "@/scripts/launch/fixtures"
import { useGameStore } from "@/store/game-store"
import { saveManager } from "@/engine"
import { SaveManager } from "@/engine/save-manager"
import { asyncStorage } from "@/engine/storage-adapter"

jest.mock("@/engine/worker/week-processor-bridge", () => ({ weekProcessorBridge: { processWeek: jest.fn() } }))
jest.mock("@/engine/manager-career-profile", () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined) }))

describe("store saveGame coalesces queued saves", () => {
    const initial = useGameStore.getState()
    beforeEach(() => {
        const save = createLaunchFixture("first-week")
        save.currentWeek = 5
        useGameStore.setState({ ...initial, ...JSON.parse(JSON.stringify(save)), isInitialized: true, isLoading: false, toasts: [], _completedMatchIds: new Set() })
    })
    afterEach(() => jest.restoreAllMocks())

    test("one running save + any number of requests = two writes, and the last state is on disk", async () => {
        const write = jest.spyOn(saveManager, "saveGame")
        const first = useGameStore.getState().saveGame() // starts on the next microtask
        useGameStore.setState({ currentWeek: 6 })
        const queued = [useGameStore.getState().saveGame(), useGameStore.getState().saveGame()]
        useGameStore.setState({ currentWeek: 7 })
        queued.push(useGameStore.getState().saveGame())
        await Promise.all([first, ...queued])
        // The first request had not started when the others arrived: all join one write.
        expect(write).toHaveBeenCalledTimes(1)
        expect(write.mock.calls[0][0].currentWeek).toBe(7)

        // A request while a save is running queues exactly one more.
        const running = useGameStore.getState().saveGame()
        await Promise.resolve(); await Promise.resolve()
        useGameStore.setState({ currentWeek: 8 })
        const later = [useGameStore.getState().saveGame(), useGameStore.getState().saveGame()]
        await Promise.all([running, ...later])
        expect(write.mock.calls.length).toBeLessThanOrEqual(3)
        expect(write.mock.calls[write.mock.calls.length - 1][0].currentWeek).toBe(8)
        const id = useGameStore.getState().saveId!
        expect((await new SaveManager(asyncStorage).loadGame(id)).save?.currentWeek).toBe(8)
    })

    test("a failed save rejects every caller that joined it, and the next save runs", async () => {
        jest.spyOn(saveManager, "saveGame").mockResolvedValueOnce({ success: false, error: "disk full" })
        const a = useGameStore.getState().saveGame()
        const b = useGameStore.getState().saveGame()
        await expect(a).rejects.toThrow(/disk full/)
        await expect(b).rejects.toThrow(/disk full/)
        await expect(useGameStore.getState().saveGame()).resolves.toBeUndefined()
    })
})
