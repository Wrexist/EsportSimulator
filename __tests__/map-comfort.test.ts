/**
 * Map identity: every club has two strong and two weak maps of the rotation,
 * the edge counts in its rounds on that map, and its veto leans to them.
 */
import { ROTATION_MAP_POOL } from "@/data/map-pool"
import { MAP_COMFORT_STEPS, mapComfort, mapComfortLabel, teamMapComfort } from "@/engine/match/map-comfort"
import { calculateMapStrengths } from "@/engine/match/map-veto"

describe("map comfort", () => {
    test("each club: one best, one strong, three neutral, one weak, one worst; fixed per club", () => {
        for (const id of ["navi", "faze", "t_EU_3", "x"]) {
            const values = ROTATION_MAP_POOL.map(m => mapComfort(id, m)).sort((a, b) => b - a)
            expect(values).toEqual([MAP_COMFORT_STEPS[0], MAP_COMFORT_STEPS[1], 0, 0, 0, -MAP_COMFORT_STEPS[1], -MAP_COMFORT_STEPS[0]])
            expect([...teamMapComfort(id)]).toEqual([...teamMapComfort(id)])
        }
        const bests = new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map(id => [...teamMapComfort(id)].find(([, v]) => v === MAP_COMFORT_STEPS[0])![0]))
        expect(bests.size).toBeGreaterThan(2)
        expect(mapComfort(undefined, ROTATION_MAP_POOL[0])).toBe(0)
        expect(mapComfort("x", "de_unknown")).toBe(0)
        expect(mapComfortLabel(MAP_COMFORT_STEPS[0])).toBe("Best map")
        expect(mapComfortLabel(-MAP_COMFORT_STEPS[1])).toBe("Weak")
        expect(mapComfortLabel(0)).toBe("Neutral")
    })

    test("the veto ranks a club's best map above its worst", () => {
        const comfort = teamMapComfort("faze")
        const best = [...comfort].find(([, v]) => v === MAP_COMFORT_STEPS[0])![0]
        const worst = [...comfort].find(([, v]) => v === -MAP_COMFORT_STEPS[0])![0]
        const players = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, skill: 70, tactic: 70 })) as never
        const strengths = calculateMapStrengths(players, "faze")
        const plain = calculateMapStrengths(players)
        expect(strengths.get(best as never)! - plain.get(best as never)!).toBeGreaterThan(0)
        expect(strengths.get(worst as never)! - plain.get(worst as never)!).toBeLessThan(0)
    })
})
