/**
 * ENGINE-05 / MATCHENGINE-03: in daily mode (HYBRID_DAILY) every AI fixture
 * is played exactly once, on its own day, by the week tick (opening day) or by
 * the store's day-by-day path (later days), and both prepare it the same way:
 * injured players sit out, fatigue/morale/form and appearances move, the
 * result gets its analysis and Elo exchange.
 *
 * Driven through the real store and the real week processor (computeWeek).
 */
import { useGameStore, waitForPendingGameSave } from "@/store/game-store"
import { saveManager } from "@/engine"
import { debouncedStorage } from "@/engine/storage-adapter"
import { createLaunchFixture } from "@/scripts/launch/fixtures"
import type { GameSave, MatchSaveData, PlayerSaveData, TeamSaveData, ContractSaveData } from "@/engine/save-types"

jest.mock("@/engine/worker/week-processor-bridge", () => {
    const { computeWeek } = jest.requireActual("@/engine/worker/compute-week")
    return { weekProcessorBridge: { processWeek: (save: unknown, config: unknown, rng: { getState(): number }) => computeWeek(save, config, rng.getState()) } }
})
jest.mock("@/engine/manager-career-profile", () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined) }))

const initial = { ...useGameStore.getState() }
const store = () => useGameStore.getState()

afterEach(async () => { await waitForPendingGameSave(); await debouncedStorage.flush() })

function clone<T>(row: T, patch: Partial<T>): T {
    return { ...structuredClone(row), ...patch }
}

/** Seven AI clubs (team_ai_1..7) and the managed club; team_ai_1 has a sixth player on the bench. */
function dailyWorld(): GameSave {
    const save = createLaunchFixture("first-week")
    save.saveId = "daily_ai_fixtures"
    save.timeMode = "HYBRID_DAILY"
    save.currentDay = 0
    const templatePlayer = save.players.find(p => p.id === "p_b1")!
    const templateTeam = save.teams.find(t => t.id === "team_ai_1")!
    const templateContract = save.contracts.find(c => c.playerId === "p_b1")!
    const addPlayer = (id: string, teamId: string): PlayerSaveData => {
        const p = clone(templatePlayer, { id, name: id, nickname: id })
        save.players.push(p)
        save.contracts.push(clone<ContractSaveData>(templateContract, { playerId: id, teamId }))
        return p
    }
    for (let n = 3; n <= 7; n++) {
        const id = `team_ai_${n}`
        const roster = [1, 2, 3, 4, 5].map(i => addPlayer(`p_${id}_${i}`, id).id)
        save.teams.push(clone<TeamSaveData>(templateTeam, { id, name: `AI Team ${n}`, rosterIds: roster, recentForm: [] }))
    }
    // team_ai_1: a starter is injured, a bench player steps in.
    addPlayer("p_b6", "team_ai_1")
    templateTeam.rosterIds.push("p_b6")
    templatePlayer.injury = { type: "RSI", name: "Wrist Strain", weeksRemaining: 4 } as never
    for (const p of save.players) { p.fatigue = 0; p.morale = 70 }

    const fx = (id: string, home: number, away: number, week: number, day: number | undefined): MatchSaveData =>
        ({ id, homeTeamId: `team_ai_${home}`, awayTeamId: `team_ai_${away}`, tournamentId: null, stage: "Friendly", week, ...(day === undefined ? {} : { day }), format: "BO1", seed: 1000 + id.length * 7 + week * 13 + (day ?? 9) } as MatchSaveData)
    save.scheduledMatches = [
        fx("w1_d1", 1, 2, 1, 1),
        fx("w1_d3", 3, 4, 1, 3),
        fx("w1_d5", 5, 6, 1, 5),
        fx("w1_d6", 2, 7, 1, 6),
        fx("w1_noday", 4, 5, 1, undefined), // no day: the last day of the week
        fx("w2_d0", 1, 3, 2, 0),
        fx("w2_d2", 6, 7, 2, 2),
        fx("w2_d4", 2, 4, 2, 4),
    ]
    return save
}

const dayOf = (m: { day?: number }) => m.day ?? 6

