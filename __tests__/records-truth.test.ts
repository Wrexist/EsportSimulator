/**
 * Phase 5.1 — records & truth.
 *
 * Official matches (managed and AI) write real per-map numbers into careers,
 * season tallies and the record book; friendlies do not. A season closes
 * into lines and awards decided from those numbers; records keep who, when
 * and against whom; the Hall of Fame and the manager timeline read the same
 * truth.
 */
import { produce, enableMapSet } from 'immer'
import { createLaunchFixture, FixtureStorage } from '../scripts/launch/fixtures'
import { matchEngine } from '@/engine/match-engine'
import { SeededRNG } from '@/engine/rng'
import { SaveManager } from '@/engine/save-manager'
import { AtomicWeekProcessor } from '@/engine/atomic-week-processor'
import { createMatchSimulationSlice } from '@/store/slices/match-simulation-slice'
import { scriptLine, tallyScriptMap } from '@/engine/match/match-stats'
import { competitionWeight, recordOfficialMatch, recordTitle, isOfficialMatch, seasonOfWeek } from '@/engine/official-stats'
import { closeSeason, decideAwards, pickTeamOfSeason, rankRows, seasonRows, ageInSeason } from '@/engine/season-honours'
import { getSeasonReview } from '@/engine/season-review'
import { buildAnnualAwards, isRealAwards } from '@/engine/pro-awards-engine'
import { hallOfFameEntry, hallOfFameReasons, qualifiesForHallOfFame } from '@/engine/hall-of-fame-manager'
import { adjustManagerReputation, closeStint, currentStint, openStint, recordManagedResult } from '@/engine/manager-timeline'
import { JobOfferGenerator } from '@/engine/job-offer-generator'
import { computeSeasonSummary } from '@/engine/career-stats'
import { RECORDS_TUNING } from '@/lib/balance-tuning'
import type { GameSave, MatchSaveData, PlayerSaveData } from '@/engine/save-types'
import type { MapResult, MatchResult, RoundResult } from '@/types'
import type { StoreState } from '@/store/types'
import { TrainingFocus } from '@/types'

enableMapSet()

const LEAGUE = 'league_s1_test_d1'

/** A real script-v1 series between two fixture clubs. */
function engineResult(save: GameSave, match: MatchSaveData, seed = 11): MatchResult {
    const home = save.teams.find(t => t.id === match.homeTeamId)!, away = save.teams.find(t => t.id === match.awayTeamId)!
    const of = (ids: string[]) => ids.map(id => save.players.find(p => p.id === id)!).slice(0, 5)
    return matchEngine.simulateMatch({ ...match, engineVersion: 'script-v1' }, home, away, of(home.rosterIds), of(away.rosterIds), new SeededRNG(seed), 0, 0, [], [], save.playerTeamId)
}

/** A synthetic script-v1 map: each round's winners each kill one loser (100 damage). */
function fakeMap(map: string, homeIds: string[], awayIds: string[], homeRounds: number, awayRounds: number): MapResult {
    const rounds: RoundResult[] = []
    const round = (winners: string[], losers: string[], ct: string, t: string): RoundResult => ({
        roundNumber: rounds.length + 1, winner: 'ct', winType: 'ELIMINATION', ctTeam: ct, tTeam: t, kills: [],
        events: losers.map((victim, i) => ({ type: 'KILL', time: 10 + i * 20, playerId: winners[i % winners.length], victimId: victim } as never)),
        damage: Object.fromEntries(winners.map(id => [id, 100])),
    })
    for (let i = 0; i < homeRounds; i++) rounds.push(round(homeIds, awayIds, 'home', 'away'))
    for (let i = 0; i < awayRounds; i++) rounds.push(round(awayIds, homeIds, 'away', 'home'))
    return { map, ctStartTeamId: 'home', tStartTeamId: 'away', rounds, finalScore: { team1: homeRounds, team2: awayRounds }, homeScore: homeRounds, awayScore: awayRounds, mvpPlayerId: homeIds[0] } as unknown as MapResult
}

