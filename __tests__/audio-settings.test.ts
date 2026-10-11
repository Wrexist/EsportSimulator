import { migrateSettings, DEFAULT_MUSIC_VOLUME, SETTINGS_VERSION, type useSettingsStore } from '@/lib/settings-store'

/** Audio settings: one home, Phase 5 defaults, and a one-time migration of the old music default. */
describe('audio settings', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    let storage: Map<string, string>
    beforeEach(() => {
        storage = new Map()
        Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
            getItem: (k: string) => storage.get(k) ?? null,
            setItem: (k: string, v: string) => { storage.set(k, v) },
            removeItem: (k: string) => { storage.delete(k) },
        } })
    })
    afterEach(() => {
        if (original) Object.defineProperty(globalThis, 'localStorage', original)
        else Reflect.deleteProperty(globalThis, 'localStorage')
    })

    const freshStore = () => {
        let store!: typeof useSettingsStore
        jest.isolateModules(() => { store = require('@/lib/settings-store').useSettingsStore })
        return store
    }

    test('defaults: music on at a modest level, interface sounds on, hover off, background mute on', () => {
        const s = freshStore().getState()
        expect(s.masterVolume).toBe(80)
        expect(s.musicVolume).toBe(DEFAULT_MUSIC_VOLUME)
        expect(DEFAULT_MUSIC_VOLUME).toBe(45)
        expect(s.sfxVolume).toBe(80)
        expect(s.soundEnabled).toBe(true)
        expect(s.uiSounds).toBe(true)
        expect(s.hoverSounds).toBe(false)
        expect(s.muteWhenUnfocused).toBe(true)
    })

    test('the old stored music default (0) moves to 45 once; a later chosen 0 stays', () => {
        expect((migrateSettings({ musicVolume: 0, masterVolume: 60 }, 0) as { musicVolume: number }).musicVolume).toBe(45)
        expect((migrateSettings({ musicVolume: 30 }, 0) as { musicVolume: number }).musicVolume).toBe(30)
        expect((migrateSettings({ musicVolume: 0 }, SETTINGS_VERSION) as { musicVolume: number }).musicVolume).toBe(0)

        storage.set('game-settings', JSON.stringify({ state: { musicVolume: 0, masterVolume: 60, sfxVolume: 70 }, version: 0 }))
        const store = freshStore()
        expect(store.getState().musicVolume).toBe(45)
        expect(store.getState().masterVolume).toBe(60)
        expect(store.getState().sfxVolume).toBe(70)
        expect(JSON.parse(storage.get('game-settings')!).version).toBe(SETTINGS_VERSION)

        store.getState().setMusicVolume(0)
        const again = freshStore()
        expect(again.getState().musicVolume).toBe(0)
    })

    test('the pre-Phase-5 game-store sound switch is adopted once, never over a choice made here', () => {
        const store = freshStore()
        store.getState().adoptLegacySoundEnabled(false)
        expect(store.getState().soundEnabled).toBe(false)
        store.getState().setSoundEnabled(true)
        store.getState().adoptLegacySoundEnabled(false)
        expect(store.getState().soundEnabled).toBe(true)
        storage.set('game-settings', JSON.stringify({ state: { soundEnabled: false }, version: 1 }))
        const restored = freshStore()
        restored.getState().adoptLegacySoundEnabled(true)
        expect(restored.getState().soundEnabled).toBe(false)
    })

    test('persisted toggles are validated', () => {
        const store = freshStore()
        const current = store.getState()
        const merged = store.persist.getOptions().merge!({ uiSounds: 'yes', hoverSounds: true, muteWhenUnfocused: 0 }, current)
        expect(merged.uiSounds).toBe(current.uiSounds)
        expect(merged.hoverSounds).toBe(true)
        expect(merged.muteWhenUnfocused).toBe(current.muteWhenUnfocused)
    })
})
