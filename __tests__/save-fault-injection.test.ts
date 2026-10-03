/**
 * L02.4 / L03.2-L03.4 — failure injection at the real persistence boundaries.
 *
 * Every scenario drives the production SaveManager through a production
 * storage adapter: the actual Electron main-process storage handlers (via the
 * launch harness) behind ElectronStorageAdapter, IndexedDBAdapter over an
 * IndexedDB double that commits/aborts like a browser, or the store's own
 * singleton saveManager. Faults are injected below the adapter, never by
 * mocking SaveManager itself.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { SaveManager } from "@/engine/save-manager"
import { SaveIntegrityManager } from "@/engine/save-integrity"
import { CURRENT_SAVE_VERSION, STORAGE_KEYS, type GameSave } from "@/engine/save-types"
import { asyncStorage, debouncedStorage, ElectronStorageAdapter, IndexedDBAdapter, LocalStorageAdapter } from "@/engine/storage-adapter"
import { createLaunchFixture, FixtureStorage } from "@/scripts/launch/fixtures"
import { useGameStore } from "@/store/game-store"
import { buildSaveSnapshot } from "@/store/utils/build-save-snapshot"
import { weekProcessorBridge } from "@/engine/worker/week-processor-bridge"
import type { ComputedWeek } from "@/engine/worker/compute-week"
import { createDefaultTactics } from "@/engine/default-tactics"
import { saveManager } from "@/engine"

jest.mock("@/engine/worker/week-processor-bridge", () => ({ weekProcessorBridge: { processWeek: jest.fn() } }))
jest.mock("@/engine/manager-career-profile", () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined) }))
const { loadHandlers } = require("../scripts/launch/electron-handler-harness.cjs")

const primaryKey = (id: string) => STORAGE_KEYS.SAVE_PREFIX + id
const backupKey = (id: string, suffix = "") => STORAGE_KEYS.BACKUP_PREFIX + id + suffix
const realWindow = (global as { window?: unknown }).window
const realIndexedDB = (global as { indexedDB?: unknown }).indexedDB
afterEach(() => {
    ;(global as { window?: unknown }).window = realWindow
    ;(global as { indexedDB?: unknown }).indexedDB = realIndexedDB
    jest.restoreAllMocks()
})

function career(week = 1, scenario: Parameters<typeof createLaunchFixture>[0] = "first-week"): GameSave {
    const save = createLaunchFixture(scenario)
    save.currentWeek = week
    return save
}

// ===== Electron: actual main.js storage handlers over a conf-like disk =====

/**
 * Mirrors conf 15 (electron-store's backend): every `store` read parses
 * config.json from disk, every `store` write replaces the whole file via
 * temp-file + rename. `failFrom` injects ENOSPC from the Nth write onward.
 */
class ConfLikeDisk {
    writes = 0
    failFrom: number | null = null
    constructor(readonly file: string) {}
    private read(): Record<string, unknown> {
        try { return JSON.parse(fs.readFileSync(this.file, "utf8")) }
        catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error }
    }
    get store() { return this.read() }
    set store(next: Record<string, unknown>) {
        this.writes++
        if (this.failFrom !== null && this.writes >= this.failFrom) {
            throw Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" })
        }
        fs.writeFileSync(this.file + ".w", JSON.stringify(next))
        fs.renameSync(this.file + ".w", this.file)
    }
    get(key: string) { return this.read()[key] }
    set(key: string, value: unknown) { this.store = { ...this.read(), [key]: value } }
    delete(key: string) { const next = this.read(); delete next[key]; this.store = next }
}

function electronManager(directory: string, disk: ConfLikeDisk) {
    const harness = loadHandlers({ directory, diskStore: disk })
    const bridge = {
        getItem: (k: string) => harness.invoke("storage-get-item", k),
        setItem: (k: string, v: string) => harness.invoke("storage-set-item", k, v),
        removeItem: (k: string) => harness.invoke("storage-remove-item", k),
        clear: () => harness.invoke("storage-clear"),
        getAllKeys: () => harness.invoke("storage-get-all-keys"),
    }
    ;(global as { window?: unknown }).window = { electron: { storage: bridge } }
    const adapter = new ElectronStorageAdapter(new LocalStorageAdapter())
    return { manager: new SaveManager(adapter), adapter }
}

