"use client"

import { t, intlLocale } from "@/lib/i18n"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency, formatSignedCurrency } from "@/lib/utils-extended"
import { Panel } from "@/src/components/ui/Panel"
import type { WeekPreview } from "./week-preview"

function Row({ label, value, tone, hint }: { label: string; value: string; tone?: "up" | "down" | "caution"; hint?: string }) {
    return (
        <div className="flex items-baseline justify-between gap-3 px-4 py-1.5 text-sm">
            <dt className="min-w-0 text-ink-3">{label}{hint && <span className="block text-xs text-ink-3">{hint}</span>}</dt>
            <dd className={cn("shrink-0 font-semibold tabular-nums", tone === "up" ? "text-positive" : tone === "down" ? "text-negative" : tone === "caution" ? "text-caution" : "text-ink-1")}>{value}</dd>
        </div>
    )
}

const toneOf = (n: number): "up" | "down" | undefined => (n > 0 ? "up" : n < 0 ? "down" : undefined)
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)

interface WeekForecastProps {
    preview: WeekPreview
    /** Projected weekly settlement (wages, sponsors, upkeep…), same engine as the tick. */
    settlementNet: number | null
    restDayLabels: string[]
}

/**
 * Week plan → what the coming update will do, line by line with its cause.
 * Uses the processors' own numbers (week-preview.ts); anything that depends
 * on a result or a dice roll is named as excluded instead of guessed.
 */
export function WeekForecast({ preview, settlementNet, restDayLabels }: WeekForecastProps) {
    const { cash } = preview
    const planCash = cash.focusIncome - cash.focusCost - cash.retraining
    const total = (settlementNet ?? 0) + planCash
    const players = preview.players
    const fatigueNow = avg(players.map(p => p.fatigueNow)), fatigueEnd = avg(players.map(p => p.fatigueEnd))
    const moraleNow = avg(players.map(p => p.moraleNow)), moraleEnd = avg(players.map(p => p.moraleEnd))
    const xpMin = players.length ? Math.min(...players.map(p => p.xpMin)) : 0
    const xpMax = players.length ? Math.max(...players.map(p => p.xpMax)) : 0

    return (
        <Panel title={t("wk.fc.title")} eyebrow={t("wk.fc.eyebrow")} padded={false}>
            <div className="px-4 pb-1 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("wk.fc.cash")}</p>
                <p className={cn("mt-1 font-display text-[28px] font-bold leading-none tabular-nums", total < 0 ? "text-negative" : "text-ink-1")}>{formatSignedCurrency(total, "$", false)}</p>
            </div>
            <dl className="pb-2">
                <Row label={t("wk.fc.settlement")} hint={t("wk.fc.settlementHint")} value={settlementNet == null ? "—" : formatSignedCurrency(settlementNet, "$", false)} tone={toneOf(settlementNet ?? 0)} />
                {cash.focusCost > 0 && <Row label={t("wk.fc.focusCost")} value={formatSignedCurrency(-cash.focusCost, "$", false)} tone="down" />}
                {cash.focusIncome > 0 && <Row label={t("wk.fc.focusIncome")} value={formatSignedCurrency(cash.focusIncome, "$", false)} tone="up" />}
                {cash.retraining > 0 && <Row label={t("wk.fc.retraining")} value={formatSignedCurrency(-cash.retraining, "$", false)} tone="down" />}
                {cash.focusSkipped && <p className="px-4 py-1 text-xs text-caution">{t("wk.fc.focusSkipped")}</p>}
                {preview.bookingsPaid > 0 && <Row label={t("wk.fc.bookingsPaid")} value={formatCurrency(preview.bookingsPaid, "$", false)} />}
            </dl>

            <div className="border-t border-line px-4 pb-1 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("wk.fc.squadAvg")}</p>
            </div>
            <dl className="pb-2">
                <Row label={t("wk.fc.fatigue")} value={`${Math.round(fatigueNow)} → ${Math.round(fatigueEnd)}`} tone={fatigueEnd < fatigueNow - 0.5 ? "up" : fatigueEnd > fatigueNow + 0.5 ? "caution" : undefined} />
                <Row label={t("wk.fc.morale")} hint={t("wk.fc.moraleHint")} value={`${Math.round(moraleNow)} → ${Math.round(moraleEnd)}`} tone={moraleEnd > moraleNow + 0.5 ? "up" : moraleEnd < moraleNow - 0.5 ? "caution" : undefined} />
                <Row label={t("wk.fc.xp")} value={`+${xpMin}–${xpMax}`} />
                <Row label={t("wk.restDays")} hint={restDayLabels.length ? restDayLabels.join(", ") : t("wk.fc.noRest")} value={`${preview.restDays.length} / 7`} />
                {preview.chemistry !== 0 && <Row label={t("wk.fc.chemistry")} value={`${preview.chemistry > 0 ? "+" : ""}${preview.chemistry}`} tone={toneOf(preview.chemistry)} />}
                {preview.reputation !== 0 && <Row label={t("wk.fc.reputation")} value={`+${preview.reputation}`} tone="up" />}
                {preview.followers > 0 && <Row label={t("wk.fc.followers")} value={`+${preview.followers.toLocaleString(intlLocale())}`} tone="up" />}
            </dl>

            <div className="border-t border-line px-4 pb-1 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("wk.fc.causes")}</p>
            </div>
            <ul className="space-y-2 px-4 pb-3 pt-1">
                {preview.effects.map((e, i) => (
                    <li key={`${e.source}-${i}`} className="text-[13px]">
                        <p className="font-semibold text-ink-1">{e.label}</p>
                        <p className="text-xs">
                            {e.effects.map((fx, j) => (
                                <span key={fx.text}>
                                    {j > 0 && <span className="text-ink-3"> · </span>}
                                    <span className={fx.good ? "text-positive" : "text-caution"}>{fx.text}</span>
                                </span>
                            ))}
                        </p>
                    </li>
                ))}
            </ul>
            <p className="flex items-start justify-between gap-3 border-t border-line px-4 py-3 text-xs leading-relaxed text-ink-3">
                <span>{t("wk.fc.notIncluded")}</span>
                <Link href="/finances" className="inline-flex shrink-0 items-center gap-1 font-semibold text-ink-3 hover:text-ink-1">{t("wk.fc.finances")} <ArrowUpRight size={12} /></Link>
            </p>
        </Panel>
    )
}
