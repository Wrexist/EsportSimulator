/**
 * Regression coverage for the scouting "fuzzy band" (Phase 5.1).
 *
 * The live scouting page showed an unscouted player's rating as [ovr-15, ovr+15]
 * — a band centered on the TRUE value, so the midpoint leaked the exact OVR.
 * fuzzyBand offsets the band center deterministically per player (keeping the
 * true value inside) so the midpoint no longer reveals it.
 */

import { fuzzyBand } from "@/engine/scouting-system"

describe("fuzzyBand", () => {
    const ids = Array.from({ length: 200 }, (_, i) => `player_${i}_abc`)

    test("the true value always falls inside the band, clamped to [0,99]", () => {
        for (const id of ids) {
            for (const ovr of [10, 35, 50, 72, 88, 95]) {
                const [min, max] = fuzzyBand(ovr, 15, id)
                expect(min).toBeLessThanOrEqual(ovr)
                expect(max).toBeGreaterThanOrEqual(ovr)
                expect(min).toBeGreaterThanOrEqual(0)
                expect(max).toBeLessThanOrEqual(99)
            }
        }
    })

    test("is deterministic for a given player id (no per-render flicker)", () => {
        expect(fuzzyBand(70, 15, "player_xyz")).toEqual(fuzzyBand(70, 15, "player_xyz"))
    })

    test("the midpoint does NOT reveal the true rating for most players (leak closed)", () => {
        const ovr = 70 // mid-range so clamping doesn't shift the midpoint
        let midpointEqualsTrue = 0
        for (const id of ids) {
            const [min, max] = fuzzyBand(ovr, 15, id)
            if (Math.round((min + max) / 2) === ovr) midpointEqualsTrue++
        }
        // Pre-fix this was 100% (band centered on true value).
        expect(midpointEqualsTrue / ids.length).toBeLessThan(0.3)
    })

    test("different players get different bands for the same rating", () => {
        const bands = new Set(ids.map(id => fuzzyBand(70, 15, id).join("-")))
        expect(bands.size).toBeGreaterThan(5)
    })
})
