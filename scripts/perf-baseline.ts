/**
 * Simulation perf baseline harness.
 *
 * Boots a real save from the public snapshot, then measures:
 *   1. Single-match sim  (direct matchEngine.simulateMatch calls)
 *   2. Weekly advance tick (atomicWeekProcessor.processWeek, single week)
 *   3. Full-season sim (N sequential processWeek calls — default 52)
 *
 * Writes a Markdown report to docs/perf-baseline.md.
 *
 * Usage:
 *   npx tsx scripts/perf-baseline.ts                  # default: 200 matches, 52 weeks
 *   npx tsx scripts/perf-baseline.ts --matches=500 --weeks=26
 *
 * Reads CPU model + node version for context in the report.
 */

import { mkdir, writeFile } from "fs/promises"
import os from "os"
import path from "path"

import { SnapshotLoader } from "../data/snapshot-loader"
import { MatchEngine } from "../engine/match-engine"
import { AtomicWeekProcessor } from "../engine/atomic-week-processor"
import { SaveManager } from "../engine/save-manager"
import { SeededRNG } from "../engine/rng"
import { TournamentManager } from "../engine/tournament-manager"
import { AIManager } from "../engine/ai-manager"
import { MatchFormat } from "../types/enums"
import type { AsyncStorage } from "../engine/storage-adapter"
import type { TeamSaveData, PlayerSaveData, MatchSaveData } from "../engine/save-types"

const ROOT = path.resolve(__dirname, "..")
const DOC_PATH = path.join(ROOT, "docs", "perf-baseline.md")
const SNAPSHOT_PATH = path.join(ROOT, "public", "data", "snapshot")

// Targets per the performance task (management sim budget).
const TARGETS = {
    singleMatchMs: 100,
    fullSeasonMs: 10_000,
    dailyTickMs: 500,
}

type CliArgs = {
    matches: number
    weeks: number
    warmup: number
}

function parseArgs(): CliArgs {
    const out: CliArgs = { matches: 200, weeks: 52, warmup: 10 }
    for (const raw of process.argv.slice(2)) {
        const m = raw.match(/^--(matches|weeks|warmup)=(\d+)$/)
        if (m) {
            const key = m[1] as keyof CliArgs
            out[key] = Number.parseInt(m[2], 10)
        }
    }
    return out
}

class InMemoryStorage implements AsyncStorage {
    private store = new Map<string, string>()
    async getItem(key: string): Promise<string | null> {
        return this.store.get(key) ?? null
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

function now(): number {
    return performance.now()
}

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)))
    return sorted[idx]
}

function fmtMs(v: number): string {
    if (v >= 1000) return `${(v / 1000).toFixed(2)} s`
    if (v >= 10) return `${v.toFixed(1)} ms`
    return `${v.toFixed(2)} ms`
}

function statusFor(actual: number, target: number): string {
    const ratio = actual / target
    if (ratio <= 1) return "PASS"
    if (ratio <= 3) return "OVER"
    return "RED"
}

