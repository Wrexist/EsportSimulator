/**
 * Board Expectations & Confidence
 * ================================
 * Gives the season real stakes (Phase 4.4).
 *
 *  - Objectives: every season the board sets three, scaled to the club:
 *    a league finish in its regional division (re-set for each split), a
 *    world ranking by season end, and budget discipline (cash at season end).
 *  - Confidence moves every week with a named cause: results (weighted by
 *    the Elo gap), titles, the league table against the objective, and the
 *    club's financial state. Every move lands in the weekly report.
 *  - Two formal reviews: mid-season (after split 1) and season end.
 *  - Consequences are telegraphed: a warning, then a final warning (on
 *    notice), then dismissal. A dismissed manager goes to the job market
 *    (engine/job-offer-generator.ts createDismissalOffers) instead of a dead
 *    end.
 *
 * Every mutation is idempotent per week / per review.
 */

import type { GameSave, BoardState, BoardExpectationTier, BoardObjective, BoardMove, TeamSaveData } from "./save-types"
import { getSeasonNumber } from "./career-stats"
import { BOARD_TUNING, LEAGUE_TUNING } from "@/lib/balance-tuning"
import { EconomyEngine } from "./economy-engine"
import { divisionOfTeam, ordinal, playedInSplit, tablePosition, weekOfSeason } from "./season/regional-league"
import { adjustManagerReputation, closeStint } from "./manager-timeline"

export type { BoardExpectationTier, BoardState } from "./save-types"
export type BoardOutcome = "EXCEEDED" | "MET" | "MISSED" | "FAILED"

export interface BoardReviewResult {
    reviewed: boolean
    outcome?: BoardOutcome
    tier?: BoardExpectationTier
    confidence?: number
    confidenceDelta?: number
    sacked?: boolean
    onNotice?: boolean
    endRank?: number
    trophies?: number
    rewardBudget?: number
    newsTitle?: string
    newsContent?: string
    /** The review's confidence moves with causes (weekly report). */
    moves?: BoardMove[]
}

const NEW_BOARD_CONFIDENCE = BOARD_TUNING.NEW_BOARD_CONFIDENCE

const CONFIDENCE_DELTA: Record<BoardOutcome, number> = {
    EXCEEDED: 22,
    MET: 10,
    MISSED: -14,
    FAILED: -28,
}

/** Manager reputation change per season review verdict (also FAILED on dismissal). */
export const REPUTATION_DELTA: Record<BoardOutcome, number> = {
    EXCEEDED: 6,
    MET: 2,
    MISSED: -3,
    FAILED: -6,
}

export const REVIEW_VERDICT_LABEL: Record<BoardOutcome, string> = {
    EXCEEDED: "expectations exceeded",
    MET: "expectations met",
    MISSED: "expectations missed",
    FAILED: "expectations failed",
}

/** The season review's verdict from its total confidence move. */
export function reviewVerdict(delta: number): BoardOutcome {
    return delta >= 12 ? "EXCEEDED" : delta >= 0 ? "MET" : delta >= -12 ? "MISSED" : "FAILED"
}

/** Cause the season review writes to the manager's reputation log. */
const seasonReviewCause = (season: number, outcome: BoardOutcome) => `Season ${season} board review: ${REVIEW_VERDICT_LABEL[outcome]}`

export interface BoardSeasonVerdict {
    outcome: BoardOutcome
    /** Confidence after the review and the review's move (known while it is the board's last review). */
    confidence?: number
    delta?: number
    /** The review's causes, e.g. "Season ranking met: #12 (target #15)". */
    reasons: string[]
}

/**
 * The board's verdict on a closed season, read back from the save: the
 * board's last review while it is that season's, else the cause the review
 * wrote to the manager's reputation log. Undefined when the board did not
 * judge the season (a new manager is given time).
 */
export function boardVerdictFor(save: Pick<GameSave, "boardState" | "managerDetails">, season: number): BoardSeasonVerdict | undefined {
    const last = save.boardState?.lastReview
    if (last?.kind === "SEASON" && getSeasonNumber(last.week) === season) {
        return { outcome: reviewVerdict(last.delta), confidence: last.confidence, delta: last.delta, reasons: last.summary ? last.summary.split(". ").map(s => s.trim()).filter(Boolean) : [] }
    }
    const log = save.managerDetails?.reputationLog ?? []
    for (const outcome of Object.keys(REVIEW_VERDICT_LABEL) as BoardOutcome[]) {
        if (log.some(c => c.cause === seasonReviewCause(season, outcome))) return { outcome, reasons: [] }
    }
    return undefined
}

interface TierTargets {
    /** Required end-of-season world ranking (≤ is good; lower is better). */
    rankTarget: number
    /** Trophies the board expects this season. */
    trophyTarget: number
    label: string
    blurb: string
}

