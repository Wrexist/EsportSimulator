/**
 * Storylines (Phase 5.3): shared context and helpers for the arc kinds.
 *
 * Engine safe: no store, no React. Deterministic: no RNG draws (arcs are
 * picked by score and id; copy variants by id hash).
 */

import type { ContractSaveData, GameEventSaveData, GameSave, NewsFeedItem, PlayerSaveData, TeamSaveData } from "../save-types"
import type { StoryArc, StoryArcKind } from "./types"
import type { ChoiceEffects } from "../event-choice"
import { STORY_TUNING as S } from "@/lib/balance-tuning"
import { evaluatePlayer } from "../player-evaluation"
import { MAX_OPEN_DECISIONS, isOpenDecision } from "../decision-deadlines"

export interface StoryContext {
    save: GameSave
    week: number
    /** The managed club (absent between jobs). */
    managed?: TeamSaveData
    player: (id: string) => PlayerSaveData | undefined
    team: (id: string) => TeamSaveData | undefined
    /** A player's live contract with a club. */
    contract: (playerId: string, teamId: string) => ContractSaveData | undefined
    /** Overall rating (cached for the tick). */
    ovr: (p: PlayerSaveData) => number
    /** Decisions waiting on the manager right now (decision beats wait while MAX_OPEN_DECISIONS are open). */
    openDecisions: number
    /** Labels of effects storyline beats applied this tick (weekly report causes). */
    applied: string[]
}

export interface ArcCandidate {
    kind: StoryArcKind
    teamId: string
    managed: boolean
    playerIds: string[]
    clubIds: string[]
    /** Per-subject cooldown key (a player, an opponent, a club). */
    subject: string
    /** Higher starts first. */
    score: number
    facts: Record<string, number | string>
}

export interface ArcDefinition {
    kind: StoryArcKind
    /** Candidates from real state this week. */
    detect(ctx: StoryContext): ArcCandidate[]
    /** First beat, run the week the arc starts. */
    open(ctx: StoryContext, arc: StoryArc): void
    /** Later beats and the resolution; runs while active once `arc.nextWeek` is reached. */
    advance(ctx: StoryContext, arc: StoryArc): void
}

export function buildContext(save: GameSave): StoryContext {
    const players = new Map<string, PlayerSaveData>()
    for (const p of save.players) players.set(p.id, p)
    const teams = new Map<string, TeamSaveData>()
    for (const t of save.teams) teams.set(t.id, t)
    const contracts = new Map<string, ContractSaveData>()
    for (const c of save.contracts) if (c.endWeek > save.currentWeek) contracts.set(`${c.teamId}|${c.playerId}`, c)
    const ovrs = new Map<string, number>()
    // Press conferences close on match day and do not hold a story back.
    let open = 0
    for (const e of save.eventsLog) if (isOpenDecision(e) && !e.id.startsWith("press_")) open++
    return {
        save,
        week: save.currentWeek,
        managed: save.gameOverReason ? undefined : teams.get(save.playerTeamId),
        player: id => players.get(id),
        team: id => teams.get(id),
        contract: (playerId, teamId) => contracts.get(`${teamId}|${playerId}`),
        ovr: p => {
            let v = ovrs.get(p.id)
            if (v === undefined) { v = evaluatePlayer(p, undefined, undefined, save.currentWeek).overallRating; ovrs.set(p.id, v) }
            return v
        },
        openDecisions: open,
        applied: [],
    }
}

// ---------------------------------------------------------------- copy helpers

export const nameOf = (p: Pick<PlayerSaveData, "id"> & Partial<Pick<PlayerSaveData, "nickname" | "name">> | undefined): string =>
    p ? p.nickname || p.name || p.id : "A player"

export const clubOf = (ctx: StoryContext, id: string): string => ctx.team(id)?.name ?? "another club"

export const usd = (n: number): string => `$${Math.round(n).toLocaleString("en-US")}`

export const fmtRating = (r: number): string => r.toFixed(2)

export const rankText = (t: Pick<TeamSaveData, "worldRanking"> | undefined): string =>
    t?.worldRanking && t.worldRanking > 0 ? `#${t.worldRanking}` : "unranked"

