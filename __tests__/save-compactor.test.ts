/**
 * Tests for the persistent-state compactor.
 *
 * compactPersistentState runs every week tick and trims the 6 growing
 * arrays (eventsLog, completedMatches, financeLedger, transferHistory,
 * newsFeed, tournamentQualifications) down to their ARRAY_CAPS ceilings.
 *
 * The contracts that matter:
 *   - Arrays under cap are left alone (no needless mutation)
 *   - Over-cap arrays drop the OLDEST entries; not the newest
 *   - eventsLog uses a stable secondary sort: unread before read
 *     within the same week, so a player never loses an unread mail
 *     while older read mail still sits in the log
 *   - acknowledgedEventIds drops references to events the compactor
 *     just pruned, so the set doesn't grow without bound
 *
 * If any of these rules silently breaks, players lose progress
 * artifacts (transfer history, trophies-tied ledger rows, etc.) or
 * the save file bloats. Both are silent failures — only this test
 * suite catches them.
 */

import { compactPersistentState } from "@/engine/processors/save-compactor"
import { ARRAY_CAPS } from "@/lib/constants"
import type { GameSave } from "@/engine/save-types"

function makeSave(overrides: Partial<GameSave>): GameSave {
    return {
        currentWeek: 100,
        playerTeamId: "player",
        teams: [],
        players: [],
        contracts: [],
        staff: [],
        marketStaff: [],
        academyPlayers: [],
        scheduledMatches: [],
        completedMatches: [],
        scheduledActivities: [],
        financeLedger: [],
        eventsLog: [],
        newsFeed: [],
        tournaments: [],
        tournamentQualifications: [],
        transferHistory: [],
        acknowledgedEventIds: [],
        lastRngSeed: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    } as unknown as GameSave
}

describe("compactPersistentState — no-op when under cap", () => {
    test("leaves all arrays untouched when they're under their caps", () => {
        const save = makeSave({
            eventsLog: [{ id: "e1", type: "INFO", week: 5, acknowledged: false, data: {} } as never],
            completedMatches: [{ id: "m1" } as never],
            financeLedger: [{ id: "f1" } as never],
            newsFeed: [{ id: "n1", week: 5 } as never],
            transferHistory: [{ id: "t1" } as never],
        })
        const before = {
            eventsLog: save.eventsLog.length,
            completedMatches: save.completedMatches.length,
            financeLedger: save.financeLedger.length,
            newsFeed: save.newsFeed.length,
            transferHistory: save.transferHistory.length,
        }
        compactPersistentState(save)
        expect(save.eventsLog.length).toBe(before.eventsLog)
        expect(save.completedMatches.length).toBe(before.completedMatches)
        expect(save.financeLedger.length).toBe(before.financeLedger)
        expect(save.newsFeed.length).toBe(before.newsFeed)
        expect(save.transferHistory.length).toBe(before.transferHistory)
    })
})

describe("compactPersistentState — eviction caps", () => {
    test("completedMatches drops OLDEST entries past the cap", () => {
        // ARRAY_CAPS.completedMatches = 2000. Create cap+5 sequential matches
        // with id "m0".."m{cap+4}". The tail-slice keeps the LAST cap, so
        // m0..m4 should be gone; m{cap+4} should still be there.
        const cap = ARRAY_CAPS.completedMatches
        const matches = Array.from({ length: cap + 5 }, (_, i) => ({ id: `m${i}` } as never))
        const save = makeSave({ completedMatches: matches })
        compactPersistentState(save)
        expect(save.completedMatches.length).toBe(cap)
        // Oldest dropped.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(save.completedMatches.find(m => (m as any).id === "m0")).toBeUndefined()
        // Newest kept.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(save.completedMatches.find(m => (m as any).id === `m${cap + 4}`)).toBeDefined()
    })

    test("financeLedger tail-slice keeps the most recent entries", () => {
        const cap = ARRAY_CAPS.financeLedger
        const ledger = Array.from({ length: cap + 3 }, (_, i) => ({ id: `f${i}` } as never))
        const save = makeSave({ financeLedger: ledger })
        compactPersistentState(save)
        expect(save.financeLedger.length).toBe(cap)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(save.financeLedger.find(e => (e as any).id === `f${cap + 2}`)).toBeDefined()
    })

    test("transferHistory tail-slice keeps the most recent entries", () => {
        const cap = ARRAY_CAPS.transferHistory
        const history = Array.from({ length: cap + 10 }, (_, i) => ({ id: `t${i}` } as never))
        const save = makeSave({ transferHistory: history })
        compactPersistentState(save)
        expect(save.transferHistory.length).toBe(cap)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(save.transferHistory.find(e => (e as any).id === `t${cap + 9}`)).toBeDefined()
    })

    test("newsFeed sorts by week descending then trims — keeps the freshest week", () => {
        const cap = ARRAY_CAPS.newsFeed
        // Mix old and new in random order so the sort actually matters.
        const news = [
            ...Array.from({ length: cap }, (_, i) => ({ id: `old_${i}`, week: 1 } as never)),
            ...Array.from({ length: cap }, (_, i) => ({ id: `new_${i}`, week: 50 } as never)),
        ]
        const save = makeSave({ newsFeed: news })
        compactPersistentState(save)
        expect(save.newsFeed.length).toBe(cap)
        // Every survivor must be from the newer week.
        for (const item of save.newsFeed) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((item as any).week).toBe(50)
        }
    })
})