describe("Electron disk boundary (actual IPC handlers + ElectronStorageAdapter)", () => {
    let directory: string
    // Settle preference writes queued at import before swapping the window realm.
    beforeAll(() => debouncedStorage.flush())
    beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), "esim-save-fault-")) })
    afterEach(() => {
        expect(path.basename(directory)).toMatch(/^esim-save-fault-/)
        fs.rmSync(directory, { recursive: true, force: true })
    })

    async function seedLastGood() {
        const disk = new ConfLikeDisk(path.join(directory, "config.json"))
        const { manager } = electronManager(directory, disk)
        const save = career(1)
        expect((await manager.saveGame(save)).success).toBe(true)
        return { disk, save }
    }

    test("disk full at every write step never reports saved, never tears the primary, and keeps last-good loadable", async () => {
        // Count the writes one full save performs so every step gets a fault.
        const probe = await seedLastGood()
        const before = probe.disk.writes
        expect((await electronManager(directory, probe.disk).manager.saveGame({ ...probe.save, currentWeek: 2 })).success).toBe(true)
        const stepsPerSave = probe.disk.writes - before
        expect(stepsPerSave).toBeGreaterThanOrEqual(4)

        for (let step = 1; step <= stepsPerSave; step++) {
            fs.rmSync(path.join(directory, "config.json"), { force: true })
            const { disk, save } = await seedLastGood()
            const lastGood = JSON.parse(fs.readFileSync(disk.file, "utf8"))[primaryKey(save.saveId)]
            disk.failFrom = disk.writes + step
            const result = await electronManager(directory, disk).manager.saveGame({ ...save, currentWeek: 2 })
            const onDisk = JSON.parse(fs.readFileSync(disk.file, "utf8"))
            // Failures after the verified commit (staging cleanup) are still reported, never hidden.
            if (!result.success) expect(result.error).toMatch(/^Disk save (deletion )?failed/)
            // The disk only ever holds complete copies: last-good or the new save.
            const primaryWeek = JSON.parse(onDisk[primaryKey(save.saveId)]).currentWeek
            expect([1, 2]).toContain(primaryWeek)
            if (result.success) expect(primaryWeek).toBe(2)
            // An uncommitted save leaves the primary byte-identical to last-good.
            if (primaryWeek === 1) expect(onDisk[primaryKey(save.saveId)]).toBe(lastGood)

            // Disk is still full on relaunch: last-good (or the committed save) still loads.
            const stillFull = await electronManager(directory, disk).manager.loadGame(save.saveId)
            expect(stillFull.save?.currentWeek).toBe(primaryWeek)
            expect(stillFull.restoredFromBackup).toBeUndefined()

            // Space freed: stale staging is discarded and a retry commits week 2.
            disk.failFrom = null
            const retry = electronManager(directory, disk).manager
            expect((await retry.loadGame(save.saveId)).save).not.toBeNull()
            expect(JSON.parse(fs.readFileSync(disk.file, "utf8"))[primaryKey(save.saveId) + ".tmp"]).toBeUndefined()
            expect((await retry.saveGame({ ...save, currentWeek: 2 })).success).toBe(true)
            expect((await electronManager(directory, disk).manager.loadGame(save.saveId)).save?.currentWeek).toBe(2)
        }
    }, 60_000)

    test("a crash after any single write step leaves a loadable career with no half-written state", async () => {
        const probe = await seedLastGood()
        const before = probe.disk.writes
        await electronManager(directory, probe.disk).manager.saveGame({ ...probe.save, currentWeek: 2 })
        const stepsPerSave = probe.disk.writes - before

        for (let completed = 0; completed < stepsPerSave; completed++) {
            fs.rmSync(path.join(directory, "config.json"), { force: true })
            const { disk, save } = await seedLastGood()
            // Kill the process after `completed` writes: copy the disk at that
            // instant and relaunch against the copy.
            const crashDir = fs.mkdtempSync(path.join(os.tmpdir(), "esim-save-fault-crash-"))
            try {
                let seen = 0
                const startWrites = disk.writes
                const realSet = Object.getOwnPropertyDescriptor(ConfLikeDisk.prototype, "store")!.set!
                Object.defineProperty(disk, "store", {
                    get: () => JSON.parse(fs.readFileSync(disk.file, "utf8")),
                    set: (next: Record<string, unknown>) => {
                        realSet.call(disk, next)
                        if (++seen === completed) fs.copyFileSync(disk.file, path.join(crashDir, "config.json"))
                    },
                })
                if (completed === 0) fs.copyFileSync(disk.file, path.join(crashDir, "config.json"))
                await electronManager(directory, disk).manager.saveGame({ ...save, currentWeek: 2 })
                expect(disk.writes - startWrites).toBe(stepsPerSave)

                const relaunched = new ConfLikeDisk(path.join(crashDir, "config.json"))
                const loaded = await electronManager(crashDir, relaunched).manager.loadGame(save.saveId)
                expect(loaded.save).not.toBeNull()
                expect([1, 2]).toContain(loaded.save!.currentWeek)
                const after = JSON.parse(fs.readFileSync(relaunched.file, "utf8"))
                expect(after[primaryKey(save.saveId) + ".tmp"]).toBeUndefined()
                expect(JSON.parse(after[primaryKey(save.saveId)]).currentWeek).toBe(loaded.save!.currentWeek)
            } finally {
                fs.rmSync(crashDir, { recursive: true, force: true })
            }
        }
    }, 60_000)

    test("an unreadable config.json fails load and save loudly and is never rewritten", async () => {
        const { disk, save } = await seedLastGood()
        fs.writeFileSync(disk.file, '{"esports_save_')
        const torn = fs.readFileSync(disk.file)
        const { manager } = electronManager(directory, disk)
        const loaded = await manager.loadGame(save.saveId)
        expect(loaded.save).toBeNull()
        expect(loaded.error).toMatch(/could not be read/)
        const saved = await manager.saveGame({ ...save, currentWeek: 2 })
        expect(saved.success).toBe(false)
        expect(fs.readFileSync(disk.file).equals(torn)).toBe(true)
    })
})

