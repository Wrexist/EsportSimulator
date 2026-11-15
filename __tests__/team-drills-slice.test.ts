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
import { createTeamDrillsSlice, TEAM_DRILL_MASTERY_XP } from "@/store/slices/team-drills-slice"
import { trainingAgeFactor } from "@/engine/development-rates"
import { getArchetype, trainingFactor } from "@/engine/personality"
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
        const res = slice.runTeamDrill("recoil_master", [{ stat: "rifle", amount: 1 }], 5)
        expect(res.success).toBe(false)
        expect(res.message).toContain("training limit")
    })

    test("any roster player at fatigue ≥ 90 blocks the drill and names them", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1"), makePlayer("p2", { fatigue: 95 })],
            teams: [makeTeam("player", ["p1", "p2"])],
        }))
        const slice = createTeamDrillsSlice(h.set, h.get)
        const res = slice.runTeamDrill("recoil_master", [], 5)
        expect(res.success).toBe(false)
        expect(res.message).toContain("p2")
        expect(res.message).toContain("exhausted")
    })

    test("happy path: fires drill + consumes one training slot", () => {
        const h = makeHarness(makeBaseState())
        const slice = createTeamDrillsSlice(h.set, h.get)
        const res = slice.runTeamDrill("recoil_master", [{ stat: "rifle", amount: 1 }], 5)
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
        slice.runTeamDrill("recoil_master", [], 15)
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
        slice.runTeamDrill("recoil_master", [], 10)
        // Catalog cost 15: 20 + ceil(15 * 0.8) = 32
        // Same catalog cost without talent: 35
        expect(h.state().players[0].fatigue).toBe(32)
        expect(h.state().players[1].fatigue).toBe(35)
    })

    test("fatigue clamps at 100", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1", { fatigue: 89 })],
            teams: [makeTeam("player", ["p1"])],
        }))
        const slice = createTeamDrillsSlice(h.set, h.get)
        slice.runTeamDrill("recoil_master", [], 50)
        // 80 + 50 = 130 → clamped to 100
        expect(h.state().players[0].fatigue).toBe(100)
    })
})

describe("runTeamDrill — XP + level-up", () => {
    test("flat +50 XP per drill", () => {
        const h = makeHarness(makeBaseState())
        const slice = createTeamDrillsSlice(h.set, h.get)
        slice.runTeamDrill("recoil_master", [], 5)
        expect(h.state().players[0].xp).toBe(50)
        expect(h.state().players[1].xp).toBe(50)
    })

    test("level-up fires PLAYER_LEVEL_UP event + 1 talent point + 1.5× XP cap", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1", { xp: 990, xpToNextLevel: 1000, level: 3 })],
            teams: [makeTeam("player", ["p1"])],
        }))
        const slice = createTeamDrillsSlice(h.set, h.get)
        slice.runTeamDrill("recoil_master", [], 5)
        // 990 + 50 = 1040 → level up
        expect(h.state().players[0].level).toBe(4)
        expect(h.state().players[0].talentPoints).toBe(1)
        expect(h.state().players[0].xpToNextLevel).toBe(1500)
        const evt = h.state().eventsLog.find(e => e.type === "PLAYER_LEVEL_UP")
        expect(evt).toBeDefined()
    })
})

/** Share of a listed drill gain a player keeps with no staff or facility: archetype × age (SQUAD-01). */
function personalShare(p: PlayerSaveData): number {
    return trainingFactor(getArchetype(p)) * trainingAgeFactor(p.age)
}

