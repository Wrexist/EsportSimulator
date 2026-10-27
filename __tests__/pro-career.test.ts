/**
 * C10: a pro career on the real world snapshot. Start as a young pro at an
 * amateur club, play weeks with the staff running the club, take an offer
 * from a bigger club and retire into the manager's office.
 */
import { useGameStore } from "@/store/game-store"
import { computeWeek } from "@/engine/worker/compute-week"
import { debouncedStorage } from "@/engine/storage-adapter"
import { buildSaveSnapshot } from "@/store/utils/build-save-snapshot"
import { TrainingFocus, PlayerRole } from "@/types"
import type { GameSave } from "@/engine/save-types"
import { PRO_TUNING, findOfferingClub, handClubDecisionsToStaff, isProActive, ovrOf, processProWeek, proStatus } from "@/engine/pro-career"

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

test("pro career: start, staff-run weeks, an offer, retirement", async () => {
    const { snapshotLoader } = jest.requireMock("@/data") as typeof import("@/data")
    await snapshotLoader.loadSnapshot()
    const teams = snapshotLoader.getSnapshot()!.teams as unknown as { id: string; reputation: number }[]
    const club = [...teams].sort((a, b) => a.reputation - b.reputation || a.id.localeCompare(b.id))[5]
    await useGameStore.getState().initializeNewGame("Pro", club.id)
    expect(useGameStore.getState().startProCareer({ nickname: "zyro", role: PlayerRole.RIFLER })).toBe(true)
    expect(useGameStore.getState().startProCareer({ nickname: "again", role: PlayerRole.AWPER })).toBe(false)

    let s = useGameStore.getState()
    const pro = s.players.find(p => p.id === s.proCareer!.playerId)!
    expect(pro.nickname).toBe("zyro")
    expect(pro.age).toBe(PRO_TUNING.START_AGE)
    expect(s.teams.find(t => t.id === s.playerTeamId)!.rosterIds).toContain(pro.id)
    expect(s.contracts.some(c => c.playerId === pro.id && c.teamId === s.playerTeamId)).toBe(true)
    expect(Object.values(s.delegation ?? {}).every(Boolean)).toBe(true)
    expect(pro.potential).toBeGreaterThanOrEqual(PRO_TUNING.START_POTENTIAL[0])

    // A few weeks with the staff in charge: no dismissal, the pro stays, the lineup is by rating.
    let save = structuredClone(buildSaveSnapshot(s)) as GameSave
    for (let w = 0; w < 3; w++) {
        const { save: next, result } = await computeWeek(save, { playerTeamId: save.playerTeamId, trainingFocus: new Map([[save.playerTeamId, { focus: TrainingFocus.AIM, intensity: 5 }]]) }, 3)
        expect(result.success).toBe(true)
        save = next
    }
    expect(save.gameOverReason ?? null).toBeNull()
    const team = save.teams.find(t => t.id === save.playerTeamId)!
    expect(team.rosterIds).toContain(pro.id)
    const ratings = team.rosterIds.slice(0, 5).map(id => ovrOf(save.players.find(p => p.id === id)!, save.currentWeek))
    expect([...ratings].sort((a, b) => b - a)).toEqual(ratings)
    // No club decision is left waiting on the pro.
    expect(handClubDecisionsToStaff(save)).toBe(0)
    expect(proStatus(save)?.squadSize).toBeGreaterThanOrEqual(5)

    // Good enough for a bigger club: an offer comes, and taking it moves him.
    const p = save.players.find(x => x.id === pro.id)!
    for (const k of ["skill", "rifle", "awp", "pistol", "reaction", "clutch", "tactic", "teamwork", "grenades", "entry", "trading", "creativity", "eyesight", "leader"] as const) (p as unknown as Record<string, number>)[k] = 92
    expect(findOfferingClub(save)).toBeDefined()
    save.proCareer!.lastOfferWeek = save.currentWeek - PRO_TUNING.OFFER_EVERY
    processProWeek(save)
    const offer = save.eventsLog.find(e => e.id.startsWith("pro_offer_"))!
    expect(offer).toBeDefined()
    useGameStore.setState(save as never)
    useGameStore.getState().resolveEventChoice(offer.id, "accept")
    s = useGameStore.getState()
    expect(s.playerTeamId).toBe(offer.data.offeringTeamId)
    expect(s.teams.find(t => t.id === s.playerTeamId)!.rosterIds).toContain(pro.id)
    expect(s.teams.find(t => t.id === club.id)!.rosterIds).not.toContain(pro.id)
    expect(s.proCareer!.clubs).toHaveLength(2)

    // Late in the career: the season-end question, and retiring hands over the club.
    save = structuredClone(buildSaveSnapshot(s)) as GameSave
    save.players.find(x => x.id === pro.id)!.age = PRO_TUNING.RETIRE_ASK_FROM
    save.currentWeek = 52
    processProWeek(save)
    const ask = save.eventsLog.find(e => e.id === "pro_retire_52")!
    expect(ask).toBeDefined()
    useGameStore.setState(save as never)
    useGameStore.getState().resolveEventChoice(ask.id, "retire")
    s = useGameStore.getState()
    expect(isProActive(s as unknown as GameSave)).toBe(false)
    expect(s.players.find(x => x.id === pro.id)!.isRetired).toBe(true)
    expect(s.teams.find(t => t.id === s.playerTeamId)!.rosterIds.length).toBeGreaterThanOrEqual(5)
    await debouncedStorage.flush()
}, 300_000)
