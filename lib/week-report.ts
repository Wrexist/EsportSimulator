/**
 * Weekly report (Phase 4 stream 4.1): every change of the week with its cause.
 *
 * A week is covered in three segments, all diff based (lib/week-changes.ts):
 *  1. In-week: from the week's baseline snapshot to the moment the manager
 *     advances. Matches and known decisions record their own entries as they
 *     happen; whatever they don't explain is "Your decisions this week" (or,
 *     for ranking, other clubs' results).
 *  2. The tick: pre-tick steps in the store plus every step of the week
 *     processor (training, recovery, finance, matches, events...).
 *  3. Post-tick store steps (academy).
 *
 * Only the last WEEK_REPORT_HISTORY reports are kept, compacted, in the save.
 */

import {
    diffClubs, mergeChanges, residualChanges, sideScore,
    type ChangeCause, type ChangeEntry, type ClubSnapshot,
} from "./week-changes"
import type { StoryArc } from "@/engine/storylines/types"
import { STORY_KIND_LABEL, leadingBeat } from "@/engine/storylines/view"

export const WEEK_REPORT_HISTORY = 4
/** Busy weeks keep the most important entries (club, injuries, contracts, attributes, then the biggest condition swings). */
export const WEEK_REPORT_MAX_ENTRIES = 120
const TRACKER_MAX_ENTRIES = 200

export interface WeekTracker {
    week: number
    teamId: string
    baseline: ClubSnapshot
    /** In-week changes already attributed (matches, decisions). */
    changes: ChangeEntry[]
    /** Baseline was taken after the week began (career loaded mid-week). */
    partial?: boolean
}

export interface ReportMatch {
    id: string
    opponentId: string
    opponentName: string
    won: boolean
    /** From the managed club's side. */
    score: string
    competition: string
    forfeit?: boolean
}

export interface ReportWarning {
    kind: "injury" | "contract" | "finance" | "roster"
    subjectId?: string
    label: string
    href?: string
}

/** A decision the manager left unanswered; the club applied its stated default (Phase 4.9). */
export interface ReportUnanswered {
    /** "Fan meetup request", "Unhappy player (ace)". */
    label: string
    /** The default applied, as the choice reads ("Focus purely on practice (Morale +2)"), or "Lapsed". */
    outcome: string
}

export interface ReportKpis {
    budget: [number, number]
    rank: [number | null, number | null]
    elo: [number, number]
    board: [number | null, number | null]
    chemistry: [number, number]
    morale: [number | null, number | null]
    reputation: [number, number]
}

export interface WeekReport {
    v: 1
    /** The week that was played. */
    week: number
    teamId: string
    headline: string
    changes: ChangeEntry[]
    matches: ReportMatch[]
    warnings: ReportWarning[]
    kpis: ReportKpis
    /** subjectId → display name at report time (players may leave). */
    names: Record<string, string>
    /** Decisions settled by their default this week; their effects carry the cause "Unanswered: …". */
    unanswered?: ReportUnanswered[]
    /** Phase 5.3: the week's most important storyline beat (it leads the headline). */
    story?: { kind: string; label: string; text: string }
    partial?: boolean
}

export interface WeekReportsState {
    tracker: WeekTracker | null
    history: WeekReport[]
}

// ---------- in-week tracker ----------

/** Cause for in-week movement no recorder explained. */
export function inWeekResidualCause(e: Pick<ChangeEntry, "kind" | "label">): ChangeCause {
    if (e.kind === "ranking") return { type: "world", label: "Other results this week" }
    if (e.kind === "money") return { type: "other", label: "Unitemized" }
    return { type: "decision", label: "Your decisions this week" }
}

export function newTracker(baseline: ClubSnapshot, partial = false): WeekTracker {
    return { week: baseline.week, teamId: baseline.teamId, baseline, changes: [], ...(partial ? { partial: true } : {}) }
}

export function appendTrackerChanges(tracker: WeekTracker, entries: ChangeEntry[]): void {
    if (entries.length === 0) return
    tracker.changes = mergeChanges([...tracker.changes, ...entries]).slice(0, TRACKER_MAX_ENTRIES)
}

// ---------- building ----------

interface MatchLike {
    id: string
    week: number
    homeTeamId: string
    awayTeamId: string
    isScrim?: boolean
    stage?: string | null
    tournamentId?: string | null
    result?: { winnerId?: string | null; homeScore: number; awayScore: number; maps?: unknown[] }
}

