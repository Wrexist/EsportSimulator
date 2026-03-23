
/**
 * Async Storage Adapter for IndexedDB
 * Substitutes localStorage to overcome quota limits (5MB -> >1GB)
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

class IndexedDBAdapter implements AsyncStorage {
    private dbPromise: Promise<IDBDatabase> | null = null
    private dbFailed = false

    constructor() {
        if (typeof window !== "undefined") {
            this.dbPromise = this.openDB().catch((err) => {
                console.error("[Storage] IndexedDB failed to open, falling back to in-memory:", err)
                this.dbFailed = true
                return null as unknown as IDBDatabase
            })
        }
    }

    private openDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            // Timeout: if IndexedDB doesn't respond in 5s, give up
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

    async getItem(key: string): Promise<string | null> {
        if (!this.dbPromise || this.dbFailed) return null
        try {
            const db = await this.dbPromise
            if (!db) return null
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, "readonly")
                const store = transaction.objectStore(STORE_NAME)
                const request = store.get(key)

                request.onerror = () => reject(request.error)
                request.onsuccess = () => resolve(request.result || null)
            })
        } catch (err) {
            console.error("[Storage] getItem failed:", err)
            return null
        }
    }

    async setItem(key: string, value: string): Promise<void> {
        if (!this.dbPromise || this.dbFailed) {
            throw new Error("[Storage] IndexedDB not available")
        }
        const db = await this.dbPromise
        if (!db) {
            throw new Error("[Storage] IndexedDB database is null")
        }
        return new Promise((resolve, reject) => {
            try {
                const transaction = db.transaction(STORE_NAME, "readwrite")
                const store = transaction.objectStore(STORE_NAME)
                const request = store.put(value, key)

                request.onerror = () => reject(request.error ?? new Error("[Storage] setItem request failed"))
                request.onsuccess = () => resolve()
                transaction.onerror = () => reject(transaction.error ?? new Error("[Storage] setItem transaction failed"))
            } catch (err) {
                reject(err)
            }
        })
    }

    async removeItem(key: string): Promise<void> {
        if (!this.dbPromise || this.dbFailed) return
        try {
            const db = await this.dbPromise
            if (!db) return
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, "readwrite")
                const store = transaction.objectStore(STORE_NAME)
                const request = store.delete(key)

                request.onerror = () => reject(request.error)
                request.onsuccess = () => resolve()
            })
        } catch (err) {
            console.error("[Storage] removeItem failed:", err)
        }
    }

    async clear(): Promise<void> {
        if (!this.dbPromise || this.dbFailed) return
        try {
            const db = await this.dbPromise
            if (!db) return
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, "readwrite")
                const store = transaction.objectStore(STORE_NAME)
                const request = store.clear()

                request.onerror = () => reject(request.error)
                request.onsuccess = () => resolve()
            })
        } catch (err) {
            console.error("[Storage] clear failed:", err)
        }
    }

    async getAllKeys(): Promise<string[]> {
        if (!this.dbPromise || this.dbFailed) return []
        try {
            const db = await this.dbPromise
            if (!db) return []
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, "readonly")
                const store = transaction.objectStore(STORE_NAME)
                const request = store.getAllKeys()

                request.onerror = () => reject(request.error)
                request.onsuccess = () => resolve((request.result as string[]) || [])
            })
        } catch (err) {
            console.error("[Storage] getAllKeys failed:", err)
            return []
        }
    }
}

export const asyncStorage = new IndexedDBAdapter()

/**
 * Debounced storage wrapper for Zustand persist.
 * Zustand persist calls setItem on EVERY state change, which for a large game
 * state (~10+ MB) creates excessive IndexedDB write transactions that interfere
 * with SaveManager's critical save operations. This wrapper coalesces rapid
 * writes into a single debounced write.
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
            // Resolve the old promise immediately (it will be superseded)
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
}

/** Debounced storage for Zustand persist — prevents flooding IndexedDB */
export const debouncedStorage = new DebouncedStorage(asyncStorage)