// ===== Browser: IndexedDBAdapter over a committing/aborting IndexedDB double =====

/**
 * Minimal IndexedDB: requests succeed first, then the transaction either
 * commits (oncomplete) or aborts with QuotaExceededError — the real browser
 * order that makes request success provisional.
 */
function installIndexedDB(data: Map<string, string>, abortWrite: (key: string) => boolean) {
    const quota = Object.assign(new Error("The quota has been exceeded."), { name: "QuotaExceededError" })
    const db = {
        objectStoreNames: { contains: () => true },
        createObjectStore() {},
        close() {},
        onversionchange: null as unknown,
        transaction() {
            const tx: Record<string, unknown> & { error: unknown } = { error: null }
            const pending = new Map<string, string | null>()
            let abort = false
            const request = (result: () => unknown) => {
                const req: Record<string, unknown> = {}
                setTimeout(() => {
                    req.result = result()
                    ;(req.onsuccess as (() => void) | undefined)?.()
                    if (abort) { tx.error = quota; (tx.onabort as () => void)?.(); return }
                    for (const [k, v] of pending) v === null ? data.delete(k) : data.set(k, v)
                    ;(tx.oncomplete as () => void)?.()
                }, 0)
                return req
            }
            tx.objectStore = () => ({
                get: (key: string) => request(() => data.get(key)),
                put: (value: string, key: string) => { if (abortWrite(key)) abort = true; pending.set(key, value); return request(() => key) },
                delete: (key: string) => { pending.set(key, null); return request(() => undefined) },
                clear: () => request(() => { data.clear() }),
                getAllKeys: () => request(() => [...data.keys()]),
            })
            return tx
        },
    }
    ;(global as { window?: unknown }).window = {}
    ;(global as { indexedDB?: unknown }).indexedDB = {
        open() {
            const req: Record<string, unknown> = { result: db }
            setTimeout(() => { (req.onupgradeneeded as () => void)?.(); (req.onsuccess as () => void)() }, 0)
            return req
        },
    }
}

describe("IndexedDB boundary (actual IndexedDBAdapter)", () => {
    test("quota abort after request success is a failed save at every write step; last-good survives", async () => {
        const data = new Map<string, string>()
        let failing: ((key: string) => boolean) = () => false
        installIndexedDB(data, key => failing(key))
        const manager = () => new SaveManager(new IndexedDBAdapter(new LocalStorageAdapter()))
        const save = career(1)
        expect((await manager().saveGame(save)).success).toBe(true)

        // Every key a save writes: backup rotation, staging, primary, current id.
        const written: string[] = []
        failing = key => { written.push(key); return false }
        expect((await manager().saveGame({ ...save, currentWeek: 2 })).success).toBe(true)
        const keys = [...new Set(written)]
        expect(keys).toEqual(expect.arrayContaining([backupKey(save.saveId, "_1"), primaryKey(save.saveId) + ".tmp", primaryKey(save.saveId)]))

        for (const quotaKey of keys) {
            data.clear()
            failing = () => false
            expect((await manager().saveGame(save)).success).toBe(true)
            const lastGood = data.get(primaryKey(save.saveId))
            failing = key => key === quotaKey
            const result = await manager().saveGame({ ...save, currentWeek: 2 })
            failing = () => false
            const loaded = await manager().loadGame(save.saveId)
            if (quotaKey === STORAGE_KEYS.CURRENT_SAVE_ID) {
                // Primary already committed; the save is reported failed (conservative), never torn.
                expect(result.success).toBe(false)
                expect([1, 2]).toContain(loaded.save?.currentWeek)
            } else {
                expect(result).toMatchObject({ success: false, error: expect.stringMatching(/quota/i) })
                expect(data.get(primaryKey(save.saveId))).toBe(lastGood)
                expect(loaded.save?.currentWeek).toBe(1)
            }
        }
    })
})

