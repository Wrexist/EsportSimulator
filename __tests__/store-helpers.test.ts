/**
 * Tests for store/utils/helpers — the deterministic RNG, validation,
 * and id-generation primitives used by every slice.
 *
 * These functions are tiny but central. A regression in any of them
 * (e.g. parseBoundedInt accepting NaN, computeFallbackMatchSeed losing
 * determinism, nextDeterministicId silently colliding) would cascade
 * across the whole simulation.
 */

import {
    nextRandom,
    nextRandomInt,
    nextDeterministicId,
    parseBoundedInt,
    parseBoundedNumber,
    ensureDeterministicSeed,
    computeFallbackMatchSeed,
} from "@/store/utils/helpers"

describe("nextRandom + nextRandomInt — RNG-backed determinism", () => {
    test("same lastRngSeed produces the same nextRandom sequence", () => {
        const a = { lastRngSeed: 12345, currentWeek: 1 }
        const b = { lastRngSeed: 12345, currentWeek: 1 }
        expect(nextRandom(a)).toBe(nextRandom(b))
        expect(nextRandom(a)).toBe(nextRandom(b))
    })

    test("nextRandom advances lastRngSeed (no fixed-point)", () => {
        const s = { lastRngSeed: 12345, currentWeek: 1 }
        const before = s.lastRngSeed
        nextRandom(s)
        expect(s.lastRngSeed).not.toBe(before)
    })

    test("nextRandomInt lands within [min, max] inclusive", () => {
        const s = { lastRngSeed: 42, currentWeek: 1 }
        for (let i = 0; i < 50; i++) {
            const v = nextRandomInt(s, 1, 6)
            expect(v).toBeGreaterThanOrEqual(1)
            expect(v).toBeLessThanOrEqual(6)
            expect(Number.isInteger(v)).toBe(true)
        }
    })

    test("nextRandomInt with min === max always returns that value", () => {
        const s = { lastRngSeed: 1, currentWeek: 1 }
        for (let i = 0; i < 10; i++) {
            expect(nextRandomInt(s, 7, 7)).toBe(7)
        }
    })
})

describe("nextDeterministicId — unique + reproducible ids", () => {
    test("same seed + same prefix + same parts → same id (replay-safe)", () => {
        const a = { lastRngSeed: 100, currentWeek: 5 }
        const b = { lastRngSeed: 100, currentWeek: 5 }
        const id1 = nextDeterministicId(a, "fin", "team_a")
        const id2 = nextDeterministicId(b, "fin", "team_a")
        expect(id1).toBe(id2)
    })

    test("two consecutive ids differ (RNG advances internally)", () => {
        const s = { lastRngSeed: 100, currentWeek: 5 }
        const id1 = nextDeterministicId(s, "fin", "team_a")
        const id2 = nextDeterministicId(s, "fin", "team_a")
        expect(id1).not.toBe(id2)
    })

    test("id format: prefix_{week}_{token} or prefix_{week}_{token}_{parts}", () => {
        const s = { lastRngSeed: 42, currentWeek: 7 }
        const idNoParts = nextDeterministicId(s, "evt")
        expect(idNoParts).toMatch(/^evt_7_[0-9a-z]+$/)
        const idWithParts = nextDeterministicId(s, "evt", "team_a", 99)
        expect(idWithParts).toMatch(/^evt_7_[0-9a-z]+_team_a_99$/)
    })

    test("null/undefined parts are filtered out", () => {
        const s = { lastRngSeed: 42, currentWeek: 7 }
        const id = nextDeterministicId(s, "evt", "a", null, "b", undefined, "c")
        expect(id).toMatch(/^evt_7_[0-9a-z]+_a_b_c$/)
    })
})

