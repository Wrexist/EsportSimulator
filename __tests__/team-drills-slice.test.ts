/**
 * Tests for the team-drills slice.
 *
 * Single action — runTeamDrill — that mutates the entire active roster
 * in a single weekly slot. The slice covers:
 *
 *   - Weekly slot cap gate (maxTrainingSlots, default 10)
 *   - Exhaustion guard: any player at fatigue ≥ 90 blocks the drill
 *   - Iron Lung talent: 20% fatigue reduction (rounded up)
 *   - Flat 50 XP per drill, level-up at xpToNextLevel cap with 1.5×
 *     growth and a PLAYER_LEVEL_UP event
 *   - Per-stat gains with the drill→player stat mapping
 *     (agility→reaction, focus→stressResistance, etc.) clamped at 100
 *   - Weapon mastery: RIFLE/AWP/SMG/PISTOL drills bump weapon-mastery XP
 *
 * Same immer harness pattern.
 */

import { produce, enableMapSet } from "immer"
import { createTeamDrillsSlice } from "@/store/slices/team-drills-slice"
import type { PlayerSaveData, TeamSaveData } from "@/engine/save-types"
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
        clutch: 50, tactic: 50, leader: 50, teamwork: 55,
        reaction: 60, eyesight: 60, stressResistance: 50,
        morale: 75, form: 70, fatigue: 30, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        skill: 60, potential: 85, productivity: 60, endurance: 70,
        ...overrides,
    } as unknown as PlayerSaveData
}

function makeTeam(id: string, rosterIds: string[], overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(),
        budget: 100_000, rosterIds, staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1, leagueTier: "B_TIER",
        elo: 1500, recentForm: [],
        trainingSlotsUsed: 0, maxTrainingSlots: 10,
        ...overrides,
    } as unknown as TeamSaveData
}

function makeBaseState(overrides: Partial<StoreState> = {}): Partial<StoreState> {
    return {
        teams: [makeTeam("player", ["p1", "p2"])],
        players: [makePlayer("p1"), makePlayer("p2")],
        eventsLog: [],
        currentWeek: 5,
        playerTeamId: "player",
        lastRngSeed: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    }
}

describe("runTeamDrill — slot gate + exhaustion gate", () => {
    test("refuses when weekly training slot cap is reached", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", ["p1"], { trainingSlotsUsed: 10, maxTrainingSlots: 10 })],
            players: [makePlayer("p1")],
        }))
        const slice = createTeamDrillsSlice(h.set, h.get)
        const res = slice.runTeamDrill("aim_drill", [{ stat: "rifle", amount: 1 }], 5)
        expect(res.success).toBe(false)
        expect(res.message).toContain("training limit")
    })

    test("any roster player at fatigue ≥ 90 blocks the drill and names them", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1"), makePlayer("p2", { fatigue: 95 })],
            teams: [makeTeam("player", ["p1", "p2"])],
        }))
        const slice = createTeamDrillsSlice(h.set, h.get)
        const res = slice.runTeamDrill("aim_drill", [], 5)
        expect(res.success).toBe(false)
        expect(res.message).toContain("p2")
        expect(res.message).toContain("exhausted")
    })

    test("happy path: fires drill + consumes one training slot", () => {
        const h = makeHarness(makeBaseState())
        const slice = createTeamDrillsSlice(h.set, h.get)
        const res = slice.runTeamDrill("aim_drill", [{ stat: "rifle", amount: 1 }], 5)
        expect(res.success).toBe(true)
        expect(h.state().teams[0].trainingSlotsUsed).toBe(1)
    })
})

describe("runTeamDrill — fatigue + Iron Lung talent", () => {
    test("baseline: fatigue increases by cost on every active roster player", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1", { fatigue: 20 }), makePlayer("p2", { fatigue: 30 })],
            teams: [makeTeam("player", ["p1", "p2"])],
        }))
        const slice = createTeamDrillsSlice(h.set, h.get)
        slice.runTeamDrill("aim_drill", [], 15)
        expect(h.state().players[0].fatigue).toBe(35)
        expect(h.state().players[1].fatigue).toBe(45)
    })

    test("Iron Lung talent (player_fit_2) cuts fatigue cost by 20% (rounded up)", () => {
        const h = makeHarness(makeBaseState({
            players: [
                makePlayer("p1", { fatigue: 20, unlockedTalentIds: ["player_fit_2"] }),
                makePlayer("p2", { fatigue: 20 }), // no talent
            ],
            teams: [makeTeam("player", ["p1", "p2"])],
        }))
        const slice = createTeamDrillsSlice(h.set, h.get)
        slice.runTeamDrill("aim_drill", [], 10)
        // p1: 20 + ceil(10 * 0.8) = 20 + 8 = 28
        // p2: 20 + 10 = 30
        expect(h.state().players[0].fatigue).toBe(28)
        expect(h.state().players[1].fatigue).toBe(30)
    })

    test("fatigue clamps at 100", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1", { fatigue: 80 })],
            teams: [makeTeam("player", ["p1"])],
        }))
        const slice = createTeamDrillsSlice(h.set, h.get)
        slice.runTeamDrill("aim_drill", [], 50)
        // 80 + 50 = 130 → clamped to 100
        expect(h.state().players[0].fatigue).toBe(100)
    })
})

