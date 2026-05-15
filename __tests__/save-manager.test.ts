import { SaveManager } from "@/engine/save-manager"
import { CURRENT_SAVE_VERSION, STORAGE_KEYS, type GameSave } from "@/engine/save-types"
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

function makeSave(overrides: Partial<GameSave> = {}): GameSave {
    const sm = new SaveManager(new MemoryStorage())
    const base = sm.createSave("Test Career", {
        teams: [{
            id: "team_a",
            name: "Team Alpha",
            shortName: "ALPHA",
            budget: 100_000,
            rosterIds: ["player_1"],
            trophies: [],
            facilities: [],
            sponsors: [],
            fanbase: 1000,
            playstyle: "default",
        } as any],
        players: [{
            id: "player_1",
            nickname: "Ace",
            firstName: "Alex",
            lastName: "Test",
            age: 22,
            nationality: "US",
            role: "RIFLER",
            attributes: {},
            personality: { confidence: 50, ego: 50, professionalism: 50, ambition: 50 },
            morale: 80,
            fatigue: 0,
            form: 75,
            xp: 0,
            level: 1,
        } as any],
        playerTeamId: "team_a",
        contracts: [{
            id: "c1",
            playerId: "player_1",
            teamId: "team_a",
            salaryPerWeek: 1000,
            startWeek: 1,
            endWeek: 52,
            buyout: 100_000,
        } as any],
    })
    return { ...base, ...overrides }
}

describe("SaveManager hardening", () => {
    test("atomic write leaves no .tmp staging file after a successful save", async () => {
        const storage = new MemoryStorage()
        const sm = new SaveManager(storage)
        const save = makeSave()

        const result = await sm.saveGame(save)
        expect(result.success).toBe(true)

        const primaryKey = STORAGE_KEYS.SAVE_PREFIX + save.saveId
        const tmpKey = primaryKey + ".tmp"
        expect(storage.store.has(primaryKey)).toBe(true)
        expect(storage.store.has(tmpKey)).toBe(false)
    })

    test("corrupted primary save loads with CORRUPTED errorCode (no backup available)", async () => {
        const storage = new MemoryStorage()
        const sm = new SaveManager(storage)
        const save = makeSave()
        await sm.saveGame(save)

        // Corrupt the primary save with garbage
        const primaryKey = STORAGE_KEYS.SAVE_PREFIX + save.saveId
        storage.store.set(primaryKey, "{not valid json")
        // Wipe all backups to isolate the corrupted-load path
        for (const suffix of ["_1", "_2", "_3", ""]) {
            storage.store.delete(STORAGE_KEYS.BACKUP_PREFIX + save.saveId + suffix)
        }

        const result = await sm.loadGame(save.saveId)
        expect(result.save).toBeNull()
        expect(result.errorCode).toBe("CORRUPTED")
    })

    test("corrupted primary recovers from backup when one is available", async () => {
        const storage = new MemoryStorage()
        const sm = new SaveManager(storage)
        const save = makeSave()

        // First save → primary only.
        await sm.saveGame(save)

        // Second save → previous primary becomes backup_1.
        await sm.saveGame({ ...save, currentWeek: 2 })

        // Corrupt the primary mid-write style: write garbage where a real
        // save would be after a kill -9 between staging and verification.
        const primaryKey = STORAGE_KEYS.SAVE_PREFIX + save.saveId
        storage.store.set(primaryKey, "{partial:")

        const result = await sm.loadGame(save.saveId)
        expect(result.save).not.toBeNull()
        expect(result.restoredFromBackup).toBe(true)
        // Recovered backup should be the v1 we saved first (currentWeek === 1)
        expect(result.save?.currentWeek).toBe(1)
    })

    test("attemptRecovery walks backups when the user opts in", async () => {
        const storage = new MemoryStorage()
        const sm = new SaveManager(storage)
        const save = makeSave()
        await sm.saveGame(save)
        await sm.saveGame({ ...save, currentWeek: 5 })

        // Wipe primary entirely (simulating a "the file is gone, what now" situation)
        const primaryKey = STORAGE_KEYS.SAVE_PREFIX + save.saveId
        storage.store.delete(primaryKey)

        const recovered = await sm.attemptRecovery(save.saveId)
        expect(recovered.save).not.toBeNull()
        expect(recovered.save?.currentWeek).toBe(1)
    })

    test("save with saveVersion higher than CURRENT_SAVE_VERSION returns NEWER_VERSION", async () => {
        const storage = new MemoryStorage()
        const sm = new SaveManager(storage)
        const save = makeSave()

        // Bump the version on disk to simulate a future-build save.
        await sm.saveGame(save)
        const primaryKey = STORAGE_KEYS.SAVE_PREFIX + save.saveId
        const raw = storage.store.get(primaryKey)!
        const parsed = JSON.parse(raw)
        parsed.saveVersion = CURRENT_SAVE_VERSION + 1
        // Rebuild without re-signing — verifyIntegrityHash will fail too, but
        // the schema version check fires first.
        storage.store.set(primaryKey, JSON.stringify(parsed))
        // Wipe backups so no recovery can mask the version error.
        for (const suffix of ["_1", "_2", "_3", ""]) {
            storage.store.delete(STORAGE_KEYS.BACKUP_PREFIX + save.saveId + suffix)
        }

        const result = await sm.loadGame(save.saveId)
        expect(result.save).toBeNull()
        expect(result.errorCode).toBe("NEWER_VERSION")
    })

    test("stale .tmp from interrupted write is cleaned up on next load", async () => {
        const storage = new MemoryStorage()
        const sm = new SaveManager(storage)
        const save = makeSave()
        await sm.saveGame(save)

        // Plant a stale .tmp as if a previous save was killed mid-commit.
        const primaryKey = STORAGE_KEYS.SAVE_PREFIX + save.saveId
        const tmpKey = primaryKey + ".tmp"
        storage.store.set(tmpKey, "{stale write}")

        const result = await sm.loadGame(save.saveId)
        expect(result.save).not.toBeNull()
        expect(storage.store.has(tmpKey)).toBe(false)
    })
})

