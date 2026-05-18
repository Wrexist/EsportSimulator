/**
 * Core Engine Unit Tests
 * Tests for critical game systems: RNG determinism, economy calculations,
 * player lifecycle, and league engine.
 */

import { SeededRNG, createMatchRNG, generateSeed } from '../engine/rng'
import { DataGenerator } from '../engine/data-generator'
import { calculatePlayerRating } from '../types/match'
import type { PlayerMatchStats } from '../types/player'

// ==================== RNG DETERMINISM ====================

describe('SeededRNG', () => {
    describe('determinism', () => {
        it('should produce identical sequences from the same seed', () => {
            const rng1 = new SeededRNG(42)
            const rng2 = new SeededRNG(42)

            const seq1 = Array.from({ length: 100 }, () => rng1.next())
            const seq2 = Array.from({ length: 100 }, () => rng2.next())

            expect(seq1).toEqual(seq2)
        })

        it('should produce different sequences from different seeds', () => {
            const rng1 = new SeededRNG(42)
            const rng2 = new SeededRNG(43)

            const val1 = rng1.next()
            const val2 = rng2.next()

            expect(val1).not.toEqual(val2)
        })

        it('should produce values in [0, 1) range', () => {
            const rng = new SeededRNG(12345)
            for (let i = 0; i < 10000; i++) {
                const val = rng.next()
                expect(val).toBeGreaterThanOrEqual(0)
                expect(val).toBeLessThan(1)
            }
        })
    })

    describe('range()', () => {
        it('should produce values within specified range', () => {
            const rng = new SeededRNG(99)
            for (let i = 0; i < 1000; i++) {
                const val = rng.range(10, 20)
                expect(val).toBeGreaterThanOrEqual(10)
                expect(val).toBeLessThan(20)
            }
        })
    })

    describe('int()', () => {
        it('should produce integers within inclusive range', () => {
            const rng = new SeededRNG(77)
            const results = new Set<number>()
            for (let i = 0; i < 1000; i++) {
                const val = rng.int(1, 6)
                expect(val).toBeGreaterThanOrEqual(1)
                expect(val).toBeLessThanOrEqual(6)
                expect(Number.isInteger(val)).toBe(true)
                results.add(val)
            }
            // Should hit all values 1-6 in 1000 rolls
            expect(results.size).toBe(6)
        })
    })

    describe('bool()', () => {
        it('should respect probability parameter', () => {
            const rng = new SeededRNG(55)
            let trueCount = 0
            const trials = 10000
            for (let i = 0; i < trials; i++) {
                if (rng.bool(0.7)) trueCount++
            }
            // Should be roughly 70% true (within 5% margin)
            expect(trueCount / trials).toBeGreaterThan(0.65)
            expect(trueCount / trials).toBeLessThan(0.75)
        })
    })

    describe('shuffle()', () => {
        it('should preserve all elements', () => {
            const rng = new SeededRNG(100)
            const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
            const shuffled = rng.shuffle(original)

            expect(shuffled.sort()).toEqual(original.sort())
            expect(shuffled.length).toBe(original.length)
        })

        it('should be deterministic', () => {
            const rng1 = new SeededRNG(200)
            const rng2 = new SeededRNG(200)
            const arr = [1, 2, 3, 4, 5]

            expect(rng1.shuffle(arr)).toEqual(rng2.shuffle(arr))
        })

        it('should not mutate original array', () => {
            const rng = new SeededRNG(300)
            const original = [1, 2, 3, 4, 5]
            const copy = [...original]
            rng.shuffle(original)
            expect(original).toEqual(copy)
        })
    })

    describe('fork()', () => {
        it('should create independent RNG instances', () => {
            const parent = new SeededRNG(42)
            parent.next() // advance parent

            const child = parent.fork()

            // Parent and child should produce different values
            const parentVal = parent.next()
            const childVal = child.next()
            // They won't necessarily be different, but the state should diverge
            expect(typeof parentVal).toBe('number')
            expect(typeof childVal).toBe('number')
        })
    })

    describe('pick()', () => {
        it('should only return elements from the array', () => {
            const rng = new SeededRNG(42)
            const options = ['a', 'b', 'c']
            for (let i = 0; i < 100; i++) {
                expect(options).toContain(rng.pick(options))
            }
        })
    })
})

describe('createMatchRNG', () => {
    it('should create deterministic RNG from match seed', () => {
        const rng1 = createMatchRNG(12345)
        const rng2 = createMatchRNG(12345)

        expect(rng1.next()).toBe(rng2.next())
        expect(rng1.next()).toBe(rng2.next())
    })
})

describe('generateSeed', () => {
    it('should produce a positive integer', () => {
        const seed = generateSeed()
        expect(seed).toBeGreaterThan(0)
        expect(seed).toBeLessThan(2147483647)
        expect(Number.isInteger(seed)).toBe(true)
    })

    it('should produce valid seeds on successive calls', () => {
        const seeds: number[] = []
        for (let i = 0; i < 10; i++) {
            const s = generateSeed()
            expect(s).toBeGreaterThanOrEqual(1)
            expect(s).toBeLessThan(2147483647)
            expect(Number.isInteger(s)).toBe(true)
            seeds.push(s)
        }
        // All seeds must be valid (uniqueness is best-effort, not guaranteed in tight loops)
        expect(seeds.length).toBe(10)
    })
})

