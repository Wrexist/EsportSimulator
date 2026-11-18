/**
 * CROSSCUT-01 (2026-11-17): the desktop app serves the game on port 3000, or
 * 3001-3010 when 3000 is taken. localStorage is per origin (port included),
 * so settings in localStorage were reset to defaults on such a launch. Device
 * keys are now also kept in the user-data folder (window.electron.storage),
 * and that copy wins. Two "ports" are modelled as two localStorage maps over
 * one disk.
 */
import { createDeviceStorage, deviceDiskKey, type DiskStore } from '@/lib/device-storage'

function memoryLocal() {
    const map = new Map<string, string>()
    return {
        map,
        store: {
            getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
            setItem: (k: string, v: string) => { map.set(k, v) },
            removeItem: (k: string) => { map.delete(k) },
        },
    }
}

function memoryDisk() {
    const map = new Map<string, string>()
    const disk: DiskStore = {
        getItem: async k => (map.has(k) ? map.get(k)! : null),
        setItem: async (k, v) => { map.set(k, v); return true },
        removeItem: async k => { map.delete(k); return true },
    }
    return { map, disk }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))
const KEY = 'game-settings'

test('the file key is inside the storage IPC allowlist', () => {
    expect(deviceDiskKey('game-settings')).toBe('esports_device_game-settings')
    expect(deviceDiskKey('esim_draft_cup_runs_v1')).toMatch(/^esports_[a-zA-Z0-9_-]{1,230}$/)
    expect(deviceDiskKey('a:b/c')).toBe('esports_device_a_b_c')
})

test('browser (no desktop bridge): plain synchronous localStorage', () => {
    const local = memoryLocal()
    const storage = createDeviceStorage(() => local.store, () => null)
    expect(storage.getItem(KEY)).toBeNull()
    storage.setItem(KEY, '{"language":"de"}')
    expect(storage.getItem(KEY)).toBe('{"language":"de"}')
    storage.removeItem(KEY)
    expect(local.map.has(KEY)).toBe(false)
})

test('a launch on another port reads the settings from the user-data copy', async () => {
    const { disk, map } = memoryDisk()
    const port3000 = memoryLocal()
    const first = createDeviceStorage(() => port3000.store, () => disk)
    first.setItem(KEY, '{"language":"de"}')
    await flush()
    expect(map.get(deviceDiskKey(KEY))).toBe('{"language":"de"}')

    // Port 3000 busy: same disk, empty localStorage.
    const port3001 = memoryLocal()
    const second = createDeviceStorage(() => port3001.store, () => disk)
    const read = second.getItem(KEY)
    expect(read).toBeInstanceOf(Promise)
    await expect(read).resolves.toBe('{"language":"de"}')
    expect(port3001.map.get(KEY)).toBe('{"language":"de"}')
})

test('a normal launch stays synchronous; a newer user-data copy is adopted once', async () => {
    const { disk } = memoryDisk()
    const port3000 = memoryLocal()
    port3000.map.set(KEY, '{"language":"en"}')
    await disk.setItem(deviceDiskKey(KEY), '{"language":"fr"}') // changed during a session on 3001
    const storage = createDeviceStorage(() => port3000.store, () => disk)
    expect(storage.getItem(KEY)).toBe('{"language":"en"}')
    const adopted = jest.fn()
    storage.track(KEY, adopted)
    storage.track(KEY, adopted) // once per launch
    await flush()
    expect(adopted).toHaveBeenCalledTimes(1)
    expect(port3000.map.get(KEY)).toBe('{"language":"fr"}')
})

test('first launch of this build: localStorage seeds the user-data copy, nothing re-read', async () => {
    const { disk, map } = memoryDisk()
    const local = memoryLocal()
    local.map.set(KEY, '{"uiScale":125}')
    const storage = createDeviceStorage(() => local.store, () => disk)
    const adopted = jest.fn()
    storage.track(KEY, adopted)
    await flush()
    expect(adopted).not.toHaveBeenCalled()
    expect(map.get(deviceDiskKey(KEY))).toBe('{"uiScale":125}')
})

test('a setting changed while the copy is being compared is not overwritten', async () => {
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    const { disk, map } = memoryDisk()
    map.set(deviceDiskKey(KEY), '{"language":"pl"}')
    const slowDisk: DiskStore = { ...disk, getItem: async k => { await gate; return disk.getItem(k) } }
    const local = memoryLocal()
    local.map.set(KEY, '{"language":"en"}')
    const storage = createDeviceStorage(() => local.store, () => slowDisk)
    const adopted = jest.fn()
    storage.track(KEY, adopted)
    storage.setItem(KEY, '{"language":"ru"}')
    release()
    await flush(); await flush()
    expect(adopted).not.toHaveBeenCalled()
    expect(local.map.get(KEY)).toBe('{"language":"ru"}')
    expect(map.get(deviceDiskKey(KEY))).toBe('{"language":"ru"}')
})

test('a disk read error leaves both copies alone', async () => {
    const { disk, map } = memoryDisk()
    map.set(deviceDiskKey(KEY), '{"language":"pl"}')
    const broken: DiskStore = { ...disk, getItem: async () => ({ error: 'Disk storage could not be read' }) as unknown as string }
    const local = memoryLocal()
    local.map.set(KEY, '{"language":"en"}')
    const storage = createDeviceStorage(() => local.store, () => broken)
    await expect(storage.reconcile(KEY)).resolves.toBe(false)
    await flush()
    expect(map.get(deviceDiskKey(KEY))).toBe('{"language":"pl"}')
    expect(local.map.get(KEY)).toBe('{"language":"en"}')
})

test('the settings store persists through device storage (zustand persist round trip)', async () => {
    const { disk, map } = memoryDisk()
    const local = memoryLocal()
    // Node test environment: a minimal desktop window (bridge + this port's localStorage).
    const g = globalThis as unknown as { window?: unknown; localStorage?: unknown }
    g.window = { electron: { storage: disk } }
    g.localStorage = local.store
    jest.resetModules()
    const { useSettingsStore } = await import('@/lib/settings-store')
    await flush()
    useSettingsStore.getState().setLanguage('de')
    await flush()
    expect(JSON.parse(map.get(deviceDiskKey(KEY))!).state.language).toBe('de')

    // Next launch on another port: empty localStorage, same user-data folder.
    local.map.clear()
    jest.resetModules()
    const again = await import('@/lib/settings-store')
    await flush(); await flush()
    expect(again.useSettingsStore.getState().language).toBe('de')
    delete g.window
    delete g.localStorage
})