// ===== Corrupted primary with a valid backup =====

describe("corrupted primary recovery preserves the unreadable bytes", () => {
    async function twoSaves() {
        const storage = new FixtureStorage()
        const manager = new SaveManager(storage)
        const save = career(1)
        await manager.saveGame(save)
        await manager.saveGame({ ...save, currentWeek: 2 })
        return { storage, manager, save }
    }

    test("load falls back to backup, says so truthfully, and keeps the corrupt primary (not deleted)", async () => {
        const { storage, save } = await twoSaves()
        storage.data.set(primaryKey(save.saveId), '{"saveId":"torn')
        const loaded = await new SaveManager(storage).loadGame(save.saveId)
        expect(loaded.save?.currentWeek).toBe(1)
        expect(loaded.restoredFromBackup).toBe(true)
        expect(loaded.recoveryMessage).toMatch(/could not be read \(Save file is not valid JSON\)/)
        expect(loaded.recoveryMessage).toMatch(/Progress since that backup is not included/)
        expect(loaded.recoveryMessage).toMatch(/unreadable copy was kept/)
        expect(storage.data.get(backupKey(save.saveId, "_corrupt"))).toBe('{"saveId":"torn')
        expect(storage.data.get(primaryKey(save.saveId))).toBe(storage.data.get(backupKey(save.saveId, "_1")))
        // Next launch reads a healthy primary — no repeated recovery.
        expect((await new SaveManager(storage).loadGame(save.saveId)).restoredFromBackup).toBeUndefined()
    })

    test("a tampered primary is kept aside and the message names the integrity failure", async () => {
        const { storage, save } = await twoSaves()
        const tampered = JSON.parse(storage.data.get(primaryKey(save.saveId))!)
        tampered.teams[0].budget = 999_999_999
        storage.data.set(primaryKey(save.saveId), JSON.stringify(tampered))
        const loaded = await new SaveManager(storage).loadGame(save.saveId)
        expect(loaded.save?.currentWeek).toBe(1)
        expect(loaded.recoveryMessage).toMatch(/integrity/i)
        expect(JSON.parse(storage.data.get(backupKey(save.saveId, "_corrupt"))!).teams[0].budget).toBe(999_999_999)
    })

    test("a missing primary is described as missing, not corrupted", async () => {
        const { storage, save } = await twoSaves()
        storage.data.delete(primaryKey(save.saveId))
        const loaded = await new SaveManager(storage).loadGame(save.saveId)
        expect(loaded.save?.currentWeek).toBe(1)
        expect(loaded.recoveryMessage).toMatch(/missing/)
        expect(storage.data.has(backupKey(save.saveId, "_corrupt"))).toBe(false)
    })

    test("if the quarantine copy cannot be written, the corrupt primary is left in place and the backup still loads", async () => {
        const { storage, save } = await twoSaves()
        storage.data.set(primaryKey(save.saveId), "{torn")
        storage.failWrite = key => key.endsWith("_corrupt")
        const loaded = await new SaveManager(storage).loadGame(save.saveId)
        expect(loaded.save?.currentWeek).toBe(1)
        expect(storage.data.get(primaryKey(save.saveId))).toBe("{torn")
    })

    test("explicit Attempt Recovery and a later save both keep the unreadable primary", async () => {
        const { storage, manager, save } = await twoSaves()
        storage.data.set(primaryKey(save.saveId), "{torn-a")
        expect((await manager.attemptRecovery(save.saveId)).save?.currentWeek).toBe(1)
        expect(storage.data.get(backupKey(save.saveId, "_corrupt"))).toBe("{torn-a")

        // Corruption during a session, then the player saves over it.
        storage.data.set(primaryKey(save.saveId), "{torn-b")
        expect((await new SaveManager(storage).saveGame({ ...save, currentWeek: 3 })).success).toBe(true)
        expect(storage.data.get(backupKey(save.saveId, "_corrupt"))).toBe("{torn-b")
        expect((await new SaveManager(storage).loadGame(save.saveId)).save?.currentWeek).toBe(3)

        // Only an explicit delete removes it.
        await manager.deleteSave(save.saveId)
        expect(storage.data.has(backupKey(save.saveId, "_corrupt"))).toBe(false)
    })
})