function fakeResult(save: GameSave, homeId: string, awayId: string, maps: Array<[number, number]>): MatchResult {
    const home = save.teams.find(t => t.id === homeId)!.rosterIds.slice(0, 5), away = save.teams.find(t => t.id === awayId)!.rosterIds.slice(0, 5)
    const played = maps.map(([h, a], i) => fakeMap(['Mirage', 'Nuke', 'Inferno'][i], home, away, h, a))
    const homeMaps = maps.filter(([h, a]) => h > a).length, awayMaps = maps.length - homeMaps
    return { engineVersion: 'script-v1', winnerId: homeMaps > awayMaps ? homeId : awayId, homeScore: homeMaps, awayScore: awayMaps, maps: played, mvpPlayerId: (homeMaps > awayMaps ? home : away)[0], playerStats: {}, lineups: { [homeId]: home, [awayId]: away } }
}

const official = (id: string, home: string, away: string, week: number): MatchSaveData =>
    ({ id, homeTeamId: home, awayTeamId: away, tournamentId: LEAGUE, stage: 'Round 1', week, format: 'BO1', seed: 1 })

describe('per-match accumulation', () => {
    test('managed path: a committed official result writes real per-map numbers once; the friendly does not count', () => {
        const save = createLaunchFixture('first-week', 51001)
        const friendly = save.scheduledMatches[0]
        let state = { ...save, saveId: save.saveId, managerDetails: save.managerDetails, newsFeed: [] } as unknown as StoreState
        const set = (fn: Partial<StoreState> | ((s: StoreState) => void)) => { state = typeof fn === 'function' ? produce(state, fn) : { ...state, ...fn } }
        const slice = createMatchSimulationSlice(set, () => state)

        // The fixture's scheduled match is a friendly: no official numbers.
        slice.saveMatchResult(friendly.id, engineResult(save, friendly))
        expect(state.completedMatches).toHaveLength(1)
        expect(state.players.every(p => !p.mapsPlayed && !p.seasonTally)).toBe(true)
        expect(state.recordBook).toBeUndefined()

        const match = { ...official('rt_managed', save.teams[0].id, save.teams[1].id, 1), engineVersion: 'script-v1' as const }
        const result = engineResult(save, match, 23)
        set(s => { s.scheduledMatches.push(match) })
        slice.saveMatchResult(match.id, result)
        const committed = state.completedMatches.find(m => m.id === match.id)!.result
        const ids = Object.values(committed.lineups!).flat()
        for (const id of ids) {
            const p = state.players.find(x => x.id === id)!
            const maps = committed.maps.filter(m => m.rounds.length)
            let rounds = 0, ratingSum = 0, kills = 0
            for (const map of maps) {
                const t = tallyScriptMap(map, ids).get(id)!
                rounds += map.rounds.length
                ratingSum += scriptLine(t, map.rounds.length).rating * map.rounds.length
                kills += t.kills
            }
            expect(p.mapsPlayed).toBe(maps.length)
            expect(p.roundsPlayed).toBe(rounds)
            expect(p.avgRating).toBeCloseTo(ratingSum / rounds, 3)
            expect(p.totalKills).toBe(kills)
            expect(p.totalKills).toBe(committed.playerStats[id].kills)
            expect(p.seasonTally).toMatchObject({ season: 1, maps: maps.length, rounds, kills })
        }
        // Manager: one official result on the stint and in the season book.
        expect(state.managerDetails.stints).toHaveLength(1)
        expect(state.managerDetails.stints![0]).toMatchObject({ teamId: save.teams[0].id, matches: 1, fromWeek: 1 })
        expect(state.managerDetails.stints![0].trackedFromWeek).toBeUndefined()
        const user = state.recordBook!.open[0].user[save.teams[0].id]
        expect(user.wins + user.losses).toBe(1)
        expect(state.recordBook!.world.bestMapRating).toBeDefined()

        // A repeated commit is refused by the slice: nothing doubles.
        const before = JSON.stringify(state.players)
        set(s => { s.scheduledMatches.push(match) })
        slice.saveMatchResult(match.id, result)
        expect(JSON.stringify(state.players)).toBe(before)
    })

    test('AI path: the week tick records AI-vs-AI official matches before their rounds are stripped', async () => {
        const save = createLaunchFixture('first-week', 51002)
        const [, ai1, ai2] = save.teams
        save.scheduledMatches = [{ ...official('rt_ai', ai1.id, ai2.id, 2), engineVersion: 'script-v1' }]
        const processor = new AtomicWeekProcessor(new SaveManager(new FixtureStorage()))
        const res = await processor.processWeek(save, { playerTeamId: save.playerTeamId!, trainingFocus: new Map([[save.playerTeamId!, { focus: TrainingFocus.AIM, intensity: 5 }]]) }, new SeededRNG(9))
        expect(res.success).toBe(true)
        const done = save.completedMatches.find(m => m.id === 'rt_ai')!
        expect(done.result.maps.every(m => m.rounds.length === 0)).toBe(true) // stripped for size
        const lineup = [...done.result.lineups![ai1.id], ...done.result.lineups![ai2.id]]
        for (const id of lineup) {
            const p = save.players.find(x => x.id === id)!
            expect(p.mapsPlayed).toBe(done.result.maps.length)
            expect(p.roundsPlayed).toBeGreaterThan(0)
            expect(p.avgRating).toBeGreaterThan(0)
            expect(p.totalKills).toBe(done.result.playerStats[id].kills)
        }
        // Managed players did not play and carry nothing.
        expect(save.teams[0].rosterIds.every(id => !save.players.find(p => p.id === id)!.mapsPlayed)).toBe(true)
        // The managed club's manager stint is untouched by AI results.
        expect(save.managerDetails.stints ?? []).toHaveLength(0)
    })

    test('competition weights follow the Phase 4.8 rating K, league maps scaled by division', () => {
        expect(competitionWeight('S_TIER')).toBe(1)
        expect(competitionWeight('LEAGUE', 1)).toBeCloseTo(0.4)
        expect(competitionWeight('LEAGUE', 2)).toBeCloseTo(0.4 * RECORDS_TUNING.LEAGUE_DIVISION_FACTOR[1])
        expect(competitionWeight('LEAGUE', 9)).toBeCloseTo(0.4 * RECORDS_TUNING.LEAGUE_DIVISION_FACTOR.at(-1)!)
        expect(competitionWeight('FRIENDLY')).toBe(0)
        expect(isOfficialMatch({ tournamentId: 'SCRIM' })).toBe(false)
        expect(isOfficialMatch({ tournamentId: LEAGUE, isScrim: true })).toBe(false)
        expect(isOfficialMatch({ tournamentId: LEAGUE })).toBe(true)
    })

    test('a forfeit (no rounds) and a scrim never count', () => {
        const save = createLaunchFixture('first-week', 51003)
        const r = fakeResult(save, save.teams[1].id, save.teams[2].id, [[13, 5]])
        expect(recordOfficialMatch(save, { ...official('f1', save.teams[1].id, save.teams[2].id, 3), tournamentId: 'SCRIM' }, r)).toBe(false)
        expect(recordOfficialMatch(save, official('f2', save.teams[1].id, save.teams[2].id, 3), { ...r, maps: r.maps.map(m => ({ ...m, rounds: [] })) })).toBe(false)
        expect(save.players.some(p => p.mapsPlayed)).toBe(false)
    })
})