const ORDINAL_WORDS = ["", "", "second", "third", "fourth", "fifth"]
/** "highest", "second-highest", … for a 1-based rank. */
export function highestText(rank: number): string {
    return rank <= 1 ? "highest" : `${ORDINAL_WORDS[rank] ?? `${rank}th`}-highest`
}

export function average(xs: readonly number[]): number {
    return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0
}

/** His last official map ratings at this club (managed club only), newest last. */
export function formRatings(p: PlayerSaveData | undefined, clubId: string): number[] {
    return p?.formWindow && p.formWindow.clubId === clubId ? p.formWindow.ratings : []
}

/** Rounded average of his last `n` maps at the club, or null with fewer maps. */
export function formOver(p: PlayerSaveData | undefined, clubId: string, n: number): number | null {
    const r = formRatings(p, clubId)
    if (r.length < n) return null
    return Math.round(average(r.slice(-n)) * 100) / 100
}

export function rosterPlayers(ctx: StoryContext, team: TeamSaveData): PlayerSaveData[] {
    const out: PlayerSaveData[] = []
    for (const id of team.rosterIds) {
        const p = ctx.player(id)
        if (p && !p.isRetired) out.push(p)
    }
    return out
}

/** On the club's roster and not retired. */
export function stillAt(ctx: StoryContext, playerId: string, teamId: string): PlayerSaveData | undefined {
    const p = ctx.player(playerId)
    return p && !p.isRetired && ctx.team(teamId)?.rosterIds.includes(playerId) ? p : undefined
}

/** Where he went: the latest transfer record since `sinceWeek`. */
export function departure(ctx: StoryContext, playerId: string, sinceWeek: number) {
    const rows = ctx.save.transferHistory ?? []
    for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i]
        if (r.playerId === playerId && r.week >= sinceWeek) return r
    }
    return undefined
}

// ---------------------------------------------------------------- arc state

export function logBeat(arc: StoryArc, week: number, text: string, choice?: string): void {
    arc.log.push({ week, text, ...(choice ? { choice } : {}) })
    if (arc.log.length > S.LOG_LENGTH) arc.log.splice(0, arc.log.length - S.LOG_LENGTH)
    arc.updatedWeek = week
}

export function resolveArc(arc: StoryArc, week: number, outcome: string, text?: string): void {
    if (text) logBeat(arc, week, text)
    arc.state = "RESOLVED"
    arc.outcome = outcome
    arc.updatedWeek = week
    delete arc.eventId
}

/** Run the next beat next week. */
export function nextBeat(arc: StoryArc, week: number, after = 1): void {
    arc.beat++
    arc.nextWeek = week + after
}

const NEWS_CATEGORY: Record<StoryArcKind, NewsFeedItem["category"]> = {
    CONTRACT_STANDOFF: "TRANSFER",
    RISING_STAR: "ACHIEVEMENT",
    SLUMP: "MATCH",
    RIVALRY: "MATCH",
    LAST_DANCE: "RETIREMENT",
    RIFT: "STAFF",
    GIANT_KILLER: "MATCH",
    BOARD_PRESSURE: "FINANCE",
}

/** Publish a beat to the news feed (once per arc and key). */
export function storyNews(ctx: StoryContext, arc: StoryArc, key: string, title: string, content: string): void {
    const id = `story_${arc.id}_${key}`
    const feed = ctx.save.newsFeed
    if (feed.some(n => n.id === id)) return
    feed.unshift({
        id, title, content, week: ctx.week, category: NEWS_CATEGORY[arc.kind], teamId: arc.teamId,
        ...(arc.playerIds[0] ? { playerId: arc.playerIds[0] } : {}),
    })
}

export interface StoryChoice {
    id: string
    text: string
    effects: ChoiceEffects
}

export interface DecisionSpec {
    title: string
    message: string
    choices: StoryChoice[]
    /** Choice applied if unanswered, and how the deadline note words it ("{name}" = the player). */
    defaultChoiceId: string
    consequence: string
    /** Report label for an unanswered decision. */
    label: string
    playerId?: string
}

/**
 * Raise the beat's decision in the inbox (deadline STORY_TUNING.DECISION_WINDOW
 * weeks, default stated). Returns false while MAX_OPEN_DECISIONS answers are
 * already waiting; the caller tries again next week.
 */
