/**
 * Coverage for engine/processors/match-weapon-mastery.ts.
 *
 * Pins weapon-mastery aggregation + application extracted in Phase M8
 * from atomic-week-processor.processMatches. Silent regression here
 * means players don't gain weapon-mastery XP from their matches —
 * the entire weapon-mastery progression system silently freezes.
 *
 * Two functions:
 *   - aggregateMatchWeaponKills: pure, walks the result, buckets kills
 *   - processMatchWeaponMastery: aggregates + calls WeaponMasteryManager
 */

import {
    aggregateMatchWeaponKills,
    processMatchWeaponMastery,
} from "@/engine/processors/match-weapon-mastery"
import { WeaponMasteryManager } from "@/engine/weapon-mastery-system"
import type { MatchResult } from "@/types"
import type { GameSave, PlayerSaveData } from "@/engine/save-types"

function makeResult(kills: Array<{ playerId: string; weapon: string; kills: number }>): MatchResult {
    // Wrap kills in a single map / single round for fixture simplicity.
    return {
        winnerId: "home",
        homeScore: 1,
        awayScore: 0,
        playerStats: {},
        mvpPlayerId: "",
        maps: [
            {
                rounds: [
                    {
                        winner: "HOME",
                        winType: "ELIMINATION",
                        kills,
                        deaths: [],
                        events: [],
                    } as any,
                ],
            } as any,
        ],
    } as MatchResult
}

function makePlayer(id: string): PlayerSaveData {
    return {
        id, nickname: id,
        weaponMastery: undefined,
    } as unknown as PlayerSaveData
}

function makeSave(players: PlayerSaveData[]): GameSave {
    return {
        saveVersion: 6, saveId: "test", saveName: "test",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        currentWeek: 5, currentDay: 6, timeMode: "WEEKLY",
        gameStartDate: new Date().toISOString(),
        managerDetails: {} as any,
        lastRngSeed: 1, playerTeamId: "p",
        teams: [], players, contracts: [], staff: [],
        tournaments: [], scheduledMatches: [], completedMatches: [],
        scheduledActivities: [], financeLedger: [], eventsLog: [], newsFeed: [],
        acknowledgedEventIds: [], hallOfFame: [], legendaryPlayers: [],
        weekTickState: null,
    } as unknown as GameSave
}

describe("aggregateMatchWeaponKills — bucketing by weapon type", () => {
    test("empty result → empty stats", () => {
        const r = { maps: [], homeScore: 0, awayScore: 0 } as any
        expect(aggregateMatchWeaponKills(r)).toEqual({})
    })

    test("AK47 kills → rifle bucket", () => {
        const r = makeResult([{ playerId: "p1", weapon: "ak47", kills: 5 }])
        const stats = aggregateMatchWeaponKills(r)
        expect(stats["p1"]).toEqual({ rifle: 5, awp: 0, pistol: 0, smg: 0 })
    })

    test("AWP kills → awp bucket (SNIPER type)", () => {
        const r = makeResult([{ playerId: "p1", weapon: "awp", kills: 3 }])
        const stats = aggregateMatchWeaponKills(r)
        expect(stats["p1"]).toEqual({ rifle: 0, awp: 3, pistol: 0, smg: 0 })
    })

    test("Glock kills → pistol bucket", () => {
        const r = makeResult([{ playerId: "p1", weapon: "glock", kills: 2 }])
        const stats = aggregateMatchWeaponKills(r)
        expect(stats["p1"]).toEqual({ rifle: 0, awp: 0, pistol: 2, smg: 0 })
    })

    test("multiple weapons across multiple players are bucketed independently", () => {
        const r = makeResult([
            { playerId: "p1", weapon: "ak47", kills: 5 },
            { playerId: "p1", weapon: "awp", kills: 2 },
            { playerId: "p2", weapon: "glock", kills: 3 },
            { playerId: "p1", weapon: "m4a4", kills: 4 },
        ])
        const stats = aggregateMatchWeaponKills(r)
        expect(stats["p1"]).toEqual({ rifle: 9, awp: 2, pistol: 0, smg: 0 })
        expect(stats["p2"]).toEqual({ rifle: 0, awp: 0, pistol: 3, smg: 0 })
    })

    test("uppercase + lowercase weapon ids both resolve via toUpperCase", () => {
        const r = makeResult([
            { playerId: "p1", weapon: "AK47", kills: 1 },
            { playerId: "p1", weapon: "ak47", kills: 1 },
        ])
        const stats = aggregateMatchWeaponKills(r)
        expect(stats["p1"].rifle).toBe(2)
    })

    test("unknown weapon id is silently dropped (no error, no entry)", () => {
        const r = makeResult([
            { playerId: "p1", weapon: "lightsaber", kills: 5 },
            { playerId: "p2", weapon: "ak47", kills: 1 },
        ])
        const stats = aggregateMatchWeaponKills(r)
        // p1 had only unknown weapons — no entry at all.
        expect(stats["p1"]).toBeUndefined()
        // p2 had a valid weapon — entry exists.
        expect(stats["p2"].rifle).toBe(1)
    })

    test("missing weapon field on a kill entry is skipped (defensive)", () => {
        const r = {
            maps: [{
                rounds: [{
                    kills: [
                        { playerId: "p1", weapon: "", kills: 5 },
                        { playerId: "p2", weapon: "ak47", kills: 2 },
                    ],
                }],
            }],
            homeScore: 0, awayScore: 0,
        } as any
        const stats = aggregateMatchWeaponKills(r)
        expect(stats["p1"]).toBeUndefined()
        expect(stats["p2"].rifle).toBe(2)
    })

    test("aggregates across multiple maps and rounds", () => {
        const r = {
            maps: [
                { rounds: [
                    { kills: [{ playerId: "p1", weapon: "ak47", kills: 2 }] },
                    { kills: [{ playerId: "p1", weapon: "ak47", kills: 3 }] },
                ] },
                { rounds: [
                    { kills: [{ playerId: "p1", weapon: "awp", kills: 4 }] },
                ] },
            ],
            homeScore: 2, awayScore: 0,
        } as any
        const stats = aggregateMatchWeaponKills(r)
        expect(stats["p1"]).toEqual({ rifle: 5, awp: 4, pistol: 0, smg: 0 })
    })

    test("missing rounds array on a map → that map skipped (no crash)", () => {
        const r = {
            maps: [
                { rounds: undefined },
                { rounds: [{ kills: [{ playerId: "p1", weapon: "ak47", kills: 1 }] }] },
            ],
            homeScore: 1, awayScore: 0,
        } as any
        const stats = aggregateMatchWeaponKills(r)
        expect(stats["p1"].rifle).toBe(1)
    })
})

