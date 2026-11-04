/**
 * MATCHDAY-03: a finished live match is recorded as soon as the series is
 * over (end beat), and "Continue to results" afterwards neither records nor
 * saves it a second time. Mirrors saveMatchResult's guard: a match already in
 * completedMatches is never recorded again.
 */
import { commitLiveMatch } from "@/lib/live-match-commit"

function harness(opts: { refuse?: boolean } = {}) {
    const completed: string[] = []
    const saveMatchResult = jest.fn((id: string) => {
        if (opts.refuse || completed.includes(id)) return
        completed.push(id)
    })
    const buildResult = jest.fn(() => ({ winnerId: "me" }))
    const clearActive = jest.fn()
    const persist = jest.fn(() => Promise.resolve())
    const args = {
        matchId: "m1",
        ownerSaveId: "s1",
        isRecorded: () => completed.includes("m1"),
        buildResult,
        saveMatchResult,
        clearActive,
        persist,
    }
    return { args, completed, saveMatchResult, buildResult, clearActive, persist }
}

describe("commitLiveMatch", () => {
    test("records, clears the live shell and saves the career once", () => {
        const h = harness()
        expect(commitLiveMatch(h.args)).toBe("committed")
        expect(h.completed).toEqual(["m1"])
        expect(h.saveMatchResult).toHaveBeenCalledWith("m1", { winnerId: "me" })
        expect(h.clearActive).toHaveBeenCalledTimes(1)
        expect(h.persist).toHaveBeenCalledWith("s1", "m1")
    })

    test("end-beat commit, then Continue: no second record and no second save", () => {
        const h = harness()
        commitLiveMatch(h.args) // the series ended (effect on FINISHED)
        expect(commitLiveMatch(h.args)).toBe("already") // "Continue to results"
        expect(h.completed).toEqual(["m1"])
        expect(h.buildResult).toHaveBeenCalledTimes(1)
        expect(h.saveMatchResult).toHaveBeenCalledTimes(1)
        expect(h.persist).toHaveBeenCalledTimes(1)
        expect(h.clearActive).toHaveBeenCalledTimes(1)
    })

    test("a refused result keeps the live match (no clear, no save)", () => {
        const h = harness({ refuse: true })
        expect(commitLiveMatch(h.args)).toBe("failed")
        expect(h.clearActive).not.toHaveBeenCalled()
        expect(h.persist).not.toHaveBeenCalled()
    })
})
