/**
 * MATCHENGINE-08: very bad map lines (2-14, ADR 23, KAST 33% over 15 rounds)
 * made the rating regression negative and showed 0.00. They now show the
 * soft floor; ordinary lines and the 3.00 cap are unchanged.
 */
import { SCRIPT_RATING_FLOOR, scriptLine, scriptRating } from "@/engine/match/match-stats"

describe("scriptRating floor", () => {
    test("a 2-14 line rates the floor, not 0.00", () => {
        const r = scriptRating({ kpr: 2 / 15, dpr: 14 / 15, apr: 0, adr: 22.9, kast: 33 })
        expect(r).toBe(SCRIPT_RATING_FLOOR)
        expect(r).toBeGreaterThan(0)
    })

    test("ordinary lines and the cap are untouched", () => {
        expect(scriptRating({ kpr: 0.7, dpr: 0.7, apr: 0.13, adr: 76, kast: 71 })).toBeCloseTo(1, 1)
        expect(scriptRating({ kpr: 0.4, dpr: 0.8, apr: 0.1, adr: 50, kast: 60 })).toBeGreaterThan(SCRIPT_RATING_FLOOR)
        expect(scriptRating({ kpr: 29 / 14, dpr: 3 / 14, apr: 0.2, adr: 186, kast: 100 })).toBe(3)
    })

    test("a player with no rounds still has no rating", () => {
        expect(scriptLine({ kills: 0, deaths: 0, assists: 0, headshots: 0, damage: 0, kast: 0, clutches: 0, fk: 0, fd: 0 }, 0).rating).toBe(0)
    })
})