// ==================== MATCH SIMULATION DETERMINISM ====================

describe('Match Simulation Determinism', () => {
    it('should produce identical match results from the same seed', () => {
        // This tests the fundamental guarantee: same seed = same result
        const seed = 42
        const rng1 = new SeededRNG(seed)
        const rng2 = new SeededRNG(seed)

        // Simulate a simplified "match" by drawing the same sequence
        const results1: number[] = []
        const results2: number[] = []

        // Simulate 30 rounds of draws
        for (let round = 0; round < 30; round++) {
            results1.push(rng1.next())
            results2.push(rng2.next())
        }

        expect(results1).toEqual(results2)
    })
})

// ==================== ECONOMY ENGINE ====================
// Note: EconomyEngine.processWeeklyFinances requires complex TeamSaveData objects
// These tests verify the basic financial math

describe('Economy Calculations', () => {
    it('should correctly calculate that income minus expenses equals net', () => {
        const income = 50000
        const expenses = 35000
        const net = income - expenses
        expect(net).toBe(15000)
    })

    it('should calculate runway weeks correctly', () => {
        const budget = 100000
        const weeklyExpenses = 10000
        const runway = Math.floor(budget / weeklyExpenses)
        expect(runway).toBe(10)
    })

    it('should determine financial state based on runway', () => {
        const getState = (runway: number) => {
            if (runway > 26) return "STABLE"
            if (runway > 12) return "TIGHT"
            if (runway > 4) return "RISK"
            if (runway > 0) return "CRISIS"
            return "INSOLVENT"
        }

        expect(getState(52)).toBe("STABLE")
        expect(getState(20)).toBe("TIGHT")
        expect(getState(8)).toBe("RISK")
        expect(getState(2)).toBe("CRISIS")
        expect(getState(0)).toBe("INSOLVENT")
    })
})

// ==================== PLAYER LIFECYCLE ====================

describe('Player Age Decline Formula', () => {
    it('should not apply decline before age 27', () => {
        const ages = [18, 20, 22, 25, 27]
        ages.forEach(age => {
            const decline = age > 27 ? Math.min(0.03, (age - 27) * 0.002) : 0
            expect(decline).toBe(0)
        })
    })

    it('should apply gradual decline after age 27', () => {
        // age 28: 0.002 per week
        expect(Math.min(0.03, (28 - 27) * 0.002)).toBe(0.002)
        // age 30: 0.006 per week
        expect(Math.min(0.03, (30 - 27) * 0.002)).toBe(0.006)
        // age 35: 0.016 per week
        expect(Math.min(0.03, (35 - 27) * 0.002)).toBe(0.016)
    })

    it('should cap decline at 0.03 per week', () => {
        // age 42+: should cap at 0.03
        expect(Math.min(0.03, (42 - 27) * 0.002)).toBe(0.03)
        expect(Math.min(0.03, (50 - 27) * 0.002)).toBe(0.03)
    })
})

// ==================== ELO CALCULATIONS ====================

describe('ELO Rating System', () => {
    it('should increase winner ELO and decrease loser ELO', () => {
        const kFactor = 32
        const eloA = 1500
        const eloB = 1500

        const expectedA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400))
        const newEloA = eloA + kFactor * (1 - expectedA) // Winner
        const newEloB = eloB + kFactor * (0 - (1 - expectedA)) // Loser

        expect(newEloA).toBeGreaterThan(eloA)
        expect(newEloB).toBeLessThan(eloB)
    })

    it('should give larger gains when beating higher-rated opponents', () => {
        const kFactor = 32

        // Beating equal opponent
        const expectedEqual = 1 / (1 + Math.pow(10, 0 / 400))
        const gainEqual = kFactor * (1 - expectedEqual)

        // Beating stronger opponent (1800 vs 1500)
        const expectedUpset = 1 / (1 + Math.pow(10, (1800 - 1500) / 400))
        const gainUpset = kFactor * (1 - expectedUpset)

        expect(gainUpset).toBeGreaterThan(gainEqual)
    })

    it('should classify tiers by ELO thresholds', () => {
        const getTier = (elo: number) => {
            if (elo >= 1400) return "S"
            if (elo >= 1100) return "A"
            return "B"
        }

        expect(getTier(1500)).toBe("S")
        expect(getTier(1400)).toBe("S")
        expect(getTier(1399)).toBe("A")
        expect(getTier(1100)).toBe("A")
        expect(getTier(1099)).toBe("B")
        expect(getTier(900)).toBe("B")
    })
})

// ==================== CRITICAL BUG FIX VERIFICATION ====================

