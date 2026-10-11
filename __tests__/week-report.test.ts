/**
 * Phase 4.1 weekly report: the week processor records what changed and why
 * (training, money, matches), the store folds in-week changes and the tick
 * into one report, and the saved history stays small.
 */
import { useGameStore } from "@/store/game-store"
import { saveManager } from "@/engine"
import { computeWeek } from "@/engine/worker/compute-week"
import { debouncedStorage } from "@/engine/storage-adapter"
import { buildSaveSnapshot } from "@/store/utils/build-save-snapshot"
import { createLaunchFixture } from "@/scripts/launch/fixtures"
import { TrainingFocus } from "@/types"
import type { GameSave, StaffSaveData } from "@/engine/save-types"
import type { ChangeEntry } from "@/lib/week-changes"
import { moneyNet, weekHeadline, WEEK_REPORT_HISTORY } from "@/lib/week-report"
import { moneyLines, playerGroups, teamRows } from "@/components/report/report-model"

jest.mock("@/engine/worker/week-processor-bridge", () => {
    const { WeekProcessorBridge } = require("@/engine/worker/week-processor-client")
    return { weekProcessorBridge: new WeekProcessorBridge(() => { throw new Error("No browser worker in Node fixture") }) }
})
jest.mock("@/engine/manager-career-profile", () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined) }))

const config = (save: GameSave) => ({ playerTeamId: save.playerTeamId, trainingFocus: new Map([[save.playerTeamId, { focus: TrainingFocus.AIM, intensity: 5 }]]) })
const sum = (xs: ChangeEntry[]) => xs.reduce((s, e) => s + e.delta, 0)

describe("week processor records changes with causes", () => {
    test("training gains carry the focus and the coach/facility multipliers; money lines add up to the budget change", async () => {
        const save = createLaunchFixture("first-week")
        save.scheduledMatches = []
        const team = save.teams[0]
        team.facilities = [{ type: "TRAINING", level: 2 } as never]
        const coach = { id: "coach_1", name: "Coach", role: "coach", teamId: team.id, level: 3, salaryPerWeek: 1000, stats: { development: 80 }, unlockedTalentIds: [] } as unknown as StaffSaveData
        save.staff = [coach]
        team.staffIds = [coach.id]
        save.players[0].potential = 95
        const budgetBefore = team.budget

        const { result, save: after } = await computeWeek(save, config(save), 11)
        const changes = result.changes ?? []

        const training = changes.filter(e => e.kind === "attribute" && e.cause.type === "training" && e.subjectId === "p_a1")
        expect(training.length).toBeGreaterThan(0)
        expect(training[0].cause.label).toMatch(/^Aim training · coach ×1\.\d\d · training facility L2$/)
        expect(training.every(e => e.delta > 0)).toBe(true)
        expect(changes.some(e => e.kind === "fatigue" && e.cause.type === "training" && e.delta > 0)).toBe(true)
        expect(changes.some(e => e.kind === "fatigue" && e.cause.type === "recovery" && e.delta < 0)).toBe(true)

        const money = changes.filter(e => e.kind === "money")
        expect(money.find(e => e.label === "Player salaries")).toMatchObject({ delta: -12500, cause: { type: "salary" } })
        expect(money.find(e => e.label === "Staff salaries")?.cause.type).toBe("staff")
        expect(sum(money)).toBe(after.teams[0].budget - budgetBefore)
    })

    test("a match simulated in the tick is the cause of its morale, form and Elo swing", async () => {
        const save = createLaunchFixture("first-week")
        // The manager's week-1 fixture is still open when week 2 is processed.
        const { result, save: after } = await computeWeek(save, config(save), 5)
        const played = after.completedMatches.find(m => m.id === "qa_match_first-week")!
        const won = played.result.winnerId === save.playerTeamId
        const matchEntries = (result.changes ?? []).filter(e => e.cause.type === "match")
        expect(matchEntries.length).toBeGreaterThan(0)
        expect(matchEntries[0].cause.label).toMatch(new RegExp(`^${won ? "Beat" : "Lost to"} AI Team 1 \\d+–\\d+$`))
        expect(matchEntries.some(e => e.kind === "morale" && e.subjectId === "p_a1")).toBe(true)
        expect(matchEntries.some(e => e.kind === "ranking" && e.label === "Elo" && (won ? e.delta > 0 : e.delta < 0))).toBe(true)
    })
})

