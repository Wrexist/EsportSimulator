/**
 * Regression for fa-release-skips-roster-penalty and
 * promoteplayer-missing-roster-penalty.
 *
 * Every roster-mutation path is supposed to call applyRosterChangePenalty,
 * which is what stamps team.lastRosterChangeWeek (the roster-stability clock
 * that drives weekly chemistry growth + the LOYAL_TEAM achievement) and
 * applies the chemistry hit. The trade path and the academy-slice
 * promoteProspect path both did; the release-to-FA branch and the legacy
 * promotePlayer action did not. These pin that they now do, consistently.
 */

import { produce, enableMapSet } from "immer"
import { createTransferContractSlice } from "@/store/slices/transfer-contract-slice"
import type { PlayerSaveData, TeamSaveData, ContractSaveData } from "@/engine/save-types"
import type { StoreState } from "@/store/types"

enableMapSet()

function makeHarness(initial: Partial<StoreState>) {
    let state = initial as StoreState
    const set = (patch: Partial<StoreState> | ((draft: StoreState) => void)) => {
        if (typeof patch === "function") {
            state = produce(state, patch as (s: StoreState) => void)
        } else {
            state = { ...state, ...patch }
        }
    }
    const get = () => state
    return { state: () => state, set, get }
}

function makePlayer(id: string): PlayerSaveData {
    return {
        id, nickname: id, firstName: id, lastName: "T",
        age: 22, nationality: "US", role: "RIFLER",
        rifle: 60, awp: 55, pistol: 60, grenades: 55, creativity: 60, clutch: 55,
        tactic: 60, leader: 50, teamwork: 60, reaction: 60, eyesight: 60,
        morale: 70, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, talentPoints: 0, unlockedTalentIds: [],
        matchesPlayed: 0, skill: 60, potential: 80,
    } as unknown as PlayerSaveData
}

function makeTeam(id: string, overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(),
        budget: 1_000_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1, leagueTier: "B_TIER",
        elo: 1500, recentForm: [], chemistry: 70, lastRosterChangeWeek: 1,
        ...overrides,
    } as unknown as TeamSaveData
}

function makeState(overrides: Partial<StoreState> = {}): Partial<StoreState> {
    return {
        teams: [],
        players: [],
        contracts: [],
        scheduledMatches: [],
        completedMatches: [],
        financeLedger: [],
        transferHistory: [],
        newsFeed: [],
        eventsLog: [],
        currentWeek: 30,
        playerTeamId: "player",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    }
}

describe("release-to-FA applies the roster-change penalty", () => {
    test("releasing a player stamps lastRosterChangeWeek and dents chemistry", () => {
        const h = makeHarness(makeState({
            teams: [makeTeam("player", { rosterIds: ["p1", "p2"], chemistry: 70, lastRosterChangeWeek: 1 })],
            players: [makePlayer("p1"), makePlayer("p2")],
            contracts: [
                { id: "c1", playerId: "p1", teamId: "player", salaryPerWeek: 1000, startWeek: 1, endWeek: 90, buyout: 5000 } as ContractSaveData,
            ],
        }))
        const slice = createTransferContractSlice(h.set, h.get)
        const res = slice.transferPlayer("p1", "player", "FA", 0)

        expect(res.success).toBe(true)
        const team = h.state().teams[0]
        expect(team.rosterIds).toEqual(["p2"])
        expect(team.lastRosterChangeWeek).toBe(30)
        expect(team.chemistry!).toBeLessThan(70)
    })
})

describe("legacy promotePlayer applies the roster-change penalty", () => {
    test("promoting an academy prospect stamps lastRosterChangeWeek and dents chemistry", () => {
        const h = makeHarness(makeState({
            teams: [makeTeam("player", { rosterIds: ["p2"], chemistry: 70, lastRosterChangeWeek: 1 })],
            players: [makePlayer("p1"), makePlayer("p2")],
            academyPlayers: [{
                id: "acad_1", playerId: "p1", enrolledWeek: 1, trainingFocus: "BALANCED",
                developmentProgress: 90, potentialRevealed: true, totalXpGained: 0,
                academyMatchesPlayed: 0, readyForPromotion: true, scoutNotes: "", energy: 100,
            } as never],
            academyRoster: { IGL: null, Entry: null, AWPer: null, Support: null, Rifler: null } as never,
        }))
        const slice = createTransferContractSlice(h.set, h.get)
        slice.promotePlayer("p1")

        const team = h.state().teams[0]
        expect(team.rosterIds).toContain("p1")
        expect(team.lastRosterChangeWeek).toBe(30)
        expect(team.chemistry!).toBeLessThan(70)
    })
})
