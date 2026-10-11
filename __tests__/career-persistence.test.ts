/**
 * Decisions and switches that live between week ticks survive a reload
 * (Phase 5 fixes): the declined (or taken) legend pick, the live match's
 * auto-tactics switch, and the day within the week in daily mode. Each is
 * driven through the real store and SaveManager, then a fresh store loads
 * the career from disk as after a relaunch.
 */
import { useGameStore, waitForPendingGameSave } from "@/store/game-store"
import { saveManager } from "@/engine"
import { debouncedStorage } from "@/engine/storage-adapter"
import { weekProcessorBridge } from "@/engine/worker/week-processor-bridge"
import { createLaunchFixture } from "@/scripts/launch/fixtures"
import { LEGENDARY_PLAYERS } from "@/engine/legendary-players-data"
import type { GameSave, PlayerSaveData } from "@/engine/save-types"

jest.mock("@/engine/worker/week-processor-bridge", () => ({ weekProcessorBridge: { processWeek: jest.fn() } }))
jest.mock("@/engine/manager-career-profile", () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined) }))

const initial = { ...useGameStore.getState() }
const store = () => useGameStore.getState()

async function open(save: GameSave): Promise<void> {
    expect((await saveManager.saveGame(save)).success).toBe(true)
    useGameStore.setState({ ...initial, toasts: [] })
    await store().loadGame(save.saveId)
    expect(store().saveId).toBe(save.saveId)
}

/** Relaunch: a fresh store reads the career from disk. */
async function reload(): Promise<void> {
    const id = store().saveId!
    await waitForPendingGameSave()
    await debouncedStorage.flush()
    useGameStore.setState({ ...initial, toasts: [] })
    await store().loadGame(id)
}

afterEach(async () => { jest.restoreAllMocks(); await debouncedStorage.flush() })

describe("legend pick", () => {
    function withPick(id: string): GameSave {
        const save = createLaunchFixture("strong-club")
        save.saveId = id
        const legends = LEGENDARY_PLAYERS.slice(0, 3).map(l => ({ ...l, isRetired: true }) as PlayerSaveData)
        save.players.push(...legends)
        save.pendingLegendPick = { tournamentName: "Major", candidates: legends.map(l => l.id), week: save.currentWeek }
        return save
    }

    test("declining is saved: the pick does not come back after a reload", async () => {
        await open(withPick("persist_legend_decline"))
        expect(store().pendingLegendPick).not.toBeNull()
        store().clearLegendPick()
        await reload()
        expect(store().pendingLegendPick).toBeNull()
    })

    test("signing is saved: the legend stays signed and the pick stays closed after a reload", async () => {
        const save = withPick("persist_legend_sign")
        await open(save)
        const legendId = save.pendingLegendPick!.candidates[0]
        store().selectLegend(legendId)
        expect(store().pendingLegendPick).toBeNull()
        await reload()
        expect(store().pendingLegendPick).toBeNull()
        expect(store().teams.find(t => t.id === store().playerTeamId)!.rosterIds).toContain(legendId)
        expect(store().signedLegendIds).toContain(legendId)
    })
})

describe("auto tactics", () => {
    test("the switch is saved with the career and a reload keeps it; another career does not inherit it", async () => {
        const save = createLaunchFixture("first-week")
        save.saveId = "persist_auto_tactics"
        await open(save)
        expect(store().autoTactics).toBe(false)
        store().setAutoTactics(true)
        await reload()
        expect(store().autoTactics).toBe(true)

        const other = createLaunchFixture("weak-club")
        other.saveId = "persist_auto_tactics_other"
        await open(other)
        expect(store().autoTactics).toBe(false)

        await store().loadGame(save.saveId)
        store().setAutoTactics(false)
        await reload()
        expect(store().autoTactics).toBe(false)
    })
})

describe("day within the week (daily mode)", () => {
    function daily(id: string, matchDay?: number): GameSave {
        const save = createLaunchFixture("first-week")
        save.saveId = id
        save.timeMode = "HYBRID_DAILY"
        save.currentDay = 0
        if (matchDay === undefined) save.scheduledMatches = []
        else save.scheduledMatches[0].day = matchDay
        return save
    }

    test("a day step is saved: a reload resumes on that day", async () => {
        await open(daily("persist_day_step"))
        await store().advanceDay()
        await store().advanceDay()
        expect(store().currentDay).toBe(2)
        await reload()
        expect(store().timeMode).toBe("HYBRID_DAILY")
        expect(store().currentDay).toBe(2)
    })

    test("switching to daily mode is saved with its day cursor", async () => {
        const save = daily("persist_day_mode")
        save.timeMode = "WEEKLY"
        save.currentDay = 6
        await open(save)
        store().setTimeMode("HYBRID_DAILY")
        await reload()
        expect(store().timeMode).toBe("HYBRID_DAILY")
        expect(store().currentDay).toBe(0)
    })

    test("skipping to match day is saved", async () => {
        await open(daily("persist_day_matchday", 4))
        await store().advanceToWeekEnd()
        expect(store().currentDay).toBe(4)
        await reload()
        expect(store().currentDay).toBe(4)
    })

    test("a Continue run saves once where it stops, not on every day it passes", async () => {
        await open(daily("persist_day_continue", 3))
        jest.mocked(weekProcessorBridge.processWeek).mockReset()
        const write = jest.spyOn(saveManager, "saveGame")
        await store().continueToNextDecision()
        expect(store().currentDay).toBe(3)
        expect(store().advanceStop?.kind).toBe("match")
        await waitForPendingGameSave()
        expect(write).toHaveBeenCalledTimes(1)
        expect(write.mock.calls[0][0].currentDay).toBe(3)
        await reload()
        expect(store().currentDay).toBe(3)
    })
})