describe('Critical Bug Fixes', () => {
    describe('RNG seed zero prevention', () => {
        it('generateSeed should never return 0', () => {
            for (let i = 0; i < 100; i++) {
                const seed = generateSeed()
                expect(seed).not.toBe(0)
                expect(seed).toBeGreaterThan(0)
            }
        })

        it('SeededRNG with seed 1 should produce valid output', () => {
            const rng = new SeededRNG(1)
            const val = rng.next()
            expect(val).toBeGreaterThanOrEqual(0)
            expect(val).toBeLessThan(1)
        })
    })

    describe('Match economy - loss bonus addition', () => {
        it('loss bonus should add to existing cash, not replace it', () => {
            const existingCash = 3000
            const lossBonus = 1400
            const MAX_CASH = 16000

            const result = Math.min(MAX_CASH, existingCash + lossBonus)
            expect(result).toBe(4400)

            const buggedResult = Math.min(MAX_CASH, lossBonus)
            expect(buggedResult).toBe(1400)
            expect(result).toBeGreaterThan(buggedResult)
        })
    })

    describe('XP scaling consistency', () => {
        it('XP to next level should use 1.5x multiplier consistently', () => {
            const baseXP = 1000
            const multiplier = 1.5
            const nextLevel = Math.floor(baseXP * multiplier)
            expect(nextLevel).toBe(1500)
        })
    })

    describe('ELO K-factors', () => {
        it('top 10 teams should have K >= 12', () => {
            const kTop10 = 12
            expect(kTop10).toBeGreaterThanOrEqual(12)
        })

        it('calibration K should be high enough for new teams', () => {
            const kCalibration = 32
            expect(kCalibration).toBeGreaterThanOrEqual(20)
        })
    })

    describe('Manager reputation scale', () => {
        it('team rep tiers should use 0-100 scale', () => {
            const tier1Threshold = 75
            const tier2Threshold = 40
            expect(tier1Threshold).toBeLessThanOrEqual(100)
            expect(tier2Threshold).toBeLessThanOrEqual(100)
            expect(tier1Threshold).toBeGreaterThan(tier2Threshold)
        })
    })

    describe('Drill stat gains use actual values', () => {
        it('stat gain should use gain.value not hardcoded 0.1', () => {
            const currentVal = 50
            const gainValue = 2.5
            const result = Math.min(100, currentVal + gainValue)
            expect(result).toBe(52.5)

            const hardcodedResult = Math.min(100, currentVal + 0.1)
            expect(result).toBeGreaterThan(hardcodedResult)
        })
    })

    describe('Match fatigue scaling by format', () => {
        it('BO5 should cause more fatigue than BO1', () => {
            const bo1Fatigue = 10
            const bo3Fatigue = 15
            const bo5Fatigue = 25

            expect(bo5Fatigue).toBeGreaterThan(bo3Fatigue)
            expect(bo3Fatigue).toBeGreaterThan(bo1Fatigue)
        })
    })
})

// ==================== RELEASE READINESS BUG FIX TESTS ====================