describe('records', () => {
    test('best map rating, most kills, biggest win and win streaks keep who, when and opponent', () => {
        const save = createLaunchFixture('first-week', 51004)
        const [, a, b, c] = [null, save.teams[1].id, save.teams[2].id, save.teams[0].id]
        recordOfficialMatch(save, official('m1', a, b, 3), fakeResult(save, a, b, [[13, 2]]))
        recordOfficialMatch(save, official('m2', a, b, 4), fakeResult(save, a, b, [[13, 0]]))
        recordOfficialMatch(save, official('m3', b, a, 5), fakeResult(save, b, a, [[11, 13]]))
        const book = save.recordBook!
        expect(book.world.biggestWin).toMatchObject({ value: 13, teamId: a, opponentId: b, week: 4, score: '13-0', map: 'Mirage', matchId: 'm2' })
        expect(book.world.longestWinStreak).toMatchObject({ value: 3, teamId: a, fromWeek: 3, week: 5 })
        expect(book.world.mostMapKills?.teamId).toBe(a)
        expect(book.world.bestMapRating?.playerName).toBeTruthy()
        // The run ends: the record names who ended it.
        recordOfficialMatch(save, official('m4', c, a, 6), fakeResult(save, c, a, [[13, 9]]))
        expect(book.world.longestWinStreak).toMatchObject({ value: 3, teamId: a, endedBy: c })
        expect(book.clubs[a].streak).toBeUndefined()
        expect(book.clubs[c].streak).toMatchObject({ count: 1, fromWeek: 6 })
        // Records falling inside the first season are first marks, not "broken".
        expect(book.open[0].broken).toEqual([])
        // Beating a season-1 mark in season 2 is.
        recordOfficialMatch(save, official('m5', b, c, 60), fakeResult(save, b, c, [[16, 0]]))
        expect(book.world.biggestWin).toMatchObject({ value: 16, teamId: b, week: 60 })
        expect(book.open.find(o => o.season === 2)!.broken).toContain('biggestWin')
        expect(book.open.find(o => o.season === 1)!.bests.biggestWin?.value).toBe(13)
    })
})