describe("report view", () => {
    const report = {
        v: 1 as const, week: 3, teamId: "t", headline: "",
        names: { p1: "DimQQ" },
        matches: [{ id: "m", opponentId: "o", opponentName: "Nemesis", won: true, score: "2–1", competition: "Cup" }],
        warnings: [],
        kpis: { budget: [100_000, 112_000] as [number, number], rank: [16, 14] as [number, number], elo: [1500, 1512] as [number, number], board: [60, 62] as [number, number], chemistry: [60, 60] as [number, number], morale: [60, 62] as [number, number], reputation: [55, 55] as [number, number] },
        changes: [
            { kind: "attribute", subjectId: "p1", label: "AWP", delta: 2, cause: { type: "training", label: "Flick camp · coach ×1.20" } },
            { kind: "attribute", subjectId: "p1", label: "Rifle", delta: 0.6, cause: { type: "training", label: "Flick camp · coach ×1.20" } },
            { kind: "morale", subjectId: "p1", label: "Morale", delta: 5, cause: { type: "match", label: "Beat Nemesis 2–1" } },
            { kind: "morale", subjectId: "p1", label: "Morale", delta: -1, cause: { type: "decay", label: "Drift toward baseline" } },
            { kind: "money", subjectId: "t", label: "Prize money", delta: 20_000, cause: { type: "prize", label: "Prize money" } },
            { kind: "money", subjectId: "t", label: "Player salaries", delta: -8_000, cause: { type: "salary", label: "Player wages" } },
            { kind: "ranking", subjectId: "t", label: "World rank", delta: -2, cause: { type: "world", label: "Weekly ranking update" } },
        ] as ChangeEntry[],
    }

    test("one headline sentence from the biggest real changes", () => {
        expect(weekHeadline(report)).toBe("Beat Nemesis 2–1, climbed 2 places to #14 and DimQQ's AWP +2 from flick camp.")
    })

    test("player rows read change · cause; money lines add up", () => {
        const [dim] = playerGroups(report)
        expect(dim.name).toBe("DimQQ")
        expect(dim.rows[0]).toEqual({ change: "AWP +2 · Rifle +0.6", cause: "Flick camp · coach ×1.20", tone: "up" })
        expect(dim.rows[1]).toEqual({ change: "Morale +4", cause: "Beat Nemesis 2–1 +5 · Drift toward baseline −1", tone: "up" })
        expect(moneyLines(report)).toMatchObject({ net: 12_000, income: [{ label: "Prize money", amount: 20_000 }], expenses: [{ label: "Player salaries", amount: -8_000 }] })
        expect(teamRows(report)[0]).toMatchObject({ label: "World rank", change: "#16 → #14", tone: "up" })
    })
})