async function main() {
    const args = parseArgs()

    console.log(`[perf] matches=${args.matches} weeks=${args.weeks} warmup=${args.warmup}`)
    console.log(`[perf] loading snapshot from ${SNAPSHOT_PATH}`)

    const loader = new SnapshotLoader(SNAPSHOT_PATH)
    const loadRes = await loader.loadSnapshot()
    if (!loadRes.success) {
        throw new Error(`Snapshot load failed: ${loadRes.error}`)
    }
    const snapshot = loader.getSnapshot()
    if (!snapshot) throw new Error("Snapshot missing after load")

    // --- Pick a mid-tier team for the session ---
    const teams = snapshot.teams as unknown as TeamSaveData[]
    const seedTeam = teams.find(t => t.tier === "PRO") ?? teams[0]
    if (!seedTeam) throw new Error("No teams in snapshot")

    const save = loader.createCareerFromSnapshot("PerfBench", seedTeam.id, 1)
    if (!save) throw new Error("createCareerFromSnapshot returned null")
    AIManager.initializeTeamData(save)

    // --- 1) Single-match sim benchmark ---
    console.log(`[perf] running ${args.matches} single-match sims (bo3, random team pairs)…`)
    const matchEngine = new MatchEngine()
    const matchRng = new SeededRNG(0xc0ffee)

    const eligibleTeams = (save.teams as TeamSaveData[]).filter(t => {
        const roster = t.rosterIds
            .map(id => save.players.find(p => p.id === id))
            .filter((p): p is PlayerSaveData => !!p)
        return roster.length >= 5
    })
    if (eligibleTeams.length < 2) throw new Error(`Not enough teams with full rosters (${eligibleTeams.length})`)

    const rosterCache = new Map<string, PlayerSaveData[]>()
    const getRoster = (t: TeamSaveData) => {
        let r = rosterCache.get(t.id)
        if (!r) {
            r = t.rosterIds
                .map(id => save.players.find(p => p.id === id))
                .filter((p): p is PlayerSaveData => !!p)
                .slice(0, 5)
            rosterCache.set(t.id, r)
        }
        return r
    }

    const pickPair = (i: number): [TeamSaveData, TeamSaveData] => {
        const a = eligibleTeams[i % eligibleTeams.length]
        const b = eligibleTeams[(i * 7 + 3) % eligibleTeams.length]
        return a.id === b.id
            ? [a, eligibleTeams[(i + 1) % eligibleTeams.length]]
            : [a, b]
    }

    // warm-up (JIT)
    for (let i = 0; i < args.warmup; i++) {
        const [h, a] = pickPair(i)
        const ms: MatchSaveData = {
            id: `warm_${i}`,
            week: 1,
            homeTeamId: h.id,
            awayTeamId: a.id,
            format: MatchFormat.BO3,
            seed: 100 + i,
        } as MatchSaveData
        matchEngine.simulateMatch(ms, h, a, getRoster(h), getRoster(a), matchRng, 0, 0, [], [])
    }

    const singleMatchDurations: number[] = []
    for (let i = 0; i < args.matches; i++) {
        const [h, a] = pickPair(i + 1000)
        const ms: MatchSaveData = {
            id: `perf_${i}`,
            week: 1,
            homeTeamId: h.id,
            awayTeamId: a.id,
            format: MatchFormat.BO3,
            seed: 1_000_000 + i,
        } as MatchSaveData
        const t0 = now()
        matchEngine.simulateMatch(ms, h, a, getRoster(h), getRoster(a), matchRng, 0, 0, [], [])
        singleMatchDurations.push(now() - t0)
    }
    const sortedMatch = [...singleMatchDurations].sort((a, b) => a - b)
    const matchStats = {
        count: singleMatchDurations.length,
        totalMs: singleMatchDurations.reduce((s, v) => s + v, 0),
        avgMs: singleMatchDurations.reduce((s, v) => s + v, 0) / singleMatchDurations.length,
        minMs: sortedMatch[0],
        maxMs: sortedMatch[sortedMatch.length - 1],
        medianMs: percentile(sortedMatch, 50),
        p95Ms: percentile(sortedMatch, 95),
        p99Ms: percentile(sortedMatch, 99),
    }

    // --- 2) Weekly tick benchmark (single week, on top of an already-initialised save) ---
    console.log(`[perf] running single weekly tick…`)
    const storage = new InMemoryStorage()
    const manager = new SaveManager(storage)
    const processor = new AtomicWeekProcessor(manager)

    // Warm up one week first (snapshot state, first tick tends to do migration-y work)
    {
        const weekRng = new SeededRNG(save.lastRngSeed || 1)
        TournamentManager.simulateWeeklyRegistrationsV2(save, save.currentWeek, weekRng)
        await processor.processWeek(save, { playerTeamId: save.playerTeamId, trainingFocus: new Map() as any }, weekRng)
    }

    const singleWeekRng = new SeededRNG(save.lastRngSeed || 2)
    TournamentManager.simulateWeeklyRegistrationsV2(save, save.currentWeek, singleWeekRng)
    const tWeek0 = now()
    const singleWeekResult = await processor.processWeek(
        save,
        { playerTeamId: save.playerTeamId, trainingFocus: new Map() as any },
        singleWeekRng
    )
    const singleWeekMs = now() - tWeek0
    const singleWeekMatches = singleWeekResult.matchesPlayed

    // --- 3) Full-season benchmark ---
    console.log(`[perf] running ${args.weeks} weeks (full-season proxy)…`)
    const seasonWeekDurations: number[] = []
    let seasonMatches = 0
    const seasonT0 = now()
    for (let w = 0; w < args.weeks; w++) {
        const weekRng = new SeededRNG(save.lastRngSeed || (100 + w))
        TournamentManager.simulateWeeklyRegistrationsV2(save, save.currentWeek, weekRng)
        const tw0 = now()
        const r = await processor.processWeek(
            save,
            { playerTeamId: save.playerTeamId, trainingFocus: new Map() as any },
            weekRng
        )
        const dt = now() - tw0
        seasonWeekDurations.push(dt)
        if (r.success) seasonMatches += r.matchesPlayed
        if ((w + 1) % 10 === 0 || w === args.weeks - 1) {
            console.log(`  week ${w + 1}/${args.weeks}: ${dt.toFixed(0)}ms (matches=${r.matchesPlayed})`)
        }
    }
    const seasonTotalMs = now() - seasonT0
    const sortedWeek = [...seasonWeekDurations].sort((a, b) => a - b)
    const seasonStats = {
        weeks: args.weeks,
        totalMs: seasonTotalMs,
        sumWeekMs: seasonWeekDurations.reduce((s, v) => s + v, 0),
        avgWeekMs: seasonWeekDurations.reduce((s, v) => s + v, 0) / seasonWeekDurations.length,
        medianWeekMs: percentile(sortedWeek, 50),
        p95WeekMs: percentile(sortedWeek, 95),
        maxWeekMs: sortedWeek[sortedWeek.length - 1],
        matchesSimulated: seasonMatches,
        avgMsPerMatch: seasonMatches > 0 ? seasonTotalMs / seasonMatches : 0,
    }

    // --- Report ---
    const cpu = os.cpus()[0]
    const report = buildReport(args, matchStats, singleWeekMs, singleWeekMatches, seasonStats, {
        node: process.version,
        cpu: cpu?.model ?? "unknown",
        platform: `${process.platform} ${process.arch}`,
        memGB: (os.totalmem() / 1024 / 1024 / 1024).toFixed(1),
    })

    await mkdir(path.dirname(DOC_PATH), { recursive: true })
    await writeFile(DOC_PATH, report, "utf8")
    console.log(`[perf] wrote ${DOC_PATH}`)
}

