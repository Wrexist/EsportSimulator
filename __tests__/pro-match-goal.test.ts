/**
 * C10: the pro's personal match goal. A starter is set a rating target by
 * squad rank; meeting it brings club scouting closer and lifts morale; the
 * benched pro has no goal; a match is judged once. On the store, a played
 * match records the verdict.
 */
import { useGameStore } from "@/store/game-store"
import { buildSaveSnapshot } from "@/store/utils/build-save-snapshot"
import { PlayerRole } from "@/types"
import type { GameSave } from "@/engine/save-types"
import { PRO_TUNING, proMatchGoal, proStatus, recordProMatch } from "@/engine/pro-career"

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

async function proSave(): Promise<GameSave> {
    const { snapshotLoader } = jest.requireMock("@/data") as typeof import("@/data")
    await snapshotLoader.loadSnapshot()
    const teams = snapshotLoader.getSnapshot()!.teams as unknown as { id: string; reputation: number }[]
    const club = [...teams].sort((a, b) => a.reputation - b.reputation || a.id.localeCompare(b.id))[5]
    await useGameStore.getState().initializeNewGame("Pro", club.id)
    expect(useGameStore.getState().startProCareer({ nickname: "zyro", role: PlayerRole.RIFLER })).toBe(true)
    return structuredClone(buildSaveSnapshot(useGameStore.getState())) as GameSave
}

/** Put the pro in the starting five (slot 0) or on the bench (last slot). */
function placePro(save: GameSave, starter: boolean) {
    const team = save.teams.find(t => t.id === save.playerTeamId)!
    const id = save.proCareer!.playerId
    const rest = team.rosterIds.filter(x => x !== id)
    while (rest.length < 5) rest.push(rest[0])
    team.rosterIds = starter ? [id, ...rest] : [...rest.slice(0, Math.max(5, rest.length)), id]
}

test("goal by squad rank; meeting it brings scouting closer and lifts morale; judged once", async () => {
    const save = await proSave()
    placePro(save, true)
    const status = proStatus(save)!
    expect(status.starter).toBe(true)
    const goal = proMatchGoal(save)!
    expect(goal).toBe(PRO_TUNING.GOAL_RATING_BY_RANK[status.squadRank - 1] ?? PRO_TUNING.GOAL_RATING_BASE)

    const pro = save.players.find(p => p.id === save.proCareer!.playerId)!
    pro.morale = 50
    const before = proStatus(save)!.weeksUntilOffers

    const missed = recordProMatch(save, "m1", goal - 0.2, goal)!
    expect(missed.hit).toBe(false)
    expect(pro.morale).toBe(50)
    expect(proStatus(save)!.weeksUntilOffers).toBe(before)

    const met = recordProMatch(save, "m2", goal + 0.05, goal)!
    expect(met.hit).toBe(true)
    expect(pro.morale).toBe(50 + PRO_TUNING.GOAL_MORALE)
    expect(proStatus(save)!.weeksUntilOffers).toBe(Math.max(0, before - PRO_TUNING.GOAL_SCOUT_WEEKS))
    expect(save.proCareer!.goals).toMatchObject({ set: 2, hit: 1, last: { matchId: "m2", hit: true } })

    // The same match is not judged twice; a missing rating is not judged.
    expect(recordProMatch(save, "m2", 2, goal)).toBeNull()
    expect(recordProMatch(save, "m3", undefined, goal)).toBeNull()
    expect(save.proCareer!.goals!.set).toBe(2)
})

test("no goal on the bench or after retirement", async () => {
    const save = await proSave()
    placePro(save, false)
    expect(proStatus(save)!.starter).toBe(false)
    expect(proMatchGoal(save)).toBeNull()
    expect(recordProMatch(save, "m1", 1.5)).toBeNull()

    placePro(save, true)
    save.proCareer!.retiredWeek = save.currentWeek
    expect(proMatchGoal(save)).toBeNull()
    expect(recordProMatch(save, "m2", 1.5, 1)).toBeNull()
})

test("a played match records the pro's verdict on the store", async () => {
    await proSave()
    const { saveManager } = jest.requireActual("@/engine")
    const spy = jest.spyOn(saveManager, "saveGame").mockResolvedValue({ success: true })
    const s = useGameStore.getState()
    const me = s.playerTeamId!
    const id = s.proCareer!.playerId
    const opp = s.teams.find(t => t.id !== me && t.rosterIds.length >= 5)!.id
    const match = { id: "m_pro", homeTeamId: me, awayTeamId: opp, week: s.currentWeek, day: 6, format: "BO1", seed: 7, tournamentId: null, stage: null }
    useGameStore.setState(st => ({
        teams: st.teams.map(t => t.id === me ? { ...t, rosterIds: [id, ...t.rosterIds.filter(x => x !== id)] } : t),
        scheduledMatches: [match] as never, completedMatches: [], timeMode: "WEEKLY", currentDay: 6,
    }))
    const goal = proMatchGoal(buildSaveSnapshot(useGameStore.getState()) as GameSave)
    expect(goal).not.toBeNull()
    expect(await useGameStore.getState().prepAndSimMatch("m_pro")).toBe(true)
    const after = useGameStore.getState()
    const rating = after.completedMatches.find(m => m.id === "m_pro")!.result.playerStats[id]?.rating
    expect(rating).toBeDefined()
    expect(after.proCareer!.goals).toMatchObject({ set: 1, last: { matchId: "m_pro", target: goal, hit: rating! >= goal! } })
    spy.mockRestore()
}, 120_000)
