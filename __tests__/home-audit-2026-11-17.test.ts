/**
 * Regression tests for the 2026-11-17 Home audit fixes (HOME-*, SQUAD-42/57,
 * NEWPLAYER-06/15/16/23).
 */
import type { BracketMatchSaveData, GameEventSaveData, GameSave, PlayerSaveData, TeamSaveData, TournamentSaveData } from "@/engine/save-types"
import { seasonOfWeek, weekLabel, weekLabelShort, weekNumberText, weekOfSeason, weekRef } from "@/lib/season-week"
import { tRef, tRefEn } from "@/lib/i18n"
import { clipAtSentence, getEventSender, getEventSubject, homeDecisions, type InboxContext } from "@/components/inbox/inbox-model"
import { canReachBracketMatch, projectedMatchesFor } from "@/components/schedule/projected-matches"
import { weekHeadline } from "@/lib/week-report"
import type { ChangeEntry } from "@/lib/week-changes"
import { playerGroups } from "@/components/report/report-model"
import { eventDisplayName } from "@/lib/tournament-instances"
import { sortNewsByDate } from "@/lib/news-text"
import { unansweredNote } from "@/engine/decision-deadlines"
import { collectStopSignals, type StopSource } from "@/lib/advance-stops"
import { createLaunchFixture } from "@/scripts/launch/fixtures"
import { EventProcessor } from "@/engine/processors/event-processor"
import { contractStandoff, NEW_MANAGER_GRACE_WEEKS } from "@/engine/storylines/arcs/contract-standoff"
import { buildContext } from "@/engine/storylines/common"

const ctx = (over: Partial<InboxContext> = {}): InboxContext => ({
    currentWeek: 5,
    playerTeamId: "mine",
    rosterIds: new Set(["p1", "p2"]),
    playerName: id => ({ p1: "ace", p2: "smokey" } as Record<string, string>)[id],
    ...over,
})
const ev = (id: string, over: Partial<GameEventSaveData> & Record<string, unknown> = {}): GameEventSaveData =>
    ({ id, type: "INFO", week: 5, acknowledged: false, data: {}, ...over } as GameEventSaveData)

describe("HOME-22 / SQUAD-57 / SQUAD-42: one season-week helper", () => {
    test("absolute weeks map to the season and its week", () => {
        expect([seasonOfWeek(1), weekOfSeason(1)]).toEqual([1, 1])
        expect([seasonOfWeek(52), weekOfSeason(52)]).toEqual([1, 52])
        expect([seasonOfWeek(53), weekOfSeason(53)]).toEqual([2, 1])
        expect([seasonOfWeek(56), weekOfSeason(56)]).toEqual([2, 4])
    })
    test("the season is named only outside the season being played", () => {
        expect(weekNumberText(56, 60)).toBe("4")
        expect(weekLabel(56, 60)).toBe("Week 4")
        expect(weekLabel(50, 60)).toBe("Week 50, season 1")
        expect(weekLabelShort(56, 60)).toBe("Wk 4")
        expect(weekLabelShort(50, 60)).toBe("S1 W50")
        expect(weekLabel(56)).toBe("Week 4, season 2")
    })
    test("stored texts keep a translatable season week", () => {
        expect(tRef(weekRef(65))).toBe("13, season 2")
    })
    test("decision notes use the season week", () => {
        const rule = { family: "x", defaultChoiceId: null, consequence: "skips it" } as never
        expect(unansweredNote(rule, 60, null)).toBe("If you don't answer by Week 8, the club skips it.")
    })
})

