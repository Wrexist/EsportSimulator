/**
 * Phase 4.3 inbox drawer: classification, badge counts, honest effect labels
 * (checked against what resolveEventChoice really applies) and body parsing.
 */
import { produce, enableMapSet } from "immer"
import type { GameEventSaveData, TeamSaveData } from "@/engine/save-types"
import type { StoreState } from "@/store/types"
import { createEventsSlice } from "@/store/slices/events-slice"
import {
    buildInboxItems, choiceLabel, countInbox, describeChoice, getDecisionKind, getInboxKind,
    inboxBadgeCount, itemsForTab, parseMessageBody, type InboxContext,
} from "@/components/inbox/inbox-model"
import { selectInboxCounts } from "@/components/inbox/inbox-store-bindings"

enableMapSet()

const ctx = (over: Partial<InboxContext> = {}): InboxContext => ({
    currentWeek: 5,
    playerTeamId: "mine",
    rosterIds: new Set(["p1", "p2"]),
    playerName: id => ({ p1: "ace", p2: "smokey" } as Record<string, string>)[id],
    ...over,
})

function ev(id: string, over: Partial<GameEventSaveData> & Record<string, unknown> = {}): GameEventSaveData {
    return { id, type: "INFO", week: 5, acknowledged: false, data: {}, ...over } as GameEventSaveData
}

const choices = (...list: { id: string; text: string; effects: Record<string, number> }[]) => list as unknown as GameEventSaveData["choices"]

describe("classification", () => {
    test("open choices, transfer bids and job offers are decisions; answered/expired/withdrawn are not", () => {
        const c = ctx()
        const choice = ev("morale_p1_5", { type: "MORALE", data: { playerId: "p1" }, choices: choices({ id: "talk", text: "Talk", effects: { morale: 10 } }) })
        expect(getDecisionKind(choice, c)).toBe("choice")
        expect(getDecisionKind({ ...choice, selectedChoiceId: "talk" }, c)).toBeNull()
        expect(getDecisionKind(ev("job", { type: "JOB_OFFER", data: { deadlineWeek: 6, originTeamId: "mine" } }), c)).toBe("job_offer")
        expect(getDecisionKind(ev("job2", { type: "JOB_OFFER", data: { deadlineWeek: 4 } }), c)).toBeNull()
        expect(getDecisionKind(ev("job3", { type: "JOB_OFFER", data: { deadlineWeek: 6, isWithdrawn: true } }), c)).toBeNull()
        expect(getDecisionKind(ev("bid", { type: "TRANSFER_OFFER", data: { playerId: "p2", teamId: "ai", expiresWeek: 7 } }), c)).toBe("transfer_offer")
        // acceptTransferOffer treats currentWeek >= expiresWeek as expired.
        expect(getDecisionKind(ev("bid2", { type: "TRANSFER_OFFER", data: { playerId: "p2", teamId: "ai", expiresWeek: 5 } }), c)).toBeNull()
        // A player who has left the roster can no longer be answered for.
        expect(getDecisionKind(ev("m9", { type: "MORALE", data: { playerId: "gone" }, choices: choices({ id: "talk", text: "Talk", effects: { morale: 1 } }) }), c)).toBeNull()
    })

    test("wire stories about other clubs are news, everything else addressed to you is a message", () => {
        expect(getInboxKind(ev("a", { type: "AI_TRANSFER" }), ctx())).toBe("news")
        expect(getInboxKind(ev("b", { type: "ROSTER_UPDATE" }), ctx())).toBe("news")
        expect(getInboxKind(ev("c", { type: "CAREER_UPDATE" }), ctx())).toBe("message")
        expect(getInboxKind(ev("d", { type: "FINANCE" }), ctx())).toBe("message")
    })

    test("All pins open decisions first; Messages keeps answered ones as history", () => {
        const items = buildInboxItems({
            eventsLog: [
                ev("old_decision", { week: 2, type: "MORALE", data: { playerId: "p1" }, choices: choices({ id: "talk", text: "Talk", effects: { morale: 1 } }) }),
                ev("answered", { week: 4, type: "FAN", selectedChoiceId: "x", choices: choices({ id: "x", text: "X", effects: { reputation: 1 } }) }),
                ev("wire", { week: 5, type: "AI_SIGNING" }),
            ],
            newsFeed: [{ id: "n1", title: "Headline", content: "Body", week: 3 }],
        }, ctx())
        expect(itemsForTab(items, "all").map(i => i.key)).toEqual(["old_decision", "wire", "answered", "news:n1"])
        expect(itemsForTab(items, "decisions").map(i => i.key)).toEqual(["old_decision"])
        expect(itemsForTab(items, "messages").map(i => i.key)).toEqual(["answered"])
        expect(itemsForTab(items, "news").map(i => i.key)).toEqual(["wire", "news:n1"])
    })
})

