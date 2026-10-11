/**
 * Season honours (Phase 5.1): at the first week of a new season the old one
 * is closed. Every player's open tally becomes a season line, and the awards
 * are decided from those real numbers:
 *
 *   Season score = 1 + sum((map rating - 1) x rounds x competition weight) / rounds
 *   — a player's rating, with each map counting at its competition's weight
 *   (official-stats.ts competitionWeight: Major/S-tier 1.0 ... league 0.4,
 *   less in lower divisions) and the rest of its weight at an average 1.00.
 *   Ranked: players with at least `minMaps` official maps
 *   (RECORDS_TUNING.AWARD_MIN_MAPS, or half the busiest player's maps when
 *   the season was shorter). Ties: rating, then rounds, then id.
 *
 *   Season MVP: the top score. Top 20: the first twenty.
 *   Team of the season: the best AWPer, the best IGL, then the best three
 *   others with at most two of one role (caps relax only if the pool runs out).
 *   Rookie of the year: the best ranked player aged 20 or younger during the
 *   season, or in his first season of official maps (from season 2: in season
 *   1 every player's record starts, so only the age rule applies).
 *
 * The closed season also keeps its records (season bests and all-time marks
 * that fell), its titles, the managed club's review and the manager's
 * season. Stored compactly in GameSave.recordBook.honours; read through
 * engine/season-review.ts. Deterministic: no RNG.
 */

import type { GameSave, PlayerSaveData } from "./save-types"
import type {
    AwardWinner, ManagerSeasonSummary, OpenSeasonBook, PlayerHonour, SeasonHonours, UserClubReview,
} from "./records-types"
import { RECORDS_TUNING } from "@/lib/balance-tuning"
import { closeTally, ensureRecordBook, lineOfTally, seasonOfWeek, WEEKS_PER_SEASON } from "./official-stats"
import { reputationChangesIn } from "./manager-timeline"

/** One player's official numbers for a season, summed over clubs. */
export interface SeasonRow {
    player: PlayerSaveData
    maps: number
    rounds: number
    kills: number
    deaths: number
    damage: number
    ratingSum: number
    impact: number
    trophies: number
    majors: number
    mvps: number
    /** Club with the most rounds that season. */
    clubId: string
    /** Rounds per club. */
    clubs: Map<string, number>
}

const round = (value: number, dp: number) => { const f = 10 ** dp; return Math.round(value * f) / f }

export const rowRating = (r: Pick<SeasonRow, "ratingSum" | "rounds">) => r.rounds ? r.ratingSum / r.rounds : 0
export const rowScore = (r: Pick<SeasonRow, "impact" | "rounds">) => r.rounds ? 1 + r.impact / r.rounds : 0

/**
 * Season rows for every player with official maps or titles in `season`:
 * closed lines plus the open tally (read only). `clubId` limits to one club.
 */
export function seasonRows(save: Pick<GameSave, "players">, season: number, clubId?: string): SeasonRow[] {
    const rows: SeasonRow[] = []
    for (const player of save.players) {
        const parts = (player.seasonLines ?? []).filter(l => l.season === season && (!clubId || l.clubId === clubId))
            .map(l => ({ clubId: l.clubId, maps: l.maps, rounds: l.rounds, kills: l.kills, deaths: l.deaths, damage: l.adr * l.rounds, ratingSum: l.rating * l.rounds, impact: l.impact, trophies: l.trophies ?? 0, majors: l.majors ?? 0, mvps: l.mvps ?? 0 }))
        const t = player.seasonTally
        if (t && t.season === season && (!clubId || t.clubId === clubId)) parts.push({ ...t })
        if (!parts.length) continue
        const row: SeasonRow = { player, maps: 0, rounds: 0, kills: 0, deaths: 0, damage: 0, ratingSum: 0, impact: 0, trophies: 0, majors: 0, mvps: 0, clubId: parts[0].clubId, clubs: new Map() }
        for (const part of parts) {
            row.maps += part.maps; row.rounds += part.rounds; row.kills += part.kills; row.deaths += part.deaths
            row.damage += part.damage; row.ratingSum += part.ratingSum; row.impact += part.impact
            row.trophies += part.trophies; row.majors += part.majors; row.mvps += part.mvps
            row.clubs.set(part.clubId, (row.clubs.get(part.clubId) ?? 0) + part.rounds)
        }
        let best = -1
        for (const [club, n] of row.clubs) if (n > best) { best = n; row.clubId = club }
        rows.push(row)
    }
    return rows
}

/** Minimum official maps to be ranked in a season. */
export function minMapsFor(rows: Pick<SeasonRow, "maps">[]): number {
    const busiest = rows.reduce((m, r) => Math.max(m, r.maps), 0)
    return Math.max(1, Math.min(RECORDS_TUNING.AWARD_MIN_MAPS, Math.ceil(busiest / 2)))
}