/** A season line for a player (bypassing matches) for award tests. */
function line(p: PlayerSaveData, season: number, clubId: string, maps: number, rating: number, weight = 1) {
    const rounds = maps * 22
    ;(p.seasonLines ??= []).push({ season, clubId, maps, rounds, kills: Math.round(rounds * 0.7 * rating), deaths: Math.round(rounds * 0.68), adr: 75 * rating, rating, impact: Math.round((rating - 1) * rounds * weight * 10) / 10 })
}

describe('season rollover and awards', () => {
    function worldWithSeason() {
        const save = createLaunchFixture('first-week', 51005)
        save.currentWeek = 53
        const [t0, t1, t2] = save.teams
        const ps = save.players
        // The first roster player is NOT the best: the MVP must come from the numbers.
        ps.forEach((p, i) => { p.age = 25; line(p, 1, i < 5 ? t0.id : i < 10 ? t1.id : t2.id, 30, 0.9 + (i % 5) * 0.06) })
        ps.find(p => p.id === 'p_b4')!.seasonLines![0].rating = 1.31
        ps.find(p => p.id === 'p_b4')!.seasonLines![0].impact = 0.31 * 660
        ps.find(p => p.id === 'p_c2')!.age = 21 // 20 during season 1
        return save
    }

    test('MVP, Top 20, team of the season and rookie come from real season numbers, deterministically', () => {
        const a = worldWithSeason(), b = structuredClone(a)
        const ha = closeSeason(a, 1)!, hb = closeSeason(b, 1)!
        expect(ha).toEqual(hb)
        expect(ha.mvp?.playerId).toBe('p_b4')
        expect(ha.mvp?.playerId).not.toBe(a.teams[0].rosterIds[0])
        expect(ha.top20.map(w => w.rank)).toEqual(ha.top20.map((_, i) => i + 1))
        expect(ha.rookie?.playerId).toBe('p_c2')
        expect(ha.rookie?.age).toBe(20)
        const roles = ha.teamOfSeason.map(w => w.role)
        expect(roles.filter(r => r === 'AWPER')).toHaveLength(1)
        expect(ha.teamOfSeason).toHaveLength(5)
        expect(a.players.find(p => p.id === 'p_b4')!.honours).toContainEqual({ season: 1, award: 'MVP' })
        // Idempotent.
        expect(closeSeason(a, 1)).toBeNull()
        expect(a.recordBook!.honours).toHaveLength(1)
        // The ceremony shows real fields only.
        const awards = buildAnnualAwards(a, ha, a.playerTeamId!)
        expect(isRealAwards(awards)).toBe(true)
        expect(awards.top20[0]).toMatchObject({ playerId: 'p_b4', rating: 1.31, mapsPlayed: 30 })
        expect(isRealAwards({ year: 2, top20: [{ proRating: 1.2 }] })).toBe(false)
    })

    test('season tallies close into lines at rollover and the open season reads provisionally', () => {
        const save = createLaunchFixture('first-week', 51006)
        const [h, aw] = [save.teams[1].id, save.teams[2].id]
        for (let w = 2; w <= 10; w++) recordOfficialMatch(save, official(`s${w}`, h, aw, w), fakeResult(save, h, aw, [[13, 13 - w]]))
        const p = save.players.find(x => x.id === save.teams[1].rosterIds[0])!
        expect(p.seasonTally?.maps).toBe(9)
        const live = getSeasonReview(save, 1)!
        expect(live.final).toBe(false)
        expect(live.awards.mvp).toBeDefined()
        save.currentWeek = 53
        const h1 = closeSeason(save, 1)!
        expect(p.seasonTally).toBeUndefined()
        expect(p.seasonLines).toEqual([expect.objectContaining({ season: 1, clubId: h, maps: 9 })])
        expect(h1.minMaps).toBe(5) // half the busiest player's 9 maps
        const review = getSeasonReview(save, 1)!
        expect(review.final).toBe(true)
        expect(review.records.season.longestWinStreak?.value).toBe(9)
        // A new season's first match opens a new tally.
        recordOfficialMatch(save, official('s60', h, aw, 60), fakeResult(save, h, aw, [[13, 3]]))
        expect(p.seasonTally).toMatchObject({ season: 2, maps: 1 })
        expect(p.seasonLines).toHaveLength(1)
    })

    test('a transfer closes the line for the old club; titles go to the roster at the time', () => {
        const save = createLaunchFixture('first-week', 51007)
        const [mine, a, b] = save.teams
        recordOfficialMatch(save, official('t1', a.id, b.id, 3), fakeResult(save, a.id, b.id, [[13, 4]]))
        const mover = save.players.find(p => p.id === a.rosterIds[1])!
        // Move to the managed club, play there, and win a title there.
        a.rosterIds = a.rosterIds.filter(id => id !== mover.id); mine.rosterIds[4] = mover.id
        recordOfficialMatch(save, official('t2', mine.id, b.id, 5), fakeResult(save, mine.id, b.id, [[13, 7]]))
        recordTitle(save, mine, { tournamentId: 'major_copenhagen_s1', name: 'Northern Major', tier: 'S_TIER', week: 15, season: 1 })
        expect(mover.seasonLines).toEqual([expect.objectContaining({ season: 1, clubId: a.id, maps: 1 })])
        expect(mover.seasonTally).toMatchObject({ clubId: mine.id, maps: 1, trophies: 1, majors: 1 })
        expect(mover.majorWins).toBe(1)
        expect(mover.careerTrophies).toBe(1)
        // Idempotent per title and club.
        recordTitle(save, mine, { tournamentId: 'major_copenhagen_s1', name: 'Northern Major', tier: 'S_TIER', week: 15, season: 1 })
        expect(mover.majorWins).toBe(1)
        expect(save.managerDetails.stints?.[0].trophies).toBe(1)
        // The club's season summary MVP comes from the club's real numbers.
        expect(computeSeasonSummary(save).mvpPlayerId).toBeDefined()
    })

    test('team of the season keeps one AWPer and one IGL; ages read back to the season', () => {
        const save = createLaunchFixture('first-week', 51008)
        // The best five by score would be three AWPers and two riflers.
        const roles = ['AWPER', 'AWPER', 'AWPER', 'RIFLER', 'RIFLER', 'RIFLER', 'IGL', 'ENTRY_FRAGGER', 'SUPPORT', 'IGL']
        save.players.forEach((p, i) => { p.role = roles[i % roles.length]; line(p, 1, save.teams[0].id, 25, 1.5 - i / 100) })
        const rows = rankRows(seasonRows(save, 1), 20)
        const team = pickTeamOfSeason(rows).map(r => r.player.role)
        expect(team).toHaveLength(5)
        expect(team.filter(r => r === 'AWPER')).toHaveLength(1)
        expect(team.filter(r => r === 'IGL')).toHaveLength(1)
        expect(team.filter(r => r === 'RIFLER')).toHaveLength(2)
        expect(team).toContain('ENTRY_FRAGGER')
        const p = { age: 22, isRetired: false } as PlayerSaveData
        expect(ageInSeason(p, 1, 53)).toBe(21)
        expect(ageInSeason(p, 2, 60)).toBe(22)
        expect(ageInSeason({ ...p, isRetired: true, retirementWeek: 52 }, 1, 53)).toBe(22)
        expect(decideAwards([], 1, 53).mvp).toBeUndefined()
        expect(seasonOfWeek(52)).toBe(1)
        expect(seasonOfWeek(53)).toBe(2)
    })
})

