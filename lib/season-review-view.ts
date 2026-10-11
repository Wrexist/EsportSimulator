/**
 * Season review screen model (Phase 5.4b). Every page of the season review,
 * built from the save only:
 *
 *   club     the managed club's season (engine/season-review.ts userClub):
 *            final league position, record, titles, world-tier move, best
 *            player, biggest win and worst loss, and the board's verdict
 *            (engine/board-expectations.ts boardVerdictFor)
 *   mvp      season MVP with the real numbers that earned it
 *   rookie   rookie of the year
 *   top20    the Top 20 (rank 20 to 1), the managed club's players marked
 *   team     team of the season (five)
 *   records  season bests, the all-time records that fell, the season's titles
 *   story    the managed club's storylines (stream 5.3, read defensively),
 *            else the season told from the facts above, in calendar order
 *
 * Pages without data are left out (no MVP when nobody reached the minimum
 * maps, no story when nothing happened). Pure: no store, no React.
 */

import type { GameSave, PlayerSaveData, TeamSaveData } from "@/engine/save-types"
import type { AwardWinner, RecordEntry, RecordKey, SeasonTitle } from "@/engine/records-types"
import { RECORD_KEYS } from "@/engine/records-types"
import { getSeasonReview, type SeasonReview } from "@/engine/season-review"
import { boardVerdictFor, REVIEW_VERDICT_LABEL, type BoardOutcome } from "@/engine/board-expectations"
import { TIER_DISPLAY } from "@/engine/league-engine"
import { isLeagueMatchId, ordinal } from "@/engine/season/regional-league"
import { WEEKS_PER_SEASON } from "@/engine/official-stats"
import { trophyKindForTournament, type TrophyArtKind } from "@/lib/trophy-art"
import type { StoryArc, StoryArcKind } from "@/engine/storylines/types"
import { STORY_KIND_LABEL } from "@/engine/storylines/view"

export type ReviewPageId = "club" | "mvp" | "rookie" | "top20" | "team" | "records" | "story"

export const REVIEW_PAGE_LABEL: Record<ReviewPageId, string> = {
    club: "Your season",
    mvp: "Player of the season",
    rookie: "Rookie of the year",
    top20: "Top 20",
    team: "Team of the season",
    records: "Records",
    story: "Story of the season",
}

export const RECORD_LABEL: Record<RecordKey, string> = {
    bestMapRating: "Best map rating",
    mostMapKills: "Most kills in a map",
    biggestWin: "Biggest map win",
    longestWinStreak: "Longest win streak",
}

/** What the review reads: the save, or the store (same fields). */
export type ReviewSource = Pick<GameSave, "recordBook" | "players" | "teams" | "currentWeek" | "playerTeamId" | "league" | "managerDetails" | "boardState"> & {
    /** Stream 5.3 storylines; read defensively (shape not assumed). */
    storylines?: unknown
}

export interface ReviewPlayer {
    playerId: string
    /** Nickname. */
    name: string
    realName?: string
    portraitPath?: string
    nationality?: string
    teamId: string
    teamName: string
    role: string
    age: number
    rating: number
    score: number
    maps: number
    rounds: number
    kills: number
    deaths: number
    adr: number
    /** Kills per round, 2 dp. */
    kpr: number
    mvps: number
    trophies: number
    majors: number
    rank?: number
    /** Played for the managed club (most rounds that season). */
    ours: boolean
}

export interface ReviewTrophy {
    name: string
    tier: string
    week: number
    major: boolean
    art: TrophyArtKind
    teamId: string
    teamName: string
    ours: boolean
}

export interface ReviewResult {
    opponentName: string
    /** Series score from the club's side, e.g. "2–0". */
    score: string
    /** Round difference over the series. */
    margin: number
    week: number
    map?: string
}

export interface ReviewBoard {
    outcome: BoardOutcome
    /** "Expectations met". */
    label: string
    confidence?: number
    delta?: number
    reasons: string[]
}

export interface ReviewClub {
    teamId: string
    teamName: string
    league?: { position: number; of: number; division: string; level: number; split: number; label: string }
    record: { wins: number; losses: number }
    trophies: ReviewTrophy[]
    tierMove?: { direction: "promoted" | "relegated"; from: string; to: string }
    /** World tier after the season-end bands ("S-Tier"). */
    worldTier?: string
    bestPlayer?: ReviewPlayer
    biggestWin?: ReviewResult
    worstLoss?: ReviewResult
    board?: ReviewBoard
}