const TIER_TARGETS: Record<BoardExpectationTier, TierTargets> = {
    WIN: { rankTarget: 3, trophyTarget: 1, label: "Win silverware", blurb: "The board expects a title challenge and a top-3 finish." },
    CONTEND: { rankTarget: 6, trophyTarget: 0, label: "Contend at the top", blurb: "The board expects a top-6 finish and a deep playoff run." },
    COMPETE: { rankTarget: 14, trophyTarget: 0, label: "Stay competitive", blurb: "The board expects a top-14 finish and steady progress." },
    SURVIVE: { rankTarget: 26, trophyTarget: 0, label: "Build the project", blurb: "The board expects you to keep the club competitive and developing." },
}

/** Map current stature (lower rank = stronger; higher reputation = stronger) to
 *  an expectation tier. Uses the more demanding of the two signals. */
export function deriveExpectationTier(worldRanking: number, reputation: number): BoardExpectationTier {
    const r = worldRanking > 0 ? worldRanking : 30
    if (r <= 4 || reputation >= 80) return "WIN"
    if (r <= 10 || reputation >= 65) return "CONTEND"
    if (r <= 20 || reputation >= 45) return "COMPETE"
    return "SURVIVE"
}

export function getTierTargets(tier: BoardExpectationTier): TierTargets {
    return TIER_TARGETS[tier]
}

/** World-ranking target for a club of this stature (shown before a career starts too). */
export function rankTargetFor(worldRanking: number, reputation: number): number {
    const tier = deriveExpectationTier(worldRanking, reputation)
    return Math.max(TIER_TARGETS[tier].rankTarget, worldRanking > 30 ? Math.ceil(worldRanking * 0.9) : 0)
}

/** Judge a finished season's ranking against its expectation tier. Forgiving bands: a
 *  near-miss is MISSED (recoverable), only a heavy underperformance is FAILED. */
export function evaluateOutcome(tier: BoardExpectationTier, endRank: number, trophies: number, rankTarget?: number): BoardOutcome {
    const t = { ...TIER_TARGETS[tier], rankTarget: rankTarget ?? TIER_TARGETS[tier].rankTarget }
    const rank = endRank > 0 ? endRank : 30
    if (trophies > t.trophyTarget || rank <= t.rankTarget - 3) return "EXCEEDED"
    if (rank <= t.rankTarget && trophies >= t.trophyTarget) return "MET"
    if (rank <= t.rankTarget + 5) return "MISSED"
    return "FAILED"
}

export function confidenceDelta(outcome: BoardOutcome): number {
    return CONFIDENCE_DELTA[outcome]
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const round1 = (n: number) => Math.round(n * 10) / 10
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`

/**
 * Board war-chest: the fraction of the club budget the board will sanction
 * for a SINGLE transfer fee, gated by confidence. A backed manager spends
 * freely; a doubted one can't blow the budget on a blockbuster. Missing
 * board state (fresh saves pre-tick) sanctions everything — never blocks
 * on absent data.
 */
export function getBoardSanctionedFee(
    board: BoardState | undefined,
    budget: number,
): { maxFee: number; fraction: number } {
    if (!board) return { maxFee: budget, fraction: 1 }
    const fraction = board.onNotice || board.confidence < 25 ? 0.4
        : board.confidence < 40 ? 0.6
        : board.confidence < 70 ? 0.8
        : 1
    return { maxFee: Math.floor(budget * fraction), fraction }
}

/** Trophies the player's club lifted within a given season window. */
export function trophiesInSeason(save: GameSave, seasonNumber: number): number {
    const start = Math.max((seasonNumber - 1) * 52 + 1, save.managerDetails?.tenureStartWeek ?? 1)
    const end = seasonNumber * 52
    const team = save.teams.find(t => t.id === save.playerTeamId)
    if (!team?.trophies) return 0
    return team.trophies.filter(tr => tr.week >= start && tr.week <= end).length
}

/** Weekly running costs (wages, staff, upkeep, operations) at the next settlement. */
export function weeklyRunningCosts(save: GameSave, team: TeamSaveData): number {
    const academy = team.id === save.playerTeamId ? (save.academyPlayers?.length ?? 0) : 0
    const safe = { ...team, rosterIds: team.rosterIds ?? [], staffIds: team.staffIds ?? [] }
    return EconomyEngine.processWeeklyFinances(safe, save.players || [], save.contracts || [], save.staff || [], save.currentWeek + 1, academy).expenses.total
}

// ============ Objectives ============

/** League objective for the club's current division: a finish scaled to where its Elo ranks it. */
export function leagueObjective(save: GameSave, teamId: string): BoardObjective | undefined {
    const division = divisionOfTeam(save, teamId)
    if (!division || division.teamIds.length < 2) return undefined
    const elo = new Map(save.teams.map(t => [t.id, t.elo ?? 1000]))
    const expected = [...division.teamIds].sort((a, b) => (elo.get(b) ?? 0) - (elo.get(a) ?? 0) || a.localeCompare(b)).indexOf(teamId) + 1
    const n = division.teamIds.length
    const safe = n - LEAGUE_TUNING.RELEGATED
    const bottomLevel = Math.max(...(save.league?.current?.divisions ?? []).filter(d => d.region === division.region).map(d => d.level))
    const slack = Math.max(1, Math.ceil(n * 0.2))
    let target = clamp(expected + slack, 1, n)
    let label: string
    if (division.level > 1 && expected <= LEAGUE_TUNING.PROMOTED + 1) {
        target = LEAGUE_TUNING.PROMOTED
        label = `Win promotion from ${division.name} (top ${target})`
    } else if (division.level < bottomLevel && target >= safe) {
        target = safe
        label = `Avoid relegation from ${division.name} (${ordinal(safe)} or better)`
    } else {
        label = target === 1 ? `Win ${division.name}` : `Finish ${ordinal(target)} or better in ${division.name}`
    }
    return { id: "league", label, target, divisionId: division.id }
}

function financeObjective(save: GameSave, team: TeamSaveData, startCash: number): BoardObjective {
    const floor = BOARD_TUNING.FINANCE_MIN_WEEKS_OF_COSTS * weeklyRunningCosts(save, team)
    const target = Math.max(0, Math.round(Math.min(startCash, Math.max(BOARD_TUNING.FINANCE_CASH_SHARE * startCash, floor)) / 1000) * 1000)
    return { id: "finance", label: `Budget discipline: end the season with at least ${money(target)} in the bank`, target }
}

function rankingObjective(rankTarget: number): BoardObjective {
    return { id: "ranking", label: `Finish the season ranked #${rankTarget} or better`, target: rankTarget }
}

