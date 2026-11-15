/**
 * Regression tests for the 2026-11-15 Home audit fixes (HOME-01 … HOME-25).
 */
import { tournamentHref } from "@/components/ui/EntityLink"
import { divisionWithPendingResults, drawDueLeagueSplit, processLeagueWeek, tablePosition } from "@/engine/season/regional-league"
import { ensureBoardState, ensureSeasonObjectives, objectiveProgressNow, refreshObjectiveProgress } from "@/engine/board-expectations"
import { liveObjectives } from "@/components/career/board-view"
import { clubFixtures, leagueTableRows } from "@/components/league/league-view"
import { EventProcessor } from "@/engine/processors/event-processor"
import { SeededRNG } from "@/engine/rng"
import { generateCareerDecision } from "@/engine/career-decisions"
import type { GameSave, TeamSaveData } from "@/engine/save-types"
import { nextStop, type StopSource } from "@/lib/advance-stops"
import { buildWeekReport, type ReportStateSource } from "@/lib/week-report"
import { eventToItem, digestLine, type InboxContext } from "@/components/inbox/inbox-model"
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

describe("HOME-04 / HOME-06: one win-streak prompt, counted in play order", () => {
    type M = { id: string; week: number; day?: number; win: boolean; scrim?: boolean }
    function world(matches: M[]): GameSave {
        return {
            currentWeek: 2, eventsLog: [], players: [{ id: "p1", nickname: "ace", morale: 70, fatigue: 10, rosterIds: [] }],
            teams: [{ id: "t", name: "Ligion", rosterIds: ["p1"], sponsors: [] } as unknown as TeamSaveData],
            completedMatches: matches.map(m => ({ id: m.id, week: m.week, day: m.day, isScrim: m.scrim, homeTeamId: "t", awayTeamId: "o", result: { winnerId: m.win ? "t" : "o", homeScore: m.win ? 1 : 0, awayScore: m.win ? 0 : 1, maps: [] } })),
            playerTeamId: "t",
        } as unknown as GameSave
    }
    async function streakEvent(save: GameSave) {
        const tx = { generatedEventIds: [] as string[] }
        const saveManager = { recordEventGenerated: async (t: typeof tx, id: string) => { t.generatedEventIds.push(id) } }
        await EventProcessor.generateEvents(save, tx as never, new SeededRNG(99), "t", saveManager as never)
        return save.eventsLog.find(e => e.type === "win_streak")
    }

    it("a loss later in week 1 breaks the run: W, L (wk1) then W, W (wk2) is two, not three", async () => {
        const save = world([{ id: "a", week: 1, day: 1, win: true }, { id: "b", week: 1, day: 3, win: false }, { id: "c", week: 2, day: 1, win: true }, { id: "d", week: 2, day: 4, win: true }])
        expect(await streakEvent(save)).toBeUndefined()
    })

    it("three official wins in a row still fire, and scrims don't count", async () => {
        const save = world([{ id: "a", week: 1, day: 3, win: true }, { id: "s", week: 2, day: 0, win: false, scrim: true }, { id: "c", week: 2, day: 1, win: true }, { id: "d", week: 2, day: 4, win: true }])
        expect((await streakEvent(save))?.data).toMatchObject({ streak: 3 })
    })

    it("the momentum decision is not raised for the same run", async () => {
        const save = world([{ id: "a", week: 1, day: 3, win: true }, { id: "c", week: 2, day: 1, win: true }, { id: "d", week: 2, day: 4, win: true }])
        expect(await streakEvent(save)).toBeDefined()
        generateCareerDecision(save)
        expect(save.eventsLog.some(e => e.id.endsWith("_momentum"))).toBe(false)
    })

    it("no win-streak prompt right after a momentum decision", async () => {
        const save = world([{ id: "a", week: 1, day: 3, win: true }, { id: "c", week: 2, day: 1, win: true }, { id: "d", week: 2, day: 4, win: true }])
        save.eventsLog.push({ id: "career_decision_t_1_momentum", type: "CAREER_UPDATE", week: 1, acknowledged: false, data: { teamId: "t" } } as never)
        expect(await streakEvent(save)).toBeUndefined()
    })
})

