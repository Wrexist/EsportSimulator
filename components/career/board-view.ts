/**
 * Read-only view helpers for the board (Phase 4.7): standing labels with the
 * engine's real thresholds, objective progress text and the confidence
 * trail. The rules live in engine/board-expectations.ts and BOARD_TUNING;
 * these helpers only describe them.
 */

import type { BoardMove, BoardObjective, BoardState } from "@/engine/save-types"
import { ordinal } from "@/engine/season/regional-league"
import { BOARD_TUNING } from "@/lib/balance-tuning"
import { formatCurrency } from "@/lib/utils-extended"

export type BoardTone = "positive" | "neutral" | "caution" | "negative"
export type BoardStanding = "secure" | "uneasy" | "pressure" | "warning" | "notice"

export interface BoardStatus {
    standing: BoardStanding
    label: string
    tone: BoardTone
    /** What the state means and what changes it, with the real thresholds. */
    detail: string
}

type BoardLike = Pick<BoardState, "confidence" | "onNotice" | "warnings">

/** Weeks of the tenure grace period still to run (no warnings or dismissal during it). */
export function graceWeeksLeft(currentWeek: number, tenureStartWeek: number | undefined): number {
    const tenure = currentWeek - (tenureStartWeek ?? 1) + 1
    return Math.max(0, BOARD_TUNING.TENURE_GRACE_WEEKS - tenure + 1)
}

/**
 * The manager's standing with the board. Warning, on notice and dismissal
 * follow applyConsequences(): a warning below WARN_BELOW, a final warning
 * (on notice) below NOTICE_BELOW, dismissal at SACK_AT_OR_BELOW while on
 * notice; back to RECOVERED_AT clears every warning.
 */
export function boardStatus(board: BoardLike | undefined, graceLeft = 0): BoardStatus {
    const { WARN_BELOW, NOTICE_BELOW, SACK_AT_OR_BELOW, RECOVERED_AT } = BOARD_TUNING
    if (!board) {
        return { standing: "secure", label: "New board", tone: "neutral", detail: "The board sets its objectives after the first week." }
    }
    const c = Math.round(board.confidence)
    const warnings = board.warnings ?? (board.onNotice ? 2 : 0)
    if (board.onNotice || warnings >= 2) {
        return {
            standing: "notice", label: "On notice", tone: "negative",
            detail: `Final warning. If confidence reaches ${SACK_AT_OR_BELOW} the board dismisses you. Back to ${RECOVERED_AT} lifts the notice.`,
        }
    }
    if (warnings === 1) {
        return {
            standing: "warning", label: "Warning", tone: "caution",
            detail: `Below ${NOTICE_BELOW} you go on notice. Back to ${RECOVERED_AT} clears the warning.`,
        }
    }
    if (c < WARN_BELOW) {
        return {
            standing: "pressure", label: "Under pressure", tone: "caution",
            detail: graceLeft > 0
                ? `Below ${WARN_BELOW}, but no warnings in the first ${BOARD_TUNING.TENURE_GRACE_WEEKS} weeks of a job (${graceLeft} left).`
                : `Below ${WARN_BELOW}: the next weekly update brings a formal warning.`,
        }
    }
    if (c < RECOVERED_AT) {
        return { standing: "uneasy", label: "Uneasy", tone: "neutral", detail: `A warning comes below ${WARN_BELOW}.` }
    }
    return { standing: "secure", label: "Secure", tone: "positive", detail: `No action while confidence stays at ${WARN_BELOW} or above.` }
}

