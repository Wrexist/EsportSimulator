/**
 * Official-match statistics (Phase 5.1): every official match — managed or
 * AI, league or tournament — writes its real per-map player numbers into the
 * players' careers, their season tallies and the record book.
 *
 *   Career (PlayerSaveData): mapsPlayed, roundsPlayed, avgRating (the
 *     rounds-weighted average of map ratings), totalKills/Deaths/Assists/
 *     Damage, debutSeason, personal bests.
 *   Season: seasonTally per (season, club), closed into a seasonLines entry
 *     when the player changes club or the season is closed.
 *   Records (GameSave.recordBook): world and club records (best rating and
 *     most kills in a map, biggest map win, longest official win streak),
 *     the season's bests, titles, and the managed club's season.
 *
 * Official = a league or tournament match (world-ranking matchImportance is
 * not FRIENDLY) that is not a scrim. Forfeits (no rounds) do not count.
 * script-v1 results are read map by map from the recorded rounds (the same
 * tallies as the match screen's stat block); a legacy-v2 result has no damage
 * table, so it adds its series totals without map records.
 *
 * Cost: one pass over each map's round events (the same work the engine did
 * to build the series stat block) plus O(1) record checks. Deterministic: no
 * RNG; ties keep the earlier record.
 */

import type { GameSave, MatchSaveData, PlayerSaveData, TeamSaveData } from "./save-types"
import type {
    ClubRecordSet, OpenSeasonBook, PlayerSeasonLine, PlayerSeasonTally, RecordBook, RecordEntry, RecordKey, RecordSet, SeasonHonours, SeasonTitle,
} from "./records-types"
import type { MapResult, MatchResult } from "@/types"
import { scriptLine, tallyScriptMap } from "./match/match-stats"
import { matchImportance, type MatchImportance } from "./world-ranking"
import { RANKING_TUNING, RECORDS_TUNING } from "@/lib/balance-tuning"
import { recordManagedResult, recordManagedTitle } from "./manager-timeline"
import { perfTrace } from "./perf-trace"

export const WEEKS_PER_SEASON = 52

export const seasonOfWeek = (week: number): number => Math.max(1, Math.ceil(week / WEEKS_PER_SEASON))

const round = (value: number, dp: number) => { const f = 10 ** dp; return Math.round(value * f) / f }

/** True for a Major (the calendar's `major_*` events, any season instance). */
export function isMajorTournament(tournamentId: string | null | undefined): boolean {
    return !!tournamentId && tournamentId.replace(/_s\d+$/, "").startsWith("major_")
}

/**
 * Weight of a map in the season score: the competition's rating K relative
 * to an S-tier event (RANKING_TUNING.K, Phase 4.8), league maps scaled by
 * division level (RECORDS_TUNING.LEAGUE_DIVISION_FACTOR). 0 for friendlies.
 */
export function competitionWeight(importance: MatchImportance, divisionLevel?: number): number {
    if (importance === "FRIENDLY") return 0
    const k = RANKING_TUNING.K
    const top = k.S_TIER || 1
    const base = (k[importance] ?? k.C_TIER) / top
    if (importance !== "LEAGUE") return base
    const factors = RECORDS_TUNING.LEAGUE_DIVISION_FACTOR
    const level = divisionLevel && divisionLevel > 0 ? Math.floor(divisionLevel) : 1
    return base * factors[Math.min(factors.length, level) - 1]
}

// ---------------------------------------------------------------- record book

export function ensureRecordBook(save: Pick<GameSave, "recordBook">): RecordBook {
    if (!save.recordBook) save.recordBook = { version: 1, world: {}, clubs: {}, open: [], honours: [] }
    return save.recordBook
}

export function openSeasonBook(book: RecordBook, season: number): OpenSeasonBook {
    let open = book.open.find(b => b.season === season)
    if (!open) {
        open = { season, bests: {}, broken: [], titles: [], user: {} }
        book.open.push(open)
        book.open.sort((a, b) => a.season - b.season)
        // Seasons whose honours were never built (an interrupted rollover) do not pile up.
        if (book.open.length > 3) book.open.splice(0, book.open.length - 3)
    }
    return open
}

export function honoursFor(save: Pick<GameSave, "recordBook">, season: number): SeasonHonours | undefined {
    return save.recordBook?.honours.find(h => h.season === season)
}

