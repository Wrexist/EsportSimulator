/**
 * Phase 4.4: a manager dismissed during the week tick (season review or the
 * weekly board) leaves the tick with job offers and can continue the career
 * through the store.
 */
import { useGameStore } from "@/store/game-store"
import { computeWeek } from "@/engine/worker/compute-week"
import { debouncedStorage } from "@/engine/storage-adapter"
import { createLaunchFixture } from "@/scripts/launch/fixtures"
import { TrainingFocus } from "@/types"
import { BOARD_TUNING } from "@/lib/balance-tuning"
import type { GameSave } from "@/engine/save-types"

jest.mock("@/engine/worker/week-processor-bridge", () => {
    const { WeekProcessorBridge } = require("@/engine/worker/week-processor-client")
    return { weekProcessorBridge: new WeekProcessorBridge(() => { throw new Error("No browser worker in Node fixture") }) }
})
jest.mock("@/engine/manager-career-profile", () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined) }))

const config = (save: GameSave) => ({ playerTeamId: save.playerTeamId, trainingFocus: new Map([[save.playerTeamId, { focus: TrainingFocus.AIM, intensity: 5 }]]) })

function onTheBrink(): GameSave {
    const save = createLaunchFixture("first-week")
    save.scheduledMatches = []
    save.currentWeek = 30
    save.managerDetails.tenureStartWeek = 1
    save.boardState = {
        teamId: save.playerTeamId, confidence: BOARD_TUNING.SACK_AT_OR_BELOW + 1, seasonExpectation: "COMPETE", expectationSetSeason: 1,
        lastReviewedSeason: 0, onNotice: true, warnings: 2, lastWeeklyUpdateWeek: 29,
    }
    // A wage bill the club cannot pay: the week's finance move takes the board to the sack line.
    save.contracts.filter(c => c.teamId === save.playerTeamId).forEach(c => { c.salaryPerWeek = 200_000 })
    save.teams.find(t => t.id === save.playerTeamId)!.budget = 1_000
    return save
}

test("a manager sacked in the tick leaves it with job offers", async () => {
    const { save: after } = await computeWeek(onTheBrink(), config(onTheBrink()), 9)
    expect(after.gameOverReason).toBe("SACKED")
    const offers = after.eventsLog.filter(e => e.type === "JOB_OFFER" && e.data?.afterDismissal)
    expect(offers.length).toBeGreaterThan(0)
})

test("the store lets a sacked manager accept an offer and continue", async () => {
    await Promise.resolve()
    const initial = useGameStore.getState()
    const { save: after } = await computeWeek(onTheBrink(), config(onTheBrink()), 9)
    useGameStore.setState({ ...initial, league: undefined, ...structuredClone(after), isLoading: false, isInitialized: true, _completedMatchIds: new Set() } as never)
    const offer = useGameStore.getState().eventsLog.find(e => e.type === "JOB_OFFER" && e.data?.afterDismissal)!
    const result = useGameStore.getState().acceptJobOffer(offer.id)
    expect(result).toMatchObject({ success: true })
    const state = useGameStore.getState()
    expect(state.gameOverReason ?? null).toBeNull()
    expect(state.playerTeamId).toBe(offer.data.offeringTeamId)
    expect(state.boardState?.teamId).toBe(state.playerTeamId)
    await debouncedStorage.flush()
})
