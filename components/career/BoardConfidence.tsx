"use client"

import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import type { BoardState } from "@/engine/save-types"
import { BOARD_TUNING } from "@/lib/balance-tuning"
import { cn } from "@/lib/utils"
import { boardStatus, type BoardTone } from "./board-view"

export const BOARD_TONE_TEXT: Record<BoardTone, string> = {
    positive: "text-positive",
    neutral: "text-ink-2",
    caution: "text-caution",
    negative: "text-negative",
}

const BOARD_TONE_CHIP: Record<BoardTone, string> = {
    positive: "border-positive/40 text-positive",
    neutral: "border-line-strong text-ink-2",
    caution: "border-caution/50 text-caution",
    negative: "border-negative/50 bg-negative/10 text-negative",
}

/**
 * The confidence scale with the consequence lines drawn on it: dismissal
 * (10, on notice), notice (25), warning (40) and recovery (50).
 */
export function BoardConfidenceScale({ value, className }: { value: number; className?: string }) {
    const c = Math.max(0, Math.min(100, Math.round(value)))
    const { SACK_AT_OR_BELOW: sack, NOTICE_BELOW: notice, WARN_BELOW: warn, RECOVERED_AT: recovered } = BOARD_TUNING
    const bands = [
        { from: 0, to: sack, className: "bg-negative/45" },
        { from: sack, to: notice, className: "bg-negative/25" },
        { from: notice, to: warn, className: "bg-caution/25" },
        { from: warn, to: recovered, className: "bg-hover" },
        { from: recovered, to: 100, className: "bg-positive/20" },
    ]
    const ticks = [
        { at: sack, label: "Dismissal" },
        { at: notice, label: "Notice" },
        { at: warn, label: "Warning" },
        { at: recovered, label: "Recovery" },
    ]
    return (
        <div className={cn("pb-5", className)}>
            <div
                role="meter"
                aria-label="Board confidence"
                aria-valuenow={c}
                aria-valuemin={0}
                aria-valuemax={100}
                className="relative h-2.5"
            >
                <div className="absolute inset-0 flex overflow-hidden rounded-full">
                    {bands.map(b => <div key={b.from} className={b.className} style={{ width: `${b.to - b.from}%` }} />)}
                </div>
                {ticks.map(t => (
                    <span key={t.at} aria-hidden="true" className="absolute top-0 h-2.5 w-px bg-line-strong" style={{ left: `${t.at}%` }} />
                ))}
                <span aria-hidden="true" className="absolute -top-1 h-[18px] w-1 -translate-x-1/2 rounded-full bg-ink-1 shadow-[0_0_0_2px_#12161C]" style={{ left: `${c}%` }} />
                {ticks.map(t => (
                    <span key={`l${t.at}`} aria-hidden="true" className="absolute top-4 -translate-x-1/2 whitespace-nowrap text-[10px] tabular-nums text-ink-3" style={{ left: `${t.at}%` }}>
                        {t.at}
                    </span>
                ))}
            </div>
        </div>
    )
}

/** Home's board chip: confidence and standing, linking to Club → Board. */
export function BoardConfidenceChip({ board, graceLeft = 0, className }: { board: BoardState | undefined; graceLeft?: number; className?: string }) {
    const status = boardStatus(board, graceLeft)
    const value = Math.round(board?.confidence ?? BOARD_TUNING.NEW_BOARD_CONFIDENCE)
    const alarm = status.standing === "notice" || status.standing === "warning"
    return (
        <Link
            href="/career/board"
            title={`Board confidence ${value}/100 · ${status.label}. ${status.detail}`}
            className={cn("inline-flex h-7 items-center gap-1.5 rounded-sm border px-2 text-xs font-semibold transition-colors hover:bg-raised", BOARD_TONE_CHIP[status.tone], className)}
        >
            {alarm && <AlertTriangle size={12} aria-hidden="true" />}
            <span className="text-ink-3">Board</span>
            <span className="tabular-nums text-ink-1">{value}</span>
            <span>{status.label}</span>
        </Link>
    )
}
