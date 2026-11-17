import { pruneGameState } from "@/store/utils/array-pruning"
import { ARRAY_CAPS } from "@/engine/constants"

describe("pruning long-career arrays", () => {
  test("news keeps the newest stories (the feed is newest-first)", () => {
    const newsFeed = Array.from({ length: ARRAY_CAPS.newsFeed + 5 }, (_, i) => ({ id: `n${i}`, week: 1000 - i }))
    const state = { completedMatches: [], eventsLog: [], financeLedger: [], transferHistory: [], newsFeed, playerTeamId: "t" }
    pruneGameState(state as never)
    expect(state.newsFeed).toHaveLength(ARRAY_CAPS.newsFeed)
    expect(state.newsFeed[0].id).toBe("n0")
    expect(state.newsFeed.at(-1)!.id).toBe(`n${ARRAY_CAPS.newsFeed - 1}`)
  })
})

describe("ENGINE-04: the events log keeps the newest mail", () => {
  test("pruneGameState trims a newest-first log from the old end, as the week compactor does", () => {
    // Most writers unshift: this week's mail sits at the head.
    const eventsLog = Array.from({ length: ARRAY_CAPS.eventsLog + 20 }, (_, i) => ({ id: `e${i}`, week: 1000 - i, acknowledged: i % 2 === 0 }))
    const state = { completedMatches: [], eventsLog, financeLedger: [], transferHistory: [], newsFeed: [], playerTeamId: "t" }
    pruneGameState(state as never)
    expect(state.eventsLog).toHaveLength(ARRAY_CAPS.eventsLog)
    expect(state.eventsLog.some(e => e.id === "e0")).toBe(true)
    expect(state.eventsLog.some(e => e.id === `e${ARRAY_CAPS.eventsLog + 19}`)).toBe(false)
    expect(Math.min(...state.eventsLog.map(e => e.week))).toBe(1000 - (ARRAY_CAPS.eventsLog - 1))
  })

  test("a pushed (oldest-first) log keeps its newest entries too, unread first within a week", () => {
    const eventsLog = Array.from({ length: ARRAY_CAPS.eventsLog + 2 }, (_, i) => ({ id: `p${i}`, week: Math.floor(i / 2), acknowledged: i % 2 === 1 }))
    const state = { completedMatches: [], eventsLog, financeLedger: [], transferHistory: [], newsFeed: [], playerTeamId: "t" }
    pruneGameState(state as never)
    expect(state.eventsLog).toHaveLength(ARRAY_CAPS.eventsLog)
    expect(state.eventsLog.some(e => e.id === `p${ARRAY_CAPS.eventsLog + 1}`)).toBe(true)
    expect(state.eventsLog.some(e => e.id === "p0")).toBe(false)
  })
})