describe("compactPersistentState — eventsLog priority sort", () => {
    test("within the same week, UNREAD events survive over READ events", () => {
        // Cap is 500. Build cap+1 events all at week 10, with the FIRST event
        // being unread. If the eviction sorted purely by position it would
        // drop the unread one; the priority sort must keep it.
        const cap = ARRAY_CAPS.eventsLog
        const events = Array.from({ length: cap + 1 }, (_, i) => ({
            id: `e${i}`,
            type: "INFO",
            week: 10,
            acknowledged: i !== 0, // only e0 is unread
            data: {},
        } as never))
        const save = makeSave({ eventsLog: events })
        compactPersistentState(save)
        expect(save.eventsLog.length).toBe(cap)
        // The unread event must have survived.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(save.eventsLog.find(e => (e as any).id === "e0")).toBeDefined()
    })

    test("newer weeks always rank above older weeks", () => {
        const cap = ARRAY_CAPS.eventsLog
        const oldEvents = Array.from({ length: cap }, (_, i) => ({
            id: `old_${i}`, type: "INFO", week: 1, acknowledged: false, data: {},
        } as never))
        const newEvents = Array.from({ length: cap }, (_, i) => ({
            id: `new_${i}`, type: "INFO", week: 50, acknowledged: true, data: {},
        } as never))
        const save = makeSave({ eventsLog: [...oldEvents, ...newEvents] })
        compactPersistentState(save)
        expect(save.eventsLog.length).toBe(cap)
        // Every survivor should be from the newer week, even though
        // they're all marked acknowledged (newer beats older regardless
        // of read state).
        for (const e of save.eventsLog) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((e as any).week).toBe(50)
        }
    })
})

describe("compactPersistentState — acknowledgedEventIds cleanup", () => {
    test("drops acknowledgement ids for events the compactor just pruned", () => {
        const cap = ARRAY_CAPS.eventsLog
        // Push cap+2 events, all at the same week; this triggers eviction.
        const events = Array.from({ length: cap + 2 }, (_, i) => ({
            id: `e${i}`, type: "INFO", week: 10, acknowledged: true, data: {},
        } as never))
        const save = makeSave({
            eventsLog: events,
            // Both pruned events AND surviving events have ack entries.
            acknowledgedEventIds: ["e0", "e1", `e${cap + 1}`, "ghost_id_for_old_pruned_event"],
        })
        compactPersistentState(save)
        const survivorIds = new Set(save.eventsLog.map(e => e.id))
        for (const ackId of save.acknowledgedEventIds) {
            expect(survivorIds.has(ackId)).toBe(true)
        }
        // The "ghost" id is gone.
        expect(save.acknowledgedEventIds).not.toContain("ghost_id_for_old_pruned_event")
    })
})

