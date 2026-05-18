/**
 * Tests for the match-operations slice.
 *
 * Three actions, all money-touching:
 *   - updateScheduledMatch: heavy sanitization on every writable field
 *     (vetoComplete only with non-empty maps; maps deduped + length-capped
 *     by format; mapStartingSides only for teams playing this match and
 *     maps in the resolved pool)
 *   - performVODReview: one-shot $cost gate + +25 tacticalPrep + ledger
 *   - performMentalReset: $cost gate + +15 morale to all roster (clamped
 *     to 100) + optional match.mentalPrep flag + ledger
 */

import { produce, enableMapSet } from "immer"
import { createMatchOperationsSlice } from "@/store/slices/match-operations-slice"
import { VOD_REVIEW_COST, MENTAL_RESET_COST } from "@/store/utils/helpers"
import type { MatchSaveData, TeamSaveData, PlayerSaveData } from "@/engine/save-types"
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

function makeMatch(id: string, overrides: Partial<MatchSaveData> = {}): MatchSaveData {
    return {
        id, homeTeamId: "player", awayTeamId: "opp",
        tournamentId: null, stage: "Group Stage",
        week: 12, format: "BO3", seed: 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    } as unknown as MatchSaveData
}

function makeTeam(id: string, overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(),
        budget: 100_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1, leagueTier: "B_TIER",
        elo: 1500, recentForm: [],
        ...overrides,
    } as unknown as TeamSaveData
}

function makePlayer(id: string, morale = 60): PlayerSaveData {
    return {
        id, nickname: id, firstName: id, lastName: "P",
        age: 22, nationality: "US", role: "RIFLER",
        rifle: 70, awp: 60, pistol: 65, grenades: 60, creativity: 60,
        clutch: 60, tactic: 60, leader: 55, teamwork: 65,
        reaction: 70, eyesight: 70,
        morale, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        skill: 70, potential: 85, productivity: 60, endurance: 70,
    } as unknown as PlayerSaveData
}

function makeBaseState(overrides: Partial<StoreState> = {}): Partial<StoreState> {
    return {
        teams: [makeTeam("player", { rosterIds: ["p1", "p2"] })],
        players: [makePlayer("p1"), makePlayer("p2")],
        scheduledMatches: [],
        financeLedger: [],
        currentWeek: 10,
        playerTeamId: "player",
        lastRngSeed: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    }
}