describe("HOME-03: the Continue stop names a decision like the inbox does", () => {
    it("a win-streak decision reads '3-match win streak', not 'Performance'", () => {
        const src = {
            playerTeamId: "t", currentWeek: 3, currentDay: 0, timeMode: "HYBRID_DAILY",
            teams: [{ id: "t", name: "Ligion", rosterIds: [] }], players: [], scheduledMatches: [], completedMatches: [], contracts: [],
            eventsLog: [{ id: "streak_win_3", type: "win_streak", week: 3, acknowledged: false, data: { streak: 3, teamId: "t" }, choices: [{ id: "celebrate", text: "Team Dinner", effects: { money: -1000 } }] }],
        } as unknown as StopSource
        const stop = nextStop(src, new Set())
        expect(stop?.kind).toBe("event")
        expect(stop?.reason).toBe("Decision waiting: 3-match win streak")
    })
})

describe("HOME-14 / MODES-23: an unchanged storyline beat leads one weekly report, not two", () => {
    const arc = (log: Array<{ week: number; text: string }>) => ({
        id: "arc1", kind: "CONTRACT_STANDOFF", teamId: "t", managed: true, state: "ACTIVE", playerIds: ["p"], clubIds: [],
        startedWeek: 5, updatedWeek: 5, beat: 1, facts: {}, log,
    })
    function report(week: number, storylines: unknown[], history: unknown[] = []) {
        const state = {
            currentWeek: week + 1, teams: [{ id: "t", name: "Ligion", rosterIds: [] }], players: [], contracts: [],
            completedMatches: [{ id: `m${week}`, week, homeTeamId: "t", awayTeamId: "o", result: { winnerId: "t", homeScore: 1, awayScore: 0, maps: [{ homeScore: 13, awayScore: 4 }] } }],
            storylines, weekReports: { history },
        } as unknown as ReportStateSource
        return buildWeekReport({ week, teamId: "t", tracker: null, preAdvance: null, tickChanges: [], final: null, state })
    }

    it("leads week 4, then week 5 leads with the result", () => {
        const beat = "Bluody's agent goes public"
        const stories = [arc([{ week: 5, text: beat }])]
        const w4 = report(4, stories)
        expect(w4.story?.text).toBe(beat)
        const w5 = report(5, stories, [w4])
        expect(w5.story).toBeUndefined()
        expect(w5.headline).not.toContain("agent")
        expect(w5.headline).toContain("13–4")
    })

    it("a new beat of the same arc still leads", () => {
        const stories = [arc([{ week: 5, text: "goes public" }, { week: 6, text: "talks open" }])]
        const w4 = report(4, [arc([{ week: 5, text: "goes public" }])])
        expect(report(5, stories, [w4]).story?.text).toBe("talks open")
    })
})

describe("HOME-21: mid-week level-ups read as real messages in the inbox", () => {
    const ctx: InboxContext = { currentWeek: 5, playerTeamId: "t", rosterIds: new Set(["p"]), playerName: () => undefined }

    it("a player level-up names the player and the level", () => {
        const item = eventToItem({ id: "evt_lvl_1", type: "PLAYER_LEVEL_UP", week: 5, acknowledged: false, data: { playerName: "hfx", newLevel: 4 } } as never, ctx)
        expect(item.subject).toBe("hfx reached level 4")
        expect(item.preview).toBe("hfx reached level 4")
        expect(item.subject).not.toBe("Notification")
    })

    it("a manager level-up says which level, in the active language", () => {
        const event = { id: "mgr_levelup_5_3", type: "MANAGER_LEVEL_UP", week: 5, acknowledged: false, data: { description: "Manager leveled up to Level 3!", importance: "HIGH" } }
        const item = eventToItem(event as never, ctx)
        expect(item.subject).toBe("Manager level up!")
        expect(item.preview).toBe("You have reached manager level 3.")
        expect(digestLine({ id: event.id, type: event.type, week: 5, data: event.data } as never, ctx)).toBe("You have reached manager level 3.")
    })
})