// ===== Migration: supported versions and failed upgrades =====

async function signedAtVersion(storage: FixtureStorage, save: GameSave, version: number, mutate?: (raw: Record<string, unknown>) => void) {
    const raw = JSON.parse(JSON.stringify({ ...save, saveVersion: version })) as Record<string, unknown>
    delete raw.integrityHash
    mutate?.(raw)
    raw.integrityHash = await new SaveIntegrityManager(storage).computeIntegrityHash(raw)
    const bytes = JSON.stringify(raw)
    storage.data.set(primaryKey(save.saveId), bytes)
    return bytes
}

describe("save version migration through the real load/save path", () => {
    test.each(Array.from({ length: CURRENT_SAVE_VERSION - 1 }, (_, i) => i + 1))(
        "a v%i career loads, and the first save keeps the original bytes as backup_1", async version => {
            const storage = new FixtureStorage()
            const save = career(4)
            const original = await signedAtVersion(storage, save, version)
            const loaded = await new SaveManager(storage).loadGame(save.saveId)
            expect(loaded.error).toBeUndefined()
            expect(loaded.save?.saveVersion).toBe(CURRENT_SAVE_VERSION)
            expect(loaded.save?.players.map(p => p.id)).toEqual(save.players.map(p => p.id))
            expect(loaded.save?.financeLedger).toHaveLength(save.financeLedger.length)
            expect(storage.data.get(primaryKey(save.saveId))).toBe(original)
            expect((await new SaveManager(storage).saveGame(loaded.save!)).success).toBe(true)
            expect(storage.data.get(backupKey(save.saveId, "_1"))).toBe(original)
            expect(JSON.parse(storage.data.get(primaryKey(save.saveId))!).saveVersion).toBe(CURRENT_SAVE_VERSION)
        })

    test("a failed real migration preserves the original, writes nothing, and names the version", async () => {
        const storage = new FixtureStorage()
        const save = career(4)
        // A null tournament row makes the real v4→v5 dedupe step throw.
        const original = await signedAtVersion(storage, save, 4, raw => { raw.tournaments = [null] })
        const keysBefore = [...storage.data.entries()]
        const loaded = await new SaveManager(storage).loadGame(save.saveId)
        expect(loaded.save).toBeNull()
        expect(loaded.errorCode).toBe("CORRUPTED")
        expect(loaded.error).toMatch(new RegExp(`Save version 4 could not be upgraded to version ${CURRENT_SAVE_VERSION}`))
        expect([...storage.data.entries()]).toEqual(keysBefore)
        expect(storage.data.get(primaryKey(save.saveId))).toBe(original)
    })

    test("a failed migration with a valid backup loads the backup and keeps the original aside", async () => {
        const storage = new FixtureStorage()
        const manager = new SaveManager(storage)
        const save = career(3)
        await manager.saveGame(save)
        storage.data.set(backupKey(save.saveId, "_1"), storage.data.get(primaryKey(save.saveId))!)
        const original = await signedAtVersion(storage, { ...save, currentWeek: 4 }, 4, raw => { raw.tournaments = [null] })
        const loaded = await new SaveManager(storage).loadGame(save.saveId)
        expect(loaded.save?.currentWeek).toBe(3)
        expect(loaded.recoveryMessage).toMatch(/version 4 could not be upgraded/)
        expect(storage.data.get(backupKey(save.saveId, "_corrupt"))).toBe(original)
    })
})

// ===== Store: truthful saved state, duplicate Save, save during week advance =====