/** The consequence ladder, top to bottom, for the confidence scale. */
export const BOARD_THRESHOLDS: Array<{ at: number; label: string; rule: string }> = [
    { at: BOARD_TUNING.RECOVERED_AT, label: "Recovery", rule: `Back to ${BOARD_TUNING.RECOVERED_AT} clears warnings and notice` },
    { at: BOARD_TUNING.WARN_BELOW, label: "Warning", rule: `Below ${BOARD_TUNING.WARN_BELOW}: a formal warning` },
    { at: BOARD_TUNING.NOTICE_BELOW, label: "On notice", rule: `Below ${BOARD_TUNING.NOTICE_BELOW} after a warning: on notice (final warning)` },
    { at: BOARD_TUNING.SACK_AT_OR_BELOW, label: "Dismissal", rule: `${BOARD_TUNING.SACK_AT_OR_BELOW} or lower while on notice: dismissed` },
]

// ---------------------------------------------------------------- objectives

export interface ObjectiveView {
    id: BoardObjective["id"]
    label: string
    target: string
    current: string
    /** Distance to the target in words, e.g. "2 places to make up". */
    gap: string | null
    status: string
    tone: BoardTone
}

const STATUS: Record<NonNullable<BoardObjective["status"]>, { label: string; tone: BoardTone }> = {
    ON_TRACK: { label: "On track", tone: "positive" },
    AT_RISK: { label: "At risk", tone: "caution" },
    MET: { label: "Met", tone: "positive" },
    MISSED: { label: "Missed", tone: "negative" },
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

export function objectiveView(o: BoardObjective): ObjectiveView {
    const status = o.status ? STATUS[o.status] : { label: "Not started", tone: "neutral" as BoardTone }
    const cur = o.current
    if (o.id === "league") {
        return {
            id: o.id, label: o.label, target: `${ordinal(o.target)} or better`,
            current: cur === undefined ? "—" : ordinal(cur),
            gap: cur === undefined ? null : cur > o.target ? `${plural(cur - o.target, "place")} to make up` : cur < o.target ? `${plural(o.target - cur, "place")} to spare` : "On the line",
            status: status.label, tone: status.tone,
        }
    }
    if (o.id === "ranking") {
        return {
            id: o.id, label: o.label, target: `#${o.target} or better`,
            current: cur === undefined ? "—" : `#${cur}`,
            gap: cur === undefined ? null : cur > o.target ? `${plural(cur - o.target, "place")} to climb` : cur < o.target ? `${plural(o.target - cur, "place")} to spare` : "On the line",
            status: status.label, tone: status.tone,
        }
    }
    return {
        id: o.id, label: o.label, target: `${formatCurrency(o.target)} or more`,
        current: cur === undefined ? "—" : formatCurrency(cur),
        gap: cur === undefined ? null : cur < o.target ? `${formatCurrency(o.target - cur)} short` : `${formatCurrency(cur - o.target)} above`,
        status: status.label, tone: status.tone,
    }
}

// ---------------------------------------------------------------- history

export interface BoardWeek {
    week: number
    total: number
    moves: BoardMove[]
}

/** Recorded moves grouped by week, newest first (history is stored newest first). */
export function boardWeeks(history: BoardMove[] | undefined): BoardWeek[] {
    const weeks: BoardWeek[] = []
    for (const move of history ?? []) {
        const last = weeks[weeks.length - 1]
        if (last && last.week === move.week) { last.moves.push(move); last.total = round1(last.total + move.delta) }
        else weeks.push({ week: move.week, total: round1(move.delta), moves: [move] })
    }
    return weeks
}

/** Confidence after each recorded week, oldest → newest, ending at the current value. */
export function confidenceTrail(confidence: number, history: BoardMove[] | undefined): number[] {
    const weeks = boardWeeks(history)
    const values = [confidence]
    let c = confidence
    for (const w of weeks) {
        c = Math.max(0, Math.min(100, c - w.total))
        values.push(c)
    }
    return values.reverse().map(round1)
}

function round1(n: number): number {
    return Math.round(n * 10) / 10
}

export function signedDelta(n: number): string {
    const r = round1(n)
    return r > 0 ? `+${r}` : r < 0 ? `−${Math.abs(r)}` : "0"
}