/** Set this season's objectives (idempotent per season; the league objective follows the split). */
export function ensureSeasonObjectives(save: GameSave, board: BoardState): void {
    const team = save.teams.find(t => t.id === save.playerTeamId)
    if (!team) return
    const season = getSeasonNumber(save.currentWeek)
    if (board.objectivesSeason !== season || !board.objectives?.length) {
        const ranking = team.worldRanking ?? 30
        board.seasonExpectation = deriveExpectationTier(ranking, team.reputation ?? 50)
        board.rankTarget = board.expectationSetSeason === season && board.rankTarget ? board.rankTarget : rankTargetFor(ranking, team.reputation ?? 50)
        board.expectationSetSeason = season
        board.seasonStartCash = Math.round(team.budget)
        board.objectives = [leagueObjective(save, team.id), rankingObjective(board.rankTarget), financeObjective(save, team, team.budget)]
            .filter((o): o is BoardObjective => !!o)
        board.objectivesSeason = season
        return
    }
    // A new split: the league objective follows the club into its new
    // division once the old one has been judged (mid-season review) or the
    // review window has passed.
    const league = board.objectives.find(o => o.id === "league")
    const division = divisionOfTeam(save, team.id)
    const judged = !league || league.status === "MET" || league.status === "MISSED" || weekOfSeason(save.currentWeek) > LEAGUE_TUNING.SPLITS[1].drawWeek
    if (division && league?.divisionId !== division.id && judged) {
        const next = leagueObjective(save, team.id)
        if (next) board.objectives = [next, ...board.objectives.filter(o => o.id !== "league")]
    }
}

/** Live progress on each objective (UI + weekly report). */
export function refreshObjectiveProgress(save: GameSave, board: BoardState): void {
    const team = save.teams.find(t => t.id === save.playerTeamId)
    if (!team || !board.objectives) return
    for (const o of board.objectives) {
        if (o.status === "MET" || o.status === "MISSED") continue
        if (o.id === "league") {
            const division = save.league?.current?.divisions.find(d => d.id === o.divisionId)
            o.current = tablePosition(division, team.id)
            o.status = o.current !== undefined && o.current <= o.target ? "ON_TRACK" : "AT_RISK"
        } else if (o.id === "ranking") {
            o.current = team.worldRanking
            o.status = (team.worldRanking ?? 999) <= o.target ? "ON_TRACK" : "AT_RISK"
        } else {
            o.current = Math.round(team.budget)
            o.status = team.budget >= o.target ? "ON_TRACK" : "AT_RISK"
        }
    }
}

/** Initialize (or reset on a job change) the board state. Returns the state on
 *  `save.boardState`. */
