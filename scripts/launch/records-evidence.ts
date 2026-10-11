/**
 * Phase 5.1 evidence: records & truth after a one-season campaign.
 *
 * Reads the final saves the long-career campaign keeps with --dump-final
 * (tmp/long-career/<label>/seed-*-final-save.json.gz, one season = 52 ticks,
 * so the save sits in week 53 after the season was closed) and writes
 * docs/launch-readiness/evidence/phase5-1-records-<out>.json:
 *
 *   - regulars (20+ official maps in season 1; before Phase 5.1 there are no
 *     official-map counts, so 20+ matches gained since the snapshot stand in)
 *     and their avgRating (mean, distribution, how many are still 0);
 *   - the managed club's season MVP (careerStats) and whether it is simply
 *     the first roster player (the old fallback);
 *   - the world season MVP, Top 20 head and whether any number is invented
 *     (Major wins on players whose club won no Major);
 *   - records, Hall of Fame inductions, manager reputation log and stints,
 *     and the campaign's own save/load determinism check.
 *
 *   npx tsx scripts/launch/long-career-campaign.ts --worker --seed=1 --seasons=1 --label=p51-after --dump-final
 *   npx tsx scripts/launch/records-evidence.ts --label=p51-after --out=after
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import type { GameSave, PlayerSaveData } from '../../engine/save-types'
import { distribution } from './balance-metrics'

const root = process.cwd()
const argv = process.argv.slice(2)
const arg = (key: string, fallback: string) => argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback
const label = arg('label', 'p51-after'), out = arg('out', 'after')
if (!/^[a-z0-9-]+$/.test(label) || !/^[a-z0-9-]+$/.test(out)) throw Error('Invalid --label/--out')
const dir = path.join(root, 'tmp', 'long-career', label)
const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'public/data/snapshot/players.json'), 'utf8')) as Array<{ id: string; matchesPlayed?: number }>
const startMatches = new Map(snapshot.map(p => [p.id, p.matchesPlayed ?? 0]))
const round = (v: number, dp = 3) => Math.round(v * 10 ** dp) / 10 ** dp
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null

type AnyRecord = Record<string, unknown>

function seasonMaps(p: PlayerSaveData, season: number): number {
    const lines = (p.seasonLines ?? []).filter(l => l.season === season).reduce((n, l) => n + l.maps, 0)
    return lines + (p.seasonTally?.season === season ? p.seasonTally.maps : 0)
}

function seasonRating(p: PlayerSaveData, season: number): number | null {
    let rounds = 0, sum = 0
    for (const l of (p.seasonLines ?? []).filter(l => l.season === season)) { rounds += l.rounds; sum += l.rating * l.rounds }
    if (p.seasonTally?.season === season) { rounds += p.seasonTally.rounds; sum += p.seasonTally.ratingSum }
    return rounds ? sum / rounds : null
}

function analyse(file: string) {
    const save = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8')) as GameSave
    const tag = path.basename(file).replace('-final-save.json.gz', '')
    const meta = JSON.parse(fs.readFileSync(path.join(dir, `${tag}.json`), 'utf8')) as AnyRecord
    const phase51 = save.players.some(p => p.mapsPlayed !== undefined) || !!save.recordBook
    const players = save.players.filter(p => !p.isRetired)
    const regulars = phase51
        ? save.players.filter(p => seasonMaps(p, 1) >= 20)
        : players.filter(p => (p.matchesPlayed ?? 0) - (startMatches.get(p.id) ?? 0) >= 20)
    const ratings = regulars.map(p => p.avgRating ?? 0)
    const seasonRatings = phase51 ? regulars.map(p => seasonRating(p, 1)).filter((r): r is number => r != null) : []

    // Managed club season MVP (careerStats is written at the week-52 tick).
    const summary = save.careerStats?.seasons.find(s => s.seasonNumber === 1)
    const club = save.teams.find(t => t.id === summary?.teamId)
    const firstRosterPlayer = club ? save.players.find(p => club.rosterIds.includes(p.id)) : undefined
    const mvp = summary?.mvpPlayerId ? save.players.find(p => p.id === summary.mvpPlayerId) : undefined

    // Awards event (both shapes).
    const awardsEvent = save.eventsLog.find(e => e.type === 'MEDIA' && (e.data as AnyRecord)?.proAwards)
    const awards = (awardsEvent?.data as AnyRecord | undefined)?.proAwards as AnyRecord | undefined
    const top20 = ((awards?.top20 ?? []) as AnyRecord[])
    const majorClubs = new Set(save.teams.filter(t => (t.trophies ?? []).some(tr => tr.tournamentId.replace(/_s\d+$/, '').startsWith('major_') && tr.week <= 53)).map(t => t.id))
    const inventedMajors = top20.filter(p => Number(p.majorWins ?? 0) > 0 && !majorClubs.has(String(p.teamId))).length
    const honours = save.recordBook?.honours.find(h => h.season === 1)
    const nameOf = (id?: string) => save.players.find(p => p.id === id)?.nickname ?? id ?? null
    const teamOf = (id?: string) => save.teams.find(t => t.id === id)?.name ?? id ?? null
    const rec = (r?: AnyRecord) => r ? { value: r.value, who: r.playerName ?? teamOf(r.teamId as string), club: teamOf(r.teamId as string), vs: teamOf(r.opponentId as string), week: r.week, map: r.map ?? null, score: r.score ?? null, fromWeek: r.fromWeek ?? null, endedBy: teamOf(r.endedBy as string | undefined) } : null

    return {
        tag, seed: meta.seed, tier: meta.tier, club: meta.clubName, finalWeek: save.currentWeek, phase51,
        determinism: { saveLoadRoundTripIdentical: (meta.roundTrip as AnyRecord | null)?.identical ?? null, failures: (meta.failureKinds as string[]) ?? [] },
        regulars: {
            definition: phase51 ? '20+ official maps in season 1' : '20+ matches gained since the snapshot (no official-map counts before Phase 5.1)',
            count: regulars.length,
            avgRatingZero: ratings.filter(r => !r).length,
            avgRatingMean: mean(ratings) != null ? round(mean(ratings)!) : null,
            avgRating: distribution(ratings),
            seasonRatingMean: seasonRatings.length ? round(mean(seasonRatings)!) : null,
            roundsPlayedZero: regulars.filter(p => !p.roundsPlayed).length,
            mapsPlayed: phase51 ? distribution(regulars.map(p => seasonMaps(p, 1))) : null,
        },
        managedClubSeasonMvp: {
            club: club?.name ?? null,
            seasonRecord: summary ? { matches: summary.matches, wins: summary.wins, losses: summary.losses } : null,
            mvp: mvp ? { id: mvp.id, nickname: mvp.nickname, avgRating: round(mvp.avgRating ?? 0), seasonRating: phase51 ? round(seasonRating(mvp, 1) ?? 0) : null, seasonMaps: phase51 ? seasonMaps(mvp, 1) : null } : null,
            firstRosterPlayer: firstRosterPlayer?.nickname ?? null,
            isFirstRosterPlayer: !!mvp && mvp.id === firstRosterPlayer?.id,
            // The club's players by season rating (official maps for that club): the MVP must be the stats' choice, wherever he sits on the roster.
            clubPlayersBySeasonRating: phase51 && club ? save.players
                .map(p => {
                    const lines = [...(p.seasonLines ?? []), ...(p.seasonTally ? [{ season: p.seasonTally.season, clubId: p.seasonTally.clubId, maps: p.seasonTally.maps, rounds: p.seasonTally.rounds, rating: p.seasonTally.rounds ? p.seasonTally.ratingSum / p.seasonTally.rounds : 0 }] : [])]
                        .filter(l => l.season === 1 && l.clubId === club.id)
                    const rounds = lines.reduce((n, l) => n + l.rounds, 0)
                    return { nickname: p.nickname, maps: lines.reduce((n, l) => n + l.maps, 0), rating: rounds ? round(lines.reduce((s, l) => s + l.rating * l.rounds, 0) / rounds) : 0 }
                })
                .filter(r => r.maps > 0).sort((a, b) => b.rating - a.rating).slice(0, 6) : null,
        },
        worldAwards: honours ? {
            minMaps: honours.minMaps, ranked: honours.ranked,
            mvp: honours.mvp ? { name: honours.mvp.name, club: teamOf(honours.mvp.teamId), rating: honours.mvp.rating, score: honours.mvp.score, maps: honours.mvp.maps, titles: honours.mvp.trophies } : null,
            rookie: honours.rookie ? { name: honours.rookie.name, age: honours.rookie.age, rating: honours.rookie.rating, maps: honours.rookie.maps } : null,
            teamOfSeason: honours.teamOfSeason.map(w => `${w.name} (${w.role}, ${w.rating.toFixed(2)})`),
            top5: honours.top20.slice(0, 5).map(w => ({ rank: w.rank, name: w.name, club: teamOf(w.teamId), rating: w.rating, score: w.score, maps: w.maps, majors: w.majors })),
            titles: honours.titles.length, majorsWon: honours.titles.filter(t => t.major).map(t => `${t.name} → ${teamOf(t.teamId)}`),
            userClub: honours.userClub ? { ...honours.userClub, teamId: teamOf(honours.userClub.teamId), bestPlayer: honours.userClub.bestPlayer?.name ?? null, biggestWin: rec(honours.userClub.biggestWin as unknown as AnyRecord), worstLoss: rec(honours.userClub.worstLoss as unknown as AnyRecord) } : null,
        } : null,
        awardsEvent: awards ? {
            year: awards.year,
            fields: Object.keys(top20[0] ?? {}).sort(),
            top20MajorWinsTotal: top20.reduce((n, p) => n + Number(p.majorWins ?? 0), 0),
            top20MajorWinsWithoutAMajorClub: inventedMajors,
            top20Evps: top20.reduce((n, p) => n + Number(p.evpCount ?? 0), 0),
            first: top20[0] ? { nickname: top20[0].nickname, rating: top20[0].rating ?? top20[0].proRating ?? null, maps: top20[0].mapsPlayed ?? null } : null,
        } : null,
        records: save.recordBook ? {
            world: Object.fromEntries(Object.entries(save.recordBook.world).map(([k, v]) => [k, rec(v as unknown as AnyRecord)])),
            clubsWithRecords: Object.keys(save.recordBook.clubs).length,
        } : null,
        hallOfFame: { inducted: save.hallOfFame.filter(h => h.category === 'INDUCTED').length, withCareer: save.hallOfFame.filter(h => h.career).length },
        manager: {
            reputation: save.managerDetails.reputation,
            reputationLog: save.managerDetails.reputationLog ?? null,
            stints: (save.managerDetails.stints ?? []).map(s => ({ club: teamOf(s.teamId), from: s.fromWeek, to: s.toWeek ?? null, wl: `${s.wins}-${s.losses}`, titles: s.trophies, ended: s.ended ?? null })),
        },
        saveBytes: Buffer.byteLength(JSON.stringify(save)),
        recordBookBytes: save.recordBook ? Buffer.byteLength(JSON.stringify(save.recordBook)) : 0,
        nameCheck: nameOf(honours?.mvp?.playerId) === (honours?.mvp?.name ?? null),
    }
}

/**
 * --perf=<file>: the summary of `ESM_PERF_TRACE_STEPS=1 npx tsx scripts/perf-baseline.ts`
 * (week-tick steps and the records.officialMatch bucket) → the recorder's share of tick time.
 */
