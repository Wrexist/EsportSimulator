/**
 * L02.4 / L03.2-L03.4 — failure injection at the real persistence boundaries.
 *
 * Every scenario drives the production SaveManager through a production
 * storage adapter: the actual Electron main-process storage handlers (via the
 * launch harness, over per-career save files) behind ElectronStorageAdapter, IndexedDBAdapter over an
 * IndexedDB double that commits/aborts like a browser, or the store's own
 * singleton saveManager. Faults are injected below the adapter, never by
 * mocking SaveManager itself.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import vm from "node:vm"
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

// ===== Electron: actual main.js storage handlers over per-career files =====

/**
 * node:fs behind the production game-storage module. Every mutating step
 * (temp create, data write, rename, unlink, rmdir) is counted; `failFrom`
 * injects ENOSPC from the Nth step onward and `after` observes each completed
 * step so a test can snapshot the disk exactly as a killed process would
 * leave it.
 */
class FaultFs {
    steps = 0
    failFrom: number | null = null
    after: ((step: number) => void) | null = null
    readonly fs: typeof fs
    constructor() {
        const counted = new Set(["openSync", "writeFileSync", "renameSync", "unlinkSync", "rmdirSync"])
        this.fs = new Proxy(fs, {
            get: (target, prop: string) => {
                const real = (target as unknown as Record<string, unknown>)[prop]
                if (typeof real !== "function") return real
                if (!counted.has(prop)) return real.bind(target)
                return (...args: unknown[]) => {
                    if (prop === "openSync" && !/[wa]/.test(String(args[1] ?? "r"))) return real.apply(target, args)
                    this.steps++
                    if (this.failFrom !== null && this.steps >= this.failFrom) {
                        throw Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" })
                    }
                    const result = real.apply(target, args)
                    this.after?.(this.steps)
                    return result
                }
            },
        })
    }
}

function electronHarness(directory: string, faults?: FaultFs) {
    return loadHandlers({ directory, saveFs: faults?.fs })
}

function electronManager(directory: string, faults?: FaultFs) {
    const harness = electronHarness(directory, faults)
    const bridge = {
        getItem: (k: string) => harness.invoke("storage-get-item", k),
        setItem: (k: string, v: string) => harness.invoke("storage-set-item", k, v),
        removeItem: (k: string) => harness.invoke("storage-remove-item", k),
        clear: () => harness.invoke("storage-clear"),
        getAllKeys: () => harness.invoke("storage-get-all-keys"),
    }
    ;(global as { window?: unknown }).window = { electron: { storage: bridge } }
    const adapter = new ElectronStorageAdapter(new LocalStorageAdapter())
    return { manager: new SaveManager(adapter), adapter, harness }
}

const careerFile = (directory: string, id: string, file: string) => path.join(directory, "saves", id, file)
const readCareerFile = (directory: string, id: string, file: string) => fs.readFileSync(careerFile(directory, id, file), "utf8")
const strayTemps = (directory: string) => {
    const saves = path.join(directory, "saves")
    if (!fs.existsSync(saves)) return []
    return fs.readdirSync(saves).flatMap(id => fs.readdirSync(path.join(saves, id)).filter(name => name.endsWith(".tmp")))
}

// Exhaustive per-write-step fault loops are slow when the full suite shares the CPU.
jest.setTimeout(60_000)