export function ensureBoardState(save: GameSave): BoardState {
    const team = save.teams.find(t => t.id === save.playerTeamId)
    const reputation = team?.reputation ?? 50
    const ranking = team?.worldRanking ?? 30
    const currentSeason = getSeasonNumber(save.currentWeek)

    const existing = save.boardState
    if (!existing || existing.teamId !== save.playerTeamId) {
        const fresh: BoardState = {
            teamId: save.playerTeamId,
            confidence: NEW_BOARD_CONFIDENCE,
            seasonExpectation: deriveExpectationTier(ranking, reputation),
            expectationSetSeason: currentSeason,
            lastReviewedSeason: currentSeason - 1,
            onNotice: false,
            rankTarget: rankTargetFor(ranking, reputation),
            warnings: 0,
            history: [],
        }
        save.boardState = fresh
        ensureSeasonObjectives(save, fresh)
        return fresh
    }
    return existing
}

// ============ Weekly confidence ============

export interface BoardWeekResult {
    moves: BoardMove[]
    /** Net confidence change this week (weekly moves + reviews). */
    delta: number
    sacked: boolean
    review?: BoardReviewResult
    events: string[]
}

function pushHistory(board: BoardState, moves: BoardMove[]): void {
    if (!moves.length) return
    board.history = [...moves.filter(m => m.delta !== 0).reverse(), ...(board.history ?? [])].slice(0, BOARD_TUNING.HISTORY_LENGTH)
}

/**
 * This week's results, titles, table and finances as confidence moves (not
 * yet applied). `sinceWeek` is the week of the previous update: the managed
 * club plays week W's fixtures during week W, so the tick entering W + 1
 * counts results from week `sinceWeek` up to (not including) the current
 * week, and titles settled since the previous update.
 */
export function weeklyBoardMoves(save: GameSave, board: BoardState, sinceWeek: number): BoardMove[] {
    const team = save.teams.find(t => t.id === save.playerTeamId)
    if (!team) return []
    const week = save.currentWeek
    const moves: BoardMove[] = []
    const elo = new Map(save.teams.map(t => [t.id, t.elo ?? 1000]))
    const names = new Map(save.teams.map(t => [t.id, t.name]))

    // Results: official matches played since the last update.
    const results = save.completedMatches.filter(m => m.week >= sinceWeek && m.week < week && m.tournamentId && m.tournamentId !== "SCRIM"
        && (m.homeTeamId === team.id || m.awayTeamId === team.id) && m.result)
    let resultDelta = 0, wins = 0, losses = 0
    for (const m of results) {
        const oppId = m.homeTeamId === team.id ? m.awayTeamId : m.homeTeamId
        const gap = (elo.get(oppId) ?? 1000) - (team.elo ?? 1000)
        const won = m.result?.winnerId === team.id
        if (won) wins++; else losses++
        resultDelta += won
            ? (gap >= BOARD_TUNING.UPSET_ELO_GAP ? BOARD_TUNING.UPSET_WIN : gap <= -BOARD_TUNING.UPSET_ELO_GAP ? BOARD_TUNING.EXPECTED_WIN : BOARD_TUNING.RESULT_WIN)
            : (gap <= -BOARD_TUNING.UPSET_ELO_GAP ? BOARD_TUNING.EXPECTED_LOSS : gap >= BOARD_TUNING.UPSET_ELO_GAP ? BOARD_TUNING.UPSET_LOSS : BOARD_TUNING.RESULT_LOSS)
    }
    if (results.length === 1) {
        const m = results[0], oppId = m.homeTeamId === team.id ? m.awayTeamId : m.homeTeamId
        moves.push({ week, delta: round1(resultDelta), cause: `${wins ? "Beat" : "Lost to"} ${names.get(oppId) ?? "opponent"}` })
    } else if (results.length > 1) {
        moves.push({ week, delta: round1(resultDelta), cause: `Results: ${wins} won, ${losses} lost` })
    }

    // Titles lifted since the last update.
    for (const t of team.trophies ?? []) {
        if (t.week <= sinceWeek || t.week > week) continue
        moves.push({ week, delta: t.tier === "S_TIER" ? BOARD_TUNING.TITLE_S_TIER : BOARD_TUNING.TITLE, cause: `Won ${t.tournamentName}` })
    }

    // League table against the objective, while the split is live.
    const objective = board.objectives?.find(o => o.id === "league")
    const split = save.league?.current
    const division = split?.divisions.find(d => d.id === objective?.divisionId)
    if (objective && division && split && !division.completed && week >= split.firstWeek && playedInSplit(division, team.id) >= BOARD_TUNING.LEAGUE_MIN_PLAYED) {
        const pos = tablePosition(division, team.id) ?? division.teamIds.length
        moves.push(pos <= objective.target
            ? { week, delta: BOARD_TUNING.LEAGUE_ON_TRACK, cause: `On track: ${ordinal(pos)} in ${division.name} (target ${ordinal(objective.target)})` }
            : { week, delta: BOARD_TUNING.LEAGUE_BEHIND, cause: `Behind target: ${ordinal(pos)} in ${division.name} (target ${ordinal(objective.target)})` })
    }

    // Finances after this week's settlement.
    const state = team.financialState
    const runway = Math.round(team.runwayWeeks ?? 0)
    if (state === "RISK") moves.push({ week, delta: BOARD_TUNING.FINANCE_RISK, cause: `Finances at risk: ${runway} weeks of runway` })
    else if (state === "CRISIS") moves.push({ week, delta: BOARD_TUNING.FINANCE_CRISIS, cause: `Financial crisis: ${runway} weeks of runway` })
    else if (state === "INSOLVENT") moves.push({ week, delta: BOARD_TUNING.FINANCE_INSOLVENT, cause: "Club insolvent: the balance is below zero" })

    // Clamp the week: scale every move so the causes still add up to the total.
    const total = moves.reduce((s, m) => s + m.delta, 0)
    if (Math.abs(total) > BOARD_TUNING.WEEKLY_MAX_MOVE) {
        const f = BOARD_TUNING.WEEKLY_MAX_MOVE / Math.abs(total)
        for (const m of moves) m.delta = round1(m.delta * f)
    }
    return moves.filter(m => m.delta !== 0)
}

