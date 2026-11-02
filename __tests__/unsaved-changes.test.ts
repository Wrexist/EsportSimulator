import { createSessionPersistence } from "@/lib/session-persistence"
import { clearCareerBaseline, hasUnsavedChanges, markCareerSaved } from "@/lib/unsaved-changes"

describe("unsaved career tracking", () => {
  afterEach(() => clearCareerBaseline())

  test("a career is clean right after a save or load and dirty once a durable slice changes", () => {
    const players = [{ id: "p1" }]
    const state = { saveId: "career", currentWeek: 3, players }
    markCareerSaved(state)
    expect(hasUnsavedChanges(state)).toBe(false)
    expect(hasUnsavedChanges({ ...state, players: [...players] })).toBe(true)
    expect(hasUnsavedChanges({ ...state, currentWeek: 4 })).toBe(true)
  })

  test("another career, or no baseline yet, counts as unsaved; no career never does", () => {
    markCareerSaved({ saveId: "a", currentWeek: 1 })
    expect(hasUnsavedChanges({ saveId: "b", currentWeek: 1 })).toBe(true)
    clearCareerBaseline()
    expect(hasUnsavedChanges({ saveId: "a", currentWeek: 1 })).toBe(true)
    expect(hasUnsavedChanges({ saveId: null })).toBe(false)
  })
})

describe("closing with auto-save off", () => {
  let session: ReturnType<typeof createSessionPersistence>
  const state = { saveId: "career" as string | null, isLoading: false, saveGame: jest.fn().mockResolvedValue(undefined) }
  const settings = { autoSave: false, autoSaveInterval: 10 }
  const confirm = jest.fn().mockResolvedValue(false)
  let dirty = true
  const chooseUnsaved = jest.fn<Promise<"save" | "discard" | "stay">, []>()

  beforeEach(() => {
    jest.clearAllMocks()
    dirty = true
    session = createSessionPersistence({
      getState: () => state, getSettings: () => settings, flush: async () => {}, confirm,
      showSaving: jest.fn(), onError: jest.fn(), hasUnsavedChanges: () => dirty, chooseUnsaved,
    })
  })
  afterEach(() => session.dispose())

  test("asks before dropping unsaved progress and saves when the player picks save", async () => {
    chooseUnsaved.mockResolvedValue("save")
    await expect(session.requestClose()).resolves.toBe(true)
    expect(chooseUnsaved).toHaveBeenCalledTimes(1)
    expect(state.saveGame).toHaveBeenCalledTimes(1)
  })

  test("quit without saving closes without writing", async () => {
    chooseUnsaved.mockResolvedValue("discard")
    await expect(session.requestClose()).resolves.toBe(true)
    expect(state.saveGame).not.toHaveBeenCalled()
  })

  test("stay keeps the window open", async () => {
    chooseUnsaved.mockResolvedValue("stay")
    await expect(session.requestClose()).resolves.toBe(false)
    expect(state.saveGame).not.toHaveBeenCalled()
  })

  test("nothing unsaved closes at once without a prompt", async () => {
    dirty = false
    await expect(session.requestClose()).resolves.toBe(true)
    expect(chooseUnsaved).not.toHaveBeenCalled()
    expect(state.saveGame).not.toHaveBeenCalled()
  })
})
