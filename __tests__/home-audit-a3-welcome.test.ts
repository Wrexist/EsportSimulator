/**
 * HOME-22: the welcome mail's team rating is the Team OVR Home shows (the
 * starting five's OVR), not the mean of raw skill over the whole roster.
 */
import { useGameStore } from "@/store/game-store"
import { teamOvr } from "@/lib/team-ovr"

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

test("welcome mail rating equals Team OVR", async () => {
    const { snapshotLoader } = jest.requireMock("@/data") as typeof import("@/data")
    await snapshotLoader.loadSnapshot()
    const teams = snapshotLoader.getSnapshot()!.teams as unknown as { id: string; reputation: number }[]
    const club = [...teams].sort((a, b) => a.reputation - b.reputation || a.id.localeCompare(b.id))[5]
    await useGameStore.getState().initializeNewGame("Welcome check", club.id)
    const s = useGameStore.getState()
    expect(s.error ?? null).toBeNull()
    const welcome = s.eventsLog.find(e => e.id.startsWith("evt_welcome_"))!
    const team = s.teams.find(t => t.id === s.playerTeamId)
    const rating = (welcome.data.messageRef as { params: { rating: number } }).params.rating
    expect(rating).toBe(teamOvr(team, s.players))
    expect(welcome.data.message).toContain(`average team rating is ${rating}.`)
})