/**
 * The weekly board step (end of tick, after finances and matches settle):
 * objectives, weekly moves, the mid-season and season reviews, then warnings
 * and dismissal. Idempotent per week. Returns the moves for the weekly report.
 */
export function processWeeklyBoard(save: GameSave): BoardWeekResult {
    const out: BoardWeekResult = { moves: [], delta: 0, sacked: false, events: [] }
    if (save.gameOverReason) return out
    const board = ensureBoardState(save)
    if (board.teamId !== save.playerTeamId) return out
    ensureSeasonObjectives(save, board)
    if (board.lastWeeklyUpdateWeek === save.currentWeek) return out
    const since = board.lastWeeklyUpdateWeek ?? Math.max(0, save.currentWeek - 1)
    const before = board.confidence

    const moves = weeklyBoardMoves(save, board, since)
    board.confidence = clamp(round1(board.confidence + moves.reduce((s, m) => s + m.delta, 0)), 0, 100)
    board.lastWeeklyUpdateWeek = save.currentWeek
    out.moves.push(...moves)

    const wos = weekOfSeason(save.currentWeek)
    if (wos === LEAGUE_TUNING.SPLITS[1].drawWeek) {
        const review = processMidSeasonReview(save, board)
        if (review.reviewed) { out.review = review; out.moves.push(...(review.moves ?? [])) }
        // The league objective moves on to the split-2 division.
        ensureSeasonObjectives(save, board)
    }
    if (wos === 52) {
        const review = processSeasonBoardReview(save)
        if (review.reviewed) { out.review = review; out.moves.push(...(review.moves ?? [])) }
        if (review.sacked) out.sacked = true
    }
    refreshObjectiveProgress(save, board)
    pushHistory(board, out.moves)
    if (!out.sacked) out.sacked = applyConsequences(save, board, out.events)
    out.delta = round1(board.confidence - before)
    return out
}

function tenureWeeks(save: GameSave): number {
    return save.currentWeek - (save.managerDetails?.tenureStartWeek ?? 1) + 1
}