describe("parseBoundedInt + parseBoundedNumber", () => {
    test("parseBoundedInt rejects non-number and non-finite inputs", () => {
        expect(parseBoundedInt("abc", "field", 0, 100).ok).toBe(false)
        expect(parseBoundedInt(NaN, "field", 0, 100).ok).toBe(false)
        expect(parseBoundedInt(Infinity, "field", 0, 100).ok).toBe(false)
        expect(parseBoundedInt(null, "field", 0, 100).ok).toBe(false)
        expect(parseBoundedInt(undefined, "field", 0, 100).ok).toBe(false)
    })

    test("parseBoundedInt floors fractional input and enforces range", () => {
        const r = parseBoundedInt(42.9, "x", 0, 100)
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.value).toBe(42)
    })

    test("parseBoundedInt rejects below-min and above-max", () => {
        const below = parseBoundedInt(-1, "x", 0, 100)
        expect(below.ok).toBe(false)
        const above = parseBoundedInt(101, "x", 0, 100)
        expect(above.ok).toBe(false)
    })

    test("parseBoundedInt accepts exactly-min and exactly-max", () => {
        expect(parseBoundedInt(0, "x", 0, 100).ok).toBe(true)
        expect(parseBoundedInt(100, "x", 0, 100).ok).toBe(true)
    })

    test("parseBoundedNumber preserves fractional values (no flooring)", () => {
        const r = parseBoundedNumber(42.5, "x", 0, 100)
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.value).toBe(42.5)
    })

    test("parseBoundedNumber rejects non-finite inputs same as parseBoundedInt", () => {
        expect(parseBoundedNumber(NaN, "x", 0, 100).ok).toBe(false)
        expect(parseBoundedNumber(-Infinity, "x", 0, 100).ok).toBe(false)
    })

    test("error message includes the field label and the range", () => {
        const r = parseBoundedInt(-5, "Salary", 0, 100)
        if (!r.ok) {
            expect(r.message).toContain("Salary")
            expect(r.message).toContain("0")
            expect(r.message).toContain("100")
        }
    })
})

describe("ensureDeterministicSeed", () => {
    test("returns the existing seed when it's a positive finite number", () => {
        const s = { lastRngSeed: 100, currentWeek: 1 }
        const match = { seed: 999 }
        expect(ensureDeterministicSeed(s, match)).toBe(999)
        expect(match.seed).toBe(999) // unchanged
    })

    test("generates a new seed and stamps it onto the match when seed is missing", () => {
        const s = { lastRngSeed: 100, currentWeek: 1 }
        const match: { seed?: number } = {}
        const seed = ensureDeterministicSeed(s, match)
        expect(seed).toBeGreaterThan(0)
        expect(match.seed).toBe(seed)
    })

    test("generates a new seed when existing seed is non-positive", () => {
        const s = { lastRngSeed: 100, currentWeek: 1 }
        const match = { seed: 0 }
        const seed = ensureDeterministicSeed(s, match)
        expect(seed).toBeGreaterThan(0)
        expect(match.seed).toBe(seed)
    })

    test("generated seed is in range [1, 2147483646] (avoids 0 + max-int boundaries)", () => {
        const s = { lastRngSeed: 42, currentWeek: 1 }
        for (let i = 0; i < 20; i++) {
            const match: { seed?: number } = {}
            const seed = ensureDeterministicSeed(s, match)
            expect(seed).toBeGreaterThanOrEqual(1)
            expect(seed).toBeLessThanOrEqual(2147483646)
        }
    })
})

describe("computeFallbackMatchSeed", () => {
    test("same input → same output (deterministic FNV-1a)", () => {
        const a = computeFallbackMatchSeed("m1", 5, 3, 999)
        const b = computeFallbackMatchSeed("m1", 5, 3, 999)
        expect(a).toBe(b)
    })

    test("different match ids produce different seeds", () => {
        const a = computeFallbackMatchSeed("m1", 5, 3, 0)
        const b = computeFallbackMatchSeed("m2", 5, 3, 0)
        expect(a).not.toBe(b)
    })

    test("different weeks produce different seeds", () => {
        const a = computeFallbackMatchSeed("m1", 5, 3, 0)
        const b = computeFallbackMatchSeed("m1", 6, 3, 0)
        expect(a).not.toBe(b)
    })

    test("always returns at least 1 (matches the engine's seed contract)", () => {
        const seed = computeFallbackMatchSeed("", 0, 0, 0)
        expect(seed).toBeGreaterThanOrEqual(1)
    })
})
