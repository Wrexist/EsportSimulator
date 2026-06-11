/**
 * Board Expectations & Confidence
 * ================================
 * Gives the season real stakes. At every season boundary the board judges the
 * campaign against an expectation tier derived from the club's stature, moves a
 * confidence meter, and — only after a telegraphed warning — can sack the
 * manager (a second game-over path alongside insolvency).
 *
 * Design guardrails (this should add tension, never feel cheap):
 *  - New boards start at a comfortable confidence (NEW_BOARD_CONFIDENCE).
 *  - Confidence deltas are gentle; one poor season never sacks a healthy board.
 *  - Sacking requires being "on notice" going INTO the review AND bottoming the
 *    meter — i.e. sustained failure, with a clear warning the season before.
 *  - Rewards are upside-only and capped, so the economy can't spiral.
 *
 * Everything here is deterministic and side-effect free except the single
 * orchestrator `processSeasonBoardReview`, which mutates `save` at season end.
 */

import type { GameSave, BoardState, BoardExpectationTier } from "./save-types"
import { getSeasonNumber } from "./career-stats"

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
}

const NEW_BOARD_CONFIDENCE = 60
const DANGER_LINE = 25 // below this after a review → on notice

const CONFIDENCE_DELTA: Record<BoardOutcome, number> = {
    EXCEEDED: 22,
    MET: 10,
    MISSED: -14,
    FAILED: -28,
}

const REPUTATION_DELTA: Record<BoardOutcome, number> = {
    EXCEEDED: 6,
    MET: 2,
    MISSED: -3,
    FAILED: -6,
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

/** Judge a finished season against its expectation tier. Forgiving bands: a
 *  near-miss is MISSED (recoverable), only a heavy underperformance is FAILED. */
export function evaluateOutcome(tier: BoardExpectationTier, endRank: number, trophies: number): BoardOutcome {
    const t = TIER_TARGETS[tier]
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
    const start = (seasonNumber - 1) * 52 + 1
    const end = seasonNumber * 52
    const team = save.teams.find(t => t.id === save.playerTeamId)
    if (!team?.trophies) return 0
    return team.trophies.filter(tr => tr.week >= start && tr.week <= end).length
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
        }
        save.boardState = fresh
        return fresh
    }
    return existing
}

// ============ Mid-season pulses ============
// Quarterly check-ins (weeks 13/26/39 of each season) so confidence — and the
// war-chest tier it drives — moves with form instead of freezing for 52 weeks.
// Pulses are gentle relative to the season verdict (±28) and NEVER sack: the
// sack stays a season-end decision so it remains telegraphed a season ahead.

const PULSE_WEEKS = new Set([13, 26, 39])
const PULSE_MIN_MATCHES = 3
const PULSE_WINDOW = 8

export interface BoardPulseResult {
    pulsed: boolean
    delta?: number
    confidence?: number
    winRate?: number
    newsTitle?: string
    newsContent?: string
}

export function isPulseWeek(week: number): boolean {
    return PULSE_WEEKS.has(((week - 1) % 52) + 1)
}

/** Quarterly confidence nudge from recent form. Idempotent per week. */
export function processMidSeasonBoardPulse(save: GameSave): BoardPulseResult {
    if (!isPulseWeek(save.currentWeek)) return { pulsed: false }
    const board = save.boardState
    if (!board || board.teamId !== save.playerTeamId) return { pulsed: false }
    if (board.lastPulseWeek === save.currentWeek) return { pulsed: false }

    const team = save.teams.find(t => t.id === save.playerTeamId)
    if (!team) return { pulsed: false }

    // Recent form: last PULSE_WINDOW player matches this season.
    const seasonStart = Math.floor((save.currentWeek - 1) / 52) * 52 + 1
    const recent = save.completedMatches
        .filter(m => (m.homeTeamId === team.id || m.awayTeamId === team.id) && m.week >= seasonStart)
        .sort((a, b) => b.week - a.week)
        .slice(0, PULSE_WINDOW)
    // Too few games to judge — boards don't react to nothing.
    if (recent.length < PULSE_MIN_MATCHES) {
        board.lastPulseWeek = save.currentWeek
        return { pulsed: false }
    }

    const wins = recent.filter(m => m.result?.winnerId === team.id).length
    const winRate = wins / recent.length
    const delta = winRate >= 0.65 ? 4 : winRate >= 0.45 ? 1 : winRate >= 0.25 ? -3 : -6
    board.confidence = clamp(board.confidence + delta, 0, 100)
    board.lastPulseWeek = save.currentWeek

    const pct = Math.round(winRate * 100)
    const title = delta > 1 ? `Board pleased with ${team.name}'s form`
        : delta > 0 ? `Board steady on ${team.name}`
        : delta > -5 ? `Board uneasy about ${team.name}'s form`
        : `Board alarmed by ${team.name}'s slump`
    const warning = board.confidence < 25
        ? " The message is blunt: deliver results before the season review, or face one."
        : ""
    return {
        pulsed: true,
        delta,
        confidence: board.confidence,
        winRate,
        newsTitle: title,
        newsContent: `Quarterly check-in: ${wins}/${recent.length} recent wins (${pct}%). Board confidence ${delta >= 0 ? "+" : ""}${delta} → ${board.confidence}/100.${warning}`,
    }
}

