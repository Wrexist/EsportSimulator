/**
 * Regional league (Phase 4.4): the regular fixture list every club plays.
 *
 * Each season has two splits. At a split's draw every club is placed in a
 * division of about ten clubs in its league region (Europe, CIS, Americas,
 * Asia-Pacific), ordered top to bottom. The first split of a career is
 * seeded from the world ranking; later splits carry the previous tables over
 * with promotion and relegation (LEAGUE_TUNING.PROMOTED / RELEGATED).
 *
 * Fixtures are a round robin (double, or single for divisions of busy
 * international clubs) with at most one round per week, on a weekday the
 * club has free. They are real scheduled matches: the week processor
 * simulates AI-vs-AI fixtures with the same match engine as every other
 * match, and the managed club plays its own from the match screen. Results
 * feed Elo and the world ranking the normal way; this module only reads the
 * completed matches back into the league table ("harvest"), so the table
 * does not depend on the capped completed-match log.
 *
 * Money: the division level sets the weekly central payment
 * (EconomyEngine via team.leagueDivisionLevel) and the split prize pool,
 * paid here when a division finishes.
 *
 * Deterministic: the draw and fixture seeds come from a hash of the save RNG state,
 * season and split, so the week RNG is untouched and a reload replays them.
 */

import type {
    CompletedMatchSaveData,
    GameSave,
    LeagueDivision,
    LeagueFixture,
    LeagueRegion,
    LeagueSplit,
    LeagueSplitSummary,
    LeagueStanding,
    LeagueState,
    TeamSaveData,
} from "../save-types"
import { LEAGUE_TUNING } from "@/lib/balance-tuning"
import { SeededRNG } from "../rng"

export const LEAGUE_ID_PREFIX = "league_"
const BYE = "__bye__"
const REGION_ORDER: LeagueRegion[] = ["EUROPE", "CIS", "AMERICAS", "ASIA_PACIFIC"]

export function isLeagueMatchId(id: string | null | undefined): boolean {
    return typeof id === "string" && id.startsWith(LEAGUE_ID_PREFIX)
}

export function leagueRegionOf(region?: string): LeagueRegion {
    return LEAGUE_TUNING.REGION_OF[(region || "").toUpperCase()] ?? LEAGUE_TUNING.DEFAULT_REGION
}

export const seasonOfWeek = (week: number): number => Math.floor((week - 1) / 52) + 1
export const weekOfSeason = (week: number): number => ((week - 1) % 52) + 1

function hashSeed(text: string): number {
    let h = 0x811c9dc5
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i)
        h = Math.imul(h, 0x01000193) >>> 0
    }
    return (h % 2147483646) + 1
}