const clubSet = (book: RecordBook, teamId: string): ClubRecordSet => book.clubs[teamId] ?? (book.clubs[teamId] = {})

/**
 * Offer a value for a record (strictly higher replaces; ties keep the earlier).
 * Updates the holder club's all-time record, the world record and the season's best.
 */
function offerRecord(book: RecordBook, open: OpenSeasonBook, key: RecordKey, entry: RecordEntry): void {
    const club = clubSet(book, entry.teamId)
    if (!(club[key] && club[key]!.value >= entry.value)) club[key] = entry
    if (!(open.bests[key] && open.bests[key]!.value >= entry.value)) open.bests[key] = entry
    const prior = book.world[key]
    if (prior && prior.value >= entry.value) return
    // A mark from an earlier season falling is "broken"; the first marks of a career are not.
    if (prior && seasonOfWeek(prior.week) < open.season && !open.broken.includes(key)) open.broken.push(key)
    book.world[key] = entry
}

// ---------------------------------------------------------------- season tallies

type TallyDelta = Partial<Omit<PlayerSeasonTally, "season" | "clubId">>
const TALLY_FIELDS = ["maps", "rounds", "kills", "deaths", "assists", "damage", "ratingSum", "impact", "trophies", "majors", "mvps"] as const

const emptyTally = (season: number, clubId: string): PlayerSeasonTally =>
    ({ season, clubId, maps: 0, rounds: 0, kills: 0, deaths: 0, assists: 0, damage: 0, ratingSum: 0, impact: 0, trophies: 0, majors: 0, mvps: 0 })

/** A tally as a closed season line (compact: zero counters omitted). */
export function lineOfTally(t: PlayerSeasonTally): PlayerSeasonLine {
    const line: PlayerSeasonLine = {
        season: t.season, clubId: t.clubId, maps: t.maps, rounds: t.rounds, kills: t.kills, deaths: t.deaths,
        adr: t.rounds ? round(t.damage / t.rounds, 1) : 0,
        rating: t.rounds ? round(t.ratingSum / t.rounds, 2) : 0,
        impact: round(t.impact, 1),
    }
    if (t.trophies) line.trophies = t.trophies
    if (t.majors) line.majors = t.majors
    if (t.mvps) line.mvps = t.mvps
    return line
}

function pushLine(p: PlayerSaveData, line: PlayerSeasonLine): void {
    const lines = p.seasonLines ?? (p.seasonLines = [])
    lines.push(line)
    if (lines.length > RECORDS_TUNING.SEASON_LINES_CAP) lines.splice(0, lines.length - RECORDS_TUNING.SEASON_LINES_CAP)
}

/** Close the player's open tally into a season line (empty tallies leave no line). */
export function closeTally(p: PlayerSaveData): void {
    const t = p.seasonTally
    if (!t) return
    if (t.maps > 0 || t.trophies > 0) pushLine(p, lineOfTally(t))
    p.seasonTally = undefined
}

/** Merge a delta into an already-closed line (a late result for an earlier season). */
function mergeIntoLine(p: PlayerSaveData, season: number, clubId: string, d: TallyDelta): void {
    const line = [...(p.seasonLines ?? [])].reverse().find(l => l.season === season && l.clubId === clubId)
    if (!line) {
        const t = emptyTally(season, clubId)
        for (const key of TALLY_FIELDS) t[key] += d[key] ?? 0
        const lines = p.seasonLines ?? (p.seasonLines = [])
        // Keep lines in season order.
        const at = lines.findIndex(l => l.season > season)
        lines.splice(at < 0 ? lines.length : at, 0, lineOfTally(t))
        return
    }
    const rounds = line.rounds + (d.rounds ?? 0)
    if (rounds > 0) {
        line.adr = round((line.adr * line.rounds + (d.damage ?? 0)) / rounds, 1)
        line.rating = round((line.rating * line.rounds + (d.ratingSum ?? 0)) / rounds, 2)
    }
    line.rounds = rounds
    line.maps += d.maps ?? 0
    line.kills += d.kills ?? 0
    line.deaths += d.deaths ?? 0
    line.impact = round(line.impact + (d.impact ?? 0), 1)
    for (const key of ["trophies", "majors", "mvps"] as const) {
        const v = (line[key] ?? 0) + (d[key] ?? 0)
        if (v) line[key] = v
    }
}

