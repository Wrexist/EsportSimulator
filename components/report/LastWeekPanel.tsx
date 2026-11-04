"use client"

/**
 * Home "Last week" panel: the latest weekly report at a glance (headline,
 * money net, results, rank and board movement, top player changes) with a
 * link to the full report.
 */

import { useGameStore } from "@/store/game-store"
import { Panel } from "@/src/components/ui/Panel"
import { cn } from "@/lib/utils"
import { formatMoney, moneyLines, reportHeadline, resultsLabel, topPlayerChanges } from "./report-model"
import { t } from "@/lib/i18n"

export function LastWeekPanel({ className }: { className?: string }) {
    const report = useGameStore(s => s.weekReports?.history?.[0] ?? null)
    const open = useGameStore(s => s.openWeekReport)

    if (!report) {
        return (
            <Panel title={t("lastWeek.title")} className={className}>
                <p className="text-sm text-ink-3">{t("lastWeek.empty")}</p>
            </Panel>
        )
    }

    const net = moneyLines(report).net
    const [r0, r1] = report.kpis.rank
    const [b0, b1] = report.kpis.board
    const rankMove = r0 != null && r1 != null ? r0 - r1 : 0
    const boardMove = b0 != null && b1 != null ? Math.round(b1 - b0) : 0
    const top = topPlayerChanges(report, 3)
    const stats: { label: string; value: string; tone?: "up" | "down" }[] = [
        { label: t("lastWeek.money"), value: formatMoney(net, true), tone: net > 0 ? "up" : net < 0 ? "down" : undefined },
        { label: t("lastWeek.results"), value: resultsLabel(report) },
        { label: t("lastWeek.rank"), value: r1 != null ? `#${r1}${rankMove ? ` ${rankMove > 0 ? "▲" : "▼"}${Math.abs(rankMove)}` : ""}` : "—", tone: rankMove > 0 ? "up" : rankMove < 0 ? "down" : undefined },
        { label: t("home.board"), value: b1 != null ? `${Math.round(b1)}${boardMove ? ` ${boardMove > 0 ? "+" : "−"}${Math.abs(boardMove)}` : ""}` : "—", tone: boardMove > 0 ? "up" : boardMove < 0 ? "down" : undefined },
    ]

    return (
        <Panel
            title={t("lastWeek.title")}
            className={className}
            padded={false}
            actions={
                <button type="button" onClick={() => open(report.week)} className="text-xs font-semibold text-ink-3 hover:text-ink-1">
                    {t("lastWeek.fullReport")}
                </button>
            }
        >
            <div className="px-4 pb-3 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("common.week", { n: ((report.week - 1) % 52) + 1 })}</p>
                <p className="mt-1 text-sm font-semibold leading-snug text-ink-1">{reportHeadline(report)}</p>
            </div>
            <dl className="grid grid-cols-4 divide-x divide-line border-y border-line">
                {stats.map(s => (
                    <div key={s.label} className="min-w-0 px-3 py-2">
                        <dt className="text-[11px] text-ink-3">{s.label}</dt>
                        <dd className={cn("truncate text-sm font-semibold tabular-nums", s.tone === "up" ? "text-positive" : s.tone === "down" ? "text-negative" : "text-ink-1")}>{s.value}</dd>
                    </div>
                ))}
            </dl>
            {top.length > 0 && (
                <ul className="divide-y divide-line text-[13px]">
                    {top.map((change, i) => (
                        <li key={i} className="flex items-baseline gap-2 px-4 py-1.5">
                            <span className="w-20 shrink-0 truncate font-semibold text-ink-1">{change.name}</span>
                            <span className={cn("shrink-0 font-semibold tabular-nums", change.tone === "down" ? "text-negative" : "text-positive")}>{change.change}</span>
                            <span className="min-w-0 truncate text-xs text-ink-3" title={change.cause}>{change.cause}</span>
                        </li>
                    ))}
                </ul>
            )}
        </Panel>
    )
}
