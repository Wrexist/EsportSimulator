/**
 * Phase 5.3 evidence: storylines and press conferences over one season.
 *
 *   npx tsx scripts/launch/long-career-campaign.ts --seeds=3 --seasons=1 --parallel=3 --label=p53-after --dump-final --out=tmp/p53/campaign-after.json
 *   npx tsx scripts/launch/inbox-noise-audit.ts --weeks=12 --seeds=1,2,3 --label=p53-after   (moved to tmp/p53/inbox-after.json)
 *   npx tsx scripts/launch/storylines-evidence.ts --label=after --dir=tmp/long-career/p53-after \
 *     --inbox=tmp/p53/inbox-after.json --perf-steps=tmp/p53/perf-steps-after.log --calibration=tmp/p53/calib-after.json
 *
 * Reads the per-seed campaign results (real useGameStore coordinator, full
 * snapshot world, competent policy that answers decisions and faces the
 * press) and their final saves, and reports per managed season: storylines
 * started and which reference real players or clubs, kinds seen, outcomes,
 * storyline decisions (answered or defaulted), press conferences, inbox
 * decisions overall, the managed club's rivalries, sample beat lines, and
 * AI administrations. Writes
 * docs/launch-readiness/evidence/phase5-3-storylines-<label>.json.
 */
import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import type { GameSave } from "../../engine/save-types"
import type { StoryArc } from "../../engine/storylines/types"

const root = process.cwd()
const argv = process.argv.slice(2)
const arg = (key: string) => argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3)
const label = arg("label") ?? "after"
const dir = path.resolve(root, arg("dir") ?? `tmp/long-career/p53-${label}`)
const readJson = (file?: string) => (file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Seed = any

function perSeed(file: string) {
    const r: Seed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))
    const savePath = path.join(dir, file.replace(/\.json$/, "-final-save.json.gz"))
    const save: GameSave | null = fs.existsSync(savePath) ? JSON.parse(zlib.gunzipSync(fs.readFileSync(savePath)).toString("utf8")) : null
    const season = r.seasons?.[0] ?? {}
    const team = save?.teams.find(t => t.id === save.playerTeamId)
    const arcs: StoryArc[] = save?.storylines ?? []
    const players = new Set((save?.players ?? []).map(p => p.id))
    const clubs = new Set((save?.teams ?? []).map(t => t.id))
    const managedArcs = arcs.filter(a => a.managed)
    // Inbox decisions the managed club received over the season (answered or not).
    const decisionEvents = (save?.eventsLog ?? []).filter(e => Array.isArray(e.choices) && e.choices.length > 0
        && e.type !== "JOB_OFFER" && e.type !== "TRANSFER_OFFER" && !(e.choices.length === 1 && e.choices[0].id === "ack"))
    const byType = decisionEvents.reduce((m: Record<string, number>, e) => { const k = e.id.startsWith("story_") ? "STORYLINE" : e.id.startsWith("press_") ? "PRESS" : String(e.type); m[k] = (m[k] ?? 0) + 1; return m }, {})
    return {
        seed: r.seed, tier: r.tier, club: r.clubName, ticks: r.ticks, finalWeek: r.finalWeek, failures: r.failureKinds,
        storylines: season.storylines ?? null,
        finalSave: save ? {
            storylinesKept: arcs.length,
            managedKept: managedArcs.length,
            arcsWithUnknownPlayer: arcs.filter(a => a.playerIds.some(id => !players.has(id))).length,
            arcsWithUnknownClub: arcs.filter(a => [a.teamId, ...a.clubIds].some(id => !clubs.has(id))).length,
            decisionEventsInLog: decisionEvents.length,
            decisionEventsByKind: byType,
            managedRivalries: (team?.rivalries ?? []).length,
            biggestRival: (() => {
                const top = [...(team?.rivalries ?? [])].sort((a, b) => b.matchesPlayed - a.matchesPlayed)[0]
                return top ? { club: save.teams.find(t => t.id === top.opponentTeamId)?.name ?? top.opponentTeamId, meetings: top.matchesPlayed, intensity: top.intensity, record: `${top.wins}-${top.losses}` } : null
            })(),
            storyNews: (save.newsFeed ?? []).filter(n => n.id.startsWith("story_")).length,
            sample: managedArcs.slice(0, 5).map(a => ({ kind: a.kind, outcome: a.outcome ?? a.state, log: a.log.map(l => `w${l.week}: ${l.text}`) })),
        } : null,
        aiAdministrations: r.aiAdministrationsCareer ?? null,
        tickMsMedian: r.tickMs?.median ?? null,
    }
}

