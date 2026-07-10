/**
 * Coverage for engine/match/map-veto.ts.
 *
 * Pins the extracted veto subsystem from Phase I1. Tests cover:
 *  - calculateMapStrengths: skill/tactic weighting per map type, empty
 *    roster fallback
 *  - selectMapForVeto: deterministic top-pick with analyst-level noise
 *  - simulateMapVeto: full 5-step BO3 ladder produces 3 unique maps
 *    and 5 veto events
 *
 * Determinism is critical: same seed must produce identical vetoes
 * across runs, otherwise saved matches would re-roll differently on
 * load.
 */

import {
    calculateMapStrengths,
    selectMapForVeto,
    simulateMapVeto,
} from "@/engine/match/map-veto"
import { SeededRNG } from "@/engine/rng"
import { MapId } from "@/types"
import type { Player, Analyst } from "@/types"

function makePlayer(overrides: Partial<Player> = {}): Player {
    return {
        id: "p1", nickname: "p1", firstName: "P", lastName: "1",
        age: 22, nationality: "US", role: "RIFLER",
        skill: 60, rifle: 60, awp: 50, pistol: 55, grenades: 50,
        creativity: 50, clutch: 50, tactic: 50, leader: 45, teamwork: 55,
        reaction: 60, eyesight: 60, fatigue: 0, form: 70, morale: 75,
        energy: 100, maxEnergy: 100,
        ...overrides,
    } as unknown as Player
}

function makeAnalyst(level: number): Analyst {
    return { id: "an1", name: "A", type: "ANALYST", level, salary: 0, contractWeeksRemaining: 52 } as unknown as Analyst
}

describe("calculateMapStrengths", () => {
    test("empty roster returns every map at the 50 default", () => {
        const result = calculateMapStrengths([])
        expect(result.size).toBe(8)
        for (const value of result.values()) {
            expect(value).toBe(50)
        }
    })

    test("aim-heavy roster scores higher on Sandstone/Mirage than Nuke/Overpass", () => {
        // High skill, low tactic → aim maps favored.
        const players = Array.from({ length: 5 }, () => makePlayer({ skill: 90, tactic: 30 }))
        const result = calculateMapStrengths(players)

        const sandstone = result.get(MapId.SANDSTONE)!
        const nuke = result.get(MapId.NUKE)!
        expect(sandstone).toBeGreaterThan(nuke)
    })

    test("tactic-heavy roster scores higher on Nuke/Overpass than Sandstone/Mirage", () => {
        const players = Array.from({ length: 5 }, () => makePlayer({ skill: 30, tactic: 90 }))
        const result = calculateMapStrengths(players)

        const sandstone = result.get(MapId.SANDSTONE)!
        const nuke = result.get(MapId.NUKE)!
        expect(nuke).toBeGreaterThan(sandstone)
    })

    test("balanced roster produces non-degenerate strengths for all 8 maps", () => {
        const players = Array.from({ length: 5 }, () => makePlayer({ skill: 65, tactic: 65 }))
        const result = calculateMapStrengths(players)

        expect(result.size).toBe(8)
        for (const value of result.values()) {
            expect(value).toBeGreaterThan(0)
            expect(value).toBeLessThan(100)
        }
    })
})

describe("selectMapForVeto", () => {
    test("level-5 analyst picks the strict top map (zero noise wins)", () => {
        const strengths = new Map<MapId, number>([
            [MapId.SANDSTONE, 90],
            [MapId.MIRAGE, 50],
            [MapId.INFERNO, 70],
        ])
        const available: MapId[] = [MapId.SANDSTONE, MapId.MIRAGE, MapId.INFERNO]

        // At analyst level 5, noise is ±2 — far less than the 20-point gap
        // between SANDSTONE and INFERNO.
        for (let seed = 1; seed <= 20; seed++) {
            const pick = selectMapForVeto(new SeededRNG(seed), available, strengths, "PICK", 5)
            expect(pick).toBe(MapId.SANDSTONE)
        }
    })

    test("deterministic: same seed yields the same pick", () => {
        const strengths = new Map<MapId, number>([
            [MapId.SANDSTONE, 60],
            [MapId.MIRAGE, 60],
            [MapId.INFERNO, 60],
        ])
        const available: MapId[] = [MapId.SANDSTONE, MapId.MIRAGE, MapId.INFERNO]

        const pickA = selectMapForVeto(new SeededRNG(42), available, strengths, "PICK", 1)
        const pickB = selectMapForVeto(new SeededRNG(42), available, strengths, "PICK", 1)
        expect(pickA).toBe(pickB)
    })

    test("returns a map from the available pool", () => {
        const strengths = new Map<MapId, number>([[MapId.ANUBIS, 80]])
        const available: MapId[] = [MapId.ANUBIS]
        const pick = selectMapForVeto(new SeededRNG(1), available, strengths, "BAN", 3)
        expect(pick).toBe(MapId.ANUBIS)
    })
})

