/**
 * Tests for the academy slice in isolation.
 *
 * Uses the same immer harness pattern as transfer-contract-slice.test.ts:
 * a fake (set, get) pair where each `set((draft) => ...)` callback is
 * wrapped in `immer.produce`, so the slice's draft-style writes land
 * on a fresh immutable state. No real store boot, no jsdom, no worker
 * bridge — just the slice creator under test.
 *
 * Coverage targets:
 *   - buildAcademy: cost gate, idempotency (no double-build), facility
 *     gets level=1 + builtWeek timestamp.
 *   - upgradeAcademy: gate on existing academy, max-level gate,
 *     incremental upgrade-cost guard, level increments by 1.
 *   - enrollProspect: needs an academy, refuses dup enrollment, refuses
 *     at capacity, succeeds and pushes a fully-shaped AcademyPlayer.
 *   - updateAcademyRoster / updateAcademySchedule: the two pinned
 *     signatures from Phase R land on the right keys. These were
 *     the spots where a type mismatch (string-vs-number day index)
 *     used to mask the actual runtime shape.
 */

import { produce, enableMapSet } from "immer"
import { createAcademySlice } from "@/store/slices/academy-slice"
import { ACADEMY_LEVELS } from "@/engine/academy-constants"
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

function makePlayer(id: string, nickname = id): PlayerSaveData {
    return {
        id, nickname, firstName: id, lastName: "Test",
        age: 19, nationality: "US", role: "RIFLER",
        rifle: 60, awp: 50, pistol: 55, grenades: 50, creativity: 55,
        clutch: 50, tactic: 50, leader: 45, teamwork: 55,
        reaction: 60, eyesight: 60,
        morale: 70, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        skill: 60, potential: 80, productivity: 60, endurance: 70,
    } as unknown as PlayerSaveData
}

function makeTeam(id: string, overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(),
        budget: 1_000_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1, leagueTier: "B_TIER",
        elo: 1500, recentForm: [],
        ...overrides,
    } as unknown as TeamSaveData
}

function makeBaseState(overrides: Partial<StoreState> = {}): Partial<StoreState> {
    return {
        teams: [makeTeam("player")],
        players: [],
        contracts: [],
        staff: [],
        academyPlayers: [],
        academyPendingProspects: [],
        academyRoster: { IGL: null, Entry: null, AWPer: null, Support: null, Rifler: null } as never,
        academyTrainingSchedule: {} as never,
        newsFeed: [],
        eventsLog: [],
        currentWeek: 5,
        playerTeamId: "player",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    }
}

describe("buildAcademy", () => {
    test("debits the team's budget by the level-1 build cost and stamps a facility", () => {
        const cost = ACADEMY_LEVELS[1].buildCost
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: cost + 100 })],
        }))
        const slice = createAcademySlice(h.set, h.get)
        const res = slice.buildAcademy("player")
        expect(res.success).toBe(true)
        const after = h.state().teams[0]
        expect(after.budget).toBe(100)
        expect(after.academyFacility).toBeDefined()
        expect(after.academyFacility!.level).toBe(1)
        expect(after.academyFacility!.builtWeek).toBe(5)
    })

    test("refuses idempotently when the team already has an academy", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", {
                budget: 10_000_000,
                academyFacility: { level: 2, builtWeek: 1 } as never,
            })],
        }))
        const slice = createAcademySlice(h.set, h.get)
        const res = slice.buildAcademy("player")
        expect(res.success).toBe(false)
        expect(res.message).toContain("already exists")
        // Budget untouched.
        expect(h.state().teams[0].budget).toBe(10_000_000)
    })

    test("refuses when budget is below build cost", () => {
        const cost = ACADEMY_LEVELS[1].buildCost
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: cost - 1 })],
        }))
        const slice = createAcademySlice(h.set, h.get)
        const res = slice.buildAcademy("player")
        expect(res.success).toBe(false)
        expect(res.message).toContain("Insufficient funds")
        // Budget untouched.
        expect(h.state().teams[0].budget).toBe(cost - 1)
        expect(h.state().teams[0].academyFacility).toBeUndefined()
    })

    test("returns clean failure when team id is unknown", () => {
        const h = makeHarness(makeBaseState())
        const slice = createAcademySlice(h.set, h.get)
        const res = slice.buildAcademy("ghost_team")
        expect(res.success).toBe(false)
        expect(res.message).toContain("Team not found")
    })
})

