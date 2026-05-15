/**
 * Regression coverage for post-tick achievement detection.
 *
 * `evaluatePostTickAchievements` reads the save and calls
 * `checkAchievements` with computed flags. Several detection
 * predicates have been silently broken in the past — REDEMPTION
 * relied on `(m as any).tournamentTier` which is never written
 * onto a CompletedMatchSaveData, so the achievement could NEVER
 * fire. These tests pin the detection contracts so future field
 * renames or hot-path edits don't silently break them again.
 *
 * Steam-side `service.unlockAchievement` is stubbed via the
 * singleton's electron bridge being unset — calls become no-ops
 * but the internal `unlockedAchievements` Set still records them.
 */

import { evaluatePostTickAchievements } from "@/engine/processors/post-tick-achievements"
import { SteamService, steamService } from "@/engine/steam-service"
import type {
    GameSave, TeamSaveData, PlayerSaveData,
    CompletedMatchSaveData, TournamentSaveData,
} from "@/engine/save-types"

function makePlayer(id: string): PlayerSaveData {
    return {
        id, nickname: id, firstName: id, lastName: "P",
        age: 22, nationality: "US", role: "RIFLER",
        rifle: 60, awp: 50, pistol: 60, grenades: 55, creativity: 55, clutch: 55,
        tactic: 55, leader: 50, teamwork: 55, reaction: 60, eyesight: 60,
        morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        skill: 60, potential: 80,
        productivity: 60, endurance: 70,
    } as unknown as PlayerSaveData
}

function makeMatch(opts: {
    id: string
    week: number
    home: string
    away: string
    homeScore: number
    awayScore: number
    tournamentId?: string
    stage?: string
    flags?: { comebackWin?: boolean; underdogWin?: boolean }
}): CompletedMatchSaveData {
    const cm: CompletedMatchSaveData = {
        id: opts.id,
        homeTeamId: opts.home, awayTeamId: opts.away,
        tournamentId: opts.tournamentId ?? "SCRIM",
        stage: opts.stage ?? "Group Stage",
        week: opts.week, day: 5,
        format: "BO3", seed: 1,
        result: {
            homeScore: opts.homeScore, awayScore: opts.awayScore,
            maps: [],
            playerStats: {},
            winnerId: opts.homeScore > opts.awayScore ? opts.home : opts.away,
            mvpPlayerId: "",
        },
    } as unknown as CompletedMatchSaveData
    if (opts.flags?.comebackWin) (cm as any)._comebackWin = true
    if (opts.flags?.underdogWin) (cm as any)._underdogWin = true
    return cm
}

function makeTeam(id: string, overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(),
        budget: 100_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1,
        ...overrides,
    } as unknown as TeamSaveData
}

function makeSave(overrides: Partial<GameSave> = {}): GameSave {
    return {
        saveVersion: 6, saveId: "test", saveName: "test",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        currentWeek: 60, currentDay: 6, timeMode: "WEEKLY",
        gameStartDate: new Date().toISOString(),
        managerDetails: {} as any,
        lastRngSeed: 1, playerTeamId: "player",
        teams: [makeTeam("player", { rosterIds: ["p1"], lastRosterChangeWeek: 1 })],
        players: [makePlayer("p1")],
        contracts: [], staff: [],
        tournaments: [], scheduledMatches: [], completedMatches: [],
        scheduledActivities: [], financeLedger: [], eventsLog: [], newsFeed: [],
        acknowledgedEventIds: [], hallOfFame: [], legendaryPlayers: [],
        weekTickState: null,
        ...overrides,
    } as unknown as GameSave
}

/**
 * Snapshot which achievement IDs the SteamService has unlocked.
 * Resets the cache around each test so cases don't bleed.
 *
 * Also force-pins the service into a "fully initialized stub" state
 * so unlockAchievement runs synchronously (no `await initialize()`
 * microtask break before the unlockedAchievements.add lands). Without
 * this, `checkAchievements` is fire-and-forget and the post-call
 * snapshot reads stale state.
 */
function snapshotUnlocks(): { unlocked: Set<string>; restore: () => void } {
    const svc = SteamService.getInstance() as any
    const previous: Set<string> = new Set(svc.unlockedAchievements)
    const prevInit = svc.isInitialized
    const prevBridge = svc.electronBridge
    svc.unlockedAchievements = new Set<string>()
    svc.isInitialized = true
    svc.electronBridge = null // stub mode — synchronous unlock path
    return {
        unlocked: svc.unlockedAchievements as Set<string>,
        restore: () => {
            svc.unlockedAchievements = previous
            svc.isInitialized = prevInit
            svc.electronBridge = prevBridge
        },
    }
}

