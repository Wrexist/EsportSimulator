/**
 * Phase 4.1: Continue advances until something needs the manager, says why,
 * and respects every guard of the underlying advance actions.
 */
import { useGameStore } from "@/store/game-store"
import { saveManager } from "@/engine"
import { weekProcessorBridge } from "@/engine/worker/week-processor-bridge"
import { debouncedStorage } from "@/engine/storage-adapter"
import { createLaunchFixture } from "@/scripts/launch/fixtures"
import type { ComputedWeek } from "@/engine/worker/compute-week"
import type { GameSave } from "@/engine/save-types"

jest.mock("@/engine/worker/week-processor-bridge", () => ({ weekProcessorBridge: { processWeek: jest.fn() } }))
jest.mock("@/engine/manager-career-profile", () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined) }))

const initial = { ...useGameStore.getState() }
type Script = Record<number, (save: GameSave) => void>

function load(opts: { timeMode?: "WEEKLY" | "HYBRID_DAILY"; match?: { day?: number }; roster?: number; script?: Script } = {}) {
    const save = createLaunchFixture("first-week")
    save.timeMode = opts.timeMode ?? "WEEKLY"
    save.currentDay = 0
    if (opts.match) save.scheduledMatches[0].day = opts.match.day
    else save.scheduledMatches = []
    if (opts.roster) save.teams[0].rosterIds = save.teams[0].rosterIds.slice(0, opts.roster)
    useGameStore.setState({
        ...initial, ...structuredClone(save), fplData: undefined, boardState: undefined,
        weekReports: null, continueRun: null, advanceStop: null, advanceSeenKeys: [], weekReportOpen: null, weekReportToast: null,
        isLoading: false, isInitialized: true, _completedMatchIds: new Set(), addToast: jest.fn(),
    } as never)
    jest.spyOn(saveManager, "saveGame").mockResolvedValue({ success: true })
    jest.mocked(weekProcessorBridge.processWeek).mockReset().mockImplementation(async input => {
        const processed = structuredClone(input)
        processed.currentWeek++
        processed.scheduledMatches = processed.scheduledMatches.filter(m => m.week >= processed.currentWeek)
        opts.script?.[processed.currentWeek]?.(processed)
        return { save: processed, rngState: 7, result: { success: true, changes: [] } as unknown as ComputedWeek["result"] }
    })
    return save
}

const store = () => useGameStore.getState()
const run = () => store().continueToNextDecision()

afterEach(async () => { jest.restoreAllMocks(); await debouncedStorage.flush() })

test("daily mode: Continue runs the days and stops on match day, saying so", async () => {
    load({ timeMode: "HYBRID_DAILY", match: { day: 3 } })
    await run()
    expect(store().currentDay).toBe(3)
    expect(store().advanceStop).toMatchObject({ kind: "match", reason: "Match day: AI Team 1 (BO1)" })
    expect(store().continueRun).toBeNull()
    expect(weekProcessorBridge.processWeek).not.toHaveBeenCalled()
})

test("weekly mode: nothing to decide stops at the four-week safety cap and opens the last report", async () => {
    const save = load()
    await run()
    expect(weekProcessorBridge.processWeek).toHaveBeenCalledTimes(4)
    expect(store().currentWeek).toBe(save.currentWeek + 4)
    expect(store().advanceStop).toMatchObject({ kind: "cap", reason: "4 weeks passed with nothing needing you" })
    expect(store().weekReportOpen).toBe(save.currentWeek + 3)
    expect(store().weekReports?.history.map(r => r.week)).toEqual([4, 3, 2, 1].map(n => save.currentWeek + n - 1))
})

test("an expiring contract stops the run with its reason; pressing again goes on", async () => {
    const save = load({ script: { 3: s => { s.contracts.find(c => c.playerId === "p_a2")!.endWeek = 5 } } })
    await run()
    expect(store().currentWeek).toBe(save.currentWeek + 2)
    expect(store().advanceStop).toMatchObject({ kind: "contract", reason: "PlayerA2's contract ends in 2 weeks", href: "/player/p_a2" })
    expect(store().weekReportOpen).toBe(save.currentWeek + 1)
    await run()
    expect(store().advanceStop?.kind).not.toBe("contract")
    expect(store().currentWeek).toBeGreaterThan(save.currentWeek + 2)
})