export interface ReviewRecord {
    key: RecordKey
    label: string
    value: string
    /** Player nickname, or the club for club records. */
    holder: string
    teamName: string
    detail: string
    /** An all-time record that fell this season. */
    allTime: boolean
    ours: boolean
}

export type StoryTone = "gold" | "positive" | "negative" | "neutral"

export interface ReviewStoryBeat {
    /** "Week 14", "Split 1", "Season end". */
    when?: string
    title: string
    detail?: string
    tone: StoryTone
}

export interface ReviewStoryArc {
    title: string
    summary?: string
    beats: ReviewStoryBeat[]
}

export interface ReviewStory {
    /** "storylines": the club's story arcs (5.3); "season": built from the season's facts. */
    source: "storylines" | "season"
    arcs: ReviewStoryArc[]
}

export interface SeasonReviewView {
    season: number
    /** False while the season is still being played (provisional numbers). */
    final: boolean
    club: ReviewClub
    awards: { mvp?: ReviewPlayer; rookie?: ReviewPlayer; top20: ReviewPlayer[]; minMaps: number; ranked: number }
    teamOfSeason: ReviewPlayer[]
    records: ReviewRecord[]
    titles: ReviewTrophy[]
    story?: ReviewStory
    /** A title, a promotion, a league win or a delighted board: the review celebrates. */
    success: boolean
    pages: ReviewPageId[]
}

export const weekOfSeasonLabel = (week: number) => `Week ${((Math.max(1, week) - 1) % WEEKS_PER_SEASON) + 1}`
const tierLabel = (tier: string) => tier === "QUALIFIER" ? "Qualifier" : TIER_DISPLAY[tier as keyof typeof TIER_DISPLAY]?.label ?? tier
/** Champions list order: Majors, then S/A/B/C events, league titles, qualifiers. */
const TITLE_ORDER = ["S_TIER", "A_TIER", "B_TIER", "C_TIER", "LEAGUE", "QUALIFIER"]
const titleRank = (tier: string) => { const i = TITLE_ORDER.indexOf(tier); return i < 0 ? TITLE_ORDER.length : i }
const dash = (score: string) => score.replace("-", "–")

const MAX_ARCS = 4
const MAX_BEATS = 5

interface Lookups {
    players: Map<string, PlayerSaveData>
    teams: Map<string, TeamSaveData>
    teamId: string
}

const teamName = (lk: Lookups, id: string | undefined) => (id && lk.teams.get(id)?.name) || "A former club"

function reviewPlayer(lk: Lookups, w: AwardWinner): ReviewPlayer {
    const p = lk.players.get(w.playerId)
    return {
        playerId: w.playerId,
        name: w.name,
        ...(p?.name && p.name !== w.name ? { realName: p.name } : {}),
        ...(p?.portraitPath ? { portraitPath: p.portraitPath } : {}),
        ...(p?.nationality ? { nationality: p.nationality } : {}),
        teamId: w.teamId,
        teamName: teamName(lk, w.teamId),
        role: w.role,
        age: w.age,
        rating: w.rating,
        score: w.score,
        maps: w.maps,
        rounds: w.rounds,
        kills: w.kills,
        deaths: w.deaths,
        adr: w.adr,
        kpr: w.rounds ? Math.round((w.kills / w.rounds) * 100) / 100 : 0,
        mvps: w.mvps,
        trophies: w.trophies,
        majors: w.majors,
        ...(w.rank ? { rank: w.rank } : {}),
        ours: w.teamId === lk.teamId,
    }
}

function reviewTrophy(lk: Lookups, t: SeasonTitle): ReviewTrophy {
    const league = t.tier === "LEAGUE" || isLeagueMatchId(t.tournamentId)
    const major = !!t.major
    return {
        name: t.name,
        tier: t.tier,
        week: t.week,
        major,
        art: trophyKindForTournament(t.tier, { major, league }),
        teamId: t.teamId,
        teamName: teamName(lk, t.teamId),
        ours: t.teamId === lk.teamId,
    }
}