function inbox(file?: string) {
    const j = readJson(file)
    return j ? { weeks: j.weeks, tier: j.tier, summary: j.summary, finalBadgeAtWeek13: j.results.map((r: Seed) => r.final.badge) } : null
}

function perfSteps(file?: string) {
    if (!file || !fs.existsSync(file)) return null
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(l => l.startsWith("[perf] step."))
    const steps = Object.fromEntries(lines.map(l => {
        const m = l.match(/^\[perf\] (step\.\S+) count=(\d+) total=([\d.]+)ms avg=([\d.]+)ms/)
        return m ? [m[1], { count: Number(m[2]), totalMs: Number(m[3]), avgMs: Number(m[4]) }] : ["?", null]
    }).filter(([k]) => k !== "?"))
    const total = Object.values(steps).reduce((s: number, v) => s + ((v as { totalMs: number }).totalMs), 0)
    const story = steps["step.12b_storylines"] as { totalMs: number; avgMs: number } | undefined
    return { source: path.relative(root, file), ticks: (steps["step.1_training"] as { count: number } | undefined)?.count ?? null, storylinesStep: story ?? null, shareOfTick: story && total ? Math.round((story.totalMs / total) * 10000) / 10000 : null, allStepsMs: Math.round(total) }
}

function calibration(file?: string) {
    const report = readJson(file)
    if (!report) return null
    const counts: Record<string, number> = {}
    for (const m of report.metrics as Array<{ status?: string }>) counts[m.status ?? "info"] = (counts[m.status ?? "info"] ?? 0) + 1
    return { engine: report.engine, mapsSimulated: report.mapsSimulated, statusCounts: counts }
}

function main() {
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^seed-\d+-\w+\.json$/.test(f)).sort() : []
    const seeds = files.map(perSeed)
    // A base-engine season has no storyline metrics: count it as zero.
    const none = { arcsManaged: 0, managedWithPlayers: 0, managedWithResults: 0, arcsOtherClubs: 0, decisions: 0, pressConferences: 0, pressAnswered: 0, arcsManagedByKind: {}, arcsOtherByKind: {} }
    const story = seeds.map(s => s.storylines ?? none)
    const out = {
        generated: new Date().toISOString(),
        label,
        stream: "Phase 5.3 storylines & press conferences",
        driver: "long-career-campaign.ts (real useGameStore coordinator, full snapshot world, competent policy: answers inbox decisions with its usual rule and faces the press with the first answer to each question), one season per seed, final save kept with --dump-final.",
        seeds: seeds.length,
        aggregate: {
            managedStorylinesPerSeason: story.map(s => s.arcsManaged),
            managedStorylinesNamingPlayersOrClubs: story.map(s => s.managedWithPlayers + s.managedWithResults),
            otherClubStorylinesPerSeason: story.map(s => s.arcsOtherClubs),
            storylineDecisionsPerSeason: story.map(s => s.decisions),
            pressConferencesPerSeason: story.map(s => s.pressConferences),
            pressAnswered: story.map(s => s.pressAnswered),
            kindsSeenManaged: [...new Set(story.flatMap(s => Object.keys(s.arcsManagedByKind)))].sort(),
            kindsSeenAll: [...new Set(story.flatMap(s => [...Object.keys(s.arcsManagedByKind), ...Object.keys(s.arcsOtherByKind)]))].sort(),
            inboxDecisionsInFinalLog: seeds.map(s => s.finalSave?.decisionEventsInLog ?? null),
            managedRivalries: seeds.map(s => s.finalSave?.managedRivalries ?? null),
            storiesWithUnknownPlayerOrClub: seeds.reduce((n, s) => n + (s.finalSave ? s.finalSave.arcsWithUnknownPlayer + s.finalSave.arcsWithUnknownClub : 0), 0),
            aiAdministrations: seeds.map(s => s.aiAdministrations?.total ?? null),
            failures: seeds.map(s => s.failures),
        },
        inboxNoise: inbox(arg("inbox")),
        performance: perfSteps(arg("perf-steps")),
        calibration: calibration(arg("calibration")),
        perSeed: seeds,
        notes: arg("notes") ?? null,
    }
    const file = path.join(root, "docs/launch-readiness/evidence", `phase5-3-storylines-${label}.json`)
    fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n")
    process.stdout.write(`wrote ${path.relative(root, file)}\n${JSON.stringify(out.aggregate)}\n`)
}

main()