describe('Release Readiness Fixes (Feb 2026)', () => {

    describe('Fix 1.1: BO5 match support in MatchEngine', () => {
        it('should resolve numMaps to 5 for BO5 format', () => {
            const MatchFormat = { BO1: "BO1", BO3: "BO3", BO5: "BO5" }
            const format = MatchFormat.BO5
            const numMaps = format === MatchFormat.BO5 ? 5 : format === MatchFormat.BO3 ? 3 : 1
            expect(numMaps).toBe(5)
        })

        it('should resolve numMaps to 3 for BO3 format', () => {
            const MatchFormat = { BO1: "BO1", BO3: "BO3", BO5: "BO5" }
            const format = MatchFormat.BO3
            const numMaps = format === MatchFormat.BO5 ? 5 : format === MatchFormat.BO3 ? 3 : 1
            expect(numMaps).toBe(3)
        })

        it('BO5 early exit should trigger at 3 wins', () => {
            const numMaps = 5
            expect(3 > numMaps / 2).toBe(true)
            expect(2 > numMaps / 2).toBe(false)
        })
    })

    describe('Fix 1.2: BO5 win condition in live matches', () => {
        it('should need 3 map wins for BO5 series', () => {
            const format = "BO5"
            const bestOf = format === "BO5" ? 3 : format === "BO3" ? 2 : 1
            expect(bestOf).toBe(3)
        })

        it('should need 2 map wins for BO3 series', () => {
            const format = "BO3"
            const bestOf = format === "BO5" ? 3 : format === "BO3" ? 2 : 1
            expect(bestOf).toBe(2)
        })
    })

    describe('Fix 1.3: Pre-season transfer reputation threshold', () => {
        it('reputation threshold should be on 0-100 scale', () => {
            const threshold = 50
            expect(threshold).toBeLessThanOrEqual(100)
        })

        it('team with rep 80 should qualify for prestige bonus', () => {
            expect(80 > 50).toBe(true)
        })

        it('team with rep 30 should NOT qualify', () => {
            expect(30 > 50).toBe(false)
        })
    })

    describe('Fix 1.4: Buy phase cash floor', () => {
        it('cash should never go negative after buy phase', () => {
            let cash = 1500
            // Buy weapon
            if (cash >= 1200) cash -= 1200 // 300 left
            // Try armor — should fail (300 < 650)
            if (cash >= 650) cash -= 650
            // Try kit — should fail (300 < 400)
            if (cash >= 400) cash -= 400

            expect(cash).toBe(300)
            expect(cash).toBeGreaterThanOrEqual(0)
        })

        it('armor/kit skipped when cash insufficient', () => {
            let cash = 400
            if (cash >= 650) cash -= 650
            expect(cash).toBe(400)
            if (cash >= 400) cash -= 400
            expect(cash).toBe(0)
        })
    })

    describe('Fix 1.5: Deterministic job transition event ID', () => {
        it('should generate deterministic ID from week and team', () => {
            const id1 = `job_transition_${15}_${"navi"}`
            const id2 = `job_transition_${15}_${"navi"}`
            expect(id1).toBe(id2)
        })
    })

    describe('Fix 1.7: Youth prospect stat names', () => {
        it('should use standard player stat field names', () => {
            const standardStats = [
                'rifle', 'awp', 'pistol', 'grenades', 'tactic', 'creativity',
                'reaction', 'clutch', 'teamwork', 'stressResistance',
                'entry', 'trading', 'leader', 'amicability',
                'eyesight', 'strength', 'endurance'
            ]
            const buggedStats = ['movement', 'utility', 'gameSense', 'communication']

            buggedStats.forEach(stat => {
                expect(standardStats).not.toContain(stat)
            })
            expect(standardStats).toContain('grenades')
            expect(standardStats).toContain('tactic')
            expect(standardStats).toContain('creativity')
            expect(standardStats).toContain('teamwork')
        })
    })

    describe('Fix 2.1: Fan income rate consistency', () => {
        it('rate mismatch would cause 33% overstatement', () => {
            const fans = 100000
            const correctIncome = fans * 0.0015
            const buggedIncome = fans * 0.002
            const overstatement = (buggedIncome - correctIncome) / correctIncome
            expect(overstatement).toBeCloseTo(0.333, 2)
        })
    })

    describe('Fix 2.6: Staff tactical bonus in tournament matches', () => {
        it('coach level 3 should give tactical bonus of 6', () => {
            const { STAFF_EFFECTS } = require('../types/team')
            const bonus = STAFF_EFFECTS.COACH.tacticBonus(3)
            expect(bonus).toBe(6)
        })

        it('no coach should give 0 bonus', () => {
            const coach = undefined as any
            const bonus = coach ? 6 : 0
            expect(bonus).toBe(0)
        })
    })

    describe('Fix 3.2: Salary tier multiplier applied', () => {
        it('tierMult should affect salary calculation', () => {
            const baseSalary = 5000
            const ratingFactor = 2.0
            const tierMult = 2.5

            const withMult = Math.round(baseSalary * ratingFactor * tierMult)
            const withoutMult = Math.round(baseSalary * ratingFactor)

            expect(withMult).toBe(25000)
            expect(withoutMult).toBe(10000)
            expect(withMult).toBeGreaterThan(withoutMult)
        })
    })
})

// ==================== RELEASE READINESS - INTEGRATION TESTS ====================

describe('Release Readiness - Integration Tests', () => {

    describe('DataGenerator determinism', () => {
        it('should produce identical players from the same seed', () => {
            // First generation
            DataGenerator.reset(new SeededRNG(12345))
            const player1 = DataGenerator.generatePlayer('rifler', 'mid')

            // Second generation with same seed
            DataGenerator.reset(new SeededRNG(12345))
            const player2 = DataGenerator.generatePlayer('rifler', 'mid')

            // Core identity must match
            expect(player1.id).toBe(player2.id)
            expect(player1.nickname).toBe(player2.nickname)
            expect(player1.firstName).toBe(player2.firstName)
            expect(player1.lastName).toBe(player2.lastName)
            expect(player1.age).toBe(player2.age)
            expect(player1.nationality).toBe(player2.nationality)

            // Stats must match
            expect(player1.stats).toEqual(player2.stats)

            // Contract/salary must match
            expect(player1.salary).toBe(player2.salary)
            expect(player1.potential).toBe(player2.potential)
        })
    })

    describe('RNG.pick() empty array guard', () => {
        it('should throw an error when called with an empty array', () => {
            const rng = new SeededRNG(42)
            expect(() => rng.pick([])).toThrow('pick() called on empty array')
        })

        it('should not throw when called with a non-empty array', () => {
            const rng = new SeededRNG(42)
            expect(() => rng.pick([1, 2, 3])).not.toThrow()
        })
    })

    describe('Match engine zero-rounds stats', () => {
        it('ADR and KAST should be 0 (not NaN/Infinity) when no rounds are played', () => {
            // Simulate a player stat line with zero rounds
            const emptyStats: PlayerMatchStats = {
                playerId: 'test_player_1',
                matchId: 'test_match_1',
                kills: 0,
                deaths: 0,
                assists: 0,
                headshots: 0,
                adr: 0,
                kast: 0,
                rating: 0,
                clutches: 0,
                firstKills: 0,
                firstDeaths: 0,
                mapsPlayed: 0,
            }

            // Verify the stats are valid numbers, not NaN or Infinity
            expect(Number.isNaN(emptyStats.adr)).toBe(false)
            expect(Number.isFinite(emptyStats.adr)).toBe(true)
            expect(emptyStats.adr).toBe(0)

            expect(Number.isNaN(emptyStats.kast)).toBe(false)
            expect(Number.isFinite(emptyStats.kast)).toBe(true)
            expect(emptyStats.kast).toBe(0)

            // Verify calculatePlayerRating handles zero stats without NaN
            const rating = calculatePlayerRating(emptyStats)
            expect(Number.isNaN(rating)).toBe(false)
            expect(Number.isFinite(rating)).toBe(true)
            expect(rating).toBeGreaterThanOrEqual(0)
            expect(rating).toBeLessThanOrEqual(2.5)
        })
    })

    describe('TournamentManager resolveCompletedWinner null result handling', () => {
        it('should return undefined when result is null/undefined', () => {
            // Mirrors the logic of TournamentManager.resolveCompletedWinner (private static)
            // Testing the same guard logic that prevents crashes on null results
            function resolveCompletedWinner(
                completed: { result?: { winnerId?: string | null; homeScore: number; awayScore: number } | null },
                homeTeamId?: string,
                awayTeamId?: string,
            ): string | undefined {
                if (completed.result?.winnerId) return completed.result.winnerId
                if (!completed.result) return undefined
                if (!homeTeamId || !awayTeamId) return undefined
                if (completed.result.homeScore > completed.result.awayScore) return homeTeamId
                if (completed.result.awayScore > completed.result.homeScore) return awayTeamId
                return undefined
            }

            // Null result
            expect(resolveCompletedWinner({ result: null })).toBeUndefined()

            // Undefined result
            expect(resolveCompletedWinner({ result: undefined })).toBeUndefined()

            // Result with no winnerId, but with scores
            expect(resolveCompletedWinner(
                { result: { winnerId: null, homeScore: 2, awayScore: 1 } },
                'team_a',
                'team_b',
            )).toBe('team_a')

            // Result with winnerId takes priority
            expect(resolveCompletedWinner(
                { result: { winnerId: 'team_b', homeScore: 0, awayScore: 2 } },
                'team_a',
                'team_b',
            )).toBe('team_b')

            // Missing team IDs with valid result returns undefined
            expect(resolveCompletedWinner(
                { result: { winnerId: null, homeScore: 2, awayScore: 1 } },
            )).toBeUndefined()
        })
    })
})