describe("compactPersistentState — tournamentQualifications dedup + cap", () => {
    test("dedupes regardless of length and respects the cap on its own", () => {
        const cap = ARRAY_CAPS.tournamentQualifications
        // Mix of duplicates and unique entries that exceeds the cap after dedup.
        const dupRow = {
            tournamentId: "iem_s1", seriesId: "iem", seasonNumber: 1,
            instanceId: "iem_s1", teamId: "t1", status: "QUALIFIED",
            weekUpdated: 5,
        } as never
        const quals = [
            dupRow, dupRow, dupRow,
            ...Array.from({ length: cap + 5 }, (_, i) => ({
                tournamentId: `tour_${i}`, seriesId: `series_${i}`, seasonNumber: 1,
                instanceId: `tour_${i}`, teamId: "t1", status: "QUALIFIED",
                weekUpdated: 5,
            } as never)),
        ]
        const save = makeSave({ tournamentQualifications: quals })
        compactPersistentState(save)
        // After dedup-then-cap, length should be exactly the cap.
        expect(save.tournamentQualifications.length).toBeLessThanOrEqual(cap)
        // Should be no duplicates left.
        const seen = new Set<string>()
        for (const q of save.tournamentQualifications) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const key = `${(q as any).tournamentId}:${(q as any).teamId}`
            expect(seen.has(key)).toBe(false)
            seen.add(key)
        }
    })
})

describe("compactPersistentState — scheduledActivities pruning (Phase 4.2)", () => {
    test("drops activities whose window ended before last week; keeps current/future/spanning", () => {
        const save = makeSave({
            currentWeek: 100,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            scheduledActivities: [
                { id: "rest_old", type: "REST", week: 1, day: 3, duration: 0 },
                { id: "rest_50", type: "REST", week: 50, day: 3, duration: 0 },
                { id: "rest_99", type: "REST", week: 99, day: 3, duration: 0 },      // grace week
                { id: "rest_100", type: "REST", week: 100, day: 3, duration: 0 },    // current
                { id: "boot_future", type: "BOOTCAMP", week: 105, day: 0, duration: 2 },
                { id: "mkt_spanning", type: "MARKETING", week: 98, day: 0, duration: 5 }, // 98..103 still spans 100
                { id: "mkt_ended", type: "MARKETING", week: 90, day: 0, duration: 3 },    // 90..93 ended
            ] as any,
        })

        compactPersistentState(save)
        const ids = save.scheduledActivities.map(a => a.id)

        expect(ids).not.toContain("rest_old")
        expect(ids).not.toContain("rest_50")
        expect(ids).not.toContain("mkt_ended")
        expect(ids).toContain("rest_99")
        expect(ids).toContain("rest_100")
        expect(ids).toContain("boot_future")
        expect(ids).toContain("mkt_spanning")
    })

    test("bounds growth — 700 accumulated REST days collapse to the recent ~14", () => {
        const acts: unknown[] = []
        for (let w = 1; w <= 100; w++) {
            for (let d = 0; d < 7; d++) acts.push({ id: `rest_${w}_${d}`, type: "REST", week: w, day: d, duration: 0 })
        }
        const save = makeSave({ currentWeek: 100, scheduledActivities: acts as never })

        compactPersistentState(save)

        expect(save.scheduledActivities.length).toBeLessThanOrEqual(14)
        expect(save.scheduledActivities.every(a => a.week >= 99)).toBe(true)
    })
})

describe("compactPersistentState — tournament instances (pre-Steam growth audit)", () => {
    // currentWeek 520 → season floor((520-1)/52)+1 = 10; keep completed from seasons >= 8.
    test("keeps active + recent-completed tournaments, drops ancient completed ones", () => {
        const save = makeSave({
            currentWeek: 520,
            tournaments: [
                { id: "a_s10", isCompleted: false, seasonNumber: 10, endWeek: 540 } as never, // active → keep
                { id: "b_s10", isCompleted: true, seasonNumber: 10, endWeek: 515 } as never,  // this season → keep
                { id: "c_s9", isCompleted: true, seasonNumber: 9, endWeek: 460 } as never,    // 1 ago → keep
                { id: "d_s8", isCompleted: true, seasonNumber: 8, endWeek: 410 } as never,    // 2 ago → keep
                { id: "e_s7", isCompleted: true, seasonNumber: 7, endWeek: 360 } as never,    // 3 ago → DROP
                { id: "f_s2", isCompleted: true, seasonNumber: 2, endWeek: 100 } as never,    // ancient → DROP
            ],
        })
        compactPersistentState(save)
        expect(save.tournaments.map(t => t.id)).toEqual(["a_s10", "b_s10", "c_s9", "d_s8"])
    })

    test("never drops an incomplete tournament regardless of age", () => {
        const save = makeSave({
            currentWeek: 520,
            tournaments: [{ id: "old_active", isCompleted: false, seasonNumber: 2, endWeek: 100 } as never],
        })
        compactPersistentState(save)
        expect(save.tournaments.map(t => t.id)).toEqual(["old_active"])
    })
})
