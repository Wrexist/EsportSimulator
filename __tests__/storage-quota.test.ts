/**
 * Pre-Steam audit regression: a "storage full" write must surface as a FAILED
 * save, not be silently swallowed into the volatile in-memory fallback (which
 * read-back verification would still pass, then evaporate on app close).
 * See engine/storage-adapter.ts isQuotaError + setItem.
 */

import { isQuotaError, LocalStorageAdapter } from "@/engine/storage-adapter"

function quotaError(): Error {
    const e = new Error("full") as Error & { name: string }
    e.name = "QuotaExceededError"
    return e
}

function mockLocalStorage(onLargeWrite: (v: string) => void) {
    const store = new Map<string, string>()
    return {
        setItem: (k: string, v: string) => {
            if (v.length > 5) onLargeWrite(v) // probe writes are tiny ("1") and always pass
            store.set(k, v)
        },
        getItem: (k: string) => store.get(k) ?? null,
        removeItem: (k: string) => { store.delete(k) },
        clear: () => store.clear(),
        get length() { return store.size },
        key: (i: number) => [...store.keys()][i] ?? null,
    }
}

describe("storage quota handling", () => {
    describe("isQuotaError", () => {
        it("detects quota errors across engines", () => {
            expect(isQuotaError(quotaError())).toBe(true)
            expect(isQuotaError({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe(true)
            expect(isQuotaError({ code: 22 })).toBe(true)
            expect(isQuotaError({ code: 1014 })).toBe(true)
        })
        it("ignores non-quota errors and junk", () => {
            expect(isQuotaError(new Error("boom"))).toBe(false)
            expect(isQuotaError({ name: "DataError" })).toBe(false)
            expect(isQuotaError(null)).toBe(false)
            expect(isQuotaError("nope")).toBe(false)
        })
    })

    describe("LocalStorageAdapter.setItem", () => {
        const realWindow = (global as { window?: unknown }).window
        afterEach(() => { (global as { window?: unknown }).window = realWindow })

        it("propagates a quota error instead of hiding the write in volatile memory", async () => {
            const ls = mockLocalStorage(() => { throw quotaError() })
            ;(global as { window?: unknown }).window = { localStorage: ls }
            const adapter = new LocalStorageAdapter()

            await expect(adapter.setItem("save", "x".repeat(100))).rejects.toThrow()
            // crucially: it must NOT have stashed the value in the memory fallback
            expect(await adapter.getItem("save")).toBeNull()
        })

        it("degrades gracefully (no throw) on a NON-quota failure", async () => {
            // Contrast with the quota case: a transient/availability error must NOT
            // propagate — it falls back to the in-memory map so the session continues.
            const ls = mockLocalStorage(() => { throw new Error("transient") })
            ;(global as { window?: unknown }).window = { localStorage: ls }
            const adapter = new LocalStorageAdapter()

            await expect(adapter.setItem("save", "x".repeat(100))).resolves.toBeUndefined()
        })

        it("propagates quota even when the very first/small write fails (probe path)", async () => {
            // Storage so full that even a tiny write throws. setItem must surface it
            // rather than be masked by the availability probe and fall to memory.
            const ls = mockLocalStorage(() => {})
            ls.setItem = () => { throw quotaError() } // every write throws, probe-sized included
            ;(global as { window?: unknown }).window = { localStorage: ls }
            const adapter = new LocalStorageAdapter()

            await expect(adapter.setItem("save", "x")).rejects.toThrow()
            expect(await adapter.getItem("save")).toBeNull()
        })
    })
})