function reviewResult(lk: Lookups, r: RecordEntry | undefined): ReviewResult | undefined {
    if (!r) return undefined
    return {
        opponentName: teamName(lk, r.opponentId),
        score: dash(r.score ?? ""),
        margin: r.value,
        week: r.week,
        ...(r.map ? { map: r.map } : {}),
    }
}

function reviewRecord(lk: Lookups, key: RecordKey, r: RecordEntry, broken: boolean): ReviewRecord {
    const club = teamName(lk, r.teamId)
    const opp = teamName(lk, r.opponentId)
    const value = key === "bestMapRating" ? r.value.toFixed(2)
        : key === "mostMapKills" ? `${r.value} kills`
            : key === "biggestWin" ? (r.score ? dash(r.score) : `+${r.value}`)
                : `${r.value} wins`
    const detail = key === "longestWinStreak"
        ? [r.fromWeek ? `${weekOfSeasonLabel(r.fromWeek)} to ${weekOfSeasonLabel(r.week).toLowerCase()}` : weekOfSeasonLabel(r.week), r.endedBy ? `ended by ${teamName(lk, r.endedBy)}` : null].filter(Boolean).join(" · ")
        : [`vs ${opp}`, r.map, weekOfSeasonLabel(r.week)].filter(Boolean).join(" · ")
    return {
        key,
        label: RECORD_LABEL[key],
        value,
        holder: r.playerName ?? club,
        teamName: club,
        detail: key === "biggestWin" ? `${detail} · +${r.value} rounds` : detail,
        allTime: broken,
        ours: r.teamId === lk.teamId,
    }
}

// ---------------------------------------------------------------- story

type Loose = Record<string, unknown>
const isObj = (v: unknown): v is Loose => !!v && typeof v === "object" && !Array.isArray(v)
function str(o: Loose, keys: string[]): string | undefined {
    for (const k of keys) {
        const v = o[k]
        if (typeof v === "string" && v.trim()) return v.trim()
    }
    return undefined
}
function num(o: Loose, keys: string[]): number | undefined {
    for (const k of keys) {
        const v = o[k]
        if (typeof v === "number" && Number.isFinite(v)) return v
    }
    return undefined
}

/** How an arc ended, as a tone for its last beat. */
const OUTCOME_TONE: Record<string, StoryTone> = {
    RENEWED: "positive", RECOVERED: "positive", WON: "gold", PLAYS_ON: "positive", SURVIVES: "positive", SETTLED: "positive", KEPT: "positive",
    LEFT: "negative", DROPPED: "negative", LOST: "negative", REQUEST: "negative", SACKED: "negative", SOLD: "negative", LINGERS: "negative",
}
/** Which stories lead the page when the club had more than MAX_ARCS (same order as the weekly report). */
const STORY_WEIGHT: Record<StoryArcKind, number> = {
    BOARD_PRESSURE: 8, CONTRACT_STANDOFF: 7, RIVALRY: 6, LAST_DANCE: 5, RIFT: 4, SLUMP: 3, RISING_STAR: 2, GIANT_KILLER: 1,
}
const seasonOfWeek = (week: number) => Math.max(1, Math.ceil(week / WEEKS_PER_SEASON))

/**
 * The managed club's story arcs of the season (Phase 5.3 `save.storylines`):
 * every arc of the club with a beat logged that season, the most important
 * first (at most MAX_ARCS), each with its logged beats in order. Anything
 * that is not a story arc is skipped.
 */
export function readStorylineArcs(raw: unknown, teamId: string, season: number): ReviewStoryArc[] {
    if (!Array.isArray(raw)) return []
    const arcs = (raw as unknown[]).filter((a): a is StoryArc =>
        isObj(a) && typeof a.kind === "string" && a.kind in STORY_KIND_LABEL && Array.isArray(a.log) && a.teamId === teamId)
    return arcs
        .map(arc => ({ arc, log: arc.log.filter(l => isObj(l) && typeof l.text === "string" && typeof l.week === "number" && seasonOfWeek(l.week) === season) }))
        .filter(x => x.log.length > 0)
        .sort((a, b) => STORY_WEIGHT[b.arc.kind] - STORY_WEIGHT[a.arc.kind] || a.log[0].week - b.log[0].week)
        .slice(0, MAX_ARCS)
        .sort((a, b) => a.log[0].week - b.log[0].week)
        .map(({ arc, log }) => {
            const ended = arc.state === "RESOLVED" && seasonOfWeek(arc.updatedWeek) === season
            const beats = log.slice(-MAX_BEATS).map((l, i, all): ReviewStoryBeat => ({
                when: weekOfSeasonLabel(l.week),
                title: l.text,
                tone: ended && i === all.length - 1 ? OUTCOME_TONE[arc.outcome ?? ""] ?? "neutral" : "neutral",
            }))
            return { title: STORY_KIND_LABEL[arc.kind], ...(ended ? {} : { summary: "Still running" }), beats }
        })
}

