/**
 * Week-tick benchmark (HOME-08 / ENGINE-05), both calendar modes.
 *
 * Starts a seeded career from the shipped snapshot through the real store
 * (as a new career in the game), then for N weeks plays the managed club's
 * matches with simulateInstantMatch and advances the calendar:
 *   - HYBRID_DAILY: one advanceDay per day click (day 1..6 on the main
 *     thread, each playing its due AI fixtures), then the week tick;
 *   - WEEKLY: advanceToWeekEnd, i.e. the week tick plays every fixture.
 * Times every own match, day click and tick, prints a per-phase breakdown
 * (ESM_PERF_TRACE_STEPS buckets, set by this script) and a fingerprint of the
 * outcome (match results, standings, budgets, Elo, plus the hash of the whole
 * canonical save) so a speedup can be checked to leave the game unchanged.
 *
 *   npx tsx scripts/audit/week-tick-bench.ts [--weeks=6] [--seed=3] [--mode=both|daily|weekly]
 *       [--fingerprint=out-prefix] [--cpuprofile=out-prefix] [--warmup=1]
 *
 * --mode=both runs each mode in its own child process (the store is a singleton).
 * Wall times on a busy machine are noisy: compare runs back to back, and the
 * process CPU time ("cpu", includes the GC and compiler threads) alongside.
 * --warmup=K excludes the first K weeks from the timing summary (JIT warm-up;
 * they still count for the fingerprint).
 */
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { Session } from "node:inspector/promises"

const argv = process.argv.slice(2)
const arg = (key: string, fallback: string) => argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback
const WEEKS = Number(arg("weeks", "6"))
const SEED = Number(arg("seed", "3"))
const MODE = arg("mode", "both")
const WARMUP = Number(arg("warmup", "1"))
const PROFILE = arg("cpuprofile", "")
const FINGERPRINT = arg("fingerprint", "")

