/**
 * Render perf micro-bench.
 *
 * Measures the hot-path work done per "render" of the Rankings list —
 * specifically the per-row computations that currently run inside the
 * page's JSX (`getTeamFlag(rosterIds, players)`, `tierTeams.filter(...)`,
 * `findIndex(...)`, `players.find(...)`). These dominate rankings cost
 * because they're O(teams × roster × players) per paint.
 *
 * We fabricate a snapshot-sized dataset (150 teams × 5 roster IDs, 750
 * players) and run `sampleCount` iterations, emitting before/after
 * timings into docs/render-perf.md (merged in by the committer).
 */

import { mkdir, writeFile } from "fs/promises"
import path from "node:path"
import os from "node:os"
import { getTeamFlag } from "../engine/region-logic"

type Player = { id: string; nationality: string }
type Team = { id: string; rosterIds: string[]; elo: number; leagueTier: "S_TIER" | "A_TIER" | "B_TIER" }
type RankedTeam = Team & { worldRanking: number }

const TEAM_COUNT = 150
const PLAYERS_PER_TEAM = 5
const PLAYER_COUNT = TEAM_COUNT * PLAYERS_PER_TEAM

const NATIONALITIES = [
    "Sweden", "Denmark", "France", "Germany", "Poland", "Russia", "Ukraine",
    "Brazil", "Argentina", "United States", "Canada", "China", "Korea",
    "Australia", "Turkey", "Finland", "Norway", "Spain", "Portugal",
]

function buildDataset() {
    const players: Player[] = []
    for (let i = 0; i < PLAYER_COUNT; i++) {
        players.push({
            id: `player_${i}`,
            nationality: NATIONALITIES[i % NATIONALITIES.length],
        })
    }
    const teams: Team[] = []
    for (let i = 0; i < TEAM_COUNT; i++) {
        const rosterIds: string[] = []
        for (let r = 0; r < PLAYERS_PER_TEAM; r++) {
            rosterIds.push(`player_${i * PLAYERS_PER_TEAM + r}`)
        }
        teams.push({
            id: `team_${i}`,
            rosterIds,
            elo: 800 + (i % 100) * 6,
            leagueTier: i < 10 ? "S_TIER" : i < 40 ? "A_TIER" : "B_TIER",
        })
    }
    const rankedTeams: RankedTeam[] = [...teams]
        .sort((a, b) => b.elo - a.elo)
        .map((t, i) => ({ ...t, worldRanking: i + 1 }))
    return { players, teams, rankedTeams }
}

// ============================================================================
// BEFORE — the page renders today
// ============================================================================
// For each row:
//   1. `getTeamFlag(team.rosterIds, players)`        → O(rosterIds × players) per row
//   2. `rankedTeams.filter(t => t.leagueTier === x)` → O(rankedTeams) per row
//   3. `tierTeams.findIndex(t => t.id === team.id)`  → O(rankedTeams) per row
// Net: O(rankedTeams × (rosterIds × players + rankedTeams)) per "render".
function renderBefore(rankedTeams: RankedTeam[], players: Player[]): number {
    let sum = 0
    for (const team of rankedTeams) {
        const flag = getTeamFlag(team.rosterIds, players as any)
        const tierTeams = rankedTeams.filter(t => t.leagueTier === team.leagueTier)
        const posInTier = tierTeams.findIndex(t => t.id === team.id) + 1
        // The rosters "shape" also gets computed for avatars, keep it honest:
        const roster = team.rosterIds.map(id => players.find(p => p.id === id))
        sum += flag.length + posInTier + roster.length
    }
    return sum
}

