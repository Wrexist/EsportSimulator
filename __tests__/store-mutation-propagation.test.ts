/**
 * Regression test for the cross-cutting "_teamIndex / _playerIndex stale
 * draft" bug that hid sponsor signings, academy builds, facility upgrades,
 * and many other team mutations from the UI.
 *
 * Background: the store kept Map indexes (_teamIndex, _playerIndex, ...)
 * built once at hydrate/save-load. Every mutating action read via:
 *
 *     const team = state._teamIndex?.get(id) ?? state.teams.find(...)
 *
 * Under Immer, the same object referenced from a Map AND an Array does NOT
 * share a draft — mutations through Map.get() update only the Map; the
 * Array slot stays pointing at the original object. Since the UI reads
 * through state.teams (e.g. useCurrentTeam → teams.find), every such
 * mutation became invisible until the next weekly tick replaced the array
 * wholesale.
 *
 * This file pins the contract: after any slice action mutates a team or
 * player, state.teams[i] / state.players[i] MUST reflect the change.
 */

import { produce, enableMapSet } from "immer"
import { createTeamFacilitiesSlice } from "@/store/slices/team-facilities-slice"
import { createAcademySlice } from "@/store/slices/academy-slice"
import { createTeamSettingsSlice } from "@/store/slices/team-settings-slice"
import { buildEntityIndexes } from "@/store/indexes"
import type { TeamSaveData, SponsorSaveData } from "@/engine/save-types"
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

function makeTeam(id: string, overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(),
        budget: 1_000_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1, leagueTier: "B_TIER",
        elo: 1500, recentForm: [], worldRanking: 5,
        ...overrides,
    } as unknown as TeamSaveData
}

function makeBaseState(overrides: Partial<StoreState> = {}): Partial<StoreState> {
    const team = makeTeam("player")
    const base = {
        teams: [team],
        players: [],
        contracts: [],
        staff: [],
        scheduledMatches: [],
        completedMatches: [],
        tournaments: [],
        financeLedger: [],
        newsFeed: [],
        eventsLog: [],
        sponsorOffers: [],
        academyPlayers: [],
        academyPendingProspects: [],
        academyMatchHistory: [],
        academyWeeklyReports: [],
        academyScoutingMissions: [],
        academyRoster: {},
        academyTrainingSchedule: {},
        currentWeek: 5,
        playerTeamId: "player",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    }
    // Build the indexes (this is what triggers the bug — when the index
    // has an entry, the `_teamIndex?.get() ?? .find()` pattern picks the
    // Map reference and mutations stop propagating to state.teams).
    const indexes = buildEntityIndexes(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        base.teams as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        base.players as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        base.contracts as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        base.staff as any,
        base.completedMatches,
    )
    return { ...base, ...indexes } as Partial<StoreState>
}

describe("store mutation propagation through entity indexes", () => {
    test("signSponsor — sponsor lands in state.teams[i].sponsors (not only in _teamIndex)", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", {
                worldRanking: 5, budget: 1_000_000, sponsors: [],
                trophies: [{ tier: "S_TIER" } as never],
            })],
        }))
        // Rebuild indexes after team override.
        const s0 = h.state()
        Object.assign(s0, buildEntityIndexes(
            s0.teams, s0.players, s0.contracts, s0.staff, s0.completedMatches
        ))

        const facilities = createTeamFacilitiesSlice(h.set, h.get)
        const sponsor: SponsorSaveData = {
            id: "spon_test_1",
            name: "TestSponsor",
            tier: "ELITE",
            weeklyPayout: 10000,
            remainingWeeks: 20,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any

        const result = facilities.signSponsor("player", sponsor)
        expect(result.success).toBe(true)

        const teamFromArray = h.state().teams.find(t => t.id === "player")
        expect(teamFromArray?.sponsors?.length).toBe(1)
        expect(teamFromArray?.sponsors?.[0].name).toBe("TestSponsor")
    })

    test("signSponsor — slot count visible in state.teams after 3 different-tier signings", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", {
                worldRanking: 5, budget: 5_000_000, sponsors: [],
                trophies: [{ tier: "S_TIER" } as never],
            })],
        }))
        const s0 = h.state()
        Object.assign(s0, buildEntityIndexes(
            s0.teams, s0.players, s0.contracts, s0.staff, s0.completedMatches
        ))

        const facilities = createTeamFacilitiesSlice(h.set, h.get)
        const mk = (id: string, tier: SponsorSaveData["tier"]) => ({
            id, name: `S_${id}`, tier, weeklyPayout: 5000, remainingWeeks: 10,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any

        expect(facilities.signSponsor("player", mk("s1", "STANDARD")).success).toBe(true)
        expect(facilities.signSponsor("player", mk("s2", "PREMIUM")).success).toBe(true)
        expect(facilities.signSponsor("player", mk("s3", "ELITE")).success).toBe(true)

        const team = h.state().teams.find(t => t.id === "player")
        expect(team?.sponsors?.length).toBe(3)
    })

    test("buildAcademy — academyFacility lands in state.teams[i] (not only in _teamIndex)", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 500_000 })],
        }))
        const s0 = h.state()
        Object.assign(s0, buildEntityIndexes(
            s0.teams, s0.players, s0.contracts, s0.staff, s0.completedMatches
        ))

        const academy = createAcademySlice(h.set, h.get)
        const result = academy.buildAcademy("player")
        expect(result.success).toBe(true)

        const team = h.state().teams.find(t => t.id === "player")
        expect(team?.academyFacility?.level).toBe(1)
    })

    test("upgradeFacility — new facility lands in state.teams[i].facilities", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { budget: 500_000, facilities: [] })],
        }))
        const s0 = h.state()
        Object.assign(s0, buildEntityIndexes(
            s0.teams, s0.players, s0.contracts, s0.staff, s0.completedMatches
        ))

        const facilities = createTeamFacilitiesSlice(h.set, h.get)
        facilities.upgradeFacility("player", "TRAINING")

        const team = h.state().teams.find(t => t.id === "player")
        expect(team?.facilities?.length).toBe(1)
        expect(team?.facilities?.[0].type).toBe("TRAINING")
        expect(team?.facilities?.[0].level).toBe(1)
    })

    test("setPlaystyle — playstyle change visible on state.teams[i]", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { playstyle: "default" })],
        }))
        const s0 = h.state()
        Object.assign(s0, buildEntityIndexes(
            s0.teams, s0.players, s0.contracts, s0.staff, s0.completedMatches
        ))

        const settings = createTeamSettingsSlice(h.set, h.get)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        settings.setPlaystyle("player", "aggressive" as any)

        const team = h.state().teams.find(t => t.id === "player")
        expect(team?.playstyle).toBe("aggressive")
    })

    test("toggleMerchItem — activeMerchItems update visible on state.teams[i]", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("player", { merchStoreLevel: 1 })],
        }))
        const s0 = h.state()
        Object.assign(s0, buildEntityIndexes(
            s0.teams, s0.players, s0.contracts, s0.staff, s0.completedMatches
        ))

        const facilities = createTeamFacilitiesSlice(h.set, h.get)
        facilities.toggleMerchItem("player", "JERSEY")

        const team = h.state().teams.find(t => t.id === "player")
        expect(team?.activeMerchItems).toContain("JERSEY")
    })
})