describe("inbox", () => {
    test("HOME-08: the recovery round-up line names the player", () => {
        const e = ev("recovery_p1_5", { type: "INJURY", data: { playerId: "p1", titleRef: { key: "rnd.recovered.t" } } })
        expect(getEventSubject(e, ctx())).toContain("ace")
    })
    test("HOME-24: senders for birthdays and career decisions", () => {
        const birthday = getEventSender(ev("birthday_p1_5", { type: "MORALE", data: { playerId: "p1" } }), ctx())
        expect(birthday).not.toMatch(/ace/i)
        const recovery = getEventSender(ev("career_decision_p1_recovery", { type: "CAREER_UPDATE", data: { playerId: "p1" } }), ctx())
        const confidence = getEventSender(ev("career_decision_p1_confidence", { type: "CAREER_UPDATE", data: { playerId: "p1" } }), ctx())
        expect(recovery).not.toBe(confidence)
        expect(recovery).not.toMatch(/board/i)
        expect(confidence).not.toMatch(/board/i)
    })
    test("HOME-24: round-up lines are cut at a sentence end", () => {
        const first = `Inferno is out of the pool for the whole season: ${"no league match is played there. ".repeat(3).trim()}`
        const line = `${first} ${"More words follow here ".repeat(10)}`
        expect(clipAtSentence(line, 240)).toBe(first)
        expect(clipAtSentence("Short.", 240)).toBe("Short.")
    })
    test("HOME-12: the home panel gets the offer events, not just a count", () => {
        const offer = ev("job_offer_5_x", { type: "JOB_OFFER", data: { offeringTeamName: "Kiyd Stars", deadlineWeek: 6 } })
        const res = homeDecisions([offer], ctx())
        expect(res.offers).toBe(1)
        expect(res.offerEvents.map(e => e.id)).toEqual(["job_offer_5_x"])
    })
})

describe("HOME-01: Calendar forecasts", () => {
    const bm = (id: string, over: Partial<BracketMatchSaveData>): BracketMatchSaveData =>
        ({ id, week: 10, stage: "Final", isCompleted: false, ...over } as BracketMatchSaveData)
    test("a bracket slot is reachable only through an unfinished feeder the club is in", () => {
        const semi1 = bm("s1", { homeTeamId: "me", awayTeamId: "a", isCompleted: true, winnerId: "a", loserId: "me" })
        const semi2 = bm("s2", { homeTeamId: "b", awayTeamId: "c" })
        const final = bm("f", { sourceMatchIds: ["s1", "s2"] })
        expect(canReachBracketMatch(final, [semi1, semi2, final], "me")).toBe(false)
        const open = bm("s1", { homeTeamId: "me", awayTeamId: "a" })
        expect(canReachBracketMatch(final, [open, semi2, final], "me")).toBe(true)
    })
    test("an eliminated event forecasts nothing", () => {
        const tour = { id: "kato_s1", name: "Kato Open", teamIds: ["me"], isCompleted: false, startWeek: 8, endWeek: 12, playoffBracket: [] } as unknown as TournamentSaveData
        const base = { playerTeamId: "me", currentWeek: 9, tournaments: [tour], scheduledMatches: [], completedMatches: [] }
        const labels = { nextStage: "Next", upcomingStage: "Upcoming", forecast: "Forecast" }
        expect(projectedMatchesFor({ ...base, tournamentQualifications: [] }, labels).length).toBeGreaterThan(0)
        expect(projectedMatchesFor({ ...base, tournamentQualifications: [{ teamId: "me", tournamentId: "kato_s1", status: "ELIMINATED" } as never] }, labels)).toEqual([])
    })
})

describe("weekly report", () => {
    const report = (changes: Partial<ChangeEntry>[], over: Record<string, unknown> = {}) => ({
        v: 1 as const, week: 3, teamId: "t", names: { p1: "k1ncu" }, matches: [], warnings: [],
        kpis: { budget: [0, 0], rank: [10, 10], elo: [0, 0], board: [50, 50], chemistry: [0, 0], morale: [50, 50], reputation: [0, 0] },
        changes: changes as ChangeEntry[], ...over,
    }) as never
    const gain = (delta: number) => ({ kind: "attribute", subjectId: "p1", label: "Pistol", delta, cause: { type: "training", label: "Aim training" } })
    const settle = (delta: number, type = "finance") => ({ kind: "money", subjectId: "t", label: "Weekly settlement", delta, cause: { type, label: "Weekly settlement" } })

    test("HOME-09: a +0.2 training gain and the usual settlement are not headline news", () => {
        expect(weekHeadline(report([gain(0.2), settle(862)]))).toBe("A quiet week: nothing on your club changed.")
    })
    test("HOME-09: a whole-point gain, a loss or prize money still are", () => {
        expect(weekHeadline(report([gain(1.2)]))).toContain("k1ncu's Pistol +1.2")
        expect(weekHeadline(report([settle(-900)]))).toContain("finances −$900")
        expect(weekHeadline(report([settle(5000, "prize")]))).toContain("finances +$5.0k")
    })
    test("HOME-14: a plain first word reads lower case after the story label", () => {
        const story = { kind: "RISING_STAR", label: "Rising star", text: "You promised ace a starting place." }
        expect(weekHeadline(report([], { story }))).toBe("Rising star: you promised ace a starting place.")
    })
    test("NEWPLAYER-23: stat moves under 0.5 are counted, not listed", () => {
        const [g] = playerGroups(report([gain(0.1), { ...gain(0.05), label: "Aim" }, { ...gain(0.6), label: "AWP" }]))
        expect(g.rows[0].change).toBe("AWP +0.6")
        expect(g.rows[g.rows.length - 1].change).toBe("2 small stat changes")
    })
})