describe("store save state over the real saveManager + storage adapter", () => {
    const initial = useGameStore.getState()
    const ledgerId = (week: number) => `fault-week-income-${week}`

    beforeEach(async () => {
        await Promise.resolve()
        const save = career(5)
        save.scheduledMatches = []
        useGameStore.setState({ ...initial, ...JSON.parse(JSON.stringify(save)), isInitialized: true, isLoading: false, toasts: [], _completedMatchIds: new Set() })
        jest.mocked(weekProcessorBridge.processWeek).mockReset()
    })

    test("a quota failure throws, toasts an error, never claims saved, and leaves last-good bytes", async () => {
        await useGameStore.getState().saveGame()
        const id = useGameStore.getState().saveId!
        const lastGood = await asyncStorage.getItem(primaryKey(id))
        const write = asyncStorage.setItem.bind(asyncStorage)
        jest.spyOn(asyncStorage, "setItem").mockImplementation(async (key, value) => {
            if (key.startsWith(STORAGE_KEYS.SAVE_PREFIX)) throw Object.assign(new Error("The quota has been exceeded."), { name: "QuotaExceededError" })
            return write(key, value)
        })
        useGameStore.setState({ currentWeek: 6 })
        await expect(useGameStore.getState().saveGame()).rejects.toThrow(/quota/)
        const toasts = useGameStore.getState().toasts
        expect(toasts.some(t => t.type === "error" && /Save failed: .*quota/.test(t.message))).toBe(true)
        expect(toasts.some(t => /saved/i.test(t.message) && t.type !== "error")).toBe(false)
        expect(await asyncStorage.getItem(primaryKey(id))).toBe(lastGood)
        jest.restoreAllMocks()
        await useGameStore.getState().saveGame()
        expect((await new SaveManager(asyncStorage).loadGame(id)).save?.currentWeek).toBe(6)
    })

    test("double-click Save and Save during week advance apply the week, ledger and reward exactly once", async () => {
        const id = useGameStore.getState().saveId!
        const team = useGameStore.getState().playerTeamId!
        const startWeek = useGameStore.getState().currentWeek
        const startBudget = useGameStore.getState().teams.find(t => t.id === team)!.budget
        await useGameStore.getState().saveGame()

        let release!: () => void
        const gate = new Promise<void>(resolve => { release = resolve })
        let started!: () => void
        const running = new Promise<void>(resolve => { started = resolve })
        jest.mocked(weekProcessorBridge.processWeek).mockImplementation(async input => {
            started()
            await gate
            const next = structuredClone(input)
            next.currentWeek++
            next.lastCommittedWeekTick = next.currentWeek
            next.teams.find(t => t.id === team)!.budget += 1000
            next.financeLedger.push({ id: ledgerId(next.currentWeek), teamId: team, week: next.currentWeek, amount: 1000, type: "INCOME", category: "PRIZE_MONEY", description: "fault injection" } as GameSave["financeLedger"][number])
            return { save: next, rngState: 77, result: { success: true } as ComputedWeek["result"] }
        })

        const advancing = useGameStore.getState().advanceWeek()
        await running
        // Rapid repeat input while processing.
        await useGameStore.getState().advanceWeek()
        const midSaves = await Promise.allSettled([useGameStore.getState().saveGame(), useGameStore.getState().saveGame()])
        expect(midSaves.every(r => r.status === "fulfilled")).toBe(true)
        const midDisk = JSON.parse((await asyncStorage.getItem(primaryKey(id)))!)
        expect(midDisk.currentWeek).toBe(startWeek)
        expect(midDisk.financeLedger.some((e: { id: string }) => e.id === ledgerId(startWeek + 1))).toBe(false)

        release()
        await advancing
        await Promise.all([useGameStore.getState().saveGame(), useGameStore.getState().saveGame()])

        expect(weekProcessorBridge.processWeek).toHaveBeenCalledTimes(1)
        const loaded = (await new SaveManager(asyncStorage).loadGame(id)).save!
        expect(loaded.currentWeek).toBe(startWeek + 1)
        expect(loaded.lastCommittedWeekTick).toBe(startWeek + 1)
        expect(loaded.financeLedger.filter(e => e.id === ledgerId(startWeek + 1))).toHaveLength(1)
        expect(loaded.teams.find(t => t.id === team)!.budget).toBe(startBudget + 1000)
        expect(await asyncStorage.getItem(primaryKey(id) + ".tmp")).toBeNull()
    })

    test("a crash while computing next week leaves the store and disk on the last committed week", async () => {
        const id = useGameStore.getState().saveId!
        const startWeek = useGameStore.getState().currentWeek
        await useGameStore.getState().saveGame()
        const lastGood = await asyncStorage.getItem(primaryKey(id))
        jest.mocked(weekProcessorBridge.processWeek).mockRejectedValue(new Error("Worker terminated"))
        const write = jest.spyOn(saveManager, "saveGame")
        await useGameStore.getState().advanceWeek()
        expect(useGameStore.getState().currentWeek).toBe(startWeek)
        expect(useGameStore.getState().isLoading).toBe(false)
        expect(useGameStore.getState().toasts.some(t => /Week failed: Worker terminated/.test(t.message))).toBe(true)
        expect(write).not.toHaveBeenCalled()
        expect(await asyncStorage.getItem(primaryKey(id))).toBe(lastGood)
    })
})