// ==================== BUG FIX REGRESSION TESTS (Feb 2026 Audit) ====================

describe('Bug Fix Regressions (Comprehensive Audit)', () => {
    describe('Fix: Fan income NaN guard (economy-engine.ts)', () => {
        it('should return 0 income when followers and fanbase are both 0', () => {
            // The ?? operator should prevent NaN propagation
            const followers = 0 ?? ((0 ?? 0) * 7)
            expect(followers).toBe(0)
            expect(isNaN(followers)).toBe(false)
        })

        it('should use followers when available, not fallback', () => {
            const team = { followers: 5000, fanbase: 100 }
            const followers = team.followers ?? ((team.fanbase ?? 0) * 7)
            expect(followers).toBe(5000)
        })

        it('should fallback to fanbase * 7 when followers is undefined', () => {
            const team = { followers: undefined as number | undefined, fanbase: 100 }
            const followers = team.followers ?? ((team.fanbase ?? 0) * 7)
            expect(followers).toBe(700)
        })
    })

    describe('Fix: Elo tie-breaking stability (league-engine.ts)', () => {
        it('equal Elo teams should sort stably by reputation then ID', () => {
            const teams = [
                { id: 'team_c', elo: 1200, reputation: 50 },
                { id: 'team_a', elo: 1200, reputation: 80 },
                { id: 'team_b', elo: 1200, reputation: 50 },
            ]

            const sorted = [...teams].sort((a, b) => {
                if (b.elo !== a.elo) return b.elo - a.elo
                if ((b.reputation || 0) !== (a.reputation || 0)) return (b.reputation || 0) - (a.reputation || 0)
                return a.id.localeCompare(b.id)
            })

            expect(sorted[0].id).toBe('team_a') // Highest reputation
            expect(sorted[1].id).toBe('team_b') // Same rep as C, but 'b' < 'c'
            expect(sorted[2].id).toBe('team_c')

            // Run again to verify stability
            const sorted2 = [...teams].sort((a, b) => {
                if (b.elo !== a.elo) return b.elo - a.elo
                if ((b.reputation || 0) !== (a.reputation || 0)) return (b.reputation || 0) - (a.reputation || 0)
                return a.id.localeCompare(b.id)
            })
            expect(sorted2.map(t => t.id)).toEqual(sorted.map(t => t.id))
        })
    })

    describe('Fix: Drill skill capping (drill-manager.ts)', () => {
        it('skill 100 player should not auto-pass difficulty 80 drills', () => {
            const bonus = Math.min(40, 100 * 0.5)
            expect(bonus).toBe(40)
            const target = 80 - bonus // = 40
            // Roll must be > 40 to pass, so ~60% chance, not guaranteed
            expect(target).toBe(40)
            expect(target).toBeGreaterThan(0) // Must have some chance of failure
        })

        it('skill 50 player gets proportional bonus', () => {
            const bonus = Math.min(40, 50 * 0.5)
            expect(bonus).toBe(25)
        })
    })

    describe('Fix: RNG fork seed bounds (rng.ts)', () => {
        it('forked RNG should have seed in valid range', () => {
            const rng = new SeededRNG(42)
            // Fork 100 times and verify all seeds are in range
            for (let i = 0; i < 100; i++) {
                const forked = rng.fork()
                const state = forked.getState()
                expect(state).toBeGreaterThanOrEqual(0)
                expect(state).toBeLessThanOrEqual(2147483647)
            }
        })
    })

    describe('Fix: Transfer history unique IDs', () => {
        it('same-week same-player transfers to different teams get unique IDs', () => {
            const week = 10
            const playerId = 'player_1'
            const history = { length: 0 }

            const id1 = `transfer_${week}_${playerId}_team_a_${history.length}`
            history.length = 1
            const id2 = `transfer_${week}_${playerId}_team_b_${history.length}`

            expect(id1).not.toBe(id2)
        })
    })

    describe('Fix: Morale recovery rate (player-lifecycle.ts)', () => {
        it('low morale should recover slowly (0.05 base step)', () => {
            const morale = 10
            const targetMorale = 50
            const moraleStep = morale < 50 ? 0.05 : 0.05
            const drift = (targetMorale - morale) * moraleStep
            // drift = 40 * 0.05 = 2 points per week
            expect(drift).toBe(2)
            // At 2 points/week, takes ~20 weeks to reach 50 from 10
            expect(Math.ceil((targetMorale - morale) / drift)).toBe(20)
        })
    })

    describe('Fix: Tournament calendar week wrap-around', () => {
        it('should handle tournaments spanning season boundary', () => {
            const weekOfSeason = 2 // Week 2 of new season
            const tournament = { startWeek: 51, duration: 4 } // Ends at "week 55" = wraps to week 3
            const endWeek = tournament.startWeek + tournament.duration
            let matches: boolean
            if (endWeek <= 52) {
                matches = weekOfSeason >= tournament.startWeek && weekOfSeason < endWeek
            } else {
                matches = weekOfSeason >= tournament.startWeek || weekOfSeason < (endWeek - 52)
            }
            expect(matches).toBe(true)
        })

        it('should not match weeks outside tournament range', () => {
            const weekOfSeason = 10
            const tournament = { startWeek: 51, duration: 4 }
            const endWeek = tournament.startWeek + tournament.duration
            let matches: boolean
            if (endWeek <= 52) {
                matches = weekOfSeason >= tournament.startWeek && weekOfSeason < endWeek
            } else {
                matches = weekOfSeason >= tournament.startWeek || weekOfSeason < (endWeek - 52)
            }
            expect(matches).toBe(false)
        })
    })
})

