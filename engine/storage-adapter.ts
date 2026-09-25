/**
 * Async storage adapter.
 * Prefers Electron's disk-backed store when available, otherwise IndexedDB,
 * and localStorage only when IndexedDB is unsupported. Runtime failures propagate.
 */

const DB_NAME = "EsportsSimDB"
const STORE_NAME = "keyvalue_store"
const DB_VERSION = 1

export interface AsyncStorage {
    getItem(key: string): Promise<string | null>
    setItem(key: string, value: string): Promise<void>
    removeItem(key: string): Promise<void>
    clear(): Promise<void>
    getAllKeys(): Promise<string[]>
}

/**
 * True for "storage is full" errors across engines. These must NOT be swallowed
 * into the volatile in-memory fallback: a write that only reaches memory would
 * still pass SaveManager's read-back verification and report a successful save,
 * then vanish on app close (silent progress loss). Propagating the error instead
 * lets saveGame() return {success:false} so the UI can warn the player.
 */
export function isQuotaError(err: unknown): boolean {
    if (!err || typeof err !== "object") return false
    const e = err as { name?: string; code?: number }
    return (
        e.name === "QuotaExceededError" ||
        e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
        e.code === 22 ||
        e.code === 1014
    )
}

export class LocalStorageAdapter implements AsyncStorage {
    // Non-browser compute/tests may use memory. A browser never calls a volatile write saved.
    private memory = new Map<string, string>()
    private getStorage(): Storage | null {
        if (typeof globalThis.window === "undefined") return null
        const storage = window.localStorage
        if (!storage) throw new Error("Persistent storage is unavailable. Your progress has not been saved.")
        return storage
    }
    async getItem(key: string): Promise<string | null> {
        const storage = this.getStorage()
        return storage ? storage.getItem(key) : this.memory.get(key) ?? null
    }
    async setItem(key: string, value: string): Promise<void> {
        const storage = this.getStorage()
        if (storage) storage.setItem(key, value)
        else this.memory.set(key, value)
    }
    async removeItem(key: string): Promise<void> {
        const storage = this.getStorage()
        if (storage) storage.removeItem(key)
        else this.memory.delete(key)
    }
    async clear(): Promise<void> {
        const storage = this.getStorage()
        if (storage) storage.clear()
        else this.memory.clear()
    }
    async getAllKeys(): Promise<string[]> {
        const storage = this.getStorage()
        if (!storage) return Array.from(this.memory.keys())
        return Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((k): k is string => k !== null)
    }
}

export class ElectronStorageAdapter implements AsyncStorage {
    private bridge = typeof globalThis.window !== "undefined" ? window.electron?.storage : undefined
    constructor(private fallback: AsyncStorage) {}
    async getItem(key: string): Promise<string | null> {
        if (!this.bridge) return this.fallback.getItem(key)
        const value = await this.bridge.getItem(key)
        if (value !== null && typeof value !== 'string') throw new Error("Disk storage could not be read. Retry or restore a backup.")
        return value
    }
    async setItem(key: string, value: string): Promise<void> {
        if (!this.bridge) return this.fallback.setItem(key, value)
        if (await this.bridge.setItem(key, value) !== true) throw new Error("Disk save failed. Free space and retry.")
    }
    async removeItem(key: string): Promise<void> {
        if (!this.bridge) return this.fallback.removeItem(key)
        if (await this.bridge.removeItem(key) !== true) throw new Error("Disk save deletion failed")
    }
    async clear(): Promise<void> {
        if (!this.bridge) return this.fallback.clear()
        if (await this.bridge.clear() !== true) throw new Error("Disk storage clear failed")
    }
    async getAllKeys(): Promise<string[]> {
        if (!this.bridge) return this.fallback.getAllKeys()
        const keys = await this.bridge.getAllKeys()
        if (!Array.isArray(keys) || !keys.every(key => typeof key === 'string')) throw new Error("Disk save list could not be read. Retry before creating a career.")
        return keys
    }
}

