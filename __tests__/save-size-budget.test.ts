/**
 * Save-size regression test.
 *
 * After Phase O.2 stripped rounds[] from AI-vs-AI completed matches,
 * a full-season smoke save dropped from 18.4 MB to ~1.7 MB. This test
 * locks that contract — if the per-match payload ever blows up again
 * (e.g. someone adds a giant new sub-object to MatchResult without
 * stripping it for AI matches), the season-save budget catches it.
 *
 * The budget is set generously (4 MB) so legitimate growth doesn't
 * trip the test, but a regression toward the old 18 MB baseline
 * would fire immediately.
 *
 * Also verifies that the player-team match keeps full round detail
 * — that's intentional because the match-result page needs round-
 * by-round data to render the play-by-play view.
 */

import { SaveManager } from "@/engine/save-manager"
import { AtomicWeekProcessor } from "@/engine/atomic-week-processor"
import { SeededRNG } from "@/engine/rng"
import type {
    GameSave, TeamSaveData, PlayerSaveData,
    ContractSaveData, StaffSaveData, CompletedMatchSaveData,
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

function makePlayer(id: string, role: string, skill: number): PlayerSaveData {
    return {
        id, nickname: id, firstName: id, lastName: "P",
        age: 22, nationality: "US", role,
        rifle: skill, awp: skill - 10, pistol: skill, grenades: skill - 5, creativity: skill - 5,
        clutch: skill - 5, tactic: skill - 5, leader: skill - 10, teamwork: skill,
        reaction: skill, eyesight: skill,
        morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        skill, potential: skill + 20, productivity: 60, endurance: 70,
    } as unknown as PlayerSaveData
}

function makeSave(sm: SaveManager): GameSave {
    const teamIds = ["player", "ai_1", "ai_2", "ai_3", "ai_4", "ai_5"]
    const teams: TeamSaveData[] = []
    const players: PlayerSaveData[] = []
    const contracts: ContractSaveData[] = []
    const staff: StaffSaveData[] = []
    teamIds.forEach((tid, ti) => {
        const rosterIds = Array.from({ length: 5 }, (_, i) => `${tid}_p${i}`)
        teams.push({
            id: tid, name: tid, shortName: tid.slice(0, 4),
            budget: 500_000, rosterIds, staffIds: [`${tid}_coach`],
            trophies: [], facilities: [], sponsors: [],
            fanbase: 1000, followers: 7000, playstyle: "default",
            reputation: 50, region: "EU", facilitiesLevel: 1,
            financialState: "STABLE", weeklyNet: 5000, runwayWeeks: 50,
            worldRanking: (ti + 1) * 4,
        } as unknown as TeamSaveData)
        rosterIds.forEach((pid, pi) => {
            players.push(makePlayer(pid, ["IGL", "AWPER", "ENTRY_FRAGGER", "SUPPORT", "RIFLER"][pi], 55 + ti * 3 + pi))
            contracts.push({
                id: `c_${pid}`, playerId: pid, teamId: tid,
                salaryPerWeek: 1500, startWeek: 1, endWeek: 53, buyout: 78000,
            } as ContractSaveData)
        })
        staff.push({
            id: `${tid}_coach`, teamId: tid, name: `${tid} Coach`,
            role: "coach", salaryPerWeek: 2000, level: 3, contractEndWeek: 53,
            stats: { development: 60, analysis: 50 }, unlockedTalentIds: [],
        } as unknown as StaffSaveData)
    })
    return sm.createSave("Budget", {
        playerTeamId: "player", lastRngSeed: 12345,
        teams, players, contracts, staff,
    })
}

describe("save-size budget", () => {
    test("full-season save stays under 4 MB on a typical smoke fixture", async () => {
        const sm = new SaveManager(new MemoryStorage())
        const awp = new AtomicWeekProcessor(sm)
        const save = makeSave(sm)
        for (let i = 0; i < 52; i++) {
            const rng = new SeededRNG(12345 + i)
            await awp.processWeek(save, {
                playerTeamId: save.playerTeamId,
                trainingFocus: new Map(),
            }, rng)
        }

        const totalKB = JSON.stringify(save).length / 1024
        // eslint-disable-next-line no-console
        console.log(`[budget] full-season save = ${totalKB.toFixed(0)} KB`)
        // 4096 KB = 4 MB. We're around 1700 KB. Generous buffer.
        expect(totalKB).toBeLessThan(4096)
    }, 60_000)

    test("AI-vs-AI completed matches have empty rounds[] (rounds stripped)", async () => {
        const sm = new SaveManager(new MemoryStorage())
        const awp = new AtomicWeekProcessor(sm)
        const save = makeSave(sm)
        for (let i = 0; i < 26; i++) {
            const rng = new SeededRNG(12345 + i)
            await awp.processWeek(save, {
                playerTeamId: save.playerTeamId,
                trainingFocus: new Map(),
            }, rng)
        }

        const aiMatches = save.completedMatches.filter((m: CompletedMatchSaveData) =>
            m.homeTeamId !== save.playerTeamId && m.awayTeamId !== save.playerTeamId
        )
        // There should be plenty of AI-vs-AI matches in any season fixture.
        expect(aiMatches.length).toBeGreaterThan(0)
        for (const m of aiMatches) {
            for (const map of m.result.maps) {
                // rounds[] should be empty — we strip them to keep saves small.
                // Map summary fields (finalScore, mvp, etc.) survive.
                expect(map.rounds.length).toBe(0)
                expect(map.finalScore).toBeDefined()
            }
        }
    }, 30_000)

    test("player-team matches RETAIN their rounds[] for replay UI", async () => {
        const sm = new SaveManager(new MemoryStorage())
        const awp = new AtomicWeekProcessor(sm)
        const save = makeSave(sm)
        for (let i = 0; i < 26; i++) {
            const rng = new SeededRNG(12345 + i)
            await awp.processWeek(save, {
                playerTeamId: save.playerTeamId,
                trainingFocus: new Map(),
            }, rng)
        }

        const playerMatches = save.completedMatches.filter((m: CompletedMatchSaveData) =>
            m.homeTeamId === save.playerTeamId || m.awayTeamId === save.playerTeamId
        )

        if (playerMatches.length > 0) {
            // At least one player-team match should have non-empty round data.
            // (Note: forfeit matches have empty maps by design — only count
            // the ones with played maps.)
            const playedMatches = playerMatches.filter(m => m.result.maps.length > 0 && m.result.maps[0].rounds)
            if (playedMatches.length > 0) {
                const hasFullRounds = playedMatches.some(m =>
                    m.result.maps.some(map => map.rounds && map.rounds.length > 0)
                )
                expect(hasFullRounds).toBe(true)
            }
        }
    }, 30_000)
})
