/**
 * L27: week-tick, save/load and instant-match timings through the REAL
 * application coordinator (useGameStore.advanceWeek -> bridge -> computeWeek ->
 * commit -> post-week -> saveGame), on early, mid and late careers.
 *
 *   node --expose-gc --max-old-space-size=4096 node_modules/tsx/dist/cli.mjs scripts/launch/l27-career-performance.ts \
 *        --label=before --scenario=late --save=tmp/l27/seed-1-top-final.json.gz --weeks=12
 *   ... --scenario=early --weeks=52              (fresh career, 52-week soak)
 *
 * Node has no Web Worker, so the bridge uses its synchronous fallback: the
 * "04_compute" phase is the work the packaged app runs in its worker thread;
 * every other coord.* / save.* phase runs on the renderer main thread.
 * Storage is the in-memory adapter; real disk cost is measured separately with
 * electron/game-storage.js (the packaged app's main-process writer).
 *
 * Output: docs/launch-readiness/evidence/L27-career-<label>-<scenario>.json
 * Per-week state hashes allow byte-level before/after comparison.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'

process.env.ESM_PERF_TRACE_STEPS = '1'
const root = process.cwd()
const argv = process.argv.slice(2)
const arg = (key: string, fallback: string) => argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback
const label = arg('label', 'run')
const scenario = arg('scenario', 'early')
const weeks = Number(arg('weeks', '12'))
const warmup = Number(arg('warmup', '2'))
const savePath = arg('save', '')
const club = arg('club', '')
if (!/^[a-z0-9-]+$/.test(label) || !/^[a-z0-9-]+$/.test(scenario)) throw Error('Invalid label/scenario')

function mulberry32(seed: number) {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6D2B79F5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}
const sha = (s: string | Buffer) => crypto.createHash('sha256').update(s).digest('hex')
const gc = () => { const g = (globalThis as { gc?: () => void }).gc; if (g) { g(); g() } }
const stats = (values: number[]) => {
    const s = [...values].sort((a, b) => a - b)
    if (!s.length) return null
    const mean = s.reduce((a, b) => a + b, 0) / s.length
    const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length)
    const q = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]
    return { n: s.length, min: +s[0].toFixed(1), median: +((s[Math.floor((s.length - 1) / 2)] + s[Math.floor(s.length / 2)]) / 2).toFixed(1), mean: +mean.toFixed(1), sd: +sd.toFixed(1), p90: +q(0.9).toFixed(1), max: +s[s.length - 1].toFixed(1) }
}

async function main() {
    const random = mulberry32(27027)
    Math.random = () => random()
    const { useGameStore, waitForPendingGameSave } = await import('../../store/game-store')
    const { snapshotLoader } = await import('../../data')
    const { buildSaveSnapshot } = await import('../../store/utils/build-save-snapshot')
    const { canonicalWeekState } = await import('../../engine/worker/week-replay')
    const { perfTrace } = await import('../../engine/perf-trace')
    const { saveManager } = await import('../../engine/save-manager')
    const { asyncStorage } = await import('../../engine/storage-adapter')
    const { buildEntityIndexes } = await import('../../store/indexes')
    const { STORAGE_KEYS } = await import('../../engine/save-types')
    type GameSave = import('../../engine/save-types').GameSave
    const get = () => useGameStore.getState()
    const snap = (): GameSave => buildSaveSnapshot(get() as never) as GameSave
    const hashes = (s: GameSave) => {
        const full = canonicalWeekState(s)
        const parsed = JSON.parse(full)
        const history = parsed.fplData?.matchHistory ?? []
        if (parsed.fplData) delete parsed.fplData.matchHistory
        return { full: sha(full).slice(0, 16), withoutFplHistory: sha(JSON.stringify(parsed)).slice(0, 16), fplHistoryLength: history.length, fplHistoryTail200: sha(JSON.stringify(history.slice(-200))).slice(0, 16) }
    }

    ;(snapshotLoader as unknown as { snapshotPath: string }).snapshotPath = path.join(root, 'public/data/snapshot')
    const loaded = await snapshotLoader.loadSnapshot()
    if (!loaded.success) throw Error(loaded.error)

    const setup: Record<string, unknown> = { scenario }
    if (!savePath) {
        const ranked = [...snapshotLoader.getSnapshot()!.teams].filter(t => t.rosterIds.length >= 5).sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id))
        const teamId = club || ranked[7].id
        const start = performance.now()
        await get().initializeNewGame('L27 measurement', teamId)
        setup.initializeNewGameMs = +(performance.now() - start).toFixed(1)
        if (!get().playerTeamId) throw Error(`init failed: ${get().error}`)
        // Fixed identity/clock fields so two runs produce comparable state hashes.
        useGameStore.setState({ lastRngSeed: 27027, saveId: 'save_l27_early', gameStartDate: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' } as never)
        setup.club = teamId
    } else {
        const raw = zlib.gunzipSync(fs.readFileSync(path.join(root, savePath)))
        const save = JSON.parse(raw.toString('utf8')) as GameSave
        setup.inputFile = savePath
        setup.inputSha256 = sha(raw)
        setup.inputChars = raw.length
        setup.inputWeek = save.currentWeek
        // Real path first: signed write through SaveManager, then store.loadGame.
        const written = await saveManager.saveGame(save)
        const start = performance.now()
        let viaLoadGame = false
        try { await get().loadGame(save.saveId); viaLoadGame = true } catch (error) { setup.loadGameError = String(error instanceof Error ? error.message : error) }
        setup.firstLoadMs = +(performance.now() - start).toFixed(1)
        setup.firstSaveOk = written.success
        if (!viaLoadGame) {
            // Oversized saves are refused by SaveManager.loadGame (32 MiB guard).
            // Inject the identical state so the tick itself can still be measured.
            useGameStore.setState({ ...save, isInitialized: true, isLoading: false, error: null } as never)
            const s = get()
            useGameStore.setState(buildEntityIndexes(s.teams, s.players, s.contracts, s.staff, s.completedMatches))
            setup.injected = 'setState (loadGame refused the input)'
        }
        setup.viaLoadGame = viaLoadGame
    }
    useGameStore.setState({ timeMode: 'WEEKLY' } as never)
    const exportPath = arg('export', '')
    if (exportPath) {
        // Freeze a fresh career once so before/after runs start from identical bytes.
        fs.writeFileSync(path.join(root, exportPath), zlib.gzipSync(JSON.stringify(snap())))
        process.stdout.write(`exported ${exportPath}\n`)
        process.exit(0)
    }

    const instantMs: number[] = []
    const ownMatchIds = () => {
        const s = get(), done = new Set(s.completedMatches.map(m => m.id))
        return s.scheduledMatches.filter(m => m.week === s.currentWeek && (m.homeTeamId === s.playerTeamId || m.awayTeamId === s.playerTeamId) && !done.has(m.id)).map(m => m.id)
    }
    const rows: Array<Record<string, unknown>> = []
    const t0Heap = (gc(), process.memoryUsage().heapUsed)
    for (let i = 0; i < warmup + weeks; i++) {
        const tried = new Set<string>()
        for (let guard = 0; guard < 10; guard++) {
            const id = ownMatchIds().find(x => !tried.has(x))
            if (!id) break
            tried.add(id)
            const s0 = performance.now()
            await get().simulateInstantMatch(id)
            if (get().completedMatches.some(m => m.id === id)) instantMs.push(performance.now() - s0)
        }
        await waitForPendingGameSave()
        perfTrace.reset()
        const week = get().currentWeek
        const start = performance.now()
        await get().advanceWeek()
        const wallMs = performance.now() - start
        if (get().currentWeek !== week + 1) throw Error(`Week did not advance at ${week}: ${get().error}`)
        const phases = Object.fromEntries(Object.entries(perfTrace.snapshot()).map(([k, v]) => [k, +v.totalMs.toFixed(1)]))
        gc()
        const s = snap()
        const primary = await asyncStorage.getItem(STORAGE_KEYS.SAVE_PREFIX + s.saveId)
        const row = { week: s.currentWeek, warmup: i < warmup, wallMs: +wallMs.toFixed(1), phases, heapUsedMB: +(process.memoryUsage().heapUsed / 1048576).toFixed(1),
            players: s.players.length, activePlayers: s.players.filter(p => !p.isRetired).length, savedChars: primary?.length ?? 0, rng: s.lastRngSeed, hash: hashes(s) }
        rows.push(row)
        process.stdout.write(`${scenario} w${row.week} ${row.wallMs}ms heap ${row.heapUsedMB}MB save ${(row.savedChars / 1048576).toFixed(1)}MiB compute ${phases['coord.04_compute']} save ${phases['coord.11_save']}\n`)
    }

    // Save / load samples on the final state.
    const saveSamples: Array<{ ms: number; phases: Record<string, number> }> = []
    for (let i = 0; i < 4; i++) {
        await waitForPendingGameSave()
        perfTrace.reset()
        const start = performance.now()
        await get().saveGame()
        saveSamples.push({ ms: performance.now() - start, phases: Object.fromEntries(Object.entries(perfTrace.snapshot()).map(([k, v]) => [k, +v.totalMs.toFixed(1)])) })
    }
    const saveId = get().saveId!
    const primary = (await asyncStorage.getItem(STORAGE_KEYS.SAVE_PREFIX + saveId)) ?? ''
    const parseMs: number[] = []
    for (let i = 0; i < 4; i++) { const s0 = performance.now(); JSON.parse(primary); parseMs.push(performance.now() - s0) }
    const loadSamples: number[] = []
    let loadError: string | null = null
    for (let i = 0; i < 4; i++) {
        const start = performance.now()
        try { await get().loadGame(saveId); loadSamples.push(performance.now() - start) } catch (error) { loadError = String(error instanceof Error ? error.message : error); break }
    }
    // Packaged main-process writer: temp file + fsync + rename, then read back.
    const disk: Record<string, unknown> = {}
    {
        const { createGameStorage } = require(path.join(root, 'electron/game-storage.js'))
        const diskRoot = path.join(root, 'tmp/l27/disk', `${label}-${scenario}`)
        fs.rmSync(diskRoot, { recursive: true, force: true })
        fs.mkdirSync(diskRoot, { recursive: true })
        const storage = createGameStorage({ root: diskRoot, isStorageKey: (k: string) => /^esports_/.test(k), maxValueBytes: 1024 * 1024 * 1024 })
        const writeMs: number[] = [], readMs: number[] = []
        for (let i = 0; i < 4; i++) {
            let s0 = performance.now(); storage.setItem(STORAGE_KEYS.SAVE_PREFIX + saveId, primary); writeMs.push(performance.now() - s0)
            s0 = performance.now(); const back = storage.getItem(STORAGE_KEYS.SAVE_PREFIX + saveId); readMs.push(performance.now() - s0)
            if (back !== primary) throw Error('disk read-back mismatch')
        }
        Object.assign(disk, { drive: path.parse(diskRoot).root, bytes: Buffer.byteLength(primary), writeMs: stats(writeMs), readMs: stats(readMs),
            note: 'One write = temp file + fsync + rename (electron/game-storage.js). A full SaveManager commit performs up to 5 writes and 5 reads of this size (3 backup rotations, staging, primary, 2 verifications).' })
        fs.rmSync(diskRoot, { recursive: true, force: true })
    }

    const measured = rows.filter(r => !r.warmup)
    const phaseNames = [...new Set(measured.flatMap(r => Object.keys(r.phases as object)))].sort()
    const result = {
        version: 1, label, scenario, recordedAt: new Date().toISOString(),
        host: { cpu: os.cpus()[0].model, logicalCpus: os.cpus().length, ramBytes: os.totalmem(), os: `${os.type()} ${os.release()}`, node: process.version },
        method: { driver: 'useGameStore.advanceWeek (real coordinator); own fixtures played with simulateInstantMatch first', worker: 'Node has no Web Worker: bridge synchronous fallback; coord.04_compute = worker-thread work in the app', storage: 'in-memory adapter for the timed save; disk cost measured separately', warmupWeeks: warmup, measuredWeeks: weeks, forcedGc: typeof (globalThis as { gc?: unknown }).gc === 'function' },
        setup, sourceHashes: Object.fromEntries(['store/game-store.ts', 'engine/save-manager.ts', 'engine/atomic-week-processor.ts', 'engine/fpl-engine.ts', 'store/utils/array-pruning.ts'].map(f => [f, sha(fs.readFileSync(path.join(root, f))).slice(0, 16)])),
        summary: {
            weekWallMs: stats(measured.map(r => r.wallMs as number)),
            mainThreadMs: stats(measured.map(r => Object.entries(r.phases as Record<string, number>).filter(([k]) => k.startsWith('coord.') && k !== 'coord.04_compute').reduce((a, [, v]) => a + v, 0))),
            phases: Object.fromEntries(phaseNames.map(k => [k, stats(measured.map(r => (r.phases as Record<string, number>)[k] ?? 0))])),
            players: { first: measured[0]?.players, last: measured.at(-1)?.players },
            savedChars: { first: measured[0]?.savedChars, last: measured.at(-1)?.savedChars },
            heapUsedMB: { start: +(t0Heap / 1048576).toFixed(1), first: measured[0]?.heapUsedMB, last: measured.at(-1)?.heapUsedMB },
            instantMatchMs: stats(instantMs),
            saveGameMs: stats(saveSamples.map(s => s.ms)), savePhases: saveSamples,
            loadGameMs: stats(loadSamples), loadError, parseMs: stats(parseMs), primaryChars: primary.length, primaryGzipBytes: zlib.gzipSync(primary).length,
            disk,
        },
        weeks: rows,
    }
    const out = path.join(root, 'docs/launch-readiness/evidence', `L27-career-${label}-${scenario}.json`)
    fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n')
    process.stdout.write(`wrote ${path.relative(root, out)}\n${JSON.stringify(result.summary.weekWallMs)} main ${JSON.stringify(result.summary.mainThreadMs)}\n`)
    process.exit(0)
}
main().catch(error => { console.error(error); process.exit(1) })