export class IndexedDBAdapter implements AsyncStorage {
    private dbPromise: Promise<IDBDatabase> | null = null
    private available = typeof globalThis.window !== "undefined" && typeof indexedDB !== "undefined"
    constructor(private fallback: AsyncStorage) {}
    private openDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            let settled = false
            const timeout = setTimeout(() => { settled = true; reject(new Error("IndexedDB open timed out; retry saving.")) }, 5000)
            try {
                const request = indexedDB.open(DB_NAME, DB_VERSION)
                request.onerror = () => { clearTimeout(timeout); settled = true; reject(request.error) }
                request.onsuccess = () => {
                    clearTimeout(timeout)
                    if (settled) { request.result.close(); return }
                    settled = true
                    request.result.onversionchange = () => { request.result.close(); this.dbPromise = null }
                    resolve(request.result)
                }
                request.onupgradeneeded = () => {
                    if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
                }
            } catch (error) { clearTimeout(timeout); reject(error) }
        })
    }
    private async getDB(): Promise<IDBDatabase | null> {
        if (!this.available) return null
        if (!this.dbPromise) this.dbPromise = this.openDB()
        try { return await this.dbPromise }
        catch (error) { this.dbPromise = null; throw error }
    }
    private async operation<T>(mode: IDBTransactionMode, issue: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
        const db = await this.getDB()
        if (!db) throw new Error("IndexedDB unavailable")
        return new Promise<T>((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, mode)
            const request = issue(transaction.objectStore(STORE_NAME))
            // Request success is provisional. A later transaction abort must reject the save.
            transaction.oncomplete = () => resolve(request.result)
            transaction.onabort = () => reject(transaction.error ?? new Error("Storage transaction aborted; retry saving."))
            transaction.onerror = () => reject(transaction.error ?? new Error("Storage transaction failed"))
            request.onerror = () => reject(request.error ?? new Error("Storage request failed"))
        })
    }
    async getItem(key: string): Promise<string | null> {
        if (!this.available) return this.fallback.getItem(key)
        return (await this.operation('readonly', store => store.get(key))) ?? null
    }
    async setItem(key: string, value: string): Promise<void> {
        if (!this.available) return this.fallback.setItem(key, value)
        await this.operation('readwrite', store => store.put(value, key))
    }
    async removeItem(key: string): Promise<void> {
        if (!this.available) return this.fallback.removeItem(key)
        await this.operation('readwrite', store => store.delete(key))
    }
    async clear(): Promise<void> {
        if (!this.available) return this.fallback.clear()
        await this.operation('readwrite', store => store.clear())
    }
    async getAllKeys(): Promise<string[]> {
        if (!this.available) return this.fallback.getAllKeys()
        return (await this.operation('readonly', store => store.getAllKeys())).filter((key): key is string => typeof key === 'string')
    }
}

const localStorageFallback = new LocalStorageAdapter()
// Next.js folds `typeof window` in client bundles, including worker chunks.
// Read the actual realm at runtime and never open a durable adapter in a worker.
const baseStorage = typeof globalThis.window === "undefined"
    ? localStorageFallback
    : window.electron?.storage
        ? new ElectronStorageAdapter(localStorageFallback)
        : new IndexedDBAdapter(localStorageFallback)

export const asyncStorage = baseStorage

/**
 * Debounced storage wrapper for Zustand persist.
 * Zustand persist calls setItem on every state change, so we coalesce writes.
 */
export class DebouncedStorage implements AsyncStorage {
    private inner: AsyncStorage
    private pendingWrites = new Map<string, { value: string; timer: ReturnType<typeof setTimeout>; resolve: () => void; reject: (err: unknown) => void }>()
    private debounceMs: number

    constructor(inner: AsyncStorage, debounceMs = 150) {
        this.inner = inner
        this.debounceMs = debounceMs
    }

    getItem(key: string) { return this.inner.getItem(key) }
    removeItem(key: string) { return this.inner.removeItem(key) }
    clear() { return this.inner.clear() }
    getAllKeys() { return this.inner.getAllKeys() }

    setItem(key: string, value: string): Promise<void> {
        const existing = this.pendingWrites.get(key)
        if (existing) {
            clearTimeout(existing.timer)
        }

        return new Promise<void>((resolve, reject) => {
            const timer = setTimeout(async () => {
                this.pendingWrites.delete(key)
                try {
                    await this.inner.setItem(key, value)
                    existing?.resolve()
                    resolve()
                } catch (err) {
                    existing?.reject(err)
                    reject(err)
                }
            }, this.debounceMs)
            this.pendingWrites.set(key, { value, timer,
                resolve: () => { existing?.resolve(); resolve() },
                reject: err => { existing?.reject(err); reject(err) },
            })
        })
    }

    async flush(): Promise<void> {
        let failure: unknown
        const entries = Array.from(this.pendingWrites.entries())
        for (const [key, pending] of entries) {
            clearTimeout(pending.timer)
            this.pendingWrites.delete(key)
            try {
                await this.inner.setItem(key, pending.value)
                pending.resolve()
            } catch (err) {
                pending.reject(err)
                failure = err
            }
        }
        if (failure) throw failure
    }
}

export const debouncedStorage = new DebouncedStorage(asyncStorage)
