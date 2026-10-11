/**
 * Read-only view helpers for the regional league (Phase 4.7): table rows
 * with promotion/relegation zones and form, split progress, the previous
 * split's outcome, and the label every screen uses for a league fixture.
 * Pure functions over the save's league state; nothing here mutates it.
 */

import type {
    LeagueDivision,
    LeagueFixture,
    LeagueRegion,
    LeagueSplit,
    LeagueSplitSummary,
    LeagueState,
} from "@/engine/save-types"
import { isLeagueMatchId, ordinal, weekOfSeason } from "@/engine/season/regional-league"
import { LEAGUE_TUNING } from "@/lib/balance-tuning"

export const LEAGUE_REGIONS: LeagueRegion[] = ["EUROPE", "CIS", "AMERICAS", "ASIA_PACIFIC"]

export function regionName(region: LeagueRegion): string {
    return LEAGUE_TUNING.REGION_NAMES[region] ?? region
}

// ---------------------------------------------------------------- labels

interface FixtureLike {
    id?: string | null
    tournamentId?: string | null
    stage?: string | null
}

/** True for a regional league fixture (scheduled or completed). */
export function isLeagueFixture(m: FixtureLike | null | undefined): boolean {
    return !!m && (isLeagueMatchId(m.tournamentId) || isLeagueMatchId(m.id))
}

/**
 * The competition label of a league fixture: its stage text, e.g.
 * "Europe Division 3 · Round 5". Null for anything that is not a league
 * fixture, so callers fall back to their tournament/scrim naming.
 */
export function leagueStageLabel(m: FixtureLike | null | undefined): string | null {
    if (!isLeagueFixture(m)) return null
    return m?.stage?.trim() || "Regional league"
}

/** "Europe Division 3 · Round 5" → "Europe Division 3" (the division part of the stage). */
export function leagueDivisionLabel(m: FixtureLike | null | undefined): string | null {
    const stage = leagueStageLabel(m)
    return stage ? stage.split(" · ")[0] : null
}

// ---------------------------------------------------------------- table

export type LeagueZone = "promotion" | "relegation" | null

/** Deepest division level of a region in this split (no relegation from it). */
export function bottomLevelOf(split: Pick<LeagueSplit, "divisions"> | undefined, region: LeagueRegion): number {
    const levels = (split?.divisions ?? []).filter(d => d.region === region).map(d => d.level)
    return levels.length ? Math.max(...levels) : 1
}

/**
 * Promotion/relegation zone of a table position, with the engine's rules:
 * the top PROMOTED go up unless this is division 1, the bottom RELEGATED go
 * down unless this is the region's lowest division.
 */
export function zoneFor(position: number, size: number, level: number, bottomLevel: number): LeagueZone {
    if (position < 1 || position > size) return null
    if (level > 1 && position <= LEAGUE_TUNING.PROMOTED) return "promotion"
    if (level < bottomLevel && position > size - LEAGUE_TUNING.RELEGATED) return "relegation"
    return null
}

/** One line per zone rule of a division, e.g. "Top 2 promoted to Division 2". */
export function zoneRules(level: number, bottomLevel: number): string[] {
    const rules: string[] = []
    if (level > 1) rules.push(`Top ${LEAGUE_TUNING.PROMOTED} promoted to Division ${level - 1}`)
    else rules.push("Winner takes the title")
    if (level < bottomLevel) rules.push(`Bottom ${LEAGUE_TUNING.RELEGATED} relegated to Division ${level + 1}`)
    return rules
}

export type FormLetter = "W" | "L"

function involves(f: LeagueFixture, teamId: string): boolean {
    return f.home === teamId || f.away === teamId
}

/** Last `n` league results of a club in a division, oldest first. */
export function teamForm(division: Pick<LeagueDivision, "fixtures">, teamId: string, n = 5): FormLetter[] {
    return division.fixtures
        .filter(f => f.result && involves(f, teamId))
        .sort((a, b) => a.round - b.round)
        .slice(-n)
        .map(f => (f.result!.winnerId === teamId ? "W" : "L"))
}

export interface LeagueTableRow {
    position: number
    teamId: string
    played: number
    wins: number
    losses: number
    points: number
    mapDiff: number
    roundDiff: number
    form: FormLetter[]
    zone: LeagueZone
    isPlayer: boolean
}

/** The division table as display rows (standings order, zones, form). */
export function leagueTableRows(division: LeagueDivision, bottomLevel: number, playerTeamId?: string | null): LeagueTableRow[] {
    const size = division.standings.length
    return division.standings.map((s, i) => ({
        position: i + 1,
        teamId: s.teamId,
        played: s.played,
        wins: s.wins,
        losses: s.losses,
        points: s.points,
        mapDiff: s.mapDiff,
        roundDiff: s.roundDiff,
        form: teamForm(division, s.teamId),
        zone: zoneFor(i + 1, size, division.level, bottomLevel),
        isPlayer: !!playerTeamId && s.teamId === playerTeamId,
    }))
}