// ===== Serializer round-trip: every durable slice survives save + fresh load =====

/** Store keys that are deliberately NOT career data (device prefs, UI, runtime, indexes). */
const NON_CAREER_STORE_KEYS = [
    // device / app preferences (persisted separately via zustand persist)
    "theme", "soundEnabled", "resolution", "masterVolume", "musicVolume", "gameSpeed", "autoSave", "notifications", "showBugReportButton",
    // derived from the saved firstSession on load
    "onboardingCompleted", "tutorialCompleted", "showTutorialOnNewGame", "manualTutorialTrigger",
    // new-game setup inputs and a static shop catalogue
    "selectedRegions", "availableEquipment",
    // transient UI / runtime
    "weekReveal", "toasts", "isLoading", "error", "lastLoadError", "isInitialized", "_hasHydrated",
    // indexes rebuilt on hydration
    "_teamIndex", "_playerIndex", "_contractByPlayerIndex", "_staffIndex", "_completedMatchIds",
]
/** Snapshot keys that legitimately change on every write. */
const VOLATILE_SAVE_KEYS = ["updatedAt", "lastPlayedAt", "integrityHash"]
/** Entity arrays that load enriches with defaults/derived fields; checked as subsets. */
const ENRICHED_ON_LOAD = ["teams", "players", "staff"]

function sentinelCareer(): GameSave {
    const save = career(9, "strong-club")
    const team = save.playerTeamId
    const player = save.players[0].id
    const tactics = createDefaultTactics()
    tactics.FULL.ct.primaryWeaponId = "rt-weapon"
    return Object.assign(save, {
        saveId: "save_roundtrip_sentinel",
        lastRngSeed: 987654,
        lastCommittedWeekTick: 9,
        currentDay: 3,
        selectedWeeklyActivity: "BOOTCAMP",
        firstSession: { version: 1, status: "active", reviewed: [] },
        customTactics: tactics,
        watchlistedPlayerIds: [player],
        activeMatchId: "rt-match",
        activeMatchState: { matchId: "rt-match", gameState: { round: 4 }, simState: { currentRound: 4 }, homeRoster: [], awayRoster: [], logs: ["rt-log"], originalHomePlayers: [], originalAwayPlayers: [], matchResult: { score: "3-1" }, roundTime: 40, bombTime: 0, isBombPlanted: false, isWaitingForStrategy: true },
        physicalMatchPreview: null,
        gameOverReason: "SACKED",
        gameOverWeek: 9,
        difficulty: "hard",
        nextMarketRefreshWeek: 17,
        sponsorOffers: [{ id: "rt-offer", name: "RT Sponsor", weeklyPayment: 1234 }],
        declinedSponsorOfferIds: ["rt-declined"],
        acknowledgedEventIds: ["rt-ack"],
        financeLedger: [...save.financeLedger, { id: "rt-ledger", teamId: team, week: 8, amount: -50, type: "EXPENSE", category: "OTHER", description: "rt" }],
        scoutedPlayers: [{ playerId: player, scoutedWeek: 7, scoutLevel: "EXPERT" }],
        activeScoutingMission: { playerId: player, startWeek: 8, completionWeek: 10, scoutId: "rt-scout" },
        circuitPoints: [{ teamId: team, points: 42 }],
        tournamentQualifications: [{ teamId: team, tournamentId: "rt-tournament" }],
        newsFeed: [{ id: "rt-news", title: "RT", content: "c", week: 8, category: "FINANCE" }],
        transferHistory: [{ id: "rt-transfer", playerId: player, week: 6 }],
        legendaryPlayers: [],
        pendingCelebration: { type: "rt-celebration" },
        pendingSeasonRecap: 1,
        pendingLegendPick: { tournamentName: "rt-major" },
        signedLegendIds: ["rt-legend"],
        activelyPlayingLegendIds: ["rt-active-legend"],
        academyPlayers: [{ id: "rt-prospect", nickname: "Kid" }],
        academyMatchHistory: [{ id: "rt-academy-match" }],
        academyRoster: { IGL: "rt-prospect", Entry: null, AWPer: null, Support: null, Rifler: null },
        academyTrainingSchedule: { 0: "rt-drill" },
        academyWeeklyReports: [{ week: 8, summary: "rt" }],
        academyScoutingMissions: [{ id: "rt-academy-scout" }],
        academyPendingProspects: ["rt-pending"],
        fplData: { season: 1, gameweek: 3, playerStats: {}, seasonHistory: [], nonProPlayers: [], fplStandings: [], fplCStandings: [] },
        careerStats: { seasons: [], totalSeasons: 1, totalMatches: 20, totalWins: 12, totalLosses: 8, totalTournamentWins: 1, totalPrizeMoney: 5000, peakWorldRanking: 3, peakElo: 1700, teamsManaged: [team], lastUpdatedWeek: 9 },
        boardState: { teamId: team, confidence: 38, seasonExpectation: "CONTEND", expectationSetSeason: 1, lastReviewedSeason: 0, onNotice: true, lastPulseWeek: 8 },
        socialFeed: [{ id: "rt-post", week: 8, user: { name: "n", handle: "h", avatar: "a" }, content: "rt", timestamp: "now", likes: 1, retweets: 0, replies: 0 }],
    } as Partial<GameSave>)
}