describe("SaveManager migration ladder", () => {
    test("legacy save (no version) migrates all the way to CURRENT_SAVE_VERSION", () => {
        const sm = new SaveManager(new MemoryStorage())
        const legacy = {
            saveName: "Legacy",
            teams: [],
            players: [],
            currentWeek: 5,
        }

        const migrated = sm.migrateSave(legacy)
        expect(migrated.saveVersion).toBe(CURRENT_SAVE_VERSION)
        expect(migrated.currentWeek).toBe(5)
    })

    test("v1 save gains all required v2/v3/v4 arrays", () => {
        const sm = new SaveManager(new MemoryStorage())
        const v1 = {
            saveVersion: 1,
            saveName: "Old Career",
            teams: [{ id: "t1", name: "Test", rosterIds: [] } as any],
            players: [],
            financeLedger: [{ teamId: "t1" } as any],
            currentWeek: 10,
        }

        const migrated = sm.migrateSave(v1)
        // v2 fields
        expect(Array.isArray(migrated.scoutedPlayers)).toBe(true)
        expect(Array.isArray(migrated.tournamentQualifications)).toBe(true)
        // v3 fields
        expect(Array.isArray(migrated.marketStaff)).toBe(true)
        expect(Array.isArray(migrated.newsFeed)).toBe(true)
        expect(migrated.managerDetails).toBeDefined()
        // v3 recovers playerTeamId from financeLedger[0].teamId
        expect(migrated.playerTeamId).toBe("t1")
        // v4 fields
        expect(Array.isArray(migrated.academyPlayers)).toBe(true)
        expect(Array.isArray(migrated.academyScoutingMissions)).toBe(true)
        expect(migrated.academyRoster).toBeDefined()
        expect(migrated.saveVersion).toBe(CURRENT_SAVE_VERSION)
    })

    test("v3 save with no playerTeamId and no financeLedger falls back to first team id", () => {
        const sm = new SaveManager(new MemoryStorage())
        const v2 = {
            saveVersion: 2,
            saveName: "Recovered",
            teams: [{ id: "first_team", name: "First", rosterIds: [] } as any],
            players: [],
            financeLedger: [],
        }

        const migrated = sm.migrateSave(v2)
        expect(migrated.playerTeamId).toBe("first_team")
    })

    test("current-version save is not mutated by the migration ladder", () => {
        const sm = new SaveManager(new MemoryStorage())
        const fresh = sm.createSave("Fresh", {
            teams: [{
                id: "t1", name: "T1", rosterIds: [], trophies: [], facilities: [], sponsors: [], fanbase: 0, playstyle: "",
            } as any],
            playerTeamId: "t1",
        })
        // Tag a sentinel to detect accidental clobbering by older migration steps.
        ;(fresh as any).__sentinel = "untouched"

        const migrated = sm.migrateSave(fresh)
        expect(migrated.saveVersion).toBe(CURRENT_SAVE_VERSION)
        expect((migrated as any).__sentinel).toBe("untouched")
    })

    test("v4 → v5 deduplicates tournaments that share series + season", () => {
        // Pre-v5, the same tournament could appear twice with different
        // surrogate ids (e.g. seeded from a snapshot AND scheduled by the
        // tournament generator). v5 canonicalises one per series/season
        // pair and remaps trophies / matches to the canonical id.
        const sm = new SaveManager(new MemoryStorage())
        const v4 = {
            saveVersion: 4,
            saveName: "Dup Tourneys",
            currentWeek: 30,
            teams: [{
                id: "t1", name: "T1", rosterIds: [], facilities: [], sponsors: [], fanbase: 0,
                trophies: [
                    // References the duplicate (non-canonical) id.
                    { tournamentId: "iem_katowice_dup", tournamentName: "IEM Katowice", tier: "S_TIER", week: 10 },
                ],
            }],
            players: [],
            financeLedger: [],
            playerTeamId: "t1",
            scheduledMatches: [
                { id: "m1", homeTeamId: "t1", awayTeamId: "t2", tournamentId: "iem_katowice_dup", week: 12 },
            ],
            completedMatches: [
                { id: "m2", homeTeamId: "t1", awayTeamId: "t2", tournamentId: "iem_katowice_dup", week: 10 },
            ],
            tournaments: [
                // Canonical: completed, has bracket, has teams.
                {
                    id: "iem_katowice_s1", seriesId: "iem_katowice", seasonNumber: 1,
                    instanceId: "iem_katowice_s1", startWeek: 8, isCompleted: true,
                    winnerId: "t1", playoffBracket: [{ a: "t1", b: "t2" }],
                    teamIds: ["t1", "t2"], standings: [{ teamId: "t1", points: 9 }],
                },
                // Duplicate: same series/season but empty shell.
                {
                    id: "iem_katowice_dup", seriesId: "iem_katowice", seasonNumber: 1,
                    instanceId: "iem_katowice_s1", startWeek: 8, isCompleted: false,
                    playoffBracket: [], teamIds: [], standings: [],
                },
            ],
        }

        const migrated = sm.migrateSave(v4) as any
        // Exactly one tournament survives the dedup.
        const ikRows = migrated.tournaments.filter(
            (t: any) => t.seriesId === "iem_katowice" && t.seasonNumber === 1
        )
        expect(ikRows.length).toBe(1)
        // The richer row wins (completed + bracket + teams beats empty shell).
        expect(ikRows[0].id).toBe("iem_katowice_s1")
        expect(ikRows[0].isCompleted).toBe(true)
        expect(ikRows[0].winnerId).toBe("t1")
        // Trophy gets remapped to the canonical id (was pointing at _dup).
        expect(migrated.teams[0].trophies[0].tournamentId).toBe("iem_katowice_s1")
        // Match records get remapped too.
        expect(migrated.scheduledMatches[0].tournamentId).toBe("iem_katowice_s1")
        expect(migrated.completedMatches[0].tournamentId).toBe("iem_katowice_s1")
    })

    test("v4 → v5 fills missing currentDay + timeMode with sensible defaults", () => {
        // Pre-v5 saves predated the daily/hybrid time mode. v5 must
        // populate currentDay + timeMode so downstream code (which
        // assumes both exist) doesn't crash.
        const sm = new SaveManager(new MemoryStorage())
        const v4 = {
            saveVersion: 4,
            saveName: "Pre-Daily",
            currentWeek: 5,
            teams: [{ id: "t1", name: "T1", rosterIds: [], facilities: [], sponsors: [], fanbase: 0 }],
            players: [],
            financeLedger: [],
            playerTeamId: "t1",
            tournaments: [],
            scheduledMatches: [],
            completedMatches: [],
            // No currentDay, no timeMode.
        }
        const migrated = sm.migrateSave(v4) as any
        expect(migrated.timeMode).toBe("WEEKLY")
        // WEEKLY default lands at end-of-week (6) so an immediate
        // advance doesn't fast-forward through a partial week.
        expect(migrated.currentDay).toBe(6)
    })

    test("v5 → v6 is a pure version bump (no schema change)", () => {
        // v6 adds only optional fields (fplData, careerStats, gameOverReason,
        // gameOverWeek) so the migration is intentionally a no-op aside
        // from the version stamp. Lock that contract.
        const sm = new SaveManager(new MemoryStorage())
        const v5 = {
            saveVersion: 5,
            saveName: "V5 Save",
            currentWeek: 60,
            currentDay: 6,
            timeMode: "WEEKLY",
            teams: [{ id: "t1", name: "T1", rosterIds: [], facilities: [], sponsors: [], fanbase: 0 }],
            players: [],
            financeLedger: [],
            playerTeamId: "t1",
            tournaments: [],
            scheduledMatches: [],
            completedMatches: [],
        }
        const migrated = sm.migrateSave(v5) as any
        expect(migrated.saveVersion).toBe(CURRENT_SAVE_VERSION)
        // No-op contract: every input field flows through untouched.
        expect(migrated.currentWeek).toBe(60)
        expect(migrated.currentDay).toBe(6)
        expect(migrated.timeMode).toBe("WEEKLY")
        expect(migrated.teams[0].id).toBe("t1")
    })

    test("full v1 → v6 ladder runs without losing data on a realistic legacy save", () => {
        // End-to-end ladder coverage — a v1 save with the minimum
        // surface area must survive every step and still hold its
        // identifying fields at the top.
        const sm = new SaveManager(new MemoryStorage())
        const v1 = {
            saveVersion: 1,
            saveName: "Old Legacy",
            currentWeek: 40,
            teams: [{
                id: "old_team", name: "Old Team", rosterIds: ["pX"],
                facilities: [], sponsors: [], fanbase: 1000,
                trophies: [{ tournamentId: "fake_t", tournamentName: "Fake", tier: "B_TIER", week: 10 }],
            }],
            players: [{ id: "pX", nickname: "X", role: "RIFLER", skill: 70 }],
            financeLedger: [{ teamId: "old_team", type: "INCOME", amount: 1000 }],
            tournaments: [],
        }
        const migrated = sm.migrateSave(v1) as any
        expect(migrated.saveVersion).toBe(CURRENT_SAVE_VERSION)
        // Identifying state preserved
        expect(migrated.saveName).toBe("Old Legacy")
        expect(migrated.currentWeek).toBe(40)
        expect(migrated.teams[0].id).toBe("old_team")
        expect(migrated.players[0].id).toBe("pX")
        // v3 recovers playerTeamId from financeLedger[0].teamId
        expect(migrated.playerTeamId).toBe("old_team")
        // v5 populated time fields
        expect(migrated.timeMode).toBe("WEEKLY")
        // v4 array fields exist
        expect(Array.isArray(migrated.academyPlayers)).toBe(true)
    })
})
