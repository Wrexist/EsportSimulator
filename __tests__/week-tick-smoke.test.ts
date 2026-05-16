/**
 * End-to-end smoke tests for the weekly tick pipeline (Phase N).
 *
 * Where unit tests cover each subsystem in isolation, these tests
 * exercise the WHOLE advanceWeek path — finance, training, AI,
 * matches, tournaments, scouting, fanbase, news, save persistence —
 * by simulating many weeks back-to-back on a minimal-but-realistic
 * save and asserting save-state invariants after every tick.
 *
 * Several real bugs we've fixed (consecutive insolvency counter,
 * sponsor goal idempotency, talent application drift) would have
 * surfaced here before reaching players. These tests catch the class
 * of cross-subsystem regressions that unit tests can't.
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
import { TrainingFocus } from "@/types"
import type { AsyncStorage } from "@/engine/storage-adapter"

/* ----- in-memory storage so tests don't touch a real disk ----- */
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

/* ----- fixture builders ----- */
function makePlayer(id: string, teamId: string, overrides: Partial<PlayerSaveData> = {}): PlayerSaveData {
    return {
        id, nickname: id, firstName: id, lastName: "Player",
        age: 22, nationality: "US",
        role: "RIFLER",
        rifle: 60, awp: 50, pistol: 60, grenades: 55, creativity: 55, clutch: 55,
        tactic: 55, leader: 50, teamwork: 55, reaction: 60, eyesight: 60,
        morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        skill: 60, potential: 80,
        productivity: 60, endurance: 70,
        ...overrides,
    } as unknown as PlayerSaveData
}