export function ordinal(n: number): string {
    const s = ["th", "st", "nd", "rd"], v = n % 100
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

export function ensureLeagueState(save: Pick<GameSave, "league">): LeagueState {
    if (!save.league || save.league.version !== 1) save.league = { version: 1, history: [] }
    if (!Array.isArray(save.league.history)) save.league.history = []
    return save.league
}

export function splitId(season: number, split: 1 | 2): string {
    return `${LEAGUE_ID_PREFIX}s${season}_p${split}`
}

/** The division a club plays in this split. */
export function divisionOfTeam(save: Pick<GameSave, "league">, teamId: string): LeagueDivision | undefined {
    return save.league?.current?.divisions.find(d => d.teamIds.includes(teamId))
}

/** 1-based table position of a club in its division (undefined if not in the league). */
export function tablePosition(division: LeagueDivision | undefined, teamId: string): number | undefined {
    if (!division) return undefined
    const i = division.standings.findIndex(s => s.teamId === teamId)
    return i >= 0 ? i + 1 : undefined
}

export function playedInSplit(division: LeagueDivision | undefined, teamId: string): number {
    return division?.standings.find(s => s.teamId === teamId)?.played ?? 0
}

// ---------------------------------------------------------------- draw

/**
 * Draw the split whose draw window contains the current week, if it has not
 * been drawn yet. Idempotent. An unfinished previous split is closed first.
 */
export function drawDueLeagueSplit(save: GameSave): LeagueSplit | null {
    const week = save.currentWeek
    const season = seasonOfWeek(week), wos = weekOfSeason(week)
    for (const cfg of LEAGUE_TUNING.SPLITS) {
        // A late draw (old save, career started mid-split) still runs while
        // enough weeks remain for a meaningful single round robin.
        if (wos < cfg.drawWeek || wos > cfg.lastWeek - LEAGUE_TUNING.LATE_DRAW_MIN_WEEKS) continue
        const league = ensureLeagueState(save)
        const id = splitId(season, cfg.split)
        if (league.current?.id === id) return null
        if (league.current && !league.current.completed) closeSplit(save, league.current, save.playerTeamId, undefined, undefined, true)
        return drawSplit(save, season, cfg)
    }
    return null
}

/** Ordered divisions per region for the next split. */
function buildLadders(save: GameSave, previous: LeagueSplit | undefined): Map<LeagueRegion, string[][]> {
    const teamsById = new Map(save.teams.map(t => [t.id, t]))
    const rank = (id: string) => teamsById.get(id)?.worldRanking ?? 999
    const byRegion = new Map<LeagueRegion, TeamSaveData[]>()
    for (const t of save.teams) {
        const r = leagueRegionOf(t.region)
        const list = byRegion.get(r) ?? []
        list.push(t)
        byRegion.set(r, list)
    }
    const ladders = new Map<LeagueRegion, string[][]>()
    for (const region of REGION_ORDER) {
        const teams = byRegion.get(region) ?? []
        if (teams.length < 2) { if (teams.length) ladders.set(region, [teams.map(t => t.id)]); continue }
        const prevDivs = (previous?.divisions ?? []).filter(d => d.region === region).sort((a, b) => a.level - b.level)
        let ladder: string[][]
        if (prevDivs.length) {
            // Final tables, then promotion/relegation swaps between neighbours.
            ladder = prevDivs.map(d => (d.standings.length ? d.standings.map(s => s.teamId) : [...d.teamIds]))
            const moved = ladder.map(list => [...list])
            for (let i = 0; i < ladder.length - 1; i++) {
                const down = ladder[i].slice(-LEAGUE_TUNING.RELEGATED)
                const up = ladder[i + 1].slice(0, LEAGUE_TUNING.PROMOTED)
                moved[i] = moved[i].filter(id => !down.includes(id)).concat(up)
                moved[i + 1] = down.concat(moved[i + 1].filter(id => !up.includes(id)))
            }
            const alive = new Set(teams.map(t => t.id))
            ladder = moved.map(list => list.filter(id => alive.has(id)))
            const placed = new Set(ladder.flat())
            const newcomers = teams.filter(t => !placed.has(t.id)).sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id)).map(t => t.id)
            if (newcomers.length) ladder[ladder.length - 1].push(...newcomers)
            ladder = ladder.filter(list => list.length > 0)
            const target = LEAGUE_TUNING.DIVISION_TARGET_SIZE
            const unbalanced = ladder.some(list => list.length < Math.ceil(target * 0.6) || list.length > Math.floor(target * 1.4))
            if (unbalanced) ladder = chunk(ladder.flat(), divisionCount(teams.length))
        } else {
            const ordered = [...teams].sort((a, b) => rank(a.id) - rank(b.id) || (b.elo ?? 0) - (a.elo ?? 0) || a.id.localeCompare(b.id)).map(t => t.id)
            ladder = chunk(ordered, divisionCount(ordered.length))
        }
        ladders.set(region, ladder)
    }
    return ladders
}

function divisionCount(n: number): number {
    return Math.max(1, Math.round(n / LEAGUE_TUNING.DIVISION_TARGET_SIZE))
}

