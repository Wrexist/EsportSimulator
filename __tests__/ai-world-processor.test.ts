/**
 * Tests for ai-world-processor — focused on `generateYouthIntake`, which
 * is the locally-implemented (non-AIManager) side of the season-end tick.
 *
 * Background: Phase S found a real bug here — youth prospects were
 * created without `energy` or `maxEnergy`, which silently broke the
 * finite-numeric invariant ~200 weeks into a career fuzz. The bug was
 * fixed at the source; these tests lock the prospect shape and the
 * trigger conditions so a similar omission can't slip back in.
 *
 * Coverage:
 *   - Off-season weeks (not divisible by 52) trigger zero intake
 *   - Below-level-3 TRAINING facility: zero intake
 *   - Level 3 or 4: exactly 1 prospect
 *   - Level 5+: exactly 2 prospects
 *   - Prospect shape: every required numeric field is finite (regression
 *     pin for the Phase S `energy=undefined` bug — including energy,
 *     maxEnergy, morale, fatigue, skill, potential)
 *   - Academy entry is created alongside each prospect
 *   - Player-team intake surfaces a TRAINING_COMPLETE event
 *   - Non-player team intake does NOT surface a player-facing event
 *
 * We import only `generateYouthIntake` is private; we go through the
 * public `processAIWorldLogic` and check side effects on save.players /
 * save.academyPlayers / save.eventsLog. To avoid wiring up the heavy
 * AIManager call-graph, we use a save shape where only YOUR team has
 * facilities and the AIManager calls become near-no-ops.
 */

import { processAIWorldLogic } from "@/engine/processors/ai-world-processor"
import { SeededRNG } from "@/engine/rng"
import type { GameSave, TeamSaveData } from "@/engine/save-types"

interface YouthPlayer {
    id: string
    energy?: number
    maxEnergy?: number
    morale?: number
    fatigue?: number
    skill?: number
    potential?: number
    form?: number
    health?: number
    rifle?: number
    awp?: number
    pistol?: number
    grenades?: number
    isYouthPlayer?: boolean
}

function makeTeam(id: string, overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(),
        budget: 1_000_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1, leagueTier: "B_TIER",
        elo: 1500, recentForm: [], worldRanking: 50,
        ...overrides,
    } as unknown as TeamSaveData
}

function makeSave(currentWeek: number, teams: TeamSaveData[]): GameSave {
    return {
        currentWeek,
        playerTeamId: "player",
        teams,
        players: [],
        contracts: [],
        staff: [],
        marketStaff: [],
        academyPlayers: [],
        scheduledMatches: [],
        completedMatches: [],
        scheduledActivities: [],
        financeLedger: [],
        eventsLog: [],
        newsFeed: [],
        tournaments: [],
        tournamentQualifications: [],
        lastRngSeed: 12345,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as GameSave
}

describe("processAIWorldLogic — youth intake gating", () => {
    test("off-season week (51) does NOT trigger youth intake even with level-5 facility", () => {
        const save = makeSave(51, [
            makeTeam("player", {
                facilities: [{ id: "f1", type: "TRAINING", level: 5, description: "", monthlyCost: 0 } as never],
            }),
        ])
        const before = save.players.length
        processAIWorldLogic(save, "player", new SeededRNG(1))
        // No NEW players from youth intake (off-season).
        expect(save.players.length).toBe(before)
        expect(save.academyPlayers.length).toBe(0)
    })

    test("week 52 + facility < 3 → no intake", () => {
        const save = makeSave(52, [
            makeTeam("player", {
                facilities: [{ id: "f1", type: "TRAINING", level: 2, description: "", monthlyCost: 0 } as never],
            }),
        ])
        processAIWorldLogic(save, "player", new SeededRNG(1))
        expect(save.players.length).toBe(0)
        expect(save.academyPlayers.length).toBe(0)
    })

    test("week 52 + facility level 3 → exactly 1 prospect", () => {
        const save = makeSave(52, [
            makeTeam("player", {
                facilities: [{ id: "f1", type: "TRAINING", level: 3, description: "", monthlyCost: 0 } as never],
            }),
        ])
        processAIWorldLogic(save, "player", new SeededRNG(1))
        expect(save.players.length).toBe(1)
        expect(save.academyPlayers.length).toBe(1)
    })

    test("week 52 + facility level 5 → exactly 2 prospects", () => {
        const save = makeSave(52, [
            makeTeam("player", {
                facilities: [{ id: "f1", type: "TRAINING", level: 5, description: "", monthlyCost: 0 } as never],
            }),
        ])
        processAIWorldLogic(save, "player", new SeededRNG(1))
        expect(save.players.length).toBe(2)
        expect(save.academyPlayers.length).toBe(2)
    })
})

describe("processAIWorldLogic — youth prospect shape (Phase S regression)", () => {
    test("every numeric field on a youth prospect is finite", () => {
        // Pre-fix this would have shown energy=undefined and the
        // 500-week fuzz would have caught it. Lock the contract.
        const save = makeSave(52, [
            makeTeam("player", {
                facilities: [{ id: "f1", type: "TRAINING", level: 3, description: "", monthlyCost: 0 } as never],
            }),
        ])
        processAIWorldLogic(save, "player", new SeededRNG(42))
        const prospect = save.players[0] as YouthPlayer
        const finiteFields: Array<keyof YouthPlayer> = [
            "energy", "maxEnergy", "morale", "fatigue",
            "skill", "potential", "form", "health",
            "rifle", "awp", "pistol", "grenades",
        ]
        for (const f of finiteFields) {
            expect(Number.isFinite(prospect[f])).toBe(true)
        }
        expect(prospect.isYouthPlayer).toBe(true)
    })

    test("prospect age lands in the youth range [16, 18]", () => {
        const save = makeSave(52, [
            makeTeam("player", {
                facilities: [{ id: "f1", type: "TRAINING", level: 5, description: "", monthlyCost: 0 } as never],
            }),
        ])
        processAIWorldLogic(save, "player", new SeededRNG(123))
        for (const prospect of save.players) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const age = (prospect as any).age
            expect(age).toBeGreaterThanOrEqual(16)
            expect(age).toBeLessThanOrEqual(18)
        }
    })

    test("prospect potential lands in [60, 89]", () => {
        const save = makeSave(52, [
            makeTeam("player", {
                facilities: [{ id: "f1", type: "TRAINING", level: 5, description: "", monthlyCost: 0 } as never],
            }),
        ])
        processAIWorldLogic(save, "player", new SeededRNG(7))
        for (const prospect of save.players) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pot = (prospect as any).potential
            expect(pot).toBeGreaterThanOrEqual(60)
            expect(pot).toBeLessThanOrEqual(89)
        }
    })
})