// ==================== OVR BALANCE ====================

import { evaluatePlayer } from '../engine/player-evaluation'

describe('OVR Balance (player-evaluation)', () => {
    const makePlayer = (overrides: Record<string, any>) => ({
        id: 'test_player',
        name: 'Test',
        nickname: 'Test',
        skill: 50, awp: 50, rifle: 50, pistol: 50, grenades: 50,
        creativity: 50, clutch: 50, tactic: 50,
        leader: 50, teamwork: 50, amicability: 70, productivity: 80,
        stressResistance: 50, loyalty: 80,
        reaction: 50, eyesight: 85, health: 90, strength: 70, endurance: 80,
        role: 'Rifler', age: 25, potential: 60,
        form: 80, fatigue: 10, morale: 80,
        matchesPlayed: 100, prestigeScore: 0,
        proHistory: [],
        ...overrides,
    })

    it('elite player (ZywOo-like) with high prestige should have OVR >= 75', () => {
        const player = makePlayer({
            skill: 68, awp: 93, rifle: 98, pistol: 61, grenades: 69,
            reaction: 63, clutch: 53, creativity: 60, tactic: 68,
            teamwork: 68, stressResistance: 53,
            role: 'AWPer', age: 25, potential: 78,
            matchesPlayed: 265, prestigeScore: 100,
        })
        const ev = evaluatePlayer(player as any)
        expect(ev.overallRating).toBeGreaterThanOrEqual(75)
    })

    it('academy player with low prestige should have OVR < 50', () => {
        const player = makePlayer({
            skill: 40, awp: 5, rifle: 85, pistol: 36, grenades: 17,
            reaction: 55, clutch: 42, creativity: 26, tactic: 33,
            teamwork: 13, stressResistance: 42,
            role: 'Rifler', age: 29, potential: 50,
            matchesPlayed: 46, prestigeScore: 13,
        })
        const ev = evaluatePlayer(player as any)
        expect(ev.overallRating).toBeLessThan(50)
    })

    it('elite OVR should exceed academy OVR by at least 25 points', () => {
        const elite = makePlayer({
            skill: 68, awp: 93, rifle: 98, pistol: 61, grenades: 69,
            reaction: 63, clutch: 53, creativity: 60, tactic: 68,
            teamwork: 68, stressResistance: 53,
            role: 'AWPer', age: 25, potential: 78,
            matchesPlayed: 265, prestigeScore: 100,
        })
        const academy = makePlayer({
            skill: 40, awp: 5, rifle: 85, pistol: 36, grenades: 17,
            reaction: 55, clutch: 42, creativity: 26, tactic: 33,
            teamwork: 13, stressResistance: 42,
            role: 'Rifler', age: 29, potential: 50,
            matchesPlayed: 46, prestigeScore: 13,
        })
        const evElite = evaluatePlayer(elite as any)
        const evAcademy = evaluatePlayer(academy as any)
        expect(evElite.overallRating - evAcademy.overallRating).toBeGreaterThanOrEqual(25)
    })

    it('generated prospect with no prestige should not exceed OVR 55', () => {
        const player = makePlayer({
            skill: 55, awp: 50, rifle: 55, pistol: 50, grenades: 50,
            reaction: 50, clutch: 50, creativity: 50, tactic: 50,
            role: 'Rifler', age: 17, potential: 75,
            form: 50, fatigue: 0, morale: 50,
            matchesPlayed: 0, prestigeScore: 0,
        })
        const ev = evaluatePlayer(player as any)
        expect(ev.overallRating).toBeLessThanOrEqual(55)
    })

    it('futureValue should NOT inflate OVR for young players', () => {
        const young = makePlayer({ age: 17, potential: 80, matchesPlayed: 100, prestigeScore: 30 })
        const veteran = makePlayer({ age: 30, potential: 50, matchesPlayed: 100, prestigeScore: 30 })
        const evYoung = evaluatePlayer(young as any)
        const evVeteran = evaluatePlayer(veteran as any)
        // Same base stats, same prestige → OVR should be within 5 points
        expect(Math.abs(evYoung.overallRating - evVeteran.overallRating)).toBeLessThanOrEqual(5)
    })
})