/** Split an ordered list into k nearly equal consecutive chunks (larger ones first). */
function chunk(ids: string[], k: number): string[][] {
    const out: string[][] = []
    const base = Math.floor(ids.length / k), extra = ids.length % k
    let at = 0
    for (let i = 0; i < k; i++) {
        const size = base + (i < extra ? 1 : 0)
        out.push(ids.slice(at, at + size))
        at += size
    }
    return out.filter(list => list.length > 0)
}

function median(values: number[]): number {
    const s = [...values].sort((a, b) => a - b)
    if (!s.length) return 999
    const m = Math.floor(s.length / 2)
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Round robin by the circle method; home/away alternate so each club hosts about half. */
function roundRobin(teamIds: string[], rng: SeededRNG, double: boolean): Array<Array<[string, string]>> {
    const teams = rng.shuffle([...teamIds])
    if (teams.length % 2) teams.push(BYE)
    const n = teams.length
    const rounds: Array<Array<[string, string]>> = []
    for (let r = 0; r < n - 1; r++) {
        const round: Array<[string, string]> = []
        for (let i = 0; i < n / 2; i++) {
            const a = teams[i], b = teams[n - 1 - i]
            if (a === BYE || b === BYE) continue
            round.push((r + i) % 2 === 0 ? [a, b] : [b, a])
        }
        rounds.push(round)
        teams.splice(1, 0, teams.pop()!)
    }
    if (!double) return rounds
    return [...rounds, ...rounds.map(round => round.map(([h, a]) => [a, h] as [string, string]))]
}

function drawSplit(save: GameSave, season: number, cfg: typeof LEAGUE_TUNING.SPLITS[number]): LeagueSplit {
    const league = ensureLeagueState(save)
    const previous = league.current
    const base = (season - 1) * 52
    const firstWeek = Math.max(base + cfg.firstWeek, save.currentWeek + 1)
    const lastWeek = Math.max(firstWeek, base + cfg.lastWeek)
    const rng = new SeededRNG(hashSeed(`${save.lastRngSeed ?? 1}|league|${season}|${cfg.split}`))
    const ladders = buildLadders(save, previous)
    const teamsById = new Map(save.teams.map(t => [t.id, t]))
    const id = splitId(season, cfg.split)

    // Days already taken by each club in the split window (events, friendlies).
    const busy = new Map<string, Set<number>>()
    const key = (teamId: string, week: number) => `${teamId}|${week}`
    const mark = (teamId: string, week: number, day: number) => {
        const k = key(teamId, week)
        const set = busy.get(k) ?? new Set<number>()
        set.add(day)
        busy.set(k, set)
    }
    for (const m of [...save.scheduledMatches, ...save.completedMatches]) {
        if (m.week < firstWeek || m.week > lastWeek || m.day === undefined) continue
        mark(m.homeTeamId, m.week, m.day)
        mark(m.awayTeamId, m.week, m.day)
    }
    const pickDay = (home: string, away: string, week: number, preferred: readonly number[]): number => {
        const free = (d: number) => !busy.get(key(home, week))?.has(d) && !busy.get(key(away, week))?.has(d)
        const day = preferred.find(free) ?? [0, 1, 2, 3, 4, 5, 6].find(free) ?? preferred[0]
        mark(home, week, day)
        mark(away, week, day)
        return day
    }

    const divisions: LeagueDivision[] = []
    const weeks = lastWeek - firstWeek + 1
    for (const region of REGION_ORDER) {
        const ladder = ladders.get(region)
        if (!ladder) continue
        ladder.forEach((teamIds, i) => {
            const level = i + 1
            const divId = `${id}_${region.toLowerCase()}_d${level}`
            // Late draws (fewer weeks than a double round robin needs) play a single one.
            const fitsDouble = weeks >= 2 * (teamIds.length - (teamIds.length % 2 ? 0 : 1))
            const light = median(teamIds.map(t => teamsById.get(t)?.worldRanking ?? 999)) <= LEAGUE_TUNING.LIGHT_SCHEDULE_MEDIAN_RANK
            const format: LeagueDivision["format"] = light || !fitsDouble ? "SINGLE" : "DOUBLE"
            const name = `${LEAGUE_TUNING.REGION_NAMES[region]} Division ${level}`
            const rounds = teamIds.length >= 2 ? roundRobin(teamIds, rng, format === "DOUBLE") : []
            const fixtures: LeagueFixture[] = []
            rounds.forEach((round, r) => {
                const week = firstWeek + Math.floor((r * weeks) / Math.max(1, rounds.length))
                round.forEach(([home, away], k) => fixtures.push({ id: `${divId}_r${r + 1}_${k}`, home, away, round: r + 1, week }))
            })
            divisions.push({
                id: divId, region, level, name, format, teamIds: [...teamIds], fixtures,
                standings: teamIds.map(teamId => ({ teamId, played: 0, wins: 0, losses: 0, points: 0, mapDiff: 0, roundDiff: 0 })),
            })
        })
    }

    const scheduled = new Set(save.scheduledMatches.map(m => m.id))
    for (const div of divisions) {
        const preferred = div.format === "SINGLE" ? LEAGUE_TUNING.DAYS_SINGLE : LEAGUE_TUNING.DAYS_DOUBLE
        for (const f of div.fixtures) {
            if (scheduled.has(f.id)) continue
            save.scheduledMatches.push({
                id: f.id,
                homeTeamId: f.home,
                awayTeamId: f.away,
                tournamentId: div.id,
                stage: `${div.name} · Round ${f.round}`,
                week: f.week,
                day: pickDay(f.home, f.away, f.week, preferred),
                format: LEAGUE_TUNING.MATCH_FORMAT,
                seed: rng.int(1, 2147483646),
            })
        }
    }

    const byTeam = new Map<string, LeagueDivision>()
    for (const d of divisions) for (const t of d.teamIds) byTeam.set(t, d)
    for (const team of save.teams) {
        const d = byTeam.get(team.id)
        team.leagueDivisionId = d?.id
        team.leagueDivisionLevel = d?.level
    }

    const split: LeagueSplit = { id, season, split: cfg.split, firstWeek, lastWeek, divisions }
    league.current = split

    const mine = byTeam.get(save.playerTeamId)
    if (mine) {
        const prevDiv = previous?.divisions.find(d => d.teamIds.includes(save.playerTeamId))
        const moved = prevDiv && prevDiv.region === mine.region && prevDiv.level !== mine.level
            ? (mine.level < prevDiv.level ? ` Promoted from Division ${prevDiv.level}.` : ` Relegated from Division ${prevDiv.level}.`)
            : ""
        const first = mine.fixtures.filter(f => f.home === save.playerTeamId || f.away === save.playerTeamId).sort((a, b) => a.week - b.week)[0]
        const opp = first ? teamsById.get(first.home === save.playerTeamId ? first.away : first.home)?.name : undefined
        const eventId = `league_draw_${id}_${save.playerTeamId}`
        if (!save.eventsLog.some(e => e.id === eventId)) {
            save.eventsLog.unshift({
                id: eventId, type: "TOURNAMENT", week: save.currentWeek, acknowledged: false,
                data: {
                    title: `League draw: ${mine.name}`,
                    message: `Season ${season}, split ${cfg.split}: ${mine.teamIds.length} clubs, ${mine.format === "DOUBLE" ? "home and away" : "single round robin"}, weeks ${firstWeek}-${lastWeek}.${moved}${first && opp ? ` First fixture: ${opp} in week ${first.week}.` : ""} Top ${LEAGUE_TUNING.PROMOTED} go up, bottom ${LEAGUE_TUNING.RELEGATED} go down.`,
                    severity: "info",
                    teamId: save.playerTeamId,
                    tournamentId: mine.id,
                },
            })
        }
    }
    return split
}

// ---------------------------------------------------------------- results

function resultOf(cm: CompletedMatchSaveData, fixture: LeagueFixture): LeagueFixture["result"] {
    const r = cm.result
    const swapped = cm.homeTeamId !== fixture.home
    const maps = r?.maps ?? []
    let homeRounds = 0, awayRounds = 0
    for (const m of maps) { homeRounds += m.homeScore || 0; awayRounds += m.awayScore || 0 }
    const homeMaps = r?.homeScore ?? 0, awayMaps = r?.awayScore ?? 0
    const winnerId = r?.winnerId || (homeMaps === awayMaps ? (homeRounds >= awayRounds ? cm.homeTeamId : cm.awayTeamId) : homeMaps > awayMaps ? cm.homeTeamId : cm.awayTeamId)
    return swapped
        ? { winnerId, homeMaps: awayMaps, awayMaps: homeMaps, homeRounds: awayRounds, awayRounds: homeRounds, ...(maps.length ? {} : { forfeit: true }) }
        : { winnerId, homeMaps, awayMaps, homeRounds, awayRounds, ...(maps.length ? {} : { forfeit: true }) }
}

/** Table: 3 points a win; ties broken by head-to-head, map and round difference, then draw order. */
export function computeStandings(div: Pick<LeagueDivision, "teamIds" | "fixtures">): LeagueStanding[] {
    const rows = new Map<string, LeagueStanding>(div.teamIds.map(teamId => [teamId, { teamId, played: 0, wins: 0, losses: 0, points: 0, mapDiff: 0, roundDiff: 0 }]))
    for (const f of div.fixtures) {
        if (!f.result) continue
        const h = rows.get(f.home), a = rows.get(f.away)
        if (!h || !a) continue
        h.played++; a.played++
        const homeWon = f.result.winnerId === f.home
        if (homeWon) { h.wins++; a.losses++; h.points += 3 } else { a.wins++; h.losses++; a.points += 3 }
        h.mapDiff += f.result.homeMaps - f.result.awayMaps
        a.mapDiff += f.result.awayMaps - f.result.homeMaps
        h.roundDiff += f.result.homeRounds - f.result.awayRounds
        a.roundDiff += f.result.awayRounds - f.result.homeRounds
    }
    const list = [...rows.values()]
    const h2h = new Map<string, number>()
    for (const row of list) {
        const tied = new Set(list.filter(o => o.points === row.points).map(o => o.teamId))
        if (tied.size < 2) continue
        h2h.set(row.teamId, div.fixtures.filter(f => f.result && tied.has(f.home) && tied.has(f.away) && f.result.winnerId === row.teamId).length)
    }
    const order = new Map(div.teamIds.map((id, i) => [id, i]))
    return list.sort((a, b) => b.points - a.points
        || (h2h.get(b.teamId) ?? 0) - (h2h.get(a.teamId) ?? 0)
        || b.mapDiff - a.mapDiff
        || b.roundDiff - a.roundDiff
        || (order.get(a.teamId) ?? 0) - (order.get(b.teamId) ?? 0))
}

export interface LeagueWeekResult {
    /** Fixtures whose result was read into a table this week. */
    harvested: number
    /** Divisions that finished this week. */
    finishedDivisions: string[]
    splitFinished: boolean
}

/**
 * Weekly league step (after matches): read completed league matches into the
 * tables, close finished divisions (prizes, titles, promotion/relegation
 * flags) and archive a finished split.
 */
export function processLeagueWeek(save: GameSave, playerTeamId: string, ledgerIdSet?: Set<string>, eventIdSet?: Set<string>): LeagueWeekResult {
    const out: LeagueWeekResult = { harvested: 0, finishedDivisions: [], splitFinished: false }
    const split = save.league?.current
    if (!split || split.completed) return out
    const open = new Map<string, { div: LeagueDivision; fixture: LeagueFixture }>()
    for (const div of split.divisions) if (!div.completed) for (const f of div.fixtures) if (!f.result) open.set(f.id, { div, fixture: f })
    const touched = new Set<LeagueDivision>()
    if (open.size) {
        for (const cm of save.completedMatches) {
            const ref = open.get(cm.id)
            if (!ref) continue
            ref.fixture.result = resultOf(cm, ref.fixture)
            open.delete(cm.id)
            touched.add(ref.div)
            out.harvested++
        }
    }
    for (const div of touched) div.standings = computeStandings(div)
    const overdue = save.currentWeek > split.lastWeek + 1
    for (const div of split.divisions) {
        if (div.completed) continue
        if (overdue || div.fixtures.every(f => f.result)) {
            completeDivision(save, split, div, playerTeamId, ledgerIdSet, eventIdSet)
            out.finishedDivisions.push(div.id)
        }
    }
    if (split.divisions.every(d => d.completed)) {
        archiveSplit(save, split)
        out.splitFinished = true
    }
    return out
}

/** Force-close every open division of a split (a new draw is due). */
function closeSplit(save: GameSave, split: LeagueSplit, playerTeamId: string, ledgerIdSet?: Set<string>, eventIdSet?: Set<string>, drop = false): void {
    for (const div of split.divisions) {
        if (div.completed) continue
        div.standings = computeStandings(div)
        completeDivision(save, split, div, playerTeamId, ledgerIdSet, eventIdSet)
    }
    if (drop) {
        const ids = new Set(split.divisions.flatMap(d => d.fixtures.filter(f => !f.result).map(f => f.id)))
        if (ids.size) save.scheduledMatches = save.scheduledMatches.filter(m => !ids.has(m.id))
    }
    archiveSplit(save, split)
}

function completeDivision(save: GameSave, split: LeagueSplit, div: LeagueDivision, playerTeamId: string, ledgerIdSet?: Set<string>, eventIdSet?: Set<string>): void {
    div.completed = true
    const table = div.standings
    const played = table.some(s => s.played > 0)
    const regionLevels = split.divisions.filter(d => d.region === div.region).map(d => d.level)
    const bottom = Math.max(...regionLevels)
    div.promoted = div.level > 1 ? table.slice(0, LEAGUE_TUNING.PROMOTED).map(s => s.teamId) : []
    div.relegated = div.level < bottom ? table.slice(-LEAGUE_TUNING.RELEGATED).map(s => s.teamId) : []
    if (!played) return
    div.championId = table[0]?.teamId

    const teamsById = new Map(save.teams.map(t => [t.id, t]))
    const pools = LEAGUE_TUNING.SPLIT_PRIZE_POOL_BY_LEVEL
    const pool = pools[Math.min(pools.length, div.level) - 1]
    const ledgerIds = ledgerIdSet ?? new Set(save.financeLedger.map(e => e.id))
    table.forEach((row, i) => {
        const share = LEAGUE_TUNING.SPLIT_PRIZE_SHARES[i]
        const team = teamsById.get(row.teamId)
        if (!share || !team) return
        const amount = Math.round(pool * share)
        const id = `league_prize_${div.id}_${row.teamId}`
        if (amount <= 0 || ledgerIds.has(id)) return
        team.budget += amount
        save.financeLedger.push({
            id, week: save.currentWeek, teamId: team.id, type: "INCOME", category: "PRIZE", amount,
            description: `${div.name} split ${split.split} prize: ${ordinal(i + 1)} place`, balance: team.budget,
        })
        ledgerIds.add(id)
    })

    const champion = div.championId ? teamsById.get(div.championId) : undefined
    if (champion) {
        champion.reputation = Math.min(100, (champion.reputation || 0) + (div.level === 1 ? LEAGUE_TUNING.CHAMPION_REPUTATION_TOP : LEAGUE_TUNING.CHAMPION_REPUTATION))
        if (div.level === 1) {
            champion.trophies ??= []
            if (!champion.trophies.some(t => t.tournamentId === div.id)) {
                champion.trophies.push({ tournamentId: div.id, tournamentName: `${div.name} S${split.season} Split ${split.split}`, week: save.currentWeek, tier: "B_TIER" })
            }
        }
    }

    const pos = table.findIndex(s => s.teamId === playerTeamId)
    if (pos < 0) return
    const me = table[pos]
    const fate = div.promoted?.includes(playerTeamId) ? ` Promoted to Division ${div.level - 1} for the next split.`
        : div.relegated?.includes(playerTeamId) ? ` Relegated to Division ${div.level + 1} for the next split.` : ""
    const prize = (() => {
        const share = LEAGUE_TUNING.SPLIT_PRIZE_SHARES[pos]
        return share ? ` Prize money: $${Math.round(pool * share).toLocaleString("en-US")}.` : ""
    })()
    const eventId = `league_final_${div.id}_${playerTeamId}`
    if (!(eventIdSet?.has(eventId) ?? save.eventsLog.some(e => e.id === eventId))) {
        save.eventsLog.unshift({
            id: eventId, type: "TOURNAMENT", week: save.currentWeek, acknowledged: false,
            data: {
                title: pos === 0 ? `${div.name} champions!` : `${div.name}: finished ${ordinal(pos + 1)}`,
                message: `Split ${split.split} is over: ${me.wins}W-${me.losses}L, ${me.points} points, ${ordinal(pos + 1)} of ${table.length}.${prize}${fate}`,
                severity: pos === 0 || fate.startsWith(" Promoted") ? "success" : fate ? "warning" : "info",
                teamId: playerTeamId,
                tournamentId: div.id,
            },
        })
        eventIdSet?.add(eventId)
    }
    save.newsFeed.unshift({
        id: `news_league_${div.id}_${playerTeamId}`,
        title: pos === 0 ? `${teamsById.get(playerTeamId)?.name ?? "Your club"} win ${div.name}` : `${div.name} split ${split.split} final table`,
        content: `${teamsById.get(playerTeamId)?.name ?? "Your club"} finished ${ordinal(pos + 1)} of ${table.length} (${me.wins}W-${me.losses}L).${fate}`,
        week: save.currentWeek,
        category: "TOURNAMENT",
        teamId: playerTeamId,
    })
}

function archiveSplit(save: GameSave, split: LeagueSplit): void {
    if (split.completed) return
    split.completed = true
    const league = ensureLeagueState(save)
    const summary: LeagueSplitSummary = {
        id: split.id, season: split.season, split: split.split,
        divisions: split.divisions.map(d => ({
            id: d.id, name: d.name, region: d.region, level: d.level,
            table: d.standings.map(s => [s.teamId, s.points, s.wins, s.losses] as [string, number, number, number]),
            championId: d.championId, promoted: d.promoted, relegated: d.relegated,
        })),
    }
    league.history = [...league.history.filter(h => h.id !== split.id), summary].slice(-LEAGUE_TUNING.HISTORY_SPLITS)
}

/**
 * AI-vs-AI league match records are dropped from the completed-match log
 * after LEAGUE_TUNING.AI_MATCH_RECORD_WEEKS: the table keeps their results,
 * and keeping ~100 a week would evict the managed club's own season history
 * and tournament matches from the capped log.
 */
export function compactLeagueMatches(save: Pick<GameSave, "completedMatches" | "currentWeek" | "playerTeamId">): void {
    const cutoff = save.currentWeek - LEAGUE_TUNING.AI_MATCH_RECORD_WEEKS
    if (!save.completedMatches.some(m => m.week < cutoff && isLeagueMatchId(m.tournamentId) && m.homeTeamId !== save.playerTeamId && m.awayTeamId !== save.playerTeamId)) return
    save.completedMatches = save.completedMatches.filter(m => !(m.week < cutoff && isLeagueMatchId(m.tournamentId)
        && m.homeTeamId !== save.playerTeamId && m.awayTeamId !== save.playerTeamId))
}

/** Next unplayed league fixture of a club (for briefing cards). */
export function nextLeagueFixture(save: Pick<GameSave, "league">, teamId: string): { division: LeagueDivision; fixture: LeagueFixture } | undefined {
    const division = divisionOfTeam(save, teamId)
    if (!division) return undefined
    const fixture = division.fixtures.filter(f => !f.result && (f.home === teamId || f.away === teamId)).sort((a, b) => a.week - b.week || a.round - b.round)[0]
    return fixture ? { division, fixture } : undefined
}
