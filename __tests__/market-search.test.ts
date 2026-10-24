/**
 * G8: saved market searches. The board and the weekly alert share one
 * filter; an alert names only players new to a search since the last check,
 * at most one message a week, plus shortlisted contracts entering their
 * final six months.
 */

import type { ContractSaveData, GameSave, PlayerSaveData, TeamSaveData } from "@/engine/save-types"
import {
    DEFAULT_MARKET_CRITERIA, describeCriteria, isNarrowing, marketCandidates, matchesMarketSearch, newSavedSearch, processMarketAlerts,
    SHORTLIST_CONTRACT_ALERT_WEEKS, type MarketCriteria,
} from "@/engine/market-search"

function makePlayer(id: string, overrides: Partial<PlayerSaveData> = {}): PlayerSaveData {
    return {
        id, nickname: id, firstName: id, lastName: "P", age: 22, nationality: "US",
        role: "Rifler",
        rifle: 50, awp: 40, pistol: 50, grenades: 40, creativity: 40, clutch: 40,
        tactic: 50, leader: 40, teamwork: 50, reaction: 50, eyesight: 50,
        morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        salary: 1000, contractWeeks: 52,
        skill: 50, potential: 90, productivity: 60, endurance: 70,
        // Same archetype for every fixture (no training modifier), so each
        // test compares only the variable it sets (Phase 5.2).
        personality: { archetype: "QUIET" },
        ...overrides,
    } as unknown as PlayerSaveData
}

function makeTeam(overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id: "t1", name: "Team", shortName: "T", budget: 100_000,
        rosterIds: [], staffIds: [], trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50, region: "EU",
        facilitiesLevel: 0,
        ...overrides,
    } as unknown as TeamSaveData
}


function world() {
    const mine = makeTeam({ id: "t1", rosterIds: ["m1"] })
    const other = makeTeam({ id: "t2", name: "Rivals", rosterIds: ["o1", "o2"] })
    const players = [
        makePlayer("m1"),
        makePlayer("o1", { role: "AWPER", age: 20 } as Partial<PlayerSaveData>),
        makePlayer("o2", { role: "RIFLER", age: 30 } as Partial<PlayerSaveData>),
        makePlayer("fa", { role: "AWPER", age: 19 } as Partial<PlayerSaveData>),
    ]
    const contracts = [
        { id: "c1", playerId: "o1", teamId: "t2", salaryPerWeek: 1000, endWeek: 10 + SHORTLIST_CONTRACT_ALERT_WEEKS },
        { id: "c2", playerId: "o2", teamId: "t2", salaryPerWeek: 1000, endWeek: 200 },
    ] as unknown as ContractSaveData[]
    return {
        currentWeek: 10, playerTeamId: "t1", teams: [mine, other], players, contracts,
        scoutedPlayers: [], watchlistedPlayerIds: [], academyPlayers: [], academyPendingProspects: [],
        savedSearches: [], eventsLog: [],
    } as unknown as GameSave
}

const youngAwp: MarketCriteria = { ...DEFAULT_MARKET_CRITERIA, role: "AWPER", age: "young" }

describe("market search", () => {
    test("filters like the board and describes itself", () => {
        const save = world()
        const ids = marketCandidates(save).filter(c => matchesMarketSearch(c, youngAwp)).map(c => c.player.id).sort()
        expect(ids).toEqual(["fa", "o1"])
        expect(marketCandidates(save).some(c => c.player.id === "m1")).toBe(false)
        expect(isNarrowing(DEFAULT_MARKET_CRITERIA)).toBe(false)
        expect(isNarrowing(youngAwp)).toBe(true)
        expect(describeCriteria(youngAwp)).toBe("AWPER · 21 or younger")
        expect(matchesMarketSearch(marketCandidates(save).find(c => c.player.id === "fa")!, { ...youngAwp, status: "free" })).toBe(true)
    })

    test("alerts only on new matches, once a week", () => {
        const save = world()
        save.savedSearches = [newSavedSearch("Young AWPers", youngAwp, 9, ["o1"])]
        const event = processMarketAlerts(save)
        expect(event?.type).toBe("MARKET_ALERT")
        expect(String(event?.data.message)).toContain("Young AWPers: fa.")
        expect(String(event?.data.message)).not.toContain("o1")
        expect(save.savedSearches[0].seenIds.sort()).toEqual(["fa", "o1"])
        expect(processMarketAlerts(save)).toBeNull() // same week
        save.currentWeek = 11
        expect(processMarketAlerts(save)).toBeNull() // nothing new
    })

    test("alerts off: no message, seen list still updates", () => {
        const save = world()
        save.savedSearches = [{ ...newSavedSearch("Young AWPers", youngAwp, 9, []), alerts: false }]
        expect(processMarketAlerts(save)).toBeNull()
        expect(save.savedSearches[0].seenIds.length).toBe(2)
    })

    test("shortlisted contract entering its final six months", () => {
        const save = world()
        save.watchlistedPlayerIds = ["o1"]
        const event = processMarketAlerts(save)
        expect(event?.data.title).toBe("o1's contract enters its final six months")
        expect(event?.data.playerId).toBe("o1")
    })
})
