/**
 * AUDIT_UX_2026-06 B5 — live-match Tactical Timeout. The new homeTacticalBoost
 * param on simulateRound must (a) be determinism-neutral at boost 0 (same seed →
 * identical result, so quick-sim/orchestrator stay byte-identical) and (b) shift
 * the home side's round-win odds upward when positive.
 */

import { simulationEngineV2 } from "@/engine/match-simulation"
import { SeededRNG } from "@/engine/rng"
import type { Player } from "@/types"
import { PlayerRole } from "@/types/enums"

function mk(prefix: string): Player[] {
    return Array.from({ length: 5 }, (_, i) => ({
        id: `${prefix}${i}`, nickname: `${prefix}${i}`, role: PlayerRole.RIFLER,
        skill: 60, rifle: 60, awp: 50, pistol: 55, grenades: 50, creativity: 50,
        clutch: 50, tactic: 50, leader: 45, teamwork: 55, reaction: 60, eyesight: 60,
        fatigue: 0, form: 70, morale: 70, energy: 100, maxEnergy: 100,
    } as unknown as Player))
}

function runRound(seed: number, boost: number) {
    const rng = new SeededRNG(seed)
    return simulationEngineV2.simulateRound(
        rng, mk("h"), mk("a"),
        50, 50,            // base strengths (equal)
        50, 50,            // map strengths
        true,              // homeIsCT
        0, 0, 0, 0,        // streaks
        5,                 // roundNum
        {}, {},            // economies
        "FULL", "FULL",    // strategies
        false,             // isHighPressure
        undefined, undefined,             // teams
        undefined, undefined,             // ct/t team ids
        undefined,                        // customTactics
        0, 0,                             // momentum scores
        undefined, undefined,             // staff
        undefined,                        // mapId
        undefined,                        // matchStage
        undefined, undefined, undefined,  // cached stress ×2 + player map
        boost,                            // homeTacticalBoost
    )
}

describe("tactical timeout boost", () => {
    it("is determinism-neutral at boost 0 (same seed → identical winner)", () => {
        for (const seed of [1, 42, 777, 9001]) {
            expect(runRound(seed, 0).winner).toBe(runRound(seed, 0).winner)
        }
    })

    it("shifts the home side's round-win rate upward when positive", () => {
        let zeroWins = 0
        let boostedWins = 0
        const N = 80
        for (let seed = 1; seed <= N; seed++) {
            if (runRound(seed, 0).winner === "HOME") zeroWins++
            if (runRound(seed, 0.3).winner === "HOME") boostedWins++
        }
        expect(boostedWins).toBeGreaterThan(zeroWins)
    })
})