/** Add to the player's (season, club) totals, closing the open tally when the season or club changed. */
export function addSeasonDelta(p: PlayerSaveData, season: number, clubId: string, d: TallyDelta): void {
    const t = p.seasonTally
    // A late result or title for a season already closed for this player.
    if (t && t.season > season) return mergeIntoLine(p, season, clubId, d)
    if (!t && (p.seasonLines ?? []).some(l => l.season > season)) return mergeIntoLine(p, season, clubId, d)
    let tally = t
    if (!tally || tally.season !== season || tally.clubId !== clubId) {
        closeTally(p)
        tally = p.seasonTally = emptyTally(season, clubId)
    }
    for (const key of TALLY_FIELDS) {
        const v = d[key]
        if (v) tally[key] = key === "ratingSum" || key === "impact" ? round(tally[key] + v, 4) : tally[key] + v
    }
}

// ---------------------------------------------------------------- match recording

export interface OfficialMatchLookups {
    player?: (id: string) => PlayerSaveData | undefined
    team?: (id: string) => TeamSaveData | undefined
    /** Tier of the match's tournament when the caller already resolved it (null = none). */
    tournamentTier?: string | null
}

type OfficialMatch = Pick<MatchSaveData, "id" | "homeTeamId" | "awayTeamId" | "tournamentId" | "week"> & Partial<Pick<MatchSaveData, "isScrim">>

/** True when a match counts for stats and records (not a friendly/scrim). */
export function isOfficialMatch(match: Pick<MatchSaveData, "tournamentId"> & Partial<Pick<MatchSaveData, "isScrim">>): boolean {
    return !match.isScrim && matchImportance(match.tournamentId) !== "FRIENDLY"
}

const mapScore = (m: MapResult) => ({
    home: m.homeScore ?? m.finalScore?.team1 ?? 0,
    away: m.awayScore ?? m.finalScore?.team2 ?? 0,
})

function updatePersonalBest(p: PlayerSaveData, key: "bestMapRating" | "mostMapKills", value: number, week: number, vs: string, map: string): void {
    const best = p[key]
    if (best && best.value >= value) return
    p[key] = { value, week, vs, map }
}

/**
 * Record one official match. Call once, when the result is committed, with
 * the full result (rounds still attached). Returns false for friendlies,
 * scrims and forfeits.
 */
export function recordOfficialMatch(save: GameSave, match: OfficialMatch, result: MatchResult, lookups: OfficialMatchLookups = {}): boolean {
    const startedAt = perfTrace.stepsEnabled ? perfTrace.now() : 0
    const recorded = recordMatch(save, match, result, lookups)
    if (perfTrace.stepsEnabled) perfTrace.step("records.officialMatch", startedAt)
    return recorded
}