describe("processMatchWeaponMastery — applies XP via WeaponMasteryManager", () => {
    let spy: jest.SpyInstance

    beforeEach(() => {
        spy = jest.spyOn(WeaponMasteryManager, "processMatchWeaponXP").mockImplementation(() => {})
    })

    afterEach(() => {
        spy.mockRestore()
    })

    test("calls processMatchWeaponXP once per player with kills", () => {
        const players = [makePlayer("p1"), makePlayer("p2"), makePlayer("p3")]
        const save = makeSave(players)
        const result = makeResult([
            { playerId: "p1", weapon: "ak47", kills: 5 },
            { playerId: "p2", weapon: "awp", kills: 3 },
            // p3 had no kills
        ])

        processMatchWeaponMastery(save, result)

        expect(spy).toHaveBeenCalledTimes(2)
    })

    test("forwards the bucketed counts in (player, rifle, awp, pistol, smg) order", () => {
        const players = [makePlayer("p1")]
        const save = makeSave(players)
        const result = makeResult([
            { playerId: "p1", weapon: "ak47", kills: 5 },
            { playerId: "p1", weapon: "awp", kills: 3 },
            { playerId: "p1", weapon: "glock", kills: 2 },
        ])

        processMatchWeaponMastery(save, result)

        expect(spy).toHaveBeenCalledWith(players[0], 5, 3, 2, 0)
    })

    test("player not in save → silently skipped (no crash)", () => {
        const save = makeSave([])
        const result = makeResult([{ playerId: "ghost_player", weapon: "ak47", kills: 5 }])

        expect(() => processMatchWeaponMastery(save, result)).not.toThrow()
        expect(spy).not.toHaveBeenCalled()
    })

    test("uses idx.playerIndex for O(1) lookup when provided", () => {
        const p1 = makePlayer("p1")
        const save = makeSave([p1])
        const result = makeResult([{ playerId: "p1", weapon: "ak47", kills: 1 }])

        // Build a phony idx — using a different object reference for "p1"
        // would prove the lookup goes through the index rather than the
        // save.players array.
        const indexedClone = { ...p1 } as PlayerSaveData
        const idx = {
            playerIndex: new Map([["p1", indexedClone]]),
        } as any

        processMatchWeaponMastery(save, result, idx)

        // First arg should be the indexed clone, not the array entry.
        expect(spy).toHaveBeenCalledWith(indexedClone, 1, 0, 0, 0)
    })

    test("falls back to save.players.find when idx lacks the player", () => {
        const p1 = makePlayer("p1")
        const save = makeSave([p1])
        const result = makeResult([{ playerId: "p1", weapon: "ak47", kills: 1 }])

        const idx = { playerIndex: new Map() } as any
        processMatchWeaponMastery(save, result, idx)

        expect(spy).toHaveBeenCalledWith(p1, 1, 0, 0, 0)
    })

    test("zero-kill match → processMatchWeaponXP never called", () => {
        const save = makeSave([makePlayer("p1")])
        const result = { maps: [], homeScore: 0, awayScore: 0 } as any

        processMatchWeaponMastery(save, result)
        expect(spy).not.toHaveBeenCalled()
    })
})
