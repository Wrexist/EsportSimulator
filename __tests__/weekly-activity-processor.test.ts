/**
 * Tests for the weekly-activity processor.
 *
 * Applies the side-effects of the player's "weekly focus" choice to a
 * GameSave before it ships to the week processor. Four player-facing
 * activities + TRAINING_ONLY (no-op). Six effect channels: money,
 * morale, fatigue, xp, reputation, fanSupport (most flow through
 * other processors, only fatigue/morale/xp/reputation land in this
 * processor itself).
 *
 * Locks the contract on:
 *   - TRAINING_ONLY is a no-op (no ledger, no event)
 *   - Cost > 0 debits budget AND writes a FACILITIES ledger row
 *   - Fatigue + morale + xp + reputation each land on the right
 *     fields and clamp to [0, 100] (or 100 ceiling for reputation)
 *   - XP bonus only fires when xp multiplier > 1 (streaming = 0
 *     xp produces no xp bonus, bootcamp = 2.0 → +50)
 *   - Missing player team = no-op (does not crash)
 *   - Surfaces a TEAM_UPDATE event so the user sees what fired
 */

import { applyWeeklyActivity } from "@/engine/processors/weekly-activity-processor"
import { WeeklyActivityType } from "@/types"
import type { GameSave } from "@/engine/save-types"

function nextId(_state: unknown, prefix: string, ...parts: Array<string | number | null | undefined>): string {
    return [prefix, ...parts.filter(Boolean)].join("_")
}