describe("runTeamDrill — XP + level-up", () => {
    test("flat +50 XP per drill", () => {
        const h = makeHarness(makeBaseState())
        const slice = createTeamDrillsSlice(h.set, h.get)
        slice.runTeamDrill("aim_drill", [], 5)
        expect(h.state().players[0].xp).toBe(50)
        expect(h.state().players[1].xp).toBe(50)
    })

    test("level-up fires PLAYER_LEVEL_UP event + 1 talent point + 1.5× XP cap", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1", { xp: 990, xpToNextLevel: 1000, level: 3 })],
            teams: [makeTeam("player", ["p1"])],
        }))
        const slice = createTeamDrillsSlice(h.set, h.get)
        slice.runTeamDrill("aim_drill", [], 5)
        // 990 + 50 = 1040 → level up
        expect(h.state().players[0].level).toBe(4)
        expect(h.state().players[0].talentPoints).toBe(1)
        expect(h.state().players[0].xpToNextLevel).toBe(1500)
        const evt = h.state().eventsLog.find(e => e.type === "PLAYER_LEVEL_UP")
        expect(evt).toBeDefined()
    })
})

describe("runTeamDrill — stat gains + mapping", () => {
    test("drill terminology maps to player stat keys (agility→reaction, focus→stressResistance)", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1", { reaction: 50, stressResistance: 50 })],
            teams: [makeTeam("player", ["p1"])],
        }))
        const slice = createTeamDrillsSlice(h.set, h.get)
        slice.runTeamDrill("agility_drill", [
            { stat: "agility", amount: 5 },
            { stat: "focus", amount: 3 },
        ], 5)
        expect(h.state().players[0].reaction).toBe(55)
        expect(h.state().players[0].stressResistance).toBe(53)
    })

    test("entry/accuracy/mechanics also map (entry→rifle, mechanics→skill)", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1", { rifle: 60, skill: 60 })],
            teams: [makeTeam("player", ["p1"])],
        }))
        const slice = createTeamDrillsSlice(h.set, h.get)
        slice.runTeamDrill("multi", [
            { stat: "entry", amount: 2 },
            { stat: "mechanics", amount: 3 },
        ], 5)
        expect(h.state().players[0].rifle).toBe(62)
        expect(h.state().players[0].skill).toBe(63)
    })

    test("stat gains clamp at 100", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1", { rifle: 99, potential: 100 })],
            teams: [makeTeam("player", ["p1"])],
        }))
        const slice = createTeamDrillsSlice(h.set, h.get)
        slice.runTeamDrill("aim_drill", [{ stat: "rifle", amount: 50 }], 5)
        expect(h.state().players[0].rifle).toBe(100)
    })

    test("drill gains respect potential — can't grind a stat past it (G3)", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1", { rifle: 60, potential: 70 })],
            teams: [makeTeam("player", ["p1"])],
        }))
        const slice = createTeamDrillsSlice(h.set, h.get)
        slice.runTeamDrill("aim_drill", [{ stat: "rifle", amount: 50 }], 5)
        // 60 + 50 = 110, but capped at potential 70 (not 100).
        expect(h.state().players[0].rifle).toBe(70)
    })

    test("a stat already above potential is held, never reduced (G3)", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1", { rifle: 90, potential: 80 })],
            teams: [makeTeam("player", ["p1"])],
        }))
        const slice = createTeamDrillsSlice(h.set, h.get)
        slice.runTeamDrill("aim_drill", [{ stat: "rifle", amount: 5 }], 5)
        // Already above potential — the drill can't push higher, but mustn't drop it.
        expect(h.state().players[0].rifle).toBe(90)
    })

    test("unknown stat is silently skipped (no crash)", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1")],
            teams: [makeTeam("player", ["p1"])],
        }))
        const slice = createTeamDrillsSlice(h.set, h.get)
        expect(() => slice.runTeamDrill("unknown_drill", [
            { stat: "made_up_stat", amount: 5 },
        ], 5)).not.toThrow()
    })
})

describe("runTeamDrill — weapon mastery", () => {
    test("RIFLE/AWP/SMG/PISTOL drills bump weapon-mastery XP", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1")],
            teams: [makeTeam("player", ["p1"])],
        }))
        const slice = createTeamDrillsSlice(h.set, h.get)
        slice.runTeamDrill("rifle_drill", [{ stat: "RIFLE", amount: 1 }], 5)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wm = (h.state().players[0] as any).weaponMastery
        expect(wm).toBeDefined()
        expect(wm.RIFLE).toBeDefined()
        expect(wm.RIFLE).toBeGreaterThan(0)
    })

    test("non-weapon stat gains do NOT touch weaponMastery", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1")],
            teams: [makeTeam("player", ["p1"])],
        }))
        const slice = createTeamDrillsSlice(h.set, h.get)
        slice.runTeamDrill("focus_drill", [{ stat: "focus", amount: 2 }], 5)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((h.state().players[0] as any).weaponMastery).toBeUndefined()
    })
})