/** Warning → final warning (on notice) → dismissal; recovery clears warnings. */
function applyConsequences(save: GameSave, board: BoardState, events: string[]): boolean {
    const team = save.teams.find(t => t.id === save.playerTeamId)
    const name = team?.name ?? "the club"
    const reasons = (board.history ?? []).filter(m => m.delta < 0).slice(0, 3).map(m => m.cause.toLowerCase()).join("; ")
    const event = (id: string, title: string, message: string, severity: string) => {
        const eventId = `${id}_${save.currentWeek}_${save.playerTeamId}`
        if (save.eventsLog.some(e => e.id === eventId)) return
        save.eventsLog.unshift({ id: eventId, type: "CAREER_UPDATE", week: save.currentWeek, acknowledged: false, data: { title, message, severity, teamId: save.playerTeamId, board: true } })
        save.newsFeed.unshift({ id: `news_${eventId}`, title, content: message, week: save.currentWeek, category: "FINANCE", teamId: save.playerTeamId })
        events.push(eventId)
    }
    const warnings = board.warnings ?? (board.onNotice ? 2 : 0)
    if (warnings > 0 && board.confidence >= BOARD_TUNING.RECOVERED_AT) {
        board.warnings = 0
        board.onNotice = false
        event("board_reassured", `Board reassured at ${name}`, `Confidence is back to ${Math.round(board.confidence)}/100. The warnings are lifted.`, "success")
        return false
    }
    if (tenureWeeks(save) <= BOARD_TUNING.TENURE_GRACE_WEEKS) { board.warnings = warnings; return false }
    if (warnings === 0 && board.confidence < BOARD_TUNING.WARN_BELOW) {
        board.warnings = 1
        event("board_warning", `Board warning at ${name}`, `Board confidence has fallen to ${Math.round(board.confidence)}/100${reasons ? ` (${reasons})` : ""}. Below ${BOARD_TUNING.NOTICE_BELOW} you will be on notice; at ${BOARD_TUNING.SACK_AT_OR_BELOW} on notice you will be dismissed. Back above ${BOARD_TUNING.RECOVERED_AT} clears the warning.`, "warning")
        return false
    }
    if (warnings <= 1 && board.confidence < BOARD_TUNING.NOTICE_BELOW) {
        board.warnings = 2
        board.onNotice = true
        event("board_notice", `Final warning: you are on notice at ${name}`, `Board confidence is ${Math.round(board.confidence)}/100${reasons ? ` (${reasons})` : ""}. If it reaches ${BOARD_TUNING.SACK_AT_OR_BELOW}, the board will dismiss you. Results, the league objective and a healthy balance all count.`, "error")
        return false
    }
    board.warnings = warnings
    board.onNotice = warnings >= 2
    if (board.onNotice && board.confidence <= BOARD_TUNING.SACK_AT_OR_BELOW) {
        dismiss(save, board, `Board confidence fell to ${Math.round(board.confidence)}/100 while you were on notice${reasons ? ` (${reasons})` : ""}.`)
        return true
    }
    return false
}

function dismiss(save: GameSave, board: BoardState, why: string): void {
    const team = save.teams.find(t => t.id === save.playerTeamId)
    save.gameOverReason = "SACKED"
    save.gameOverWeek = save.currentWeek
    board.onNotice = true
    adjustManagerReputation(save, REPUTATION_DELTA.FAILED, `Dismissed by ${team?.name ?? "the club"}`)
    closeStint(save, "sacked")
    const id = `board_sacked_${save.currentWeek}_${save.playerTeamId}`
    if (!save.eventsLog.some(e => e.id === id)) {
        save.eventsLog.unshift({ id, type: "CAREER_UPDATE", week: save.currentWeek, acknowledged: false,
            data: { title: `Sacked by ${team?.name ?? "the club"}`, message: `${why} Other clubs have been in touch: review their offers to continue your career.`, severity: "error", teamId: save.playerTeamId, board: true } })
    }
}

// ============ Reviews ============

function leagueResultFor(save: GameSave, divisionId: string | undefined, teamId: string): { position: number; size: number; name: string } | undefined {
    if (!divisionId) return undefined
    const live = save.league?.current?.divisions.find(d => d.id === divisionId)
    if (live) {
        const pos = tablePosition(live, teamId)
        return pos ? { position: pos, size: live.teamIds.length, name: live.name } : undefined
    }
    for (const summary of save.league?.history ?? []) {
        const d = summary.divisions.find(x => x.id === divisionId)
        if (!d) continue
        const pos = d.table.findIndex(row => row[0] === teamId)
        return pos >= 0 ? { position: pos + 1, size: d.table.length, name: d.name } : undefined
    }
    return undefined
}

function judgeLeague(save: GameSave, board: BoardState, week: number): BoardMove | undefined {
    const objective = board.objectives?.find(o => o.id === "league")
    const result = leagueResultFor(save, objective?.divisionId, save.playerTeamId)
    if (!objective || !result) return undefined
    const { position, name } = result
    let delta: number
    if (position <= Math.max(1, objective.target - 2) || position === 1) delta = BOARD_TUNING.REVIEW_LEAGUE_EXCEEDED
    else if (position <= objective.target) delta = BOARD_TUNING.REVIEW_LEAGUE_MET
    else if (position <= objective.target + 2) delta = BOARD_TUNING.REVIEW_LEAGUE_MISSED
    else delta = BOARD_TUNING.REVIEW_LEAGUE_FAILED
    objective.current = position
    objective.status = position <= objective.target ? "MET" : "MISSED"
    return { week, delta, cause: `League objective ${position <= objective.target ? "met" : "missed"}: ${ordinal(position)} in ${name} (target ${ordinal(objective.target)})` }
}