describe("updateScheduledMatch — sanitization", () => {
    test("unknown match id is a no-op", () => {
        const h = makeHarness(makeBaseState())
        const slice = createMatchOperationsSlice(h.set, h.get)
        expect(() => slice.updateScheduledMatch("ghost", { vetoComplete: true })).not.toThrow()
    })

    test("vetoComplete is rejected when no maps resolved (otherwise engine picks from empty pool)", () => {
        const h = makeHarness(makeBaseState({
            scheduledMatches: [makeMatch("m1", { maps: [] })],
        }))
        const slice = createMatchOperationsSlice(h.set, h.get)
        slice.updateScheduledMatch("m1", { vetoComplete: true })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((h.state().scheduledMatches[0] as any).vetoComplete).not.toBe(true)
    })

    test("vetoComplete WITH a valid map pool is accepted", () => {
        const h = makeHarness(makeBaseState({
            scheduledMatches: [makeMatch("m1")],
        }))
        const slice = createMatchOperationsSlice(h.set, h.get)
        // de_mirage is a real ALLOWED_MAP_ID; pin a BO1 → 1 map.
        slice.updateScheduledMatch("m1", {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            maps: ["Mirage"] as any,
            vetoComplete: true,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((h.state().scheduledMatches[0] as any).vetoComplete).toBe(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((h.state().scheduledMatches[0] as any).maps).toEqual(["Mirage"])
    })

    test("maps array: unknown map ids are filtered out", () => {
        const h = makeHarness(makeBaseState({
            scheduledMatches: [makeMatch("m1")],
        }))
        const slice = createMatchOperationsSlice(h.set, h.get)
        slice.updateScheduledMatch("m1", {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            maps: ["Mirage", "de_FAKE_MAP", "Inferno"] as any,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = (h.state().scheduledMatches[0] as any).maps
        // Real maps survive; the fake one is filtered.
        expect(result).toContain("Mirage")
        expect(result).toContain("Inferno")
        expect(result).not.toContain("de_FAKE_MAP")
    })

    test("maps array deduplicated even if caller passes the same map twice", () => {
        const h = makeHarness(makeBaseState({
            scheduledMatches: [makeMatch("m1")],
        }))
        const slice = createMatchOperationsSlice(h.set, h.get)
        slice.updateScheduledMatch("m1", {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            maps: ["Mirage", "Mirage", "Inferno"] as any,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = (h.state().scheduledMatches[0] as any).maps
        expect(result.length).toBe(2) // dedup
    })

    test("BO1 caps maps array length at 1 even if caller passes 5", () => {
        const h = makeHarness(makeBaseState({
            scheduledMatches: [makeMatch("m1", { format: "BO1" })],
        }))
        const slice = createMatchOperationsSlice(h.set, h.get)
        slice.updateScheduledMatch("m1", {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            maps: ["Mirage", "Inferno", "Sandstone", "Nuke", "Overpass"] as any,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((h.state().scheduledMatches[0] as any).maps.length).toBe(1)
    })
})

describe("performVODReview", () => {
    test("debits cost + bumps tacticalPrep +25 + writes ledger row", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 50_000, tacticalPrep: 30 })],
            scheduledMatches: [makeMatch("m1")],
        }))
        const slice = createMatchOperationsSlice(h.set, h.get)
        slice.performVODReview("m1")
        expect(h.state().teams[0].budget).toBe(50_000 - VOD_REVIEW_COST)
        expect(h.state().teams[0].tacticalPrep).toBe(55)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((h.state().scheduledMatches[0] as any).vodReviewed).toBe(true)
        const row = h.state().financeLedger.find(e => e.category === "FACILITIES")
        expect(row).toBeDefined()
        expect(row!.amount).toBe(VOD_REVIEW_COST)
    })

    test("one-shot: subsequent VOD reviews on the same match are refused", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 50_000, tacticalPrep: 30 })],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            scheduledMatches: [makeMatch("m1", { vodReviewed: true } as any)],
        }))
        const slice = createMatchOperationsSlice(h.set, h.get)
        slice.performVODReview("m1")
        expect(h.state().teams[0].budget).toBe(50_000) // unchanged
        expect(h.state().teams[0].tacticalPrep).toBe(30) // unchanged
    })

    test("refuses on insufficient budget", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 100, tacticalPrep: 30 })],
            scheduledMatches: [makeMatch("m1")],
        }))
        const slice = createMatchOperationsSlice(h.set, h.get)
        slice.performVODReview("m1")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((h.state().scheduledMatches[0] as any).vodReviewed).not.toBe(true)
        expect(h.state().teams[0].budget).toBe(100)
    })

    test("refuses on past-week match (already happened)", () => {
        const h = makeHarness(makeBaseState({
            currentWeek: 20,
            teams: [makeTeam("player", { budget: 50_000, tacticalPrep: 30 })],
            scheduledMatches: [makeMatch("m1", { week: 5 })],
        }))
        const slice = createMatchOperationsSlice(h.set, h.get)
        slice.performVODReview("m1")
        expect(h.state().teams[0].budget).toBe(50_000)
    })

    test("refuses when player team isn't actually playing the match", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 50_000 })],
            scheduledMatches: [makeMatch("m1", { homeTeamId: "ai_a", awayTeamId: "ai_b" })],
        }))
        const slice = createMatchOperationsSlice(h.set, h.get)
        slice.performVODReview("m1")
        expect(h.state().teams[0].budget).toBe(50_000) // unchanged
    })
})

describe("performMentalReset", () => {
    test("happy path: debits cost + +15 morale across roster + ledger", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 50_000, rosterIds: ["p1", "p2"] })],
            players: [makePlayer("p1", 50), makePlayer("p2", 60)],
        }))
        const slice = createMatchOperationsSlice(h.set, h.get)
        slice.performMentalReset()
        expect(h.state().teams[0].budget).toBe(50_000 - MENTAL_RESET_COST)
        expect(h.state().players[0].morale).toBe(65)
        expect(h.state().players[1].morale).toBe(75)
        const row = h.state().financeLedger.find(e => e.category === "WAGES_STAFF")
        expect(row).toBeDefined()
    })

    test("morale clamps at 100", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 50_000, rosterIds: ["p1"] })],
            players: [makePlayer("p1", 95)],
        }))
        const slice = createMatchOperationsSlice(h.set, h.get)
        slice.performMentalReset()
        expect(h.state().players[0].morale).toBe(100)
    })

    test("with matchId: flags match.mentalPrep + mentalPrepTeamId", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 50_000, rosterIds: ["p1"] })],
            players: [makePlayer("p1")],
            scheduledMatches: [makeMatch("m1")],
        }))
        const slice = createMatchOperationsSlice(h.set, h.get)
        slice.performMentalReset("m1")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((h.state().scheduledMatches[0] as any).mentalPrep).toBe(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((h.state().scheduledMatches[0] as any).mentalPrepTeamId).toBe("player")
    })

    test("refuses on insufficient budget", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 100, rosterIds: ["p1"] })],
            players: [makePlayer("p1", 50)],
        }))
        const slice = createMatchOperationsSlice(h.set, h.get)
        slice.performMentalReset()
        expect(h.state().teams[0].budget).toBe(100)
        expect(h.state().players[0].morale).toBe(50) // unchanged
    })
})