describe("badge count", () => {
    test("counts open decisions (read or not) plus unread messages; not news, not read mail", () => {
        const log = [
            ev("d1", { type: "MORALE", acknowledged: true, data: { playerId: "p1" }, choices: choices({ id: "t", text: "T", effects: { morale: 1 } }) }),
            ev("bid", { type: "TRANSFER_OFFER", data: { playerId: "p1", teamId: "ai", expiresWeek: 7 } }),
            ev("m1", { type: "FINANCE" }),
            ev("m2", { type: "FINANCE", acknowledged: true }),
            ev("n1", { type: "AI_TRANSFER" }),
        ]
        const counts = countInbox(log, ctx())
        expect(counts).toEqual({ decisions: 2, unreadMessages: 1, unreadNews: 1 })
        expect(inboxBadgeCount(counts)).toBe(3)
    })

    test("the top-bar selector is zero without a career and memoised on the events log", () => {
        const base = { currentWeek: 5, playerTeamId: "mine", saveId: "s1", teams: [{ id: "mine", rosterIds: ["p1"] }], players: [{ id: "p1", nickname: "ace" }] }
        const eventsLog = [ev("m1", { type: "FINANCE" })]
        const state = { ...base, eventsLog } as never
        const a = selectInboxCounts(state)
        expect(a).toEqual({ decisions: 0, unreadMessages: 1, unreadNews: 0 })
        expect(selectInboxCounts(state)).toBe(a)
        expect(selectInboxCounts({ ...base, saveId: null, eventsLog } as never)).toEqual({ decisions: 0, unreadMessages: 0, unreadNews: 0 })
    })
})

// ─── Honest effect labels: the chips match what the store applies ─────────

function harness(event: GameEventSaveData, budget = 100_000) {
    let state = {
        teams: [{ id: "mine", budget, rosterIds: ["p1", "p2"], chemistry: 50, reputation: 50, staffIds: [] } as unknown as TeamSaveData],
        players: [
            { id: "p1", morale: 50, loyalty: 50, fatigue: 50 },
            { id: "p2", morale: 50, loyalty: 50, fatigue: 50 },
        ],
        eventsLog: [event],
        acknowledgedEventIds: [],
        financeLedger: [],
        staff: [],
        toasts: [],
        currentWeek: 5,
        playerTeamId: "mine",
    } as unknown as StoreState
    const set = (patch: Partial<StoreState> | ((d: StoreState) => void)) => {
        state = typeof patch === "function" ? produce(state, patch as (d: StoreState) => void) : { ...state, ...patch }
    }
    const slice = createEventsSlice(set, () => state)
    return { slice, state: () => state }
}