export interface TableSituation {
    text: string
    tone: "positive" | "neutral" | "caution" | "negative"
}

/** One line on where a club stands against the zones (rows carry them), in points. */
export function tableSituation(rows: LeagueTableRow[], teamId: string, level: number): TableSituation | null {
    const me = rows.find(r => r.teamId === teamId)
    if (!me) return null
    if (rows.every(r => r.played === 0)) return { text: "No rounds played yet", tone: "neutral" }
    const pts = (n: number) => `${n} pt${n === 1 ? "" : "s"}`
    const size = rows.length
    if (me.zone === "promotion") return { text: "In the promotion places", tone: "positive" }
    if (me.zone === "relegation") {
        const safe = rows[size - LEAGUE_TUNING.RELEGATED - 1]
        const gap = safe ? safe.points - me.points : 0
        return { text: gap > 0 ? `In the relegation places · ${pts(gap)} from safety` : "In the relegation places · level on points with safety", tone: "negative" }
    }
    if (level === 1) {
        if (me.position === 1) return { text: "Top of the table", tone: "positive" }
        const gap = rows[0].points - me.points
        return { text: gap > 0 ? `${pts(gap)} behind the leader` : "Level on points with the leader", tone: "neutral" }
    }
    const last = rows[LEAGUE_TUNING.PROMOTED - 1]
    const gap = last ? last.points - me.points : 0
    return { text: gap > 0 ? `${pts(gap)} off the promotion places` : "Level on points with the promotion places", tone: "neutral" }
}

/** Map difference only says something beyond W–L when series are longer than one map. */
export function showsMapDiff(division: Pick<LeagueDivision, "standings">): boolean {
    return division.standings.some(s => s.mapDiff !== s.wins - s.losses)
}

export function signed(n: number): string {
    return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0"
}

// ---------------------------------------------------------------- progress

export interface RoundProgress {
    /** Rounds whose every fixture has a result. */
    played: number
    total: number
    /** The round being played next (equals `total` once the division is done). */
    current: number
    completed: boolean
}

export function divisionRounds(division: Pick<LeagueDivision, "fixtures" | "completed">): RoundProgress {
    const rounds = new Map<number, boolean>()
    for (const f of division.fixtures) rounds.set(f.round, (rounds.get(f.round) ?? true) && !!f.result)
    const total = rounds.size ? Math.max(...rounds.keys()) : 0
    const played = [...rounds.values()].filter(Boolean).length
    const completed = !!division.completed || (total > 0 && played >= total)
    return { played, total, current: completed ? total : Math.min(total, played + 1), completed }
}

/** "Split 1 · Round 5 of 18" / "Split 1 · Final table". */
export function splitProgressLabel(split: Pick<LeagueSplit, "split">, division: Pick<LeagueDivision, "fixtures" | "completed">): string {
    const r = divisionRounds(division)
    if (r.total === 0) return `Split ${split.split}`
    return r.completed ? `Split ${split.split} · Final table` : `Split ${split.split} · Round ${r.current} of ${r.total}`
}

/** "Weeks 2–24" in season weeks (the split stores absolute weeks). */
export function splitWeeksLabel(split: Pick<LeagueSplit, "firstWeek" | "lastWeek">): string {
    return `Weeks ${weekOfSeason(split.firstWeek)}–${weekOfSeason(split.lastWeek)}`
}

/** When the next split is drawn, e.g. "Split 2 is drawn in week 26" / "Season 2 split 1 is drawn in week 1". */
export function nextDrawLabel(split: Pick<LeagueSplit, "split" | "season">): string {
    const next = LEAGUE_TUNING.SPLITS.find(s => s.split > split.split)
    return next
        ? `Split ${next.split} is drawn in week ${next.drawWeek}`
        : `Season ${split.season + 1} split 1 is drawn in week ${LEAGUE_TUNING.SPLITS[0].drawWeek}`
}

// ---------------------------------------------------------------- divisions

/** Divisions grouped by region (region order, then level). */
export function divisionsByRegion(split: Pick<LeagueSplit, "divisions"> | undefined): Array<{ region: LeagueRegion; divisions: LeagueDivision[] }> {
    return LEAGUE_REGIONS
        .map(region => ({ region, divisions: (split?.divisions ?? []).filter(d => d.region === region).sort((a, b) => a.level - b.level) }))
        .filter(g => g.divisions.length > 0)
}

