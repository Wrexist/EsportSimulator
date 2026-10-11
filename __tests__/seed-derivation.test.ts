/**
 * Revamp Phase 0: match/round/bracket seeds are hashed, not added.
 * `seed + map * 1000 + round` made seed N's round 2 the same stream as seed
 * N+1's round 1, double-elim children used parent + 1, and playoff seeds
 * were the constants 101..302 every season.
 */
import { deriveSeed, createMatchRNG } from '@/engine/rng'
import { legacyRoundSeed, legacyStatsSeed } from '@/engine/match/legacy-series'
import { bracketMatchSeed, childBracketSeed } from '@/engine/tournament/seeding-helpers'

test('deriveSeed is deterministic, in range and separates its parts', () => {
    expect(deriveSeed(42, 'm1', 0, 3)).toBe(deriveSeed(42, 'm1', 0, 3))
    expect(deriveSeed('1', '23')).not.toBe(deriveSeed('12', '3'))
    for (let i = 0; i < 500; i++) {
        const s = deriveSeed(i, 'x')
        expect(s).toBeGreaterThanOrEqual(1)
        expect(s).toBeLessThanOrEqual(2147483646)
        expect(Number.isInteger(s)).toBe(true)
    }
})

test('adjacent match seeds never share a round stream', () => {
    let collisions = 0
    for (let seed = 1; seed <= 500; seed++) {
        for (let round = 2; round <= 30; round++) {
            if (legacyRoundSeed(seed, 'm', 0, round) === legacyRoundSeed(seed + 1, 'm', 0, round - 1)) collisions++
        }
        // Map 1 round r used to equal map 0 round r + 1000 of the same seed family.
        expect(legacyRoundSeed(seed, 'm', 1, 1)).not.toBe(legacyRoundSeed(seed + 1000, 'm', 0, 1))
    }
    expect(collisions).toBe(0)
    expect(createMatchRNG(legacyRoundSeed(101, 'm', 0, 2)).next()).not.toBe(createMatchRNG(legacyRoundSeed(102, 'm', 0, 1)).next())
})

test('two matches saved with the same seed (e.g. scrims at seed 0) get different rounds', () => {
    expect(legacyRoundSeed(0, 'scrim_a', 0, 1)).not.toBe(legacyRoundSeed(0, 'scrim_b', 0, 1))
    expect(legacyStatsSeed(0, 'scrim_a')).not.toBe(legacyStatsSeed(0, 'scrim_b'))
})

test('playoff seeds change with the career RNG state and week; lower-bracket seeds are not parent + 1', () => {
    const season1 = bracketMatchSeed({ lastRngSeed: 123456, currentWeek: 40 }, 'major_qf_1')
    const season2 = bracketMatchSeed({ lastRngSeed: 987654, currentWeek: 92 }, 'major_qf_1')
    expect(season1).not.toBe(season2)
    expect(bracketMatchSeed({ lastRngSeed: 123456, currentWeek: 40 }, 'major_qf_1')).toBe(season1)
    expect(bracketMatchSeed({ lastRngSeed: 123456, currentWeek: 40 }, 'major_qf_2')).not.toBe(season1)
    const parent = 5000
    const child = childBracketSeed(parent, 'g_lower_r1_0')
    expect(child).not.toBe(parent + 1)
    expect(childBracketSeed(parent, 'g_lower_r1_0')).toBe(child)
    expect(childBracketSeed(undefined, 'g_lower_r1_0')).toBeGreaterThan(0)
})