function perfShare(file: string | null) {
    if (!file) return null
    const buckets = Object.fromEntries([...fs.readFileSync(file, 'utf8').matchAll(/\[perf\] (\S+) count=(\d+) total=([\d.]+)ms/g)].map(m => [m[1], { count: Number(m[2]), totalMs: Number(m[3]) }]))
    const tickMs = Object.entries(buckets).filter(([k]) => k.startsWith('step.')).reduce((s, [, b]) => s + b.totalMs, 0)
    const rec = buckets['records.officialMatch']
    return {
        source: path.relative(root, file).split(path.sep).join('/'), ticks: buckets['step.6_matches']?.count ?? null, tickMs: round(tickMs, 1),
        recordOfficialMatch: rec ?? null,
        msPerTick: rec && buckets['step.6_matches'] ? round(rec.totalMs / buckets['step.6_matches'].count, 2) : null,
        shareOfTickTime: rec && tickMs ? round(rec.totalMs / tickMs, 4) : null,
        shareOfMatchStep: rec && buckets['step.6_matches'] ? round(rec.totalMs / buckets['step.6_matches'].totalMs, 4) : null,
    }
}
const perfFile = arg('perf', '')

const files = fs.readdirSync(dir).filter(f => f.endsWith('-final-save.json.gz')).sort().map(f => path.join(dir, f))
if (!files.length) throw Error(`No final saves in ${dir} (run the campaign worker with --dump-final)`)
const perSeed = files.map(analyse)
const pooled = perSeed.flatMap(s => s.regulars.avgRating.n ? [s.regulars.avgRatingMean ?? 0] : [])
const evidence = {
    generated: new Date().toISOString(),
    label, out,
    driver: 'long-career-campaign.ts worker (real useGameStore coordinator, full snapshot world, competent policy), one season (52 ticks, ends in week 53 after the season closed), final save kept with --dump-final.',
    seeds: perSeed.length,
    aggregate: {
        regulars: perSeed.reduce((n, s) => n + s.regulars.count, 0),
        regularsWithZeroAvgRating: perSeed.reduce((n, s) => n + s.regulars.avgRatingZero, 0),
        avgRatingMeanPerSeed: pooled,
        avgRatingMeanAcrossSeeds: pooled.length ? round(mean(pooled)!) : null,
        managedMvpIsFirstRosterPlayer: perSeed.map(s => s.managedClubSeasonMvp.isFirstRosterPlayer),
        // The club MVP is the best season rating among club players with 30%+ of the busiest player's maps.
        managedMvpIsBestClubSeasonRating: perSeed.map(s => {
            const rows = s.managedClubSeasonMvp.clubPlayersBySeasonRating
            if (!rows || !s.managedClubSeasonMvp.mvp) return null
            const busiest = Math.max(...rows.map(r => r.maps))
            return rows.find(r => r.maps >= Math.ceil(busiest * 0.3))?.nickname === s.managedClubSeasonMvp.mvp.nickname
        }),
        worldSeasonMvp: perSeed.map(s => s.worldAwards?.mvp?.name ?? null),
        worldSeasonMvpIsManagedFirstRosterPlayer: perSeed.map(s => s.worldAwards?.mvp ? s.worldAwards.mvp.name === s.managedClubSeasonMvp.firstRosterPlayer : null),
        awardsWithMajorWinsWithoutAMajorClub: perSeed.reduce((n, s) => n + (s.awardsEvent?.top20MajorWinsWithoutAMajorClub ?? 0), 0),
        saveLoadRoundTripIdentical: perSeed.map(s => s.determinism.saveLoadRoundTripIdentical),
        hallOfFameInducted: perSeed.map(s => s.hallOfFame.inducted),
        saveBytes: perSeed.map(s => s.saveBytes),
    },
    performance: perfShare(perfFile ? path.resolve(root, perfFile) : null),
    perSeed,
}
const target = path.join(root, 'docs/launch-readiness/evidence', `phase5-1-records-${out}.json`)
fs.writeFileSync(target, JSON.stringify(evidence, null, 2) + '\n')
process.stdout.write(`${path.relative(root, target)}: ${JSON.stringify(evidence.aggregate)}\n`)