/**
 * Season-end board review. Mutates `save.boardState`, the manager's reputation,
 * (optionally) credits a capped board-backing bonus, and on a sustained failure
 * sets `save.gameOverReason = "SACKED"`. Idempotent per season.
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
    const outcome = evaluateOutcome(tier, endRank, trophies)

    const wasOnNotice = board.onNotice
    const delta = CONFIDENCE_DELTA[outcome]
    board.confidence = clamp(board.confidence + delta, 0, 100)

    // Manager reputation drifts with results.
    if (save.managerDetails) {
        save.managerDetails.reputation = clamp((save.managerDetails.reputation ?? 50) + REPUTATION_DELTA[outcome], 0, 100)
    }

    // Capped, upside-only board backing for over-delivering.
    let rewardBudget = 0
    if (team) {
        if (outcome === "EXCEEDED") rewardBudget = Math.min(500_000, Math.round((team.budget || 0) * 0.06))
        else if (outcome === "MET") rewardBudget = Math.min(250_000, Math.round((team.budget || 0) * 0.03))
        if (rewardBudget > 0) {
            team.budget = (team.budget || 0) + rewardBudget
            save.financeLedger.push({
                id: `board_backing_s${seasonNumber}_${team.id}`,
                week: save.currentWeek,
                teamId: team.id,
                type: "INCOME",
                category: "OTHER",
                amount: rewardBudget,
                description: `Board backing — ${outcome === "EXCEEDED" ? "exceptional" : "successful"} season`,
                balance: team.budget,
            })
        }
    }

    // Sacking: only when already on notice AND the meter bottoms out.
    const sacked = board.confidence <= 0 && wasOnNotice
    board.onNotice = !sacked && board.confidence < DANGER_LINE

    if (sacked) {
        save.gameOverReason = "SACKED"
        save.gameOverWeek = save.currentWeek
    } else {
        // Set next season's expectation from current stature.
        board.seasonExpectation = deriveExpectationTier(endRank, team?.reputation ?? 50)
        board.expectationSetSeason = seasonNumber + 1
    }
    board.lastReviewedSeason = seasonNumber

    const { title, content } = buildReviewNarrative(team?.name ?? "the club", outcome, board.confidence, sacked, board.onNotice)

    return {
        reviewed: true,
        outcome, tier,
        confidence: board.confidence,
        confidenceDelta: delta,
        sacked,
        onNotice: board.onNotice,
        endRank, trophies,
        rewardBudget,
        newsTitle: title,
        newsContent: content,
    }
}

function buildReviewNarrative(
    teamName: string, outcome: BoardOutcome, confidence: number, sacked: boolean, onNotice: boolean,
): { title: string; content: string } {
    if (sacked) {
        return {
            title: `Sacked by ${teamName}`,
            content: `After a second straight season below expectations, the board of ${teamName} has terminated your contract. Your tenure is over.`,
        }
    }
    const base: Record<BoardOutcome, { title: string; content: string }> = {
        EXCEEDED: {
            title: `Board delighted with ${teamName}`,
            content: `You blew past the board's targets. Confidence in your leadership is soaring (${confidence}/100), and they've backed you to push on.`,
        },
        MET: {
            title: `Board satisfied at ${teamName}`,
            content: `You delivered on the board's expectations. They remain confident in your project (${confidence}/100).`,
        },
        MISSED: {
            title: `Board concerned at ${teamName}`,
            content: `The season fell short of the board's targets. Confidence has slipped to ${confidence}/100${onNotice ? " — you are now on notice." : "."}`,
        },
        FAILED: {
            title: `Board furious with ${teamName}`,
            content: `A season well below expectations. The board's confidence has crashed to ${confidence}/100${onNotice ? " — you are on notice and must deliver next season." : "."}`,
        },
    }
    return base[outcome]
}
