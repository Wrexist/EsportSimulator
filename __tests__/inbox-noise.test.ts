/**
 * Phase 4.9 inbox noise: decisions carry a deadline and a stated default
 * that the week tick applies honestly; repeats refresh instead of stacking;
 * low-value notices fold into one weekly round-up; Continue stops once per
 * decision; older saves gain deadlines on load.
 */
import { useGameStore } from "@/store/game-store"
import { saveManager } from "@/engine"
import { debouncedStorage } from "@/engine/storage-adapter"
import { createLaunchFixture } from "@/scripts/launch/fixtures"
import type { GameEventSaveData, GameSave } from "@/engine/save-types"
import {
    MAX_OPEN_DECISIONS, decisionRuleFor, expireDecisions, isOpenDecision, normalizeDecisions,
} from "@/engine/decision-deadlines"
import { DIGEST_TYPE, foldWeeklyDigest, isDigestible } from "@/lib/inbox-digest"
import {
    buildInboxItems, countInbox, getDecisionKind, getEventBody, getEventSubject, getInboxKind, parseMessageBody, type InboxContext,
} from "@/components/inbox/inbox-model"
import { collectStopSignals, type StopSource } from "@/lib/advance-stops"
import { buildWeekReport, sanitizeWeekReports, type WeekReport } from "@/lib/week-report"
import { unansweredRows } from "@/components/report/report-model"

jest.mock("@/engine/worker/week-processor-bridge", () => {
    const { WeekProcessorBridge } = require("@/engine/worker/week-processor-client")
    return { weekProcessorBridge: new WeekProcessorBridge(() => { throw new Error("No browser worker in Node fixture") }) }
})
jest.mock("@/engine/manager-career-profile", () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined) }))

type Choice = { id: string; text: string; effects: Record<string, number> }

const FAN_CHOICES: Choice[] = [
    { id: "fan_meet", text: "Host Fan Meetup (Money -2k, Rep +5)", effects: { money: -2000, reputation: 5 } },
    { id: "social_post", text: "Social Media Campaign (Rep +1)", effects: { reputation: 1 } },
    { id: "ignore_fans", text: "Focus purely on practice (Morale +2)", effects: { morale: 2 } },
]
const MORALE_CHOICES: Choice[] = [
    { id: "talk", text: "One-on-One Talk (Morale +10)", effects: { morale: 10 } },
    { id: "bonus", text: "Performance Bonus (Money -5k, Loyalty +5)", effects: { money: -5000, loyalty: 5 } },
    { id: "ignore", text: "Ignore", effects: { loyalty: -5, morale: -5 } },
]

function fixture(week = 8): GameSave {
    const save = createLaunchFixture("first-week")
    save.currentWeek = week
    save.scheduledMatches = []
    save.eventsLog = []
    return save
}
const fan = (week: number, extra: Record<string, unknown> = {}): GameEventSaveData =>
    ({ id: `fan_meet_${week}`, type: "FAN", week, acknowledged: false, data: { hype: 10, ...extra }, choices: structuredClone(FAN_CHOICES) }) as GameEventSaveData
const unhappy = (pid: string, week: number): GameEventSaveData =>
    ({ id: `morale_${pid}_${week}`, type: "MORALE", week, acknowledged: false, data: { playerId: pid, morale: 22, reason: "Player unhappy" }, choices: structuredClone(MORALE_CHOICES) }) as GameEventSaveData
const find = (save: GameSave, id: string) => save.eventsLog.find(e => e.id === id)!
const ctxOf = (save: GameSave): InboxContext => {
    const team = save.teams.find(t => t.id === save.playerTeamId)!
    return { currentWeek: save.currentWeek, playerTeamId: save.playerTeamId, rosterIds: new Set(team.rosterIds), playerName: id => save.players.find(p => p.id === id)?.nickname }
}