describe("describeChoice matches resolveEventChoice", () => {
    test("player-scoped morale + money: chips equal the applied deltas", () => {
        const event = ev("morale_p1_5", {
            type: "MORALE", data: { playerId: "p1" },
            choices: choices({ id: "bonus", text: "Performance Bonus (Money -5k, Loyalty +5)", effects: { money: -5000, loyalty: 5 } }),
        })
        const outcome = describeChoice(event, event.choices![0], 100_000)
        expect(outcome.chips.map(c => c.label)).toEqual(["-$5,000", "+5 loyalty"])
        expect(outcome.blockedReason).toBeUndefined()

        const h = harness(event)
        h.slice.resolveEventChoice(event.id, "bonus")
        const s = h.state()
        expect(s.teams[0].budget).toBe(95_000)
        expect(s.players.find(p => p.id === "p1")!.loyalty).toBe(55)
        expect(s.players.find(p => p.id === "p2")!.loyalty).toBe(50)
        expect(s.eventsLog[0].selectedChoiceId).toBe("bonus")
    })

    test("team events say '(squad)' and every roster player gets the change", () => {
        const event = ev("fan_meet_5", {
            type: "FAN", data: {},
            choices: choices({ id: "ignore_fans", text: "Focus purely on practice (Morale +2)", effects: { morale: 2 } }),
        })
        expect(describeChoice(event, event.choices![0], 0).chips.map(c => c.label)).toEqual(["+2 morale (squad)"])
        const h = harness(event)
        h.slice.resolveEventChoice(event.id, "ignore_fans")
        expect(h.state().players.map(p => p.morale)).toEqual([52, 52])
    })

    test("fatigue and chemistry show the clamped value the store applies", () => {
        const event = ev("story", {
            type: "MORALE", data: {},
            choices: choices({ id: "x", text: "X", effects: { fatigue: -25, chemistry: 9 } }),
        })
        expect(describeChoice(event, event.choices![0], 0).chips.map(c => c.label)).toEqual(["-10 fatigue (squad)", "+5 chemistry"])
        const h = harness(event)
        h.slice.resolveEventChoice(event.id, "x")
        expect(h.state().players.map(p => p.fatigue)).toEqual([40, 40])
        expect(h.state().teams[0].chemistry).toBe(55)
    })

    test("an unaffordable cost is shown as blocked, and the store refuses it", () => {
        const event = ev("fan_meet_5", {
            type: "FAN", data: {},
            choices: choices({ id: "fan_meet", text: "Host Fan Meetup (Money -2k, Rep +5)", effects: { money: -2000, reputation: 5 } }),
        })
        expect(describeChoice(event, event.choices![0], 1_000).blockedReason).toBe("Not enough funds")
        const h = harness(event, 1_000)
        h.slice.resolveEventChoice(event.id, "fan_meet")
        expect(h.state().eventsLog[0].selectedChoiceId).toBeUndefined()
        expect(h.state().teams[0].budget).toBe(1_000)
    })

    test("empty effects read 'No effect'; the legend coach hire lists its real costs", () => {
        const decline = ev("media", { type: "MEDIA", choices: choices({ id: "decline", text: "Decline Politely", effects: {} }) })
        expect(describeChoice(decline, decline.choices![0], 0).chips).toEqual([{ label: "No effect", tone: "neutral" }])
        const legend = ev("legend_coach_opportunity_7", { type: "MEDIA", data: { salaryCost: 15000 }, choices: choices({ id: "hire", text: "Hire as Coach ($15,000/week)", effects: { money: 0 } }) })
        const out = describeChoice(legend, legend.choices![0], 10_000)
        expect(out.chips.map(c => c.label)).toEqual(["-$15,000 now", "$15,000/wk wages", "+10 chemistry", "+5 reputation", "Replaces your coach"])
        expect(out.blockedReason).toMatch(/15,000/)
    })

    test("a transfer bid can be rejected through resolveEventChoice, but not accepted (that must sell the player)", () => {
        const bid = ev("offer_5_ai_p1_1", {
            type: "TRANSFER_OFFER", data: { playerId: "p1", teamId: "ai", offerAmount: 100, expiresWeek: 7 },
            choices: choices({ id: "accept", text: "Accept Offer", effects: {} }, { id: "reject", text: "Reject", effects: {} }),
        })
        const h = harness(bid)
        h.slice.resolveEventChoice(bid.id, "accept")
        expect(h.state().eventsLog[0].selectedChoiceId).toBeUndefined()
        h.slice.resolveEventChoice(bid.id, "reject")
        expect(h.state().eventsLog[0].selectedChoiceId).toBe("reject")
        expect(h.state().eventsLog[0].acknowledged).toBe(true)
        expect(getDecisionKind(h.state().eventsLog[0], ctx({ rosterIds: new Set(["p1"]) }))).toBeNull()
    })
})

describe("copy helpers", () => {
    test("choiceLabel drops inline effect notes the chips replace", () => {
        expect(choiceLabel({ id: "a", text: "Throw a Party (-$1k, Morale +10)" })).toBe("Throw a Party")
        expect(choiceLabel({ id: "b", text: "Support session: $500, morale +8, loyalty +2" })).toBe("Support session")
        expect(choiceLabel({ id: "c", text: "Recovery session: $750, fatigue -10" })).toBe("Recovery session")
        expect(choiceLabel({ id: "d", text: "Discuss Renewal" })).toBe("Discuss Renewal")
    })

    test("parseMessageBody turns the welcome mail into headings, paragraphs and lists without emoji", () => {
        const blocks = parseMessageBody("Congratulations!\n\n🎮 YOUR TEAM\nYou manage X.\n\n📋 FIRST STEPS\n• Review your roster\n• Check the Schedule")
        expect(blocks).toEqual([
            { kind: "paragraph", text: "Congratulations!" },
            { kind: "heading", text: "YOUR TEAM" },
            { kind: "paragraph", text: "You manage X." },
            { kind: "heading", text: "FIRST STEPS" },
            { kind: "list", items: ["Review your roster", "Check the Schedule"] },
        ])
    })
})