function buildReport(
    args: CliArgs,
    match: {
        count: number
        totalMs: number
        avgMs: number
        minMs: number
        maxMs: number
        medianMs: number
        p95Ms: number
        p99Ms: number
    },
    singleWeekMs: number,
    singleWeekMatches: number,
    season: {
        weeks: number
        totalMs: number
        sumWeekMs: number
        avgWeekMs: number
        medianWeekMs: number
        p95WeekMs: number
        maxWeekMs: number
        matchesSimulated: number
        avgMsPerMatch: number
    },
    env: { node: string; cpu: string; platform: string; memGB: string }
): string {
    const matchStatus = statusFor(match.avgMs, TARGETS.singleMatchMs)
    const seasonStatus = statusFor(season.totalMs, TARGETS.fullSeasonMs)
    // "Daily tick" target = 500 ms; this codebase uses weekly ticks only, so
    // the apples-to-apples budget for a weekly tick is 500 ms × 7 = 3500 ms.
    // We still record against both so the numbers in the doc are comparable.
    const weeklyTickBudgetMs = TARGETS.dailyTickMs * 7
    const weeklyStatus = statusFor(singleWeekMs, weeklyTickBudgetMs)

    const matchP95Status = statusFor(match.p95Ms, TARGETS.singleMatchMs)

    const flagged: string[] = []
    if (match.avgMs > TARGETS.singleMatchMs * 3) {
        flagged.push(
            `**Single match average (${fmtMs(match.avgMs)}) exceeds 3× target (${fmtMs(TARGETS.singleMatchMs * 3)}).**`
        )
    }
    if (match.p95Ms > TARGETS.singleMatchMs * 3) {
        flagged.push(
            `**Single match p95 (${fmtMs(match.p95Ms)}) exceeds 3× target (${fmtMs(TARGETS.singleMatchMs * 3)}).**`
        )
    }
    if (season.totalMs > TARGETS.fullSeasonMs * 3) {
        flagged.push(
            `**Full-season sim (${fmtMs(season.totalMs)}) exceeds 3× target (${fmtMs(TARGETS.fullSeasonMs * 3)}).**`
        )
    }
    if (singleWeekMs > weeklyTickBudgetMs * 3) {
        flagged.push(
            `**Weekly tick (${fmtMs(singleWeekMs)}) exceeds 3× derived target (${fmtMs(weeklyTickBudgetMs * 3)}).**`
        )
    }

    return `# Simulation performance baseline

Measured by \`scripts/perf-baseline.ts\`, which:

1. Loads the shipped snapshot from \`public/data/snapshot/\` into an in-memory save.
2. Directly calls \`matchEngine.simulateMatch\` for ${match.count} matches between random team pairs from the snapshot (BO3).
3. Runs a single \`atomicWeekProcessor.processWeek\` tick.
4. Runs ${season.weeks} sequential \`processWeek\` calls as a full-season proxy.

Enable the lightweight engine tracer any time with \`ESM_PERF_TRACE=1\` —
it emits per-call lines and an aggregate summary on \`perfTrace.flush()\`.

## Environment

| | |
|---|---|
| Node | \`${env.node}\` |
| Platform | \`${env.platform}\` |
| CPU | ${env.cpu} |
| RAM | ${env.memGB} GB |
| Matches sampled | ${match.count} (plus ${args.warmup} warm-up) |
| Weeks simulated | ${season.weeks} |

## Targets vs. measured

Targets from the perf task (management sim budget). "Daily tick" target is
500 ms; this codebase uses **weekly** ticks only, so we compare the weekly
tick against a derived budget of 500 ms × 7 = **3500 ms/week**.

| Metric | Target | Measured | Status |
|---|---:|---:|:---:|
| Single match (avg) | ${fmtMs(TARGETS.singleMatchMs)} | **${fmtMs(match.avgMs)}** | ${matchStatus} |
| Single match (p95) | ${fmtMs(TARGETS.singleMatchMs)} | **${fmtMs(match.p95Ms)}** | ${matchP95Status} |
| Full season (${season.weeks} weeks) | ${fmtMs(TARGETS.fullSeasonMs)} | **${fmtMs(season.totalMs)}** | ${seasonStatus} |
| Weekly tick (single) | ${fmtMs(weeklyTickBudgetMs)} derived | **${fmtMs(singleWeekMs)}** | ${weeklyStatus} |

**Status legend:** \`PASS\` ≤ target · \`OVER\` ≤ 3× target · \`RED\` > 3× target (flagged).

${flagged.length ? `### Flags (>3× target)\n\n${flagged.map(f => `- ${f}`).join("\n")}\n` : "_No metric exceeded 3× its target._\n"}

## Detailed numbers

### 1. Single-match sim (\`matchEngine.simulateMatch\`, BO3)

| Stat | Value |
|---|---:|
| Count | ${match.count} |
| Total | ${fmtMs(match.totalMs)} |
| Min | ${fmtMs(match.minMs)} |
| Median (p50) | ${fmtMs(match.medianMs)} |
| Mean | ${fmtMs(match.avgMs)} |
| p95 | ${fmtMs(match.p95Ms)} |
| p99 | ${fmtMs(match.p99Ms)} |
| Max | ${fmtMs(match.maxMs)} |

Call chain: \`matchEngine.simulateMatch\` → \`SimulationEngineV2.simulateMatch\`
(engine/match-simulation.ts:146). BO3 mean implies a per-map cost of ~${fmtMs(match.avgMs / 2.1)}
(BO3s average ~2.1 maps before someone clinches 2–0).

### 2. Weekly tick (\`atomicWeekProcessor.processWeek\`, single call)

| Stat | Value |
|---|---:|
| Total | ${fmtMs(singleWeekMs)} |
| Matches simulated by tick | ${singleWeekMatches} |
| Implied per-match cost inside tick | ${singleWeekMatches > 0 ? fmtMs(singleWeekMs / singleWeekMatches) : "n/a"} |
| Derived daily-equivalent budget (${fmtMs(TARGETS.dailyTickMs)} × 7) | ${fmtMs(weeklyTickBudgetMs)} |

\`processWeek\` covers training, fatigue, injuries, finance, tournament
processing, match simulation, standings, events, AI, retirements, rest
days, narrative, career-stats rollups, and save persistence (engine/atomic-week-processor.ts:108).

### 3. Full-season sim (${season.weeks} weeks of \`processWeek\`)

| Stat | Value |
|---|---:|
| Total wall-clock | **${fmtMs(season.totalMs)}** |
| Sum of per-week durations | ${fmtMs(season.sumWeekMs)} |
| Matches simulated | ${season.matchesSimulated} |
| Avg per-match cost (season / matches) | ${season.avgMsPerMatch ? fmtMs(season.avgMsPerMatch) : "n/a"} |
| Avg per-week cost | ${fmtMs(season.avgWeekMs)} |
| Median week | ${fmtMs(season.medianWeekMs)} |
| p95 week | ${fmtMs(season.p95WeekMs)} |
| Max week | ${fmtMs(season.maxWeekMs)} |

## How to reproduce

\`\`\`bash
# Baseline run:
npx tsx scripts/perf-baseline.ts

# Live trace while the game or tests run:
ESM_PERF_TRACE=1 npm test
ESM_PERF_TRACE=1 npx tsx scripts/perf-baseline.ts
\`\`\`

The engine instrumentation lives in \`engine/perf-trace.ts\` and is a no-op
unless \`ESM_PERF_TRACE=1\`. Hooked into:

- \`SimulationEngineV2.simulateMatch\` — engine/match-simulation.ts
- \`AtomicWeekProcessor.processWeek\` — engine/atomic-week-processor.ts

## Notes

- The \`matchesPlayed\` figure reported by \`processWeek\` only counts league
  matches processed via \`processMatches\`. Tournament-bracket matches
  simulated inside \`processTournaments\` (via \`TournamentManager.simulateConcurrentMatches\`
  and \`simulateAllPendingBracketMatches\`) are additional work not reflected
  in that counter, so the true per-match cost during a tick is likely
  **lower** than the naive \`weekMs / matchesPlayed\` division above.
- The "full season" column uses wall-clock (includes awaited save persistence),
  not just sum-of-work; they should be within a few percent on the in-memory
  storage adapter.
- All measurements come from the dev build running under \`tsx\` (ts-node-style).
  A production (\`next build\`) environment may be faster due to AOT compile
  and deoptimisation avoidance — worth re-running there before optimising.

---

*Baseline only — no optimisations applied.*
`
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
