/**
 * Tests for pre-tick mutations applied at the very start of advanceWeek.
 *
 * Four sub-phases run on every tick:
 *   1. Scouting completion (mission completed → mark scouted + event)
 *   2. Staff-market rotation every 4-8 weeks
 *   3. Staff XP gain (50-100 per tick) + level-up
 *   4. Player XP gain (40-80 per tick) + level-up + potential
 *      breakthrough roll (with the right coach talent)
 *
 * Each sub-phase has its own pin in this suite — a future refactor
 * that drops one silently won't pass.
 */

import { applyPreTickMutations } from "@/engine/processors/pre-tick-mutations"
import { SeededRNG } from "@/engine/rng"
import type { GameSave, PlayerSaveData, StaffSaveData, TeamSaveData } from "@/engine/save-types"

function nextId(_state: unknown, prefix: string, ...parts: Array<string | number | null | undefined>): string {
    return [prefix, ...parts.filter(Boolean)].join("_")
}

function makePlayer(id: string, overrides: Partial<PlayerSaveData> = {}): PlayerSaveData {
    return {
        id, nickname: id, firstName: id, lastName: "P",
        age: 22, nationality: "US", role: "RIFLER",
        rifle: 70, awp: 60, pistol: 65, grenades: 60, creativity: 60,
        clutch: 60, tactic: 60, leader: 55, teamwork: 65,
        reaction: 70, eyesight: 70,
        morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        skill: 70, potential: 85, productivity: 60, endurance: 70,
        ...overrides,
    } as unknown as PlayerSaveData
}

function makeStaff(id: string, overrides: Partial<StaffSaveData> = {}): StaffSaveData {
    return {
        id, name: id, role: "coach", teamId: "player",
        level: 1, xp: 0, xpToNextLevel: 1000, talentPoints: 0,
        unlockedTalentIds: [], salaryPerWeek: 1000, contractEndWeek: 100,
        stats: { development: 60, analysis: 50 },
        ...overrides,
    } as unknown as StaffSaveData
}

function makeTeam(id: string, rosterIds: string[]): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(),
        budget: 1_000_000, rosterIds, staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1, leagueTier: "B_TIER",
        elo: 1500, recentForm: [],
    } as unknown as TeamSaveData
}

function makeDraft(overrides: Partial<GameSave> = {}): GameSave {
    return {
        currentWeek: 10,
        playerTeamId: "player",
        teams: [makeTeam("player", ["p1"])],
        players: [makePlayer("p1")],
        contracts: [],
        staff: [],
        marketStaff: [],
        scheduledMatches: [],
        completedMatches: [],
        scheduledActivities: [],
        financeLedger: [],
        eventsLog: [],
        newsFeed: [],
        tournaments: [],
        tournamentQualifications: [],
        scoutedPlayers: [],
        academyPlayers: [],
        lastRngSeed: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    } as unknown as GameSave
}

describe("applyPreTickMutations — scouting completion", () => {
    test("active mission past completionWeek marks the player as scouted + logs SCOUTING_COMPLETE", () => {
        const draft = makeDraft({
            currentWeek: 10,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            activeScoutingMission: { playerId: "p1", completionWeek: 10 } as any,
        })
        applyPreTickMutations(draft, {
            playerTeamId: "player", currentWeek: 10, rng: new SeededRNG(1), nextId,
        })
        expect(draft.activeScoutingMission).toBeUndefined()
        expect(draft.scoutedPlayers.length).toBe(1)
        expect(draft.scoutedPlayers[0].playerId).toBe("p1")
        expect(draft.scoutedPlayers[0].scoutLevel).toBe("EXPERT")
        const evt = draft.eventsLog.find(e => e.id.startsWith("evt_scout_complete"))
        expect(evt).toBeDefined()
    })

    test("scouted player who vanished from save.players produces a 'mission failed' event instead", () => {
        const draft = makeDraft({
            currentWeek: 10,
            players: [], // no player records
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            activeScoutingMission: { playerId: "ghost", completionWeek: 10 } as any,
        })
        applyPreTickMutations(draft, {
            playerTeamId: "player", currentWeek: 10, rng: new SeededRNG(1), nextId,
        })
        expect(draft.activeScoutingMission).toBeUndefined()
        expect(draft.scoutedPlayers.length).toBe(0)
        const evt = draft.eventsLog.find(e => e.id.startsWith("evt_scout_failed"))
        expect(evt).toBeDefined()
    })

    test("mission not yet complete (completionWeek in future) is left alone", () => {
        const draft = makeDraft({
            currentWeek: 5,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            activeScoutingMission: { playerId: "p1", completionWeek: 10 } as any,
        })
        applyPreTickMutations(draft, {
            playerTeamId: "player", currentWeek: 5, rng: new SeededRNG(1), nextId,
        })
        expect(draft.activeScoutingMission).toBeDefined()
        expect(draft.scoutedPlayers.length).toBe(0)
    })

    test("duplicate-scout guard: alreadyScouted record is not double-added", () => {
        const draft = makeDraft({
            currentWeek: 10,
            scoutedPlayers: [{ playerId: "p1", scoutedWeek: 5, scoutLevel: "EXPERT" } as never],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            activeScoutingMission: { playerId: "p1", completionWeek: 10 } as any,
        })
        applyPreTickMutations(draft, {
            playerTeamId: "player", currentWeek: 10, rng: new SeededRNG(1), nextId,
        })
        expect(draft.scoutedPlayers.length).toBe(1)
    })
})

