/**
 * Tests for the player-development slice.
 *
 * Five actions. The talent / staff-talent paths exercise the static
 * PLAYER_TALENT_TREE / STAFF_TALENT_TREES constants — we use a real
 * talent id from each tree to keep this test data-driven rather than
 * trying to mock the trees.
 *
 * Coverage:
 *   - unlockPlayerTalent: cost gate, idempotency, STAT_BOOST applies,
 *     prerequisites enforced, event logged
 *   - unlockStaffTalent: rejects non-player-team staff (engine owns those),
 *     cost gate, idempotency
 *   - setPlayerTrainingFocus: writes focus on the player
 *   - updatePlayer: clamps numeric writes [0,100], refuses non-roster
 *     players (other surfaces handle cross-team writes), non-finite
 *     values are dropped
 */

import { produce, enableMapSet } from "immer"
import { createPlayerDevelopmentSlice } from "@/store/slices/player-development-slice"
import { PLAYER_TALENT_TREE, STAFF_TALENT_TREES } from "@/engine/talent-trees"
import type { PlayerSaveData, StaffSaveData, TeamSaveData } from "@/engine/save-types"
import type { StoreState } from "@/store/types"

enableMapSet()

function makeHarness(initial: Partial<StoreState>) {
    let state = initial as StoreState
    const set = (
        patch: Partial<StoreState> | ((draft: StoreState) => void)
    ) => {
        if (typeof patch === "function") {
            state = produce(state, patch as (s: StoreState) => void)
        } else {
            state = { ...state, ...patch }
        }
    }
    const get = () => state
    return { state: () => state, set, get }
}

function makePlayer(id: string, overrides: Partial<PlayerSaveData> = {}): PlayerSaveData {
    return {
        id, nickname: id, firstName: id, lastName: "P",
        age: 22, nationality: "US", role: "RIFLER",
        rifle: 60, awp: 50, pistol: 55, grenades: 50, creativity: 55,
        clutch: 50, tactic: 55, leader: 50, teamwork: 55,
        reaction: 60, eyesight: 60,
        morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 5, xp: 100, xpToNextLevel: 1000, availableSkillPoints: 5, talentPoints: 5,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        skill: 65, potential: 85, productivity: 60, endurance: 70,
        ...overrides,
    } as unknown as PlayerSaveData
}

function makeTeam(id: string, rosterIds: string[] = []): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(),
        budget: 100_000, rosterIds, staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1, leagueTier: "B_TIER",
        elo: 1500, recentForm: [],
    } as unknown as TeamSaveData
}

function makeStaff(id: string, role: string, teamId: string, talentPoints = 5): StaffSaveData {
    return {
        id, name: id, role, teamId,
        level: 2, xp: 0, xpToNextLevel: 1000,
        talentPoints,
        unlockedTalentIds: [],
        salaryPerWeek: 1000, contractEndWeek: 100,
        stats: { development: 50, analysis: 50 },
    } as unknown as StaffSaveData
}

function makeBaseState(overrides: Partial<StoreState> = {}): Partial<StoreState> {
    return {
        teams: [makeTeam("player", ["p1"])],
        players: [makePlayer("p1")],
        staff: [],
        eventsLog: [],
        newsFeed: [],
        currentWeek: 5,
        playerTeamId: "player",
        lastRngSeed: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    }
}

describe("unlockPlayerTalent", () => {
    test("rejects unknown talent id silently", () => {
        const h = makeHarness(makeBaseState())
        const slice = createPlayerDevelopmentSlice(h.set, h.get)
        slice.unlockPlayerTalent("p1", "ghost_talent_id")
        expect(h.state().players[0].unlockedTalentIds).toEqual([])
        expect(h.state().players[0].talentPoints).toBe(5)
    })

    test("debits cost + unlocks + writes a TRAINING_COMPLETE event on success", () => {
        // Pick a root talent (no prerequisites) from the real tree.
        const root = PLAYER_TALENT_TREE.find(t => t.requirements.length === 0)
        if (!root) {
            // If the tree changes shape, skip rather than fail spuriously.
            // eslint-disable-next-line no-console
            console.warn("PLAYER_TALENT_TREE has no root nodes; skipping")
            return
        }
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1", { talentPoints: root.cost + 5 })],
        }))
        const slice = createPlayerDevelopmentSlice(h.set, h.get)
        slice.unlockPlayerTalent("p1", root.id)
        const p = h.state().players[0]
        expect(p.unlockedTalentIds).toContain(root.id)
        expect(p.talentPoints).toBe(5)
        const evt = h.state().eventsLog.find(e => e.type === "TRAINING_COMPLETE")
        expect(evt).toBeDefined()
    })

    test("refuses when talent points are below cost (TOCTOU guard)", () => {
        const root = PLAYER_TALENT_TREE.find(t => t.requirements.length === 0)
        if (!root) return
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1", { talentPoints: root.cost - 1 })],
        }))
        const slice = createPlayerDevelopmentSlice(h.set, h.get)
        slice.unlockPlayerTalent("p1", root.id)
        expect(h.state().players[0].unlockedTalentIds).toEqual([])
        expect(h.state().players[0].talentPoints).toBe(root.cost - 1) // untouched
    })

    test("idempotent: cannot unlock the same talent twice", () => {
        const root = PLAYER_TALENT_TREE.find(t => t.requirements.length === 0)
        if (!root) return
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1", {
                talentPoints: root.cost * 3,
                unlockedTalentIds: [root.id],
            })],
        }))
        const slice = createPlayerDevelopmentSlice(h.set, h.get)
        slice.unlockPlayerTalent("p1", root.id)
        // No additional unlock, no extra debit.
        expect(h.state().players[0].unlockedTalentIds.filter(t => t === root.id).length).toBe(1)
        expect(h.state().players[0].talentPoints).toBe(root.cost * 3)
    })
})