// ---------------------------------------------------------------- fixtures

export interface ClubFixture {
    fixture: LeagueFixture
    opponentId: string
    home: boolean
    /** Result from the club's side (set once the table has read it). */
    won?: boolean
    /** "13–9" rounds for a single map, maps otherwise; from the club's side. */
    score?: string
}

/** A club's league fixtures in a division: upcoming (soonest first) and played (newest first). */
export function clubFixtures(division: Pick<LeagueDivision, "fixtures">, teamId: string): { upcoming: ClubFixture[]; played: ClubFixture[] } {
    const mine = division.fixtures.filter(f => involves(f, teamId)).map<ClubFixture>(f => {
        const home = f.home === teamId
        const r = f.result
        if (!r) return { fixture: f, opponentId: home ? f.away : f.home, home }
        const singleMap = r.homeMaps + r.awayMaps <= 1 && (r.homeRounds > 0 || r.awayRounds > 0)
        const [us, them] = singleMap
            ? (home ? [r.homeRounds, r.awayRounds] : [r.awayRounds, r.homeRounds])
            : (home ? [r.homeMaps, r.awayMaps] : [r.awayMaps, r.homeMaps])
        return { fixture: f, opponentId: home ? f.away : f.home, home, won: r.winnerId === teamId, score: r.forfeit ? "FF" : `${us}–${them}` }
    })
    return {
        upcoming: mine.filter(c => !c.fixture.result).sort((a, b) => a.fixture.week - b.fixture.week || a.fixture.round - b.fixture.round),
        played: mine.filter(c => c.fixture.result).sort((a, b) => b.fixture.round - a.fixture.round),
    }
}

/**
 * Table context for a league match header, e.g. "4th, 9 pts v 6th, 6 pts"
 * (first team first). Null when the fixture's division is not in the
 * current split (an archived split) or either club is missing.
 */
export function leagueMatchContext(
    league: Pick<LeagueState, "current"> | undefined,
    m: { tournamentId?: string | null; homeTeamId: string; awayTeamId: string },
    firstTeamId: string,
): string | null {
    const division = league?.current?.divisions.find(d => d.id === m.tournamentId)
    if (!division) return null
    const secondTeamId = firstTeamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId
    const at = (id: string) => {
        const i = division.standings.findIndex(s => s.teamId === id)
        return i < 0 ? null : `${ordinal(i + 1)}, ${division.standings[i].points} pts`
    }
    const a = at(firstTeamId), b = at(secondTeamId)
    return a && b ? `${a} v ${b}` : null
}

// ---------------------------------------------------------------- history

export type SplitFate = "promoted" | "relegated" | "stayed"

export interface SplitOutcome {
    splitId: string
    season: number
    split: 1 | 2
    divisionName: string
    level: number
    position: number
    size: number
    points: number
    wins: number
    losses: number
    champion: boolean
    fate: SplitFate
    /** "Division 2" for a move, otherwise null. */
    movedTo: string | null
}

/** The club's most recent finished split (newest archived table that contains it). */
export function previousSplitOutcome(league: Pick<LeagueState, "history"> | undefined, teamId: string): SplitOutcome | null {
    const history: LeagueSplitSummary[] = league?.history ?? []
    for (let i = history.length - 1; i >= 0; i--) {
        const summary = history[i]
        for (const d of summary.divisions) {
            const idx = d.table.findIndex(row => row[0] === teamId)
            if (idx < 0) continue
            const [, points, wins, losses] = d.table[idx]
            const fate: SplitFate = d.promoted?.includes(teamId) ? "promoted" : d.relegated?.includes(teamId) ? "relegated" : "stayed"
            return {
                splitId: summary.id, season: summary.season, split: summary.split,
                divisionName: d.name, level: d.level, position: idx + 1, size: d.table.length,
                points, wins, losses, champion: d.championId === teamId, fate,
                movedTo: fate === "promoted" ? `Division ${d.level - 1}` : fate === "relegated" ? `Division ${d.level + 1}` : null,
            }
        }
    }
    return null
}

/** One sentence for a finished split, e.g. "3rd of 10 in Europe Division 3 (7W–2L, 21 pts). Promoted to Division 2." */
export function splitOutcomeText(o: SplitOutcome): string {
    const head = `${o.champion ? "Champions" : ordinal(o.position)} of ${o.size} in ${o.divisionName} (${o.wins}W–${o.losses}L, ${o.points} pts).`
    if (o.fate === "promoted") return `${head} Promoted to ${o.movedTo}.`
    if (o.fate === "relegated") return `${head} Relegated to ${o.movedTo}.`
    return `${head} Stayed in Division ${o.level}.`
}
