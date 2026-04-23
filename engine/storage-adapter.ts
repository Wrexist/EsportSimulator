/**
 * Async storage adapter.
 * Prefers Electron's disk-backed store when available, otherwise IndexedDB,
 * and finally localStorage/memory as a best-effort browser fallback.
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

class LocalStorageAdapter implements AsyncStorage {
    private memory = new Map<string, string>()

    private getStorage(): Storage | null {
        if (typeof window === "undefined") return null
        try {
            const storage = window.localStorage
            const probeKey = "__esim_storage_probe__"
            storage.setItem(probeKey, "1")
            storage.removeItem(probeKey)
            return storage
        } catch {
            return null
        }
    }

    async getItem(key: string): Promise<string | null> {
        const storage = this.getStorage()
        if (storage) {
            try {
                return storage.getItem(key)
            } catch (err) {
                console.warn("[Storage] localStorage getItem failed, using memory fallback:", err)
            }
        }
        return this.memory.get(key) ?? null
    }

    async setItem(key: string, value: string): Promise<void> {
        const storage = this.getStorage()
        if (storage) {
            try {
                storage.setItem(key, value)
                this.memory.delete(key)
                return
            } catch (err) {
                console.warn("[Storage] localStorage setItem failed, using memory fallback:", err)
            }
        }
        this.memory.set(key, value)
    }

    async removeItem(key: string): Promise<void> {
        const storage = this.getStorage()
        if (storage) {
            try {
                storage.removeItem(key)
            } catch (err) {
                console.warn("[Storage] localStorage removeItem failed:", err)
            }
        }
        this.memory.delete(key)
    }

    async clear(): Promise<void> {
        const storage = this.getStorage()
        if (storage) {
            try {
                storage.clear()
            } catch (err) {
                console.warn("[Storage] localStorage clear failed:", err)
            }
        }
        this.memory.clear()
    }

    async getAllKeys(): Promise<string[]> {
        const keys = new Set<string>(this.memory.keys())
        const storage = this.getStorage()
        if (storage) {
            try {
                for (let i = 0; i < storage.length; i++) {
                    const key = storage.key(i)
                    if (key) keys.add(key)
                }
            } catch (err) {
                console.warn("[Storage] localStorage getAllKeys failed:", err)
            }
        }
        return Array.from(keys)
    }
}

class ElectronStorageAdapter implements AsyncStorage {
    private bridge = typeof window !== "undefined" ? window.electron?.storage : undefined
    private fallback: AsyncStorage

    constructor(fallback: AsyncStorage) {
        this.fallback = fallback
    }

    async getItem(key: string): Promise<string | null> {
        if (!this.bridge) return this.fallback.getItem(key)
        try {
            return await this.bridge.getItem(key)
        } catch (err) {
            console.warn("[Storage] Electron storage getItem failed, falling back:", err)
            return this.fallback.getItem(key)
        }
    }

    async setItem(key: string, value: string): Promise<void> {
        if (!this.bridge) return this.fallback.setItem(key, value)
        try {
            const ok = await this.bridge.setItem(key, value)
            if (!ok) throw new Error("Electron storage rejected write")
        } catch (err) {
            console.warn("[Storage] Electron storage setItem failed, falling back:", err)
            await this.fallback.setItem(key, value)
        }
    }

    async removeItem(key: string): Promise<void> {
        if (!this.bridge) return this.fallback.removeItem(key)
        try {
            const ok = await this.bridge.removeItem(key)
            if (!ok) throw new Error("Electron storage rejected delete")
        } catch (err) {
            console.warn("[Storage] Electron storage removeItem failed, falling back:", err)
            await this.fallback.removeItem(key)
        }
    }

    async clear(): Promise<void> {
        if (!this.bridge) return this.fallback.clear()
        try {
            const ok = await this.bridge.clear()
            if (!ok) throw new Error("Electron storage rejected clear")
        } catch (err) {
            console.warn("[Storage] Electron storage clear failed, falling back:", err)
            await this.fallback.clear()
        }
    }

    async getAllKeys(): Promise<string[]> {
        if (!this.bridge) return this.fallback.getAllKeys()
        try {
            return await this.bridge.getAllKeys()
        } catch (err) {
            console.warn("[Storage] Electron storage getAllKeys failed, falling back:", err)
            return this.fallback.getAllKeys()
        }
    }
}

class IndexedDBAdapter implements AsyncStorage {
    private dbPromise: Promise<IDBDatabase | null> | null = null
    private dbFailed = false
    private fallback: AsyncStorage

    constructor(fallback: AsyncStorage) {
        this.fallback = fallback

        if (typeof window !== "undefined" && typeof indexedDB !== "undefined") {
            this.dbPromise = this.openDB().catch((err) => {
                if (process.env.NODE_ENV !== 'production') {
                    console.error("[Storage] IndexedDB failed to open, falling back:", err)
                }
                this.dbFailed = true
                return null
            })
        } else {
            this.dbFailed = true
        }
    }

    private openDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("IndexedDB open timed out after 5s"))
            }, 5000)

            try {
                const request = indexedDB.open(DB_NAME, DB_VERSION)

                request.onerror = () => { clearTimeout(timeout); reject(request.error) }
                request.onsuccess = () => { clearTimeout(timeout); resolve(request.result) }

                request.onupgradeneeded = (event) => {
                    const db = (event.target as IDBOpenDBRequest).result
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME)
                    }
                }
            } catch (err) {
                clearTimeout(timeout)
                reject(err)
            }
        })
    }

    private async getDB(): Promise<IDBDatabase | null> {
        if (!this.dbPromise || this.dbFailed) return null
        try {
            return await this.dbPromise
        } catch (err) {
            this.dbFailed = true
            if (process.env.NODE_ENV !== 'production') {
                console.error("[Storage] IndexedDB unavailable, falling back:", err)
            }
            return null
        }
    }

    async getItem(key: string): Promise<string | null> {
        const db = await this.getDB()
        if (!db) return this.fallback.getItem(key)
        try {
            return await new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, "readonly")
                const store = transaction.objectStore(STORE_NAME)
                const request = store.get(key)

                request.onerror = () => reject(request.error)
                request.onsuccess = () => resolve(request.result || null)
            })
        } catch (err) {
            if (process.env.NODE_ENV !== 'production') {
                console.error("[Storage] IndexedDB getItem failed, falling back:", err)
            }
            this.dbFailed = true
            return this.fallback.getItem(key)
        }
    }

    async setItem(key: string, value: string): Promise<void> {
        const db = await this.getDB()
        if (!db) return this.fallback.setItem(key, value)
        try {
            await new Promise<void>((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, "readwrite")
                const store = transaction.objectStore(STORE_NAME)
                const request = store.put(value, key)

                request.onerror = () => reject(request.error ?? new Error("[Storage] setItem request failed"))
                request.onsuccess = () => resolve()
                transaction.onerror = () => reject(transaction.error ?? new Error("[Storage] setItem transaction failed"))
            })
        } catch (err) {
            if (process.env.NODE_ENV !== 'production') {
                console.error("[Storage] IndexedDB setItem failed, falling back:", err)
            }
            this.dbFailed = true
            await this.fallback.setItem(key, value)
        }
    }

    async removeItem(key: string): Promise<void> {
        const db = await this.getDB()
        if (!db) return this.fallback.removeItem(key)
        try {
            await new Promise<void>((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, "readwrite")
                const store = transaction.objectStore(STORE_NAME)
                const request = store.delete(key)

                request.onerror = () => reject(request.error)
                request.onsuccess = () => resolve()
            })
        } catch (err) {
            if (process.env.NODE_ENV !== 'production') {
                console.error("[Storage] IndexedDB removeItem failed, falling back:", err)
            }
            this.dbFailed = true
            await this.fallback.removeItem(key)
        }
    }

    async clear(): Promise<void> {
        const db = await this.getDB()
        if (!db) return this.fallback.clear()
        try {
            await new Promise<void>((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, "readwrite")
                const store = transaction.objectStore(STORE_NAME)
                const request = store.clear()

                request.onerror = () => reject(request.error)
                request.onsuccess = () => resolve()
            })
        } catch (err) {
            if (process.env.NODE_ENV !== 'production') {
                console.error("[Storage] IndexedDB clear failed, falling back:", err)
            }
            this.dbFailed = true
            await this.fallback.clear()
        }
    }

    async getAllKeys(): Promise<string[]> {
        const db = await this.getDB()
        if (!db) return this.fallback.getAllKeys()
        try {
            return await new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, "readonly")
                const store = transaction.objectStore(STORE_NAME)
                const request = store.getAllKeys()

                request.onerror = () => reject(request.error)
                request.onsuccess = () => resolve((request.result as string[]) || [])
            })
        } catch (err) {
            if (process.env.NODE_ENV !== 'production') {
                console.error("[Storage] IndexedDB getAllKeys failed, falling back:", err)
            }
            this.dbFailed = true
            return this.fallback.getAllKeys()
        }
    }
}

const localStorageFallback = new LocalStorageAdapter()
const baseStorage =
    typeof window !== "undefined" && window.electron?.storage
        ? new ElectronStorageAdapter(localStorageFallback)
        : new IndexedDBAdapter(localStorageFallback)

export const asyncStorage = baseStorage

/**
 * Debounced storage wrapper for Zustand persist.
 * Zustand persist calls setItem on every state change, so we coalesce writes.
 */
class DebouncedStorage implements AsyncStorage {
    private inner: AsyncStorage
    private pendingWrites = new Map<string, { value: string; timer: ReturnType<typeof setTimeout>; resolve: () => void; reject: (err: unknown) => void }>()
    private debounceMs: number

    constructor(inner: AsyncStorage, debounceMs = 2000) {
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
            existing.resolve()
        }

        return new Promise<void>((resolve, reject) => {
            const timer = setTimeout(async () => {
                this.pendingWrites.delete(key)
                try {
                    await this.inner.setItem(key, value)
                    resolve()
                } catch (err) {
                    reject(err)
                }
            }, this.debounceMs)
            this.pendingWrites.set(key, { value, timer, resolve, reject })
        })
    }

    async flush(): Promise<void> {
        const entries = Array.from(this.pendingWrites.entries())
        for (const [key, pending] of entries) {
            clearTimeout(pending.timer)
            this.pendingWrites.delete(key)
            try {
                await this.inner.setItem(key, pending.value)
                pending.resolve()
            } catch (err) {
                pending.reject(err)
            }
        }
    }
}

export const debouncedStorage = new DebouncedStorage(asyncStorage)
