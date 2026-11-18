/**
 * Unit checks for the 2026-11-17 competition fixes that the season
 * integration test (comp-season-integration) does not pin on its own:
 * prize shares of small fields (COMP-11), frozen final league tables
 * (COMP-06), the qualifier deadline (COMP-01), the Elite World Final field
 * (COMP-04), entry lock reasons (COMP-07), Swiss order (COMP-02/03), the
 * board's trophy pace (COMP-18), one card per rivalry (COMP-16) and the
 * entry label of events no qualifier feeds (COMP-20).
 */
import { getTournamentById, getEntryTypeLabel, type TournamentDefinition } from "@/data/tournament-calendar"
import { computePrizeAwards, prizeSplit, updateStandings } from "@/engine/processors/standings-processor"
import { qualifierDeadlineWeek, scheduleBracketMatch } from "@/engine/tournament/bracket-scheduling"
import { buildEventField } from "@/engine/tournament/event-field"
import { registerBlockText } from "@/engine/tournament/qualification-path"
import { swissOrder } from "@/engine/tournament/swiss-handlers"
import { objectiveProgressNow } from "@/engine/board-expectations"
import { readStorylineArcs } from "@/lib/season-review-view"
import type { BoardObjective, BracketMatchSaveData, GameSave, TournamentSaveData } from "@/engine/save-types"

const def = (id: string) => getTournamentById(id) as TournamentDefinition
const REGIONS = ["EU", "NA", "ASIA", "CIS", "BR"]

function world(n = 40): GameSave {
    const teams = Array.from({ length: n }, (_, i) => ({
        id: `c${String(i + 1).padStart(2, "0")}`, name: `Club ${i + 1}`, worldRanking: i + 1, region: REGIONS[i % REGIONS.length], rosterIds: [], trophies: [],
    }))
    return {
        teams, players: [], tournaments: [], tournamentQualifications: [], scheduledMatches: [], completedMatches: [], circuitPoints: [],
        financeLedger: [], newsFeed: [], playerTeamId: `c${n}`, currentWeek: 1, currentDay: 0, timeMode: "HYBRID_DAILY", gameStartDate: "2026-11-15T00:00:00.000Z",
    } as unknown as GameSave
}