/** The club's season in calendar order, from the facts the save keeps. */
function seasonBeats(src: ReviewSource, lk: Lookups, review: SeasonReview, club: ReviewClub): ReviewStoryBeat[] {
    const beats: Array<ReviewStoryBeat & { order: number }> = []
    const splitEnds = new Map<number, number>([[1, 24], [2, 49]])
    for (const split of (src.league?.history ?? []).filter(h => h.season === review.season).sort((a, b) => a.split - b.split)) {
        for (const div of split.divisions) {
            const i = div.table.findIndex(row => row[0] === lk.teamId)
            if (i < 0) continue
            const [, points, wins, losses] = div.table[i]
            const champion = div.championId === lk.teamId || i === 0
            const up = div.promoted?.includes(lk.teamId), down = div.relegated?.includes(lk.teamId)
            const outcome = champion ? "Division champions" : up ? "Promoted" : down ? "Relegated" : null
            beats.push({
                order: (splitEnds.get(split.split) ?? 50) * 10 + 5,
                when: `Split ${split.split}`,
                title: `${ordinal(i + 1)} of ${div.table.length} in ${div.name}${outcome ? `: ${outcome.toLowerCase()}` : ""}`,
                detail: `${wins}–${losses}, ${points} points`,
                tone: champion ? "gold" : up ? "positive" : down ? "negative" : "neutral",
            })
        }
    }
    for (const t of club.trophies) beats.push({ order: t.week * 10 + 1, when: weekOfSeasonLabel(t.week), title: `Won ${t.name}`, detail: t.major ? "Major champions" : t.tier === "LEAGUE" ? "League title" : t.tier === "QUALIFIER" ? "Qualifier" : `${tierLabel(t.tier)} title`, tone: "gold" })
    if (club.biggestWin) beats.push({ order: club.biggestWin.week * 10 + 2, when: weekOfSeasonLabel(club.biggestWin.week), title: `Biggest win: ${club.biggestWin.score} vs ${club.biggestWin.opponentName}`, detail: `+${club.biggestWin.margin} rounds${club.biggestWin.map ? ` · ${club.biggestWin.map}` : ""}`, tone: "positive" })
    if (club.worstLoss) beats.push({ order: club.worstLoss.week * 10 + 2, when: weekOfSeasonLabel(club.worstLoss.week), title: `Heaviest defeat: ${club.worstLoss.score} vs ${club.worstLoss.opponentName}`, detail: `−${club.worstLoss.margin} rounds${club.worstLoss.map ? ` · ${club.worstLoss.map}` : ""}`, tone: "negative" })
    for (const key of review.records.broken) {
        const r = review.records.season[key]
        if (!r || r.teamId !== lk.teamId) continue
        const rec = reviewRecord(lk, key, r, true)
        beats.push({ order: r.week * 10 + 3, when: weekOfSeasonLabel(r.week), title: `All-time record: ${rec.label.toLowerCase()}`, detail: `${rec.value} · ${rec.holder}`, tone: "gold" })
    }
    if (club.tierMove) beats.push({ order: WEEKS_PER_SEASON * 10 + 6, when: "Season end", title: `${club.tierMove.direction === "promoted" ? "Promoted" : "Relegated"} to ${club.tierMove.to}`, detail: `From ${club.tierMove.from}, on the final world ranking`, tone: club.tierMove.direction === "promoted" ? "positive" : "negative" })
    if (club.board) beats.push({ order: WEEKS_PER_SEASON * 10 + 7, when: "Season end", title: `Board review: ${club.board.label.toLowerCase()}`, ...(club.board.confidence !== undefined ? { detail: `Confidence ${Math.round(club.board.confidence)}/100` } : {}), tone: club.board.outcome === "EXCEEDED" || club.board.outcome === "MET" ? "positive" : "negative" })
    return beats.sort((a, b) => a.order - b.order).map(({ order: _order, ...beat }) => beat)
}

