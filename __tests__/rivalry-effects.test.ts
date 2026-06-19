/**
 * Tests for the rivalry "derby" helpers that gate gameplay effects (morale +
 * fanbase swings, pre-match framing). The intensity tiers themselves are set by
 * updateRivalries; these helpers decide which rivalries count as derbies and how
 * hard they bite.
 */

import { getRivalryBetween, isDerby, derbyMultiplier } from "@/engine/history-tracker"
import type { TeamSaveData, RivalryData } from "@/engine/save-types"

function team(rivalries?: RivalryData[]): TeamSaveData {
    return { id: "t", rivalries } as unknown as TeamSaveData
}

const riv = (opponentTeamId: string, intensity: RivalryData["intensity"]): RivalryData => ({
    opponentTeamId, intensity, matchesPlayed: 5, wins: 2, losses: 3, lastPlayed: 1,
})

describe("rivalry derby helpers", () => {
    test("getRivalryBetween finds the matching opponent, undefined otherwise", () => {
        const t = team([riv("a", "HEATED"), riv("b", "FIERCE")])
        expect(getRivalryBetween(t, "b")?.intensity).toBe("FIERCE")
        expect(getRivalryBetween(t, "z")).toBeUndefined()
    })

    test("getRivalryBetween is safe when a team has no rivalries", () => {
        expect(getRivalryBetween(team(), "a")).toBeUndefined()
    })

    test("isDerby is true only for HEATED and FIERCE", () => {
        expect(isDerby("FIERCE")).toBe(true)
        expect(isDerby("HEATED")).toBe(true)
        expect(isDerby("NEUTRAL")).toBe(false)
        expect(isDerby("FRIENDLY")).toBe(false)
        expect(isDerby(undefined)).toBe(false)
    })

    test("derbyMultiplier scales by intensity and is 1.0 for non-derby (safe to multiply unconditionally)", () => {
        expect(derbyMultiplier("FIERCE")).toBe(1.6)
        expect(derbyMultiplier("HEATED")).toBe(1.3)
        expect(derbyMultiplier("NEUTRAL")).toBe(1)
        expect(derbyMultiplier("FRIENDLY")).toBe(1)
        expect(derbyMultiplier(undefined)).toBe(1)
    })
})
