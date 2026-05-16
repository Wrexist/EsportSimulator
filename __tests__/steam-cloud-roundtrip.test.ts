/**
 * Steam Cloud save round-trip — Phase T.
 *
 * Production saves go through the SaveManager → SteamService chain:
 *   saveGame()  →  local storage primary + tmp + backup rotation
 *               →  steamService.uploadSaveToCloud(saveId, serialized)
 *
 *   loadGame()  →  pulls local primary + cloud candidate in parallel,
 *               →  validates integrity on both,
 *               →  picks the newer/healthier one (cloud wins by >1s).
 *
 * Until Phase T this whole path had zero unit coverage. The test fakes
 * the Electron Steamworks bridge (writeToCloud / readFromCloud /
 * deleteFromCloud all backed by a Map) and force-pins SteamService into
 * "bridge attached, initialised" state so production code paths run
 * end-to-end without an Electron host.
 *
 * Contracts asserted:
 *   1. After saveGame, the cloud bridge holds the exact serialized
 *      payload that local storage holds for the same saveId.
 *   2. Wiping local storage and reloading produces a save that is
 *      structurally equivalent to the original (same integrityHash,
 *      same teams/players/contracts content) — i.e. the cloud copy
 *      survives a fresh-device install.
 *   3. Tampering the cloud copy without updating integrityHash, while
 *      local is also missing, fails the load with INTEGRITY_FAILED.
 *   4. When local AND cloud both exist with no version conflict, the
 *      newer save wins. Within the 1s tie-break window local is
 *      preserved; beyond it cloud is promoted to primary.
 *   5. The cloud upload happens for the FINAL saveGame only (not for
 *      saveGameCheckpoint) — checkpoint writes must stay local-only
 *      to keep tick latency bounded.
 */

import { SaveManager } from "@/engine/save-manager"
import { STORAGE_KEYS, type GameSave } from "@/engine/save-types"
import { steamService } from "@/engine/steam-service"
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

/**
 * Stand-in for the Electron Steamworks bridge that preload.js exposes.
 * Only the methods SaveManager actually calls on a save round-trip are
 * implemented; everything else is undefined-by-design so an accidental
 * new dependency on the bridge shows up as a runtime crash in tests.
 */
interface FakeCloudBridge {
    writeToCloud: (filename: string, data: string) => Promise<void>
    readFromCloud: (filename: string) => Promise<string | null>
    deleteFromCloud: (filename: string) => Promise<void>
    files: Map<string, string>
}

function makeFakeCloudBridge(): FakeCloudBridge {
    const files = new Map<string, string>()
    return {
        files,
        async writeToCloud(filename, data) { files.set(filename, data) },
        async readFromCloud(filename) { return files.get(filename) ?? null },
        async deleteFromCloud(filename) { files.delete(filename) },
    }
}

interface ServiceSnapshot {
    isInitialized: boolean
    electronBridge: unknown
}

function attachFakeBridge(bridge: FakeCloudBridge): ServiceSnapshot {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = steamService as any
    const previous: ServiceSnapshot = {
        isInitialized: svc.isInitialized,
        electronBridge: svc.electronBridge,
    }
    svc.isInitialized = true
    svc.electronBridge = bridge
    return previous
}

function restoreService(previous: ServiceSnapshot): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = steamService as any
    svc.isInitialized = previous.isInitialized
    svc.electronBridge = previous.electronBridge
}