/** Rows with at least `minMaps` maps, best first. */
export function rankRows(rows: SeasonRow[], minMaps: number): SeasonRow[] {
    return rows.filter(r => r.maps >= minMaps).sort((a, b) =>
        rowScore(b) - rowScore(a) || rowRating(b) - rowRating(a) || b.rounds - a.rounds || a.player.id.localeCompare(b.player.id))
}

/**
 * Age the player had during `season`. Ages advance at each season end
 * (week 52·s) for players not retired by then (retirement runs first).
 */
export function ageInSeason(p: Pick<PlayerSaveData, "age" | "isRetired" | "retirementWeek">, season: number, currentWeek: number): number {
    let increments = 0
    for (let s = season; s * WEEKS_PER_SEASON <= currentWeek; s++) {
        const end = s * WEEKS_PER_SEASON
        if (p.isRetired && (p.retirementWeek ?? 0) <= end) break
        increments++
    }
    return Math.max(0, (p.age || 0) - increments)
}

export function awardWinner(r: SeasonRow, season: number, currentWeek: number, rank?: number): AwardWinner {
    const p = r.player
    return {
        playerId: p.id, name: p.nickname || p.name, teamId: r.clubId, role: p.role, age: ageInSeason(p, season, currentWeek),
        maps: r.maps, rounds: r.rounds, rating: round(rowRating(r), 2), score: round(rowScore(r), 3),
        kills: r.kills, deaths: r.deaths, adr: r.rounds ? round(r.damage / r.rounds, 1) : 0,
        trophies: r.trophies, majors: r.majors, mvps: r.mvps,
        ...(rank ? { rank } : {}),
    }
}

/** Best AWPer, best IGL, then the best three others (at most two of one role). */
export function pickTeamOfSeason(ranked: SeasonRow[]): SeasonRow[] {
    const team: SeasonRow[] = []
    const roleOf = (r: SeasonRow) => (r.player.role || "RIFLER").toUpperCase()
    const count = (role: string) => team.filter(t => roleOf(t) === role).length
    const take = (ok: (r: SeasonRow) => boolean) => {
        const r = ranked.find(x => !team.includes(x) && ok(x))
        if (r) team.push(r)
        return !!r
    }
    take(r => roleOf(r) === "AWPER")
    take(r => roleOf(r) === "IGL")
    const limit = (role: string) => role === "AWPER" || role === "IGL" ? 1 : 2
    while (team.length < 5 && take(r => count(roleOf(r)) < limit(roleOf(r)))) { /* fill with caps */ }
    while (team.length < 5 && take(() => true)) { /* pool too small: relax */ }
    return team
}

export function isRookie(p: PlayerSaveData, season: number, currentWeek: number): boolean {
    if (ageInSeason(p, season, currentWeek) <= 20) return true
    return season > 1 && p.debutSeason === season
}

export interface SeasonAwards {
    minMaps: number
    ranked: SeasonRow[]
    mvp?: SeasonRow
    top20: SeasonRow[]
    teamOfSeason: SeasonRow[]
    rookie?: SeasonRow
}

/** The season's awards from its rows (pure). */
export function decideAwards(rows: SeasonRow[], season: number, currentWeek: number): SeasonAwards {
    const minMaps = minMapsFor(rows)
    const ranked = rankRows(rows, minMaps)
    return {
        minMaps, ranked,
        mvp: ranked[0],
        top20: ranked.slice(0, 20),
        teamOfSeason: pickTeamOfSeason(ranked),
        rookie: ranked.find(r => isRookie(r.player, season, currentWeek)),
    }
}

/** The managed club's best player of the season (most maps with at least 30% of the club's busiest). */
export function clubBestPlayer(save: Pick<GameSave, "players">, season: number, clubId: string): SeasonRow | undefined {
    const rows = seasonRows(save, season, clubId).filter(r => r.maps > 0)
    const busiest = rows.reduce((m, r) => Math.max(m, r.maps), 0)
    return rankRows(rows, Math.max(1, Math.ceil(busiest * 0.3)))[0]
}

function finalLeaguePosition(save: Pick<GameSave, "league">, season: number, teamId: string): UserClubReview["finalLeaguePosition"] {
    const splits = (save.league?.history ?? []).filter(h => h.season === season).sort((a, b) => b.split - a.split)
    for (const split of splits) {
        for (const div of split.divisions) {
            const i = div.table.findIndex(row => row[0] === teamId)
            if (i >= 0) return { position: i + 1, of: div.table.length, division: div.name, level: div.level, split: split.split }
        }
    }
    return undefined
}