describe("store weekly report", () => {
    const initial = { ...useGameStore.getState() }
    function loadIntoStore(timeMode: "WEEKLY" | "HYBRID_DAILY", withMatch = true) {
        const save = createLaunchFixture("first-week")
        save.timeMode = timeMode
        save.currentDay = timeMode === "WEEKLY" ? 6 : 0
        if (!withMatch) save.scheduledMatches = []
        useGameStore.setState({
            ...initial, ...structuredClone(save), league: undefined, boardState: undefined,
            weekReports: null, continueRun: null, advanceStop: null, advanceSeenKeys: [], weekReportOpen: null, weekReportToast: null,
            isLoading: false, isInitialized: true, _completedMatchIds: new Set(), addToast: jest.fn(),
        } as never)
        jest.spyOn(saveManager, "saveGame").mockResolvedValue({ success: true })
        return save
    }
    afterEach(async () => { jest.restoreAllMocks(); await debouncedStorage.flush() })

    test("in-week match + decisions + the tick end up in one report with causes; the modal opens in weekly mode", async () => {
        const save = loadIntoStore("WEEKLY")
        const matchId = save.scheduledMatches[0].id
        await expect(useGameStore.getState().simulateInstantMatch(matchId)).resolves.toBe(true)
        // The match result was recorded as it happened, against this week's baseline.
        const tracked = useGameStore.getState().weekReports?.tracker
        expect(tracked?.week).toBe(save.currentWeek)
        expect(tracked?.changes.some(e => e.cause.type === "match" && e.kind === "morale")).toBe(true)
        // A change no recorder explains is attributed to the manager's decisions.
        const moraleAfterMatch = useGameStore.getState().players.find(x => x.id === "p_a5")!.morale
        const decided = Math.floor(moraleAfterMatch) - 6
        useGameStore.getState().updatePlayer("p_a5", { morale: decided })

        await useGameStore.getState().advanceWeek()
        const state = useGameStore.getState()
        const report = state.weekReports!.history[0]
        expect(report.week).toBe(save.currentWeek)
        expect(state.weekReportOpen).toBe(save.currentWeek)
        expect(report.matches).toHaveLength(1)
        expect(report.matches[0].opponentName).toBe("AI Team 1")
        expect(report.headline).toMatch(/^(Beat|Lost to) AI Team 1 /)
        expect(report.changes.some(e => e.cause.type === "match" && e.kind === "morale")).toBe(true)
        expect(report.changes.some(e => e.cause.type === "training" && e.kind === "attribute")).toBe(true)
        const decision = report.changes.find(e => e.subjectId === "p_a5" && e.kind === "morale" && e.cause.type === "decision")
        expect(decision?.cause.label).toBe("Your decisions this week")
        expect(decision?.delta).toBeCloseTo(decided - moraleAfterMatch, 2)
        // Money is fully itemized: the lines add up to the week's budget movement.
        expect(moneyNet(report)).toBe(report.kpis.budget[1] - report.kpis.budget[0])
        // The next week starts tracking from the committed state.
        expect(state.weekReports!.tracker).toMatchObject({ week: save.currentWeek + 1, changes: [] })
    })

    test("daily mode gets the compact toast, not the modal", async () => {
        loadIntoStore("HYBRID_DAILY", false)
        useGameStore.setState({ currentDay: 6 } as never)
        await useGameStore.getState().advanceDay()
        expect(useGameStore.getState().weekReportToast).toBe(1)
        expect(useGameStore.getState().weekReportOpen).toBeNull()
    })

    test("only the last four reports are kept and the saved report data stays small", async () => {
        loadIntoStore("WEEKLY", false)
        for (let i = 0; i < 6; i++) {
            // The world may book a friendly for us; play it so the week can advance.
            const s = useGameStore.getState()
            const due = s.scheduledMatches.find(m => m.week === s.currentWeek && (m.homeTeamId === s.playerTeamId || m.awayTeamId === s.playerTeamId))
            if (due) await s.simulateInstantMatch(due.id)
            await useGameStore.getState().advanceWeek()
        }
        const state = useGameStore.getState()
        expect(state.currentWeek).toBe(7)
        expect(state.weekReports!.history.map(r => r.week)).toEqual([6, 5, 4, 3])
        expect(state.weekReports!.history).toHaveLength(WEEK_REPORT_HISTORY)
        const snapshot = buildSaveSnapshot(state)
        const reportBytes = JSON.stringify(snapshot.weekReports).length
        const { weekReports: _omit, ...withoutReports } = snapshot
        void _omit
        const saveBytes = JSON.stringify(snapshot).length
        expect(reportBytes).toBeLessThan(48_000)
        expect(saveBytes - JSON.stringify(withoutReports).length).toBe(reportBytes + '"weekReports":,'.length)
    })
})