describe("runTeamDrill — stat gains + mapping", () => {
    test("drill terminology maps to player stat keys (agility→reaction, focus→stressResistance)", () => {
        const p1 = makePlayer("p1", { reaction: 50, stressResistance: 50 })
        const h = makeHarness(makeBaseState({
            players: [p1],
            teams: [makeTeam("player", ["p1"])],
        }))
        const slice = createTeamDrillsSlice(h.set, h.get)
        slice.runTeamDrill("surf_utopia", [
            { stat: "agility", amount: 5 },
            { stat: "focus", amount: 3 },
        ], 5)
        // Catalog: Agility +2, Focus +2, scaled like weekly training.
        expect(h.state().players[0].reaction).toBeCloseTo(50 + 2 * personalShare(p1))
        expect(h.state().players[0].stressResistance).toBeCloseTo(50 + 2 * personalShare(p1))
    })

    test("entry/accuracy/mechanics also map (entry→rifle, mechanics→skill)", () => {
        const p1 = makePlayer("p1", { rifle: 60, skill: 60 })
        const h = makeHarness(makeBaseState({
            players: [p1],
            teams: [makeTeam("player", ["p1"])],
        }))
        const slice = createTeamDrillsSlice(h.set, h.get)
        slice.runTeamDrill("recoil_master", [
            { stat: "entry", amount: 2 },
            { stat: "mechanics", amount: 3 },
        ], 5)
        // Catalog: Rifle +3, Skill +1.
        expect(h.state().players[0].rifle).toBeCloseTo(60 + 3 * personalShare(p1))
        expect(h.state().players[0].skill).toBeCloseTo(60 + 1 * personalShare(p1))
    })

    test("SQUAD-01: drill gains shrink with age like weekly training, and the coach and facility raise them", () => {
        const young = makePlayer("young", { age: 20, rifle: 50, potential: 90, personality: { archetype: "LEADER" } as never })
        const vet = makePlayer("vet", { age: 30, rifle: 50, potential: 90, personality: { archetype: "LEADER" } as never })
        const h = makeHarness(makeBaseState({ players: [young, vet], teams: [makeTeam("player", ["young", "vet"])], staff: [] }))
        createTeamDrillsSlice(h.set, h.get).runTeamDrill("recoil_master", [], 0)
        const [y, v] = h.state().players
        expect(y.rifle - 50).toBeCloseTo(3 * trainingAgeFactor(20))
        expect(v.rifle - 50).toBeCloseTo(3 * trainingAgeFactor(30))
        expect(v.rifle - 50).toBeLessThan(y.rifle - 50)

        const coach = { id: "c1", teamId: "player", role: "coach", stats: { development: 80 }, unlockedTalentIds: [] } as unknown as StaffSaveData
        const h2 = makeHarness(makeBaseState({
            players: [makePlayer("young", { age: 20, rifle: 50, potential: 90, personality: { archetype: "LEADER" } as never })],
            teams: [makeTeam("player", ["young"], { facilities: [{ type: "TRAINING", level: 2 }] as never })],
            staff: [coach],
        }))
        createTeamDrillsSlice(h2.set, h2.get).runTeamDrill("recoil_master", [], 0)
        expect(h2.state().players[0].rifle - 50).toBeGreaterThan(y.rifle - 50)
    })

    test("SQUAD-01: ten drills in a week no longer take a 26-year-old from 49 to his ceiling", () => {
        const p1 = makePlayer("p1", { age: 26, skill: 49, rifle: 40, reaction: 53, potential: 70, fatigue: 0, personality: { archetype: "LEADER" } as never })
        const h = makeHarness(makeBaseState({ players: [p1], teams: [makeTeam("player", ["p1"])], staff: [] }))
        const slice = createTeamDrillsSlice(h.set, h.get)
        for (let i = 0; i < 10; i++) {
            h.set(st => { st.players[0].fatigue = 0 })
            expect(slice.runTeamDrill("deathmatch_hour", [], 0).success).toBe(true)
        }
        // 10 × Skill +2 × 0.24 (age 26) = +4.8, not +20.
        expect(h.state().players[0].skill).toBeCloseTo(49 + 10 * 2 * trainingAgeFactor(26))
        expect(h.state().players[0].skill).toBeLessThan(55)
    })

    test("morale and health move by the listed amount (not development)", () => {
        const p1 = makePlayer("p1", { morale: 50, age: 30 })
        const h = makeHarness(makeBaseState({ players: [p1], teams: [makeTeam("player", ["p1"])] }))
        createTeamDrillsSlice(h.set, h.get).runTeamDrill("team_dinner", [], 0)
        expect(h.state().players[0].morale).toBe(53)
    })

    test("stat gains clamp at 100", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1", { rifle: 99, potential: 100 })],
            teams: [makeTeam("player", ["p1"])],
        }))
        const slice = createTeamDrillsSlice(h.set, h.get)
        slice.runTeamDrill("recoil_master", [{ stat: "rifle", amount: 50 }], 5)
        expect(h.state().players[0].rifle).toBe(100)
    })

    test("drill gains respect potential — can't grind a stat past it (G3)", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1", { rifle: 69, potential: 70 })],
            teams: [makeTeam("player", ["p1"])],
        }))
        const slice = createTeamDrillsSlice(h.set, h.get)
        slice.runTeamDrill("recoil_master", [{ stat: "rifle", amount: 50 }], 5)
        // 69 + catalog gain 3 is capped at potential 70.
        expect(h.state().players[0].rifle).toBe(70)
    })

    test("a stat already above potential is held, never reduced (G3)", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1", { rifle: 90, potential: 80 })],
            teams: [makeTeam("player", ["p1"])],
        }))
        const slice = createTeamDrillsSlice(h.set, h.get)
        slice.runTeamDrill("recoil_master", [{ stat: "rifle", amount: 5 }], 5)
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
        slice.runTeamDrill("recoil_master", [{ stat: "RIFLE", amount: 1 }], 5)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wm = (h.state().players[0] as any).weaponMastery
        expect(wm).toBeDefined()
        expect(wm.RIFLE).toBeDefined()
        expect(wm.RIFLE).toBeGreaterThan(0)
    })

    test("SQUAD-02: a team drill adds a little mastery XP, and none to a mastered weapon", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1", { weaponMastery: { RIFLE: 1000, PISTOL: 100 } } as never)],
            teams: [makeTeam("player", ["p1"])],
        }))
        const slice = createTeamDrillsSlice(h.set, h.get)
        slice.runTeamDrill("recoil_master", [], 0)
        slice.runTeamDrill("pistol_precision", [], 0)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wm = (h.state().players[0] as any).weaponMastery
        expect(wm.RIFLE).toBe(1000)
        expect(wm.PISTOL).toBe(100 + TEAM_DRILL_MASTERY_XP)
        // The paid Pistol Precision weapon drill (45 XP, one player) stays the stronger option.
        expect(TEAM_DRILL_MASTERY_XP).toBeLessThan(45)
    })

    test("non-weapon stat gains do NOT touch weaponMastery", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1")],
            teams: [makeTeam("player", ["p1"])],
        }))
        const slice = createTeamDrillsSlice(h.set, h.get)
        slice.runTeamDrill("surf_utopia", [{ stat: "focus", amount: 2 }], 5)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((h.state().players[0] as any).weaponMastery).toBeUndefined()
    })
})
