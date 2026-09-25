import { createSessionPersistence } from "@/lib/session-persistence"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

describe("session autosave and close lifecycle", () => {
  let session: ReturnType<typeof createSessionPersistence>
  let settings: { autoSave: boolean; autoSaveInterval: number }
  let state: { saveId: string | null; isLoading: boolean; saveGame: jest.Mock<Promise<void>> }
  let confirm: jest.Mock<Promise<boolean>>
  let flush: jest.Mock<Promise<void>>
  beforeEach(() => {
    jest.useFakeTimers()
    settings = { autoSave: true, autoSaveInterval: 1 }
    state = { saveId: "career", isLoading: false, saveGame: jest.fn().mockResolvedValue(undefined) }
    confirm = jest.fn().mockResolvedValue(false)
    flush = jest.fn().mockResolvedValue(undefined)
    session = createSessionPersistence({ getState: () => state, getSettings: () => settings, flush, confirm, showSaving: jest.fn(), onError: jest.fn() })
  })
  afterEach(() => { session.dispose(); jest.useRealTimers() })

  test("runtime autosave settings control the existing timer", async () => {
    settings.autoSave = false
    await jest.advanceTimersByTimeAsync(120000)
    expect(state.saveGame).not.toHaveBeenCalled()
    settings.autoSave = true
    settings.autoSaveInterval = 2
    await jest.advanceTimersByTimeAsync(90000)
    expect(state.saveGame).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(30000)
    expect(state.saveGame).toHaveBeenCalledTimes(1)
  })

  test("canceling close during simulation preserves periodic autosave", async () => {
    state.isLoading = true
    await expect(session.requestClose()).resolves.toBe(false)
    expect(confirm).toHaveBeenCalledWith("simulationRunning")
    state.isLoading = false
    await jest.advanceTimersByTimeAsync(60000)
    expect(state.saveGame).toHaveBeenCalledTimes(1)
  })

  test("waiting at a failed-save dialog does not auto-confirm or run a competing save", async () => {
    const choice = deferred<boolean>()
    confirm.mockReturnValue(choice.promise)
    state.saveGame.mockRejectedValue(new Error("Disk full"))
    const close = session.requestClose()
    await jest.advanceTimersByTimeAsync(120000)
    expect(confirm).toHaveBeenCalledWith("saveFailed")
    expect(state.saveGame).toHaveBeenCalledTimes(3)
    choice.resolve(false)
    await expect(close).resolves.toBe(false)
    state.saveGame.mockResolvedValue(undefined)
    await jest.advanceTimersByTimeAsync(60000)
    expect(state.saveGame).toHaveBeenCalledTimes(4)
  })

  test("repeated close requests share the pending save and decision", async () => {
    const saving = deferred<void>()
    state.saveGame.mockReturnValue(saving.promise)
    const first = session.requestClose()
    const second = session.requestClose()
    expect(second).toBe(first)
    await jest.advanceTimersByTimeAsync(90000)
    expect(state.saveGame).toHaveBeenCalledTimes(1)
    saving.resolve()
    await expect(first).resolves.toBe(true)
  })

  test("save failures and flush errors require an explicit discard decision", async () => {
    flush.mockRejectedValue(new Error("Storage unavailable"))
    await expect(session.requestClose()).resolves.toBe(false)
    expect(confirm).toHaveBeenCalledWith("saveFailed")
    confirm.mockResolvedValue(true)
    await expect(session.requestClose()).resolves.toBe(true)
  })

  test("autosave waits while week processing is locked", async () => {
    state.isLoading = true
    await jest.advanceTimersByTimeAsync(120000)
    expect(state.saveGame).not.toHaveBeenCalled()
    state.isLoading = false
    await jest.advanceTimersByTimeAsync(30000)
    expect(state.saveGame).toHaveBeenCalledTimes(1)
  })

  test("a disposed lifecycle does not save after an in-flight flush", async () => {
    const flushing = deferred<void>()
    flush.mockReturnValue(flushing.promise)
    await jest.advanceTimersByTimeAsync(60000)
    session.dispose()
    flushing.resolve()
    await jest.advanceTimersByTimeAsync(120000)
    expect(state.saveGame).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  })

  test("a disabled autosave preference also skips close-save", async () => {
    settings.autoSave = false
    await expect(session.requestClose()).resolves.toBe(true)
    expect(state.saveGame).not.toHaveBeenCalled()
  })

  test("explicit close during simulation skips saving a half-finished tick", async () => {
    state.isLoading = true
    confirm.mockResolvedValue(true)
    await expect(session.requestClose()).resolves.toBe(true)
    expect(state.saveGame).not.toHaveBeenCalled()
  })

  test("disposing and remounting owns exactly one autosave timer", async () => {
    session.dispose()
    session = createSessionPersistence({ getState: () => state, getSettings: () => settings, flush, confirm, showSaving: jest.fn(), onError: jest.fn() })
    expect(jest.getTimerCount()).toBe(1)
    await jest.advanceTimersByTimeAsync(60000)
    expect(state.saveGame).toHaveBeenCalledTimes(1)
  })
})