export function raiseDecision(ctx: StoryContext, arc: StoryArc, spec: DecisionSpec): boolean {
    if (ctx.openDecisions >= MAX_OPEN_DECISIONS) return false
    const id = `story_${arc.id}_b${arc.beat}`
    if (!ctx.save.eventsLog.some(e => e.id === id)) {
        const event: GameEventSaveData = {
            id,
            type: "STORYLINE",
            week: ctx.week,
            acknowledged: false,
            data: {
                title: spec.title,
                message: spec.message,
                teamId: arc.teamId,
                ...(spec.playerId ? { playerId: spec.playerId } : {}),
                storyArcId: arc.id,
                storyKind: arc.kind,
                deadlineWeek: ctx.week + S.DECISION_WINDOW,
                storyDefault: { choiceId: spec.defaultChoiceId, consequence: spec.consequence, label: spec.label },
            },
            choices: spec.choices.map(c => ({ id: c.id, text: c.text, effects: c.effects as Record<string, unknown> })),
        } as unknown as GameEventSaveData
        ctx.save.eventsLog.push(event)
        ctx.openDecisions++
    }
    arc.eventId = id
    return true
}

/** Wait a week for room on the desk; past DECISION_WAIT_WEEKS the beat is dropped (returns false). */
export function waitForDesk(arc: StoryArc, week: number): boolean {
    const waited = Number(arc.facts.waited ?? 0) + 1
    arc.facts.waited = waited
    arc.nextWeek = week + 1
    return waited <= S.DECISION_WAIT_WEEKS
}

/**
 * The answer to the arc's open decision: the chosen id, "expired" when it
 * lapsed, or null while it is still open. A decision that vanished from the
 * log (compacted) counts as its default.
 */
export function answerOf(ctx: StoryContext, arc: StoryArc, defaultChoiceId: string): string | null {
    if (!arc.eventId) return arc.choice ?? null
    const e = ctx.save.eventsLog.find(x => x.id === arc.eventId)
    if (!e) return defaultChoiceId
    if (e.selectedChoiceId === undefined) return (e.data as { isWithdrawn?: boolean } | undefined)?.isWithdrawn ? "expired" : null
    return e.selectedChoiceId
}

/** True when an answer was applied by default at the deadline. */
export function answeredByDefault(ctx: StoryContext, arc: StoryArc): boolean {
    const e = arc.eventId ? ctx.save.eventsLog.find(x => x.id === arc.eventId) : undefined
    return !!(e?.data as { unanswered?: unknown } | undefined)?.unanswered
}

/** Record the answer on the arc once; returns it (or null while open). */
export function takeAnswer(ctx: StoryContext, arc: StoryArc, defaultChoiceId: string, line: (choice: string, byDefault: boolean) => string): string | null {
    if (arc.choice) return arc.choice
    const choice = answerOf(ctx, arc, defaultChoiceId)
    if (choice === null) return null
    const byDefault = answeredByDefault(ctx, arc)
    const effective = choice === "expired" ? defaultChoiceId : choice
    arc.choice = effective
    arc.facts.decidedWeek = ctx.week
    logBeat(arc, ctx.week, line(effective, byDefault || choice === "expired"), effective)
    delete arc.eventId
    return effective
}

/** Is there an open transfer request for this player? */
export function openTransferRequest(ctx: StoryContext, playerId: string): boolean {
    return ctx.save.eventsLog.some(e => e.id.startsWith(`transfer_request_${playerId}_`) && e.selectedChoiceId === undefined
        && !(e.data as { isWithdrawn?: boolean } | undefined)?.isWithdrawn)
}

/** "BLAST Spring Final", "Europe Division 2" (league), or "a friendly". */
export function competitionName(ctx: StoryContext, match: { tournamentId?: string | null; stage?: string | null; isScrim?: boolean }): string {
    if (match.isScrim || !match.tournamentId || match.tournamentId === "SCRIM") return "a friendly"
    if (match.tournamentId.startsWith("league_")) return String(match.stage ?? "").split(" · ")[0] || "the league"
    return ctx.save.tournaments.find(t => t.id === match.tournamentId)?.name ?? "the event"
}

/** Season week 1..52. */
export const weekOfSeason = (week: number): number => ((week - 1) % 52) + 1
export const seasonOf = (week: number): number => Math.floor((week - 1) / 52) + 1
