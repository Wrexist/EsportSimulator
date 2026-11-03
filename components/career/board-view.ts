/**
 * Read-only view helpers for the board (Phase 4.7): standing labels with the
 * engine's real thresholds, objective progress text and the confidence
 * trail. The rules live in engine/board-expectations.ts and BOARD_TUNING;
 * these helpers only describe them.
 */

import type { BoardMove, BoardObjective, BoardState } from "@/engine/save-types"
import { BOARD_TUNING } from "@/lib/balance-tuning"
import { formatCurrency } from "@/lib/utils-extended"
import { ordinalLabel, t, tn } from "@/lib/i18n"
import { divisionName } from "@/lib/display-names"

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
        return { standing: "secure", label: t("board.status.new"), tone: "neutral", detail: t("board.status.newDetail") }
    }
    const c = Math.round(board.confidence)
    const warnings = board.warnings ?? (board.onNotice ? 2 : 0)
    if (board.onNotice || warnings >= 2) {
        return {
            standing: "notice", label: t("board.status.notice"), tone: "negative",
            detail: t("board.status.noticeDetail", { sack: SACK_AT_OR_BELOW, recovered: RECOVERED_AT }),
        }
    }
    if (warnings === 1) {
        return {
            standing: "warning", label: t("board.status.warning"), tone: "caution",
            detail: t("board.status.warningDetail", { notice: NOTICE_BELOW, recovered: RECOVERED_AT }),
        }
    }
    if (c < WARN_BELOW) {
        return {
            standing: "pressure", label: t("board.status.pressure"), tone: "caution",
            detail: graceLeft > 0
                ? t("board.status.pressureGrace", { warn: WARN_BELOW, weeks: BOARD_TUNING.TENURE_GRACE_WEEKS, left: graceLeft })
                : t("board.status.pressureDetail", { warn: WARN_BELOW }),
        }
    }
    if (c < RECOVERED_AT) {
        return { standing: "uneasy", label: t("board.status.uneasy"), tone: "neutral", detail: t("board.status.uneasyDetail", { warn: WARN_BELOW }) }
    }
    return { standing: "secure", label: t("board.status.secure"), tone: "positive", detail: t("board.status.secureDetail", { warn: WARN_BELOW }) }
}

/** The consequence ladder, top to bottom, for the confidence scale. */
export const boardThresholds = (): Array<{ id: "recovery" | "warning" | "notice" | "dismissal"; at: number; label: string; rule: string }> => [
    { id: "recovery", at: BOARD_TUNING.RECOVERED_AT, label: t("board.tick.recovery"), rule: t("board.rule.recovery", { n: BOARD_TUNING.RECOVERED_AT }) },
    { id: "warning", at: BOARD_TUNING.WARN_BELOW, label: t("board.tick.warning"), rule: t("board.rule.warning", { n: BOARD_TUNING.WARN_BELOW }) },
    { id: "notice", at: BOARD_TUNING.NOTICE_BELOW, label: t("board.status.notice"), rule: t("board.rule.notice", { n: BOARD_TUNING.NOTICE_BELOW }) },
    { id: "dismissal", at: BOARD_TUNING.SACK_AT_OR_BELOW, label: t("board.tick.dismissal"), rule: t("board.rule.dismissal", { n: BOARD_TUNING.SACK_AT_OR_BELOW }) },
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

const STATUS: Record<NonNullable<BoardObjective["status"]>, BoardTone> = {
    ON_TRACK: "positive",
    AT_RISK: "caution",
    MET: "positive",
    MISSED: "negative",
}

const places = (n: number) => tn("board.places", n)
const trophies = (n: number) => tn("board.trophies", n)

/** The objective as the engine wrote it (English, stored in the save), in the active language. */
export function objectiveLabel(o: Pick<BoardObjective, "id" | "label" | "target">): string {
    const l = o.label ?? ""
    let m: RegExpMatchArray | null
    if (o.id === "league") {
        if ((m = l.match(/^Win promotion from (.+) \(top (\d+)\)$/))) return t("brd.obj.promotion", { division: divisionName(m[1]), n: Number(m[2]) })
        if ((m = l.match(/^Avoid relegation from (.+) \((\d+)\w* or better\)$/))) return t("brd.obj.avoid", { division: divisionName(m[1]), position: ordinalLabel(Number(m[2])) })
        if ((m = l.match(/^Finish (\d+)\w* or better in (.+)$/))) return t("brd.obj.finish", { position: ordinalLabel(Number(m[1])), division: divisionName(m[2]) })
        if ((m = l.match(/^Win (.+)$/))) return t("brd.obj.winDivision", { division: divisionName(m[1]) })
    }
    if (o.id === "ranking") return t("brd.obj.ranking", { rank: o.target })
    if (o.id === "finance") return t("brd.obj.finance", { amount: formatCurrency(o.target) })
    if (o.id === "trophies") return tn("brd.obj.trophies", o.target)
    return l
}

export function objectiveView(o: BoardObjective): ObjectiveView {
    const status = o.status ? { label: t(`board.objective.${o.status}`), tone: STATUS[o.status] } : { label: t("board.objective.notStarted"), tone: "neutral" as BoardTone }
    const cur = o.current
    if (o.id === "league") {
        return {
            id: o.id, label: objectiveLabel(o), target: t("board.orBetter", { value: ordinalLabel(o.target) }),
            current: cur === undefined ? "—" : ordinalLabel(cur),
            gap: cur === undefined ? null : cur > o.target ? t("board.gap.makeUp", { places: places(cur - o.target) }) : cur < o.target ? t("board.gap.spare", { places: places(o.target - cur) }) : t("board.gap.onLine"),
            status: status.label, tone: status.tone,
        }
    }
    if (o.id === "ranking") {
        return {
            id: o.id, label: objectiveLabel(o), target: t("board.orBetter", { value: `#${o.target}` }),
            current: cur === undefined ? "—" : `#${cur}`,
            gap: cur === undefined ? null : cur > o.target ? t("board.gap.climb", { places: places(cur - o.target) }) : cur < o.target ? t("board.gap.spare", { places: places(o.target - cur) }) : t("board.gap.onLine"),
            status: status.label, tone: status.tone,
        }
    }
    if (o.id === "trophies") {
        return {
            id: o.id, label: objectiveLabel(o), target: trophies(o.target),
            current: cur === undefined ? "—" : `${cur}`,
            gap: cur === undefined ? null : cur < o.target ? t("board.gap.toWin", { trophies: trophies(o.target - cur) }) : t("board.gap.done"),
            status: status.label, tone: status.tone,
        }
    }
    return {
        id: o.id, label: objectiveLabel(o), target: t("board.orMore", { value: formatCurrency(o.target) }),
        current: cur === undefined ? "—" : formatCurrency(cur),
        gap: cur === undefined ? null : cur < o.target ? t("board.gap.short", { value: formatCurrency(o.target - cur) }) : t("board.gap.above", { value: formatCurrency(cur - o.target) }),
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