export interface ReportStateSource {
    currentWeek: number
    teams: Array<{ id: string; name: string; rosterIds: string[]; financialState?: string }>
    players: Array<{ id: string; nickname?: string; injury?: { name?: string; weeksRemaining?: number } | null }>
    contracts: Array<{ playerId: string; teamId: string; endWeek: number }>
    completedMatches: MatchLike[]
    tournaments?: Array<{ id: string; name?: string; shortName?: string }>
    /** Read for decisions the tick settled by default (`data.unanswered`). */
    eventsLog?: Array<{ id: string; data?: unknown }>
    /** Phase 5.3: storyline arcs (the headline leads with the week's most important beat). */
    storylines?: StoryArc[]
}

export interface BuildReportInput {
    week: number
    teamId: string
    tracker: WeekTracker | null
    /** Club just before the tick (end of the in-week segment). */
    preAdvance: ClubSnapshot | null
    /** Pre-tick, processor and post-tick entries, already attributed. */
    tickChanges: ChangeEntry[]
    /** Club after the tick and post steps. */
    final: ClubSnapshot | null
    state: ReportStateSource
}

const CONDITION_KINDS = new Set(["morale", "form", "fatigue", "energy"])
const CLUB_KINDS = new Set(["money", "ranking", "board", "chemistry", "reputation"])

function importance(e: ChangeEntry): number {
    if (e.kind === "injury" || e.kind === "contract") return 1e9
    if (CLUB_KINDS.has(e.kind)) return 1e8 + Math.abs(e.delta)
    if (e.kind === "attribute") return 1e4 + Math.abs(e.delta) * 100
    return Math.abs(e.delta)
}

/** Compact for the save: drop float dust, keep the most important entries. */
export function compactChanges(entries: ChangeEntry[], max = WEEK_REPORT_MAX_ENTRIES): ChangeEntry[] {
    const kept = entries.filter(e => !(CONDITION_KINDS.has(e.kind) && Math.abs(e.delta) < 0.05) && !(e.kind === "attribute" && Math.abs(e.delta) < 0.005))
    if (kept.length <= max) return kept
    return [...kept].sort((a, b) => importance(b) - importance(a)).slice(0, max)
}

function scoreFor(m: MatchLike, teamId: string): string {
    return m.result ? sideScore(m.result, m.homeTeamId === teamId) : "–"
}

const avg = (xs: number[]): number | null => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null)

export function buildWeekReport(input: BuildReportInput): WeekReport {
    const { week, teamId, tracker, preAdvance, final, state } = input

    // 1. In-week segment.
    const inWeek: ChangeEntry[] = []
    const trackerValid = !!tracker && tracker.teamId === teamId && tracker.week === week && !!preAdvance
    if (trackerValid && tracker && preAdvance) {
        const total = diffClubs(tracker.baseline, preAdvance, inWeekResidualCause)
        inWeek.push(...tracker.changes, ...residualChanges(total, tracker.changes))
    }

    const changes = compactChanges(mergeChanges([...inWeek, ...input.tickChanges]))

    // 2. Matches of the played week.
    const teamName = (id: string) => state.teams.find(t => t.id === id)?.name ?? "Unknown"
    const competition = (m: MatchLike) => m.isScrim ? "Scrim"
        : (m.tournamentId && state.tournaments?.find(t => t.id === m.tournamentId)?.name) || m.stage || "Match"
    const matches: ReportMatch[] = state.completedMatches
        .filter(m => m.week === week && (m.homeTeamId === teamId || m.awayTeamId === teamId) && m.result)
        .map(m => {
            const oppId = m.homeTeamId === teamId ? m.awayTeamId : m.homeTeamId
            return {
                id: m.id,
                opponentId: oppId,
                opponentName: teamName(oppId),
                won: m.result?.winnerId === teamId,
                score: scoreFor(m, teamId),
                competition: competition(m),
                ...(m.result && !(m.result.maps?.length) ? { forfeit: true } : {}),
            }
        })

    // 3. KPIs: week start (baseline, else pre-advance) vs now.
    const start = (trackerValid && tracker ? tracker.baseline : preAdvance) ?? final
    const end = final ?? start
    const kpis: ReportKpis = {
        budget: [start?.budget ?? 0, end?.budget ?? 0],
        rank: [start?.worldRanking ?? null, end?.worldRanking ?? null],
        elo: [Math.round(start?.elo ?? 0), Math.round(end?.elo ?? 0)],
        board: [start?.board ?? null, end?.board ?? null],
        chemistry: [Math.round((start?.chemistry ?? 0) * 10) / 10, Math.round((end?.chemistry ?? 0) * 10) / 10],
        morale: [avg(start?.players.map(p => p.morale) ?? []), avg(end?.players.map(p => p.morale) ?? [])],
        reputation: [Math.round((start?.reputation ?? 0) * 10) / 10, Math.round((end?.reputation ?? 0) * 10) / 10],
    }

    // 4. Names for every player subject.
    const names: Record<string, string> = {}
    for (const snap of [tracker?.baseline, preAdvance, final]) for (const p of snap?.players ?? []) names[p.id] = p.name
    for (const e of changes) {
        if (names[e.subjectId] || e.subjectId === teamId) continue
        const p = state.players.find(x => x.id === e.subjectId)
        if (p) names[e.subjectId] = p.nickname || p.id
    }

    // 5. Warnings from the state the manager now faces.
    const warnings: ReportWarning[] = []
    const team = state.teams.find(t => t.id === teamId)
    const rosterIds = new Set(team?.rosterIds ?? [])
    for (const p of state.players) {
        if (!rosterIds.has(p.id) || !p.injury) continue
        const weeks = p.injury.weeksRemaining ?? 0
        warnings.push({ kind: "injury", subjectId: p.id, label: `${p.nickname || p.id}: ${p.injury.name || "injured"}, ${weeks} week${weeks === 1 ? "" : "s"} out`, href: `/player/${p.id}` })
    }
    for (const c of state.contracts) {
        if (c.teamId !== teamId || !rosterIds.has(c.playerId)) continue
        const left = c.endWeek - state.currentWeek
        if (left > 0 && left <= 4) {
            const name = state.players.find(p => p.id === c.playerId)?.nickname || c.playerId
            warnings.push({ kind: "contract", subjectId: c.playerId, label: `${name}'s contract ends in ${left} week${left === 1 ? "" : "s"}`, href: `/player/${c.playerId}` })
        }
    }
    for (const e of changes) {
        if (e.kind === "contract" && e.label === "Left the club") warnings.push({ kind: "roster", subjectId: e.subjectId, label: `${names[e.subjectId] ?? "A player"} left the club (${e.cause.label.toLowerCase()})` })
    }
    const fs = team?.financialState
    if (fs && fs !== "STABLE") warnings.push({ kind: "finance", label: `Finances: ${fs.toLowerCase()}`, href: "/finances" })

    // 6. Decisions left unanswered: the tick applied their stated defaults.
    const unanswered = unansweredThisTick(state)

    // 7. Phase 5.3: the most important storyline beat of the played week or
    // the tick that closed it.
    const beat = leadingBeat(state.storylines, teamId, week, state.currentWeek)
    const story = beat ? { kind: beat.arc.kind, label: STORY_KIND_LABEL[beat.arc.kind], text: beat.text } : undefined

    const report: WeekReport = {
        v: 1, week, teamId, headline: "", changes, matches, warnings, kpis, names,
        ...(unanswered.length ? { unanswered } : {}),
        ...(story ? { story } : {}),
        ...(tracker?.partial || !trackerValid ? { partial: true } : {}),
    }
    report.headline = weekHeadline(report)
    return report
}

