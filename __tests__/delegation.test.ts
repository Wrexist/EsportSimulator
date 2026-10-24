/**
 * G6: delegate to staff, on the real world snapshot. The staff renew
 * regulars, run drills under the fatigue cap, send the scout to the
 * shortlist, report once in the inbox, and nothing runs while switched off.
 */
import { useGameStore } from "@/store/game-store"
import { planDrills, planRenewals, DRILL_FATIGUE_CAP, DRILL_FATIGUE_CAP_MATCH_WEEK } from "@/engine/delegation"
import { DrillManager } from "@/engine/drill-manager"
import type { PlayerSaveData, StaffSaveData } from "@/engine/save-types"

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

const base = { age: 24, rifle: 60, awp: 40, pistol: 60, grenades: 50, creativity: 60, clutch: 50, tactic: 50, leader: 50, teamwork: 60, reaction: 60, skill: 60, potential: 85, fatigue: 0, stressResistance: 60 }
const mk = (id: string, over: Partial<PlayerSaveData> = {}) => ({ ...base, id, nickname: id, ...over } as unknown as PlayerSaveData)

describe("planners", () => {
    test("drills stop at the fatigue cap, lighter in a match week, and a tired squad recovers first", () => {
        const squad = [mk("a"), mk("b"), mk("c", { fatigue: 10 })]
        const drills = DrillManager.getDrills()
        const sum = (ds: typeof drills) => ds.reduce((s, d) => s + d.fatigueCost, 0)
        const normal = planDrills(squad, drills, 10, false)
        const match = planDrills(squad, drills, 10, true)
        expect(normal.length).toBeGreaterThan(match.length)
        expect(10 + sum(normal)).toBeLessThanOrEqual(DRILL_FATIGUE_CAP)
        expect(10 + sum(match)).toBeLessThanOrEqual(DRILL_FATIGUE_CAP_MATCH_WEEK)
        expect(normal.every(d => d.rewards.every(r => r.stat !== "AWP"))).toBe(true)
        const tired = planDrills([mk("t", { fatigue: 70 })], drills, 10, false)
        expect(tired[0]?.fatigueCost).toBeLessThan(0)
        expect(planDrills(squad, drills, 0, false)).toEqual([])
    })

    test("renewals: regulars renewed, old players and fringe players left with a reason", () => {
        const roster = [mk("s1"), mk("s2"), mk("s3"), mk("s4"), mk("old", { age: 34 }), mk("sub", { skill: 30, rifle: 30, reaction: 30 }), mk("far")]
        const contracts = roster.map(p => ({ playerId: p.id, teamId: "T", salaryPerWeek: 1000, startWeek: 0, endWeek: p.id === "far" ? 60 : 15, buyout: 0 }))
        const plan = planRenewals(roster, contracts, "T", 10)
        expect(plan.renew.map(p => p.id)).toEqual(["s1", "s2", "s3", "s4"])
        expect(plan.leave.map(l => [l.player.id, l.reason])).toEqual([["old", "34 years old"], ["sub", "not a regular in the five"]])
    })
})

