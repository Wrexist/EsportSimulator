import { SoundManager } from "@/lib/sound-manager"
import { routeMusicScene } from "@/lib/route-audio"
import { useSettingsStore } from "@/lib/settings-store"

test.each(["/map-editor", "/map-editor/lab", "/map-editor/lab/replay"])("keeps %s out of menu music", pathname => {
  expect(routeMusicScene(pathname)).toBe("silent")
})
test("preserves music ownership outside the studio", () => {
  expect(routeMusicScene("/main-menu")).toBe("menu")
  expect(routeMusicScene("/new-game/setup")).toBe("menu")
  expect(routeMusicScene("/load-game")).toBe("menu")
  expect(routeMusicScene("/match/123/live")).toBe("match")
  expect(routeMusicScene("/match/123/result")).toBe("career")
  expect(routeMusicScene("/map-editorial")).toBe("career")
  expect(routeMusicScene("/squad")).toBe("career")
  expect(routeMusicScene("/settings", false)).toBe("menu")
  expect(routeMusicScene("/settings", true)).toBe("career")
})

describe("audio preferences before first interaction", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
  let listeners: Map<string, () => void>
  let gains: Array<{ gain: { value: number }; connect: jest.Mock }>
  beforeEach(() => {
    listeners = new Map()
    gains = []
    class FakeAudioContext {
      destination = {}
      createGain() {
        const gain = { gain: { value: 1 }, connect: jest.fn() }
        gains.push(gain)
        return gain
      }
    }
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      AudioContext: FakeAudioContext,
      addEventListener: (type: string, callback: () => void) => listeners.set(type, callback),
      removeEventListener: (type: string) => listeners.delete(type),
    } })
  })
  afterEach(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow)
    else Reflect.deleteProperty(globalThis, "window")
  })

  // buses: master, focus, music, sfx, duck, ui, match, moment
  test("zero master/music/SFX gains survive audio context creation", () => {
    new SoundManager()
    useSettingsStore.getState().setMasterVolume(0)
    useSettingsStore.getState().setMusicVolume(0)
    useSettingsStore.getState().setSfxVolume(0)
    listeners.get("click")!()
    expect([gains[0], gains[2], gains[3]].map(gain => gain.gain.value)).toEqual([0, 0, 0])
    expect(listeners.size).toBe(0)
  })
  test("stored values initialize the buses and later changes take effect", () => {
    const sound = new SoundManager()
    useSettingsStore.getState().setMasterVolume(50)
    useSettingsStore.getState().setMusicVolume(25)
    useSettingsStore.getState().setSfxVolume(75)
    listeners.get("keydown")!()
    expect(gains[0].gain.value).toBeCloseTo(0.45)
    expect(gains[2].gain.value).toBeCloseTo(0.175)
    expect(gains[3].gain.value).toBeCloseTo(0.75)
    sound.setMasterVolume(0)
    expect(gains[0].gain.value).toBe(0)
  })
  test("interface sounds off starts the ui bus muted", () => {
    useSettingsStore.getState().setUiSounds(false)
    new SoundManager()
    listeners.get("pointerdown")!()
    expect(gains[5].gain.value).toBe(0)
    expect(gains[6].gain.value).toBe(1)
    useSettingsStore.getState().setUiSounds(true)
  })
  test("stopping queued music prevents it starting on the first studio click", async () => {
    const sound = new SoundManager()
    sound.startMusic("menu")
    sound.stopMusic()
    listeners.get("click")!()
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect(sound.status().scene).toBeNull()
    expect(sound.currentScene()).toBeNull()
  })
})
