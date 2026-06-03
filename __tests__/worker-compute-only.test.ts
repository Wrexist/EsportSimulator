/**
 * Regression coverage for the compute-only Web Worker (Phase 1.1 fix).
 *
 * The week processor runs inside a Worker. A Worker has no `window`, so the
 * base SaveManager would pick the IndexedDB adapter and write the full save +
 * per-step transaction state to a worker-LOCAL store that diverges from — and
 * in Electron bypasses — the store every other load/save uses. The fix makes
 * the worker's SaveManager compute-only (no-op storage + a no-op saveGame), and
 * the main thread performs the single authoritative save after post-tick steps.
 *
 * These tests mirror engine/worker/week-processor.worker.ts's WorkerSaveManager
 * and assert the critical invariant: processWeek must still SUCCEED and advance
 * the week when persistence is a no-op (processWeek throws if saveGame reports
 * failure), and it must persist nothing.
 */

import { SaveManager } from "@/engine/save-manager"
import { AtomicWeekProcessor } from "@/engine/atomic-week-processor"
import { SeededRNG } from "@/engine/rng"
import type {
    GameSave,
    TeamSaveData,
    PlayerSaveData,
    ContractSaveData,
    WeekTickState,
} from "@/engine/save-types"
import type { AsyncStorage } from "@/engine/storage-adapter"

class MemoryStorage implements AsyncStorage {
    public store = new Map<string, string>()
    async getItem(k: string): Promise<string | null> { return this.store.get(k) ?? null }
    async setItem(k: string, v: string): Promise<void> { this.store.set(k, v) }
    async removeItem(k: string): Promise<void> { this.store.delete(k) }
    async clear(): Promise<void> { this.store.clear() }
    async getAllKeys(): Promise<string[]> { return Array.from(this.store.keys()) }
}

// Records the keys it is asked to write but persists NOTHING — mirrors the
// production worker's no-op storage so we can assert the full save was never
// written.
class RecordingNoopStorage implements AsyncStorage {
    public writtenKeys: string[] = []
    async getItem(): Promise<string | null> { return null }
    async setItem(k: string): Promise<void> { this.writtenKeys.push(k) }
    async removeItem(): Promise<void> { /* no-op */ }
    async clear(): Promise<void> { /* no-op */ }
    async getAllKeys(): Promise<string[]> { return [] }
}

// Mirror of engine/worker/week-processor.worker.ts WorkerSaveManager.
class WorkerLikeSaveManager extends SaveManager {
    public saveGameCalls = 0
    constructor(public injected: AsyncStorage) { super(injected) }
    async getIncompleteTransaction(): Promise<WeekTickState | null> { return null }
    async saveGame(): Promise<{ success: boolean; error?: string; repairs?: string[] }> {
        this.saveGameCalls++
        return { success: true }
    }
}

function makePlayer(id: string, role: string, pi: number): PlayerSaveData {
    return {
        id, nickname: id, firstName: id, lastName: "P", age: 20 + pi, nationality: "US",
        role,
        rifle: 60, awp: 50, pistol: 60, grenades: 55, creativity: 55, clutch: 55,
        tactic: 55, leader: 50, teamwork: 55, reaction: 60, eyesight: 60,
        morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        skill: 60, potential: 80, productivity: 60, endurance: 70,
    } as unknown as PlayerSaveData
}

function buildSave(seed = 42): GameSave {
    const setupMgr = new SaveManager(new MemoryStorage())
    const teams: TeamSaveData[] = []
    const players: PlayerSaveData[] = []
    const contracts: ContractSaveData[] = []
    const roles = ["IGL", "AWPER", "ENTRY_FRAGGER", "SUPPORT", "RIFLER"]
    for (const tid of ["player", "ai1"]) {
        const rosterIds = Array.from({ length: 5 }, (_, i) => `${tid}_p${i}`)
        teams.push({
            id: tid, name: tid, shortName: tid.slice(0, 4).toUpperCase(),
            budget: 400_000, rosterIds, staffIds: [],
            trophies: [], facilities: [], sponsors: [],
            fanbase: 1000, playstyle: "default", reputation: 50,
            region: "EU", facilitiesLevel: 1,
            financialState: "STABLE", weeklyNet: 5000, runwayWeeks: 50, worldRanking: 10,
        } as unknown as TeamSaveData)
        rosterIds.forEach((pid, pi) => {
            players.push(makePlayer(pid, roles[pi], pi))
            contracts.push({
                id: `c_${pid}`, playerId: pid, teamId: tid,
                salaryPerWeek: 1500, startWeek: 1, endWeek: 60, buyout: 50_000,
            } as ContractSaveData)
        })
    }
    return setupMgr.createSave("Compute-Only Test", {
        playerTeamId: "player", lastRngSeed: seed, teams, players, contracts, staff: [],
    })
}

describe("week processor under a compute-only (worker) SaveManager", () => {
    test("processWeek succeeds and advances the week with no persistence", async () => {
        const save = buildSave()
        const startWeek = save.currentWeek
        const mgr = new WorkerLikeSaveManager(new RecordingNoopStorage())
        const proc = new AtomicWeekProcessor(mgr)

        const result = await proc.processWeek(
            save,
            { playerTeamId: "player", trainingFocus: new Map() },
            new SeededRNG(save.lastRngSeed),
        )

        // The tick must complete — processWeek throws if saveGame reports
        // failure, so a broken no-op would surface here.
        expect(result.success).toBe(true)
        expect(save.currentWeek).toBe(startWeek + 1)
        // The processor reached its single authoritative-save step and our
        // no-op handled it.
        expect(mgr.saveGameCalls).toBeGreaterThan(0)
    })

    test("the worker persists nothing durable (full save never written)", async () => {
        const save = buildSave()
        // Use a REAL storing adapter here: if saveGame wrote the full save it
        // would land in `mem.store`. Transaction bookkeeping is created during
        // the tick and cleared by completeWeekTick, so after a successful tick
        // the store must be empty — proving nothing durable was persisted.
        const mem = new MemoryStorage()
        const mgr = new WorkerLikeSaveManager(mem)
        const proc = new AtomicWeekProcessor(mgr)

        const result = await proc.processWeek(
            save,
            { playerTeamId: "player", trainingFocus: new Map() },
            new SeededRNG(save.lastRngSeed),
        )

        expect(result.success).toBe(true)
        // No full GameSave was persisted (saveGame is a no-op), and transaction
        // state was cleaned up by completeWeekTick.
        expect(mem.store.size).toBe(0)
        for (const value of mem.store.values()) {
            expect(value).not.toContain('"saveVersion"')
        }
    })

    test("compute-only processing is deterministic across identical runs", async () => {
        const a = buildSave(7)
        const b = structuredClone(a)

        const runA = await new AtomicWeekProcessor(new WorkerLikeSaveManager(new RecordingNoopStorage()))
            .processWeek(a, { playerTeamId: "player", trainingFocus: new Map() }, new SeededRNG(a.lastRngSeed))
        const runB = await new AtomicWeekProcessor(new WorkerLikeSaveManager(new RecordingNoopStorage()))
            .processWeek(b, { playerTeamId: "player", trainingFocus: new Map() }, new SeededRNG(b.lastRngSeed))

        expect(runA.success).toBe(true)
        expect(runB.success).toBe(true)
        expect(a.currentWeek).toBe(b.currentWeek)
        expect(a.completedMatches.length).toBe(b.completedMatches.length)
        expect(a.lastRngSeed).toBe(b.lastRngSeed)
    })
})
