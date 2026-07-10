/**
 * Resume / crash-recovery correctness for the atomic week processor.
 *
 * The week tick commits in two on-disk steps at the very end of processWeek():
 *   1. saveGame()          — persists the finished week (currentWeek already
 *                            advanced to N+1)
 *   2. completeWeekTick()  — clears the leftover WeekTickState transaction
 *
 * A crash BETWEEN those two writes leaves the on-disk save at currentWeek=N+1
 * with a leftover transaction whose weekNumber is also N+1. On the next
 * advance the processor must recognise the week as ALREADY COMMITTED and NOT
 * re-run it — re-running double-charges salaries, re-ages players at a season
 * boundary, and (because the increment guard is then false) leaves the week
 * counter stuck at N+1.
 *
 * These tests plant the leftover transaction directly in storage to reproduce
 * both crash windows and assert the tick advances exactly once with no
 * double-processing.
 */

import { SaveManager } from "@/engine/save-manager"
import { AtomicWeekProcessor } from "@/engine/atomic-week-processor"
import { SeededRNG } from "@/engine/rng"
import { STORAGE_KEYS } from "@/engine/save-types"
import type {
    GameSave,
    TeamSaveData,
    PlayerSaveData,
    ContractSaveData,
    StaffSaveData,
    WeekTickState,
} from "@/engine/save-types"
import type { AsyncStorage } from "@/engine/storage-adapter"

class MemoryStorage implements AsyncStorage {
    public store = new Map<string, string>()
    async getItem(key: string): Promise<string | null> {
        return this.store.has(key) ? (this.store.get(key) ?? null) : null
    }
    async setItem(key: string, value: string): Promise<void> {
        this.store.set(key, value)
    }
    async removeItem(key: string): Promise<void> {
        this.store.delete(key)
    }
    async clear(): Promise<void> {
        this.store.clear()
    }
    async getAllKeys(): Promise<string[]> {
        return Array.from(this.store.keys())
    }
}

function makePlayer(id: string, overrides: Partial<PlayerSaveData> = {}): PlayerSaveData {
    return {
        id, nickname: id, firstName: id, lastName: "Player",
        age: 22, nationality: "US", role: "RIFLER",
        rifle: 60, awp: 50, pistol: 60, grenades: 55, creativity: 55, clutch: 55,
        tactic: 55, leader: 50, teamwork: 55, reaction: 60, eyesight: 60,
        morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        skill: 60, potential: 80, productivity: 60, endurance: 70,
        ...overrides,
    } as unknown as PlayerSaveData
}

function makeTeam(id: string, overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: `Team ${id}`, shortName: id.toUpperCase().slice(0, 4),
        budget: 500_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, followers: 7000, playstyle: "default",
        reputation: 50, region: "EU", facilitiesLevel: 1,
        financialState: "STABLE", weeklyNet: 5000, runwayWeeks: 50,
        worldRanking: 20,
        ...overrides,
    } as unknown as TeamSaveData
}

function buildSave(seed: number, sm: SaveManager): GameSave {
    const teamIds = ["player", "ai_1", "ai_2", "ai_3", "ai_4", "ai_5"]
    const teams: TeamSaveData[] = []
    const players: PlayerSaveData[] = []
    const contracts: ContractSaveData[] = []
    const staff: StaffSaveData[] = []

    teamIds.forEach((tid, ti) => {
        const rosterIds = Array.from({ length: 5 }, (_, i) => `${tid}_p${i}`)
        teams.push(makeTeam(tid, {
            rosterIds,
            staffIds: [`${tid}_coach`],
            worldRanking: (ti + 1) * 4,
            budget: ti === 0 ? 200_000 : 500_000 + ti * 100_000,
        }))
        rosterIds.forEach((pid, pi) => {
            players.push(makePlayer(pid, {
                skill: 55 + ti * 3 + pi,
                potential: 80 + (pi % 3) * 2,
                age: 20 + pi,
                role: ["IGL", "AWPER", "ENTRY_FRAGGER", "SUPPORT", "RIFLER"][pi] as any,
            }))
            contracts.push({
                id: `c_${pid}`, playerId: pid, teamId: tid,
                salaryPerWeek: 1500 + pi * 200, startWeek: 1, endWeek: 200,
                buyout: 100_000,
            } as ContractSaveData)
        })
        staff.push({
            id: `${tid}_coach`, teamId: tid, name: `${tid} Coach`,
            role: "coach", salaryPerWeek: 2000, level: 3, contractEndWeek: 200,
            stats: { development: 60, analysis: 50 }, unlockedTalentIds: [],
        } as unknown as StaffSaveData)
    })

    return sm.createSave("Resume Test", {
        playerTeamId: "player",
        lastRngSeed: seed,
        teams, players, contracts, staff,
    })
}