describe("deadlines and stated defaults", () => {
    test("every open decision gets a deadline, a default and says what happens if unanswered", () => {
        const save = fixture(8)
        save.eventsLog.push(fan(8), unhappy("p_a2", 8))
        const res = normalizeDecisions(save)
        expect(res.assigned).toBe(2)
        const meetup = find(save, "fan_meet_8")
        expect(meetup.data).toMatchObject({ deadlineWeek: 9, defaultChoiceId: "ignore_fans" })
        expect(meetup.data.ifUnanswered).toBe("If you don't answer by Week 9, the club skips the meetup and keeps the squad on practice.")
        expect(find(save, "morale_p_a2_8").data.ifUnanswered).toBe("If you don't answer by Week 9, the club leaves PlayerA2's complaint unanswered.")
        // The inbox shows it under the request and lists the deadline.
        expect(getEventBody(meetup, ctxOf(save))).toMatch(/\n\nIf you don't answer by Week 9, the club skips the meetup/)
        // Idempotent.
        expect(normalizeDecisions(save)).toEqual({ assigned: 0, refreshed: 0, cooledDown: 0, deferred: 0 })
    })

    test("past the deadline the default is applied with the same effects as answering it, and logged", () => {
        const save = fixture(8)
        save.eventsLog.push(fan(8), unhappy("p_a2", 8))
        normalizeDecisions(save)
        const roster = save.teams[0].rosterIds
        const morale = new Map(save.players.map(p => [p.id, p.morale]))
        const loyalty = save.players.find(p => p.id === "p_a2")!.loyalty

        save.currentWeek = 9
        expect(expireDecisions(save)).toEqual([]) // still answerable in week 9

        save.currentWeek = 10
        const seen: string[] = []
        const expired = expireDecisions(save, d => seen.push(d.label))
        expect(expired.map(d => [d.label, d.outcome, d.applied])).toEqual([
            ["Fan meetup request", "Focus purely on practice (Morale +2)", true],
            ["Unhappy player (PlayerA2)", "Ignore", true],
        ])
        expect(seen).toEqual(["Fan meetup request", "Unhappy player (PlayerA2)"])
        // Fan default: +2 morale for the whole squad; complaint ignored: -5/-5 for that player only.
        for (const id of roster) {
            const expected = Math.min(100, morale.get(id)! + 2) + (id === "p_a2" ? -5 : 0)
            expect(save.players.find(p => p.id === id)!.morale).toBe(expected)
        }
        expect(save.players.find(p => p.id === "p_a2")!.loyalty).toBe(loyalty - 5)
        const meetup = find(save, "fan_meet_8")
        expect(meetup).toMatchObject({ selectedChoiceId: "ignore_fans", acknowledged: true })
        expect(meetup.data.unanswered).toEqual({ week: 10, label: "Fan meetup request", outcome: "Focus purely on practice (Morale +2)" })
        expect(save.acknowledgedEventIds).toEqual(expect.arrayContaining(["fan_meet_8", "morale_p_a2_8"]))
        expect(isOpenDecision(meetup)).toBe(false)
        // Settled: no longer a decision in the inbox, the note is gone from the body.
        expect(getDecisionKind(meetup, ctxOf(save))).toBeNull()
        expect(getEventBody(meetup, ctxOf(save))).not.toMatch(/If you don't answer/)
    })

    test("a default that can no longer apply lapses without effect; offers lapse", () => {
        const save = fixture(8)
        save.eventsLog.push(unhappy("gone", 7))
        normalizeDecisions(save)
        save.eventsLog.push(
            { id: "job_offer_8_x", type: "JOB_OFFER", week: 8, acknowledged: false, data: { offeringTeamName: "Rivals", offeringTeamId: "x", deadlineWeek: 9, originTeamId: save.playerTeamId } } as GameEventSaveData,
            { id: "offer_8_ai", type: "TRANSFER_OFFER", week: 8, acknowledged: false, data: { teamId: "ai", teamName: "AI", playerId: "p_a3", playerName: "PlayerA3", offerAmount: 50_000, expiresWeek: 10 }, choices: [{ id: "accept", text: "Accept Offer", effects: {} }, { id: "reject", text: "Reject", effects: {} }] } as GameEventSaveData,
        )
        normalizeDecisions(save)
        expect(find(save, "job_offer_8_x").data.ifUnanswered).toBe("If you don't answer by Week 9, the club lets the offer lapse.")
        expect(find(save, "offer_8_ai").data.ifUnanswered).toBe("If you don't answer by Week 9, the club lets the bid lapse.")
        const budget = save.teams[0].budget
        save.currentWeek = 10
        const expired = expireDecisions(save)
        expect(expired.map(d => [d.label, d.outcome, d.applied])).toEqual([
            ["Unhappy player", "Lapsed", false],
            ["Job offer from Rivals", "Lapsed", false],
            ["Bid for PlayerA3", "Lapsed", false],
        ])
        expect(save.eventsLog.every(e => e.selectedChoiceId === "expired")).toBe(true)
        expect(save.teams[0].budget).toBe(budget)
    })

    test("every decision family has a deadline window of one or two weeks and a default it can apply", () => {
        const ids = ["fan_meet_1", "sponsor_review_1", "equipment_deal_1", "media_interview_1", "morale_p_1", "birthday_p_0", "fatigue_p_1", "streak_win_1", "streak_loss_1", "legend_coach_opportunity_1_x", "career_decision_t_1_confidence"]
        for (const id of ids) {
            const r = decisionRuleFor({ id, type: "X", week: 1, acknowledged: false, data: {}, choices: [{ id: "a", text: "A", effects: { morale: 1 } }] } as GameEventSaveData)!
            expect(r.window).toBeGreaterThanOrEqual(1)
            expect(r.window).toBeLessThanOrEqual(2)
            expect(r.consequence.length).toBeGreaterThan(5)
        }
    })
})

describe("no stacking", () => {
    test("a repeat of an open request refreshes it: one open decision, same deadline, Continue mark kept", () => {
        const save = fixture(8)
        save.eventsLog.push(fan(8))
        normalizeDecisions(save)
        find(save, "fan_meet_8").data.continueStopped = true
        save.currentWeek = 9
        save.eventsLog.push(fan(9, { hype: 40 }))
        const res = normalizeDecisions(save)
        expect(res.refreshed).toBe(1)
        const open = save.eventsLog.filter(isOpenDecision)
        expect(open.map(e => e.id)).toEqual(["fan_meet_8"])
        expect(open[0].data).toMatchObject({ hype: 40, deadlineWeek: 9, continueStopped: true, refreshedWeek: 9 })
    })

    test("a family just settled stays quiet for its cooldown", () => {
        const save = fixture(8)
        save.eventsLog.push({ ...fan(6), selectedChoiceId: "social_post", data: { hype: 10, resolvedWeek: 7 } })
        save.eventsLog.push(fan(8))
        expect(normalizeDecisions(save).cooledDown).toBe(1)
        expect(save.eventsLog.map(e => e.id)).toEqual(["fan_meet_6"])
        save.currentWeek = 11
        save.eventsLog.push(fan(11))
        expect(normalizeDecisions(save).cooledDown).toBe(0)
        expect(find(save, "fan_meet_11")).toBeDefined()
    })

    test("situational requests wait while two decisions are open; offers never wait", () => {
        expect(MAX_OPEN_DECISIONS).toBe(2)
        const save = fixture(8)
        save.eventsLog.push(unhappy("p_a1", 7), unhappy("p_a2", 7))
        normalizeDecisions(save)
        save.eventsLog.push(fan(8), { id: "job_offer_8_x", type: "JOB_OFFER", week: 8, acknowledged: false, data: { offeringTeamId: "x", deadlineWeek: 9 } } as GameEventSaveData)
        const res = normalizeDecisions(save)
        expect(res.deferred).toBe(1)
        expect(save.eventsLog.filter(isOpenDecision).map(e => e.id).sort()).toEqual(["job_offer_8_x", "morale_p_a1_7", "morale_p_a2_7"])
    })

    test("older saves: open requests without deadlines get one on load, repeats merge, nothing new is dropped", () => {
        const save = fixture(20)
        // Pre-4.9 log: four stacked meetups, two sponsor reviews, a current-week interview.
        save.eventsLog.push(fan(3), fan(7), fan(12), fan(18))
        save.eventsLog.push(
            { id: "sponsor_review_5", type: "SPONSOR", week: 5, acknowledged: false, data: { currentSponsors: 1 }, choices: [{ id: "negotiate", text: "Negotiate", effects: { reputation: -5 } }, { id: "status_quo", text: "Standard", effects: { reputation: 2 } }] } as GameEventSaveData,
            { id: "media_interview_20", type: "MEDIA", week: 20, acknowledged: false, data: { title: "Interview Request: X" }, choices: [{ id: "accept", text: "Accept", effects: { reputation: 3 } }, { id: "decline", text: "Decline", effects: {} }] } as GameEventSaveData,
        )
        const res = normalizeDecisions(save, { arrivals: false })
        expect(res).toMatchObject({ refreshed: 3, cooledDown: 0, deferred: 0, assigned: 3 })
        const open = save.eventsLog.filter(isOpenDecision)
        expect(open.map(e => e.id).sort()).toEqual(["fan_meet_3", "media_interview_20", "sponsor_review_5"])
        // At least this week and the next to answer, then the stated default.
        for (const e of open) expect(e.data.deadlineWeek).toBe(21)
        expect(find(save, "sponsor_review_5").data.ifUnanswered).toBe("If you don't answer by Week 21, the club sends the standard progress report.")
    })
})

describe("weekly digest", () => {
    const lvl = (id: string, week: number, acknowledged = false): GameEventSaveData =>
        ({ id, type: "PLAYER_LEVEL_UP", week, acknowledged, data: { playerName: "PlayerA1", newLevel: 4 } }) as GameEventSaveData

    test("low-value notices fold into one unread round-up; needed messages and decisions stay on their own", () => {
        const save = fixture(8)
        save.eventsLog.push(
            lvl("evt_lvl_7_p_a1", 7),
            { id: "ms_win_10", type: "MILESTONE", week: 8, acknowledged: true, data: { description: "10 career wins!" } } as GameEventSaveData,
            { id: "upcoming_match_m1_8", type: "TOURNAMENT", week: 8, acknowledged: false, data: { title: "Match Day!", message: "Your team faces X today." } } as GameEventSaveData,
            { id: "recovery_p_a3_8", type: "INJURY", week: 8, acknowledged: false, data: { playerId: "p_a3", title: "Player Recovered" } } as GameEventSaveData,
            { id: "injury_p_a4_8", type: "INJURY", week: 8, acknowledged: false, data: { playerId: "p_a4", weeksOut: 2 } } as GameEventSaveData,
            { id: "scouting_complete_8_x", type: "SCOUTING_COMPLETE", week: 8, acknowledged: false, data: { title: "Scouting report" } } as GameEventSaveData,
            fan(8),
            lvl("evt_lvl_old", 3), // before last week: left alone
        )
        normalizeDecisions(save)
        const ctx = ctxOf(save)
        const before = countInbox(save.eventsLog, ctx)
        expect(before.unreadMessages).toBe(6)

        expect(foldWeeklyDigest(save)).toBe(4)
        const digest = save.eventsLog.find(e => e.type === DIGEST_TYPE)!
        expect(digest).toMatchObject({ id: "digest_w8", week: 8, acknowledged: false })
        for (const id of ["evt_lvl_7_p_a1", "ms_win_10", "upcoming_match_m1_8", "recovery_p_a3_8"]) {
            expect(find(save, id)).toMatchObject({ acknowledged: true, data: expect.objectContaining({ digestId: "digest_w8" }) })
        }
        // Folded events stay in the log (fire-once ids), hidden from the inbox.
        const keys = buildInboxItems({ eventsLog: save.eventsLog }, ctx).map(i => i.key)
        expect(keys).toEqual(expect.arrayContaining(["digest_w8", "injury_p_a4_8", "scouting_complete_8_x", "fan_meet_8", "evt_lvl_old"]))
        expect(keys).not.toContain("evt_lvl_7_p_a1")
        expect(countInbox(save.eventsLog, ctx)).toEqual({ decisions: 1, unreadMessages: 4, unreadNews: 0 })

        expect(getEventSubject(digest, ctx)).toBe("Round-up: 4 smaller updates (weeks 7–8)")
        const body = getEventBody(digest, ctx)
        expect(body).toMatch(/WEEK 8\n• 10 career wins!\n• Your team faces X today\.\n• PlayerA3 is fit again/)
        expect(body).toMatch(/WEEK 7\n• PlayerA1 reached level 4/)
        // The reading pane renders it as week headings with bullet lists.
        expect(parseMessageBody(body).map(b => b.kind)).toEqual(["paragraph", "heading", "list", "heading", "list"])
    })

    test("the round-up rolls while unread; once read the next week starts a new one", () => {
        const save = fixture(8)
        save.eventsLog.push(lvl("a", 8))
        foldWeeklyDigest(save)
        save.currentWeek = 9
        save.eventsLog.push(lvl("b", 9))
        foldWeeklyDigest(save)
        let digests = save.eventsLog.filter(e => e.type === DIGEST_TYPE)
        expect(digests).toHaveLength(1)
        expect(digests[0]).toMatchObject({ id: "digest_w8", week: 9 })
        expect((digests[0].data.items as unknown[]).length).toBe(2)

        digests[0].acknowledged = true
        save.currentWeek = 10
        save.eventsLog.push(lvl("c", 10))
        foldWeeklyDigest(save)
        digests = save.eventsLog.filter(e => e.type === DIGEST_TYPE)
        expect(digests.map(d => [d.id, d.acknowledged])).toEqual([["digest_w10", false], ["digest_w8", true]])
        // Toasted (already read) notices fold into a read round-up.
        save.currentWeek = 11
        digests[0].acknowledged = true
        save.eventsLog.push(lvl("d", 11, true))
        foldWeeklyDigest(save)
        expect(save.eventsLog.find(e => e.id === "digest_w11")!.acknowledged).toBe(true)
    })

    test("decisions, contracts, injuries, offers, board and sponsor mail are never folded", () => {
        const keep: Array<Partial<GameEventSaveData>> = [
            { id: "injury_p_8", type: "INJURY" }, { id: "contract_warn_p_12", type: "CONTRACT" }, { id: "board_pulse_8", type: "CAREER_UPDATE" },
            { id: "sponsor_goal_8", type: "SPONSOR_OFFER" }, { id: "scouting_complete_8", type: "SCOUTING_COMPLETE" }, { id: "trophy_t_mine", type: "MEDIA" },
            { id: "fan_meet_8", type: "FAN", choices: FAN_CHOICES }, { id: "job_offer_8", type: "JOB_OFFER" }, { id: "activity_unaffordable_8_t", type: "TEAM_UPDATE" },
        ]
        for (const e of keep) expect(isDigestible({ week: 8, acknowledged: false, data: {}, ...e } as GameEventSaveData)).toBe(false)
    })
})

describe("inbox classification", () => {
    test("rumours and other clubs' injuries and trophies are wire news, not mail or decisions", () => {
        const save = fixture(8)
        const ctx = ctxOf(save)
        const rumor = { id: "transfer_rumor_8", type: "TRANSFER_OFFER", week: 8, acknowledged: false, data: { playerId: "p_a1", teamId: "ai", offerAmount: 10_000 } } as GameEventSaveData
        expect(getDecisionKind(rumor, ctx)).toBeNull()
        expect(getInboxKind(rumor, ctx)).toBe("news")
        expect(getInboxKind({ id: "injury_x_8", type: "INJURY", week: 8, acknowledged: false, data: { playerId: "someone_else" } } as GameEventSaveData, ctx)).toBe("news")
        expect(getInboxKind({ id: "injury_p_a1_8", type: "INJURY", week: 8, acknowledged: false, data: { playerId: "p_a1" } } as GameEventSaveData, ctx)).toBe("message")
        expect(getInboxKind({ id: "trophy_t_other", type: "MEDIA", week: 8, acknowledged: false, data: { teamId: "other" } } as GameEventSaveData, ctx)).toBe("news")
        expect(getInboxKind({ id: "trophy_t_mine", type: "MEDIA", week: 8, acknowledged: false, data: { teamId: save.playerTeamId } } as GameEventSaveData, ctx)).toBe("message")
        // Old "acknowledge" buttons are messages, not decisions.
        expect(getInboxKind({ id: "legend_mentorship_8_x", type: "NEWS", week: 8, acknowledged: false, data: {}, choices: [{ id: "ack", text: "Incredible!", effects: {} }] } as GameEventSaveData, ctx)).toBe("message")
    })
})

describe("Continue stops", () => {
    const src = (save: GameSave) => save as unknown as StopSource

    test("a decision stops once: marked, expired or rumoured requests never stop", () => {
        const save = fixture(8)
        save.eventsLog.push(fan(8))
        normalizeDecisions(save)
        expect(collectStopSignals(src(save)).map(s => s.key)).toEqual(["event:fan_meet_8"])
        find(save, "fan_meet_8").data.continueStopped = true
        expect(collectStopSignals(src(save))).toEqual([])

        const late = fixture(10)
        late.eventsLog.push(fan(8))
        normalizeDecisions(late, { arrivals: false })
        find(late, "fan_meet_8").data.deadlineWeek = 9
        expect(collectStopSignals(src(late))).toEqual([])

        save.eventsLog.push({ id: "transfer_rumor_8", type: "TRANSFER_OFFER", week: 8, acknowledged: false, data: { teamName: "AI", playerName: "PlayerA1", offerAmount: 1 } } as GameEventSaveData)
        expect(collectStopSignals(src(save))).toEqual([])
    })
})

describe("weekly report", () => {
    test("decisions settled by default this tick are listed; the saved history keeps them", () => {
        const eventsLog = [
            { id: "a", data: { unanswered: { week: 10, label: "Fan meetup request", outcome: "Focus purely on practice (Morale +2)" } } },
            { id: "b", data: { unanswered: { week: 9, label: "Old", outcome: "Lapsed" } } },
            { id: "c", data: { unanswered: { week: 10, label: "Job offer from Rivals", outcome: "Lapsed" } } },
        ]
        const report = buildWeekReport({ week: 9, teamId: "t", tracker: null, preAdvance: null, tickChanges: [], final: null, state: { currentWeek: 10, teams: [], players: [], contracts: [], completedMatches: [], eventsLog } })
        expect(report.unanswered).toEqual([
            { label: "Fan meetup request", outcome: "Focus purely on practice (Morale +2)" },
            { label: "Job offer from Rivals", outcome: "Lapsed" },
        ])
        expect(unansweredRows(report)).toEqual([
            { label: "Fan meetup request", outcome: "Focus purely on practice" },
            { label: "Job offer from Rivals", outcome: "Lapsed, no effect" },
        ])
        const restored = sanitizeWeekReports(JSON.parse(JSON.stringify({ tracker: null, history: [report, { ...report, week: 8, unanswered: [{ label: 3 }] }] })))
        expect(restored!.history[0].unanswered).toEqual(report.unanswered)
        expect((restored!.history[1] as WeekReport).unanswered).toBeUndefined()
    })
})

describe("store: the week tick applies defaults and folds the round-up", () => {
    const initial = { ...useGameStore.getState() }
    afterEach(async () => { jest.restoreAllMocks(); await debouncedStorage.flush() })

    function load(save: GameSave) {
        save.timeMode = "WEEKLY"
        save.currentDay = 6
        useGameStore.setState({
            ...initial, ...structuredClone(save), league: undefined, boardState: undefined,
            weekReports: null, continueRun: null, advanceStop: null, advanceSeenKeys: [], weekReportOpen: null, weekReportToast: null,
            isLoading: false, isInitialized: true, _completedMatchIds: new Set(), addToast: jest.fn(),
        } as never)
        jest.spyOn(saveManager, "saveGame").mockResolvedValue({ success: true })
    }

    test("an unanswered request past its deadline gets its default in the tick, with cause 'Unanswered: …' in the report", async () => {
        const save = fixture(1)
        const meetup = fan(1)
        save.eventsLog.push(meetup, { id: "evt_lvl_1_x", type: "PLAYER_LEVEL_UP", week: 1, acknowledged: false, data: { playerName: "PlayerA1", newLevel: 2 } } as GameEventSaveData)
        normalizeDecisions(save)
        find(save, "fan_meet_1").data.deadlineWeek = 1 // due this week
        load(save)

        await useGameStore.getState().advanceWeek()
        const state = useGameStore.getState()
        expect(state.currentWeek).toBe(2)
        const settled = state.eventsLog.find(e => e.id === "fan_meet_1")!
        expect(settled).toMatchObject({ selectedChoiceId: "ignore_fans", acknowledged: true })
        expect(settled.data.unanswered).toMatchObject({ week: 2, label: "Fan meetup request" })

        const report = state.weekReports!.history[0]
        expect(report.unanswered).toEqual([{ label: "Fan meetup request", outcome: "Focus purely on practice (Morale +2)" }])
        const caused = report.changes.filter(e => e.cause.label === "Unanswered: Fan meetup request")
        expect(caused.length).toBeGreaterThan(0)
        expect(caused.every(e => e.kind === "morale" && e.delta > 0)).toBe(true)

        // The in-week level-up was folded into the round-up.
        const lvlUp = state.eventsLog.find(e => e.id === "evt_lvl_1_x")!
        expect(lvlUp.data.digestId).toBeDefined()
        expect(state.eventsLog.some(e => e.type === DIGEST_TYPE && e.id === lvlUp.data.digestId)).toBe(true)
        // Every request the tick left open carries a deadline.
        for (const e of state.eventsLog.filter(isOpenDecision)) expect(e.data.ifUnanswered).toEqual(expect.stringMatching(/^If you don't answer by Week \d+, the club /))
    })

    test("Continue marks the decision it stopped on, so it never stops on it again (also after a reload)", async () => {
        const save = fixture(1)
        save.eventsLog.push(fan(1))
        normalizeDecisions(save)
        load(save)
        const run = () => useGameStore.getState().continueToNextDecision()
        await run()
        expect(useGameStore.getState().advanceStop).toMatchObject({ kind: "event", key: "event:fan_meet_1" })
        expect(useGameStore.getState().eventsLog.find(e => e.id === "fan_meet_1")!.data.continueStopped).toBe(true)
        // A reload forgets the transient seen keys; the saved mark still holds.
        useGameStore.setState({ advanceSeenKeys: [] })
        expect(collectStopSignals(useGameStore.getState() as unknown as StopSource).some(s => s.key === "event:fan_meet_1")).toBe(false)
    })
})
