import { SaveManager } from "@/engine/save-manager"
import { computeWeek } from "@/engine/worker/compute-week"
import { asyncStorage, type AsyncStorage } from "@/engine/storage-adapter"
import type { GameSave, TeamSaveData, PlayerSaveData, ContractSaveData } from "@/engine/save-types"

class MemoryStorage implements AsyncStorage {
    public store = new Map<string, string>()
    async getItem(k: string): Promise<string | null> { return this.store.get(k) ?? null }
    async setItem(k: string, v: string): Promise<void> { this.store.set(k, v) }
    async removeItem(k: string): Promise<void> { this.store.delete(k) }
    async clear(): Promise<void> { this.store.clear() }
    async getAllKeys(): Promise<string[]> { return Array.from(this.store.keys()) }
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

describe("production compute-only week processing", () => {
    afterEach(() => jest.restoreAllMocks())

    test("advances a week without writing to the application's persistence adapter", async () => {
        const save = buildSave()
        const startWeek = save.currentWeek
        const write = jest.spyOn(asyncStorage, "setItem")
        const remove = jest.spyOn(asyncStorage, "removeItem")
        const durableSave = jest.spyOn(SaveManager.prototype, "saveGame")
        const computed = await computeWeek(save, { playerTeamId: "player", trainingFocus: new Map() }, save.lastRngSeed)
        expect(computed.result.success).toBe(true)
        expect(computed.save.currentWeek).toBe(startWeek + 1)
        expect(computed.save.lastCommittedWeekTick).toBe(startWeek + 1)
        expect(computed.rngState).toBe(computed.save.lastRngSeed)
        expect(write).not.toHaveBeenCalled()
        expect(remove).not.toHaveBeenCalled()
        expect(durableSave).not.toHaveBeenCalled()
    })

    test("identical input produces identical simulation state and RNG", async () => {
        const a = buildSave(7)
        const b = structuredClone(a)
        const config = { playerTeamId: "player", trainingFocus: new Map() }
        const first = await computeWeek(a, config, a.lastRngSeed)
        const second = await computeWeek(b, config, b.lastRngSeed)
        expect(first.result.success).toBe(true)
        expect(second.result.success).toBe(true)
        expect(first.rngState).toBe(second.rngState)
        expect(first.save).toEqual(second.save)
    })
})