describe("Electron disk boundary (actual IPC handlers + ElectronStorageAdapter)", () => {
    let directory: string
    // Settle preference writes queued at import before swapping the window realm.
    beforeAll(() => debouncedStorage.flush())
    beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), "esim-save-fault-")) })
    afterEach(() => {
        expect(path.basename(directory)).toMatch(/^esim-save-fault-/)
        fs.rmSync(directory, { recursive: true, force: true })
    })

    async function seedLastGood(dir: string, faults = new FaultFs()) {
        const { manager } = electronManager(dir, faults)
        const save = career(1)
        expect((await manager.saveGame(save)).success).toBe(true)
        return { faults, save }
    }

    test("each career copy is its own file in a per-career directory", async () => {
        const { save } = await seedLastGood(directory)
        await electronManager(directory).manager.saveGame({ ...save, currentWeek: 2 })
        expect(fs.readdirSync(path.join(directory, "saves", save.saveId)).sort()).toEqual(["backup-1.json", "primary.json"])
        expect(JSON.parse(readCareerFile(directory, save.saveId, "primary.json")).currentWeek).toBe(2)
        expect(JSON.parse(readCareerFile(directory, save.saveId, "backup-1.json")).currentWeek).toBe(1)
        expect(fs.readFileSync(path.join(directory, "game-storage", `${STORAGE_KEYS.CURRENT_SAVE_ID}.json`), "utf8")).toBe(save.saveId)
        expect(fs.existsSync(path.join(directory, "config.json"))).toBe(false)
    })

    test("disk full at every write step never reports saved, never tears the primary, and keeps last-good loadable", async () => {
        // Count the writes one full save performs so every step gets a fault.
        const probe = await seedLastGood(directory)
        const before = probe.faults.steps
        expect((await electronManager(directory, probe.faults).manager.saveGame({ ...probe.save, currentWeek: 2 })).success).toBe(true)
        const stepsPerSave = probe.faults.steps - before
        expect(stepsPerSave).toBeGreaterThanOrEqual(8)

        for (let step = 1; step <= stepsPerSave; step++) {
            const dir = fs.mkdtempSync(path.join(directory, "step-"))
            const { faults, save } = await seedLastGood(dir)
            const lastGood = readCareerFile(dir, save.saveId, "primary.json")
            faults.failFrom = faults.steps + step
            const result = await electronManager(dir, faults).manager.saveGame({ ...save, currentWeek: 2 })
            // Failures after the verified commit (staging cleanup) are still reported, never hidden.
            if (!result.success) expect(result.error).toMatch(/^Disk save (deletion )?failed/)
            // The disk only ever holds complete copies: last-good or the new save.
            const primary = readCareerFile(dir, save.saveId, "primary.json")
            const primaryWeek = JSON.parse(primary).currentWeek
            expect([1, 2]).toContain(primaryWeek)
            if (result.success) expect(primaryWeek).toBe(2)
            // An uncommitted save leaves the primary byte-identical to last-good.
            if (primaryWeek === 1) expect(primary).toBe(lastGood)

            // Disk is still full on relaunch: last-good (or the committed save) still loads.
            const stillFull = await electronManager(dir, faults).manager.loadGame(save.saveId)
            expect(stillFull.save?.currentWeek).toBe(primaryWeek)
            expect(stillFull.restoredFromBackup).toBeUndefined()

            // Space freed: stale staging and temp files are discarded and a retry commits week 2.
            faults.failFrom = null
            const retry = electronManager(dir, faults).manager
            expect((await retry.loadGame(save.saveId)).save).not.toBeNull()
            expect(fs.existsSync(careerFile(dir, save.saveId, "staging.json"))).toBe(false)
            expect(strayTemps(dir)).toEqual([])
            expect((await retry.saveGame({ ...save, currentWeek: 2 })).success).toBe(true)
            expect((await electronManager(dir, faults).manager.loadGame(save.saveId)).save?.currentWeek).toBe(2)
        }
    }, 60_000)

    test("a crash after any single write step leaves a loadable career with no half-written state", async () => {
        const probe = await seedLastGood(directory)
        const before = probe.faults.steps
        await electronManager(directory, probe.faults).manager.saveGame({ ...probe.save, currentWeek: 2 })
        const stepsPerSave = probe.faults.steps - before

        for (let completed = 0; completed < stepsPerSave; completed++) {
            const dir = fs.mkdtempSync(path.join(directory, "crash-src-"))
            const crashDir = fs.mkdtempSync(path.join(directory, "crash-"))
            const { faults, save } = await seedLastGood(dir)
            // Kill the process after `completed` steps: copy the disk at that
            // instant and relaunch against the copy.
            const startSteps = faults.steps
            faults.after = step => { if (step - startSteps === completed) fs.cpSync(dir, crashDir, { recursive: true }) }
            if (completed === 0) fs.cpSync(dir, crashDir, { recursive: true })
            await electronManager(dir, faults).manager.saveGame({ ...save, currentWeek: 2 })
            expect(faults.steps - startSteps).toBe(stepsPerSave)

            const loaded = await electronManager(crashDir).manager.loadGame(save.saveId)
            expect(loaded.save).not.toBeNull()
            expect([1, 2]).toContain(loaded.save!.currentWeek)
            expect(fs.existsSync(careerFile(crashDir, save.saveId, "staging.json"))).toBe(false)
            expect(strayTemps(crashDir)).toEqual([])
            expect(JSON.parse(readCareerFile(crashDir, save.saveId, "primary.json")).currentWeek).toBe(loaded.save!.currentWeek)
        }
    }, 60_000)

    test("a corrupt config.json no longer loses careers: they load and save, and config.json is never rewritten", async () => {
        const legacy = path.join(directory, "config.json")
        fs.writeFileSync(legacy, '{"esports_save_')
        const torn = fs.readFileSync(legacy)
        const { save } = await seedLastGood(directory)
        const { manager, harness } = electronManager(directory)
        expect(await harness.invoke("storage-get-all-keys")).toEqual(expect.arrayContaining([primaryKey(save.saveId)]))
        const loaded = await manager.loadGame(save.saveId)
        expect(loaded.save?.currentWeek).toBe(1)
        expect((await manager.saveGame({ ...save, currentWeek: 2 })).success).toBe(true)
        expect((await electronManager(directory).manager.loadGame(save.saveId)).save?.currentWeek).toBe(2)
        expect(fs.readFileSync(legacy).equals(torn)).toBe(true)
        // Import is not marked done while the legacy file is unreadable; it is retried on a later launch.
        expect(fs.existsSync(path.join(directory, "storage-migration.json"))).toBe(false)
    })

    test("startup survives an unreadable config.json and still serves per-file careers", async () => {
        const { save } = await seedLastGood(directory)
        fs.writeFileSync(path.join(directory, "config.json"), "\u0000garbage")
        const harness = electronHarness(directory)
        const context = harness.contexts["main.js"]
        await vm.runInContext("initStore()", context)
        expect(vm.runInContext("store.get('window').width", context)).toBe(1280)
        expect(JSON.parse(await harness.invoke("storage-get-item", primaryKey(save.saveId))).saveId).toBe(save.saveId)
    })

    test("a corrupt file in one career never affects another career", async () => {
        const { save: a } = await seedLastGood(directory)
        const b = { ...career(3), saveId: "save_other_career" }
        const { manager } = electronManager(directory)
        expect((await manager.saveGame({ ...a, currentWeek: 2 })).success).toBe(true)
        expect((await manager.saveGame(b)).success).toBe(true)
        const bBytes = readCareerFile(directory, b.saveId, "primary.json")

        // One damaged primary: that career recovers from its own backup, the other is untouched.
        fs.writeFileSync(careerFile(directory, a.saveId, "primary.json"), '{"saveId":"torn')
        const recovered = await electronManager(directory).manager.loadGame(a.saveId)
        expect(recovered.save?.currentWeek).toBe(1)
        expect(recovered.restoredFromBackup).toBe(true)
        expect(readCareerFile(directory, a.saveId, "backup-corrupt.json")).toBe('{"saveId":"torn')
        expect((await electronManager(directory).manager.loadGame(b.saveId)).save?.currentWeek).toBe(3)

        // Every copy of one career damaged: only that career fails.
        for (const file of fs.readdirSync(path.join(directory, "saves", a.saveId))) fs.writeFileSync(careerFile(directory, a.saveId, file), "\u0000")
        const lost = await electronManager(directory).manager.loadGame(a.saveId)
        expect(lost.save).toBeNull()
        const other = await electronManager(directory).manager.loadGame(b.saveId)
        expect(other.save?.currentWeek).toBe(3)
        expect(other.restoredFromBackup).toBeUndefined()
        expect(readCareerFile(directory, b.saveId, "primary.json")).toBe(bBytes)
        const listed = await electronManager(directory).manager.getSaveSlots()
        expect(listed.map(slot => slot.saveId)).toEqual(expect.arrayContaining([b.saveId]))
    })

    test("career IDs that are not safe file names are rejected before any path is built", async () => {
        const { keyLocation, createGameStorage } = require("../electron/game-storage")
        const { storageKey } = require("../electron/ipc-policy")
        const allowAny = (key: unknown) => typeof key === "string"
        for (const key of ["esports_save_../../evil", "esports_save_a/b", "esports_save_a\\b", "esports_backup_..", "esports_save_C:evil", "esports_week_tick_state_x.y", "esports_save_CON", "esports_backup_nul_1", "esports_save_" + "x".repeat(226)]) {
            expect(() => keyLocation(key, allowAny)).toThrow(/safe file name/)
        }
        expect(keyLocation("esports_backup_save_1_2_corrupt", storageKey)).toEqual({ dir: "saves/save_1_2", file: "backup-corrupt.json" })
        expect(keyLocation("window", storageKey)).toBeNull()

        // Second layer: the storage module itself refuses, even with a permissive key predicate.
        const storage = createGameStorage({ root: directory, isStorageKey: allowAny, maxValueBytes: 1024 })
        expect(() => storage.setItem("esports_save_../../evil", "x")).toThrow()
        expect(fs.existsSync(path.join(directory, "..", "evil"))).toBe(false)

        // Through the real IPC handlers: rejected with the contract fallback and nothing written.
        const harness = electronHarness(directory)
        for (const key of ["esports_save_CON", "esports_save_../x", "esports_backup_..%2fx"]) {
            expect(await harness.invoke("storage-set-item", key, "bad")).toBe(false)
            expect(await harness.invoke("storage-remove-item", key)).toBe(false)
        }
        expect(fs.existsSync(path.join(directory, "saves"))).toBe(false)

        // A career directory replaced by a link/junction is refused, not followed.
        const outside = fs.mkdtempSync(path.join(directory, "outside-"))
        fs.mkdirSync(path.join(directory, "saves"), { recursive: true })
        fs.symlinkSync(outside, path.join(directory, "saves", "save_linked"), "junction")
        expect(await harness.invoke("storage-set-item", "esports_save_save_linked", "x")).toBe(false)
        expect(await harness.invoke("storage-get-item", "esports_save_save_linked")).toEqual({ error: expect.any(String) })
        expect(fs.readdirSync(outside)).toEqual([])
    })
})

