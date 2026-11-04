/**
 * HOME-04: a loss in a round-robin league tournament (PlayOn Academy League,
 * "League Match" fixtures) went through the single-elimination progression,
 * which set the club ELIMINATED and sent "Your team has been eliminated from
 * …" while it kept playing the league. A league loss eliminates no one; a
 * single-elimination loss still does.
 */
import { TournamentManager } from "@/engine/tournament-manager"
import { setupLeagueSchedule } from "@/engine/tournament/league-schedule"
import { SeededRNG } from "@/engine/rng"
import type { GameSave, TournamentSaveData } from "@/engine/save-types"

function makeSave(tournament: TournamentSaveData): GameSave {
    return {
        playerTeamId: "us",
        currentWeek: 8,
        currentDay: 0,
        timeMode: "WEEKLY",
        scheduledMatches: [],
        completedMatches: [],
        tournaments: [tournament],
        tournamentQualifications: [{ tournamentId: tournament.id, teamId: "us", status: "QUALIFIED" }],
        eventsLog: [],
        teams: [],
        players: [],
        contracts: [],
        staff: [],
    } as unknown as GameSave
}

const eliminationEvents = (save: GameSave) => save.eventsLog.filter(e => e.id.startsWith("elim_"))
const statusOf = (save: GameSave, tid: string) => save.tournamentQualifications.find(q => q.tournamentId === tid && q.teamId === "us")?.status

describe("HOME-04: league tournament losses do not eliminate", () => {
    test("losing a League Match keeps the club in the league, with no elimination message", () => {
        const tournament = { id: "playon_academy", name: "PlayOn Academy League", format: "league", startWeek: 8, endWeek: 14, teamIds: ["us", "a", "b", "c"], playoffBracket: [] } as unknown as TournamentSaveData
        const save = makeSave(tournament)
        setupLeagueSchedule(save, tournament, ["us", "a", "b", "c"], new SeededRNG(7))
        const ours = tournament.playoffBracket!.find(m => m.homeTeamId === "us" || m.awayTeamId === "us")!
        expect(ours.stage).toBe("League Match")
        const opp = ours.homeTeamId === "us" ? ours.awayTeamId! : ours.homeTeamId!

        TournamentManager.processMatchResult(save, tournament.id, ours.id, opp, "us")

        expect(ours.isCompleted).toBe(true)
        expect(eliminationEvents(save)).toHaveLength(0)
        expect(statusOf(save, tournament.id)).toBe("QUALIFIED")
        // Still has league fixtures to play.
        expect(tournament.playoffBracket!.some(m => !m.isCompleted && (m.homeTeamId === "us" || m.awayTeamId === "us"))).toBe(true)
    })

    test("a single-elimination loss still eliminates and notifies", () => {
        const tournament = {
            id: "cup", name: "Kato Open", format: "single_elim", startWeek: 8, endWeek: 9, teamIds: ["us", "a"],
            playoffBracket: [{ id: "cup_qf_1", stage: "Quarter-final", homeTeamId: "us", awayTeamId: "a", week: 8, format: "BO3", seed: 1, isCompleted: false }],
        } as unknown as TournamentSaveData
        const save = makeSave(tournament)
        TournamentManager.processMatchResult(save, "cup", "cup_qf_1", "a", "us")
        expect(eliminationEvents(save)).toHaveLength(1)
        expect(statusOf(save, "cup")).toBe("ELIMINATED")
    })
})