describe("processAIWorldLogic — intake event surfacing", () => {
    test("player team's intake surfaces a TRAINING_COMPLETE event", () => {
        const save = makeSave(52, [
            makeTeam("player", {
                facilities: [{ id: "f1", type: "TRAINING", level: 3, description: "", monthlyCost: 0 } as never],
            }),
        ])
        processAIWorldLogic(save, "player", new SeededRNG(1))
        const youthEvent = save.eventsLog.find(e => e.id.startsWith("youth_intake_"))
        expect(youthEvent).toBeDefined()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((youthEvent as any).type).toBe("TRAINING_COMPLETE")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((youthEvent as any).data.title).toBe("Youth Intake Complete")
    })

    test("non-player team's intake does NOT surface a player-facing event", () => {
        const save = makeSave(52, [
            makeTeam("player", { facilities: [] }), // no facility → no youth intake for player
            makeTeam("ai_team", {
                facilities: [{ id: "f1", type: "TRAINING", level: 5, description: "", monthlyCost: 0 } as never],
            }),
        ])
        processAIWorldLogic(save, "player", new SeededRNG(1))
        const youthEvent = save.eventsLog.find(e => e.id.startsWith("youth_intake_"))
        expect(youthEvent).toBeUndefined()
        // But the AI team DID get its 2 youth-intake prospects (level-5
        // facility produces exactly 2). AIManager.processAcademyScouting
        // may add more separately; the youth-intake contract is just
        // "2 ids prefixed `youth_ai_team_52_`".
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const aiYouth = save.players.filter(p => (p as any).id?.startsWith("youth_ai_team_52_"))
        expect(aiYouth.length).toBe(2)
    })
})

describe("processAIWorldLogic — determinism", () => {
    test("same seed produces same prospect roster shape across runs", () => {
        const teams1 = [makeTeam("player", {
            facilities: [{ id: "f1", type: "TRAINING", level: 5, description: "", monthlyCost: 0 } as never],
        })]
        const teams2 = [makeTeam("player", {
            facilities: [{ id: "f1", type: "TRAINING", level: 5, description: "", monthlyCost: 0 } as never],
        })]
        const save1 = makeSave(52, teams1)
        const save2 = makeSave(52, teams2)
        processAIWorldLogic(save1, "player", new SeededRNG(99))
        processAIWorldLogic(save2, "player", new SeededRNG(99))

        expect(save1.players.length).toBe(save2.players.length)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ids1 = save1.players.map(p => (p as any).id).sort()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ids2 = save2.players.map(p => (p as any).id).sort()
        expect(ids1).toEqual(ids2)
    })
})