function recordMatch(save: GameSave, match: OfficialMatch, result: MatchResult, lookups: OfficialMatchLookups): boolean {
    if (match.isScrim || !result) return false
    const tier = lookups.tournamentTier !== undefined
        ? lookups.tournamentTier
        : (match.tournamentId ? save.tournaments.find(t => t.id === match.tournamentId)?.tier : undefined)
    const importance = matchImportance(match.tournamentId, tier)
    if (importance === "FRIENDLY") return false
    const maps = (result.maps ?? []).filter(m => Array.isArray(m.rounds) && m.rounds.length > 0)
    if (!maps.length) return false

    const playerOf = lookups.player ?? ((id: string) => save.players.find(p => p.id === id))
    const teamOf = lookups.team ?? ((id: string) => save.teams.find(t => t.id === id))
    const home = match.homeTeamId, away = match.awayTeamId
    const lineup = (teamId: string): string[] => {
        const ids = result.lineups?.[teamId]
        if (Array.isArray(ids) && ids.length) return ids
        const roster = new Set(teamOf(teamId)?.rosterIds ?? [])
        return Object.keys(result.playerStats ?? {}).filter(id => roster.has(id))
    }
    const homeIds = lineup(home), awayIds = lineup(away)
    const sideOf = new Map<string, string>()
    for (const id of homeIds) sideOf.set(id, home)
    for (const id of awayIds) if (!sideOf.has(id)) sideOf.set(id, away)
    const ids = [...sideOf.keys()]
    const weight = new Map([home, away].map(id => [id, competitionWeight(importance, teamOf(id)?.leagueDivisionLevel)]))
    const season = seasonOfWeek(match.week)
    const book = ensureRecordBook(save)
    const open = openSeasonBook(book, season)
    const opponentOf = (teamId: string) => teamId === home ? away : home
    const players = new Map(ids.map(id => [id, playerOf(id)]))

    if (result.engineVersion === "script-v1") {
        for (const map of maps) {
            const rounds = map.rounds.length
            const tallies = tallyScriptMap(map, ids)
            for (const id of ids) {
                const p = players.get(id)
                const a = tallies.get(id)!
                const teamId = sideOf.get(id)!
                const { rating } = scriptLine(a, rounds)
                if (p) {
                    p.mapsPlayed = (p.mapsPlayed ?? 0) + 1
                    const before = Math.max(0, p.roundsPlayed || 0)
                    p.avgRating = round(((p.avgRating || 0) * before + rating * rounds) / (before + rounds), 4)
                    p.roundsPlayed = before + rounds
                    p.totalKills = (p.totalKills ?? 0) + a.kills
                    p.totalDeaths = (p.totalDeaths ?? 0) + a.deaths
                    p.totalAssists = (p.totalAssists ?? 0) + a.assists
                    p.totalDamage = (p.totalDamage ?? 0) + a.damage
                    p.debutSeason = p.debutSeason ?? season
                    addSeasonDelta(p, season, teamId, {
                        maps: 1, rounds, kills: a.kills, deaths: a.deaths, assists: a.assists, damage: a.damage,
                        ratingSum: rating * rounds, impact: (rating - 1) * rounds * (weight.get(teamId) ?? 0),
                    })
                    updatePersonalBest(p, "bestMapRating", rating, match.week, opponentOf(teamId), map.map)
                    updatePersonalBest(p, "mostMapKills", a.kills, match.week, opponentOf(teamId), map.map)
                }
                const entry = (value: number): RecordEntry => ({
                    value, teamId, opponentId: opponentOf(teamId), week: match.week, matchId: match.id,
                    playerId: id, playerName: p?.nickname || p?.name || id, map: map.map,
                })
                offerRecord(book, open, "bestMapRating", entry(rating))
                offerRecord(book, open, "mostMapKills", entry(a.kills))
            }
            const s = mapScore(map)
            if (s.home !== s.away) {
                const winner = s.home > s.away ? home : away
                const hi = Math.max(s.home, s.away), lo = Math.min(s.home, s.away)
                offerRecord(book, open, "biggestWin", {
                    value: hi - lo, teamId: winner, opponentId: opponentOf(winner), week: match.week, matchId: match.id, map: map.map, score: `${hi}-${lo}`,
                })
            }
        }
    } else {
        // legacy-v2: series totals only (no damage table to rate single maps).
        const rounds = maps.reduce((n, m) => n + m.rounds.length, 0)
        for (const id of ids) {
            const p = players.get(id)
            const st = result.playerStats?.[id]
            if (!p || !st) continue
            const teamId = sideOf.get(id)!
            const rating = Number.isFinite(st.rating) ? st.rating : 0
            const damage = (Number.isFinite(st.adr) ? st.adr : 0) * rounds
            p.mapsPlayed = (p.mapsPlayed ?? 0) + maps.length
            const before = Math.max(0, p.roundsPlayed || 0)
            p.avgRating = round(((p.avgRating || 0) * before + rating * rounds) / (before + rounds), 4)
            p.roundsPlayed = before + rounds
            p.totalKills = (p.totalKills ?? 0) + (st.kills || 0)
            p.totalDeaths = (p.totalDeaths ?? 0) + (st.deaths || 0)
            p.totalAssists = (p.totalAssists ?? 0) + (st.assists || 0)
            p.totalDamage = (p.totalDamage ?? 0) + damage
            p.debutSeason = p.debutSeason ?? season
            addSeasonDelta(p, season, teamId, {
                maps: maps.length, rounds, kills: st.kills || 0, deaths: st.deaths || 0, assists: st.assists || 0, damage,
                ratingSum: rating * rounds, impact: (rating - 1) * rounds * (weight.get(teamId) ?? 0),
            })
        }
    }

    // Match MVP.
    const mvp = result.mvpPlayerId && sideOf.has(result.mvpPlayerId) ? players.get(result.mvpPlayerId) : undefined
    if (mvp) addSeasonDelta(mvp, season, sideOf.get(mvp.id)!, { mvps: 1 })

    // Series: win streaks and the managed club's season.
    if (result.homeScore === result.awayScore) return true
    const winner = result.homeScore > result.awayScore ? home : away
    const loser = opponentOf(winner)
    const won = clubSet(book, winner)
    const run = won.streak
        ? { ...won.streak, count: won.streak.count + 1, lastOpponentId: loser, lastMatchId: match.id, lastWeek: match.week }
        : { count: 1, fromWeek: match.week, lastOpponentId: loser, lastMatchId: match.id, lastWeek: match.week }
    won.streak = run
    offerRecord(book, open, "longestWinStreak", { value: run.count, teamId: winner, opponentId: loser, week: match.week, matchId: match.id, fromWeek: run.fromWeek })
    const lost = clubSet(book, loser)
    if (lost.streak) {
        const ended = lost.streak
        for (const set of [lost as RecordSet, book.world, open.bests]) {
            const r = set.longestWinStreak
            if (r && r.teamId === loser && r.fromWeek === ended.fromWeek && !r.endedBy) set.longestWinStreak = { ...r, endedBy: winner }
        }
        lost.streak = undefined
    }

    const managed = save.playerTeamId
    if (managed === home || managed === away) {
        const user = open.user[managed] ?? (open.user[managed] = { teamId: managed, wins: 0, losses: 0 })
        const ownWon = winner === managed
        if (ownWon) user.wins++
        else user.losses++
        let own = 0, opp = 0
        for (const m of maps) { const s = mapScore(m); own += managed === home ? s.home : s.away; opp += managed === home ? s.away : s.home }
        const ownMaps = managed === home ? result.homeScore : result.awayScore
        const oppMaps = managed === home ? result.awayScore : result.homeScore
        const score = maps.length === 1 ? `${own}-${opp}` : `${ownMaps}-${oppMaps}`
        const entry: RecordEntry = { value: Math.abs(own - opp), teamId: managed, opponentId: opponentOf(managed), week: match.week, matchId: match.id, score, ...(maps.length === 1 ? { map: maps[0].map } : {}) }
        const key = ownWon ? "biggestWin" : "worstLoss"
        if (!(user[key] && user[key]!.value >= entry.value)) user[key] = entry
        recordManagedResult(save, ownWon, match.id)
    }
    return true
}