test("the staff pass on a real career", async () => {
    const { snapshotLoader } = jest.requireMock("@/data") as typeof import("@/data")
    await snapshotLoader.loadSnapshot()
    const teams = snapshotLoader.getSnapshot()!.teams as unknown as { id: string; reputation: number }[]
    const pick = [...teams].sort((a, b) => b.reputation - a.reputation)[3]
    await useGameStore.getState().initializeNewGame("Delegation", pick.id)
    let s = useGameStore.getState()
    expect(s.error ?? null).toBeNull()
    const teamId = s.playerTeamId!
    const reports = () => useGameStore.getState().eventsLog.filter(e => e.type === "STAFF_REPORT")

    // Nothing delegated: nothing happens.
    expect(s.runDelegatedChores()).toEqual([])
    expect(reports()).toHaveLength(0)

    // Two starters on expiring deals, a shortlisted player and a scout on staff.
    const team = s.teams.find(t => t.id === teamId)!
    const [first, second] = team.rosterIds
    const target = s.players.find(p => !team.rosterIds.includes(p.id) && !p.isRetired)!
    const scout = { id: "scout_test", name: "Test Scout", role: "scout", level: 3, specialization: "", salaryPerWeek: 1000, teamId, yearsRemaining: 1, stats: { accuracy: 70 } } as unknown as StaffSaveData
    useGameStore.setState(state => ({
        contracts: state.contracts.map(c => c.playerId === first || c.playerId === second ? { ...c, endWeek: state.currentWeek + 5 } : c),
        staff: [...state.staff, scout],
        teams: state.teams.map(t => t.id === teamId ? { ...t, staffIds: [...(t.staffIds ?? []), scout.id], budget: Math.max(t.budget, 2_000_000) } : t),
        watchlistedPlayerIds: [target.id],
    }))
    const toastsBefore = useGameStore.getState().toasts.length
    for (const area of ["drills", "renewals", "scouting", "veto"] as const) useGameStore.getState().setDelegation(area, true)
    const lines = useGameStore.getState().runDelegatedChores()
    s = useGameStore.getState()

    expect(lines.filter(l => l.startsWith("Renewed"))).toHaveLength(2)
    for (const id of [first, second]) expect(s.contracts.find(c => c.playerId === id)!.endWeek).toBeGreaterThan(s.currentWeek + 40)
    expect(lines.some(l => l.startsWith("Ran "))).toBe(true)
    expect(s.teams.find(t => t.id === teamId)!.trainingSlotsUsed).toBeGreaterThan(0)
    expect(Math.max(...s.players.filter(p => team.rosterIds.includes(p.id)).map(p => p.fatigue || 0))).toBeLessThanOrEqual(DRILL_FATIGUE_CAP)
    expect(s.activeScoutingMission?.playerId).toBe(target.id)
    expect(lines.some(l => l.includes(`watch ${target.nickname}`))).toBe(true)
    expect(reports()).toHaveLength(1)
    expect(reports()[0].data.text).toBe(lines.join("\n"))
    expect(s.toasts.length).toBe(toastsBefore) // the actions' toasts are folded into the report

    // Settings persist in the save and switch off cleanly.
    const { buildSaveSnapshot } = jest.requireActual("@/store/utils/build-save-snapshot")
    expect(buildSaveSnapshot(s).delegation).toEqual({ drills: true, renewals: true, scouting: true, veto: true })
    useGameStore.getState().setDelegation("drills", false)
    expect(useGameStore.getState().delegation).toEqual({ renewals: true, scouting: true, veto: true })
}, 120_000)

test("advancing the week runs the delegated drills first; the week report credits them", async () => {
    const { createLaunchFixture } = jest.requireActual("@/scripts/launch/fixtures")
    const { saveManager } = jest.requireActual("@/engine")
    const { debouncedStorage } = jest.requireActual("@/engine/storage-adapter")
    const save = createLaunchFixture("first-week")
    save.currentWeek = 8
    save.scheduledMatches = []
    save.timeMode = "WEEKLY"
    save.currentDay = 6
    save.delegation = { drills: true }
    useGameStore.setState({
        ...useGameStore.getState(), ...structuredClone(save), league: undefined, boardState: undefined,
        weekReports: null, continueRun: null, advanceStop: null, advanceSeenKeys: [], weekReportOpen: null, weekReportToast: null,
        isLoading: false, isInitialized: true, _completedMatchIds: new Set(),
    } as never)
    const spy = jest.spyOn(saveManager, "saveGame").mockResolvedValue({ success: true })
    await useGameStore.getState().advanceWeek()
    const s = useGameStore.getState()
    expect(s.currentWeek).toBe(9)
    const report = s.eventsLog.find(e => e.type === "STAFF_REPORT")
    expect(report?.week).toBe(8)
    expect(String(report?.data.text)).toMatch(/^Ran \d+ team drills?/)
    expect(s.weekReports!.history[0].changes.some(c => c.cause.label.startsWith("Drill: "))).toBe(true)
    spy.mockRestore()
    await debouncedStorage.flush()
}, 120_000)
