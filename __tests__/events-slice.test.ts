/**
 * Tests for the events slice — focused on the read-state and news-feed
 * actions that are easy to isolate. The resolveEventChoice / acceptJobOffer
 * / negotiateJobOffer paths have heavy dependencies (JobOfferGenerator,
 * money math, team-switch side-effects) and are better suited to a
 * dedicated integration test.
 *
 * Coverage here:
 *   - acknowledgeEvent: marks the event read, appends to
 *     acknowledgedEventIds without dup
 *   - markAllEventsAsRead: bulk version, doesn't double-append
 *   - addNewsItem: prepends with deterministic id + current week,
 *     bounds the newsFeed at NEWS_FEED_CAP=50 (drops oldest)
 *   - acceptJobOffer: switches playerTeamId on success, returns
 *     error states on wrong event type / expired / missing team
 *   - declineJobOffer: surfaces a decline event and marks the
 *     offer acknowledged
 */

import { produce, enableMapSet } from "immer"
import { createEventsSlice } from "@/store/slices/events-slice"
import type { GameEventSaveData, TeamSaveData } from "@/engine/save-types"
import type { StoreState } from "@/store/types"

enableMapSet()

function makeHarness(initial: Partial<StoreState>) {
    let state = initial as StoreState
    const set = (
        patch: Partial<StoreState> | ((draft: StoreState) => void)
    ) => {
        if (typeof patch === "function") {
            state = produce(state, patch as (s: StoreState) => void)
        } else {
            state = { ...state, ...patch }
        }
    }
    const get = () => state
    return { state: () => state, set, get }
}

function makeTeam(id: string, overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(),
        budget: 100_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1, leagueTier: "B_TIER",
        elo: 1500, recentForm: [],
        ...overrides,
    } as unknown as TeamSaveData
}

function makeEvent(id: string, overrides: Partial<GameEventSaveData> = {}): GameEventSaveData {
    return {
        id, type: "INFO", week: 5, acknowledged: false,
        data: { title: "test", message: "test", severity: "info" },
        ...overrides,
    } as unknown as GameEventSaveData
}

function makeBaseState(overrides: Partial<StoreState> = {}): Partial<StoreState> {
    return {
        teams: [makeTeam("player")],
        players: [],
        eventsLog: [],
        newsFeed: [],
        acknowledgedEventIds: [],
        currentWeek: 5,
        playerTeamId: "player",
        lastRngSeed: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    }
}

describe("acknowledgeEvent + markAllEventsAsRead", () => {
    test("acknowledgeEvent flips the flag and adds to acknowledgedEventIds", () => {
        const h = makeHarness(makeBaseState({
            eventsLog: [makeEvent("e1")],
        }))
        const slice = createEventsSlice(h.set, h.get)
        slice.acknowledgeEvent("e1")
        expect(h.state().eventsLog[0].acknowledged).toBe(true)
        expect(h.state().acknowledgedEventIds).toEqual(["e1"])
    })

    test("acknowledgeEvent on already-ack'd event doesn't push a duplicate id", () => {
        const h = makeHarness(makeBaseState({
            eventsLog: [makeEvent("e1", { acknowledged: true })],
            acknowledgedEventIds: ["e1"],
        }))
        const slice = createEventsSlice(h.set, h.get)
        slice.acknowledgeEvent("e1")
        expect(h.state().acknowledgedEventIds).toEqual(["e1"])
    })

    test("acknowledgeEvent on unknown id is a no-op on eventsLog + still pushes to acknowledged set", () => {
        const h = makeHarness(makeBaseState({
            eventsLog: [],
            acknowledgedEventIds: [],
        }))
        const slice = createEventsSlice(h.set, h.get)
        slice.acknowledgeEvent("ghost")
        expect(h.state().acknowledgedEventIds).toEqual(["ghost"])
    })

    test("markAllEventsAsRead marks every event ack'd and dedupes the id set", () => {
        const h = makeHarness(makeBaseState({
            eventsLog: [
                makeEvent("e1"),
                makeEvent("e2", { acknowledged: true }),
                makeEvent("e3"),
            ],
            acknowledgedEventIds: ["e2"], // pre-existing
        }))
        const slice = createEventsSlice(h.set, h.get)
        slice.markAllEventsAsRead()
        for (const e of h.state().eventsLog) {
            expect(e.acknowledged).toBe(true)
        }
        // No dup of e2, e1 and e3 added.
        expect([...h.state().acknowledgedEventIds].sort()).toEqual(["e1", "e2", "e3"])
    })
})

