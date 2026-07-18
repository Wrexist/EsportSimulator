/**
 * Regression for training-slot-cap-weekly-reset.
 *
 * A role-training session reserves one of the team's training slots for its
 * whole 8-week duration (startRoleTraining bumps trainingSlotsUsed, and only
 * completion/cancel releases it). The weekly finalize step used to hard-zero
 * every team's trainingSlotsUsed, so an in-progress role training stopped
 * counting against the cap after its start week — letting a team stack far
 * more concurrent role trainings than maxTrainingSlots by starting one per
 * week. The reset now re-reserves one slot per still-active session.
 *
 * Driven through the real AtomicWeekProcessor.processWeek so the fix is
 * exercised end-to-end, not in a copy of the reset expression.
 */

import { SaveManager } from "@/engine/save-manager"
import { AtomicWeekProcessor } from "@/engine/atomic-week-processor"
import { SeededRNG } from "@/engine/rng"
import type {
    GameSave, TeamSaveData, PlayerSaveData, ContractSaveData, StaffSaveData,
} from "@/engine/save-types"
import type { AsyncStorage } from "@/engine/storage-adapter"

class MemoryStorage implements AsyncStorage {
    public store = new Map<string, string>()
    async getItem(key: string): Promise<string | null> {
        return this.store.has(key) ? (this.store.get(key) ?? null) : null
    }
    async setItem(key: string, value: string): Promise<void> { this.store.set(key, value) }
    async removeItem(key: string): Promise<void> { this.store.delete(key) }
    async clear(): Promise<void> { this.store.clear() }
    async getAllKeys(): Promise<string[]> { return Array.from(this.store.keys()) }
}

function makePlayer(id: string, role: string): PlayerSaveData {
    return {
        id, nickname: id, firstName: id, lastName: "Player",
        age: 22, nationality: "US", role,
        rifle: 60, awp: 50, pistol: 60, grenades: 55, creativity: 55, clutch: 55,
        tactic: 55, leader: 50, teamwork: 55, reaction: 60, eyesight: 60,
        morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        skill: 60, potential: 80, productivity: 60, endurance: 70,
    } as unknown as PlayerSaveData
}

function makeContract(playerId: string, teamId: string): ContractSaveData {
    return {
        id: `c_${playerId}`, playerId, teamId,
        salaryPerWeek: 1500, startWeek: 1, endWeek: 200, buyout: 50_000,
    } as ContractSaveData
}

function makeTeam(id: string, overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: `Team ${id}`, shortName: id.toUpperCase().slice(0, 4),
        budget: 1_000_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, followers: 7000, playstyle: "default",
        reputation: 50, region: "EU", facilitiesLevel: 1,
        financialState: "STABLE", weeklyNet: 5000, runwayWeeks: 50,
        worldRanking: 20,
        ...overrides,
    } as unknown as TeamSaveData
}

function buildSave(sm: SaveManager): GameSave {
    const teamIds = ["player", "ai_1", "ai_2"]
    const teams: TeamSaveData[] = []
    const players: PlayerSaveData[] = []
    const contracts: ContractSaveData[] = []
    const staff: StaffSaveData[] = []
    const roles = ["IGL", "AWPER", "ENTRY_FRAGGER", "SUPPORT", "RIFLER"]

    teamIds.forEach((tid, ti) => {
        const rosterIds = Array.from({ length: 5 }, (_, i) => `${tid}_p${i}`)
        teams.push(makeTeam(tid, {
            rosterIds,
            worldRanking: (ti + 1) * 4,
            // Player team carries one in-progress role-training session.
            ...(tid === "player" ? {
                maxTrainingSlots: 10,
                trainingSlotsUsed: 1,
                activeRoleTraining: [{
                    playerId: "player_p0", targetRole: "support",
                    weeksCompleted: 0, totalWeeks: 8, weeklyCost: 5000, startWeek: 1,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                }] as any,
            } : {}),
        }))
        rosterIds.forEach((pid, pi) => {
            players.push(makePlayer(pid, roles[pi]))
            contracts.push(makeContract(pid, tid))
        })
    })

    return sm.createSave("Slot Carryover", {
        playerTeamId: "player",
        lastRngSeed: 7,
        teams, players, contracts, staff,
    })
}

describe("weekly finalize — role-training slot reservation carries across weeks", () => {
    test("an in-progress role-training session still consumes a slot after the tick", async () => {
        const sm = new SaveManager(new MemoryStorage())
        const awp = new AtomicWeekProcessor(sm)
        const save = buildSave(sm)

        const result = await awp.processWeek(save, {
            playerTeamId: "player",
            trainingFocus: new Map(),
        }, new SeededRNG(7))

        expect(result.success).toBe(true)

        const player = save.teams.find(t => t.id === "player")!
        // Session is still active (8-week training, only 1 week elapsed)...
        expect(player.activeRoleTraining!.length).toBe(1)
        expect(player.activeRoleTraining![0].weeksCompleted).toBe(1)
        // ...so its reserved slot must survive the weekly reset, not zero out.
        expect(player.trainingSlotsUsed).toBe(1)
    })
})