function makeSave(currentWeek = 5, rosterSize = 3, teamBudget = 100_000): GameSave {
    const players = Array.from({ length: rosterSize }, (_, i) => ({
        id: `p${i}`,
        nickname: `p${i}`,
        morale: 50,
        fatigue: 30,
        xp: 0,
    }))
    return {
        currentWeek,
        playerTeamId: "player",
        teams: [{
            id: "player",
            name: "Player",
            budget: teamBudget,
            rosterIds: players.map(p => p.id),
            reputation: 40,
        }],
        players,
        contracts: [],
        staff: [],
        scheduledMatches: [],
        completedMatches: [],
        scheduledActivities: [],
        financeLedger: [],
        eventsLog: [],
        newsFeed: [],
        tournaments: [],
        tournamentQualifications: [],
        academyPlayers: [],
        marketStaff: [],
        lastRngSeed: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as GameSave
}

describe("applyWeeklyActivity — TRAINING_ONLY no-op", () => {
    test("does not touch budget, players, or eventsLog", () => {
        const save = makeSave(5, 3, 100_000)
        applyWeeklyActivity(save, {
            playerTeamId: "player",
            selectedActivity: WeeklyActivityType.TRAINING_ONLY,
            nextId,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const team = save.teams[0] as any
        expect(team.budget).toBe(100_000)
        expect(save.eventsLog.length).toBe(0)
        expect(save.financeLedger.length).toBe(0)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((save.players[0] as any).fatigue).toBe(30)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((save.players[0] as any).morale).toBe(50)
    })

    test("missing selectedActivity is also a no-op", () => {
        const save = makeSave()
        applyWeeklyActivity(save, {
            playerTeamId: "player",
            selectedActivity: null,
            nextId,
        })
        expect(save.eventsLog.length).toBe(0)
    })
})

describe("applyWeeklyActivity — BOOTCAMP", () => {
    test("debits cost $10,000 and writes a FACILITIES ledger row", () => {
        const save = makeSave(5, 3, 100_000)
        applyWeeklyActivity(save, {
            playerTeamId: "player",
            selectedActivity: WeeklyActivityType.BOOTCAMP,
            nextId,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const team = save.teams[0] as any
        expect(team.budget).toBe(100_000 - 10_000)
        const row = save.financeLedger.find(e => e.category === "FACILITIES")
        expect(row).toBeDefined()
        expect(row!.amount).toBe(10_000)
    })

    test("fatigue +25, morale -10, xp +50 (2.0 multiplier) applied to every roster player", () => {
        const save = makeSave(5, 3, 100_000)
        applyWeeklyActivity(save, {
            playerTeamId: "player",
            selectedActivity: WeeklyActivityType.BOOTCAMP,
            nextId,
        })
        for (const p of save.players) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const px = p as any
            expect(px.fatigue).toBe(55) // 30 + 25
            expect(px.morale).toBe(40)  // 50 - 10
            expect(px.xp).toBe(50)      // flat 50 * (2.0 - 1)
        }
    })

    test("logs a TEAM_UPDATE event so the player sees the bootcamp confirmed", () => {
        const save = makeSave()
        applyWeeklyActivity(save, {
            playerTeamId: "player",
            selectedActivity: WeeklyActivityType.BOOTCAMP,
            nextId,
        })
        expect(save.eventsLog.length).toBe(1)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((save.eventsLog[0] as any).data.title).toContain("Intensive Bootcamp")
    })
})

describe("applyWeeklyActivity — STREAMING", () => {
    test("zero cost path: no ledger debit but effects + event still fire", () => {
        const save = makeSave(5, 3, 100_000)
        applyWeeklyActivity(save, {
            playerTeamId: "player",
            selectedActivity: WeeklyActivityType.STREAMING,
            nextId,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const team = save.teams[0] as any
        expect(team.budget).toBe(100_000)
        expect(save.financeLedger.length).toBe(0)
        expect(save.eventsLog.length).toBe(1)
        // fatigue +15, morale -5, no xp bonus (xp multiplier not > 1).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = save.players[0] as any
        expect(p.fatigue).toBe(45)
        expect(p.morale).toBe(45)
        expect(p.xp).toBe(0) // no XP bonus
    })
})

describe("applyWeeklyActivity — TEAM_BONDING & MEDIA_CAMPAIGN", () => {
    test("TEAM_BONDING: morale +15, fatigue -5 (recovery), no xp", () => {
        const save = makeSave(5, 2, 100_000)
        applyWeeklyActivity(save, {
            playerTeamId: "player",
            selectedActivity: WeeklyActivityType.TEAM_BONDING,
            nextId,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = save.players[0] as any
        expect(p.morale).toBe(65) // 50 + 15
        expect(p.fatigue).toBe(25) // 30 - 5
        expect(p.xp).toBe(0)
    })

    test("MEDIA_CAMPAIGN: reputation +5 on the team, fatigue +5 on players", () => {
        const save = makeSave(5, 2, 100_000)
        applyWeeklyActivity(save, {
            playerTeamId: "player",
            selectedActivity: WeeklyActivityType.MEDIA_CAMPAIGN,
            nextId,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const team = save.teams[0] as any
        expect(team.reputation).toBe(45) // 40 + 5
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = save.players[0] as any
        expect(p.fatigue).toBe(35)
    })

    test("reputation caps at 100", () => {
        const save = makeSave(5, 1, 100_000)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(save.teams[0] as any).reputation = 98
        applyWeeklyActivity(save, {
            playerTeamId: "player",
            selectedActivity: WeeklyActivityType.MEDIA_CAMPAIGN,
            nextId,
        })
        // 98 + 5 → would be 103 but clamped to 100
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((save.teams[0] as any).reputation).toBe(100)
    })
})

describe("applyWeeklyActivity — edge cases", () => {
    test("missing player team is a no-op (does not crash)", () => {
        const save = makeSave()
        expect(() => applyWeeklyActivity(save, {
            playerTeamId: "ghost_team",
            selectedActivity: WeeklyActivityType.BOOTCAMP,
            nextId,
        })).not.toThrow()
        expect(save.eventsLog.length).toBe(0)
    })

    test("fatigue clamps to [0, 100]", () => {
        const save = makeSave(5, 1, 100_000)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(save.players[0] as any).fatigue = 90
        applyWeeklyActivity(save, {
            playerTeamId: "player",
            selectedActivity: WeeklyActivityType.BOOTCAMP, // +25 fatigue
            nextId,
        })
        // 90 + 25 = 115 → clamped to 100.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((save.players[0] as any).fatigue).toBe(100)
    })
})
