/**
 * Between clubs on the real world snapshot: start without a club, turn
 * offers down, ask for more, take a job and play on. Same store actions the
 * job-market screen calls.
 */
import { useGameStore } from "@/store/game-store"
import { computeWeek } from "@/engine/worker/compute-week"
import { debouncedStorage } from "@/engine/storage-adapter"
import { FIRST_JOB_MAX_REPUTATION } from "@/engine/job-offer-generator"
import { buildSaveSnapshot } from "@/store/utils/build-save-snapshot"
import { TrainingFocus } from "@/types"

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


const open = () => useGameStore.getState().eventsLog.filter(e => e.type === "JOB_OFFER" && e.data?.afterDismissal && !e.selectedChoiceId && !e.data.isWithdrawn)

test("start without a club, turn offers down, find more and take a job", async () => {
    const { snapshotLoader } = jest.requireMock("@/data") as typeof import("@/data")
    await snapshotLoader.loadSnapshot()
    const teams = snapshotLoader.getSnapshot()!.teams as unknown as { id: string; reputation: number }[]
    const placeholder = [...teams].sort((a, b) => a.reputation - b.reputation || a.id.localeCompare(b.id))[0]
    await useGameStore.getState().initializeNewGame("Between clubs", placeholder.id, undefined, { unemployed: true })
    let s = useGameStore.getState()
    expect(s.error ?? null).toBeNull()
    expect(s.gameOverReason).toBe("UNEMPLOYED")
    expect(open()).toHaveLength(3)
    for (const o of open()) expect(s.teams.find(t => t.id === o.data.offeringTeamId)!.reputation).toBeLessThanOrEqual(FIRST_JOB_MAX_REPUTATION)
    // No welcome mail or brief for a club you never ran.
    expect(s.eventsLog.some(e => e.id.startsWith("evt_welcome_"))).toBe(false)
    expect((s.momentQueue ?? []).some(m => m.kind === "welcome")).toBe(false)

    const first = open()[0]
    s.declineJobOffer(first.id)
    expect(open()).toHaveLength(2)
    expect(useGameStore.getState().findMoreJobOffers()).toBe(1)
    const offered = useGameStore.getState().eventsLog.filter(e => e.type === "JOB_OFFER" && e.data?.afterDismissal).map(e => e.data.offeringTeamId)
    expect(new Set(offered).size).toBe(offered.length) // never the same club twice
    expect(open().some(o => o.data.offeringTeamId === first.data.offeringTeamId)).toBe(false)
    expect(useGameStore.getState().findMoreJobOffers()).toBe(0) // already three open

    const pick = open()[0]
    const before = useGameStore.getState().teams.find(t => t.id === pick.data.offeringTeamId)!.budget
    expect(useGameStore.getState().acceptJobOffer(pick.id)).toMatchObject({ success: true })
    s = useGameStore.getState()
    expect(s.gameOverReason ?? null).toBeNull()
    expect(s.playerTeamId).toBe(pick.data.offeringTeamId)
    expect(s.boardState?.teamId).toBe(s.playerTeamId)
    expect(s.managerDetails.dismissals ?? 0).toBe(0)
    expect(s.managerDetails.stints).toHaveLength(1)
    expect(s.teams.find(t => t.id === s.playerTeamId)!.budget).toBe(before + Number(pick.data.salaryOffer) * 4)
    expect((s.momentQueue ?? []).some(m => m.kind === "welcome" && m.teamId === s.playerTeamId)).toBe(true)
    expect(s.scheduledMatches.some(m => m.homeTeamId === s.playerTeamId || m.awayTeamId === s.playerTeamId)).toBe(true)
    expect(open()).toHaveLength(0)

    const save = structuredClone(buildSaveSnapshot(s))
    const { save: after, result } = await computeWeek(save, { playerTeamId: save.playerTeamId, trainingFocus: new Map([[save.playerTeamId, { focus: TrainingFocus.AIM, intensity: 5 }]]) }, 3)
    expect(result.success).toBe(true)
    expect(after.gameOverReason ?? null).toBeNull()
    expect(after.playerTeamId).toBe(s.playerTeamId)
    await debouncedStorage.flush()
}, 120_000)