describe("upgradeAcademy", () => {
    test("refuses if no academy exists yet", () => {
        const h = makeHarness(makeBaseState())
        const slice = createAcademySlice(h.set, h.get)
        const res = slice.upgradeAcademy("player")
        expect(res.success).toBe(false)
        expect(res.message).toContain("Build academy first")
    })

    test("upgrades level 1 → 2 and records lastUpgradeWeek", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", {
                budget: 10_000_000,
                academyFacility: { level: 1, builtWeek: 1 } as never,
            })],
            currentWeek: 30,
        }))
        const slice = createAcademySlice(h.set, h.get)
        const res = slice.upgradeAcademy("player")
        expect(res.success).toBe(true)
        const fac = h.state().teams[0].academyFacility!
        expect(fac.level).toBe(2)
        expect((fac as never as { lastUpgradeWeek: number }).lastUpgradeWeek).toBe(30)
    })

    test("refuses upgrade past the max level (5)", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", {
                budget: 10_000_000,
                academyFacility: { level: 5, builtWeek: 1 } as never,
            })],
        }))
        const slice = createAcademySlice(h.set, h.get)
        const res = slice.upgradeAcademy("player")
        expect(res.success).toBe(false)
        expect(res.message).toContain("maximum level")
        // Level didn't go past 5.
        expect(h.state().teams[0].academyFacility!.level).toBe(5)
    })
})

describe("enrollProspect", () => {
    test("requires an academy", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1")],
        }))
        const slice = createAcademySlice(h.set, h.get)
        const res = slice.enrollProspect("p1")
        expect(res.success).toBe(false)
        expect(res.message).toContain("Build academy first")
    })

    test("pushes a fully-shaped AcademyPlayer entry on success", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", {
                academyFacility: { level: 1, builtWeek: 1 } as never,
            })],
            players: [makePlayer("p1", "Rookie")],
            currentWeek: 8,
        }))
        const slice = createAcademySlice(h.set, h.get)
        const res = slice.enrollProspect("p1")
        expect(res.success).toBe(true)

        const academy = h.state().academyPlayers
        expect(academy.length).toBe(1)
        expect(academy[0].playerId).toBe("p1")
        expect(academy[0].enrolledWeek).toBe(8)
        expect(academy[0].trainingFocus).toBe("BALANCED")
        expect(academy[0].developmentProgress).toBe(0)
        expect(academy[0].readyForPromotion).toBe(false)
        // Default academy level (1) keeps potential hidden — only level 5
        // (or an Eagle-Eye scout) reveals on enroll.
        expect(academy[0].potentialRevealed).toBe(false)
        expect(academy[0].energy).toBe(100)
    })

    test("rejects duplicate enrollment", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", {
                academyFacility: { level: 1, builtWeek: 1 } as never,
            })],
            players: [makePlayer("p1")],
        }))
        const slice = createAcademySlice(h.set, h.get)
        slice.enrollProspect("p1")
        const second = slice.enrollProspect("p1")
        expect(second.success).toBe(false)
        expect(second.message).toContain("already in academy")
        // Still one entry only.
        expect(h.state().academyPlayers.length).toBe(1)
    })

    test("refuses when academy is at capacity", () => {
        // Level 1 caps at 3 prospects (per ACADEMY_LEVELS[1].maxProspects).
        const max = ACADEMY_LEVELS[1].maxProspects
        const players = Array.from({ length: max + 1 }, (_, i) => makePlayer(`p${i}`))
        const existingAcademy = players.slice(0, max).map((p, i) => ({
            id: `acad_${i}`, playerId: p.id, enrolledWeek: 1, trainingFocus: "BALANCED",
            developmentProgress: 0, potentialRevealed: false, totalXpGained: 0,
            academyMatchesPlayed: 0, readyForPromotion: false,
            scoutNotes: "", energy: 100,
        }))
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", {
                academyFacility: { level: 1, builtWeek: 1 } as never,
            })],
            players,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            academyPlayers: existingAcademy as any,
        }))
        const slice = createAcademySlice(h.set, h.get)
        const res = slice.enrollProspect(`p${max}`) // the (max+1)th candidate
        expect(res.success).toBe(false)
        expect(res.message).toContain("full capacity")
    })
})

describe("updateAcademyRoster + updateAcademySchedule", () => {
    test("updateAcademyRoster slots a prospect into a role and accepts null to clear", () => {
        const h = makeHarness(makeBaseState())
        const slice = createAcademySlice(h.set, h.get)
        slice.updateAcademyRoster("AWPer", "acad_1")
        expect((h.state().academyRoster as Record<string, string | null>).AWPer).toBe("acad_1")
        slice.updateAcademyRoster("AWPer", null)
        expect((h.state().academyRoster as Record<string, string | null>).AWPer).toBeNull()
    })

    test("updateAcademySchedule writes drill IDs keyed by NUMERIC day", () => {
        // The fact this slot is number-indexed (not string-indexed) was
        // the Phase R signature-mismatch fix. Pin it explicitly.
        const h = makeHarness(makeBaseState())
        const slice = createAcademySlice(h.set, h.get)
        slice.updateAcademySchedule(0, "drill_aim")
        slice.updateAcademySchedule(3, "drill_strats")
        slice.updateAcademySchedule(5, null)
        const schedule = h.state().academyTrainingSchedule as Record<number, string | null>
        expect(schedule[0]).toBe("drill_aim")
        expect(schedule[3]).toBe("drill_strats")
        expect(schedule[5]).toBeNull()
    })
})
