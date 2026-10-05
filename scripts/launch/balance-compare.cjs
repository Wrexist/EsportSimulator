/**
 * Before/after balance comparison over long-career per-seed results
 * (tmp/long-career/<label>/seed-*.json from long-career-campaign.ts).
 *
 *   node scripts/launch/balance-compare.cjs <beforeDir> <afterDir> [out.json]
 *
 * Metrics are computed identically for both runs from fields present in
 * both result formats. Uncertainty: medians with p10/p90 across careers or
 * season snapshots, and proportions with a Wilson 95% interval.
 */
const fs = require('fs'), path = require('path')

const load = dir => fs.readdirSync(dir).filter(f => /^seed-\d+-\w+\.json$/.test(f))
  .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))).sort((a, b) => a.seed - b.seed)
const q = (xs, p) => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); if (!v.length) return null; const i = (v.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return +(v[lo] + (v[hi] - v[lo]) * (i - lo)).toFixed(4) }
const dist = xs => ({ n: xs.filter(Number.isFinite).length, p10: q(xs, 0.1), median: q(xs, 0.5), p90: q(xs, 0.9), max: q(xs, 1) })
const wilson = (k, n) => { if (!n) return null; const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return { k, n, rate: +(p).toFixed(3), low: +((c - h) / d).toFixed(3), high: +((c + h) / d).toFixed(3) } }

function metrics(results) {
  const id = r => r.club
  const later = results.flatMap(r => r.seasons.slice(1).map(s => ({ ...s, r })))
  const all = results.flatMap(r => r.seasons.map((s, i) => ({ ...s, r, i })))
  const managedId = (r, s) => r.jobChanges?.length ? null : r.club // job changes: share computed by ranking only
  const sShare = s => { const ws = (s.winners || []).filter(w => w.tier === 'S_TIER'); const team = s.r.jobChanges?.filter(j => j.week <= s.week).at(-1)?.to ?? s.r.club; return ws.length ? ws.filter(w => w.winner === team).length / ws.length : NaN }
  const ledger = (s, k) => s.managed.ledger?.[k] ?? 0
  const bySeason = [1, 2, 3, 5, 10].map(n => { const xs = results.map(r => r.seasons[n - 1]).filter(Boolean); return { season: n, worldNo1: wilson(xs.filter(s => s.managed.ranking === 1).length, xs.length) } })
  return {
    careers: results.length, seasonSnapshots: all.length,
    worldNo1BySeason: bySeason,
    managedSTierTitleShareSeason2Plus: dist(later.map(sShare)),
    managedWinRateSeason2Plus: dist(later.filter(s => s.managed.matches).map(s => s.managed.wins / s.managed.matches)),
    managedTrophiesPerSeason: dist(all.map(s => s.managed.trophies.length)),
    managedFinalCash: dist(results.map(r => r.seasons.at(-1)?.managed.cash)),
    managedSeasonCashDelta: dist(all.map(s => s.managed.cashDelta)),
    sponsorIncomePerSeason: dist(all.map(s => ledger(s, 'INCOME:SPONSOR'))),
    wageBillPerSeason: dist(all.map(s => ledger(s, 'EXPENSE:WAGES_PLAYER') + ledger(s, 'EXPENSE:WAGES_STAFF'))),
    terminal: results.reduce((m, r) => { const k = r.terminal ?? 'none'; m[k] = (m[k] ?? 0) + 1; return m }, {}),
    deadSeasons: all.filter(s => s.managed.matches < 5).length,
    aiShortRostersAtSeasonEnd: dist(all.map(s => s.aiShortRosters)),
    aiRosterNotViableEpisodes: results.reduce((n, r) => n + r.failures.filter(f => f.kind === 'ai-roster-not-viable').length, 0),
    aiNegativeCashAtSeasonEnd: dist(all.map(s => s.aiNegative)),
    playersActiveFinal: dist(results.map(r => r.seasons.at(-1)?.playersActive)),
    poolRatioFinal: dist(results.map(r => r.seasons.at(-1)?.playersActive / (r.openingActive ?? 1618))),
    newPlayersPerSeason: dist(all.map(s => s.newPlayers)),
    retiredPerSeason: dist(all.map(s => s.retiredThisSeason)),
    hofInductionsBySeason: [1, 3, 5, 10].map(n => ({ season: n, ...dist(results.map(r => r.seasons[n - 1]?.hofInductions)) })),
    sTierTopWinnerShare: dist(all.map(s => s.titles?.S_TIER?.topWinnerShare)),
    tickMsMedian: dist(results.map(r => r.tickMs?.median)),
    failureKinds: [...new Set(results.flatMap(r => r.failureKinds))],
  }
}

if (require.main === module) {
  const [before, after, out] = process.argv.slice(2)
  const report = { generatedBy: 'scripts/launch/balance-compare.cjs', before: { dir: before, ...metrics(load(before)) }, after: { dir: after, ...metrics(load(after)) } }
  if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 1))
}
module.exports = { metrics, load }
