/**
 * One click from a match stop: the engine's veto (the same maps the Quick sim
 * veto picks), the counters the VOD review found, then the result.
 */
import { useGameStore } from "@/store/game-store"
import { autoVetoMaps } from "@/lib/auto-veto"
import { getActivePlayersByRosterOrder } from "@/lib/live-match-builders"

jest.mock("@/data", () => {
    const actual = jest.requireActual("@/data")
    const { SnapshotLoader } = jest.requireActual("@/data/snapshot-loader")
    const nodePath = jest.requireActual("node:path")
    return { ...actual, snapshotLoader: new SnapshotLoader(nodePath.join(process.cwd(), "public/data/snapshot")) }
})
jest.mock("@/engine/worker/week-processor-bridge", () => {
    const { WeekProcessorBridge } = require("@/engine/worker/week-processor-client")
    return { weekProcessorBridge: new WeekProcessorBridge(() => { throw new Error("No browser worker in Node fixture") }) }
})
jest.mock("@/engine/manager-career-profile", () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined), recordNewCampaign: jest.fn() }))

test("Sim match vetoes, applies reviewed counters and records the result", async () => {
    const { createLaunchFixture } = jest.requireActual("@/scripts/launch/fixtures")
    const { saveManager } = jest.requireActual("@/engine")
    const { debouncedStorage } = jest.requireActual("@/engine/storage-adapter")
    const save = createLaunchFixture("first-week")
    save.currentWeek = 8
    save.timeMode = "WEEKLY"
    save.currentDay = 6
    const me = save.playerTeamId
    const opp = save.teams.find((t: { id: string; rosterIds: string[] }) => t.id !== me && t.rosterIds.length >= 5)!.id
    const fixture = (id: string, over: Record<string, unknown> = {}) => ({ id, homeTeamId: me, awayTeamId: opp, week: 8, day: 6, format: "BO3", seed: 11, tournamentId: null, stage: null, ...over })
    const load = (matches: unknown[]) => useGameStore.setState({
        ...useGameStore.getState(), ...structuredClone({ ...save, scheduledMatches: matches, completedMatches: [] }), league: undefined, boardState: undefined,
        weekReports: null, continueRun: null, advanceStop: null, advanceSeenKeys: [], weekReportOpen: null, weekReportToast: null,
        isLoading: false, isInitialized: true, _completedMatchIds: new Set(), activeMatchId: null, activeMatchState: null,
    } as never)
    const spy = jest.spyOn(saveManager, "saveGame").mockResolvedValue({ success: true })

    // Reviewed: the veto runs and every played map gets both counters before the sim.
    load([fixture("m_reviewed", { vodReviewed: true })])
    const s0 = useGameStore.getState()
    const team = (id: string) => s0.teams.find(t => t.id === id)!
    const expected = autoVetoMaps(fixture("m_reviewed"), getActivePlayersByRosterOrder(team(me), s0.players), getActivePlayersByRosterOrder(team(opp), s0.players))
    const setCounter = jest.spyOn(useGameStore.getState(), "setMatchCounter")
    expect(await useGameStore.getState().prepAndSimMatch("m_reviewed")).toBe(true)
    let s = useGameStore.getState()
    const done = s.completedMatches.find(m => m.id === "m_reviewed")!
    expect(done).toBeDefined()
    expect(expected).toHaveLength(3)
    expect(setCounter.mock.calls.map(c => c.slice(1, 3))).toEqual(expected.flatMap(m => [[m, "ct"], [m, "t"]]).filter((c, i, all) => all.findIndex(x => x[0] === c[0] && x[1] === c[1]) === i))
    setCounter.mockRestore()

    // Not reviewed: no counters appear from nowhere.
    load([fixture("m_plain")])
    const setCounter2 = jest.spyOn(useGameStore.getState(), "setMatchCounter")
    expect(await useGameStore.getState().prepAndSimMatch("m_plain")).toBe(true)
    expect(setCounter2).not.toHaveBeenCalled()
    s = useGameStore.getState()
    expect(s.completedMatches.some(m => m.id === "m_plain")).toBe(true)
    setCounter2.mockRestore()
    spy.mockRestore()
    await debouncedStorage.flush()
}, 180_000)
