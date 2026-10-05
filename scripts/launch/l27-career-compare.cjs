// L27: compare before/after career measurements (state hashes + timings).
//   node scripts/launch/l27-career-compare.cjs before after early mid late late2
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const [before, after, ...scenarios] = process.argv.slice(2)
const load = (label, s) => JSON.parse(fs.readFileSync(path.join(root, 'docs/launch-readiness/evidence', `L27-career-${label}-${s}.json`), 'utf8'))
const rows = []
for (const s of scenarios) {
    const a = load(before, s), b = load(after, s)
    const weeks = a.weeks.slice(0, Math.min(a.weeks.length, b.weeks.length)).map((w, i) => {
        const v = b.weeks[i]
        return { week: w.week, sameWeek: !!v && v.week === w.week, rng: !!v && v.rng === w.rng,
            fullState: !!v && v.hash.full === w.hash.full,
            stateExceptFplHistory: !!v && v.hash.withoutFplHistory === w.hash.withoutFplHistory,
            fplHistoryNewest200: !!v && v.hash.fplHistoryTail200 === w.hash.fplHistoryTail200,
            fplHistoryLength: [w.hash.fplHistoryLength, v?.hash.fplHistoryLength] }
    })
    const all = k => weeks.every(w => w[k])
    const pct = (x, y) => x && y ? Math.round((y - x) / x * 1000) / 10 : null
    rows.push({ scenario: s, weeksCompared: weeks.length,
        identical: { rng: all('rng'), fullState: all('fullState'), stateExceptFplHistory: all('stateExceptFplHistory'), fplHistoryNewest200: all('fplHistoryNewest200') },
        firstFullStateDifference: weeks.find(w => !w.fullState) ?? null,
        timing: {
            weekWallMedian: [a.summary.weekWallMs?.median, b.summary.weekWallMs?.median, pct(a.summary.weekWallMs?.median, b.summary.weekWallMs?.median)],
            mainThreadMedian: [a.summary.mainThreadMs?.median, b.summary.mainThreadMs?.median, pct(a.summary.mainThreadMs?.median, b.summary.mainThreadMs?.median)],
            computeMedian: [a.summary.phases['coord.04_compute']?.median, b.summary.phases['coord.04_compute']?.median],
            commitMedian: [a.summary.phases['coord.05_commit']?.median, b.summary.phases['coord.05_commit']?.median],
            saveMedian: [a.summary.saveGameMs?.median, b.summary.saveGameMs?.median],
            primaryChars: [a.summary.primaryChars, b.summary.primaryChars],
            loadGameMedian: [a.summary.loadGameMs?.median ?? a.summary.loadError, b.summary.loadGameMs?.median ?? b.summary.loadError],
        } })
}
const out = path.join(root, 'docs/launch-readiness/evidence', `L27-career-comparison.json`)
fs.writeFileSync(out, JSON.stringify({ before, after, columns: '[before, after, %change]', rows }, null, 2) + '\n')
console.log(JSON.stringify(rows, null, 1))
