/**
 * Phase 5.2 evidence: personalities and the dressing room.
 *
 *   npx tsx scripts/launch/personality-evidence.ts --label=after \
 *     --campaign=tmp/p52/campaign-after.json --calibration=tmp/p52/calib-after.json --perf=tmp/p52/perf-after.md
 *
 * Builds a new career from the snapshot through the real loader (the
 * creation path) and reports archetype and trait counts, then folds in the
 * one-season campaign summary (transfer requests per managed club and
 * season, promises, morale, AI administrations), the calibration summary
 * and the perf numbers. Writes
 * docs/launch-readiness/evidence/phase5-2-personality-<label>.json.
 */
import fs from 'node:fs'
import path from 'node:path'
import { SnapshotLoader } from '../../data/snapshot-loader'
import type { PlayerSaveData, TeamSaveData } from '../../engine/save-types'

const argv = process.argv.slice(2)
const arg = (key: string) => argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3)
const label = arg('label') ?? 'after'
const root = process.cwd()
const readJson = (file?: string) => (file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null)

async function distribution() {
    const loader = new SnapshotLoader(path.join(root, 'public/data/snapshot'))
    const res = await loader.loadSnapshot()
    if (!res.success) throw Error(res.error)
    const teams = loader.getSnapshot()!.teams as unknown as TeamSaveData[]
    const save = loader.createCareerFromSnapshot('Evidence', teams[0].id, 1)!
    const players = save.players.filter((p: PlayerSaveData) => !p.isRetired && !p.isLegendary)
    const archetypes: Record<string, number> = {}
    const traits: Record<string, number> = {}
    const traitsByRole: Record<string, Record<string, number>> = {}
    let withTrait = 0, twoTraits = 0
    for (const p of players) {
        const a = (p as { personality?: { archetype?: string } }).personality?.archetype ?? 'NONE'
        archetypes[a] = (archetypes[a] ?? 0) + 1
        const t = p.traits ?? []
        if (t.length) withTrait++
        if (t.length >= 2) twoTraits++
        for (const x of t) {
            traits[x] = (traits[x] ?? 0) + 1
            ;(traitsByRole[p.role] ??= {})[x] = (traitsByRole[p.role][x] ?? 0) + 1
        }
    }
    const share = (n: number) => Math.round((1000 * n) / players.length) / 10
    return {
        players: players.length,
        archetypes: Object.fromEntries(Object.entries(archetypes).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, { count: v, pct: share(v) }])),
        traitShareAtLeastOne: share(withTrait),
        playersWithTwoTraits: twoTraits,
        traits: Object.fromEntries(Object.entries(traits).map(([k, v]) => [k, { count: v, pct: share(v) }])),
        traitsByRole,
    }
}

function calibration(file?: string) {
    const report = readJson(file)
    if (!report) return null
    const counts: Record<string, number> = {}
    for (const m of report.metrics as Array<{ status?: string }>) counts[m.status ?? 'info'] = (counts[m.status ?? 'info'] ?? 0) + 1
    const pick = ['rounds_per_map', 'ot_rate', 'kills_per_round', 'trade_share', 'clutches_won_per_map', 'rating_mean', 'fav_win_gap_3', 'fav_win_gap_10', 'impossible_states']
    return {
        engine: report.engine, mapsSimulated: report.mapsSimulated, statusCounts: counts,
        metrics: Object.fromEntries((report.metrics as Array<{ id: string; value: number | null; status?: string }>).filter(m => pick.includes(m.id)).map(m => [m.id, { value: m.value, status: m.status }])),
    }
}

function perf(file?: string) {
    if (!file || !fs.existsSync(file)) return null
    const md = fs.readFileSync(file, 'utf8')
    const grab = (re: RegExp) => md.match(re)?.[1] ?? null
    return {
        weeklyTickSingle: grab(/Weekly tick \(single\) \| [^|]+\| \*\*([^*]+)\*\*/),
        fullSeason: grab(/Full season \(52 weeks\) \| [^|]+\| \*\*([^*]+)\*\*/),
        avgPerWeek: grab(/Avg per-week cost \| ([^|\n]+)/)?.trim() ?? null,
        medianWeek: grab(/Median week \| ([^|\n]+)/)?.trim() ?? null,
        singleMatchAvg: grab(/Single match \(avg\) \| [^|]+\| \*\*([^*]+)\*\*/),
    }
}

function campaign(file?: string) {
    const summary = readJson(file)
    if (!summary) return null
    return {
        label: summary.label, sampleSize: summary.sampleSize, policy: summary.policyName,
        dressingRoom: summary.dressingRoom ?? null,
        aiAdministrationsBySeason: (summary.aiEconomy?.bySeason ?? []).map((s: { season: number; administrations: unknown; minRoster: number }) => ({ season: s.season, administrations: s.administrations, minRoster: s.minRoster })),
        aiAdministrationsCareer: summary.aiEconomy?.careerAdministrations ?? null,
        invariantFailures: summary.invariantFailures,
        managedWinRate: summary.perTier ? Object.fromEntries(Object.entries(summary.perTier as Record<string, { winRate: unknown }>).map(([k, v]) => [k, v.winRate])) : null,
        tickMsMedian: summary.distributions?.tickMsMedian ?? null,
    }
}

async function main() {
    const out = {
        generated: new Date().toISOString(),
        label,
        stream: 'Phase 5.2 personalities & dressing room',
        // --no-career: the base engine (before Phase 5.2) had no personalities;
        // its state is read from the campaign (archetype NONE, 0 traits).
        snapshotCareer: argv.includes('--no-career') ? null : await distribution(),
        campaign: campaign(arg('campaign')),
        calibration: calibration(arg('calibration')),
        perf: perf(arg('perf')),
        notes: arg('notes') ?? null,
    }
    const file = path.join(root, 'docs/launch-readiness/evidence', `phase5-2-personality-${label}.json`)
    fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n')
    process.stdout.write(`wrote ${path.relative(root, file)}\n`)
}

main().catch(err => { console.error(err); process.exit(1) })
