import { useSettingsStore } from '@/lib/settings-store'
import { routeMusicScene } from '@/lib/route-audio'

test('preferences apply the same bounded scale to state and the document', () => {
    const before = (global as { document?: unknown }).document
    const doc = { documentElement: { style: { fontSize: '' } } }
    ;(global as { document?: unknown }).document = doc
    try {
        useSettingsStore.getState().setUiScale(999)
        expect(useSettingsStore.getState().uiScale).toBe(120)
        expect(doc.documentElement.style.fontSize).toBe('120%')
        useSettingsStore.getState().setUiScale(NaN)
        expect(useSettingsStore.getState().uiScale).toBe(100)
        useSettingsStore.getState().setMasterVolume(NaN)
        useSettingsStore.getState().setSfxVolume(150)
        expect(useSettingsStore.getState().masterVolume).toBe(0)
        expect(useSettingsStore.getState().sfxVolume).toBe(100)
    } finally { (global as { document?: unknown }).document = before }
})

test('the shared display action treats borderless consistently with the full settings screen', () => {
    const before = (global as { window?: unknown }).window
    const setFullscreen = jest.fn()
    ;(global as { window?: unknown }).window = { electron: { window: { setFullscreen } } }
    try {
        useSettingsStore.getState().setWindowMode('borderless')
        useSettingsStore.getState().applyWindowSettings()
        expect(setFullscreen).toHaveBeenCalledWith(true)
    } finally { (global as { window?: unknown }).window = before }
})

test('all studio levels are silent while live matches own the match scene', () => {
    expect(routeMusicScene('/map-editor')).toBe('silent')
    expect(routeMusicScene('/map-editor/lab')).toBe('silent')
    expect(routeMusicScene('/match/qa/live')).toBe('match')
    expect(routeMusicScene('/main-menu')).toBe('menu')
})

test('persisted device data cannot overwrite actions or inject invalid preferences', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem() {}, removeItem() {} } })
    try {
        jest.isolateModules(() => {
            const store: typeof useSettingsStore = require('@/lib/settings-store').useSettingsStore
            const current = store.getState()
            const restored = store.persist.getOptions().merge!({ setMasterVolume: null, windowMode: 'invalid', autoSave: false, uiScale: 800, musicVolume: -50, autoSaveInterval: 'broken' }, current)
            expect(restored.setMasterVolume).toBe(current.setMasterVolume)
            expect(restored.windowMode).toBe(current.windowMode)
            expect(restored.autoSave).toBe(false)
            expect(restored.autoSavePreferenceSet).toBe(true)
            expect(restored.uiScale).toBe(120)
            expect(restored.musicVolume).toBe(0)
            expect(restored.autoSaveInterval).toBe(10)
        })
    } finally {
        if (original) Object.defineProperty(globalThis, 'localStorage', original)
        else Reflect.deleteProperty(globalThis, 'localStorage')
    }
})
