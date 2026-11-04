"use client"

import { t } from "@/lib/i18n"
import { Briefcase, CalendarClock, Coffee, Dumbbell, Megaphone, Plane, Swords } from "lucide-react"
import type { ActivitySaveData } from "@/engine/save-types"
import { formatCurrency } from "@/lib/utils-extended"
import { CONDITION_TUNING } from "@/lib/balance-tuning"
import { Button } from "@/components/ui/button"
import { Panel } from "@/src/components/ui/Panel"
import { activityKind, activityName } from "@/components/schedule/activity-labels"
import type { PlanEffect } from "./week-preview"

export type BookingKind = "SCRIM" | "BOOTCAMP" | "MARKETING" | "MEETING"

const ICON: Partial<Record<ActivitySaveData["type"], typeof Coffee>> = {
    REST: Coffee, BOOTCAMP: Dumbbell, TRAVEL: Plane, MEDIA: Briefcase, STAFF_MEETING: Briefcase, MARKETING: Megaphone,
}

const BOOK_OPTIONS: { kind: BookingKind; icon: typeof Coffee }[] = [
    { kind: "SCRIM", icon: Swords },
    { kind: "MEETING", icon: Briefcase },
    { kind: "BOOTCAMP", icon: Plane },
    { kind: "MARKETING", icon: Megaphone },
]

interface WeekBookingsProps {
    week: number
    bookings: ActivitySaveData[]
    effects: PlanEffect[]
    dayLabel: (day: number) => string
    onBook: (kind: BookingKind) => void
}

/** Week plan → bookings running this week, and the four things that can be booked. */
export function WeekBookings({ week, bookings, effects, dayLabel, onBook }: WeekBookingsProps) {
    const byActivity = new Map(effects.filter(e => e.activityId).map(e => [e.activityId!, e]))
    return (
        <Panel title={t("wk.bookings")} eyebrow={t("wk.paidWhenBooked")} padded={false}>
            {bookings.length === 0 ? (
                <p className="px-4 py-3 text-sm text-ink-3">{t("wk.nothingBooked", { fatigue: Math.round(CONDITION_TUNING.IDLE_DAY_FATIGUE_RECOVERY_RATE * 100), energy: CONDITION_TUNING.IDLE_DAY_ENERGY })}</p>
            ) : (
                <ul className="divide-y divide-line">
                    {bookings.map(a => {
                        const Icon = ICON[a.type] ?? CalendarClock
                        const fx = byActivity.get(a.id)
                        const timing = a.duration > 0
                            ? (a.duration > 1 ? t("wk.weekOf", { n: week - a.week + 1, total: a.duration }) : t("wk.allWeek"))
                            : a.day != null ? dayLabel(a.day) : t("wk.thisWeek")
                        return (
                            <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-raised text-ink-2"><Icon size={15} /></span>
                                <div className="min-w-0 flex-1">
                                    <p className="flex items-baseline justify-between gap-3">
                                        <span className="truncate text-sm font-semibold text-ink-1">{activityName(a.name) || activityKind(a.type)}</span>
                                        <span className="shrink-0 text-xs tabular-nums text-ink-3">{a.week === week && a.cost ? t("wk.paid", { amount: formatCurrency(a.cost, "$", false) }) : a.week < week ? t("wk.paidEarlier") : ""}</span>
                                    </p>
                                    <p className="text-xs text-ink-3">{activityKind(a.type)} · {timing}</p>
                                    {fx && fx.effects.length > 0 && (
                                        <p className="mt-1 text-xs">
                                            {fx.effects.map((e, i) => (
                                                <span key={e.text}>
                                                    {i > 0 && <span className="text-ink-3"> · </span>}
                                                    <span className={e.good ? "text-positive" : "text-caution"}>{e.text}</span>
                                                </span>
                                            ))}
                                        </p>
                                    )}
                                </div>
                            </li>
                        )
                    })}
                </ul>
            )}
            <div className="grid grid-cols-2 gap-2 border-t border-line p-3">
                {BOOK_OPTIONS.map(o => (
                    <Button key={o.kind} variant="outline" className="h-auto justify-start gap-3 px-3 py-2 text-left" onClick={() => onBook(o.kind)}>
                        <o.icon size={16} className="shrink-0 text-ink-3" />
                        <span className="min-w-0">
                            <span className="block text-sm font-semibold text-ink-1">{t(`wk.book.${o.kind}`)}</span>
                            <span className="block truncate text-xs font-normal text-ink-3">{t(`wk.book.${o.kind}.detail`)}</span>
                        </span>
                    </Button>
                ))}
            </div>
        </Panel>
    )
}
