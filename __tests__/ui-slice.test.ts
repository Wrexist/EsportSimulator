/**
 * Tests for the UI slice — focused on the non-trivial paths.
 *
 * Trivial setters (setTheme, addToast/removeToast, clearCelebration,
 * clearPendingSeasonRecap, clearLegendPick, setWeeklyActivity) get
 * single happy-path pins. The real value is in:
 *
 *   - selectLegend: pulls a legend out of save.players, reactivates,
 *     adds to roster, writes a high-salary contract ($50k + 500/skill),
 *     dedupes any stale prior contract, pushes to signedLegendIds.
 *     Multiple guards: only candidates from the modal, only with a
 *     valid playerTeamId, no double-roster-add.
 *   - calculateTeamRating: top-5 overall, averaged, 1-decimal float.
 *   - getDateForWeek: week → real Date offset from gameStartDate.
 *   - getUpcomingMatches: filters to player team, sorts by week then
 *     day, slices to limit.
 */

import { produce, enableMapSet } from "immer"
import { createUISlice } from "@/store/slices/ui-slice"
import type { PlayerSaveData, TeamSaveData, MatchSaveData, ContractSaveData } from "@/engine/save-types"
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
        rifle: 70, awp: 60, pistol: 65, grenades: 60, creativity: 60,
        clutch: 60, tactic: 60, leader: 55, teamwork: 65,
        reaction: 70, eyesight: 70,
        morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        skill: 70, potential: 85, productivity: 60, endurance: 70,
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

function makeMatch(id: string, overrides: Partial<MatchSaveData> = {}): MatchSaveData {
    return {
        id, homeTeamId: "player", awayTeamId: "opp",
        tournamentId: null, stage: "Group Stage",
        week: 12, format: "BO3", seed: 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    } as unknown as MatchSaveData
}

function makeBaseState(overrides: Partial<StoreState> = {}): Partial<StoreState> {
    return {
        teams: [makeTeam("player", ["p1"])],
        players: [makePlayer("p1")],
        contracts: [],
        scheduledMatches: [],
        toasts: [],
        signedLegendIds: [],
        currentWeek: 10,
        playerTeamId: "player",
        gameStartDate: new Date("2025-01-06").toISOString(),
        theme: "crystal",
        lastRngSeed: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    }
}

describe("trivial setters", () => {
    test("setTheme writes the theme", () => {
        const h = makeHarness(makeBaseState({ theme: "crystal" }))
        const slice = createUISlice(h.set, h.get)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        slice.setTheme("midnight" as any)
        expect(h.state().theme).toBe("midnight")
    })

    test("addToast/removeToast round-trip", () => {
        const h = makeHarness(makeBaseState())
        const slice = createUISlice(h.set, h.get)
        slice.addToast({ message: "hello", type: "info" })
        expect(h.state().toasts.length).toBe(1)
        const id = h.state().toasts[0].id
        slice.removeToast(id)
        expect(h.state().toasts.length).toBe(0)
    })

    test("clear* setters null out their respective fields", () => {
        const h = makeHarness(makeBaseState({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            pendingCelebration: { type: "TROPHY", payload: {} } as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            pendingSeasonRecap: { season: 1 } as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            pendingLegendPick: { candidates: ["a"] } as any,
        }))
        const slice = createUISlice(h.set, h.get)
        slice.clearCelebration()
        slice.clearPendingSeasonRecap()
        slice.clearLegendPick()
        expect(h.state().pendingCelebration).toBeNull()
        expect(h.state().pendingSeasonRecap).toBeNull()
        expect(h.state().pendingLegendPick).toBeNull()
    })
})

