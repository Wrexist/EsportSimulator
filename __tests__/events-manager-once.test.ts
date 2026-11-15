/**
 * ENGINE-02: one-time inbox beats (fan milestones, rivalry notes) must stay
 * one-time after the compactor trims the events log. They are recorded under
 * "once:" ids in acknowledgedEventIds, which the compactor keeps.
 */
import { EventsManager, onceId } from "@/engine/events-manager"
import { compactPersistentState } from "@/engine/processors/save-compactor"
import { SeededRNG } from "@/engine/rng"
import type { GameSave } from "@/engine/save-types"

function team(id: string, followers = 0) {
    return {
        id, name: id, shortName: id.slice(0, 3).toUpperCase(),
        budget: 100_000, rosterIds: [], staffIds: [], trophies: [], facilities: [], sponsors: [],
        fanbase: 0, followers, playstyle: "default", reputation: 30, region: "EU", facilitiesLevel: 1,
        leagueTier: "B_TIER", elo: 1500, recentForm: [],
    }
}

function makeSave(overrides: Record<string, unknown> = {}): GameSave {
    return {
        currentWeek: 5, playerTeamId: "player",
        teams: [team("player", 12_000), team("rival")],
        players: [], contracts: [], staff: [], marketStaff: [],
        scheduledMatches: [], completedMatches: [], scheduledActivities: [],
        financeLedger: [], eventsLog: [], newsFeed: [], transferHistory: [],
        tournaments: [], tournamentQualifications: [], academyPlayers: [],
        acknowledgedEventIds: [], lastRngSeed: 1,
        ...overrides,
    } as unknown as GameSave
}

const meeting = (n: number) => ({
    id: `m${n}`, homeTeamId: "player", awayTeamId: "rival", week: n,
    result: { winnerId: "player", homeScore: 1, awayScore: 0, maps: [] },
})

/** The log trimmed the way a long career trims it: the old events are gone. */
function pruneLog(save: GameSave): void {
    save.eventsLog = []
    compactPersistentState(save)
}

describe("fan milestones fire once per club (ENGINE-02)", () => {
    test("a milestone whose event was trimmed from the log does not fire again or pay reputation twice", () => {
        const save = makeSave()
        EventsManager.generateModernEvents(save, new SeededRNG(99))
        const club = save.teams[0]
        expect(save.eventsLog.filter(e => e.type === "FAN").map(e => e.id)).toEqual(["fan_milestone_player_10000"])
        expect(club.reputation).toBe(32)
        expect(save.acknowledgedEventIds).toContain(onceId.fan("player", 10_000))

        pruneLog(save)
        expect(save.acknowledgedEventIds).toContain(onceId.fan("player", 10_000))
        save.currentWeek = 60
        EventsManager.generateModernEvents(save, new SeededRNG(99))
        expect(save.eventsLog.some(e => e.type === "FAN")).toBe(false)
        expect(club.reputation).toBe(32)
    })

    test("a save from before the fix (club-less id in the log) does not fire it again", () => {
        const save = makeSave({ eventsLog: [{ id: "fan_milestone_10000", type: "FAN", week: 2, acknowledged: true, data: {} }] })
        EventsManager.generateModernEvents(save, new SeededRNG(99))
        expect(save.eventsLog.filter(e => e.type === "FAN")).toHaveLength(1)
        expect(save.teams[0].reputation).toBe(30)
        expect(save.acknowledgedEventIds).toContain(onceId.fan("player", 10_000))
    })

    test("a new club after a job change gets its own milestone", () => {
        const save = makeSave({ acknowledgedEventIds: [onceId.fan("player", 10_000)] })
        save.teams[1].followers = 15_000
        save.playerTeamId = "rival"
        EventsManager.generateModernEvents(save, new SeededRNG(99))
        expect(save.eventsLog.some(e => e.id === "fan_milestone_rival_10000")).toBe(true)
    })
})

describe("rivalry notes fire once per meeting count (ENGINE-02)", () => {
    test("the same meeting count reached again after the match list was trimmed stays silent", () => {
        const save = makeSave({ completedMatches: [meeting(1), meeting(2), meeting(3)] })
        save.teams[0].followers = 0
        EventsManager.generateModernEvents(save, new SeededRNG(99))
        expect(save.eventsLog.some(e => e.id === "rivalry_rival_3")).toBe(true)

        pruneLog(save)
        // Old meetings fell off the capped list; three newer ones count as "3" again.
        save.completedMatches = [meeting(40), meeting(41), meeting(42)] as never
        save.currentWeek = 43
        EventsManager.generateModernEvents(save, new SeededRNG(99))
        expect(save.eventsLog.some(e => e.id === "rivalry_rival_3")).toBe(false)
    })
})
