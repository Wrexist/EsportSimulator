/**
 * Regression tests for the 2026-11-15 Home audit fixes (HOME-01 … HOME-25).
 */
import { tournamentHref } from "@/components/ui/EntityLink"
import { divisionWithPendingResults, drawDueLeagueSplit, processLeagueWeek, tablePosition } from "@/engine/season/regional-league"
import { ensureBoardState, ensureSeasonObjectives, objectiveProgressNow, refreshObjectiveProgress } from "@/engine/board-expectations"
import { liveObjectives } from "@/components/career/board-view"
import { clubFixtures, leagueTableRows } from "@/components/league/league-view"
import { makeWorld, playLeagueWeek } from "./league-fixtures"

describe("HOME-01: league draw links open the league table", () => {
    it("routes league division ids to /league", () => {
        expect(tournamentHref("league_s1_p1_cis_d4")).toBe("/league")
    })
    it("keeps real tournaments on their page", () => {
        expect(tournamentHref("iem_cologne_2026")).toBe("/tournaments/iem_cologne_2026")
    })
})


describe("HOME-02 / MODES-30: board 'now' agrees with the league card, League page and header", () => {
    function setup() {
        const save = makeWorld({ EU: 40 })
        drawDueLeagueSplit(save)
        const board = ensureBoardState(save)
        ensureSeasonObjectives(save, board)
        refreshObjectiveProgress(save, board)
        const own = save.league!.current!.divisions.find(d => d.teamIds.includes(save.playerTeamId))!
        return { save, board, own }
    }

    it("shows the live rank and budget before any tick, and no league place before a league match", () => {
        const { save, board } = setup()
        const team = save.teams.find(t => t.id === save.playerTeamId)!
        team.worldRanking = 7
        team.budget = 123_456
        const live = liveObjectives(board.objectives, save)
        expect(live.find(o => o.id === "ranking")!.current).toBe(7)
        expect(live.find(o => o.id === "finance")!.current).toBe(123_456)
        const league = live.find(o => o.id === "league")!
        expect(league.current).toBeUndefined()
        expect(league.status).toBeUndefined()
        // The stored objectives are not touched.
        expect(board.objectives!.find(o => o.id === "ranking")!.current).not.toBe(7)
    })

    it("counts a league match played this week, like the league card does", () => {
        const { save, board, own } = setup()
        const first = clubFixtures(own, save.playerTeamId).upcoming[0]
        save.currentWeek = first.fixture.week
        playLeagueWeek(save, first.fixture.week, () => !first.home)
        const card = leagueTableRows(divisionWithPendingResults(own, save.completedMatches), 4, save.playerTeamId).find(r => r.isPlayer)!
        const objective = board.objectives!.find(o => o.id === "league")!
        expect(objectiveProgressNow(save, objective).current).toBe(card.position)
        // After the tick harvests it, the stored table agrees.
        processLeagueWeek(save, save.playerTeamId)
        refreshObjectiveProgress(save, board)
        expect(board.objectives!.find(o => o.id === "league")!.current).toBe(tablePosition(own, save.playerTeamId))
        expect(tablePosition(own, save.playerTeamId)).toBe(card.position)
    })
})
