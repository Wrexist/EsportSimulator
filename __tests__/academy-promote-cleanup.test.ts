/**
 * Regression for promote-stale-devmatch-slot.
 *
 * releaseProspect clears any academyRoster dev-match slot pointing at the
 * removed prospect, but promoteProspect used to leave the stale academy id in
 * its role slot. scheduleDevMatch resolves starters by matching academyPlayers
 * ids to the slot values, so a promoted starter silently dropped the starter
 * count below 5 and blocked dev matches until manually re-assigned.
 */

import { produce, enableMapSet } from "immer"
import { createAcademySlice } from "@/store/slices/academy-slice"
import type { PlayerSaveData, TeamSaveData } from "@/engine/save-types"
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
        age: 18, nationality: "US", role: "AWPER",
        rifle: 60, awp: 60, pistol: 55, grenades: 50, creativity: 55,
        clutch: 50, tactic: 50, leader: 45, teamwork: 55, reaction: 60, eyesight: 60,
        morale: 70, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, talentPoints: 0, unlockedTalentIds: [],
        matchesPlayed: 0, skill: 60, potential: 88,
    } as unknown as PlayerSaveData
}

function makeTeam(id: string, overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(),
        budget: 1_000_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1, leagueTier: "B_TIER",
        elo: 1500, recentForm: [], chemistry: 60,
        academyFacility: { level: 3, builtWeek: 1 },
        ...overrides,
    } as unknown as TeamSaveData
}

function makeState(): Partial<StoreState> {
    return {
        teams: [makeTeam("player")],
        players: [makePlayer("p1")],
        contracts: [],
        staff: [],
        academyPlayers: [{
            id: "acad_1", playerId: "p1", enrolledWeek: 1, trainingFocus: "BALANCED",
            developmentProgress: 90, potentialRevealed: true, totalXpGained: 0,
            academyMatchesPlayed: 0, readyForPromotion: true, scoutNotes: "", energy: 100,
        } as never],
        academyPendingProspects: [],
        academyRoster: { IGL: null, Entry: null, AWPer: "acad_1", Support: null, Rifler: null } as never,
        academyTrainingSchedule: {} as never,
        newsFeed: [],
        eventsLog: [],
        financeLedger: [],
        lastRngSeed: 1,
        currentWeek: 20,
        playerTeamId: "player",
    }
}

describe("promoteProspect — clears the promoted prospect's dev-match slot", () => {
    test("the academyRoster slot pointing at the promoted prospect is nulled", () => {
        const h = makeHarness(makeState())
        const slice = createAcademySlice(h.set, h.get)

        // Slot points at the promoted prospect before promotion.
        expect((h.state().academyRoster as Record<string, string | null>).AWPer).toBe("acad_1")

        const res = slice.promoteProspect("acad_1", { salaryPerWeek: 500, lengthWeeks: 52 })
        expect(res.success).toBe(true)

        // Slot cleared, prospect on the senior roster, academy entry gone.
        expect((h.state().academyRoster as Record<string, string | null>).AWPer).toBeNull()
        expect(h.state().teams[0].rosterIds).toContain("p1")
        expect(h.state().academyPlayers.find(ap => ap.id === "acad_1")).toBeUndefined()
    })
})