describe("evaluatePostTickAchievements — REDEMPTION", () => {
    test("won S_TIER this season after losing S_TIER Grand Final prior year → REDEMPTION fires", () => {
        const snap = snapshotUnlocks()
        try {
            const save = makeSave({
                currentWeek: 60, // mid season 2 (53-104)
                tournaments: [{
                    id: "iem_dallas_s1",
                    name: "Dallas Masters",
                    tier: "S_TIER",
                } as TournamentSaveData],
                teams: [makeTeam("player", {
                    rosterIds: ["p1"],
                    trophies: [{
                        // Won S_TIER in current season (week 55, after seasonStart=53).
                        tournamentId: "iem_dallas_s2", tournamentName: "Dallas Masters",
                        week: 55, tier: "S_TIER",
                    }],
                })],
                completedMatches: [
                    // Prior-season S_TIER Grand Final loss (week 30 is in season 1: 1-52).
                    makeMatch({
                        id: "m_loss", week: 30,
                        home: "player", away: "ai_winner",
                        homeScore: 14, awayScore: 16,
                        tournamentId: "iem_dallas_s1",
                        stage: "Grand Final",
                    }),
                ],
            })

            evaluatePostTickAchievements(save)
            expect(snap.unlocked.has("REDEMPTION")).toBe(true)
        } finally {
            snap.restore()
        }
    })

    test("won S_TIER without prior-year loss → REDEMPTION does NOT fire", () => {
        const snap = snapshotUnlocks()
        try {
            const save = makeSave({
                currentWeek: 60,
                tournaments: [{ id: "iem_dallas_s2", name: "Dallas", tier: "S_TIER" } as TournamentSaveData],
                teams: [makeTeam("player", {
                    rosterIds: ["p1"],
                    trophies: [{ tournamentId: "iem_dallas_s2", tournamentName: "Dallas", week: 55, tier: "S_TIER" }],
                })],
                completedMatches: [],
            })

            evaluatePostTickAchievements(save)
            expect(snap.unlocked.has("REDEMPTION")).toBe(false)
        } finally {
            snap.restore()
        }
    })

    test("lost A_TIER Grand Final prior year → REDEMPTION does NOT fire (must be S_TIER)", () => {
        const snap = snapshotUnlocks()
        try {
            const save = makeSave({
                currentWeek: 60,
                tournaments: [
                    { id: "iem_dallas_s1", name: "Dallas", tier: "A_TIER" } as TournamentSaveData,
                    { id: "iem_dallas_s2", name: "Dallas", tier: "S_TIER" } as TournamentSaveData,
                ],
                teams: [makeTeam("player", {
                    rosterIds: ["p1"],
                    trophies: [{ tournamentId: "iem_dallas_s2", tournamentName: "Dallas", week: 55, tier: "S_TIER" }],
                })],
                completedMatches: [
                    makeMatch({
                        id: "m_loss", week: 30,
                        home: "player", away: "ai_winner",
                        homeScore: 14, awayScore: 16,
                        tournamentId: "iem_dallas_s1", // A_TIER
                        stage: "Grand Final",
                    }),
                ],
            })

            evaluatePostTickAchievements(save)
            expect(snap.unlocked.has("REDEMPTION")).toBe(false)
        } finally {
            snap.restore()
        }
    })

    test("lost a semifinal (not Grand Final) prior year → REDEMPTION does NOT fire", () => {
        const snap = snapshotUnlocks()
        try {
            const save = makeSave({
                currentWeek: 60,
                tournaments: [{ id: "iem_dallas_s2", name: "Dallas", tier: "S_TIER" } as TournamentSaveData],
                teams: [makeTeam("player", {
                    rosterIds: ["p1"],
                    trophies: [{ tournamentId: "iem_dallas_s2", tournamentName: "Dallas", week: 55, tier: "S_TIER" }],
                })],
                completedMatches: [
                    makeMatch({
                        id: "m_loss", week: 30,
                        home: "player", away: "ai_winner",
                        homeScore: 1, awayScore: 2,
                        tournamentId: "iem_dallas_s1",
                        stage: "Semifinal", // not Grand Final
                    }),
                ],
            })

            evaluatePostTickAchievements(save)
            expect(snap.unlocked.has("REDEMPTION")).toBe(false)
        } finally {
            snap.restore()
        }
    })
})

describe("evaluatePostTickAchievements — UNLUCKY (14-16 Grand Final loss)", () => {
    test("14-16 Grand Final loss this week → UNLUCKY fires", () => {
        const snap = snapshotUnlocks()
        try {
            const save = makeSave({
                currentWeek: 10,
                completedMatches: [
                    makeMatch({
                        id: "m_unlucky", week: 10,
                        home: "player", away: "ai_winner",
                        homeScore: 14, awayScore: 16,
                        stage: "Grand Final",
                    }),
                ],
            })

            evaluatePostTickAchievements(save)
            expect(snap.unlocked.has("UNLUCKY")).toBe(true)
        } finally {
            snap.restore()
        }
    })

    test("15-16 loss (not 14-16) → UNLUCKY does NOT fire", () => {
        const snap = snapshotUnlocks()
        try {
            const save = makeSave({
                currentWeek: 10,
                completedMatches: [
                    makeMatch({
                        id: "m", week: 10,
                        home: "player", away: "ai",
                        homeScore: 15, awayScore: 16,
                        stage: "Grand Final",
                    }),
                ],
            })

            evaluatePostTickAchievements(save)
            expect(snap.unlocked.has("UNLUCKY")).toBe(false)
        } finally {
            snap.restore()
        }
    })

    test("14-16 in a Semifinal (not Grand Final) → UNLUCKY does NOT fire", () => {
        const snap = snapshotUnlocks()
        try {
            const save = makeSave({
                currentWeek: 10,
                completedMatches: [
                    makeMatch({
                        id: "m", week: 10,
                        home: "player", away: "ai",
                        homeScore: 14, awayScore: 16,
                        stage: "Semifinal",
                    }),
                ],
            })

            evaluatePostTickAchievements(save)
            expect(snap.unlocked.has("UNLUCKY")).toBe(false)
        } finally {
            snap.restore()
        }
    })
})

