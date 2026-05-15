/**
 * Wall-time-per-tick performance profile for advanceWeek.
 *
 * The smoke test revealed super-linear growth (26 weeks = 12s,
 * 52 weeks = 59s — 2.5× per-tick at week 52 vs week 26). This test
 * captures the per-tick wall time across all 52 weeks and asserts
 * that the late-season tick is not absurdly slower than the
 * early-season tick.
 *
 * Set WEEK_PROFILE_VERBOSE=1 to dump the full per-week table.
 *
 * The assertion threshold is set generously (no week-52 tick may be
 * more than 8× a week-1 tick) so Phase O improvements can tighten it.
 */

import { SaveManager } from "@/engine/save-manager"
import { AtomicWeekProcessor } from "@/engine/atomic-week-processor"
import { SeededRNG } from "@/engine/rng"
import type {
    GameSave,
    TeamSaveData,
    PlayerSaveData,
    ContractSaveData,
    StaffSaveData,
} from "@/engine/save-types"
import type { AsyncStorage } from "@/engine/storage-adapter"

const verbose = process.env.WEEK_PROFILE_VERBOSE === "1"

class MemoryStorage implements AsyncStorage {
    public store = new Map<string, string>()
    async getItem(key: string): Promise<string | null> { return this.store.get(key) ?? null }
    async setItem(key: string, value: string): Promise<void> { this.store.set(key, value) }
    async removeItem(key: string): Promise<void> { this.store.delete(key) }
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

function makeSmokeSave(saveManager: SaveManager, seed: number): GameSave {
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

    return saveManager.createSave("Profile", {
        playerTeamId: "player",
        lastRngSeed: seed,
        teams, players, contracts, staff,
    })
}

describe("week-tick wall-time profile", () => {
    test("late-season tick should not be wildly slower than early-season tick", async () => {
        const sm = new SaveManager(new MemoryStorage())
        const awp = new AtomicWeekProcessor(sm)
        const save = makeSmokeSave(sm, 12345)

        const times: number[] = []
        const completedSizes: number[] = []
        const ledgerSizes: number[] = []
        const eventsSizes: number[] = []

        for (let i = 0; i < 52; i++) {
            const rng = new SeededRNG(12345 + i)
            const t0 = performance.now()
            const result = await awp.processWeek(save, {
                playerTeamId: save.playerTeamId,
                trainingFocus: new Map(),
            }, rng)
            const dt = performance.now() - t0

            expect(result.success).toBe(true)
            times.push(dt)
            completedSizes.push(save.completedMatches.length)
            ledgerSizes.push(save.financeLedger.length)
            eventsSizes.push(save.eventsLog.length)
        }

        if (verbose) {
            // eslint-disable-next-line no-console
            console.log("\n=== Per-week wall-time (ms) ===")
            // eslint-disable-next-line no-console
            console.log("week  time(ms)  completed  ledger  events")
            for (let i = 0; i < times.length; i++) {
                const wk = (i + 1).toString().padStart(4)
                const t = times[i].toFixed(1).padStart(8)
                const c = completedSizes[i].toString().padStart(10)
                const l = ledgerSizes[i].toString().padStart(7)
                const e = eventsSizes[i].toString().padStart(7)
                // eslint-disable-next-line no-console
                console.log(`${wk}  ${t}  ${c}  ${l}  ${e}`)
            }
        }

        // Average across the first 4 weeks vs the last 4 weeks gives us
        // a robust signal that smooths over per-week variance from RNG-
        // dependent match counts.
        const earlyAvg = (times[0] + times[1] + times[2] + times[3]) / 4
        const lateAvg = (times[48] + times[49] + times[50] + times[51]) / 4
        const ratio = lateAvg / earlyAvg

        // Always print so CI surfaces the trend even when test passes.
        // eslint-disable-next-line no-console
        console.log(`[perf] early avg=${earlyAvg.toFixed(1)}ms late avg=${lateAvg.toFixed(1)}ms ratio=${ratio.toFixed(2)}×`)
        // Array sizes at key checkpoints, to identify which log is the
        // dominant scaling factor for super-linear cost growth.
        // eslint-disable-next-line no-console
        console.log(`[perf] sizes wk1: completed=${completedSizes[0]} ledger=${ledgerSizes[0]} events=${eventsSizes[0]}`)
        // eslint-disable-next-line no-console
        console.log(`[perf] sizes wk26: completed=${completedSizes[25]} ledger=${ledgerSizes[25]} events=${eventsSizes[25]}`)
        // eslint-disable-next-line no-console
        console.log(`[perf] sizes wk52: completed=${completedSizes[51]} ledger=${ledgerSizes[51]} events=${eventsSizes[51]}`)

        // Cap is set just above the current post-Phase-O.2 baseline (~3×).
        // Any regression that re-introduces a quadratic scan trips the
        // test before players feel it.
        //
        // History:
        //   Before Phase O:    ratio 71.75× — saveGameCheckpoint × 11/tick
        //                                     full-save serialization storm
        //   After Phase O:     ratio  24.23× — only final saveGame remains
        //   After Phase O.2:   ratio   2.70× — strip rounds[] from AI-vs-AI
        //                                     match records (shrinks save
        //                                     11× at week 52 from 18 MB
        //                                     down to ~1.7 MB)
        //
        // 5× is the threshold we ship with. If a future change reintroduces
        // an O(n²) scan the curve will steepen and this test will fail
        // before week-52 ticks become user-visible-slow.
        expect(ratio).toBeLessThan(5)
        expect(Number.isFinite(ratio)).toBe(true)
        expect(earlyAvg).toBeGreaterThan(0)
    }, 180_000)
})
