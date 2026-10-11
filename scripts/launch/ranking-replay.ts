/**
 * Ranking replay (Phase 4.8): replays the official results a long-career
 * campaign recorded (`--record-results`) through the world-ranking rules
 * offline, so RANKING_TUNING can be tuned in seconds instead of re-running
 * careers. The replay has no feedback (league draws, invitations and seeding
 * keep the recorded ranks), so it measures the rating rules, not the world.
 *
 *   npx tsx scripts/launch/ranking-replay.ts --label=p48-rec
 *   npx tsx scripts/launch/ranking-replay.ts --label=p48-rec --k-scale=0.8 --regression=0.1
 *
 * Overrides: --k-scale (all K), --k-league, --playoff, --mov, --regression,
 * --spread (initial Elo spread multiplier around the mean).
 */
import fs from 'node:fs'
import path from 'node:path'
import { ratingExchange, isPlayoffStage, type MatchImportance, type RankingTuning } from '../../engine/world-ranking'
import { RANKING_TUNING } from '../../lib/balance-tuning'
import { distribution } from './balance-metrics'

const argv = process.argv.slice(2)
const arg = (key: string, fallback?: string) => argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback
const num = (key: string, fallback: number) => Number(arg(key, String(fallback)))
const dir = path.join(process.cwd(), 'tmp', 'long-career', arg('label', 'p48-rec')!)

const kScale = num('k-scale', 1)
const tuning: RankingTuning = {
    ...RANKING_TUNING,
    K: Object.fromEntries(Object.entries(RANKING_TUNING.K).map(([k, v]) => [k, (k === 'LEAGUE' && arg('k-league') ? Number(arg('k-league')) : v) * kScale])),
    PLAYOFF_MULTIPLIER: num('playoff', RANKING_TUNING.PLAYOFF_MULTIPLIER),
    MOV_MAX: num('mov', RANKING_TUNING.MOV_MAX),
    REGRESSION: num('regression', RANKING_TUNING.REGRESSION),
}
const spread = num('spread', 1)

interface Result { w: number; d: number | null; h: string; a: string; win: string; k: string; st: string | null; hr: number; ar: number; maps: number }
type Club = [string, number, number, number, number, string, string, number]

const clubNumber = (id: string) => parseInt(id.replace(/\D/g, ''), 10) || 0

function spearman(xs: number[], ys: number[]): number {
    const rank = (v: number[]) => { const r = new Array<number>(v.length); v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]).forEach(([, i], k) => { r[i] = k }); return r }
    const a = rank(xs), b = rank(ys), n = xs.length
    const ma = (n - 1) / 2
    let s = 0, da = 0, db = 0
    for (let i = 0; i < n; i++) { s += (a[i] - ma) * (b[i] - ma); da += (a[i] - ma) ** 2; db += (b[i] - ma) ** 2 }
    return Math.round(s / Math.sqrt(da * db) * 1000) / 1000
}

