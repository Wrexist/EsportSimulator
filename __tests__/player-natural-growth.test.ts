/**
 * Young players develop toward potential every week (AI + free agents too) so
 * the player's trained squad doesn't run away and trivially dominate by S3.
 */
import { PlayerLifecycleManager } from "@/engine/player-lifecycle"
import { SeededRNG } from "@/engine/rng"

function youngPlayer(over: Record<string, unknown> = {}) {
    return {
        age: 18, fatigue: 0, energy: 100, maxEnergy: 100, morale: 70, form: 70,
        reaction: 50, skill: 50, rifle: 50, clutch: 50, tactic: 50, awp: 50,
        potential: 90,
        ...over,
    } as never
}

// Run many deterministic weeks and report net skill change across core stats.
function simulateSeasons(player: Record<string, number>, weeks: number, seed = 1) {
    const rng = new SeededRNG(seed)
    for (let w = 0; w < weeks; w++) {
        PlayerLifecycleManager.processWeeklyUpdates(player as never, 1, w + 1, 0, rng)
    }
}

describe("natural youth growth", () => {
    test("a high-potential teenager gains stats over a season; never exceeds potential", () => {
        const p = youngPlayer() as unknown as Record<string, number>
        const before = p.skill + p.rifle + p.reaction + p.clutch + p.tactic + p.awp
        simulateSeasons(p, 52)
        const after = p.skill + p.rifle + p.reaction + p.clutch + p.tactic + p.awp
        expect(after).toBeGreaterThan(before) // developed
        for (const s of ["skill", "rifle", "reaction", "clutch", "tactic", "awp"]) {
            expect(p[s]).toBeLessThanOrEqual(90) // capped at potential
        }
    })

    test("a player already at potential does not grow", () => {
        const p = youngPlayer({ skill: 90, rifle: 90, reaction: 90, clutch: 90, tactic: 90, awp: 90 }) as unknown as Record<string, number>
        simulateSeasons(p, 52)
        expect(p.skill).toBe(90)
    })

    test("an older player (age 28) gets no youth growth", () => {
        const p = youngPlayer({ age: 28, skill: 60, potential: 95 }) as unknown as Record<string, number>
        const before = p.skill + p.rifle + p.reaction + p.clutch
        simulateSeasons(p, 52)
        // Only decline path applies at 28+, never the youth-growth path.
        expect(p.skill + p.rifle + p.reaction + p.clutch).toBeLessThanOrEqual(before)
    })

    test("deterministic for the same seed", () => {
        const a = youngPlayer() as unknown as Record<string, number>
        const b = youngPlayer() as unknown as Record<string, number>
        simulateSeasons(a, 52, 42)
        simulateSeasons(b, 52, 42)
        expect(a.skill).toBe(b.skill)
    })
})