describe('Hall of Fame from real careers', () => {
    test('criteria read official maps, rating, titles, Majors and season awards; the entry keeps the career', () => {
        const base = { matchesPlayed: 100, totalKills: 0, avgRating: 0, majorWins: 0 }
        expect(qualifiesForHallOfFame(base)).toBe(false)
        // A high rating over a handful of maps is not a career.
        expect(qualifiesForHallOfFame({ ...base, avgRating: 1.4, mapsPlayed: 40 })).toBe(false)
        expect(qualifiesForHallOfFame({ ...base, avgRating: 1.21, mapsPlayed: 300 })).toBe(true)
        expect(qualifiesForHallOfFame({ ...base, majorWins: 1, careerTrophies: 6 })).toBe(true)
        expect(qualifiesForHallOfFame({ ...base, honours: [{ season: 1, award: 'MVP' }, { season: 3, award: 'MVP' }] })).toBe(true)
        // Match MVPs alone are not an achievement any more.
        expect(hallOfFameReasons({ ...base, totalMVPs: 40 })).toEqual([])
        const p = { ...createLaunchFixture('first-week').players[0], mapsPlayed: 320, avgRating: 1.18, totalKills: 2600, careerTrophies: 7, majorWins: 1, seasonLines: [{ season: 2 }, { season: 5 }] } as PlayerSaveData
        const entry = hallOfFameEntry(p, 5 * 52, 'team_x')
        expect(entry.career).toMatchObject({ maps: 320, rating: 1.18, kills: 2600, trophies: 7, majors: 1, lastClubId: 'team_x' })
        expect(entry.eraStart).toBe(2)
        expect(entry.inductionReasons.map(r => r.label)).toEqual(expect.arrayContaining(['1x Major champion', '7 titles', '1.18 rating over 320 maps', '2600 official kills']))
    })
})