describe("selectLegend", () => {
    test("happy path: reactivates legend, adds to roster, writes high-salary contract, marks signed", () => {
        const legend = makePlayer("legend_1", {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            isRetired: true, retirementWeek: 200, skill: 95,
        } as Partial<PlayerSaveData>)
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1"), legend],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            pendingLegendPick: { candidates: ["legend_1", "legend_2"] } as any,
        }))
        const slice = createUISlice(h.set, h.get)
        slice.selectLegend("legend_1")
        const updated = h.state().players.find(p => p.id === "legend_1")!
        expect(updated.isRetired).toBe(false)
        expect(updated.retirementWeek).toBeUndefined()
        expect(h.state().teams[0].rosterIds).toContain("legend_1")
        const contract = h.state().contracts.find(c => c.playerId === "legend_1")
        expect(contract).toBeDefined()
        // $50k + 500*skill (95) = 97500
        expect(contract!.salaryPerWeek).toBe(97500)
        expect(contract!.endWeek).toBe(10 + 104)
        expect(h.state().signedLegendIds).toContain("legend_1")
        // Modal cleared.
        expect(h.state().pendingLegendPick).toBeNull()
    })

    test("rejects legend id not in the modal candidates list", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1"), makePlayer("legend_1", { isRetired: true } as Partial<PlayerSaveData>)],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            pendingLegendPick: { candidates: ["legend_OTHER"] } as any,
        }))
        const slice = createUISlice(h.set, h.get)
        slice.selectLegend("legend_1")
        // Not in candidates → no-op.
        const updated = h.state().players.find(p => p.id === "legend_1")!
        expect(updated.isRetired).toBe(true)
        expect(h.state().teams[0].rosterIds).not.toContain("legend_1")
    })

    test("no-op when there's no pendingLegendPick", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("p1"), makePlayer("legend_1")],
        }))
        const slice = createUISlice(h.set, h.get)
        slice.selectLegend("legend_1")
        expect(h.state().teams[0].rosterIds).not.toContain("legend_1")
    })

    test("drops stale prior contract for the same player before writing the new one", () => {
        const h = makeHarness(makeBaseState({
            players: [makePlayer("legend_1", { isRetired: true } as Partial<PlayerSaveData>)],
            // Pre-existing stale contract for legend_1
            contracts: [{
                playerId: "legend_1", teamId: "ghost_team",
                salaryPerWeek: 1, startWeek: 1, endWeek: 2, buyout: 0,
            }] as ContractSaveData[],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            pendingLegendPick: { candidates: ["legend_1"] } as any,
        }))
        const slice = createUISlice(h.set, h.get)
        slice.selectLegend("legend_1")
        // Exactly one contract for legend_1, and it's the new one (high salary).
        const legendContracts = h.state().contracts.filter(c => c.playerId === "legend_1")
        expect(legendContracts.length).toBe(1)
        expect(legendContracts[0].salaryPerWeek).toBeGreaterThan(1)
    })
})

describe("calculateTeamRating", () => {
    test("returns 0 when no playerTeam exists", () => {
        const h = makeHarness(makeBaseState({ playerTeamId: "ghost" }))
        const slice = createUISlice(h.set, h.get)
        expect(slice.calculateTeamRating()).toBe(0)
    })

    test("returns 0 for an empty roster", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", [])],
            players: [],
        }))
        const slice = createUISlice(h.set, h.get)
        expect(slice.calculateTeamRating()).toBe(0)
    })

    test("computes a finite 1-decimal float from the top-5 overall ratings", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", ["p1", "p2", "p3", "p4", "p5", "p6"])],
            players: [
                makePlayer("p1", { skill: 80 }), makePlayer("p2", { skill: 75 }),
                makePlayer("p3", { skill: 70 }), makePlayer("p4", { skill: 65 }),
                makePlayer("p5", { skill: 60 }), makePlayer("p6", { skill: 50 }),
            ],
        }))
        const slice = createUISlice(h.set, h.get)
        const rating = slice.calculateTeamRating()
        expect(Number.isFinite(rating)).toBe(true)
        expect(rating).toBeGreaterThan(0)
        // 1-decimal rounding contract.
        expect(rating).toBe(parseFloat(rating.toFixed(1)))
    })
})

describe("getUpcomingMatches", () => {
    test("filters to player-team matches at week >= currentWeek and sorts", () => {
        const h = makeHarness(makeBaseState({
            currentWeek: 10,
            scheduledMatches: [
                makeMatch("m_past", { week: 5 }),
                makeMatch("m_future_a", { week: 15 }),
                makeMatch("m_future_b", { week: 11 }),
                makeMatch("m_unrelated", { week: 12, homeTeamId: "ai_1", awayTeamId: "ai_2" }),
            ],
        }))
        const slice = createUISlice(h.set, h.get)
        const upcoming = slice.getUpcomingMatches()
        // Past + unrelated filtered out; future sorted ascending.
        const ids = upcoming.map(m => m.id)
        expect(ids).toEqual(["m_future_b", "m_future_a"])
    })

    test("limit parameter caps the result count", () => {
        const matches = Array.from({ length: 10 }, (_, i) =>
            makeMatch(`m${i}`, { week: 11 + i })
        )
        const h = makeHarness(makeBaseState({ scheduledMatches: matches }))
        const slice = createUISlice(h.set, h.get)
        expect(slice.getUpcomingMatches(3).length).toBe(3)
    })
})

describe("getDateForWeek", () => {
    test("week 1 returns the gameStartDate; week N+1 is 7 days later", () => {
        const start = new Date("2025-01-06")
        const h = makeHarness(makeBaseState({ gameStartDate: start.toISOString() }))
        const slice = createUISlice(h.set, h.get)
        const d1 = slice.getDateForWeek(1)
        const d2 = slice.getDateForWeek(2)
        expect(d1.toDateString()).toBe(start.toDateString())
        const diffDays = (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)
        expect(diffDays).toBe(7)
    })
})
