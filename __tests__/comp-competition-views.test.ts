/**
 * Competition audit 2026-11-03: regressions for the view logic behind
 * /tournaments, /tournaments/[id], /rankings and /career/board.
 */
import { getTournamentById, FULL_TOURNAMENT_CALENDAR } from "@/data/tournament-calendar"
import { getDynamicTournamentName } from "@/lib/utils-extended"
import { currentSeasonInstance, eventWeeksFor, instanceSeason, instancesOfSeries, recordEventName, seasonStartWeek } from "@/lib/tournament-instances"
import { isQualificationForTournament, buildInstanceId } from "@/engine/circuit-engine"
import { getTierTargets, refreshObjectiveProgress } from "@/engine/board-expectations"
import type { BoardState, GameSave, QualificationStatus } from "@/engine/save-types"

describe("COMP-01 event page resolves ids that contain _s", () => {
    test.each([
        ["major_shanghai_s1", "major_shanghai"],
        ["blast_spring_s1", "blast_spring"],
        ["blast_spring_showdown_s2", "blast_spring_showdown"],
        ["blast_fall_showdown_s1", "blast_fall_showdown"],
        ["perfect_world_shanghai_s1", "perfect_world_shanghai"],
        ["esea_premier_s48_s2", "esea_premier_s48"],
        ["esea_premier_s48", "esea_premier_s48"],
        ["iem_katowice_s3", "iem_katowice"],
    ])("%s -> %s", (id, def) => {
        expect(getTournamentById(id)?.id).toBe(def)
    })

    test("every calendar event resolves from its season-instance id", () => {
        for (const def of FULL_TOURNAMENT_CALENDAR) expect(getTournamentById(buildInstanceId(def.id, 2))?.id).toBe(def.id)
    })
})

describe("COMP-02 / COMP-04 instances of one series", () => {
    const rows = [
        { id: "iem_katowice_s1", startWeek: 9, isCompleted: true },
        { id: "iem_katowice_open_s1", startWeek: 6, isCompleted: true },
        { id: "iem_katowice_closed_eu_s1", startWeek: 7, isCompleted: true },
        { id: "iem_katowice_open_s2", startWeek: 58 },
        { id: "esea_premier_s48_s1", startWeek: 6, isCompleted: true },
        { id: "esea_premier_s48_s2", startWeek: 58 },
    ]

    test("qualifiers are not instances of the main event", () => {
        expect(instancesOfSeries(rows, "iem_katowice").map(r => r.id)).toEqual(["iem_katowice_s1"])
        expect(instancesOfSeries(rows, "esea_premier_s48").map(r => r.id)).toEqual(["esea_premier_s48_s2", "esea_premier_s48_s1"])
        expect(instanceSeason(rows[5])).toBe(2)
    })

    test("in season 2 the row never falls back to last season's finished instance", () => {
        expect(currentSeasonInstance(rows, "iem_katowice", 53)).toBeUndefined()
        expect(currentSeasonInstance(rows, "esea_premier_s48", 53)?.id).toBe("esea_premier_s48_s2")
        expect(seasonStartWeek({ startWeek: 9 }, 2)).toBe(61)
    })
})

describe("COMP-03 registrations are per season", () => {
    const row: QualificationStatus = { tournamentId: "esea_premier_s48_s1", seriesId: "esea_premier_s48", instanceId: "esea_premier_s48_s1", seasonNumber: 1, teamId: "me", status: "REGISTERED" }

    test("a season-1 registration doesn't count for the season-2 event", () => {
        expect(isQualificationForTournament(row, "esea_premier_s48_s1", 53)).toBe(true)
        expect(isQualificationForTournament(row, "esea_premier_s48_s2", 53)).toBe(false)
    })
})

