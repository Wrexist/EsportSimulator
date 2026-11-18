/**
 * Device preferences that survive a change of the desktop app's port
 * (CROSSCUT-01, 2026-11-17).
 *
 * Browser storage (localStorage) belongs to an origin, and the origin includes
 * the port. The desktop app serves the game on 127.0.0.1:3000, or on the next
 * free port up to 3010 when 3000 is taken (electron/local-server.js), so on
 * such a launch the page opened with an empty localStorage: the language, UI
 * scale, volumes, accessibility and the other settings were back to defaults
 * (and came back on the next launch on 3000). Career saves were never affected:
 * they are files in the user-data folder (window.electron.storage).
 *
 * In the desktop app every write of a key kept here also goes to that folder
 * (as `esports_device_<key>`), and that copy is the truth:
 * - reads stay synchronous from localStorage when it has the key (no flash of
 *   default settings on a normal launch);
 * - when localStorage does not have it (a launch on another port), the file
 *   copy is read instead and written back to localStorage;
 * - `track` compares both once per launch and adopts the file copy when it
 *   differs (localStorage of the usual port can be older than the file after a
 *   session on another port), or seeds the file from localStorage on the first
 *   launch of a build with this mirror.
 * In a browser (no window.electron) it is plain localStorage.
 */

export interface DiskStore {
    getItem: (key: string) => Promise<string | null>
    setItem: (key: string, value: string) => Promise<unknown>
    removeItem: (key: string) => Promise<unknown>
}

type LocalStore = Pick<Storage, "getItem" | "setItem" | "removeItem">

/** File key of a device key (electron/ipc-policy.js allows `esports_[A-Za-z0-9_-]`). */
export function deviceDiskKey(key: string): string {
    return `esports_device_${key.replace(/[^A-Za-z0-9_-]/g, "_")}`
}

function browserLocalStorage(): LocalStore | null {
    // Same lookup as zustand's default persist storage (the global localStorage).
    try { return typeof localStorage !== "undefined" ? localStorage : null } catch { return null }
}

function desktopDisk(): DiskStore | null {
    try { return typeof window !== "undefined" ? window.electron?.storage ?? null : null } catch { return null }
}

export function createDeviceStorage(local: () => LocalStore | null = browserLocalStorage, disk: () => DiskStore | null = desktopDisk) {
    const writes = new Map<string, number>()
    const tracked = new Set<string>()
    const writeCount = (key: string) => writes.get(key) ?? 0

    const readLocal = (key: string): string | null => {
        try { return local()?.getItem(key) ?? null } catch { return null }
    }
    const writeLocal = (key: string, value: string | null) => {
        try {
            const store = local()
            if (!store) return
            if (value === null) store.removeItem(key)
            else store.setItem(key, value)
        } catch { /* storage full or denied: the file copy still has it */ }
    }
    const writeDisk = (key: string, value: string | null) => {
        const store = disk()
        if (!store) return
        try {
            const pending = value === null ? store.removeItem(deviceDiskKey(key)) : store.setItem(deviceDiskKey(key), value)
            void Promise.resolve(pending).catch(() => { /* localStorage still has it */ })
        } catch { /* bridge unavailable */ }
    }

    const storage = {
        /** zustand persist storage: synchronous when localStorage has the key. */
        getItem(key: string): string | null | Promise<string | null> {
            const value = readLocal(key)
            const store = disk()
            if (value !== null || !store) return value
            // Nothing for this origin yet (first launch on another port): the file copy.
            const before = writeCount(key)
            return Promise.resolve()
                .then(() => store.getItem(deviceDiskKey(key)))
                .then(saved => {
                    if (typeof saved !== "string") return null
                    if (writeCount(key) === before && readLocal(key) === null) writeLocal(key, saved)
                    return saved
                }, () => null)
        },
        setItem(key: string, value: string): void {
            writes.set(key, writeCount(key) + 1)
            writeLocal(key, value)
            writeDisk(key, value)
        },
        removeItem(key: string): void {
            writes.set(key, writeCount(key) + 1)
            writeLocal(key, null)
            writeDisk(key, null)
        },
        /**
         * Once per launch: make localStorage match the file copy. Resolves true
         * when localStorage was replaced by the file copy (the caller re-reads).
         */
        async reconcile(key: string): Promise<boolean> {
            const store = disk()
            if (!store) return false
            const before = writeCount(key)
            const local = readLocal(key)
            let saved: string | null
            try { saved = await store.getItem(deviceDiskKey(key)) } catch { return false }
            // Written meanwhile (or read back by getItem): that copy is the newest.
            if (writeCount(key) !== before || readLocal(key) !== local) return false
            // No copy yet (first launch of this build): seed it. A read error
            // (the main process answers { error }) leaves both copies alone.
            if (saved === null || saved === undefined) {
                if (local !== null) writeDisk(key, local)
                return false
            }
            if (typeof saved !== "string") return false
            if (saved === local) return false
            writeLocal(key, saved)
            return true
        },
        /** Keep `key` on disk too; `onAdopted` runs when the file copy replaced localStorage. */
        track(key: string, onAdopted?: () => void): void {
            if (tracked.has(key) || !disk()) return
            tracked.add(key)
            void storage.reconcile(key).then(adopted => { if (adopted) onAdopted?.() }, () => { /* keep localStorage */ })
        },
    }
    return storage
}

/** The app's device storage (settings, Draft Cup history). */
export const deviceStorage = createDeviceStorage()