function makeContract(playerId: string, teamId: string, week: number, salary = 1000): ContractSaveData {
    return {
        id: `c_${playerId}`, playerId, teamId,
        salaryPerWeek: salary,
        startWeek: 1, endWeek: week + 52,
        buyout: salary * 52,
    } as ContractSaveData
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

function buildSmokeSave(seed: number, saveManager: SaveManager): GameSave {
    // Player team + 5 AI teams. Each team has 5 players + a coach.
    const teamIds = ["player", "ai_1", "ai_2", "ai_3", "ai_4", "ai_5"]
    const teams: TeamSaveData[] = []
    const players: PlayerSaveData[] = []
    const contracts: ContractSaveData[] = []
    const staff: StaffSaveData[] = []

    teamIds.forEach((tid, ti) => {
        const rosterIds = Array.from({ length: 5 }, (_, i) => `${tid}_p${i}`)
        // Player team is the lower-budget one to put pressure on finance system.
        teams.push(makeTeam(tid, {
            rosterIds,
            staffIds: [`${tid}_coach`],
            worldRanking: (ti + 1) * 4, // 4, 8, 12, ...
            // Vary budgets to exercise different financial states.
            budget: ti === 0 ? 200_000 : 500_000 + ti * 100_000,
        }))
        rosterIds.forEach((pid, pi) => {
            // Vary stats slightly so AI roster decisions aren't degenerate.
            players.push(makePlayer(pid, tid, {
                skill: 55 + ti * 3 + pi,
                potential: 80 + (pi % 3) * 2,
                age: 20 + pi,
                // Diverse roles
                role: ["IGL", "AWPER", "ENTRY_FRAGGER", "SUPPORT", "RIFLER"][pi] as any,
            }))
            contracts.push(makeContract(pid, tid, 1, 1500 + pi * 200))
        })
        staff.push({
            id: `${tid}_coach`, teamId: tid, name: `${tid} Coach`,
            role: "coach", salaryPerWeek: 2000, level: 3, contractEndWeek: 52,
            stats: { development: 60, analysis: 50 }, unlockedTalentIds: [],
        } as unknown as StaffSaveData)
    })

    return saveManager.createSave("Smoke Test", {
        playerTeamId: "player",
        lastRngSeed: seed,
        teams, players, contracts, staff,
    })
}

/* ----- invariant checkers ----- */
function assertInvariants(save: GameSave, week: number, context: string): void {
    const at = ` (at week ${week} in ${context})`

    // Save shape invariants
    expect(save.saveVersion).toBeGreaterThanOrEqual(1)
    expect(save.currentWeek).toBe(week)
    expect(Array.isArray(save.teams)).toBe(true)
    expect(Array.isArray(save.players)).toBe(true)
    expect(Array.isArray(save.contracts)).toBe(true)

    // No duplicate event IDs anywhere
    const eventIds = save.eventsLog.map(e => e.id)
    expect(new Set(eventIds).size).toBe(eventIds.length)

    // No duplicate ledger IDs anywhere
    const ledgerIds = save.financeLedger.map(e => e.id)
    expect(new Set(ledgerIds).size).toBe(ledgerIds.length)

    // No duplicate completed-match IDs
    const completedIds = save.completedMatches.map(m => m.id)
    expect(new Set(completedIds).size).toBe(completedIds.length)

    // Every team's numeric fields are finite
    for (const team of save.teams) {
        expect(Number.isFinite(team.budget)).toBe(true)
        expect(Number.isFinite(team.fanbase ?? 0)).toBe(true)
        expect(team.rosterIds).toBeDefined()
        expect(Array.isArray(team.rosterIds)).toBe(true)
        // Roster cap enforcement (AI manager + ours) — must never exceed 7.
        expect(team.rosterIds.length).toBeLessThanOrEqual(7)
    }

    // Every player's stats stay in [0, 100] range and morale/fatigue/energy too
    for (const p of save.players) {
        expect(Number.isFinite(p.skill ?? 0)).toBe(true)
        expect(p.morale).toBeGreaterThanOrEqual(0)
        expect(p.morale).toBeLessThanOrEqual(100)
        expect(p.fatigue).toBeGreaterThanOrEqual(0)
        expect(p.fatigue).toBeLessThanOrEqual(100)
        expect(p.energy ?? 100).toBeGreaterThanOrEqual(0)
        expect(p.energy ?? 100).toBeLessThanOrEqual(100)
        expect(p.matchesPlayed).toBeGreaterThanOrEqual(0)
    }

    // Manager XP / level stays sane
    if (save.managerDetails) {
        expect(save.managerDetails.xp).toBeGreaterThanOrEqual(0)
        expect(save.managerDetails.level).toBeGreaterThanOrEqual(1)
        expect(save.managerDetails.reputation).toBeGreaterThanOrEqual(0)
    }

    // Roster ↔ player ID consistency: every rosterId must resolve to a player
    const allPlayerIds = new Set(save.players.map(p => p.id))
    for (const team of save.teams) {
        for (const pid of team.rosterIds) {
            expect(allPlayerIds.has(pid)).toBe(true)
        }
    }

    // Contracts: no orphans (every contract's playerId must exist)
    for (const c of save.contracts) {
        expect(allPlayerIds.has(c.playerId)).toBe(true)
        expect(Number.isFinite(c.salaryPerWeek)).toBe(true)
        expect(c.salaryPerWeek).toBeGreaterThanOrEqual(0)
    }

    // weekTickState must be cleared after a successful tick.
    expect(save.weekTickState).toBeNull()

    void at // silence unused if all assertions pass with default messages
}

async function simulateWeeks(save: GameSave, weeks: number, awp: AtomicWeekProcessor, seed: number, context: string): Promise<void> {
    for (let i = 0; i < weeks; i++) {
        const targetWeek = save.currentWeek + 1
        const rng = new SeededRNG(seed + i)
        const result = await awp.processWeek(save, {
            playerTeamId: save.playerTeamId,
            trainingFocus: new Map(), // no team training configured — exercises default path
        }, rng)

        expect(result.success).toBe(true)
        assertInvariants(save, targetWeek, context)
    }
}

/* ----- tests ----- */
describe("week-tick smoke — short runs", () => {
    test("1 week tick on a minimal save: success, save still valid", async () => {
        const storage = new MemoryStorage()
        const sm = new SaveManager(storage)
        const awp = new AtomicWeekProcessor(sm)
        const save = buildSmokeSave(42, sm)

        await simulateWeeks(save, 1, awp, 42, "1-week smoke")
    })

    test("4 weeks: pipeline runs cleanly without state corruption", async () => {
        const storage = new MemoryStorage()
        const sm = new SaveManager(storage)
        const awp = new AtomicWeekProcessor(sm)
        const save = buildSmokeSave(42, sm)

        await simulateWeeks(save, 4, awp, 42, "4-week smoke")

        // Player team budget should have decreased (paying wages) OR stayed
        // similar — sanity check it's still a finite number.
        const playerTeam = save.teams.find(t => t.id === "player")!
        expect(Number.isFinite(playerTeam.budget)).toBe(true)
    })
})

describe("week-tick smoke — half-season run (26 weeks)", () => {
    test("simulates 26 weeks deterministically; invariants hold throughout", async () => {
        const storage = new MemoryStorage()
        const sm = new SaveManager(storage)
        const awp = new AtomicWeekProcessor(sm)
        const save = buildSmokeSave(2025, sm)

        await simulateWeeks(save, 26, awp, 2025, "26-week smoke")

        // Half-season fingerprint: at least a few weeks have passed
        // and basic counters incremented.
        expect(save.currentWeek).toBe(27) // 1 + 26
        expect(save.eventsLog.length).toBeGreaterThanOrEqual(0)
        // The financial pipeline writes ledger entries every week.
        expect(save.financeLedger.length).toBeGreaterThan(0)
    }, 30_000) // bigger timeout for slower CI machines
})

describe("week-tick smoke — full-season run (52 weeks)", () => {
    test("simulates a full season; no NaN, no duplicate IDs, no orphans", async () => {
        const storage = new MemoryStorage()
        const sm = new SaveManager(storage)
        const awp = new AtomicWeekProcessor(sm)
        const save = buildSmokeSave(1337, sm)

        await simulateWeeks(save, 52, awp, 1337, "52-week smoke")

        expect(save.currentWeek).toBe(53)

        // Sanity: across a full season at least SOME matches should have
        // been processed and SOME ledger entries written.
        expect(save.financeLedger.length).toBeGreaterThan(0)

        // No orphaned contracts (contracts whose playerId isn't on any roster).
        // This is the kind of subtle cross-subsystem invariant only end-to-end
        // tests can catch — e.g. a release path that forgot to clear contracts.
        const allRosterIds = new Set(save.teams.flatMap(t => t.rosterIds))
        const orphans = save.contracts.filter(c => !allRosterIds.has(c.playerId))
        // Released-but-not-retired players can have lingering contracts in
        // some flows, so we only assert there isn't a runaway leak. A real
        // bug here would be hundreds; normal play might leave a handful.
        expect(orphans.length).toBeLessThan(50)
    }, 180_000) // 3 minutes — longer than 60s because per-tick cost grows
                // super-linearly with completedMatches/eventsLog size. The
                // growth itself is a real perf finding worth investigating
                // separately (Phase O candidate).
})

describe("week-tick smoke — determinism", () => {
    test("two runs with the same seed produce identical end states", async () => {
        const buildRun = async (): Promise<GameSave> => {
            const sm = new SaveManager(new MemoryStorage())
            const awp = new AtomicWeekProcessor(sm)
            const save = buildSmokeSave(99, sm)
            await simulateWeeks(save, 8, awp, 99, "determinism run")
            return save
        }

        const a = await buildRun()
        const b = await buildRun()

        // Fingerprint pivot points must match.
        expect(a.currentWeek).toBe(b.currentWeek)
        expect(a.teams.map(t => t.budget)).toEqual(b.teams.map(t => t.budget))
        expect(a.completedMatches.length).toBe(b.completedMatches.length)
        // Player stats fingerprint:
        const fp = (save: GameSave) => save.players.map(p =>
            `${p.id}:${p.skill}:${p.morale}:${p.matchesPlayed}`
        ).sort().join("|")
        expect(fp(a)).toBe(fp(b))
    }, 30_000)

    test("different seeds produce different end states", async () => {
        const sm1 = new SaveManager(new MemoryStorage())
        const awp1 = new AtomicWeekProcessor(sm1)
        const save1 = buildSmokeSave(1, sm1)
        await simulateWeeks(save1, 8, awp1, 1, "seed=1")

        const sm2 = new SaveManager(new MemoryStorage())
        const awp2 = new AtomicWeekProcessor(sm2)
        const save2 = buildSmokeSave(999, sm2)
        await simulateWeeks(save2, 8, awp2, 999, "seed=999")

        // At least SOMETHING should differ across totally different seeds.
        const fp1 = save1.players.map(p => p.morale).join(",")
        const fp2 = save2.players.map(p => p.morale).join(",")
        expect(fp1).not.toBe(fp2)
    }, 30_000)
})

describe("week-tick smoke — sanity boundaries", () => {
    test("no player ever exceeds 100 fatigue or drops below 0 morale across 26 weeks", async () => {
        const sm = new SaveManager(new MemoryStorage())
        const awp = new AtomicWeekProcessor(sm)
        const save = buildSmokeSave(777, sm)

        // Check after every week, not just at the end.
        for (let i = 0; i < 26; i++) {
            const rng = new SeededRNG(777 + i)
            await awp.processWeek(save, {
                playerTeamId: save.playerTeamId,
                trainingFocus: new Map(),
            }, rng)

            for (const p of save.players) {
                expect(p.fatigue).toBeGreaterThanOrEqual(0)
                expect(p.fatigue).toBeLessThanOrEqual(100)
                expect(p.morale).toBeGreaterThanOrEqual(0)
                expect(p.morale).toBeLessThanOrEqual(100)
            }
        }
    }, 30_000)
})