function replay(tag: string) {
    const clubLines = fs.readFileSync(path.join(dir, `${tag}-clubs.jsonl`), 'utf8').trim().split('\n').map(l => JSON.parse(l) as { w: number; managed: string; clubs: Club[] })
    const results = fs.readFileSync(path.join(dir, `${tag}-results.jsonl`), 'utf8').trim().split('\n').map(l => JSON.parse(l) as Result)
    const first = clubLines[0]
    const managed = first.managed
    const rep = new Map(first.clubs.map(c => [c[0], c[3]]))
    const mean0 = first.clubs.reduce((s, c) => s + c[1], 0) / first.clubs.length
    const elo = new Map(first.clubs.map(c => [c[0], Math.round(mean0 + (c[1] - mean0) * spread)]))
    const ids = first.clubs.map(c => c[0])
    const order = () => [...ids].sort((x, y) => (elo.get(y)! - elo.get(x)!) || ((rep.get(y) ?? 0) - (rep.get(x) ?? 0)) || clubNumber(x) - clubNumber(y))
    let rank = new Map(order().map((id, i) => [id, i + 1]))
    const ai = ids.filter(id => id !== managed).sort((x, y) => rank.get(x)! - rank.get(y)!)
    const top10 = ai.slice(0, 10), top20 = ai.slice(0, 20)
    let seasonTop10 = top10
    const byWeek = new Map<number, Result[]>()
    for (const r of results) { const list = byWeek.get(r.w) ?? []; list.push(r); byWeek.set(r.w, list) }
    const lastWeek = Math.max(...results.map(r => r.w))
    const seasons: unknown[] = []
    let weeklyTop20: number[] = [], weeklyAll: number[] = [], outside30 = 0, premiumFlips = 0, eliteFlips = 0, weeks = 0
    const managedPath: number[] = []
    for (let w = 1; w <= lastWeek; w++) {
        for (const r of (byWeek.get(w) ?? []).sort((x, y) => (x.d ?? 6) - (y.d ?? 6))) {
            const importance = (r.k === 'EVENT' ? 'C_TIER' : r.k) as MatchImportance
            if (importance === 'FRIENDLY') continue
            const loser = r.win === r.h ? r.a : r.h
            if (!elo.has(r.win) || !elo.has(loser)) continue
            const roundDiff = r.win === r.h ? r.hr - r.ar : r.ar - r.hr
            const { delta } = ratingExchange({ winnerElo: elo.get(r.win)!, loserElo: elo.get(loser)!, importance, playoff: isPlayoffStage(r.st), roundDiff, maps: r.maps }, tuning)
            const moved = Math.max(0, Math.min(delta, Math.floor(elo.get(loser)! - tuning.FLOOR)))
            elo.set(r.win, elo.get(r.win)! + moved)
            elo.set(loser, elo.get(loser)! - moved)
        }
        const next = new Map(order().map((id, i) => [id, i + 1]))
        for (const id of ids) {
            const a = rank.get(id)!, b = next.get(id)!
            weeklyAll.push(Math.abs(b - a))
            if (top20.includes(id)) weeklyTop20.push(Math.abs(b - a))
            if (top10.includes(id) && b > 30) outside30++
            if (id !== managed) { if ((a <= 30) !== (b <= 30)) premiumFlips++; if ((a <= 10) !== (b <= 10)) eliteFlips++ }
        }
        rank = next
        weeks++
        managedPath.push(rank.get(managed)!)
        if (w % 52 === 0 || w === lastWeek) {
            const values = [...elo.values()]
            const mean = values.reduce((s, x) => s + x, 0) / values.length
            const sd = Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / values.length)
            const snapshot = clubLines.filter(c => c.w <= w + 1).at(-1)!
            const strength = new Map(snapshot.clubs.map(c => [c[0], c[4]]))
            const aiIds = ids.filter(id => id !== managed)
            const strengthRank = new Map([...aiIds].sort((x, y) => (strength.get(y) ?? 0) - (strength.get(x) ?? 0)).map((id, i) => [id, i + 1]))
            seasons.push({
                week: w,
                weeklyTop20: distribution(weeklyTop20), weeklyAll: distribution(weeklyAll),
                top10EndRanks: top10.map(id => rank.get(id)!), top10Outside30AtEnd: top10.filter(id => rank.get(id)! > 30).length, top10Outside30Weeks: outside30,
                seasonTop10Outside30AtEnd: seasonTop10.filter(id => rank.get(id)! > 30).length,
                seasonTop10FallsWithTop30Squad: seasonTop10.filter(id => rank.get(id)! > 30 && (strengthRank.get(id) ?? 999) <= 30).length,
                premiumFlipsPerWeek: Math.round(premiumFlips / weeks * 100) / 100, eliteFlipsPerWeek: Math.round(eliteFlips / weeks * 100) / 100,
                eloMean: Math.round(mean), eloSd: Math.round(sd), eloMax: Math.max(...values), eloMin: Math.min(...values),
                rankVsStrength: spearman(aiIds.map(id => rank.get(id)!), aiIds.map(id => -(strength.get(id) ?? 0))),
                managed: { rank: rank.get(managed), best: Math.min(...managedPath) },
            })
            if (w % 52 === 0 && tuning.REGRESSION > 0) for (const id of ids) elo.set(id, Math.round(mean + (elo.get(id)! - mean) * (1 - tuning.REGRESSION)))
            weeklyTop20 = []; weeklyAll = []; outside30 = 0; premiumFlips = 0; eliteFlips = 0; weeks = 0
            seasonTop10 = ids.filter(id => id !== managed).sort((x, y) => rank.get(x)! - rank.get(y)!).slice(0, 10)
        }
    }
    return { tag, managed, managedStart: managedPath[0], seasons }
}

const tags = fs.readdirSync(dir).filter(f => f.endsWith('-results.jsonl')).map(f => f.replace('-results.jsonl', '')).sort()
const runs = tags.map(replay)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const S = (i: number, fn: (s: any) => number) => distribution(runs.map(r => r.seasons[i]).filter(Boolean).map(fn))
const out = [0, 1].map(i => ({
    season: i + 1,
    top20WeeklyMedian: S(i, s => s.weeklyTop20.median).median, top20WeeklyP90: S(i, s => s.weeklyTop20.p90).median, top20WeeklyMax: S(i, s => s.weeklyTop20.max).median,
    allWeeklyMedian: S(i, s => s.weeklyAll.median).median, allWeeklyP90: S(i, s => s.weeklyAll.p90).median,
    top10Outside30AtEnd: S(i, s => s.top10Outside30AtEnd).median, top10Outside30Weeks: S(i, s => s.top10Outside30Weeks).median,
    seasonTop10Outside30AtEnd: S(i, s => s.seasonTop10Outside30AtEnd).median, seasonTop10FallsWithTop30Squad: S(i, s => s.seasonTop10FallsWithTop30Squad).median,
    top10EndRankMedian: distribution(runs.flatMap(r => (r.seasons[i] as { top10EndRanks?: number[] } | undefined)?.top10EndRanks ?? [])).median,
    premiumFlipsPerWeek: S(i, s => s.premiumFlipsPerWeek).median, eliteFlipsPerWeek: S(i, s => s.eliteFlipsPerWeek).median,
    eloMean: S(i, s => s.eloMean).median, eloSd: S(i, s => s.eloSd).median, rankVsStrength: S(i, s => s.rankVsStrength).median,
}))
process.stdout.write(JSON.stringify({ tuning: { K: tuning.K, PLAYOFF: tuning.PLAYOFF_MULTIPLIER, MOV: tuning.MOV_MAX, REGRESSION: tuning.REGRESSION, spread }, seasons: out,
    managed: runs.map(r => ({ tag: r.tag, start: r.managedStart, bySeason: r.seasons.map(s => (s as { managed: { rank: number; best: number } }).managed) })) }, null, 1) + '\n')
