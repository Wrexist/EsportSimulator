import type { useSettingsStore as SettingsStore } from "@/lib/settings-store"

describe("canonical autosave preference migration", () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  function loadSettings(persisted?: Record<string, unknown>): typeof SettingsStore {
    const data = new Map<string, string>()
    if (persisted) data.set("game-settings", JSON.stringify({ state: persisted, version: 0 }))
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value) },
      removeItem: (key: string) => { data.delete(key) },
    } })
    let settings!: typeof SettingsStore
    jest.isolateModules(() => { settings = require("@/lib/settings-store").useSettingsStore })
    return settings
  }
  afterEach(() => {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage)
    else Reflect.deleteProperty(globalThis, "localStorage")
  })

  test("a legacy disabled setting is retained when the canonical store had no choice", () => {
    const settings = loadSettings()
    settings.getState().adoptLegacyAutoSave(false)
    expect(settings.getState().autoSave).toBe(false)
    settings.getState().adoptLegacyAutoSave(true)
    expect(settings.getState().autoSave).toBe(false)
  })
  test("a deliberate canonical choice wins over late legacy hydration", () => {
    const settings = loadSettings()
    settings.getState().setAutoSave(false)
    settings.getState().adoptLegacyAutoSave(true)
    expect(settings.getState().autoSave).toBe(false)
  })
  test("a persisted canonical false survives rehydration and wins over the legacy value", () => {
    const settings = loadSettings({ autoSave: false })
    expect(settings.getState().autoSavePreferenceSet).toBe(true)
    settings.getState().adoptLegacyAutoSave(true)
    expect(settings.getState().autoSave).toBe(false)
  })
})
