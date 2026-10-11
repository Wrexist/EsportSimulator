"use client"

/**
 * Weekly report body (Phase 4 stream 4.1): headline KPIs, player changes
 * with causes, money by line, team changes, matches and warnings. Every row
 * is a sum of recorded change entries (lib/week-changes.ts).
 */

import type { ReactNode } from "react"
import Link from "next/link"
import { Activity, AlertTriangle, FileWarning, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"
import type { WeekReport } from "@/lib/week-report"
import { FormGuide } from "@/src/components/ui/FixtureBanner"
import { formatMoney, moneyLines, playerGroups, resultsLabel, teamRows, type Tone } from "./report-model"

const TONE_TEXT: Record<Tone, string> = { up: "text-positive", down: "text-negative", neutral: "text-ink-2" }

function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
    return (
        <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{children}</h3>
            {aside}
        </div>
    )
}

function KpiCell({ label, value, hint, tone = "neutral" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
    return (
        <div className="min-w-0 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{label}</p>
            <p className={cn("mt-1 font-display text-2xl font-bold leading-none tabular-nums", tone === "neutral" ? "text-ink-1" : TONE_TEXT[tone])}>{value}</p>
            {hint != null && <p className="mt-1 truncate text-xs text-ink-3">{hint}</p>}
        </div>
    )
}

export function WeekReportKpis({ report }: { report: WeekReport }) {
    const money = moneyLines(report)
    const [r0, r1] = report.kpis.rank
    const [b0, b1] = report.kpis.board
    const [m0, m1] = report.kpis.morale
    const rankMove = r0 != null && r1 != null ? r0 - r1 : 0
    const boardMove = b0 != null && b1 != null ? Math.round(b1 - b0) : 0
    return (
        <div className="grid grid-cols-2 divide-line border-y border-line sm:grid-cols-5 sm:divide-x">
            <KpiCell label="Money net" value={formatMoney(money.net, true)} tone={money.net > 0 ? "up" : money.net < 0 ? "down" : "neutral"} hint={`Funds ${formatMoney(report.kpis.budget[1])}`} />
            <KpiCell label="Results" value={resultsLabel(report)} hint={report.matches.length ? `${report.matches.length} match${report.matches.length === 1 ? "" : "es"}` : "Training week"} />
            <KpiCell label="World rank" value={r1 != null ? `#${r1}` : "—"} tone={rankMove > 0 ? "up" : rankMove < 0 ? "down" : "neutral"} hint={rankMove ? `${rankMove > 0 ? "▲" : "▼"} ${Math.abs(rankMove)} place${Math.abs(rankMove) === 1 ? "" : "s"}` : "No change"} />
            <KpiCell label="Board" value={b1 != null ? Math.round(b1) : "—"} tone={boardMove > 0 ? "up" : boardMove < 0 ? "down" : "neutral"} hint={boardMove ? `${boardMove > 0 ? "+" : "−"}${Math.abs(boardMove)} confidence` : "Confidence unchanged"} />
            <KpiCell label="Squad morale" value={m1 != null ? Math.round(m1) : "—"} tone={m0 != null && m1 != null && Math.round(m1) !== Math.round(m0) ? (m1 > m0 ? "up" : "down") : "neutral"} hint={m0 != null && m1 != null ? `Was ${Math.round(m0)}` : undefined} />
        </div>
    )
}

export function WeekReportView({ report }: { report: WeekReport }) {
    const players = playerGroups(report)
    const money = moneyLines(report)
    const team = teamRows(report)
    return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            {/* Player changes */}
            <section className="min-w-0 rounded-lg border border-line bg-panel" aria-label="Player changes">
                <SectionTitle aside={<span className="text-xs text-ink-3">Change · cause</span>}>Player changes</SectionTitle>
                {players.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-ink-3">No player values changed this week.</p>
                ) : (
                    <table className="w-full border-collapse text-left text-[13px]">
                        <tbody>
                            {players.map(group => group.rows.map((row, i) => (
                                <tr key={`${group.id}-${i}`} className={cn("align-top", i === group.rows.length - 1 && "border-b border-line last:border-b-0")}>
                                    <td className="w-[104px] py-1.5 pl-4 pr-2">
                                        {i === 0 && (
                                            <Link href={`/player/${group.id}`} className="block truncate font-semibold text-ink-1 hover:text-gold">{group.name}</Link>
                                        )}
                                    </td>
                                    <td className={cn("py-1.5 pr-3 font-semibold tabular-nums", TONE_TEXT[row.tone])}>
                                        {row.parts
                                            ? row.parts.map((p, k) => (
                                                <span key={k}>
                                                    {k > 0 && <span className="text-ink-3"> · </span>}
                                                    <span className={TONE_TEXT[p.tone]}>{p.text}</span>
                                                </span>
                                            ))
                                            : row.change}
                                    </td>
                                    <td className="py-1.5 pr-4 text-ink-3">{row.cause}</td>
                                </tr>
                            )))}
                        </tbody>
                    </table>
                )}
            </section>

            <div className="min-w-0 space-y-4">
                {/* Matches */}
                <section className="rounded-lg border border-line bg-panel" aria-label="Matches">
                    <SectionTitle aside={<span className="text-xs tabular-nums text-ink-3">{resultsLabel(report)}</span>}>Matches</SectionTitle>
                    {report.matches.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-ink-3">No matches this week.</p>
                    ) : (
                        <ul className="divide-y divide-line">
                            {report.matches.map(m => (
                                <li key={m.id}>
                                    <Link href={`/match/${m.id}/result`} className="flex h-10 items-center gap-3 px-4 hover:bg-raised">
                                        <FormGuide results={[m.won ? "W" : "L"]} />
                                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-1">{m.opponentName}</span>
                                        <span className="hidden truncate text-xs text-ink-3 sm:inline">{m.forfeit ? "Forfeit" : m.competition}</span>
                                        <span className="w-12 text-right font-display text-lg font-bold tabular-nums text-ink-1">{m.score}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                {/* Money by line */}
                <section className="rounded-lg border border-line bg-panel" aria-label="Money">
                    <SectionTitle aside={<span className={cn("text-xs font-semibold tabular-nums", money.net < 0 ? "text-negative" : "text-positive")}>{formatMoney(money.net, true)}</span>}>Money</SectionTitle>
                    {money.income.length + money.expenses.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-ink-3">No money moved this week.</p>
                    ) : (
                        <dl className="divide-y divide-line text-[13px]">
                            {[...money.income, ...money.expenses].map(line => (
                                <div key={`${line.label}-${line.cause}-${line.amount > 0}`} className="flex items-baseline justify-between gap-3 px-4 py-1.5">
                                    <dt className="min-w-0">
                                        <span className="text-ink-1">{line.label}</span>
                                        {line.cause && line.cause !== line.label && <span className="ml-2 text-xs text-ink-3">{line.cause}</span>}
                                    </dt>
                                    <dd className={cn("shrink-0 font-semibold tabular-nums", line.amount < 0 ? "text-negative" : "text-positive")}>{formatMoney(line.amount, true)}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </section>

                {/* Team changes */}
                <section className="rounded-lg border border-line bg-panel" aria-label="Team changes">
                    <SectionTitle>Team</SectionTitle>
                    {team.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-ink-3">Ranking, board and chemistry unchanged.</p>
                    ) : (
                        <dl className="divide-y divide-line text-[13px]">
                            {team.map(row => (
                                <div key={row.label} className="grid grid-cols-[120px_auto_minmax(0,1fr)] items-baseline gap-3 px-4 py-1.5">
                                    <dt className="text-ink-3">{row.label}</dt>
                                    <dd className={cn("font-semibold tabular-nums", TONE_TEXT[row.tone])}>{row.change}</dd>
                                    <dd className="truncate text-right text-xs text-ink-3" title={row.cause}>{row.cause}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </section>

                {/* Warnings */}
                {report.warnings.length > 0 && (
                    <section className="rounded-lg border border-line bg-panel" aria-label="Warnings">
                        <SectionTitle>Watch</SectionTitle>
                        <ul className="divide-y divide-line text-[13px]">
                            {report.warnings.map((w, i) => {
                                const Icon = w.kind === "injury" ? Activity : w.kind === "finance" ? Wallet : w.kind === "contract" ? FileWarning : AlertTriangle
                                const body = (
                                    <>
                                        <Icon size={14} className={w.kind === "injury" || w.kind === "roster" ? "text-negative" : "text-caution"} />
                                        <span className="min-w-0 flex-1 text-ink-1">{w.label}</span>
                                    </>
                                )
                                return (
                                    <li key={`${w.kind}-${w.subjectId ?? i}`}>
                                        {w.href
                                            ? <Link href={w.href} className="flex items-center gap-2.5 px-4 py-2 hover:bg-raised">{body}</Link>
                                            : <div className="flex items-center gap-2.5 px-4 py-2">{body}</div>}
                                    </li>
                                )
                            })}
                        </ul>
                    </section>
                )}
            </div>
        </div>
    )
}
