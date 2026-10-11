"use client"

/**
 * Weekly report modal (Phase 4 stream 4.1). Opens after a week completes in
 * weekly mode or at the end of a Continue run, which also shows why it
 * stopped. Replaces the old five-line "week in review".
 */

import { useEffect, useRef } from "react"
import Link from "next/link"
import { ArrowRight, ChevronLeft, ChevronRight, X } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { useFocusTrap } from "@/lib/accessibility"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { WeekReportKpis, WeekReportView } from "./WeekReportView"

export function WeekReportModal() {
    const { week, history, stop, close, open, dismissStop } = useGameStore(useShallow(s => ({
        week: s.weekReportOpen,
        history: s.weekReports?.history,
        stop: s.advanceStop,
        close: s.closeWeekReport,
        open: s.openWeekReport,
        dismissStop: s.dismissAdvanceStop,
    })))
    const report = week != null ? history?.find(r => r.week === week) ?? null : null
    const isOpen = !!report
    const dialogRef = useFocusTrap(isOpen, close)
    const doneRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        if (!isOpen) return
        const t = setTimeout(() => doneRef.current?.focus(), 50)
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close() }
        }
        window.addEventListener("keydown", onKey, true)
        return () => { clearTimeout(t); window.removeEventListener("keydown", onKey, true) }
    }, [isOpen, close])

    if (!report || !history) return null
    const index = history.indexOf(report)
    const older = history[index + 1]
    const newer = index > 0 ? history[index - 1] : undefined
    const season = Math.ceil(Math.max(1, report.week) / 52)
    const weekInSeason = ((Math.max(1, report.week) - 1) % 52) + 1
    // The stop belongs to the run that just ended, shown on the latest report only.
    const showStop = !!stop && index === 0 && stop.kind !== "cancelled"

    return (
        <div
            className="fixed inset-0 z-overlay flex items-center justify-center bg-black/70 p-4"
            onMouseDown={e => { if (e.target === e.currentTarget) close() }}
        >
            <div
                ref={dialogRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby="week-report-title"
                className="flex max-h-[min(880px,calc(100vh-2rem))] w-[min(1040px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[10px] border border-line-strong bg-shell shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]"
            >
                <header className="flex items-start justify-between gap-4 px-6 pb-4 pt-5">
                    <div className="min-w-0">
                        <p className="premium-eyebrow">Season {season} · Week {weekInSeason} report{report.partial ? " · partial week" : ""}</p>
                        <h2 id="week-report-title" className="font-display text-[26px] font-bold leading-tight text-ink-1">{report.headline}</h2>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <button type="button" onClick={() => older && open(older.week)} disabled={!older} aria-label="Previous week's report" title={older ? `Week ${older.week}` : undefined} className="flex h-8 w-8 items-center justify-center rounded text-ink-3 hover:bg-raised hover:text-ink-1 disabled:opacity-30">
                            <ChevronLeft size={16} />
                        </button>
                        <button type="button" onClick={() => newer && open(newer.week)} disabled={!newer} aria-label="Next week's report" title={newer ? `Week ${newer.week}` : undefined} className="flex h-8 w-8 items-center justify-center rounded text-ink-3 hover:bg-raised hover:text-ink-1 disabled:opacity-30">
                            <ChevronRight size={16} />
                        </button>
                        <button type="button" onClick={close} aria-label="Close report" className="ml-1 flex h-8 w-8 items-center justify-center rounded text-ink-3 hover:bg-raised hover:text-ink-1">
                            <X size={16} />
                        </button>
                    </div>
                </header>

                <WeekReportKpis report={report} />

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    <WeekReportView report={report} />
                </div>

                <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-3">
                    {showStop && stop ? (
                        <p className="flex min-w-0 items-center gap-2 text-sm" role="status">
                            <span className={cn("shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em]", stop.kind === "match" ? "text-gold" : "text-ink-3")}>
                                {stop.kind === "match" ? "Match day" : "Stopped"}
                            </span>
                            <span className="truncate font-semibold text-ink-1">{stop.reason}</span>
                            {stop.href && stop.actionLabel && (
                                <Link href={stop.href} onClick={() => { close(); if (stop.kind !== "match") dismissStop() }} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-ink-2 hover:text-ink-1 hover:underline">
                                    {stop.actionLabel} <ArrowRight size={12} />
                                </Link>
                            )}
                        </p>
                    ) : (
                        <p className="text-xs text-ink-3">Every number above is a change the game applied this week, with what caused it.</p>
                    )}
                    <Button ref={doneRef} onClick={close} className="h-10 px-6">
                        Continue
                    </Button>
                </footer>
            </div>
        </div>
    )
}