function expectPlayedExactlyThrough(week: number, day: number, fixtureIds: string[]) {
    const s = store()
    const completed = s.completedMatches.filter(m => fixtureIds.includes(m.id))
    const counts = new Map<string, number>()
    for (const m of completed) counts.set(m.id, (counts.get(m.id) ?? 0) + 1)
    const all = [...s.completedMatches, ...s.scheduledMatches].filter(m => fixtureIds.includes(m.id) && m.week === week)
    for (const m of all) {
        const due = dayOf(m) <= day
        expect({ id: m.id, day: dayOf(m), played: counts.get(m.id) ?? 0 }).toEqual({ id: m.id, day: dayOf(m), played: due ? 1 : 0 })
        expect(s.scheduledMatches.some(row => row.id === m.id)).toBe(!due)
    }
}

test("each AI fixture of the week is played once, on its day, with the week tick's preparation", async () => {
    const save = dailyWorld()
    const ids = save.scheduledMatches.map(m => m.id)
    expect((await saveManager.saveGame(save)).success).toBe(true)
    useGameStore.setState({ ...initial, toasts: [] })
    await store().loadGame(save.saveId)
    expect(store().timeMode).toBe("HYBRID_DAILY")

    const before = new Map(store().players.map(p => [p.id, { fatigue: p.fatigue, matchesPlayed: p.matchesPlayed }]))

    // Week 1, day by day.
    expectPlayedExactlyThrough(1, 0, ids)
    for (let day = 1; day <= 6; day++) {
        await store().advanceDay()
        expect(store().currentDay).toBe(day)
        expectPlayedExactlyThrough(1, day, ids)
    }

    // Same preparation as the tick: the injured starter sits out, the bench player plays.
    const d1 = store().completedMatches.find(m => m.id === "w1_d1")!
    expect(Object.keys(d1.result.playerStats)).not.toContain("p_b1")
    expect(Object.keys(d1.result.playerStats)).toContain("p_b6")
    expect(d1.analysis?.summary).toEqual(expect.any(String))
    expect(d1.eloChange).toBeDefined()
    const player = (id: string) => store().players.find(p => p.id === id)!
    expect(player("p_b1").matchesPlayed).toBe(before.get("p_b1")!.matchesPlayed)
    expect(player("p_b6").matchesPlayed).toBe(before.get("p_b6")!.matchesPlayed + 1)
    // BO1 fatigue is 10 a match.
    expect(player("p_b6").fatigue).toBe(before.get("p_b6")!.fatigue + 10)
    expect(player("p_c1").fatigue).toBe(before.get("p_c1")!.fatigue + 20) // team_ai_2 played days 1 and 6

    // Day 6 -> week tick: opens week 2 on day 0 and plays only day 0's fixture.
    await store().advanceDay()
    expect(store().currentWeek).toBe(2)
    expect(store().currentDay).toBe(0)
    expectPlayedExactlyThrough(1, 6, ids)
    expectPlayedExactlyThrough(2, 0, ids)
    const w2d0 = store().completedMatches.find(m => m.id === "w2_d0")!
    expect(w2d0.analysis?.summary).toEqual(expect.any(String))

    for (let day = 1; day <= 6; day++) {
        await store().advanceDay()
        expectPlayedExactlyThrough(2, day, ids)
    }
    // Every fixture exactly once in the end.
    const counts = ids.map(id => store().completedMatches.filter(m => m.id === id).length)
    expect(counts).toEqual(ids.map(() => 1))
}, 120_000)

test("a daily-mode fixture its day never reached is played by the next tick, once", async () => {
    const save = dailyWorld()
    save.saveId = "daily_ai_fixtures_skip"
    expect((await saveManager.saveGame(save)).success).toBe(true)
    useGameStore.setState({ ...initial, toasts: [] })
    await store().loadGame(save.saveId)
    await store().advanceDay() // day 1: w1_d1
    await store().advanceWeek() // straight to the tick from day 1
    expect(store().currentWeek).toBe(2)
    const ids = save.scheduledMatches.map(m => m.id)
    const played = (id: string) => store().completedMatches.filter(m => m.id === id).length
    expect(ids.filter(id => id.startsWith("w1_")).map(played)).toEqual([1, 1, 1, 1, 1])
    expect(played("w2_d0")).toBe(1)
    expect(played("w2_d2")).toBe(0)
}, 120_000)
