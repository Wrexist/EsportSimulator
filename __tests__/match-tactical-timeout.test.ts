import { regroupLossStreak, restoreTimeoutState, spendTimeout } from '@/engine/match/manager-controls'
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

function runRound(seed: number, active: boolean, lossStreak = 5) {
    const rng = new SeededRNG(seed)
    return simulationEngineV2.simulateRound(
        rng, mk("h"), mk("a"),
        50, 50,            // base strengths (equal)
        50, 50,            // map strengths
        true,              // homeIsCT
        0, 0, regroupLossStreak(lossStreak, active), 0, // own tilt only
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
    )
}


test('timeout has no effect without losing-streak pressure, including the complete event stream', () => {
    for (const seed of [1, 42, 777, 9001]) expect(runRound(seed, false, 0)).toEqual(runRound(seed, true, 0))
})

test('regroup relieves tilt in paired actual round simulations without guaranteeing a win', () => {
    let baseline = 0, regroup = 0
    for (let seed = 1; seed <= 400; seed++) {
        baseline += Number(runRound(seed, false).winner === 'HOME')
        regroup += Number(runRound(seed, true).winner === 'HOME')
    }
    expect(regroup).toBeGreaterThan(baseline)
    expect(regroup - baseline).toBeLessThan(60)
    expect(regroup).toBeLessThan(400)
})

test('timeout charges are limited, between rounds only, and survive reload', () => {
    let state = restoreTimeoutState()
    expect(spendTimeout(state, false, 'IN_PROGRESS')).toBeNull()
    expect(spendTimeout(state, true, 'FINISHED')).toBeNull()
    state = spendTimeout(state, true, 'IN_PROGRESS')!
    expect(state).toEqual({ remaining: 1, rounds: 2 })
    expect(spendTimeout(state, true, 'IN_PROGRESS')).toBeNull()
    const restored = JSON.parse(JSON.stringify(state))
    expect(restoreTimeoutState(restored.remaining, restored.rounds)).toEqual(state)
    state = spendTimeout({ ...state, rounds: 0 }, true, 'IN_PROGRESS')!
    expect(spendTimeout({ ...state, rounds: 0 }, true, 'IN_PROGRESS')).toBeNull()
    for (const value of [-1, 3, NaN, 0.5]) expect(() => restoreTimeoutState(value, 0)).toThrow()
})