// ============================================================================
// AFTER — what we're about to ship
// ============================================================================
// Precompute once per (teams, players, rankedTeams):
//   - playerById: Map<id, Player>
//   - teamsByLeagueTier: Map<tier, rankedTeam[]>
//   - posInTierByTeamId: Map<teamId, {posInTier, tierSize}>
//   - teamFlagById: Map<teamId, flag>
// Then per-row work is just O(1) Map.get() calls.
function renderAfter(rankedTeams: RankedTeam[], players: Player[]): number {
    const playerById = new Map<string, Player>()
    for (const p of players) playerById.set(p.id, p)

    const teamsByLeagueTier = new Map<string, RankedTeam[]>()
    for (const t of rankedTeams) {
        const list = teamsByLeagueTier.get(t.leagueTier)
        if (list) list.push(t)
        else teamsByLeagueTier.set(t.leagueTier, [t])
    }

    const posInTierByTeamId = new Map<string, { posInTier: number; tierSize: number }>()
    for (const [, list] of teamsByLeagueTier) {
        list.forEach((t, i) => posInTierByTeamId.set(t.id, { posInTier: i + 1, tierSize: list.length }))
    }

    const teamFlagById = new Map<string, string>()
    for (const t of rankedTeams) {
        // Reimplementation of getTeamFlag but using the playerById map (O(roster)).
        let eu = 0, na = 0, sa = 0, asia = 0, oce = 0
        for (const pid of t.rosterIds) {
            const p = playerById.get(pid)
            if (!p) continue
            const nat = p.nationality
            if (
                nat === "Sweden" || nat === "Denmark" || nat === "France" || nat === "Germany" ||
                nat === "Poland" || nat === "Russia" || nat === "Ukraine" || nat === "Spain" ||
                nat === "Portugal" || nat === "Turkey" || nat === "Finland" || nat === "Norway"
            ) eu++
            else if (nat === "United States" || nat === "Canada") na++
            else if (nat === "Brazil" || nat === "Argentina") sa++
            else if (nat === "China" || nat === "Korea") asia++
            else if (nat === "Australia") oce++
        }
        const flag =
            eu >= 3 ? "eu" :
            na >= 3 ? "us" :
            sa >= 3 ? "br" :
            asia >= 3 ? "cn" :
            oce >= 3 ? "au" :
            "un"
        teamFlagById.set(t.id, flag)
    }

    let sum = 0
    for (const team of rankedTeams) {
        const flag = teamFlagById.get(team.id)!
        const pos = posInTierByTeamId.get(team.id)!
        const roster = team.rosterIds.map(id => playerById.get(id))
        sum += flag.length + pos.posInTier + roster.length
    }
    return sum
}

function bench(label: string, fn: () => number, iterations: number) {
    // warmup
    for (let i = 0; i < 3; i++) fn()
    const samples: number[] = []
    for (let i = 0; i < iterations; i++) {
        const t0 = performance.now()
        fn()
        samples.push(performance.now() - t0)
    }
    samples.sort((a, b) => a - b)
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length
    const median = samples[Math.floor(samples.length / 2)]
    const p95 = samples[Math.floor(samples.length * 0.95)]
    const min = samples[0]
    const max = samples[samples.length - 1]
    console.log(
        `[${label}] x${iterations}  mean=${mean.toFixed(3)}ms  median=${median.toFixed(3)}ms  p95=${p95.toFixed(3)}ms  min=${min.toFixed(3)}ms  max=${max.toFixed(3)}ms`
    )
    return { mean, median, p95, min, max, iterations }
}

async function main() {
    const { players, rankedTeams } = buildDataset()
    const iterations = 50

    console.log(
        `[render-perf] dataset: ${TEAM_COUNT} teams, ${PLAYER_COUNT} players, ${iterations} iterations`
    )

    const before = bench("before (current page)", () => renderBefore(rankedTeams, players), iterations)
    const after = bench("after (precomputed maps)", () => renderAfter(rankedTeams, players), iterations)

    const speedup = before.mean / after.mean
    console.log(`\nSpeedup (mean): ${speedup.toFixed(1)}x`)
    console.log(`Speedup (p95):  ${(before.p95 / after.p95).toFixed(1)}x`)

    const out = {
        generatedAt: new Date().toISOString(),
        node: process.version,
        cpuCount: os.cpus().length,
        dataset: { teams: TEAM_COUNT, players: PLAYER_COUNT, iterations },
        before,
        after,
        speedup: {
            mean: Number(speedup.toFixed(2)),
            median: Number((before.median / after.median).toFixed(2)),
            p95: Number((before.p95 / after.p95).toFixed(2)),
        },
    }
    const outPath = path.resolve(__dirname, "..", "docs", "render-perf.json")
    await mkdir(path.dirname(outPath), { recursive: true })
    await writeFile(outPath, JSON.stringify(out, null, 2), "utf8")
    console.log(`\nWrote ${outPath}`)
}

main().catch(e => {
    console.error(e)
    process.exit(1)
})