describe("news", () => {
    test("HOME-23: the season marker is not shown in text", () => {
        expect(eventDisplayName("Winter Open Katova Open Qualifier S2")).toBe("Winter Open Katova Open Qualifier")
        expect(eventDisplayName("IEM Cologne 2027")).toBe("IEM Cologne 2027")
    })
    test("NEWPLAYER-16: the feed sorts by week, then day", () => {
        const items = [
            { id: "staff", week: 1 },
            { id: "sign", week: 1, day: 2 },
            { id: "match", week: 1, matchId: "m1" },
            { id: "old", week: 0, day: 6 },
        ]
        expect(sortNewsByDate(items, new Map([["m1", 1]])).map(i => i.id)).toEqual(["sign", "match", "staff", "old"])
    })
})

describe("HOME-07: one knock stops once", () => {
    test("no injury stop while the knock is an open decision", () => {
        const save = createLaunchFixture("first-week")
        save.scheduledMatches = []
        save.timeMode = "WEEKLY"
        save.currentDay = 0
        save.currentWeek = 5
        const p = save.players.find(x => save.teams.find(t => t.id === save.playerTeamId)!.rosterIds.includes(x.id))!
        p.injury = { type: "MINOR", name: "Common Cold", weeksRemaining: 2 } as never
        const kinds = () => collectStopSignals(save as unknown as StopSource).map(s => s.kind)
        expect(kinds()).toContain("injury")
        save.eventsLog.push({ id: `knock_${p.id}_5`, type: "INJURY", week: 5, acknowledged: false, data: { playerId: p.id, deadlineWeek: 5 }, choices: [] } as unknown as GameEventSaveData)
        expect(kinds()).not.toContain("injury")
    })
})

describe("HOME-21: one workload warning at a time", () => {
    const player = (id: string, fatigue: number) => ({ id, nickname: id, fatigue, health: 100, age: 22, morale: 50, form: 50, loyalty: 50 } as unknown as PlayerSaveData)
    test("only the most loaded player is warned; a rest with no substitute says so", async () => {
        const save = {
            currentWeek: 5, eventsLog: [],
            teams: [{ id: "t", rosterIds: ["a", "b", "c"] } as unknown as TeamSaveData],
            players: [player("a", 92), player("b", 98), player("c", 95)],
        } as unknown as GameSave
        const tx = { generatedEventIds: [] as string[] }
        const sm = { recordEventGenerated: async (t: typeof tx, id: string) => { t.generatedEventIds.push(id) } }
        expect(await EventProcessor.generateWorkloadWarnings(save, tx as never, "t", sm as never)).toBe(1)
        expect(save.eventsLog.map(e => e.id)).toEqual(["workload_b_5"])
        const rest = save.eventsLog[0].choices?.find(c => c.id === "rest")?.effects as { rest?: { noSub?: boolean } }
        expect(rest.rest?.noSub).toBe(true)
        // Still open: no second card.
        expect(await EventProcessor.generateWorkloadWarnings(save, tx as never, "t", sm as never)).toBe(0)
    })
})

describe("NEWPLAYER-06: no contract standoff in a new manager's first weeks", () => {
    test("detect returns nothing inside the grace weeks", () => {
        const save = createLaunchFixture("first-week")
        save.managerDetails = { ...save.managerDetails, tenureStartWeek: save.currentWeek }
        expect(contractStandoff.detect(buildContext(save))).toEqual([])
        expect(NEW_MANAGER_GRACE_WEEKS).toBe(4)
        expect(tRefEn(weekRef(20))).toBe("20, season 1")
    })
})