// ---------------------------------------------------------------- titles

export interface TitleInput {
    tournamentId: string
    name: string
    tier: string
    week: number
    /** Season the competition belongs to (defaults to the season of `week`). */
    season?: number
}

/**
 * A club won a title (tournament or top-division league split): every player
 * on its roster gets the trophy (and a Major when it is one), the season book
 * lists it, and the manager's stint counts it. Idempotent per (title, club).
 */
export function recordTitle(save: GameSave, team: Pick<TeamSaveData, "id" | "rosterIds">, title: TitleInput, playerOf?: (id: string) => PlayerSaveData | undefined): void {
    const season = title.season ?? seasonOfWeek(title.week)
    const major = isMajorTournament(title.tournamentId)
    const book = ensureRecordBook(save)
    const entry: SeasonTitle = { tournamentId: title.tournamentId, name: title.name, tier: title.tier, teamId: team.id, week: title.week, ...(major ? { major } : {}) }
    const closed = book.honours.find(h => h.season === season)
    const list = closed ? closed.titles : openSeasonBook(book, season).titles
    if (list.some(t => t.tournamentId === entry.tournamentId && t.teamId === entry.teamId)) return
    list.push(entry)
    if (closed?.userClub?.teamId === team.id) closed.userClub.trophies.push(entry)
    const find = playerOf ?? ((id: string) => save.players.find(p => p.id === id))
    for (const id of team.rosterIds) {
        const p = find(id)
        if (!p) continue
        p.careerTrophies = (p.careerTrophies ?? 0) + 1
        if (major) p.majorWins = (p.majorWins ?? 0) + 1
        addSeasonDelta(p, season, team.id, { trophies: 1, majors: major ? 1 : 0 })
    }
    if (team.id === save.playerTeamId) recordManagedTitle(save)
}

/** The managed club's world-rank tier band move at season end. */
export function recordTierMove(save: GameSave, season: number, teamId: string, from: string, to: string, rank: number): void {
    const open = openSeasonBook(ensureRecordBook(save), season)
    const user = open.user[teamId] ?? (open.user[teamId] = { teamId, wins: 0, losses: 0 })
    user.tierMove = { from, to, rank }
}