/** The managed club's season review (from the open season book). */
export function buildUserClubReview(save: GameSave, open: OpenSeasonBook | undefined, season: number, teamId: string): UserClubReview {
    const user = open?.user[teamId]
    const move = user?.tierMove
    const order = ["S_TIER", "A_TIER", "B_TIER", "C_TIER"]
    const tierMove: UserClubReview["tierMove"] = !move || move.from === move.to ? "none"
        : order.indexOf(move.to) < order.indexOf(move.from) ? "promoted" : "relegated"
    const best = clubBestPlayer(save, season, teamId)
    return {
        teamId,
        finalLeaguePosition: finalLeaguePosition(save, season, teamId),
        tierMove,
        ...(move ? { tierFrom: move.from, tierTo: move.to } : {}),
        trophies: (open?.titles ?? []).filter(t => t.teamId === teamId),
        ...(best ? { bestPlayer: awardWinner(best, season, save.currentWeek) } : {}),
        ...(user?.biggestWin ? { biggestWin: user.biggestWin } : {}),
        ...(user?.worstLoss ? { worstLoss: user.worstLoss } : {}),
        record: { wins: user?.wins ?? 0, losses: user?.losses ?? 0 },
    }
}

/** The manager's season: clubs managed (official results and titles), reputation. */
export function buildManagerSummary(save: GameSave, open: OpenSeasonBook | undefined, season: number): ManagerSeasonSummary {
    const md = save.managerDetails
    const changes = reputationChangesIn(save, season)
    const later = (md?.reputationLog ?? []).filter(c => seasonOfWeek(c.week) > season).reduce((s, c) => s + c.delta, 0)
    const reputationEnd = (md?.reputation ?? 0) - later
    const reputationStart = reputationEnd - changes.reduce((s, c) => s + c.delta, 0)
    const stintEnds = new Map((md?.stints ?? []).filter(s => s.ended && s.toWeek && seasonOfWeek(s.toWeek) === season).map(s => [s.teamId, s.ended!]))
    return {
        stints: Object.values(open?.user ?? {}).map(u => ({
            teamId: u.teamId, matches: u.wins + u.losses, wins: u.wins, losses: u.losses,
            trophies: (open?.titles ?? []).filter(t => t.teamId === u.teamId).length,
            ...(stintEnds.has(u.teamId) ? { ended: stintEnds.get(u.teamId) } : {}),
        })),
        reputationStart, reputationEnd, reputationChanges: changes, level: md?.level ?? 1,
    }
}

function giveHonour(p: PlayerSaveData, honour: PlayerHonour): void {
    const list = p.honours ?? (p.honours = [])
    if (!list.some(h => h.season === honour.season && h.award === honour.award)) list.push(honour)
}

/**
 * Close `season`: open tallies become season lines, awards are decided and
 * stored, players receive their honours, and the season book is archived.
 * Idempotent: returns null when the season is already closed.
 */
export function closeSeason(save: GameSave, season: number): SeasonHonours | null {
    const book = ensureRecordBook(save)
    if (season < 1 || book.honours.some(h => h.season === season)) return null
    for (const p of save.players) if (p.seasonTally && p.seasonTally.season <= season) closeTally(p)
    const rows = seasonRows(save, season)
    const awards = decideAwards(rows, season, save.currentWeek)
    const open = book.open.find(b => b.season === season)
    const managed = save.playerTeamId
    const userTeam = open && !open.user[managed] ? Object.keys(open.user).pop() ?? managed : managed
    const win = (r: SeasonRow, rank?: number) => awardWinner(r, season, save.currentWeek, rank)
    const honours: SeasonHonours = {
        season,
        week: save.currentWeek,
        minMaps: awards.minMaps,
        ranked: awards.ranked.length,
        ...(awards.mvp ? { mvp: win(awards.mvp) } : {}),
        teamOfSeason: awards.teamOfSeason.map(r => win(r)),
        ...(awards.rookie ? { rookie: win(awards.rookie) } : {}),
        top20: awards.top20.map((r, i) => win(r, i + 1)),
        records: { ...(open?.bests ?? {}) },
        brokenRecords: [...(open?.broken ?? [])],
        titles: [...(open?.titles ?? [])],
        userClub: buildUserClubReview(save, open, season, userTeam),
        manager: buildManagerSummary(save, open, season),
    }
    if (awards.mvp) giveHonour(awards.mvp.player, { season, award: "MVP" })
    for (const r of awards.teamOfSeason) giveHonour(r.player, { season, award: "TEAM_OF_SEASON" })
    if (awards.rookie) giveHonour(awards.rookie.player, { season, award: "ROOKIE" })
    awards.top20.forEach((r, i) => giveHonour(r.player, { season, award: "TOP20", rank: i + 1 }))
    book.honours.push(honours)
    book.honours.sort((a, b) => a.season - b.season)
    if (book.honours.length > RECORDS_TUNING.HONOURS_CAP) book.honours.splice(0, book.honours.length - RECORDS_TUNING.HONOURS_CAP)
    book.open = book.open.filter(b => b.season > season)
    return honours
}

/** Provisional awards for a season still in progress (read only). */
export function provisionalAwards(save: GameSave, season: number): SeasonAwards {
    return decideAwards(seasonRows(save, season), season, save.currentWeek)
}

/** A season line for an open tally (for screens showing the season so far). */
export { lineOfTally }
