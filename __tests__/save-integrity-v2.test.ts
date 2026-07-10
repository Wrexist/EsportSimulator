/**
 * SaveIntegrityManager signature verification across the three formats:
 *   - legacy (8-char FNV, no prefix)
 *   - v2 (device-bound SHA-256 of installSecret|payload)
 *   - v3 (portable SHA-256 of payload)
 *
 * Focus: the v2 CROSS-DEVICE migration path. A v2 signature is bound to the
 * originating install's secret, so it can never be recomputed on a different
 * install. The old fallback compared the 64-char SHA-256 digest against an
 * 8-char FNV hash — a comparison that can never be true — so every legitimate
 * v2 save failed to load on a new device (e.g. after a Steam Cloud sync).
 * verifyIntegrityHash must now accept a cross-device v2 save so it migrates
 * and is re-signed as v3 on the next write.
 */

import { SaveIntegrityManager } from "@/engine/save-integrity"
import { STORAGE_KEYS } from "@/engine/save-types"
import type { AsyncStorage } from "@/engine/storage-adapter"

class MemoryStorage implements AsyncStorage {
    public store = new Map<string, string>()
    async getItem(key: string): Promise<string | null> {
        return this.store.has(key) ? (this.store.get(key) ?? null) : null
    }
    async setItem(key: string, value: string): Promise<void> {
        this.store.set(key, value)
    }
    async removeItem(key: string): Promise<void> {
        this.store.delete(key)
    }
    async clear(): Promise<void> {
        this.store.clear()
    }
    async getAllKeys(): Promise<string[]> {
        return Array.from(this.store.keys())
    }
}

function makePayload(): Record<string, unknown> {
    return { saveId: "s1", saveName: "Legacy Career", currentWeek: 17, foo: "bar" }
}

describe("SaveIntegrityManager — v2 cross-device migration", () => {
    test("a v2 save signed on device A verifies on device A (same install secret)", async () => {
        const storageA = new MemoryStorage()
        const mgrA = new SaveIntegrityManager(storageA)
        const save = makePayload()
        // computeDeviceBoundIntegrityHash is private; call through for setup.
        save.integrityHash = await (mgrA as any).computeDeviceBoundIntegrityHash(save)
        expect(typeof save.integrityHash).toBe("string")
        expect((save.integrityHash as string).startsWith("v2:")).toBe(true)

        expect(await mgrA.verifyIntegrityHash(save)).toBe(true)
    })

    test("a v2 save signed on device A now verifies on device B (different install secret)", async () => {
        const storageA = new MemoryStorage()
        const mgrA = new SaveIntegrityManager(storageA)
        const save = makePayload()
        save.integrityHash = await (mgrA as any).computeDeviceBoundIntegrityHash(save)

        // Device B has its own, different install secret (fresh storage). It
        // cannot recompute A's device-bound hash — but the save is a legitimate
        // legacy v2 copy and must still load so it can migrate to v3.
        const storageB = new MemoryStorage()
        const mgrB = new SaveIntegrityManager(storageB)
        // Sanity: B's secret differs from A's, so the v2 digest genuinely can't match.
        expect(await storageB.getItem(STORAGE_KEYS.INSTALL_SECRET)).toBeNull()

        expect(await mgrB.verifyIntegrityHash(save)).toBe(true)
    })

    test("a v3 save with a tampered payload is still rejected (portable hash unchanged)", async () => {
        const storage = new MemoryStorage()
        const mgr = new SaveIntegrityManager(storage)
        const save = makePayload()
        save.integrityHash = await mgr.computeIntegrityHash(save)
        expect((save.integrityHash as string).startsWith("v3:")).toBe(true)

        // Tamper the payload without re-signing — v3 verification must fail.
        ;(save as any).foo = "TAMPERED"
        expect(await mgr.verifyIntegrityHash(save)).toBe(false)
    })

    test("an unsigned save is always rejected", async () => {
        const storage = new MemoryStorage()
        const mgr = new SaveIntegrityManager(storage)
        expect(await mgr.verifyIntegrityHash(makePayload())).toBe(false)
    })
})