describe("COMP-13 event names carry the year the event is played in", () => {
    const start = "2026-11-02T00:00:00.000Z"

    test("the year is the year of the event's final week, not of the current week", () => {
        // A career from 2 Nov 2026: week 9 starts 28 Dec 2026, week 10 is January 2027.
        expect(getDynamicTournamentName("Winter Open Katova 2025", 9, start, 1)).toBe("Winter Open Katova 2026")
        expect(getDynamicTournamentName("Winter Open Katova 2025", 9, start, 2)).toBe("Winter Open Katova 2027")
        expect(getDynamicTournamentName("Winter Open Katova 2025", 61, start, 2)).toBe("Winter Open Katova 2028")
        expect(getDynamicTournamentName("Northern Major 2025", 15, start, 3)).toBe("Northern Major 2027")
    })

    test("the name of a finished event doesn't change when a new season starts", () => {
        const katowice = getTournamentById("iem_katowice")!
        const listName = getDynamicTournamentName(katowice.name, seasonStartWeek(katowice, 1), start, katowice.duration)
        // Trophies and circuit results store the completion week; they name the same year.
        expect(recordEventName(katowice.name, "iem_katowice_s1", seasonStartWeek(katowice, 1) + katowice.duration, start)).toBe(listName)
        expect(eventWeeksFor("iem_katowice_s2", 70)).toEqual({ startWeek: 52 + katowice.startWeek, duration: katowice.duration })
        expect(eventWeeksFor(undefined, 12)).toEqual({ startWeek: 12, duration: 1 })
    })

    test("season suffix is dropped when a year is shown; names without a year are untouched", () => {
        expect(getDynamicTournamentName("Winter Open Katova 2025 S2", 61, start)).toBe("Winter Open Katova 2027")
        expect(getDynamicTournamentName("PlayOn Academy League S2", 60, start)).toBe("PlayOn Academy League S2")
    })

    test("without a start date the old season-based year is kept", () => {
        expect(getDynamicTournamentName("Rio Masters 2025", 1)).toBe("Rio Masters 2025")
        expect(getDynamicTournamentName("Rio Masters 2025", 53)).toBe("Rio Masters 2026")
    })
})

describe("COMP-12 board subtitle", () => {
    test("tier blurbs carry no rank numbers (the page adds the season's real target)", () => {
        for (const tier of ["WIN", "CONTEND", "COMPETE", "SURVIVE"] as const) {
            expect(getTierTargets(tier).blurb).not.toMatch(/top-\d|\d/)
        }
    })
})

describe("COMP-16 league objective before the first league match", () => {
    function save(played: number): GameSave {
        return {
            playerTeamId: "me", currentWeek: 53,
            teams: [{ id: "me", worldRanking: 40, budget: 100_000, trophies: [] }],
            league: { version: 1, history: [], current: { id: "league_s2_p1", season: 2, split: 1, firstWeek: 55, lastWeek: 70, divisions: [{
                id: "d1", region: "EUROPE", level: 1, name: "Europe Division 1", format: "DOUBLE", teamIds: ["x", "me"], fixtures: [],
                standings: [
                    { teamId: "x", played, wins: 0, losses: 0, points: 0, mapDiff: 0, roundDiff: 0 },
                    { teamId: "me", played, wins: 0, losses: 0, points: 0, mapDiff: 0, roundDiff: 0 },
                ],
            }] } },
        } as unknown as GameSave
    }
    const board = (): BoardState => ({ confidence: 50, objectives: [{ id: "league", label: "Avoid relegation", target: 2, divisionId: "d1" }] } as unknown as BoardState)

    test("the draw position is not shown as progress", () => {
        const b = board()
        refreshObjectiveProgress(save(0), b)
        expect(b.objectives![0].current).toBeUndefined()
        expect(b.objectives![0].status).toBeUndefined()
    })

    test("after a league match the table position counts", () => {
        const b = board()
        refreshObjectiveProgress(save(1), b)
        expect(b.objectives![0].current).toBe(2)
        expect(b.objectives![0].status).toBe("ON_TRACK")
    })
})