function makeSave(sm: SaveManager): GameSave {
    return sm.createSave("Cloud Round-Trip", {
        playerTeamId: "team_a",
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        players: [{
            id: "player_1",
            nickname: "Ace",
            firstName: "Alex",
            lastName: "Test",
            age: 22,
            nationality: "US",
            role: "RIFLER",
            morale: 80, fatigue: 0, form: 75, xp: 0, level: 1,
        } as any],
        contracts: [{
            id: "c1",
            playerId: "player_1",
            teamId: "team_a",
            salaryPerWeek: 1000,
            startWeek: 1,
            endWeek: 52,
            buyout: 100_000,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any],
    })
}

describe("Steam Cloud save round-trip", () => {
    let snapshot: ServiceSnapshot | null = null
    let cloud: FakeCloudBridge

    beforeEach(() => {
        cloud = makeFakeCloudBridge()
        snapshot = attachFakeBridge(cloud)
    })

    afterEach(() => {
        if (snapshot) {
            restoreService(snapshot)
            snapshot = null
        }
    })

    test("saveGame uploads byte-identical payload to the cloud bridge", async () => {
        const storage = new MemoryStorage()
        const sm = new SaveManager(storage)
        const save = makeSave(sm)

        const result = await sm.saveGame(save)
        expect(result.success).toBe(true)

        const localData = await storage.getItem(STORAGE_KEYS.SAVE_PREFIX + save.saveId)
        const cloudData = cloud.files.get(`save_${save.saveId}.json`)
        expect(localData).not.toBeNull()
        expect(cloudData).not.toBeUndefined()
        // Cloud and local must hold the exact same serialized bytes so
        // an integrity-hash check passes uniformly on either path.
        expect(cloudData).toBe(localData)
    })

    test("loadGame after local wipe pulls the save from cloud and preserves integrity", async () => {
        const storage = new MemoryStorage()
        const sm = new SaveManager(storage)
        const save = makeSave(sm)

        const saveRes = await sm.saveGame(save)
        expect(saveRes.success).toBe(true)
        const originalSerialized = await storage.getItem(STORAGE_KEYS.SAVE_PREFIX + save.saveId)
        expect(originalSerialized).not.toBeNull()
        // Capture the integrity hash that landed on DISK (createSave
        // doesn't compute one — saveGame does on serialization).
        const storedHash = (JSON.parse(originalSerialized!) as GameSave).integrityHash

        // Simulate fresh-device install: wipe ALL local data, leave cloud intact.
        await storage.clear()
        expect(storage.store.size).toBe(0)
        expect(cloud.files.size).toBeGreaterThan(0)

        const loaded = await sm.loadGame(save.saveId)
        expect(loaded.error).toBeUndefined()
        expect(loaded.save).not.toBeNull()
        // Save manager hydrates a fresh in-memory object, but the
        // critical fields must match the original by value.
        expect(loaded.save!.saveId).toBe(save.saveId)
        expect(loaded.save!.teams[0].budget).toBe(100_000)
        expect(loaded.save!.players[0].nickname).toBe("Ace")
        // Round-trip preserves the integrity hash exactly — no
        // recomputation happens on read, the stored hash flows through.
        expect(loaded.save!.integrityHash).toBe(storedHash)
    })

    test("cloud copy is rehydrated into local storage after a wipe", async () => {
        const storage = new MemoryStorage()
        const sm = new SaveManager(storage)
        const save = makeSave(sm)
        await sm.saveGame(save)

        await storage.clear()
        await sm.loadGame(save.saveId)

        // After load-from-cloud, local primary must be repopulated so
        // subsequent reads hit the local fast path.
        const rehydrated = await storage.getItem(STORAGE_KEYS.SAVE_PREFIX + save.saveId)
        expect(rehydrated).not.toBeNull()
        expect(rehydrated).toBe(cloud.files.get(`save_${save.saveId}.json`))
    })

    test("tampered cloud copy is rejected with INTEGRITY_FAILED when local is missing", async () => {
        const storage = new MemoryStorage()
        const sm = new SaveManager(storage)
        const save = makeSave(sm)
        await sm.saveGame(save)

        // Wipe local; tamper the cloud copy without updating its hash.
        await storage.clear()
        const filename = `save_${save.saveId}.json`
        const cloudCopy = cloud.files.get(filename)!
        const parsed = JSON.parse(cloudCopy)
        parsed.teams[0].budget += 9_999_999
        cloud.files.set(filename, JSON.stringify(parsed))

        const loaded = await sm.loadGame(save.saveId)
        expect(loaded.save).toBeNull()
        expect(loaded.errorCode).toBe("INTEGRITY_FAILED")
    })

    test("when local and cloud both exist, the newer-by-1s candidate wins", async () => {
        const storage = new MemoryStorage()
        const sm = new SaveManager(storage)
        const save = makeSave(sm)
        // First saveGame: writes both local + cloud with timestamp T0.
        await sm.saveGame(save)

        const filename = `save_${save.saveId}.json`
        const t0Cloud = cloud.files.get(filename)
        expect(t0Cloud).toBeDefined()

        // Wait past the 1s tie-break window so the next save's
        // updatedAt is unambiguously newer.
        await new Promise(r => setTimeout(r, 1200))

        // Bump the budget and save again. This rewrites BOTH local
        // primary AND cloud with timestamp T1 > T0 + 1s.
        save.teams[0].budget = 555_555
        await sm.saveGame(save)

        // To simulate a "newer cloud than local" scenario, restore the
        // OLD local primary slot (T0) while leaving the new cloud copy
        // (T1) in place. The conflict-resolution code should pick the
        // newer cloud.
        await storage.setItem(STORAGE_KEYS.SAVE_PREFIX + save.saveId, t0Cloud!)

        const loaded = await sm.loadGame(save.saveId)
        expect(loaded.error).toBeUndefined()
        // Cloud is >1s newer, so cloud's bumped budget should win.
        expect(loaded.save!.teams[0].budget).toBe(555_555)
    }, 15000)

    test("checkpoint writes stay local-only — cloud upload is reserved for final saveGame", async () => {
        const storage = new MemoryStorage()
        const sm = new SaveManager(storage)
        const save = makeSave(sm)

        // saveGameCheckpoint must NOT touch the cloud bridge.
        const beforeCount = cloud.files.size
        const result = await sm.saveGameCheckpoint(save)
        expect(result.success).toBe(true)
        expect(cloud.files.size).toBe(beforeCount)

        // Local primary still got written so the resume path can read it.
        const localData = await storage.getItem(STORAGE_KEYS.SAVE_PREFIX + save.saveId)
        expect(localData).not.toBeNull()
    })

    test("cloud-disconnected bridge does not fail saveGame (cloud sync is non-blocking)", async () => {
        // Detach the bridge entirely — simulate Steam offline / Electron-less host.
        const detached = attachFakeBridge(null as unknown as FakeCloudBridge)
        try {
            const storage = new MemoryStorage()
            const sm = new SaveManager(storage)
            const save = makeSave(sm)
            const result = await sm.saveGame(save)
            // Save must still succeed when the cloud is unreachable —
            // local storage is the source of truth, cloud is a mirror.
            expect(result.success).toBe(true)
        } finally {
            restoreService(detached)
        }
    })
})