describe("simulateMapVeto", () => {
    const home = Array.from({ length: 5 }, () => makePlayer({ skill: 70, tactic: 60 }))
    const away = Array.from({ length: 5 }, () => makePlayer({ skill: 65, tactic: 65 }))

    test("produces exactly 5 veto events and 3 unique maps for the match", () => {
        const result = simulateMapVeto(
            new SeededRNG(7), "home", "away", home, away,
            makeAnalyst(3), makeAnalyst(3),
        )

        expect(result.veto.length).toBe(5)
        expect(result.maps.length).toBe(3)

        // All maps unique.
        expect(new Set(result.maps).size).toBe(3)
    })

    test("veto order is ban / ban / pick / pick / system pick", () => {
        const result = simulateMapVeto(
            new SeededRNG(7), "home", "away", home, away,
            makeAnalyst(3), makeAnalyst(3),
        )

        expect(result.veto[0].action).toBe("BAN")
        expect(result.veto[0].teamId).toBe("home")
        expect(result.veto[1].action).toBe("BAN")
        expect(result.veto[1].teamId).toBe("away")
        expect(result.veto[2].action).toBe("PICK")
        expect(result.veto[2].teamId).toBe("home")
        expect(result.veto[3].action).toBe("PICK")
        expect(result.veto[3].teamId).toBe("away")
        expect(result.veto[4].action).toBe("PICK")
        expect(result.veto[4].teamId).toBe("SYSTEM")
    })

    test("deterministic: same seed produces identical veto + map list", () => {
        const a = simulateMapVeto(new SeededRNG(123), "h", "a", home, away)
        const b = simulateMapVeto(new SeededRNG(123), "h", "a", home, away)

        expect(a.maps).toEqual(b.maps)
        expect(a.veto.map(v => `${v.teamId}:${v.action}:${v.map}`))
            .toEqual(b.veto.map(v => `${v.teamId}:${v.action}:${v.map}`))
    })

    // Regression: each team's BAN precision must be driven by ITS OWN analyst,
    // not the opponent's (the two levels were swapped). A team with a top
    // analyst should ban the enemy's strongest map cleanly; the opponent's
    // (weak) analyst must NOT govern that ban.
    test("home's BAN precision tracks HOME's analyst level, not away's", () => {
        // 8-map strength tables. AWAY is strongest on SANDSTONE by a gap of 6 —
        // larger than a level-5 analyst's ±2 noise (so L5 always bans it) but
        // well within a level-1 analyst's ±10 noise (so L1 flips across seeds).
        const awayStrengths = new Map<MapId, number>(
            [MapId.SANDSTONE, MapId.MIRAGE, MapId.INFERNO, MapId.NUKE,
             MapId.OVERPASS, MapId.VERTIGO, MapId.ANCIENT, MapId.ANUBIS]
                .map(m => [m, m === MapId.SANDSTONE ? 66 : 60]),
        )
        const homeStrengths = new Map<MapId, number>(
            [MapId.SANDSTONE, MapId.MIRAGE, MapId.INFERNO, MapId.NUKE,
             MapId.OVERPASS, MapId.VERTIGO, MapId.ANCIENT, MapId.ANUBIS]
                .map(m => [m, 60]),
        )

        // Home has the elite analyst (L5); away has the rookie (L1). With the
        // args wired correctly, EVERY seed's home ban is away's true strongest.
        for (let seed = 1; seed <= 40; seed++) {
            const result = simulateMapVeto(
                new SeededRNG(seed), "home", "away", home, away,
                makeAnalyst(5), makeAnalyst(1),
                homeStrengths, awayStrengths,
            )
            const homeBan = result.veto.find(v => v.action === "BAN" && v.teamId === "home")
            expect(homeBan?.map).toBe(MapId.SANDSTONE)
        }
    })
})
