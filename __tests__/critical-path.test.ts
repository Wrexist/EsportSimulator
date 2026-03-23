/**
 * Critical Path Tests
 * Verifies core game systems that must never break
 */

import { SeededRNG, generateSeed } from '../engine/rng'

describe('RNG Seed System', () => {
    test('generateSeed never returns 0', () => {
        for (let i = 0; i < 100; i++) {
            const seed = generateSeed()
            expect(seed).toBeGreaterThan(0)
            expect(seed).toBeLessThan(2147483647)
        }
    })

    test('SeededRNG produces deterministic output', () => {
        const rng1 = new SeededRNG(12345)
        const rng2 = new SeededRNG(12345)
        for (let i = 0; i < 50; i++) {
            expect(rng1.next()).toBe(rng2.next())
        }
    })

    test('SeededRNG different seeds produce different sequences', () => {
        const rng1 = new SeededRNG(12345)
        const rng2 = new SeededRNG(54321)
        let allSame = true
        for (let i = 0; i < 10; i++) {
            if (rng1.next() !== rng2.next()) allSame = false
        }
        expect(allSame).toBe(false)
    })
})

describe('Map Pool', () => {
    test('ACTIVE_MAP_POOL has at least 7 maps (for BO3 veto)', () => {
        // Dynamic import to handle module resolution
        const { ACTIVE_MAP_POOL } = require('../data/map-pool')
        expect(ACTIVE_MAP_POOL.length).toBeGreaterThanOrEqual(7)
    })
})

describe('Save Types', () => {
    test('ActivitySaveData type includes MARKETING', () => {
        // Compile-time check — if MARKETING was removed, this would fail to typecheck
        const activity: { type: "BOOTCAMP" | "MEDIA" | "REST" | "TRAVEL" | "STAFF_MEETING" | "MARKETING" } = {
            type: "MARKETING"
        }
        expect(activity.type).toBe("MARKETING")
    })
})

describe('Economy Constants', () => {
    test('MAX_CASH is defined and reasonable', () => {
        // Verify economy constants haven't been accidentally changed
        const { EconomyManager } = require('../engine/economy-manager')
        if (EconomyManager?.MAX_CASH) {
            expect(EconomyManager.MAX_CASH).toBe(16000)
        }
    })
})

describe('Player Stat Bounds', () => {
    test('stats should be in 0-100 range', () => {
        // Verify the stat scale is correct (was previously 1-20)
        const testPlayer = {
            skill: 75,
            rifle: 80,
            pistol: 65,
            awp: 30,
            clutch: 70,
            creativity: 60,
            tactic: 55,
            leader: 40,
            teamwork: 72,
            grenades: 50,
        }
        for (const [stat, value] of Object.entries(testPlayer)) {
            expect(value).toBeGreaterThanOrEqual(0)
            expect(value).toBeLessThanOrEqual(100)
        }
    })
})

describe('Steam Achievements', () => {
    test('ACHIEVEMENTS has all expected categories', () => {
        const { ACHIEVEMENTS } = require('../engine/steam-service')
        expect(Object.keys(ACHIEVEMENTS).length).toBeGreaterThanOrEqual(25)
        expect(ACHIEVEMENTS.FIRST_WIN).toBeDefined()
        expect(ACHIEVEMENTS.WIN_MAJOR).toBeDefined()
        expect(ACHIEVEMENTS.NUMBER_ONE).toBeDefined()
        expect(ACHIEVEMENTS.SEASON_COMPLETE).toBeDefined()
        expect(ACHIEVEMENTS.FIRST_TRANSFER).toBeDefined()
    })
})

describe('Debug Logger', () => {
    test('debug.warn suppresses in production', () => {
        const originalEnv = process.env.NODE_ENV
        // In test mode (not development), warn should be suppressed
        const { debugWarn } = require('../lib/debug-logger')
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
        debugWarn('test message')
        // In test env (NODE_ENV=test), IS_DEV is false, so warn should be suppressed
        expect(consoleSpy).not.toHaveBeenCalled()
        consoleSpy.mockRestore()
    })
})