function unansweredThisTick(state: ReportStateSource): ReportUnanswered[] {
    const out: ReportUnanswered[] = []
    for (const e of state.eventsLog ?? []) {
        const u = (e.data as { unanswered?: { week?: unknown; label?: unknown; outcome?: unknown } } | undefined)?.unanswered
        if (!u || u.week !== state.currentWeek || typeof u.label !== "string") continue
        out.push({ label: u.label, outcome: typeof u.outcome === "string" ? u.outcome : "Lapsed" })
    }
    return out
}

// ---------- headline ----------

export function formatMoney(n: number, signed = false): string {
    const sign = n < 0 ? "−" : signed && n > 0 ? "+" : ""
    const a = Math.abs(n)
    const body = a >= 1_000_000 ? `$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`
        : a >= 10_000 ? `$${Math.round(a / 1000)}k`
            : a >= 1_000 ? `$${(a / 1000).toFixed(1)}k`
                : `$${Math.round(a)}`
    return `${sign}${body}`
}

export function moneyNet(report: Pick<WeekReport, "changes">): number {
    return report.changes.filter(e => e.kind === "money").reduce((s, e) => s + e.delta, 0)
}

/** One sentence built from the week's biggest real changes. */
export function weekHeadline(report: Omit<WeekReport, "headline">): string {
    const clauses: string[] = []
    const { matches } = report
    if (matches.length === 1) {
        const m = matches[0]
        clauses.push(m.forfeit ? `${m.won ? "Won" : "Lost"} by forfeit against ${m.opponentName}` : `${m.won ? "Beat" : "Lost to"} ${m.opponentName} ${m.score}`)
    } else if (matches.length > 1) {
        const w = matches.filter(m => m.won).length
        clauses.push(`Won ${w} of ${matches.length} matches`)
    }

    const [r0, r1] = report.kpis.rank
    if (r0 != null && r1 != null && r0 !== r1) clauses.push(`${matches.length ? "" : "the club "}${r1 < r0 ? "climbed" : "dropped"} ${Math.abs(r1 - r0)} place${Math.abs(r1 - r0) === 1 ? "" : "s"} to #${r1}`)

    const injuries = report.changes.filter(e => e.kind === "injury" && e.delta > 0 && !e.label.startsWith("Recovered"))
    for (const inj of injuries.slice(0, 1)) clauses.push(`${report.names[inj.subjectId] ?? "a player"} injured for ${inj.delta} week${inj.delta === 1 ? "" : "s"}`)

    // Biggest single attribute gain with its cause.
    const growth = report.changes.filter(e => e.kind === "attribute" && e.delta > 0).sort((a, b) => b.delta - a.delta)[0]
    if (growth && clauses.length < 3) clauses.push(`${report.names[growth.subjectId] ?? "a player"}'s ${growth.label} +${fmtDelta(growth.delta)} from ${growth.cause.label.split(" · ")[0].toLowerCase()}`)

    const net = moneyNet(report)
    if (clauses.length < 3 && Math.abs(net) >= 1) clauses.push(`finances ${formatMoney(net, true)}`)

    const join = (xs: string[]) => xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`
    // Phase 5.3: a storyline beat leads ("Slump: …"), then the week's top clause.
    if (report.story) {
        const story = `${report.story.label}: ${report.story.text.replace(/\.$/, "")}`
        return clauses.length ? `${story}; ${clauses[0]}.` : `${story}.`
    }
    if (clauses.length === 0) return "A quiet week: nothing on your club changed."
    // Without a match the sentence leads with the week type, so a player's
    // nickname is never re-capitalized as the first word.
    if (matches.length === 0) return `Training week: ${join(clauses)}.`
    const sentence = join(clauses)
    return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`
}

