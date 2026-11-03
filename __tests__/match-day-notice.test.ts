/**
 * HOME-09: the week-start "Match Day!" notice said "today" in daily mode
 * although the match was days later in the week.
 */
import { matchDayPhrase } from "@/engine/atomic-week-processor"
import { gameCalendarDate } from "@/lib/game-calendar"

describe("matchDayPhrase", () => {
    const start = "2025-10-28T00:00:00.000Z" // a Tuesday: week 1 day 0

    test("daily mode names the match day, matching the calendar", () => {
        const save = { timeMode: "HYBRID_DAILY" as const, gameStartDate: start }
        expect(matchDayPhrase(save, { week: 10, day: 5 })).toBe("on Sun, Jan 4")
        // Same date the UI calendar shows for that fixture.
        const ui = gameCalendarDate(start, 10, 5)
        expect(ui.getUTCDay()).toBe(0)
        expect(ui.getUTCDate()).toBe(4)
    })

    test("a match on the first day of the week, or weekly mode, is 'today'", () => {
        expect(matchDayPhrase({ timeMode: "HYBRID_DAILY", gameStartDate: start }, { week: 10, day: 0 })).toBe("today")
        expect(matchDayPhrase({ timeMode: "WEEKLY", gameStartDate: start }, { week: 10, day: 5 })).toBe("today")
        expect(matchDayPhrase({ timeMode: "HYBRID_DAILY", gameStartDate: start }, { week: 10 })).toBe("today")
    })

    test("no start date: 'this week' instead of a wrong 'today'", () => {
        expect(matchDayPhrase({ timeMode: "HYBRID_DAILY", gameStartDate: "" }, { week: 10, day: 3 })).toBe("this week")
    })
})