describe("evaluatePostTickAchievements — COMEBACK + UNDERDOG flag propagation", () => {
    test("_comebackWin flag on this-week match → COMEBACK_KING fires", () => {
        const snap = snapshotUnlocks()
        try {
            const save = makeSave({
                currentWeek: 10,
                completedMatches: [
                    makeMatch({
                        id: "m", week: 10, home: "player", away: "ai",
                        homeScore: 2, awayScore: 1,
                        flags: { comebackWin: true },
                    }),
                ],
            })

            evaluatePostTickAchievements(save)
            expect(snap.unlocked.has("COMEBACK_KING")).toBe(true)
        } finally {
            snap.restore()
        }
    })

    test("_underdogWin flag on this-week match → UNDERDOG fires", () => {
        const snap = snapshotUnlocks()
        try {
            const save = makeSave({
                currentWeek: 10,
                completedMatches: [
                    makeMatch({
                        id: "m", week: 10, home: "player", away: "ai",
                        homeScore: 2, awayScore: 1,
                        flags: { underdogWin: true },
                    }),
                ],
            })

            evaluatePostTickAchievements(save)
            expect(snap.unlocked.has("UNDERDOG")).toBe(true)
        } finally {
            snap.restore()
        }
    })

    test("comeback flag on a DIFFERENT week's match → COMEBACK_KING does NOT fire this tick", () => {
        const snap = snapshotUnlocks()
        try {
            const save = makeSave({
                currentWeek: 10,
                completedMatches: [
                    // From last week — should be ignored by thisWeekMatches filter.
                    makeMatch({
                        id: "m_old", week: 9, home: "player", away: "ai",
                        homeScore: 2, awayScore: 1,
                        flags: { comebackWin: true },
                    }),
                ],
            })

            evaluatePostTickAchievements(save)
            expect(snap.unlocked.has("COMEBACK_KING")).toBe(false)
        } finally {
            snap.restore()
        }
    })
})

describe("evaluatePostTickAchievements — milestone gates", () => {
    test("SEASON_COMPLETE fires exactly at week % 52 === 0", () => {
        const snap = snapshotUnlocks()
        try {
            // Week 52 = end of season 1.
            evaluatePostTickAchievements(makeSave({ currentWeek: 52 }))
            expect(snap.unlocked.has("SEASON_COMPLETE")).toBe(true)
        } finally {
            snap.restore()
        }
    })

    test("SEASON_COMPLETE does NOT fire mid-season", () => {
        const snap = snapshotUnlocks()
        try {
            evaluatePostTickAchievements(makeSave({ currentWeek: 51 }))
            expect(snap.unlocked.has("SEASON_COMPLETE")).toBe(false)
        } finally {
            snap.restore()
        }
    })

    test("save with no player team → no crash, no achievements", () => {
        const snap = snapshotUnlocks()
        try {
            const save = makeSave({ teams: [makeTeam("other")], playerTeamId: "missing" } as any)
            expect(() => evaluatePostTickAchievements(save)).not.toThrow()
            expect(snap.unlocked.size).toBe(0)
        } finally {
            snap.restore()
        }
    })
})

describe("steamService singleton", () => {
    test("unlockAchievement skips when in stub mode (no electron bridge) and dedupes", async () => {
        const snap = snapshotUnlocks()
        try {
            // Force the service into stub mode for this test.
            const svc = steamService as any
            const prevInit = svc.isInitialized
            const prevBridge = svc.electronBridge
            svc.isInitialized = true
            svc.electronBridge = null

            try {
                const first = await steamService.unlockAchievement("FIRST_WIN")
                const second = await steamService.unlockAchievement("FIRST_WIN")
                expect(first).toBe(true)
                expect(second).toBe(true)
                expect(snap.unlocked.has("FIRST_WIN")).toBe(true)
                // No duplicate side-effect.
                expect(Array.from(snap.unlocked).filter(x => x === "FIRST_WIN").length).toBe(1)
            } finally {
                svc.isInitialized = prevInit
                svc.electronBridge = prevBridge
            }
        } finally {
            snap.restore()
        }
    })

    test("unlockAchievement rejects unknown IDs", async () => {
        const svc = steamService as any
        const prevInit = svc.isInitialized
        svc.isInitialized = true

        try {
            const result = await steamService.unlockAchievement("DOES_NOT_EXIST")
            expect(result).toBe(false)
        } finally {
            svc.isInitialized = prevInit
        }
    })
})