/** Delta text: one decimal under 10, whole numbers above. */
export function fmtDelta(d: number): string {
    const a = Math.abs(d)
    return a >= 10 ? String(Math.round(a)) : a >= 1 ? (Math.round(a * 10) / 10).toString() : (Math.round(a * 10) / 10 || Math.round(a * 100) / 100).toString()
}

export function signedDelta(d: number): string {
    return `${d < 0 ? "−" : "+"}${fmtDelta(d)}`
}

// ---------- persistence ----------

export function pushWeekReport(state: WeekReportsState | null | undefined, report: WeekReport, nextTracker: WeekTracker | null): WeekReportsState {
    const history = [report, ...(state?.history ?? []).filter(r => r.week !== report.week || r.teamId !== report.teamId)].slice(0, WEEK_REPORT_HISTORY)
    return { tracker: nextTracker, history }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

function validEntry(e: unknown): e is ChangeEntry {
    return isObj(e) && typeof e.kind === "string" && typeof e.subjectId === "string" && typeof e.label === "string"
        && typeof e.delta === "number" && Number.isFinite(e.delta) && isObj(e.cause) && typeof e.cause.type === "string" && typeof e.cause.label === "string"
}

function validSnapshot(s: unknown): s is ClubSnapshot {
    return isObj(s) && typeof s.teamId === "string" && typeof s.week === "number" && Array.isArray(s.players) && Array.isArray(s.ledger) && isObj(s.contracts)
}

/** Shape-check a loaded value; anything malformed is dropped rather than trusted. */
export function sanitizeWeekReports(raw: unknown): WeekReportsState | null {
    if (!isObj(raw)) return null
    const tracker = isObj(raw.tracker) && typeof raw.tracker.week === "number" && typeof raw.tracker.teamId === "string" && validSnapshot(raw.tracker.baseline)
        ? { ...(raw.tracker as unknown as WeekTracker), changes: Array.isArray(raw.tracker.changes) ? raw.tracker.changes.filter(validEntry).slice(0, TRACKER_MAX_ENTRIES) : [] }
        : null
    const history = Array.isArray(raw.history)
        ? raw.history.filter((r): r is WeekReport => isObj(r) && r.v === 1 && typeof r.week === "number" && typeof r.teamId === "string" && Array.isArray(r.changes) && isObj(r.kpis))
            .map(r => {
                const unanswered = Array.isArray(r.unanswered) ? r.unanswered.filter(u => isObj(u) && typeof u.label === "string" && typeof u.outcome === "string") : []
                const { unanswered: _raw, story: _story, ...rest } = r
                void _raw
                const story = isObj(_story) && typeof _story.text === "string" && typeof _story.label === "string" && typeof _story.kind === "string" ? _story : undefined
                return { ...rest, changes: r.changes.filter(validEntry).slice(0, WEEK_REPORT_MAX_ENTRIES), matches: Array.isArray(r.matches) ? r.matches : [], warnings: Array.isArray(r.warnings) ? r.warnings : [], names: isObj(r.names) ? r.names : {}, ...(unanswered.length ? { unanswered } : {}), ...(story ? { story } : {}) }
            })
            .slice(0, WEEK_REPORT_HISTORY)
        : []
    if (!tracker && history.length === 0) return null
    return { tracker, history }
}