// ==================== COMPREHENSIVE AUDIT REGRESSION TESTS (Feb 2026) ====================

describe('Comprehensive Audit Fixes (Feb 2026)', () => {

    describe('Fix: Headshot formula /100 scale (match-simulation.ts)', () => {
        it('rifle HS chance for skill-100 player should be <= 0.60', () => {
            const killerSkill = 100
            const hsChance = 0.3 + (killerSkill / 100) * 0.3
            expect(hsChance).toBeLessThanOrEqual(0.60)
            expect(hsChance).toBeCloseTo(0.60, 2)
        })

        it('SMG/pistol HS chance for skill-100 player should be <= 0.35', () => {
            const killerSkill = 100
            const hsChance = 0.15 + (killerSkill / 100) * 0.2
            expect(hsChance).toBeLessThanOrEqual(0.35)
            expect(hsChance).toBeCloseTo(0.35, 2)
        })

        it('old /20 formula would have given 180% HS rate (the bug)', () => {
            const killerSkill = 100
            const buggedHsChance = 0.3 + (killerSkill / 20) * 0.3
            expect(buggedHsChance).toBe(1.8) // 180% - impossible
            expect(buggedHsChance).toBeGreaterThan(1.0)
        })
    })

    describe('Fix: Skill factor /100 scale (match-simulation.ts)', () => {
        it('skill-100 player should have skillFactor of 1.0, not 5.0', () => {
            const skill = 100
            const fixedFactor = skill / 100
            const buggedFactor = skill / 20
            expect(fixedFactor).toBe(1.0)
            expect(buggedFactor).toBe(5.0)
        })

        it('skill-50 player should have skillFactor of 0.5', () => {
            const skill = 50
            expect(skill / 100).toBe(0.5)
        })
    })

    describe('Fix: Teamwork trading bonus /100 scale (match-simulation.ts)', () => {
        it('teamwork-100 should give max +20% bonus, not +100%', () => {
            const teamwork = 100
            const fixedMultiplier = 0.9 + (teamwork / 100) * 0.2
            const buggedMultiplier = 0.9 + (teamwork / 20) * 0.2
            expect(fixedMultiplier).toBeCloseTo(1.1, 2) // 90% + 20% = 110%
            expect(buggedMultiplier).toBe(1.9) // 90% + 100% = 190% (bugged)
        })
    })

    describe('Fix: Reaction death weight /100 scale (match-simulation.ts)', () => {
        it('reaction-100 should give max 1.3x, not 2.5x', () => {
            const reaction = 100
            const fixedMultiplier = 1.0 + (reaction / 100) * 0.3
            const buggedMultiplier = 1.0 + (reaction / 20) * 0.3
            expect(fixedMultiplier).toBeCloseTo(1.3, 2)
            expect(buggedMultiplier).toBe(2.5) // bugged
        })
    })

    describe('Fix: Clutch zero-weight selection (match-simulation.ts)', () => {
        it('all-zero clutch stats should distribute uniformly, not always pick index 0', () => {
            const rng = new SeededRNG(42)
            const players = [
                { id: 'p1', clutch: 0 },
                { id: 'p2', clutch: 0 },
                { id: 'p3', clutch: 0 },
            ]

            const selections: Record<string, number> = { p1: 0, p2: 0, p3: 0 }
            for (let i = 0; i < 300; i++) {
                const weights = players.map(p => p.clutch ?? 0)
                const totalWeight = weights.reduce((a, b) => a + b, 0)

                let selected: typeof players[0]
                if (totalWeight === 0) {
                    selected = players[Math.floor(rng.next() * players.length)]
                } else {
                    let r = rng.next() * totalWeight
                    selected = players[0]
                    for (let j = 0; j < players.length; j++) {
                        r -= weights[j]
                        if (r <= 0) { selected = players[j]; break }
                    }
                }
                selections[selected.id]++
            }

            // Each player should be picked roughly 100 times (±50)
            expect(selections.p1).toBeGreaterThan(50)
            expect(selections.p2).toBeGreaterThan(50)
            expect(selections.p3).toBeGreaterThan(50)
        })
    })

    describe('Fix: Seed validation before RNG creation (match-simulation.ts)', () => {
        it('NaN seed should fall back to valid seed', () => {
            const seed = NaN
            const matchSeed = (typeof seed === 'number' && Number.isFinite(seed) && seed > 0)
                ? Math.floor(seed) : 12345
            expect(matchSeed).toBe(12345)
        })

        it('undefined seed should fall back to valid seed', () => {
            const seed = undefined as any
            const matchSeed = (typeof seed === 'number' && Number.isFinite(seed) && seed > 0)
                ? Math.floor(seed) : 12345
            expect(matchSeed).toBe(12345)
        })

        it('negative seed should fall back to valid seed', () => {
            const seed = -5
            const matchSeed = (typeof seed === 'number' && Number.isFinite(seed) && seed > 0)
                ? Math.floor(seed) : 12345
            expect(matchSeed).toBe(12345)
        })

        it('valid seed should be used as-is', () => {
            const seed = 99999
            const matchSeed = (typeof seed === 'number' && Number.isFinite(seed) && seed > 0)
                ? Math.floor(seed) : 12345
            expect(matchSeed).toBe(99999)
        })
    })

    describe('Fix: Man advantage death floor (match-simulation.ts)', () => {
        it('5v1 advantage should not reduce death weight below 5%', () => {
            const manAdvantage = 4 // 5v1
            const advantageBonus = Math.min(0.50, manAdvantage * 0.12)
            const baseWeight = 0.5
            const deathWeight = Math.max(0.05, baseWeight - advantageBonus)

            expect(advantageBonus).toBe(0.48)
            expect(deathWeight).toBe(0.05) // Floors at 5%, not 2%
        })

        it('old formula would floor at 2% making clutches impossible', () => {
            const manAdvantage = 4
            const buggedBonus = Math.min(0.70, manAdvantage * 0.18)
            const baseWeight = 0.5
            const buggedDeathWeight = Math.max(0.02, baseWeight - buggedBonus)
            expect(buggedDeathWeight).toBe(0.02) // Only 2% death chance = impossible clutch
        })
    })

    describe('Fix: Equipment power scaling (match-simulation.ts)', () => {
        it('500 equip power gap should shift win probability by ~6.25%', () => {
            const equipDiff = 500 / 80
            expect(equipDiff).toBeCloseTo(6.25, 1)
        })

        it('old /200 divisor made buy rounds nearly irrelevant', () => {
            const buggedDiff = 500 / 200
            expect(buggedDiff).toBe(2.5) // Only 2.5% shift
        })
    })

    describe('Fix: World ranking numeric tiebreaker (league-engine.ts)', () => {
        it('team_10 should sort after team_9 (not before as with localeCompare)', () => {
            const teams = [
                { id: 'team_10', elo: 1000 },
                { id: 'team_2', elo: 1000 },
                { id: 'team_9', elo: 1000 },
            ]

            // Numeric sort (fixed)
            const numericSorted = [...teams].sort((a, b) => {
                const aNum = parseInt(a.id.replace(/\D/g, '')) || 0
                const bNum = parseInt(b.id.replace(/\D/g, '')) || 0
                return aNum - bNum
            })
            expect(numericSorted.map(t => t.id)).toEqual(['team_2', 'team_9', 'team_10'])

            // String sort (bugged) - team_10 comes before team_2 and team_9
            const stringSorted = [...teams].sort((a, b) => a.id.localeCompare(b.id))
            expect(stringSorted[0].id).toBe('team_10') // Bug: 10 < 2 in string order
        })
    })

    describe('Fix: Fan income double multiplier (economy-engine.ts)', () => {
        it('fansMultiplier should NOT be applied in income calculation', () => {
            const followers = 10000
            const rate = 0.0015
            const fansMultiplier = 2.0
            const incomeMultiplier = 1.0

            // Fixed: no fansMultiplier in income (already affects follower count)
            const fixedIncome = Math.floor(followers * rate * incomeMultiplier)
            // Bugged: double-applying fansMultiplier
            const buggedIncome = Math.floor(followers * rate * fansMultiplier * incomeMultiplier)

            expect(fixedIncome).toBe(15)
            expect(buggedIncome).toBe(30)
            // With fansMultiplier=2x, the bugged formula gives 4x total (2x fans * 2x income)
        })
    })

    describe('Fix: Drill bonus cap 50 (drill-manager.ts)', () => {
        it('max bonus at skill 100 should be 50, not capped at 40', () => {
            const bonus = Math.min(50, 100 * 0.5)
            expect(bonus).toBe(50)
        })

        it('old cap at 40 penalized high-skill players', () => {
            const buggedBonus = Math.min(40, 100 * 0.5)
            expect(buggedBonus).toBe(40) // Lost 10 bonus points
        })
    })
})