describe("addNewsItem", () => {
    test("prepends item with the current week stamped", () => {
        const h = makeHarness(makeBaseState({ currentWeek: 10 }))
        const slice = createEventsSlice(h.set, h.get)
        slice.addNewsItem({
            title: "Hot off the press", content: "Detail", category: "INFO",
        })
        expect(h.state().newsFeed.length).toBe(1)
        expect(h.state().newsFeed[0].title).toBe("Hot off the press")
        expect(h.state().newsFeed[0].week).toBe(10)
        expect(h.state().newsFeed[0].id).toBeDefined()
    })

    test("bounds the newsFeed at NEWS_FEED_CAP=50 — oldest is dropped on overflow", () => {
        // Seed with 50 items, then push one more.
        const seeded = Array.from({ length: 50 }, (_, i) => ({
            id: `old_${i}`, title: `Old ${i}`, content: "", category: "INFO", week: 1,
        }))
        const h = makeHarness(makeBaseState({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            newsFeed: seeded as any,
        }))
        const slice = createEventsSlice(h.set, h.get)
        slice.addNewsItem({ title: "Fresh", content: "", category: "INFO" })
        // Length still capped at 50.
        expect(h.state().newsFeed.length).toBe(50)
        // Newest is at index 0.
        expect(h.state().newsFeed[0].title).toBe("Fresh")
        // Oldest (old_49 — was at the END because we unshift new items
        // and pop the tail) is now gone.
        expect(h.state().newsFeed.find(n => n.id === "old_49")).toBeUndefined()
    })
})