// ---------------------------------------------------------------- view

/**
 * The season review of `season` for the managed club, or null when the save
 * has no record of it (seasons from before Phase 5.1).
 */
export function buildSeasonReviewView(src: ReviewSource, season: number): SeasonReviewView | null {
    const review = getSeasonReview(src as GameSave, season)
    if (!review) return null
    const uc = review.userClub
    const teamId = uc?.teamId ?? src.playerTeamId
    const lk: Lookups = { players: new Map(src.players.map(p => [p.id, p])), teams: new Map(src.teams.map(t => [t.id, t])), teamId }

    const verdict = boardVerdictFor(src, season)
    const pos = uc?.finalLeaguePosition
    const club: ReviewClub = {
        teamId,
        teamName: teamName(lk, teamId),
        ...(pos ? { league: { ...pos, label: ordinal(pos.position) } } : {}),
        record: uc?.record ?? { wins: 0, losses: 0 },
        trophies: (uc?.trophies ?? []).map(t => reviewTrophy(lk, t)).sort((a, b) => a.week - b.week),
        ...(uc && uc.tierMove !== "none" && uc.tierFrom && uc.tierTo ? { tierMove: { direction: uc.tierMove, from: tierLabel(uc.tierFrom), to: tierLabel(uc.tierTo) } } : {}),
        ...(uc?.tierTo ? { worldTier: tierLabel(uc.tierTo) } : {}),
        ...(uc?.bestPlayer ? { bestPlayer: reviewPlayer(lk, uc.bestPlayer) } : {}),
        ...(uc?.biggestWin ? { biggestWin: reviewResult(lk, uc.biggestWin) } : {}),
        ...(uc?.worstLoss ? { worstLoss: reviewResult(lk, uc.worstLoss) } : {}),
        ...(verdict ? { board: { ...verdict, label: REVIEW_VERDICT_LABEL[verdict.outcome].replace(/^./, c => c.toUpperCase()) } } : {}),
    }

    const awards = {
        ...(review.awards.mvp ? { mvp: reviewPlayer(lk, review.awards.mvp) } : {}),
        ...(review.awards.rookie ? { rookie: reviewPlayer(lk, review.awards.rookie) } : {}),
        top20: review.awards.top20.map(w => reviewPlayer(lk, w)).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)),
        minMaps: review.awards.minMaps,
        ranked: review.awards.ranked,
    }
    const teamOfSeason = review.teamOfSeason.map(w => reviewPlayer(lk, w))
    const broken = new Set(review.records.broken)
    const records = RECORD_KEYS.flatMap(key => {
        const r = review.records.season[key]
        return r ? [reviewRecord(lk, key, r, broken.has(key))] : []
    })
    const titles = review.records.titles.map(t => reviewTrophy(lk, t))
        .sort((a, b) => Number(b.major) - Number(a.major) || titleRank(a.tier) - titleRank(b.tier) || a.week - b.week)

    const arcs = readStorylineArcs(src.storylines, teamId, season)
    const beats = arcs.length ? [] : seasonBeats(src, lk, review, club)
    const story: ReviewStory | undefined = arcs.length
        ? { source: "storylines", arcs }
        : beats.length ? { source: "season", arcs: [{ title: `${club.teamName}, season ${season}`, beats }] } : undefined

    const success = club.trophies.length > 0 || club.tierMove?.direction === "promoted" || (pos?.position === 1) || verdict?.outcome === "EXCEEDED"

    const pages: ReviewPageId[] = ["club"]
    if (awards.mvp) pages.push("mvp")
    if (awards.rookie) pages.push("rookie")
    if (awards.top20.length) pages.push("top20")
    if (teamOfSeason.length) pages.push("team")
    if (records.length || titles.length) pages.push("records")
    if (story) pages.push("story")

    return { season, final: review.final, club, awards, teamOfSeason, records, titles, ...(story ? { story } : {}), success, pages }
}
