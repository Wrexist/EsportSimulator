import { useSettingsStore } from '@/lib/settings-store'
import { routeMusicScene } from '@/lib/route-audio'

test('preferences apply the same bounded scale to state and the document', () => {
    const before = (global as { document?: unknown }).document
    const doc = { documentElement: { style: { fontSize: '' } } }
    ;(global as { document?: unknown }).document = doc
    try {
        expect(useSettingsStore.getState().uiScaleAuto).toBe(true)
        useSettingsStore.getState().setUiScale(999)
        expect(useSettingsStore.getState().uiScale).toBe(150)
        // A picked scale sticks: the automatic size stops following the window.
        expect(useSettingsStore.getState().uiScaleAuto).toBe(false)
        // Browser build (no desktop page zoom): root font size.
        expect(doc.documentElement.style.fontSize).toBe('150%')
        useSettingsStore.getState().setUiScale(NaN)
        expect(useSettingsStore.getState().uiScale).toBe(100)
        useSettingsStore.getState().setUiScaleAuto(true)
        expect(useSettingsStore.getState().uiScaleAuto).toBe(true)
        useSettingsStore.getState().setMasterVolume(NaN)
        useSettingsStore.getState().setSfxVolume(150)
        expect(useSettingsStore.getState().masterVolume).toBe(0)
        expect(useSettingsStore.getState().sfxVolume).toBe(100)
    } finally { (global as { document?: unknown }).document = before }
})

test('the desktop app scales with page zoom only, never also the root font size', () => {
    const before = { window: (global as { window?: unknown }).window, document: (global as { document?: unknown }).document }
    let zoom = 1
    const setZoomFactor = jest.fn((f: number) => { zoom = f })
    const doc = { documentElement: { style: { fontSize: '120%' } } }
    ;(global as { window?: unknown }).window = { electron: { display: { getZoomFactor: () => zoom, setZoomFactor } } }
    ;(global as { document?: unknown }).document = doc
    try {
        useSettingsStore.getState().setUiScale(125)
        expect(setZoomFactor).toHaveBeenCalledWith(1.25)
        expect(doc.documentElement.style.fontSize).toBe('')
    } finally {
        (global as { window?: unknown }).window = before.window
        ;(global as { document?: unknown }).document = before.document
        useSettingsStore.setState({ uiScale: 100, uiScaleAuto: true })
    }
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
            expect(restored.uiScale).toBe(150)
            // Saved before the automatic scale: a scale other than 100 was picked and stays.
            expect(restored.uiScaleAuto).toBe(false)
            expect(store.persist.getOptions().merge!({ uiScale: 100 }, current).uiScaleAuto).toBe(true)
            expect(store.persist.getOptions().merge!({}, current).uiScaleAuto).toBe(true)
            expect(store.persist.getOptions().merge!({ uiScale: 100, uiScaleAuto: false }, current).uiScaleAuto).toBe(false)
            expect(store.persist.getOptions().merge!({ uiScale: 130, uiScaleAuto: true }, current).uiScaleAuto).toBe(true)
            expect(store.persist.getOptions().merge!({ uiScaleAuto: 'yes' }, current).uiScaleAuto).toBe(true)
            expect(restored.musicVolume).toBe(0)
            expect(restored.autoSaveInterval).toBe(10)
        })
    } finally {
        if (original) Object.defineProperty(globalThis, 'localStorage', original)
        else Reflect.deleteProperty(globalThis, 'localStorage')
    }
})