describe("applyPreTickMutations — staff market rotation", () => {
    test("first tick with no nextMarketRefreshWeek sets it 4 weeks out", () => {
        const draft = makeDraft({ currentWeek: 5 })
        applyPreTickMutations(draft, {
            playerTeamId: "player", currentWeek: 5, rng: new SeededRNG(1), nextId,
        })
        expect(draft.nextMarketRefreshWeek).toBe(9)
    })

    test("when current week >= refresh week, rotation fires and schedules next 4-8 weeks out", () => {
        const draft = makeDraft({ currentWeek: 9, nextMarketRefreshWeek: 9 })
        applyPreTickMutations(draft, {
            playerTeamId: "player", currentWeek: 9, rng: new SeededRNG(99), nextId,
        })
        expect(draft.nextMarketRefreshWeek).toBeGreaterThanOrEqual(9 + 4)
        expect(draft.nextMarketRefreshWeek).toBeLessThanOrEqual(9 + 8)
    })

    test("before refresh week, rotation is skipped", () => {
        const draft = makeDraft({ currentWeek: 7, nextMarketRefreshWeek: 9 })
        applyPreTickMutations(draft, {
            playerTeamId: "player", currentWeek: 7, rng: new SeededRNG(1), nextId,
        })
        expect(draft.nextMarketRefreshWeek).toBe(9) // unchanged
    })
})

describe("applyPreTickMutations — staff XP", () => {
    test("only player-team staff gain XP", () => {
        const draft = makeDraft({
            staff: [
                makeStaff("s_player", { teamId: "player", xp: 0 }),
                makeStaff("s_other", { teamId: "rival", xp: 0 }),
            ],
        })
        applyPreTickMutations(draft, {
            playerTeamId: "player", currentWeek: 10, rng: new SeededRNG(42), nextId,
        })
        expect(draft.staff[0].xp).toBeGreaterThan(0)
        expect(draft.staff[1].xp).toBe(0)
    })

    test("staff XP gain is in [50, 99] range per tick", () => {
        const draft = makeDraft({
            staff: [makeStaff("s_player", { teamId: "player", xp: 0 })],
        })
        applyPreTickMutations(draft, {
            playerTeamId: "player", currentWeek: 10, rng: new SeededRNG(123), nextId,
        })
        expect(draft.staff[0].xp).toBeGreaterThanOrEqual(50)
        expect(draft.staff[0].xp).toBeLessThan(100)
    })

    test("staff XP crossing xpToNextLevel triggers level-up + talent point + 1.5x cap", () => {
        const draft = makeDraft({
            staff: [makeStaff("s_player", {
                teamId: "player", xp: 990, xpToNextLevel: 1000, level: 3, talentPoints: 0,
            })],
        })
        applyPreTickMutations(draft, {
            playerTeamId: "player", currentWeek: 10, rng: new SeededRNG(1), nextId,
        })
        // After +50..99 xp, total ≥ 1040, leveled up.
        expect(draft.staff[0].level).toBe(4)
        expect(draft.staff[0].talentPoints).toBe(1)
        expect(draft.staff[0].xpToNextLevel).toBe(1500) // 1000 * 1.5
        const evt = draft.eventsLog.find(e => e.id.startsWith("evt_staff_levelup"))
        expect(evt).toBeDefined()
    })
})

describe("applyPreTickMutations — player XP + potential breakthrough", () => {
    test("only player-team roster players gain XP", () => {
        const draft = makeDraft({
            teams: [makeTeam("player", ["p1"]), makeTeam("rival", ["p2"])],
            players: [makePlayer("p1"), makePlayer("p2")],
        })
        applyPreTickMutations(draft, {
            playerTeamId: "player", currentWeek: 10, rng: new SeededRNG(7), nextId,
        })
        expect(draft.players[0].xp).toBeGreaterThan(0) // p1 on player team
        expect(draft.players[1].xp).toBe(0)            // p2 on rival team
    })

    test("player XP gain is in [40, 79] range per tick", () => {
        const draft = makeDraft()
        applyPreTickMutations(draft, {
            playerTeamId: "player", currentWeek: 10, rng: new SeededRNG(99), nextId,
        })
        expect(draft.players[0].xp).toBeGreaterThanOrEqual(40)
        expect(draft.players[0].xp).toBeLessThan(80)
    })

    test("player level-up fires PLAYER_LEVEL_UP event when xp crosses cap", () => {
        const draft = makeDraft({
            players: [makePlayer("p1", { xp: 990, xpToNextLevel: 1000, level: 5 })],
        })
        applyPreTickMutations(draft, {
            playerTeamId: "player", currentWeek: 10, rng: new SeededRNG(1), nextId,
        })
        expect(draft.players[0].level).toBe(6)
        expect(draft.players[0].xpToNextLevel).toBe(1500)
        const evt = draft.eventsLog.find(e => e.id.startsWith("evt_player_levelup"))
        expect(evt).toBeDefined()
    })

    test("without a coach with potential_breakthrough talent, potential is NEVER bumped", () => {
        const draft = makeDraft({
            players: [makePlayer("p1", { xp: 990, xpToNextLevel: 1000, level: 5, potential: 80 })],
            staff: [], // no breakthrough coach
        })
        applyPreTickMutations(draft, {
            playerTeamId: "player", currentWeek: 10, rng: new SeededRNG(1), nextId,
        })
        // Potential unchanged even on level-up.
        expect(draft.players[0].potential).toBe(80)
    })
})