describe("COMP-11: the placed clubs share the whole prize pool", () => {
    test("a 12-club split lists 12 places and adds up to 100%", () => {
        const split = prizeSplit(12)
        expect(Object.keys(split).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
        expect(Object.values(split).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
    })

    test("full 8- and 16-place tables are unchanged", () => {
        expect(prizeSplit(8)[1]).toBeCloseTo(0.4, 10)
        expect(prizeSplit(16)[1]).toBeCloseTo(0.36, 10)
    })

    test("12 placed clubs are paid exactly the pool", () => {
        const placements = Array.from({ length: 12 }, (_, i) => ({ teamId: `t${i}`, position: i + 1 }))
        const awards = computePrizeAwards(150_000, placements)
        expect(awards).toHaveLength(12)
        expect(awards.reduce((s, a) => s + a.amount, 0)).toBe(150_000)
    })

    test("two beaten semi-finalists sharing 3rd: still exactly the pool, 1st paid most", () => {
        const placements = [{ teamId: "a", position: 1 }, { teamId: "b", position: 2 }, { teamId: "c", position: 3 }, { teamId: "d", position: 3 }]
        const awards = computePrizeAwards(100_000, placements)
        expect(awards.reduce((s, a) => s + a.amount, 0)).toBe(100_000)
        expect(awards.find(a => a.teamId === "c")!.amount).toBe(awards.find(a => a.teamId === "d")!.amount)
        expect(awards.find(a => a.teamId === "a")!.amount).toBeGreaterThan(awards.find(a => a.teamId === "b")!.amount)
    })
})

describe("COMP-06: a settled league keeps its final table", () => {
    test("updateStandings does not rebuild the table of a league whose rewards were paid", () => {
        const save = world(4)
        const standings = ["c03", "c01", "c02", "c04"].map((teamId, i) => ({ teamId, wins: 3 - i, losses: i, points: (3 - i) * 3, matchesPlayed: 3, roundDiff: 0, mapDiff: 0 }))
        const league = {
            id: "esl_pro_league_conference_s1", name: "Conference", tier: "A_TIER", format: "league", teamIds: ["c01", "c02", "c03", "c04"],
            standings: standings.map(s => ({ ...s })), isCompleted: true, rewardsGranted: true, winnerId: "c03", startWeek: 1, duration: 4, endWeek: 5,
            prizePool: 0, playoffBracket: [], currentStage: "Completed",
        } as unknown as TournamentSaveData
        save.tournaments = [league]
        save.currentWeek = 40 // the event's matches have long left completedMatches
        updateStandings(save)
        expect(league.standings).toEqual(standings)
    })
})

describe("COMP-01: a qualifier never spills into its event's first week", () => {
    function rmrSave(): GameSave {
        const save = world()
        const rmr = def("copenhagen_rmr_eu")
        save.tournaments = [{
            id: "copenhagen_rmr_eu_s1", name: rmr.name, tier: rmr.tier, format: rmr.format, teamIds: ["c01", "c02"], standings: [], playoffBracket: [],
            startWeek: rmr.startWeek, duration: rmr.duration, endWeek: rmr.startWeek + rmr.duration, prizePool: 0, currentStage: "Swiss Stage",
        } as unknown as TournamentSaveData]
        return save
    }

    test("the deadline is the week before the Major starts", () => {
        expect(qualifierDeadlineWeek(rmrSave(), "copenhagen_rmr_eu_s1")).toBe(def("major_copenhagen").startWeek - 1)
    })

    test("in the last allowed week a full week means a second match on Sunday, not the next week", () => {
        const save = rmrSave()
        const last = def("major_copenhagen").startWeek - 1
        save.currentWeek = last
        // c01 already plays every day of that week.
        save.scheduledMatches = Array.from({ length: 7 }, (_, d) => ({ id: `busy${d}`, homeTeamId: "c01", awayTeamId: "c30", week: last, day: d, tournamentId: "x" })) as never
        const match = { id: "rmr_m1", tournamentId: "copenhagen_rmr_eu_s1", stage: "Swiss Round 5", homeTeamId: "c01", awayTeamId: "c02", week: last, format: "BO3", isCompleted: false } as unknown as BracketMatchSaveData
        scheduleBracketMatch(save, match)
        const scheduled = save.scheduledMatches.find(m => m.id === "rmr_m1")!
        expect(scheduled.week).toBe(last)
        expect(scheduled.day).toBe(6)
    })
})

describe("COMP-04: the Elite World Final is the circuit points top 8", () => {
    test("field = the 8 clubs with the most circuit points; other sign-ups are withdrawn", () => {
        const save = world()
        const leaders = ["c20", "c07", "c33", "c02", "c15", "c11", "c38", "c05"]
        save.circuitPoints = leaders.map((teamId, i) => ({ teamId, points: 5000 - i * 100 })) as never
        save.tournamentQualifications = [{ tournamentId: "blast_world_final_s1", teamId: "c01", status: "REGISTERED", qualifiedVia: "Registered" } as never]
        const field = buildEventField(save, def("blast_world_final"), "blast_world_final_s1", 1, save.playerTeamId)
        expect([...field].sort()).toEqual([...leaders].sort())
        expect(save.tournamentQualifications.some(q => q.teamId === "c01")).toBe(false)
    })
})

describe("COMP-07: why Register is locked", () => {
    test("another region's RMR names the region", () => {
        const save = world()
        const eu = save.teams.find(t => t.region === "EU")!
        const block = registerBlockText(save, eu, def("copenhagen_rmr_asia"), 1, d => d.name)
        expect(block?.key).toBe("tm.block.region")
    })

    test("a club already in the Major may not sign up for its RMR", () => {
        const save = world()
        const eu = save.teams.find(t => t.region === "EU")!
        save.tournamentQualifications = [{ tournamentId: "major_copenhagen_s1", teamId: eu.id, status: "INVITED", qualifiedVia: "Direct Invite" } as never]
        const block = registerBlockText(save, eu, def("copenhagen_rmr_eu"), 1, d => d.name)
        expect(block?.key).toMatch(/^tm\.block\.(in_main|invited)$/)
        expect(block?.params.event).toBe(def("major_copenhagen").name)
    })

    test("its own region's RMR with no other entry is open", () => {
        const save = world()
        const eu = save.teams.find(t => t.region === "EU" && t.worldRanking > 30)!
        expect(registerBlockText(save, eu, def("copenhagen_rmr_eu"), 1, d => d.name)).toBeNull()
    })
})

describe("COMP-02/03: Swiss order", () => {
    test("wins first, then fewer losses, then round difference", () => {
        const rows = [
            { teamId: "a", wins: 3, losses: 2, roundDiff: 40, mapDiff: 0 },
            { teamId: "b", wins: 3, losses: 0, roundDiff: 5, mapDiff: 0 },
            { teamId: "c", wins: 3, losses: 1, roundDiff: 10, mapDiff: 0 },
            { teamId: "d", wins: 3, losses: 1, roundDiff: 20, mapDiff: 0 },
            { teamId: "e", wins: 2, losses: 3, roundDiff: 99, mapDiff: 0 },
        ]
        expect(swissOrder(rows).map(r => r.teamId)).toEqual(["b", "d", "c", "a", "e"])
    })
})

describe("COMP-18: the trophy ambition follows the season's pace", () => {
    const objective = { id: "trophies", label: "Lift 3 trophies", target: 3 } as BoardObjective
    const at = (week: number, trophies: number) => {
        const save = world(2)
        save.playerTeamId = "c01"
        save.currentWeek = week
        save.teams[0].trophies = Array.from({ length: trophies }, (_, i) => ({ tournamentId: `t${i}`, week: week - 1, season: 1 })) as never
        return objectiveProgressNow(save, objective).status
    }
    test("week 1 with no trophy is on track, not at risk", () => expect(at(1, 0)).toBe("ON_TRACK"))
    test("half the season gone and none won is at risk", () => expect(at(27, 0)).toBe("AT_RISK"))
    test("reaching the target is met", () => expect(at(20, 3)).toBe("MET"))
})

describe("COMP-16: one card per rivalry", () => {
    test("two fixtures against the same rival read as one story", () => {
        const arc = (id: string, week: number, rival: string) => ({
            id, kind: "RIVALRY", teamId: "me", managed: true, playerIds: [], clubIds: [rival], beat: 2, startedWeek: week, updatedWeek: week + 1,
            nextWeek: week + 2, state: "RESOLVED", outcome: "WON", facts: {}, log: [{ week, text: `Build-up ${week}` }, { week: week + 1, text: `Result ${week}` }],
        })
        const arcs = readStorylineArcs([arc("r1", 40, "rival"), arc("r2", 50, "rival"), arc("r3", 30, "other")], "me", 1)
        expect(arcs).toHaveLength(2)
        const merged = arcs.find(a => a.beats.some(b => b.title === "Build-up 40"))!
        expect(merged.beats.map(b => b.title)).toEqual(["Build-up 40", "Result 40", "Build-up 50", "Result 50"])
    })
})

describe("COMP-20: entry label of an event no qualifier feeds", () => {
    test("Showdowns read as invites + ranking, the Majors still as via qualifier", () => {
        expect(getEntryTypeLabel("QUALIFIER", "blast_spring_showdown_s2")).toBe(getEntryTypeLabel("QUALIFIER", "blast_fall_showdown"))
        expect(getEntryTypeLabel("QUALIFIER", "blast_spring_showdown")).not.toBe(getEntryTypeLabel("QUALIFIER", "major_copenhagen"))
        expect(getEntryTypeLabel("QUALIFIER", "major_copenhagen")).toBe(getEntryTypeLabel("QUALIFIER"))
    })
})