// ===== Electron: one-time import from the legacy single config.json =====

describe("legacy config.json import", () => {
    let directory: string
    beforeAll(() => debouncedStorage.flush())
    beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), "esim-save-fault-")) })
    afterEach(() => {
        expect(path.basename(directory)).toMatch(/^esim-save-fault-/)
        fs.rmSync(directory, { recursive: true, force: true })
    })

    /** A config.json exactly as an older build left it: settings plus every career and backup. */
    async function writeLegacyConfig(dir: string) {
        const storage = new FixtureStorage()
        const manager = new SaveManager(storage)
        const a = career(1)
        const b = { ...career(5, "weak-club"), saveId: "save_legacy_b" }
        for (const week of [1, 2, 3, 4]) expect((await manager.saveGame({ ...a, currentWeek: week })).success).toBe(true)
        expect((await manager.saveGame(b)).success).toBe(true)
        storage.data.set(backupKey(a.saveId, "_corrupt"), "{quarantined")
        storage.data.set("esports-sim-storage", '{"state":{"theme":"dark"}}')
        storage.data.set("cs2_manager_career_profile", '{"careers":2}')
        const config = { window: { width: 1600, height: 900, x: 10, y: 20, fullscreen: false, maximized: true }, ...Object.fromEntries(storage.data) }
        fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(config, null, "\t"))
        return { legacy: new Map(storage.data), a, b, bytes: fs.readFileSync(path.join(dir, "config.json")) }
    }

    async function readAll(dir: string, faults?: FaultFs) {
        const harness = electronHarness(dir, faults)
        const keys: string[] = await harness.invoke("storage-get-all-keys")
        const values = new Map<string, string>()
        for (const key of keys) values.set(key, await harness.invoke("storage-get-item", key))
        return { harness, values }
    }

    test("import is lossless: every legacy key reads back byte-identical from its own file, and careers load", async () => {
        const { legacy, a, b, bytes } = await writeLegacyConfig(directory)
        expect(legacy.has(backupKey(a.saveId, "_3"))).toBe(true)
        const { values } = await readAll(directory)
        expect(values).toEqual(legacy)
        expect(readCareerFile(directory, a.saveId, "backup-3.json")).toBe(legacy.get(backupKey(a.saveId, "_3")))
        expect(readCareerFile(directory, a.saveId, "backup-corrupt.json")).toBe("{quarantined")
        expect(readCareerFile(directory, b.saveId, "primary.json")).toBe(legacy.get(primaryKey(b.saveId)))
        expect(JSON.parse(fs.readFileSync(path.join(directory, "storage-migration.json"), "utf8"))).toMatchObject({ complete: true, sourceStatus: "readable" })
        const { manager } = electronManager(directory)
        expect((await manager.loadGame(a.saveId)).save?.currentWeek).toBe(4)
        expect((await manager.loadGame(b.saveId)).save?.currentWeek).toBe(5)
        // The legacy file is left exactly as it was (read-only fallback for support).
        expect(fs.readFileSync(path.join(directory, "config.json")).equals(bytes)).toBe(true)
    })

    test("import is idempotent and never overwrites a newer per-file copy", async () => {
        const { legacy, a, bytes } = await writeLegacyConfig(directory)
        await readAll(directory)
        // Relaunch: marker present, no writes at all.
        const quiet = new FaultFs()
        expect((await readAll(directory, quiet)).values).toEqual(legacy)
        expect(quiet.steps).toBe(0)

        // Play on after the import, then lose the marker: re-running keeps the newer career.
        expect((await electronManager(directory).manager.saveGame({ ...career(1), currentWeek: 9 })).success).toBe(true)
        const newer = readCareerFile(directory, a.saveId, "primary.json")
        fs.rmSync(path.join(directory, "storage-migration.json"))
        const again = await readAll(directory)
        expect(again.values.get(primaryKey(a.saveId))).toBe(newer)
        expect(JSON.parse(fs.readFileSync(path.join(directory, "storage-migration.json"), "utf8")).copied).toEqual([])
        expect((await electronManager(directory).manager.loadGame(a.saveId)).save?.currentWeek).toBe(9)

        // A career deleted after the import stays deleted; config.json is still untouched.
        expect((await electronManager(directory).manager.deleteSave(a.saveId)).success).toBe(true)
        expect((await readAll(directory)).values.has(primaryKey(a.saveId))).toBe(false)
        expect(fs.readFileSync(path.join(directory, "config.json")).equals(bytes)).toBe(true)
    })

    test("a crash at any step of the import loses nothing, and the next launch finishes it", async () => {
        const probeDir = fs.mkdtempSync(path.join(directory, "probe-"))
        const { legacy } = await writeLegacyConfig(probeDir)
        const probe = new FaultFs()
        await readAll(probeDir, probe)
        const importSteps = probe.steps
        expect(importSteps).toBeGreaterThanOrEqual(legacy.size * 3)

        for (let completed = 0; completed < importSteps; completed += completed < 6 ? 1 : 5) {
            const dir = fs.mkdtempSync(path.join(directory, "import-"))
            const crashDir = fs.mkdtempSync(path.join(directory, "import-crash-"))
            // The exact same legacy file every time, so each crash point is comparable.
            fs.copyFileSync(path.join(probeDir, "config.json"), path.join(dir, "config.json"))
            const bytes = fs.readFileSync(path.join(dir, "config.json"))
            const faults = new FaultFs()
            faults.after = step => { if (step === completed) fs.cpSync(dir, crashDir, { recursive: true }) }
            if (completed === 0) fs.cpSync(dir, crashDir, { recursive: true })
            await readAll(dir, faults)

            // Relaunch on the killed disk: everything is visible and import completes.
            const relaunched = await readAll(crashDir)
            expect(relaunched.values).toEqual(legacy)
            expect(fs.existsSync(path.join(crashDir, "storage-migration.json"))).toBe(true)
            expect(strayTemps(crashDir)).toEqual([])
            expect(fs.readFileSync(path.join(crashDir, "config.json")).equals(bytes)).toBe(true)
        }
    }, 120_000)

    test("an import that cannot write keeps legacy careers readable, refuses deletes, and completes once space returns", async () => {
        const { legacy, a, bytes } = await writeLegacyConfig(directory)
        const full = new FaultFs()
        full.failFrom = 4
        const { values, harness } = await readAll(directory, full)
        expect(values).toEqual(legacy)
        expect(fs.existsSync(path.join(directory, "storage-migration.json"))).toBe(false)
        // Deleting a career that still only exists in config.json would be undone by the import.
        expect(await harness.invoke("storage-remove-item", primaryKey(a.saveId))).toBe(false)
        expect(await harness.invoke("storage-clear")).toBe(false)

        const { values: after } = await readAll(directory)
        expect(after).toEqual(legacy)
        expect(fs.existsSync(path.join(directory, "storage-migration.json"))).toBe(true)
        expect(fs.readFileSync(path.join(directory, "config.json")).equals(bytes)).toBe(true)
    })

    test("window placement is carried over from config.json into the separate settings store", async () => {
        await writeLegacyConfig(directory)
        const harness = electronHarness(directory)
        const context = harness.contexts["main.js"]
        expect(vm.runInContext("legacyWindowState(app.getPath('userData'))", context)).toMatchObject({ width: 1600, height: 900, maximized: true })
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