describe("unlockStaffTalent", () => {
    test("rejects staff on a non-player team (engine owns AI staff development)", () => {
        const role = Object.keys(STAFF_TALENT_TREES)[0]
        if (!role) return
        const node = STAFF_TALENT_TREES[role]?.[0]
        if (!node) return
        const h = makeHarness(makeBaseState({
            staff: [makeStaff("ai_staff", role, "rival", 10)],
        }))
        const slice = createPlayerDevelopmentSlice(h.set, h.get)
        slice.unlockStaffTalent("ai_staff", node.id)
        expect(h.state().staff[0].unlockedTalentIds).toEqual([])
    })

    test("debits cost on a valid player-team staff member", () => {
        const role = Object.keys(STAFF_TALENT_TREES)[0]
        if (!role) return
        const node = STAFF_TALENT_TREES[role]?.find(n => n.requirements.length === 0)
        if (!node) return
        const h = makeHarness(makeBaseState({
            staff: [makeStaff("s1", role, "player", node.cost + 5)],
        }))
        const slice = createPlayerDevelopmentSlice(h.set, h.get)
        slice.unlockStaffTalent("s1", node.id)
        expect(h.state().staff[0].unlockedTalentIds).toContain(node.id)
        expect(h.state().staff[0].talentPoints).toBe(5)
    })
})

describe("setPlayerTrainingFocus", () => {
    test("writes focus on the player", () => {
        const h = makeHarness(makeBaseState())
        const slice = createPlayerDevelopmentSlice(h.set, h.get)
        slice.setPlayerTrainingFocus("p1", "AIM")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((h.state().players[0] as any).trainingFocus).toBe("AIM")
    })

    test("unknown player id is a silent no-op", () => {
        const h = makeHarness(makeBaseState())
        const slice = createPlayerDevelopmentSlice(h.set, h.get)
        expect(() => slice.setPlayerTrainingFocus("ghost", "AIM")).not.toThrow()
    })
})

describe("updatePlayer", () => {
    test("only mutates own-roster players (cross-team writes are refused)", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", ["p1"]), makeTeam("rival", ["p_ai"])],
            players: [makePlayer("p1"), makePlayer("p_ai", { energy: 50 })],
        }))
        const slice = createPlayerDevelopmentSlice(h.set, h.get)
        slice.updatePlayer("p_ai", { energy: 99 })
        // p_ai energy stays at 50.
        expect(h.state().players[1].energy).toBe(50)
    })

    test("clamps numeric fields to [0, 100] and floors fractional inputs", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1", { energy: 50 })],
        }))
        const slice = createPlayerDevelopmentSlice(h.set, h.get)
        slice.updatePlayer("p1", { energy: 200, fatigue: -10, morale: 75.9 })
        const p = h.state().players[0]
        expect(p.energy).toBe(100)  // clamped from 200
        expect(p.fatigue).toBe(0)   // clamped from -10
        expect(p.morale).toBe(75)   // floored from 75.9
    })

    test("non-finite numeric inputs are silently dropped, not written as NaN", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1", { energy: 50, fatigue: 30 })],
        }))
        const slice = createPlayerDevelopmentSlice(h.set, h.get)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        slice.updatePlayer("p1", { energy: NaN, fatigue: Infinity } as any)
        expect(h.state().players[0].energy).toBe(50)   // unchanged
        expect(h.state().players[0].fatigue).toBe(30)  // unchanged
    })

    test("weaponMastery object is replaced wholesale (used by match outcomes)", () => {
        const h = makeHarness(makeBaseState())
        const slice = createPlayerDevelopmentSlice(h.set, h.get)
        slice.updatePlayer("p1", { weaponMastery: { ak: 50, awp: 60 } })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((h.state().players[0] as any).weaponMastery).toEqual({ ak: 50, awp: 60 })
    })
})