function judgeFinance(save: GameSave, board: BoardState, week: number, interim: boolean): BoardMove | undefined {
    const objective = board.objectives?.find(o => o.id === "finance")
    const team = save.teams.find(t => t.id === save.playerTeamId)
    if (!objective || !team) return undefined
    const ok = team.budget >= objective.target
    if (!interim) { objective.current = Math.round(team.budget); objective.status = ok ? "MET" : "MISSED" }
    const scale = interim ? 0.5 : 1
    return { week, delta: Math.round((ok ? BOARD_TUNING.REVIEW_FINANCE_MET : BOARD_TUNING.REVIEW_FINANCE_MISSED) * scale), cause: `Budget discipline ${ok ? "on track" : "missed"}: ${money(team.budget)} in the bank (target ${money(objective.target)})` }
}

/** Mid-season review (after split 1): the league objective and an interim finance check. */
export function processMidSeasonReview(save: GameSave, board: BoardState): BoardReviewResult {
    const week = save.currentWeek
    if (board.lastReview?.week === week) return { reviewed: false }
    const team = save.teams.find(t => t.id === save.playerTeamId)
    if (!team || tenureWeeks(save) <= BOARD_TUNING.TENURE_GRACE_WEEKS) return { reviewed: false }
    const moves = [judgeLeague(save, board, week), judgeFinance(save, board, week, true)].filter((m): m is BoardMove => !!m)
    if (!moves.length) return { reviewed: false }
    const delta = moves.reduce((s, m) => s + m.delta, 0)
    board.confidence = clamp(round1(board.confidence + delta), 0, 100)
    const summary = moves.map(m => m.cause).join(". ")
    board.lastReview = { week, kind: "MID_SEASON", delta, confidence: board.confidence, summary }
    const title = delta >= 0 ? `Mid-season review: board satisfied at ${team.name}` : `Mid-season review: board concerned at ${team.name}`
    save.newsFeed.unshift({ id: `board_midseason_w${week}_${team.id}`, title, content: `${summary}. Confidence ${delta >= 0 ? "+" : ""}${delta} → ${Math.round(board.confidence)}/100.`, week, category: "FINANCE", teamId: team.id })
    return { reviewed: true, confidence: board.confidence, confidenceDelta: delta, newsTitle: title, moves }
}

/**
 * Season-end board review. Mutates `save.boardState`, the manager's reputation,
 * (optionally) credits a capped board-backing bonus, and can dismiss a manager
 * who is on notice. Idempotent per season.
 */
