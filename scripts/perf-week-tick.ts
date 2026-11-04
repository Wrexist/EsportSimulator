/**
 * Week-tick profiler through the real store coordinator (HOME-08).
 *
 * Starts a seeded career from the shipped snapshot (daily mode, as a new
 * career), plays the managed club's matches with simulateInstantMatch and
 * advances with advanceToWeekEnd, so every week tick runs the same path as
 * Continue / Skip week in the game (advanceWeek → worker bridge, synchronous
 * in Node → commit → post-steps → saveGame). Prints per-tick wall time, the
 * coordinator phases and the engine steps (ESM_PERF_TRACE_STEPS=1), and a
 * hash of the final canonical save so a speedup can be checked to give the
 * same result for the same seed.
 *
 *   ESM_PERF_TRACE_STEPS=1 npx tsx scripts/perf-week-tick.ts --weeks=8 --seed=3
 *   add --cpuprofile=<file> to write a V8 CPU profile of the ticks
 */
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { Session } from "node:inspector/promises"

const argv = process.argv.slice(2)
const arg = (key: string, fallback: string) => argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback
const WEEKS = Number(arg("weeks", "8"))
const SEED = Number(arg("seed", "3"))
const PROFILE = arg("cpuprofile", "")

function mulberry32(a: number) {
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

async function main() {
    const random = mulberry32(SEED)
    Math.random = () => random()
    globalThis.crypto.getRandomValues = (<T extends ArrayBufferView | null>(array: T): T => {
        const view = array as unknown as { length: number; BYTES_PER_ELEMENT: number; [i: number]: number }
        for (let i = 0; i < view.length; i++) view[i] = Math.floor(random() * 2 ** (8 * view.BYTES_PER_ELEMENT))
        return array
    }) as Crypto["getRandomValues"]

    const { useGameStore } = await import("../store/game-store")
    const { snapshotLoader } = await import("../data")
    const { buildSaveSnapshot } = await import("../store/utils/build-save-snapshot")
    const { canonicalWeekState } = await import("../engine/worker/week-replay")
    const { perfTrace } = await import("../engine/perf-trace")
    const get = () => useGameStore.getState()

    ;(snapshotLoader as unknown as { snapshotPath: string }).snapshotPath = path.join(process.cwd(), "public/data/snapshot")
    const loaded = await snapshotLoader.loadSnapshot()
    if (!loaded.success) throw Error(loaded.error)
    const ranked = [...snapshotLoader.getSnapshot()!.teams].filter(t => t.rosterIds.length >= 5).sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id))
    const club = ranked[130 + (SEED * 7) % 40] ?? ranked[ranked.length - 1]
    const realNow = Date.now
    Date.now = () => 1_700_000_000_000 + SEED
    try { await get().initializeNewGame(`perf-${SEED}`, club.id) } finally { Date.now = realNow }
    if (get().error || !get().playerTeamId) throw Error(`init failed: ${get().error}`)
    // new Date() (not Date.now) stamps these two: pin them so runs compare.
    useGameStore.setState({ lastRngSeed: SEED, createdAt: "2026-01-06T00:00:00.000Z", gameStartDate: "2026-01-06T00:00:00.000Z" } as never)
    const teamId = get().playerTeamId!
    console.log(`[perf-week] club=${club.name} mode=${get().timeMode} weeks=${WEEKS} seed=${SEED}`)

    // Time each advanceWeek (the tick) from its call to its resolution.
    // With --cpuprofile, each tick is profiled on its own (<file>.<n>.cpuprofile).
    let session: Session | null = null
    if (PROFILE) {
        session = new Session()
        session.connect()
        await session.post("Profiler.enable")
        await session.post("Profiler.setSamplingInterval", { interval: 200 })
    }
    // Count full saves (SaveManager.saveGame) inside each tick.
    const { saveManager } = await import("../engine/save-manager")
    let savesInTick = 0
    let inTick = false
    const originalSave = saveManager.saveGame.bind(saveManager)
    saveManager.saveGame = (save => {
        if (inTick) savesInTick++
        return originalSave(save)
    }) as typeof saveManager.saveGame
    // PERF_SAVE_STACKS=1: who asked the store for a save during a tick.
    const originalStoreSave = get().saveGame
    useGameStore.setState({
        saveGame: () => {
            if (inTick && process.env.PERF_SAVE_STACKS === "1") console.log("    store.saveGame from:", (new Error().stack ?? "").split("\n").slice(2, 6).map(l => l.trim().replace(/\(.*worktrees\/[^/]+\//, "(")).join(" | "))
            return originalStoreSave()
        },
    } as never)
    const ticks: number[] = []
    const originalAdvanceWeek = get().advanceWeek
    useGameStore.setState({
        advanceWeek: async () => {
            if (session) await session.post("Profiler.start")
            const t0 = performance.now()
            inTick = true; savesInTick = 0
            await originalAdvanceWeek()
            inTick = false
            ticks.push(performance.now() - t0)
            console.log(`    (tick: ${savesInTick} save(s))`)
            if (session) {
                const { profile } = await session.post("Profiler.stop")
                fs.writeFileSync(`${PROFILE}.${ticks.length}.cpuprofile`, JSON.stringify(profile))
            }
        },
    } as never)

    const t0 = performance.now()
    for (let w = 0; w < WEEKS; w++) {
        const start = get().currentWeek
        for (let guard = 0; guard < 30 && get().currentWeek === start && !get().gameOverReason; guard++) {
            const s = get()
            const done = new Set(s.completedMatches.map(m => m.id))
            const pending = s.scheduledMatches
                .filter(m => m.week === s.currentWeek && (m.homeTeamId === teamId || m.awayTeamId === teamId) && !done.has(m.id))
                .sort((a, b) => (a.day ?? 6) - (b.day ?? 6) || a.id.localeCompare(b.id))
            if (pending.length && !(s.timeMode === "HYBRID_DAILY" && s.currentDay < (pending[0].day ?? 6))) {
                const before = s.completedMatches.length
                await get().simulateInstantMatch(pending[0].id)
                if (get().completedMatches.length !== before) continue
            }
            await get().advanceToWeekEnd()
            if (get().error) throw Error(`advance error: ${get().error}`)
        }
        console.log(`  week ${start} → ${get().currentWeek}: tick ${ticks[ticks.length - 1]?.toFixed(0) ?? "?"} ms`)
    }
    const total = performance.now() - t0

    if (session) console.log(`[perf-week] wrote ${ticks.length} profiles to ${PROFILE}.<n>.cpuprofile`)

    const sorted = [...ticks].sort((a, b) => a - b)
    const mean = ticks.reduce((a, b) => a + b, 0) / Math.max(1, ticks.length)
    console.log(`[perf-week] ticks=${ticks.length} mean=${mean.toFixed(0)} ms median=${sorted[Math.floor(sorted.length / 2)]?.toFixed(0)} ms max=${sorted[sorted.length - 1]?.toFixed(0)} ms total(run)=${total.toFixed(0)} ms`)
    const canonical = canonicalWeekState(buildSaveSnapshot(get() as never) as never)
    const hash = crypto.createHash("sha256").update(canonical).digest("hex")
    const dump = arg("dump", "")
    if (dump) fs.writeFileSync(dump, canonical)
    console.log(`[perf-week] final week=${get().currentWeek} saveHash=${hash}`)
    if (perfTrace.stepsEnabled) perfTrace.flush()
}

main().then(() => process.exit(0), e => { console.error(e); process.exit(1) })
