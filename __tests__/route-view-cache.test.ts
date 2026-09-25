import { createRouteViewCache } from "@/lib/route-view-cache"

describe("career-scoped route presentation state", () => {
    it("restores separate route filters and pagination without crossing careers", () => {
        const cache = createRouteViewCache()
        cache.set("career-a", "transfers:search", "dunk")
        cache.set("career-a", "transfers:page", 3)
        cache.set("career-a", "rankings:search", "pulsar")
        expect(cache.get("career-a", "transfers:search", "")).toBe("dunk")
        expect(cache.get("career-a", "transfers:page", 0)).toBe(3)
        expect(cache.get("career-a", "rankings:search", "")).toBe("pulsar")
        expect(cache.get("career-b", "transfers:search", "")).toBe("")
        expect(cache.get("career-b", "transfers:page", 0)).toBe(0)
    })

    it("does not retain controls from the no-career/loading screen", () => {
        const cache = createRouteViewCache()
        cache.set(null, "search", "old")
        cache.set(undefined, "search", "old")
        expect(cache.get(null, "search", "")).toBe("")
        expect(cache.get("new-career", "search", "")).toBe("")
    })

    it("preserves cleared filters and zero values while evicting old entries", () => {
        const cache = createRouteViewCache(2)
        cache.set("a", "search", "old")
        cache.set("a", "page", 0)
        cache.set("a", "search", "")
        cache.set("a", "role", null)
        expect(cache.get("a", "page", 9)).toBe(9)
        expect(cache.get("a", "search", "fallback")).toBe("")
        expect(cache.get("a", "role", "fallback")).toBeNull()
        cache.set("a", "page", 0)
        expect(cache.get("a", "page", 9)).toBe(0)
    })

    it("does not collide when IDs and fields contain separators; a fresh session starts clean", () => {
        const cache = createRouteViewCache()
        cache.set("a:b", "c", "one")
        cache.set("a", "b:c", "two")
        expect(cache.get("a:b", "c", "")).toBe("one")
        expect(cache.get("a", "b:c", "")).toBe("two")
        expect(createRouteViewCache().get("a", "b:c", "")).toBe("")
    })
})