describe('manager timeline and reputation', () => {
    test('reputation changes are clamped and logged with their cause', () => {
        const save = createLaunchFixture('first-week', 51009)
        save.managerDetails.reputation = 97
        expect(adjustManagerReputation(save, 6, 'Season 1 board review: expectations exceeded')).toBe(3)
        expect(adjustManagerReputation(save, 1, 'Auto-played win')).toBe(0)
        expect(save.managerDetails.reputation).toBe(100)
        expect(save.managerDetails.reputationLog).toEqual([{ week: 1, delta: 3, cause: 'Season 1 board review: expectations exceeded' }])
    })

    test('stints: results, a move to another club, a sacking; older saves say when tracking began', () => {
        const save = createLaunchFixture('first-week', 51010)
        recordManagedResult(save, true, 'x1')
        recordManagedResult(save, false, 'x2')
        expect(currentStint(save)).toMatchObject({ teamId: save.teams[0].id, matches: 2, wins: 1, losses: 1 })
        // Take a job elsewhere: the old stint ends "moved", the new one opens.
        save.currentWeek = 20
        save.eventsLog.push({ id: 'job1', type: 'JOB_OFFER', week: 20, acknowledged: false, data: { offeringTeamId: save.teams[1].id, salaryOffer: 1000, deadlineWeek: 30 } })
        expect(JobOfferGenerator.acceptJobOffer(save, 'job1').success).toBe(true)
        const stints = save.managerDetails.stints!
        expect(stints[0]).toMatchObject({ ended: 'moved', toWeek: 20 })
        expect(stints[1]).toMatchObject({ teamId: save.teams[1].id, fromWeek: 21, matches: 0 })
        closeStint(save, 'sacked')
        closeStint(save, 'folded') // already closed
        expect(stints[1]).toMatchObject({ ended: 'sacked', toWeek: 20 })
        // An old save with official history opens its first stint lazily and says so.
        const old = createLaunchFixture('first-week', 51011)
        old.currentWeek = 30
        old.completedMatches.push({ ...official('old1', old.teams[0].id, old.teams[1].id, 12), result: fakeResult(old, old.teams[0].id, old.teams[1].id, [[13, 2]]) })
        openStint(old) // a fresh job: complete by definition
        expect(old.managerDetails.stints![0].trackedFromWeek).toBeUndefined()
        old.managerDetails.stints = []
        recordManagedResult(old, true, 'new1')
        expect(old.managerDetails.stints![0]).toMatchObject({ fromWeek: 1, trackedFromWeek: 30, matches: 1 })
    })
})
