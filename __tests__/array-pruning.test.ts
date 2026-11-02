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
