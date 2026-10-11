/**
 * Phase 4.7: Club → Board describes the Phase 4.4 board with the engine's
 * real thresholds (warning < 40, on notice < 25, dismissal at 10 while on
 * notice, recovery at 50, eight-week grace).
 */
import { BOARD_TUNING } from "@/lib/balance-tuning"
import {
    BOARD_THRESHOLDS,
    boardStatus,
    boardWeeks,
    confidenceTrail,
    graceWeeksLeft,
    objectiveView,
    signedDelta,
} from "@/components/career/board-view"

describe("board standing", () => {
    test("labels follow the consequence ladder", () => {
        expect(boardStatus({ confidence: 60, onNotice: false, warnings: 0 })).toMatchObject({ standing: "secure", tone: "positive" })
        expect(boardStatus({ confidence: 50, onNotice: false, warnings: 0 }).standing).toBe("secure")
        expect(boardStatus({ confidence: 45, onNotice: false, warnings: 0 })).toMatchObject({ standing: "uneasy", label: "Uneasy" })
        expect(boardStatus({ confidence: 39, onNotice: false, warnings: 0 })).toMatchObject({ standing: "pressure", tone: "caution" })
        expect(boardStatus({ confidence: 39, onNotice: false, warnings: 0 }).detail).toMatch(/next weekly update brings a formal warning/)
        expect(boardStatus({ confidence: 39, onNotice: false, warnings: 0 }, 3).detail).toMatch(/first 8 weeks of a job \(3 left\)/)
        expect(boardStatus({ confidence: 45, onNotice: false, warnings: 1 })).toMatchObject({ standing: "warning", label: "Warning" })
        expect(boardStatus({ confidence: 45, onNotice: false, warnings: 1 }).detail).toBe("Below 25 you go on notice. Back to 50 clears the warning.")
        expect(boardStatus({ confidence: 20, onNotice: true, warnings: 2 })).toMatchObject({ standing: "notice", label: "On notice", tone: "negative" })
        expect(boardStatus({ confidence: 20, onNotice: true, warnings: 2 }).detail).toMatch(/reaches 10 the board dismisses you/)
        // Legacy saves without the warnings counter: on notice still reads as the final warning.
        expect(boardStatus({ confidence: 30, onNotice: true } as never).standing).toBe("notice")
        expect(boardStatus(undefined)).toMatchObject({ label: "New board" })
    })

    test("the thresholds shown are the engine's", () => {
        expect(BOARD_THRESHOLDS.map(t => t.at)).toEqual([BOARD_TUNING.RECOVERED_AT, BOARD_TUNING.WARN_BELOW, BOARD_TUNING.NOTICE_BELOW, BOARD_TUNING.SACK_AT_OR_BELOW])
        expect(BOARD_THRESHOLDS.map(t => t.at)).toEqual([50, 40, 25, 10])
    })

    test("grace weeks count down from the start of the job", () => {
        expect(graceWeeksLeft(1, 1)).toBe(8)
        expect(graceWeeksLeft(8, 1)).toBe(1)
        expect(graceWeeksLeft(9, 1)).toBe(0)
        expect(graceWeeksLeft(30, 25)).toBe(3)
        expect(graceWeeksLeft(5, undefined)).toBe(4)
    })
})

describe("objectives", () => {
    test("league, ranking and cash progress in words", () => {
        expect(objectiveView({ id: "league", label: "Finish 4th or better", target: 4, current: 6, status: "AT_RISK" }))
            .toMatchObject({ target: "4th or better", current: "6th", gap: "2 places to make up", status: "At risk", tone: "caution" })
        expect(objectiveView({ id: "league", label: "x", target: 4, current: 3, status: "ON_TRACK" }).gap).toBe("1 place to spare")
        expect(objectiveView({ id: "ranking", label: "x", target: 20, current: 35, status: "AT_RISK" }))
            .toMatchObject({ target: "#20 or better", current: "#35", gap: "15 places to climb" })
        expect(objectiveView({ id: "finance", label: "x", target: 200_000, current: 150_000, status: "AT_RISK" }))
            .toMatchObject({ target: "$200k or more", current: "$150k", gap: "$50k short" })
        expect(objectiveView({ id: "finance", label: "x", target: 200_000, current: 260_000, status: "MET" }))
            .toMatchObject({ gap: "$60k above", status: "Met", tone: "positive" })
        expect(objectiveView({ id: "league", label: "x", target: 2, status: "MISSED", current: 5 })).toMatchObject({ status: "Missed", tone: "negative" })
        expect(objectiveView({ id: "ranking", label: "x", target: 10 })).toMatchObject({ current: "—", gap: null, status: "Not started" })
    })
})

describe("confidence history", () => {
    const history = [
        { week: 6, delta: 0.8, cause: "Beat Alpha" },
        { week: 6, delta: -0.6, cause: "Behind target: 7th in Europe Division 3 (target 4th)" },
        { week: 5, delta: -2, cause: "Financial crisis: 6 weeks of runway" },
        { week: 3, delta: 0.3, cause: "On track" },
    ]

    test("moves group by week, newest first, with a net total", () => {
        const weeks = boardWeeks(history)
        expect(weeks.map(w => [w.week, w.total, w.moves.length])).toEqual([[6, 0.2, 2], [5, -2, 1], [3, 0.3, 1]])
        expect(boardWeeks(undefined)).toEqual([])
    })

    test("the trail walks back from today's confidence", () => {
        expect(confidenceTrail(50, history)).toEqual([51.5, 51.8, 49.8, 50])
        expect(confidenceTrail(42, [])).toEqual([42])
        expect(signedDelta(0.8)).toBe("+0.8")
        expect(signedDelta(-2)).toBe("−2")
        expect(signedDelta(0)).toBe("0")
    })
})