test.each([
    ["injury", (s: GameSave) => { s.players[2].injury = { type: "RSI", name: "Wrist Strain", weeksRemaining: 3 } as never }, "PlayerA3 is injured (Wrist Strain, 3 weeks)"],
    ["offer", (s: GameSave) => { s.eventsLog.push({ id: "off", week: s.currentWeek, type: "TRANSFER_OFFER", acknowledged: false, data: { teamName: "AI Team 2", playerName: "PlayerA4", offerAmount: 90000, expiresWeek: s.currentWeek + 2 }, choices: [] } as never) }, "AI Team 2 bid $90k for PlayerA4"],
    ["event", (s: GameSave) => { s.eventsLog.push({ id: "ev", week: s.currentWeek, type: "MORALE", acknowledged: false, data: {}, choices: [{ id: "a", text: "Talk", effects: { morale: 3 } }] } as never) }, "Internal Morale needs an answer"],
    ["board", (s: GameSave) => { s.newsFeed.unshift({ id: `board_pulse_w${s.currentWeek}_${s.playerTeamId}`, title: "The board is uneasy", content: "", week: s.currentWeek, category: "FINANCE" }) }, "Board review: The board is uneasy"],
])("a %s arriving in the week stops the run", async (kind, mutate, reason) => {
    const save = load({ script: { 2: mutate } })
    await run()
    expect(store().currentWeek).toBe(save.currentWeek + 1)
    expect(store().advanceStop).toMatchObject({ kind, reason })
})

test("a pending decision already waiting stops before anything advances, once", async () => {
    const save = load()
    useGameStore.setState(s => { s.eventsLog.push({ id: "ev0", week: save.currentWeek, type: "MORALE", acknowledged: false, data: {}, choices: [{ id: "a", text: "Talk", effects: {} }] } as never) })
    await run()
    expect(store().currentWeek).toBe(save.currentWeek)
    expect(store().advanceStop?.kind).toBe("event")
    await run()
    expect(store().currentWeek).toBeGreaterThan(save.currentWeek)
})

test("an unplayable fixture is announced, then forfeited by the next Continue (no softlock)", async () => {
    const save = load({ match: {}, roster: 4 })
    await run()
    expect(store().advanceStop).toMatchObject({ kind: "forfeit" })
    expect(store().currentWeek).toBe(save.currentWeek)
    await run()
    expect(weekProcessorBridge.processWeek).toHaveBeenCalled()
    expect(store().currentWeek).toBeGreaterThan(save.currentWeek)
})

test("Stop takes effect between days", async () => {
    load({ timeMode: "HYBRID_DAILY" })
    const running = run()
    await new Promise(r => setTimeout(r, 30))
    store().cancelContinue()
    await running
    expect(store().advanceStop?.kind).toBe("cancelled")
    expect(store().currentDay).toBeLessThanOrEqual(2)
    expect(store().continueRun).toBeNull()
})

test("guards: no career, game over and loading are no-ops; other callers cannot step during a run", async () => {
    load()
    useGameStore.setState({ saveId: null } as never)
    await run()
    useGameStore.setState({ saveId: "qa_first-week_3402", gameOverReason: "BANKRUPTCY" } as never)
    await run()
    useGameStore.setState({ gameOverReason: null, isLoading: true } as never)
    await run()
    expect(weekProcessorBridge.processWeek).not.toHaveBeenCalled()
    expect(store().continueRun).toBeNull()

    useGameStore.setState({ isLoading: false, timeMode: "HYBRID_DAILY", continueRun: { startedWeek: 1, weeksDone: 0, daysDone: 0, cancelRequested: false } } as never)
    await store().advanceDay()
    await store().advanceWeek()
    expect(store().currentDay).toBe(0)
    expect(weekProcessorBridge.processWeek).not.toHaveBeenCalled()
})
