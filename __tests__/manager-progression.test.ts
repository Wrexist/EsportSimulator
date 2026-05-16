/**
 * Tests for ManagerProgression — the career-mode XP/level/tier system
 * that gates which teams a player can sign with. Drives the
 * tier-locked job-offer flow and the manager level shown in the UI.
 *
 * Coverage:
 *   getXPForLevel: cumulative table for levels 1-10, linear past 10
 *   getManagerLevel: read with safe fallback to 1
 *   gainXP: accumulates, levels up multiple times in one call,
 *           caps at 20, surfaces MANAGER_LEVEL_UP event
 *   getTeamTier: reputation buckets → ManagerTier (ELITE/CHAL/ROOKIE)
 *   isTeamUnlocked: tier × level gating contract
 */

import { ManagerProgression, ManagerTier } from "@/engine/manager-progression"
import type { GameSave } from "@/engine/save-types"

function makeGame(overrides: Partial<GameSave["managerDetails"]> = {}): GameSave {
    return {
        currentWeek: 5,
        managerDetails: {
            name: "Test Mgr",
            level: 1,
            xp: 0,
            reputation: 50,
            careerWins: 0,
            careerLosses: 0,
            championships: 0,
            ...overrides,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        eventsLog: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as GameSave
}

describe("getXPForLevel", () => {
    test("level <= 0 returns 500 (smallest first-level cost)", () => {
        expect(ManagerProgression.getXPForLevel(0)).toBe(500)
        expect(ManagerProgression.getXPForLevel(-1)).toBe(500)
    })

    test("level 1-10 returns the cumulative XP table value", () => {
        // table = [0, 500, 1200, 2000, 3500, 5000, 7500, 10000, 15000, 20000]
        expect(ManagerProgression.getXPForLevel(1)).toBe(0)
        expect(ManagerProgression.getXPForLevel(2)).toBe(500)
        expect(ManagerProgression.getXPForLevel(5)).toBe(3500)
        expect(ManagerProgression.getXPForLevel(10)).toBe(20000)
    })

    test("level > 10 uses linear formula: 20000 + (level - 10) * 5000", () => {
        expect(ManagerProgression.getXPForLevel(11)).toBe(25000)
        expect(ManagerProgression.getXPForLevel(20)).toBe(70000)
    })
})

describe("getManagerLevel", () => {
    test("returns the persisted level", () => {
        const g = makeGame({ level: 7 })
        expect(ManagerProgression.getManagerLevel(g)).toBe(7)
    })

    test("returns 1 when managerDetails is missing", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(ManagerProgression.getManagerLevel({} as any)).toBe(1)
    })

    test("returns 1 when called without arguments", () => {
        expect(ManagerProgression.getManagerLevel()).toBe(1)
    })
})

describe("gainXP", () => {
    test("accumulates XP without levelling up when under threshold", () => {
        const g = makeGame({ level: 3, xp: 100 })
        const res = ManagerProgression.gainXP(g, 200)
        expect(res.leveledUp).toBe(false)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((g.managerDetails as any).xp).toBe(300)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((g.managerDetails as any).level).toBe(3)
    })

    test("REGRESSION: level 1 → level 2 takes 500 XP (was 20000 before fix)", () => {
        // Pre-fix bug: getXPForLevel(level) used `|| 20000` which masked
        // table[0]=0 to 20000, and gainXP asked for getXPForLevel(currentLevel)
        // instead of (currentLevel + 1). Combined effect: level-1 players
        // needed 20000 XP (200 wins!) to reach level 2. Now correct.
        const g = makeGame({ level: 1, xp: 0 })
        const res = ManagerProgression.gainXP(g, 500)
        expect(res.leveledUp).toBe(true)
        expect(res.newLevel).toBe(2)
    })

    test("level 2 → level 3 takes 1200 XP", () => {
        const g = makeGame({ level: 2, xp: 1100 })
        const res = ManagerProgression.gainXP(g, 200)
        expect(res.leveledUp).toBe(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((g.managerDetails as any).level).toBe(3)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((g.managerDetails as any).xp).toBe(100) // 1100 + 200 - 1200 = 100
    })

    test("levels up MULTIPLE times in one call when bulk XP is granted", () => {
        // Start at level 1, gain 500 + 1200 + 2000 = 3700 → level 4 exactly.
        const g = makeGame({ level: 1, xp: 0 })
        const res = ManagerProgression.gainXP(g, 3700)
        expect(res.leveledUp).toBe(true)
        expect(res.newLevel).toBe(4)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((g.managerDetails as any).level).toBe(4)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((g.managerDetails as any).xp).toBe(0)
    })

    test("level cap at 20 — extra XP just accumulates", () => {
        const g = makeGame({ level: 20, xp: 0 })
        ManagerProgression.gainXP(g, 100_000)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((g.managerDetails as any).level).toBe(20)
        // XP accumulates but doesn't level past 20.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((g.managerDetails as any).xp).toBe(100_000)
    })

    test("surfaces a MANAGER_LEVEL_UP event on level-up", () => {
        // Level 2 needs 1200 XP to advance to 3 (table[2]).
        const g = makeGame({ level: 2, xp: 1100 })
        ManagerProgression.gainXP(g, 200)
        const evt = g.eventsLog.find(e => e.id.startsWith("mgr_levelup_"))
        expect(evt).toBeDefined()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((evt as any).type).toBe("MANAGER_LEVEL_UP")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((evt as any).data.description).toContain("Level 3")
    })

    test("no event fired when XP is gained without a level-up", () => {
        const g = makeGame({ level: 3, xp: 100 })
        ManagerProgression.gainXP(g, 50)
        const evt = g.eventsLog.find(e => e.id.startsWith("mgr_levelup_"))
        expect(evt).toBeUndefined()
    })

    test("game with no managerDetails returns leveledUp=false (safe fallback)", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g = { currentWeek: 5, eventsLog: [] } as any as GameSave
        const res = ManagerProgression.gainXP(g, 1000)
        expect(res.leveledUp).toBe(false)
        expect(res.newLevel).toBe(1)
    })
})

describe("getTeamTier", () => {
    test("reputation ≥ 75 → ELITE", () => {
        expect(ManagerProgression.getTeamTier(75)).toBe(ManagerTier.ELITE)
        expect(ManagerProgression.getTeamTier(100)).toBe(ManagerTier.ELITE)
    })

    test("40 ≤ reputation < 75 → CHALLENGER", () => {
        expect(ManagerProgression.getTeamTier(40)).toBe(ManagerTier.CHALLENGER)
        expect(ManagerProgression.getTeamTier(74)).toBe(ManagerTier.CHALLENGER)
    })

    test("reputation < 40 → ROOKIE", () => {
        expect(ManagerProgression.getTeamTier(39)).toBe(ManagerTier.ROOKIE)
        expect(ManagerProgression.getTeamTier(0)).toBe(ManagerTier.ROOKIE)
    })
})

describe("isTeamUnlocked + getRequiredLevel", () => {
    test("ROOKIE teams require level 1 (always unlocked at fresh start)", () => {
        expect(ManagerProgression.isTeamUnlocked(20, 1)).toBe(true)
        expect(ManagerProgression.getRequiredLevel(20)).toBe(1)
    })

    test("CHALLENGER teams require level 5", () => {
        expect(ManagerProgression.isTeamUnlocked(50, 4)).toBe(false)
        expect(ManagerProgression.isTeamUnlocked(50, 5)).toBe(true)
        expect(ManagerProgression.getRequiredLevel(50)).toBe(5)
    })

    test("ELITE teams require level 10", () => {
        expect(ManagerProgression.isTeamUnlocked(90, 9)).toBe(false)
        expect(ManagerProgression.isTeamUnlocked(90, 10)).toBe(true)
        expect(ManagerProgression.getRequiredLevel(90)).toBe(10)
    })
})
