"use client"

/**
 * Compact "week report ready" toast for daily mode (Next day / Skip week
 * crossing a week). Weekly mode and Continue runs open the modal instead.
 */

import { useEffect } from "react"
import { useShallow } from "zustand/react/shallow"
import { FileText, X } from "lucide-react"
import { useGameStore } from "@/store/game-store"
import { formatMoney, moneyLines, resultsLabel } from "./report-model"

const AUTO_HIDE_MS = 12000

export function WeekReportToast() {
    const { week, history, open, dismiss } = useGameStore(useShallow(s => ({
        week: s.weekReportToast,
        history: s.weekReports?.history,
        open: s.openWeekReport,
        dismiss: s.dismissWeekReportToast,
    })))
    const report = week != null ? history?.find(r => r.week === week) ?? null : null

    useEffect(() => {
        if (!report) return
        const t = setTimeout(dismiss, AUTO_HIDE_MS)
        return () => clearTimeout(t)
    }, [report, dismiss])

    if (!report) return null
    const net = moneyLines(report).net
    return (
        <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-overlay w-[360px] rounded-lg border border-line-strong bg-panel p-3 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.8)]">
            <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-raised text-gold"><FileText size={15} /></span>
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Week {report.week} report</p>
                    <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-ink-1">{report.headline}</p>
                    <p className="mt-1 text-xs tabular-nums text-ink-3">
                        {resultsLabel(report)} · {formatMoney(net, true)}
                    </p>
                </div>
                <button type="button" onClick={dismiss} aria-label="Dismiss" className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-3 hover:bg-raised hover:text-ink-1">
                    <X size={14} />
                </button>
            </div>
            <button type="button" onClick={() => open(report.week)} className="mt-2 w-full rounded-md border border-line bg-raised py-1.5 text-xs font-semibold text-ink-1 hover:bg-hover">
                View report
            </button>
        </div>
    )
}