/** Plant a leftover WeekTickState transaction directly into storage. */
async function plantTransaction(
    storage: MemoryStorage,
    saveId: string,
    weekNumber: number,
): Promise<void> {
    const state: WeekTickState = {
        weekNumber,
        saveId,
        startedAt: new Date().toISOString(),
        trainingComplete: true,
        fatigueRecoveryComplete: true,
        injuryChecksComplete: true,
        financeComplete: true,
        tournamentProcessingComplete: true,
        matchSimulationComplete: true,
        standingsUpdateComplete: true,
        eventGenerationComplete: true,
        worldLogicComplete: true,
        restDayProcessingComplete: true,
        pendingMatchIds: [],
        completedMatchIds: [],
        generatedEventIds: [],
    } as WeekTickState
    await storage.setItem(`${STORAGE_KEYS.WEEK_TICK_STATE}_${saveId}`, JSON.stringify(state))
}

async function processOne(save: GameSave, awp: AtomicWeekProcessor, seed: number): Promise<void> {
    const rng = new SeededRNG(seed)
    const result = await awp.processWeek(save, {
        playerTeamId: save.playerTeamId,
        trainingFocus: new Map(),
    }, rng)
    expect(result.success).toBe(true)
}

describe("AtomicWeekProcessor — resume after crash between saveGame and completeWeekTick", () => {
    test("a committed-but-uncleared transaction (weekNumber === currentWeek) is NOT re-run; the week still advances once", async () => {
        // Control run: process weeks 1→2→3 normally, no interruption.
        const smC = new SaveManager(new MemoryStorage())
        const awpC = new AtomicWeekProcessor(smC)
        const control = buildSave(2025, smC)
        await processOne(control, awpC, 100) // → week 2
        await processOne(control, awpC, 200) // → week 3
        const controlBudget = control.teams.find(t => t.id === "player")!.budget
        expect(control.currentWeek).toBe(3)

        // Crash run: process week 1→2 normally, then simulate the crash window
        // by planting a leftover transaction for the just-committed week 2
        // (as if completeWeekTick never ran). The next advance must treat
        // week 2 as done and move on to week 3 — not re-process week 2.
        const storage = new MemoryStorage()
        const sm = new SaveManager(storage)
        const awp = new AtomicWeekProcessor(sm)
        const crashed = buildSave(2025, sm)
        await processOne(crashed, awp, 100) // → week 2, transaction cleared
        expect(crashed.currentWeek).toBe(2)

        // On-disk currentWeek is 2 and a leftover transaction with weekNumber=2
        // remains — exactly the post-commit crash state.
        await plantTransaction(storage, crashed.saveId, 2)

        await processOne(crashed, awp, 200)

        // Week counter advanced exactly once (the bug left it stuck at 2).
        expect(crashed.currentWeek).toBe(3)
        // No double-charge: budget matches the uninterrupted control run,
        // proving week 2 was processed exactly once.
        expect(crashed.teams.find(t => t.id === "player")!.budget).toBe(controlBudget)
        // Transaction cleared after the fresh tick.
        expect(crashed.weekTickState).toBeNull()
        expect(storage.store.has(`${STORAGE_KEYS.WEEK_TICK_STATE}_${crashed.saveId}`)).toBe(false)
    })

    test("a pre-commit transaction (weekNumber === currentWeek + 1) still resumes and re-runs the interrupted week", async () => {
        // Control: uninterrupted 1→2→3.
        const smC = new SaveManager(new MemoryStorage())
        const awpC = new AtomicWeekProcessor(smC)
        const control = buildSave(4242, smC)
        await processOne(control, awpC, 100) // → week 2
        await processOne(control, awpC, 200) // → week 3
        const controlBudget = control.teams.find(t => t.id === "player")!.budget

        // Crash run: advance to week 2, then plant a transaction for week 3
        // (weekNumber = currentWeek + 1) as if the week-3 tick died before its
        // final save committed — on-disk currentWeek is still 2.
        const storage = new MemoryStorage()
        const sm = new SaveManager(storage)
        const awp = new AtomicWeekProcessor(sm)
        const crashed = buildSave(4242, sm)
        await processOne(crashed, awp, 100) // → week 2
        expect(crashed.currentWeek).toBe(2)

        await plantTransaction(storage, crashed.saveId, 3)

        await processOne(crashed, awp, 200)

        // The interrupted week 3 is re-run and committed exactly once.
        expect(crashed.currentWeek).toBe(3)
        expect(crashed.teams.find(t => t.id === "player")!.budget).toBe(controlBudget)
        expect(crashed.weekTickState).toBeNull()
    })
})