export function processSeasonBoardReview(save: GameSave): BoardReviewResult {
    const seasonNumber = getSeasonNumber(save.currentWeek)
    const board = ensureBoardState(save)

    // Already reviewed this season, or the expectation belongs to a future
    // season (fresh board mid-season) → nothing to judge yet.
    if (board.lastReviewedSeason >= seasonNumber) return { reviewed: false }
    if (board.expectationSetSeason > seasonNumber) {
        board.lastReviewedSeason = seasonNumber
        return { reviewed: false }
    }

    const team = save.teams.find(t => t.id === save.playerTeamId)
    const endRank = team?.worldRanking ?? 30
    const trophies = trophiesInSeason(save, seasonNumber)
    const tier = board.seasonExpectation
    if (save.managerDetails?.tenureStartWeek && save.currentWeek - save.managerDetails.tenureStartWeek + 1 < 13) {
        board.lastReviewedSeason = seasonNumber
        board.expectationSetSeason = seasonNumber + 1
        return { reviewed: true, tier, confidence: board.confidence, confidenceDelta: 0, newsTitle: `Board gives ${team?.name ?? 'the club'} time`, newsContent: 'You have managed fewer than 13 weeks. The board will judge a full campaign next season; no reward or penalty applies.' }
    }
    const reviewedTarget = board.rankTarget ?? TIER_TARGETS[tier].rankTarget
    const outcome = evaluateOutcome(tier, endRank, trophies, reviewedTarget)
    const week = save.currentWeek

    // Ranking objective; league (split 2) and finance objectives when set.
    const rankingMove: BoardMove = {
        week,
        delta: outcome === "EXCEEDED" ? BOARD_TUNING.REVIEW_RANK_EXCEEDED : outcome === "MET" ? BOARD_TUNING.REVIEW_RANK_MET : outcome === "MISSED" ? BOARD_TUNING.REVIEW_RANK_MISSED : BOARD_TUNING.REVIEW_RANK_FAILED,
        cause: `Season ranking ${outcome === "EXCEEDED" || outcome === "MET" ? "met" : "missed"}: #${endRank}${trophies ? `, ${trophies} trophies` : ""} (target #${reviewedTarget})`,
    }
    const ranking = board.objectives?.find(o => o.id === "ranking")
    if (ranking) { ranking.current = endRank; ranking.status = outcome === "EXCEEDED" || outcome === "MET" ? "MET" : "MISSED" }
    const moves = board.objectives?.length
        ? [judgeLeague(save, board, week), rankingMove, judgeFinance(save, board, week, false)].filter((m): m is BoardMove => !!m)
        : [{ ...rankingMove, delta: CONFIDENCE_DELTA[outcome] }]
    const delta = moves.reduce((s, m) => s + m.delta, 0)

    const wasOnNotice = board.onNotice
    board.confidence = clamp(round1(board.confidence + delta), 0, 100)
    const verdict = reviewVerdict(delta)

    // Manager reputation drifts with results.
    adjustManagerReputation(save, REPUTATION_DELTA[verdict], seasonReviewCause(seasonNumber, verdict))

    // Capped, upside-only board backing for over-delivering.
    let rewardBudget = 0
    if (team) {
        if (verdict === "EXCEEDED") rewardBudget = Math.min(500_000, Math.max(0, Math.round((team.budget || 0) * 0.06)))
        else if (verdict === "MET") rewardBudget = Math.min(250_000, Math.max(0, Math.round((team.budget || 0) * 0.03)))
        if (rewardBudget > 0 && !save.financeLedger.some(e => e.id === `board_backing_s${seasonNumber}_${team.id}`)) {
            team.budget = (team.budget || 0) + rewardBudget
            save.financeLedger.push({
                id: `board_backing_s${seasonNumber}_${team.id}`,
                week: save.currentWeek,
                teamId: team.id,
                type: "INCOME",
                category: "OTHER",
                amount: rewardBudget,
                description: `Board backing — ${verdict === "EXCEEDED" ? "exceptional" : "successful"} season`,
                balance: team.budget,
            })
        }
    }

    // Dismissal at the review: on notice going in and the meter at the sack line.
    const sacked = wasOnNotice && board.confidence <= BOARD_TUNING.SACK_AT_OR_BELOW
    if (sacked) {
        dismiss(save, board, `The season review left board confidence at ${Math.round(board.confidence)}/100 after a final warning.`)
    } else {
        // Next season's expectation from current stature (objectives follow at the next draw).
        board.seasonExpectation = deriveExpectationTier(endRank, team?.reputation ?? 50)
        board.expectationSetSeason = seasonNumber + 1
        board.rankTarget = rankTargetFor(endRank, team?.reputation ?? 50)
    }
    board.lastReviewedSeason = seasonNumber
    board.lastReview = { week, kind: "SEASON", delta, confidence: board.confidence, summary: moves.map(m => m.cause).join(". ") }

    const { title, content } = buildReviewNarrative(team?.name ?? "the club", verdict, board.confidence, sacked, board.onNotice)
    const newsContent = `${content} ${moves.map(m => `${m.cause} (${m.delta >= 0 ? "+" : ""}${m.delta})`).join(". ")}.`
    save.newsFeed.unshift({
        id: `board_review_s${seasonNumber}_${save.playerTeamId}`,
        title,
        content: newsContent,
        week: save.currentWeek,
        category: "FINANCE",
        teamId: save.playerTeamId,
    })

    return {
        reviewed: true,
        outcome: verdict, tier,
        confidence: board.confidence,
        confidenceDelta: delta,
        sacked,
        onNotice: board.onNotice,
        endRank, trophies,
        rewardBudget,
        newsTitle: title,
        newsContent,
        moves,
    }
}

function buildReviewNarrative(
    teamName: string, outcome: BoardOutcome, confidence: number, sacked: boolean, onNotice: boolean,
): { title: string; content: string } {
    const c = Math.round(confidence)
    if (sacked) {
        return {
            title: `Sacked by ${teamName}`,
            content: `After a final warning, the board of ${teamName} has terminated your contract. Other clubs have been in touch.`,
        }
    }
    const base: Record<BoardOutcome, { title: string; content: string }> = {
        EXCEEDED: {
            title: `Board delighted with ${teamName}`,
            content: `You blew past the board's targets. Confidence in your leadership is soaring (${c}/100), and they've backed you to push on.`,
        },
        MET: {
            title: `Board satisfied at ${teamName}`,
            content: `You delivered on the board's expectations. They remain confident in your project (${c}/100).`,
        },
        MISSED: {
            title: `Board concerned at ${teamName}`,
            content: `The season fell short of the board's targets. Confidence has slipped to ${c}/100${onNotice ? " — you are on notice." : "."}`,
        },
        FAILED: {
            title: `Board furious with ${teamName}`,
            content: `A season well below expectations. The board's confidence has crashed to ${c}/100${onNotice ? " — you are on notice and must deliver next season." : "."}`,
        },
    }
    return base[outcome]
}