const snapshotJson = () => JSON.parse(JSON.stringify(buildSaveSnapshot(useGameStore.getState()))) as Record<string, unknown>

describe("durable state round-trips through buildSaveSnapshot → disk → fresh store", () => {
    const initial = useGameStore.getState()
    beforeEach(async () => { await Promise.resolve(); useGameStore.setState({ ...initial, toasts: [] }) })

    test("every store key is either serialized or explicitly classified as non-career state", async () => {
        const state = useGameStore.getState() as unknown as Record<string, unknown>
        const serialized = new Set(Object.keys(buildSaveSnapshot(useGameStore.getState())))
        const unclassified = Object.keys(state).filter(key => typeof state[key] !== "function" && !serialized.has(key) && !NON_CAREER_STORE_KEYS.includes(key))
        expect(unclassified).toEqual([])
    })

    test("every serialized field (incl. optional ones) survives save and a fresh-store load, and none leak into the next career", async () => {
        const seeded = sentinelCareer()
        useGameStore.setState({ ...initial, ...JSON.parse(JSON.stringify(seeded)), isInitialized: true, isLoading: false, toasts: [] })
        const before = snapshotJson()
        // Every optional sentinel actually reached the snapshot (builder lists it).
        for (const key of Object.keys(seeded)) if (!VOLATILE_SAVE_KEYS.includes(key) && key !== "saveVersion" && key !== "weekTickState") expect(before).toHaveProperty(key)
        await useGameStore.getState().saveGame()

        // Fresh store (as after relaunch) loads through the real SaveManager.
        useGameStore.setState({ ...initial, toasts: [] })
        await useGameStore.getState().loadGame(seeded.saveId)
        const after = snapshotJson()
        for (const key of Object.keys(before)) {
            if (VOLATILE_SAVE_KEYS.includes(key) || ENRICHED_ON_LOAD.includes(key)) continue
            expect({ key, value: after[key] }).toEqual({ key, value: before[key] })
        }

        // Load normalises entities once (role reconciliation, defaults); after
        // that a save/load cycle must keep every entity field as written.
        await useGameStore.getState().saveGame()
        useGameStore.setState({ ...initial, toasts: [] })
        await useGameStore.getState().loadGame(seeded.saveId)
        const again = snapshotJson()
        for (const key of ENRICHED_ON_LOAD) expect({ key, value: again[key] }).toEqual({ key, value: after[key] })

        // Career switch: a career without the optional slices must not inherit them.
        const other = career(2, "weak-club")
        other.saveId = "save_roundtrip_other"
        expect((await saveManager.saveGame(other)).success).toBe(true)
        useGameStore.setState({ ...initial, toasts: [] })
        await useGameStore.getState().loadGame(other.saveId)
        const otherExpected = snapshotJson()
        await useGameStore.getState().loadGame(seeded.saveId)
        expect(useGameStore.getState()).toMatchObject({ fplData: seeded.fplData, careerStats: seeded.careerStats, boardState: seeded.boardState })
        await useGameStore.getState().loadGame(other.saveId)
        for (const key of ["fplData", "careerStats", "boardState", "socialFeed", "activeScoutingMission", "gameOverReason"] as const) {
            expect({ key, value: useGameStore.getState()[key] ?? null }).toEqual({ key, value: null })
        }
        const switched = snapshotJson()
        for (const key of new Set([...Object.keys(otherExpected), ...Object.keys(switched)])) {
            if (VOLATILE_SAVE_KEYS.includes(key) || ENRICHED_ON_LOAD.includes(key)) continue
            expect({ key, value: switched[key] }).toEqual({ key, value: otherExpected[key] })
        }
    })
})