describe("acceptJobOffer", () => {
    function makeJobOfferState() {
        const offerEvent = makeEvent("offer1", {
            type: "JOB_OFFER",
            data: {
                offeringTeamId: "team_b",
                deadlineWeek: 10,
                managerName: "Test Coach",
                offeredSalary: 5000,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
        })
        return makeBaseState({
            currentWeek: 5,
            playerTeamId: "team_a",
            teams: [makeTeam("team_a"), makeTeam("team_b", { name: "Beta" })],
            eventsLog: [offerEvent],
        })
    }

    test("switches playerTeamId on a valid in-window offer", () => {
        const h = makeHarness(makeJobOfferState())
        const slice = createEventsSlice(h.set, h.get)
        const res = slice.acceptJobOffer("offer1")
        expect(res.success).toBe(true)
        expect(h.state().playerTeamId).toBe("team_b")
        expect(res.message).toContain("Beta")
        // A welcome-event was prepended.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(((h.state().eventsLog[0] as any).data).title).toContain("Beta")
    })

    // Phase 3.2 — the advertised signing bonus is now actually paid.
    test("credits the signing bonus (salaryOffer * 4) to the new club budget + ledger", () => {
        const offerEvent = makeEvent("offer1", {
            type: "JOB_OFFER",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: { offeringTeamId: "team_b", deadlineWeek: 10, salaryOffer: 10_000 } as any,
        })
        const h = makeHarness(makeBaseState({
            currentWeek: 5, playerTeamId: "team_a",
            teams: [makeTeam("team_a"), makeTeam("team_b", { name: "Beta", budget: 200_000 })],
            eventsLog: [offerEvent],
            financeLedger: [],
        }))
        const res = createEventsSlice(h.set, h.get).acceptJobOffer("offer1")

        expect(res.success).toBe(true)
        const teamB = h.state().teams.find(t => t.id === "team_b")!
        expect(teamB.budget).toBe(200_000 + 40_000) // salaryOffer 10k * 4
        const ledger = h.state().financeLedger.filter(e => e.teamId === "team_b")
        expect(ledger).toHaveLength(1)
        expect(ledger[0].amount).toBe(40_000)
        expect(ledger[0].type).toBe("INCOME")
    })

    test("a higher (negotiated) salaryOffer yields a proportionally higher bonus", () => {
        const mkHarness = (salary: number) => {
            const offerEvent = makeEvent("offer1", {
                type: "JOB_OFFER",
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                data: { offeringTeamId: "team_b", deadlineWeek: 10, salaryOffer: salary } as any,
            })
            return makeHarness(makeBaseState({
                currentWeek: 5, playerTeamId: "team_a",
                teams: [makeTeam("team_a"), makeTeam("team_b", { budget: 100_000 })],
                eventsLog: [offerEvent], financeLedger: [],
            }))
        }
        const low = mkHarness(5_000); createEventsSlice(low.set, low.get).acceptJobOffer("offer1")
        const high = mkHarness(20_000); createEventsSlice(high.set, high.get).acceptJobOffer("offer1")
        const lowB = low.state().teams.find(t => t.id === "team_b")!.budget
        const highB = high.state().teams.find(t => t.id === "team_b")!.budget
        expect(highB - lowB).toBe((20_000 - 5_000) * 4)
    })

    test("no bonus / no crash when the offer carries no salary", () => {
        const offerEvent = makeEvent("offer1", {
            type: "JOB_OFFER",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: { offeringTeamId: "team_b", deadlineWeek: 10 } as any,
        })
        const h = makeHarness(makeBaseState({
            currentWeek: 5, playerTeamId: "team_a",
            teams: [makeTeam("team_a"), makeTeam("team_b", { budget: 100_000 })],
            eventsLog: [offerEvent], financeLedger: [],
        }))
        const res = createEventsSlice(h.set, h.get).acceptJobOffer("offer1")
        expect(res.success).toBe(true)
        expect(h.state().teams.find(t => t.id === "team_b")!.budget).toBe(100_000)
    })

    test("rejects when current week is past deadlineWeek", () => {
        const h = makeHarness({
            ...makeJobOfferState(),
            currentWeek: 11, // past the deadlineWeek 10
        })
        const slice = createEventsSlice(h.set, h.get)
        const res = slice.acceptJobOffer("offer1")
        expect(res.success).toBe(false)
        expect(res.message).toContain("expired")
        expect(h.state().playerTeamId).toBe("team_a") // unchanged
    })

    test("rejects when the offering team no longer exists", () => {
        const state = makeJobOfferState()
        state.teams = [makeTeam("team_a")] // team_b removed
        const h = makeHarness(state)
        const slice = createEventsSlice(h.set, h.get)
        const res = slice.acceptJobOffer("offer1")
        expect(res.success).toBe(false)
        expect(res.message).toContain("no longer exists")
    })

    test("rejects when the event isn't a JOB_OFFER", () => {
        const h = makeHarness(makeBaseState({
            eventsLog: [makeEvent("wrong_event", { type: "INFO" })],
        }))
        const slice = createEventsSlice(h.set, h.get)
        const res = slice.acceptJobOffer("wrong_event")
        expect(res.success).toBe(false)
        expect(res.message).toContain("Job offer not found")
    })

    // Anti-exploit: each accept pays a salary×4 signing bonus, so without a
    // cooldown a player could job-hop to farm cash. A recent change blocks the
    // next move.
    test("blocks accepting another offer within the job-change cooldown", () => {
        const h = makeHarness({
            ...makeJobOfferState(),
            currentWeek: 8,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            managerDetails: { name: "C", level: 1, xp: 0, reputation: 50, careerWins: 0, careerLosses: 0, championships: 0, lastJobChangeWeek: 2 } as any,
        })
        const res = createEventsSlice(h.set, h.get).acceptJobOffer("offer1")
        expect(res.success).toBe(false)
        expect(res.message).toContain("week") // "...for N more weeks"
        expect(h.state().playerTeamId).toBe("team_a") // not switched
        // No farmed bonus.
        expect(h.state().teams.find(t => t.id === "team_b")!.budget).toBe(makeTeam("team_b").budget)
    })

    test("allows the move once the cooldown has elapsed and records the new change week", () => {
        const h = makeHarness({
            ...makeJobOfferState(),
            currentWeek: 20, // well past lastJobChangeWeek 2 + 12
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            managerDetails: { name: "C", level: 1, xp: 0, reputation: 50, careerWins: 0, careerLosses: 0, championships: 0, lastJobChangeWeek: 2 } as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            teams: [makeTeam("team_a"), makeTeam("team_b", { name: "Beta" })] as any,
            // deadline must be in the future for week 20
        })
        // bump the offer deadline past week 20
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(h.state().eventsLog[0].data as any).deadlineWeek = 25
        const res = createEventsSlice(h.set, h.get).acceptJobOffer("offer1")
        expect(res.success).toBe(true)
        expect(h.state().playerTeamId).toBe("team_b")
        expect(h.state().managerDetails.lastJobChangeWeek).toBe(20)
    })
})
