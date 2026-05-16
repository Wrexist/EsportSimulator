/**
 * Coverage for engine/match/auto-tactics.ts.
 *
 * Pins the cash-to-strategy mapping the live-match auto-tactics
 * toggle uses each non-pistol round. The thresholds matter
 * directly to player experience — wrong mapping = AI buys wrong
 * weapons against the player.
 */

import {
    selectAutoStrategy,
    averageEconomyCash,
    pickAutoStrategy,
} from "@/engine/match/auto-tactics"

describe("selectAutoStrategy", () => {
    test("≥ $4500 → FULL", () => {
        expect(selectAutoStrategy(4501)).toBe("FULL")
        expect(selectAutoStrategy(10_000)).toBe("FULL")
    })

    test("$2001 to $4500 → SEMIBUY", () => {
        expect(selectAutoStrategy(2001)).toBe("SEMIBUY")
        expect(selectAutoStrategy(4500)).toBe("SEMIBUY")
    })

    test("$1401 to $2000 → FORCE", () => {
        expect(selectAutoStrategy(1401)).toBe("FORCE")
        expect(selectAutoStrategy(2000)).toBe("FORCE")
    })

    test("≤ $1400 → ECO", () => {
        expect(selectAutoStrategy(0)).toBe("ECO")
        expect(selectAutoStrategy(1400)).toBe("ECO")
    })

    test("negative cash is treated as ECO (defensive)", () => {
        expect(selectAutoStrategy(-1000)).toBe("ECO")
    })

    test("threshold boundary: 4500 stays SEMIBUY, 4501 escalates to FULL", () => {
        expect(selectAutoStrategy(4500)).toBe("SEMIBUY")
        expect(selectAutoStrategy(4501)).toBe("FULL")
    })
})

describe("averageEconomyCash", () => {
    test("returns 0 for empty economy", () => {
        expect(averageEconomyCash({})).toBe(0)
    })

    test("floors the average", () => {
        const econ = {
            p1: { cash: 1000 },
            p2: { cash: 1001 },
            p3: { cash: 1002 },
        }
        expect(averageEconomyCash(econ)).toBe(1001) // 1001.0 floored
    })

    test("treats missing cash as 0", () => {
        const econ = {
            p1: { cash: 2000 },
            p2: {} as { cash?: number },
            p3: { cash: 1000 },
        }
        // (2000 + 0 + 1000) / 3 = 1000
        expect(averageEconomyCash(econ)).toBe(1000)
    })

    test("skips null/undefined entries when computing the count", () => {
        const econ: Record<string, { cash?: number } | undefined> = {
            p1: { cash: 4000 },
            p2: undefined,
            p3: { cash: 4000 },
        }
        // Only 2 valid entries — average is 4000, not 8000/3.
        expect(averageEconomyCash(econ)).toBe(4000)
    })

    test("single-player economy returns that player's cash", () => {
        expect(averageEconomyCash({ solo: { cash: 5000 } })).toBe(5000)
    })
})

describe("pickAutoStrategy (compose)", () => {
    test("rich team → FULL", () => {
        const econ = {
            p1: { cash: 5000 }, p2: { cash: 5000 }, p3: { cash: 5000 },
            p4: { cash: 5000 }, p5: { cash: 5000 },
        }
        expect(pickAutoStrategy(econ)).toBe("FULL")
    })

    test("mid-cash team → SEMIBUY", () => {
        const econ = {
            p1: { cash: 3000 }, p2: { cash: 3000 }, p3: { cash: 3000 },
            p4: { cash: 3000 }, p5: { cash: 3000 },
        }
        expect(pickAutoStrategy(econ)).toBe("SEMIBUY")
    })

    test("broke team → ECO", () => {
        const econ = {
            p1: { cash: 800 }, p2: { cash: 800 }, p3: { cash: 800 },
            p4: { cash: 800 }, p5: { cash: 800 },
        }
        expect(pickAutoStrategy(econ)).toBe("ECO")
    })

    test("empty economy → ECO (safe default)", () => {
        expect(pickAutoStrategy({})).toBe("ECO")
    })
})
