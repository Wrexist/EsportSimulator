/**
 * Career difficulty for a club you take over: starting cash and the club's
 * recurring income move together; Normal leaves the club as it is.
 */
import { useGameStore } from "@/store/game-store"
import { CAREER_DIFFICULTY } from "@/lib/balance-tuning"
import { EconomyEngine } from "@/engine/economy-engine"

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

test("easy and hard scale the club's cash and income; normal leaves it alone", async () => {
    const { snapshotLoader } = jest.requireMock("@/data") as typeof import("@/data")
    await snapshotLoader.loadSnapshot()
    const club = (snapshotLoader.getSnapshot()!.teams as unknown as { id: string }[])[40].id
    const start = async (difficulty: "easy" | "normal" | "hard") => {
        await useGameStore.getState().initializeNewGame(`Diff ${difficulty}`, club, undefined, { difficulty })
        const s = useGameStore.getState()
        expect(s.error ?? null).toBeNull()
        const team = s.teams.find(t => t.id === s.playerTeamId)!
        const income = EconomyEngine.processWeeklyFinances(team, s.players, s.contracts, s.staff, s.currentWeek + 1, 0).income.total
        return { budget: team.budget, settings: team.difficultySettings, income, difficulty: s.difficulty }
    }
    const normal = await start("normal")
    const easy = await start("easy")
    const hard = await start("hard")
    expect(normal.settings).toBeUndefined()
    expect(normal.difficulty).toBe("normal")
    expect(easy.budget).toBeCloseTo(normal.budget * CAREER_DIFFICULTY.easy.cash, -2)
    expect(hard.budget).toBeCloseTo(normal.budget * CAREER_DIFFICULTY.hard.cash, -2)
    expect(hard.settings?.incomeMultiplier).toBe(CAREER_DIFFICULTY.hard.incomeMultiplier)
    expect(easy.income).toBeGreaterThan(normal.income)
    expect(hard.income).toBeLessThan(normal.income)
    expect(hard.difficulty).toBe("hard")
}, 180_000)
