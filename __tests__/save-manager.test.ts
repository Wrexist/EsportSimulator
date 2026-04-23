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
