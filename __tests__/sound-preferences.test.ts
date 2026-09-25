import { SoundManager } from "@/lib/sound-manager"
import { routeMusicScene } from "@/lib/route-audio"
import { useSettingsStore } from "@/lib/settings-store"

test.each(["/map-editor", "/map-editor/lab", "/map-editor/lab/replay"])("keeps %s out of menu music", pathname => {
  expect(routeMusicScene(pathname)).toBe("silent")
})
test("preserves music ownership outside the studio", () => {
  expect(routeMusicScene("/main-menu")).toBe("menu")
  expect(routeMusicScene("/match/123/live")).toBe("match")
  expect(routeMusicScene("/map-editorial")).toBe("menu")
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

  test("zero master/music/SFX gains survive audio context creation", () => {
    const sound = new SoundManager()
    useSettingsStore.getState().setMasterVolume(0)
    useSettingsStore.getState().setMusicVolume(0)
    useSettingsStore.getState().setSfxVolume(0)
    listeners.get("click")!()
    expect(gains.map(gain => gain.gain.value)).toEqual([0, 0, 0])
    expect(listeners.size).toBe(0)
  })
  test("stored values initialize the buses and later changes take effect", () => {
    const sound = new SoundManager()
    useSettingsStore.getState().setMasterVolume(50)
    useSettingsStore.getState().setMusicVolume(25)
    useSettingsStore.getState().setSfxVolume(75)
    listeners.get("keydown")!()
    expect(gains.map(gain => gain.gain.value)).toEqual([0.21, 0.115, 0.75])
    sound.setMasterVolume(0)
    expect(gains[0].gain.value).toBe(0)
  })
  test("stopping queued music prevents it restarting on the first studio click", () => {
    const sound = new SoundManager()
    sound.startMusic("menu")
    sound.stopMusic()
    const start = jest.spyOn(sound, "startMusic")
    listeners.get("click")!()
    expect(start).not.toHaveBeenCalled()
  })
})