function mulberry32(a: number) {
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

const sum = (v: number[]) => v.reduce((a, b) => a + b, 0)
const fmt = (ms: number) => `${(ms / 1000).toFixed(2)} s`

async function runMode(mode: "HYBRID_DAILY" | "WEEKLY") {
    process.env.ESM_PERF_TRACE_STEPS = "1"
    const random = mulberry32(SEED)
    Math.random = () => random()
    globalThis.crypto.getRandomValues = (<T extends ArrayBufferView | null>(array: T): T => {
        const view = array as unknown as { length: number; BYTES_PER_ELEMENT: number; [i: number]: number }
        for (let i = 0; i < view.length; i++) view[i] = Math.floor(random() * 2 ** (8 * view.BYTES_PER_ELEMENT))
        return array
    }) as Crypto["getRandomValues"]
    // Silence the engine's console chatter (the worker fallback warning etc.).
    const log = console.log.bind(console)
    console.warn = () => {}
    console.info = () => {}
    console.debug = () => {}

    const { useGameStore } = await import("../../store/game-store")
    const { snapshotLoader } = await import("../../data")
    const { buildSaveSnapshot } = await import("../../store/utils/build-save-snapshot")
    const { canonicalWeekState } = await import("../../engine/worker/week-replay")
    const { perfTrace } = await import("../../engine/perf-trace")
    const get = () => useGameStore.getState()

    ;(snapshotLoader as unknown as { snapshotPath: string }).snapshotPath = path.join(process.cwd(), "public/data/snapshot")
    const loaded = await snapshotLoader.loadSnapshot()
    if (!loaded.success) throw Error(loaded.error)
    const ranked = [...snapshotLoader.getSnapshot()!.teams].filter(t => t.rosterIds.length >= 5).sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id))
    const club = ranked[130 + (SEED * 7) % 40] ?? ranked[ranked.length - 1]
    const realNow = Date.now
    Date.now = () => 1_700_000_000_000 + SEED
    try { await get().initializeNewGame(`bench-${SEED}`, club.id) } finally { Date.now = realNow }
    if (get().error || !get().playerTeamId) throw Error(`init failed: ${get().error}`)
    useGameStore.setState({ lastRngSeed: SEED, createdAt: "2026-01-06T00:00:00.000Z", gameStartDate: "2026-01-06T00:00:00.000Z", timeMode: mode, currentDay: mode === "HYBRID_DAILY" ? 0 : 6 } as never)
    const teamId = get().playerTeamId!
    log(`[bench] mode=${mode} club=${club.name} weeks=${WEEKS} seed=${SEED}`)

    let session: Session | null = null
    if (PROFILE) {
        session = new Session()
        session.connect()
        await session.post("Profiler.enable")
        await session.post("Profiler.setSamplingInterval", { interval: 500 })
        await session.post("Profiler.start")
    }

    // Wrap advanceWeek so the tick is timed apart from the day clicks.
    let tickMs = 0
    const originalAdvanceWeek = get().advanceWeek
    useGameStore.setState({
        advanceWeek: async () => {
            const t0 = performance.now()
            await originalAdvanceWeek()
            tickMs += performance.now() - t0
        },
    } as never)

    type Row = { week: number; own: number; days: number[]; tick: number; total: number; cpu: number; ownMatches: number; aiMatches: number }
    const rows: Row[] = []
    const runStart = performance.now()
    for (let w = 0; w < WEEKS && !get().gameOverReason; w++) {
        const start = get().currentWeek
        const completedBefore = get().completedMatches.length
        const row: Row = { week: start, own: 0, days: [], tick: 0, total: 0, cpu: 0, ownMatches: 0, aiMatches: 0 }
        const weekStart = performance.now()
        const cpuStart = process.cpuUsage()
        tickMs = 0
        for (let guard = 0; guard < 40 && get().currentWeek === start && !get().gameOverReason; guard++) {
            const s = get()
            const done = new Set(s.completedMatches.map(m => m.id))
            const pending = s.scheduledMatches
                .filter(m => m.week === s.currentWeek && (m.homeTeamId === teamId || m.awayTeamId === teamId) && !done.has(m.id))
                .sort((a, b) => (a.day ?? 6) - (b.day ?? 6) || a.id.localeCompare(b.id))
            if (pending.length && !(s.timeMode === "HYBRID_DAILY" && s.currentDay < (pending[0].day ?? 6))) {
                const before = s.completedMatches.length
                const t0 = performance.now()
                await get().simulateInstantMatch(pending[0].id)
                row.own += performance.now() - t0
                if (get().completedMatches.length !== before) { row.ownMatches++; continue }
            }
            const t0 = performance.now()
            const tickBefore = tickMs
            if (mode === "HYBRID_DAILY") await get().advanceDay()
            else await get().advanceToWeekEnd()
            const dt = performance.now() - t0 - (tickMs - tickBefore)
            if (mode === "HYBRID_DAILY" && tickMs === tickBefore) row.days.push(dt)
            if (get().error) throw Error(`advance error: ${get().error}`)
        }
        row.tick = tickMs
        row.total = performance.now() - weekStart
        const cpu = process.cpuUsage(cpuStart)
        row.cpu = (cpu.user + cpu.system) / 1000
        row.aiMatches = get().completedMatches.length - completedBefore - row.ownMatches
        rows.push(row)
        log(`  week ${String(start).padStart(2)}: total ${fmt(row.total)} (cpu ${fmt(row.cpu)})  tick ${fmt(row.tick)}  days ${fmt(sum(row.days))} (${row.days.length} clicks, max ${fmt(Math.max(0, ...row.days))})  own ${fmt(row.own)}  matches ai=${row.aiMatches} own=${row.ownMatches}`)
    }
    const runMs = performance.now() - runStart

    if (session) {
        const { profile } = await session.post("Profiler.stop")
        const file = `${PROFILE}.${mode}.cpuprofile`
        fs.writeFileSync(file, JSON.stringify(profile))
        log(`[bench] wrote ${file}`)
    }

    const timed = rows.slice(Math.min(WARMUP, Math.max(0, rows.length - 1)))
    const n = Math.max(1, timed.length)
    const per = (f: (r: Row) => number) => sum(timed.map(f)) / n
    const clicks = timed.flatMap(r => r.days)
    log(`[bench] ${mode} summary over ${timed.length} weeks (first ${rows.length - timed.length} excluded as warm-up):`)
    log(`  per week: total ${fmt(per(r => r.total))} (cpu ${fmt(per(r => r.cpu))})  tick ${fmt(per(r => r.tick))}  day clicks ${fmt(per(r => sum(r.days)))}  own match ${fmt(per(r => r.own))}  AI matches ${per(r => r.aiMatches).toFixed(0)}`)
    if (clicks.length) log(`  per day click: mean ${fmt(sum(clicks) / clicks.length)}  max ${fmt(Math.max(...clicks))}`)
    log(`  run ${fmt(runMs)}`)

    // Outcome fingerprint.
    const s = get()
    const fp = {
        week: s.currentWeek,
        matches: s.completedMatches.map(m => [m.id, m.result?.homeScore, m.result?.awayScore, m.result?.winnerId, (m.result?.maps ?? []).map((x: { homeScore?: number; awayScore?: number }) => `${x.homeScore}-${x.awayScore}`).join(","), m.result?.mvpPlayerId ?? null]),
        teams: s.teams.map(t => [t.id, Math.round(t.budget), (t as { elo?: number }).elo ?? null, t.rosterIds.join(",")]),
        standings: s.tournaments.map(t => [t.id, JSON.stringify((t as { standings?: unknown }).standings ?? null)]),
        league: JSON.stringify((s as unknown as { league?: unknown }).league ?? null),
    }
    const fpHash = crypto.createHash("sha256").update(JSON.stringify(fp)).digest("hex")
    const canonical = canonicalWeekState(buildSaveSnapshot(s as never) as never)
    const saveHash = crypto.createHash("sha256").update(canonical).digest("hex")
    if (FINGERPRINT) {
        fs.writeFileSync(`${FINGERPRINT}.${mode}.json`, JSON.stringify(fp, null, 1))
        fs.writeFileSync(`${FINGERPRINT}.${mode}.save.json`, canonical)
    }
    log(`[bench] ${mode} final week=${s.currentWeek} matches=${s.completedMatches.length} outcomeHash=${fpHash.slice(0, 16)} saveHash=${saveHash.slice(0, 16)}`)
    log(`[bench] ${mode} phase breakdown (all weeks, ms):`)
    const realLog = console.log
    console.log = (...a: unknown[]) => { const line = String(a[0] ?? ""); if (!line.includes("--- summary")) realLog(line.replace("[perf] ", "  ")) }
    perfTrace.flush()
    console.log = realLog
}

async function main() {
    if (MODE === "both") {
        for (const m of ["weekly", "daily"]) {
            const args = process.argv.slice(1).filter(a => !a.startsWith("--mode=")).concat(`--mode=${m}`)
            const r = spawnSync(process.execPath, [...process.execArgv, ...args], { stdio: "inherit" })
            if (r.status !== 0) process.exit(r.status ?? 1)
        }
        return
    }
    await runMode(MODE === "weekly" ? "WEEKLY" : "HYBRID_DAILY")
}

main().then(() => process.exit(0), e => { console.error(e); process.exit(1) })
