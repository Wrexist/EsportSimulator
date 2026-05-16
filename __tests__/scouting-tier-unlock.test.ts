/**
 * Coverage for isScoutingTierUnlocked — verifies the parallel manager-level
 * unlock path added in Phase G7. Pre-G7, scouting tiers gated solely on
 * academy facility level. Now they unlock if EITHER the academy level OR
 * the manager level meets the threshold.
 */

import { isScoutingTierUnlocked } from "@/engine/academy-constants"

describe("isScoutingTierUnlocked", () => {
    test("LOCAL is unlocked by either academy 1+ or manager 1+ (always reachable)", () => {
        expect(isScoutingTierUnlocked("LOCAL", 1)).toBe(true)
        // Academy 0 + manager 1 satisfies the manager path. The slice-level
        // caller still hard-blocks academy 0 before this check fires.
        expect(isScoutingTierUnlocked("LOCAL", 0, 1)).toBe(true)
        expect(isScoutingTierUnlocked("LOCAL", 0, 0)).toBe(false)
    })

    test("REGIONAL: academy 2 path", () => {
        expect(isScoutingTierUnlocked("REGIONAL", 2, 1)).toBe(true)
        expect(isScoutingTierUnlocked("REGIONAL", 1, 1)).toBe(false)
    })

    test("REGIONAL: manager level 5 path unlocks even at low academy", () => {
        expect(isScoutingTierUnlocked("REGIONAL", 1, 5)).toBe(true)
        expect(isScoutingTierUnlocked("REGIONAL", 0, 5)).toBe(true)
        // L4 still not enough.
        expect(isScoutingTierUnlocked("REGIONAL", 1, 4)).toBe(false)
    })

    test("INTERNATIONAL: academy 4 path", () => {
        expect(isScoutingTierUnlocked("INTERNATIONAL", 4, 1)).toBe(true)
        expect(isScoutingTierUnlocked("INTERNATIONAL", 3, 1)).toBe(false)
    })

    test("INTERNATIONAL: manager level 10 path unlocks at any academy level", () => {
        expect(isScoutingTierUnlocked("INTERNATIONAL", 1, 10)).toBe(true)
        expect(isScoutingTierUnlocked("INTERNATIONAL", 0, 10)).toBe(true)
        expect(isScoutingTierUnlocked("INTERNATIONAL", 1, 9)).toBe(false)
    })

    test("either gate alone is sufficient — both met is also fine", () => {
        expect(isScoutingTierUnlocked("INTERNATIONAL", 4, 10)).toBe(true)
    })

    test("backwards compatible: omitting manager level defaults to 1", () => {
        // Pre-G7 call signature still works.
        expect(isScoutingTierUnlocked("LOCAL", 1)).toBe(true)
        expect(isScoutingTierUnlocked("REGIONAL", 2)).toBe(true)
        expect(isScoutingTierUnlocked("REGIONAL", 1)).toBe(false)
    })
})
