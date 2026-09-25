import { useGameStore, waitForPendingGameSave } from "@/store/game-store"
import { saveManager } from "@/engine"
import { weekProcessorBridge } from "@/engine/worker/week-processor-bridge"
import type { GameSave } from "@/engine/save-types"
import type { ComputedWeek } from "@/engine/worker/compute-week"
import { debouncedStorage } from "@/engine/storage-adapter"

jest.mock("@/engine/worker/week-processor-bridge", () => ({ weekProcessorBridge: { processWeek: jest.fn() } }))
jest.mock("@/engine/manager-career-profile", () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined) }))

describe("store week commit boundary", () => {
  const initial = useGameStore.getState()
  beforeEach(async () => {
    // Allow the async bootstrap to finish before installing the test career.
    await Promise.resolve()
    const save = saveManager.createSave("Commit test", { teams: [], players: [], contracts: [], staff: [], playerTeamId: "player", lastRngSeed: 42 })
    useGameStore.setState({ ...initial, ...save, isLoading: false, isInitialized: true, nextMarketRefreshWeek: 99 })
    jest.mocked(weekProcessorBridge.processWeek).mockReset().mockImplementation(async input => {
      const processed = structuredClone(input)
      processed.currentWeek++
      processed.lastCommittedWeekTick = processed.currentWeek
      return { save: processed, rngState: 123, result: { success: true } as ComputedWeek["result"] }
    })
  })
  afterEach(async () => { jest.restoreAllMocks(); await debouncedStorage.flush() })

  test("loading an older career cannot inherit another career's commit marker", async () => {
    useGameStore.setState({ lastCommittedWeekTick: 52, watchlistedPlayerIds: ['other-career'], activeMatchId: 'other-match', pendingSeasonRecap: 5, gameOverReason: 'SACKED' })
    const oldSave = saveManager.createSave("Older career", { teams: [], players: [], contracts: [], staff: [], playerTeamId: "player" })
    jest.spyOn(saveManager, "loadGame").mockResolvedValue({ save: oldSave })
    await useGameStore.getState().loadGame(oldSave.saveId)
    expect(useGameStore.getState().lastCommittedWeekTick).toBeUndefined()
    expect(useGameStore.getState().watchlistedPlayerIds).toEqual([])
    expect(useGameStore.getState().activeMatchId).toBeNull()
    expect(useGameStore.getState().pendingSeasonRecap).toBeNull()
    expect(useGameStore.getState().gameOverReason).toBeUndefined()
    const write = jest.spyOn(saveManager, "saveGame").mockResolvedValue({ success: true })
    await useGameStore.getState().saveGame()
    expect(write.mock.calls[0][0].lastCommittedWeekTick).toBeUndefined()
  })

  test("saves the post-processed state once and stays locked until the durable write resolves", async () => {
    const academy = jest.fn(() => { useGameStore.setState({ academyPendingProspects: ["post-week-prospect"] }) })
    useGameStore.setState({ processAcademyWeek: academy })
    let finishSave!: (result: { success: boolean }) => void
    let savedSnapshot!: GameSave
    let saveStarted!: () => void
    const started = new Promise<void>(resolve => { saveStarted = resolve })
    const saveSpy = jest.spyOn(saveManager, "saveGame").mockImplementation(async snapshot => {
      savedSnapshot = structuredClone(snapshot)
      saveStarted()
      return new Promise(resolve => { finishSave = resolve })
    })

    const advancing = useGameStore.getState().advanceWeek()
    await started
    expect(useGameStore.getState().isLoading).toBe(true)
    expect(savedSnapshot.academyPendingProspects).toEqual(["post-week-prospect"])
    expect(savedSnapshot.lastCommittedWeekTick).toBe(savedSnapshot.currentWeek)
    expect(savedSnapshot.lastRngSeed).toBe(123)
    await useGameStore.getState().advanceWeek()
    await useGameStore.getState().advanceDay()
    await useGameStore.getState().advanceToWeekEnd()
    expect(weekProcessorBridge.processWeek).toHaveBeenCalledTimes(1)
    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect(academy).toHaveBeenCalledTimes(1)
    finishSave({ success: true })
    await advancing
    expect(useGameStore.getState().isLoading).toBe(false)
  })

  test("a completed worker from the previous career cannot replace the newly loaded career", async () => {
    let finish!: (result: ComputedWeek) => void
    let input!: GameSave
    let started!: () => void
    const ready = new Promise<void>(resolve => { started = resolve })
    jest.mocked(weekProcessorBridge.processWeek).mockImplementation(async save => {
      input = structuredClone(save); started()
      return new Promise(resolve => { finish = resolve })
    })
    const advancing = useGameStore.getState().advanceWeek()
    await ready
    const replacement = saveManager.createSave('Other career', { teams: [], players: [], contracts: [], staff: [], playerTeamId: 'other', currentWeek: 25 })
    jest.spyOn(saveManager, 'loadGame').mockResolvedValue({ save: replacement })
    await useGameStore.getState().loadGame(replacement.saveId)
    finish({ save: { ...input, currentWeek: input.currentWeek + 1 }, result: { success: true } as ComputedWeek['result'], rngState: 123 })
    await advancing
    expect(useGameStore.getState().saveId).toBe(replacement.saveId)
    expect(useGameStore.getState().currentWeek).toBe(25)
  })

  test("a failed durable write retains the advanced week and manual retry does not simulate again", async () => {
    const initialWeek = useGameStore.getState().currentWeek
    const saveSpy = jest.spyOn(saveManager, "saveGame")
      .mockResolvedValueOnce({ success: false, error: "Disk full" })
      .mockResolvedValue({ success: true })
    await useGameStore.getState().advanceWeek()
    expect(useGameStore.getState().currentWeek).toBe(initialWeek + 1)
    expect(useGameStore.getState().isLoading).toBe(false)
    expect(useGameStore.getState().toasts.some(toast => toast.message.includes("Save failed: Disk full"))).toBe(true)
    await useGameStore.getState().saveGame()
    expect(saveSpy).toHaveBeenCalledTimes(2)
    expect(weekProcessorBridge.processWeek).toHaveBeenCalledTimes(1)
    expect(saveSpy.mock.calls[1][0].lastCommittedWeekTick).toBe(initialWeek + 1)
  })

  test("desktop close can wait for an already running manual save", async () => {
    let resolve!: (value: { success: boolean }) => void
    jest.spyOn(saveManager, 'saveGame').mockImplementation(() => new Promise(done => { resolve = done }))
    const saving = useGameStore.getState().saveGame()
    let waited = false
    const waiting = waitForPendingGameSave().then(() => { waited = true })
    await Promise.resolve(); await Promise.resolve()
    expect(waited).toBe(false)
    resolve({ success: true })
    await saving; await waiting
    expect(waited).toBe(true)
  })

  test("a failed delete keeps the active career and reports failure", async () => {
    const saveId = useGameStore.getState().saveId
    jest.spyOn(saveManager, 'deleteAllSaves').mockResolvedValue({ success: false })
    await expect(useGameStore.getState().deleteAllSaves()).rejects.toThrow('could not be deleted')
    expect(useGameStore.getState().saveId).toBe(saveId)
    expect(useGameStore.getState().isLoading).toBe(false)
  })
})
