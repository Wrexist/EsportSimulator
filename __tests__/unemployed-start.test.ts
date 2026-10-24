/**
 * G9: start without a club. The career opens on a first-job market (the
 * dismissal flow, marked firstJob); taking an offer starts the career at
 * that club with no dismissal counted and no spell at the placeholder club.
 */
import { useGameStore } from "@/store/game-store"
import { computeWeek } from "@/engine/worker/compute-week"
import { debouncedStorage } from "@/engine/storage-adapter"
import { createLaunchFixture } from "@/scripts/launch/fixtures"
import { FIRST_JOB_MAX_REPUTATION, JobOfferGenerator } from "@/engine/job-offer-generator"
import { SeededRNG } from "@/engine/rng"
import { TrainingFocus } from "@/types"
import { buildSaveSnapshot } from "@/store/utils/build-save-snapshot"

jest.mock("@/engine/worker/week-processor-bridge", () => {
    const { WeekProcessorBridge } = require("@/engine/worker/week-processor-client")
    return { weekProcessorBridge: new WeekProcessorBridge(() => { throw new Error("No browser worker in Node fixture") }) }
})
jest.mock("@/engine/manager-career-profile", () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined) }))

function unemployed(): GameSave {
    const save = createLaunchFixture("first-week")
    save.gameOverReason = "UNEMPLOYED"
    save.gameOverWeek = save.currentWeek
    save.scheduledMatches = save.scheduledMatches.filter(m => m.homeTeamId !== save.playerTeamId && m.awayTeamId !== save.playerTeamId)
    JobOfferGenerator.createFirstJobOffers(save, new SeededRNG(7))
    return save
}

test("first-job offers come from low-reputation clubs and stay open", () => {
    const save = unemployed()
    const offers = save.eventsLog.filter(e => e.type === "JOB_OFFER" && e.data?.firstJob)
    // The launch fixture has two other clubs (reputation 55), so both are offered as the lowest clubs.
    expect(offers.length).toBe(save.teams.length - 1)
    const low = createLaunchFixture("first-week")
    low.teams.forEach((t, i) => { if (t.id !== low.playerTeamId) t.reputation = i === 1 ? 20 : 90 })
    low.teams.push(...[1, 2, 3].map(n => ({ ...structuredClone(low.teams[1]), id: `low_${n}`, name: `Low ${n}`, reputation: 25 + n })))
    const lowOffers = JobOfferGenerator.createFirstJobOffers(low, new SeededRNG(3))
    expect(lowOffers.length).toBe(3)
    for (const o of lowOffers) expect(low.teams.find(t => t.id === o.data.offeringTeamId)!.reputation).toBeLessThanOrEqual(FIRST_JOB_MAX_REPUTATION)
    for (const o of offers) {
        const team = save.teams.find(t => t.id === o.data.offeringTeamId)!
        expect(team.id).not.toBe(save.playerTeamId)
        expect(o.data.afterDismissal).toBe(true)
        expect(Number(o.data.deadlineWeek)).toBeGreaterThan(save.currentWeek)
    }
})

test("taking a first job starts the career there", async () => {
    await Promise.resolve()
    const initial = useGameStore.getState()
    const save = unemployed()
    const placeholder = save.playerTeamId
    useGameStore.setState({ ...initial, league: undefined, ...structuredClone(save), isLoading: false, isInitialized: true, _completedMatchIds: new Set() } as never)
    const offer = useGameStore.getState().eventsLog.find(e => e.type === "JOB_OFFER" && e.data?.firstJob)!
    expect(useGameStore.getState().acceptJobOffer(offer.id)).toMatchObject({ success: true })
    const state = useGameStore.getState()
    expect(state.gameOverReason ?? null).toBeNull()
    expect(state.playerTeamId).toBe(offer.data.offeringTeamId)
    expect(state.playerTeamId).not.toBe(placeholder)
    expect(state.managerDetails.dismissals ?? 0).toBe(0)
    expect((state.managerDetails.stints ?? []).every(s => s.teamId === state.playerTeamId)).toBe(true)
    expect(state.eventsLog.filter(e => e.type === "JOB_OFFER" && e.data?.firstJob && !e.selectedChoiceId).every(e => e.data.isWithdrawn)).toBe(true)
    const team = state.teams.find(t => t.id === state.playerTeamId)!
    expect(team.startingLeagueTier).toBe(team.leagueTier)

    const snapshot = structuredClone(buildSaveSnapshot(useGameStore.getState()))
    const { result } = await computeWeek(snapshot, { playerTeamId: snapshot.playerTeamId, trainingFocus: new Map([[snapshot.playerTeamId, { focus: TrainingFocus.AIM, intensity: 5 }]]) }, 3)
    expect(result.success).toBe(true)
    await debouncedStorage.flush()
})
