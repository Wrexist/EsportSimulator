"use client"
import { t, tn } from "@/lib/i18n"

import React, { useState } from "react"
import { useGameStore } from "@/store/game-store"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { Plane, Dumbbell, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils-extended"
import { BOOTCAMP_CHEMISTRY_BONUS } from "@/engine/chemistry-engine"
import { ScheduleDialog } from "./ScheduleDialog"

interface BookBootcampModalProps {
    isOpen: boolean
    onClose: () => void
    week: number
}

type BootcampType = "LOCAL" | "INTERNATIONAL" | "RETREAT"

// `activity` is the scheduled type; `perWeek` is applied to every roster
// player each week the block runs (scheduled-activities-processor), and the
// start week adds BOOTCAMP_CHEMISTRY_BONUS[activity] team chemistry.
const BOOTCAMP_OPTIONS = {
    LOCAL: {
        name: "Local Bootcamp",
        description: "Intensive training at a specialized local facility.",
        key: "LOCAL",
        costPerWeek: 5000,
        icon: Dumbbell,
        activity: "BOOTCAMP",
        perWeek: { xp: 15, morale: -5, fatigue: 10 },
    },
    INTERNATIONAL: {
        name: "International Bootcamp",
        description: "Travel abroad to practice against strong opposition.",
        key: "INTERNATIONAL",
        costPerWeek: 15000,
        icon: Plane,
        activity: "TRAVEL",
        perWeek: { xp: 30, morale: 5, fatigue: 10 },
    },
    RETREAT: {
        name: "Team Building Retreat",
        description: "Rest and recovery away from the server room.",
        key: "RETREAT",
        costPerWeek: 8000,
        icon: Sparkles,
        activity: "REST",
        perWeek: { xp: 0, morale: 20, fatigue: -30 },
    }
} as const

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)

/** Real per-week effects plus the start-week chemistry bonus. */
function effectList(option: typeof BOOTCAMP_OPTIONS[BootcampType]) {
    const out: { label: string; good: boolean }[] = []
    if (option.perWeek.xp > 0) out.push({ label: t("sch.fx.xp", { n: signed(option.perWeek.xp) }), good: true })
    out.push({ label: t("sch.fx.morale", { n: signed(option.perWeek.morale) }), good: option.perWeek.morale > 0 })
    out.push({ label: t("sch.fx.fatigue", { n: signed(option.perWeek.fatigue) }), good: option.perWeek.fatigue < 0 })
    const chem = BOOTCAMP_CHEMISTRY_BONUS[option.activity] ?? 0
    if (chem > 0) out.push({ label: t("sch.fx.chemistry", { n: chem }), good: true })
    return out
}

export function BookBootcampModal({ isOpen, onClose, week }: BookBootcampModalProps) {
    const scheduleActivity = useGameStore(state => state.scheduleActivity)
    const playerTeam = useCurrentTeam()
    const [selectedType, setSelectedType] = useState<BootcampType>("LOCAL")
    const [duration, setDuration] = useState(1)
    const [error, setError] = useState<string | null>(null)
    const budget = playerTeam?.budget || 0

    const selectedOption = BOOTCAMP_OPTIONS[selectedType]
    const totalCost = selectedOption.costPerWeek * duration
    const affordable = budget >= totalCost

    const handleConfirm = () => {
        if (!affordable) return

        const result = scheduleActivity({
            id: `bootcamp_${week}_${selectedType}_${duration}`,
            type: selectedOption.activity,
            week: week,
            duration: duration,
            cost: totalCost,
            name: selectedOption.name,
            description: selectedOption.description,
            fatigue: selectedOption.perWeek.fatigue,
            effect: {
                trainingBonus: selectedOption.perWeek.xp,
                morale: selectedOption.perWeek.morale,
            }
        }) as unknown as { success: boolean, message: string }

        if (result.success) {
            toast.success(tn("sch.boot.booked", duration, { name: t(`sch.boot.${selectedOption.key}`) }))
            onClose()
        } else {
            setError(result.message)
        }
    }

    return (
        <ScheduleDialog
            isOpen={isOpen}
            onClose={onClose}
            titleId="modal-title-book-bootcamp"
            title={t("sch.boot.title")}
            subtitle={t("sch.boot.subtitle", { week })}
            className="max-w-2xl"
            footer={
                <>
                    {(error || !affordable) && (
                        <p role="alert" className="mr-auto text-xs font-medium text-negative">
                            {error ?? t("sch.short", { amount: formatCurrency(totalCost - budget, "$", false) })}
                        </p>
                    )}
                    <Button variant="ghost" onClick={onClose}>{t("sch.cancel")}</Button>
                    <Button onClick={handleConfirm} disabled={!affordable}>{t("sch.bookFor", { amount: formatCurrency(totalCost, "$", false) })}</Button>
                </>
            }
        >
            <ul className="divide-y divide-line">
                {(Object.entries(BOOTCAMP_OPTIONS) as [BootcampType, typeof BOOTCAMP_OPTIONS[BootcampType]][]).map(([key, option]) => {
                    const selected = selectedType === key
                    const Icon = option.icon
                    return (
                        <li key={key}>
                            <button
                                type="button"
                                aria-pressed={selected}
                                onClick={() => setSelectedType(key)}
                                className={cn(
                                    "flex w-full items-start gap-4 border-l-2 px-6 py-3.5 text-left transition-colors",
                                    selected ? "border-gold bg-hover" : "border-transparent hover:bg-raised",
                                )}
                            >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-raised text-ink-2"><Icon size={17} /></span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-baseline justify-between gap-3">
                                        <span className="text-sm font-semibold text-ink-1">{t(`sch.boot.${option.key}`)}</span>
                                        <span className="shrink-0 text-xs tabular-nums text-ink-2">{t("sch.perWeek", { amount: formatCurrency(option.costPerWeek, "$", false) })}</span>
                                    </span>
                                    <span className="block text-xs text-ink-3">{t(`sch.boot.${option.key}.desc`)}</span>
                                    <span className="mt-1 block text-xs">
                                        {effectList(option).map((fx, i) => (
                                            <span key={fx.label}>
                                                {i > 0 && <span className="text-ink-3"> · </span>}
                                                <span className={fx.good ? "text-positive" : "text-caution"}>{fx.label}</span>
                                            </span>
                                        ))}
                                    </span>
                                </span>
                            </button>
                        </li>
                    )
                })}
            </ul>

            <div className="grid grid-cols-1 gap-6 border-t border-line px-6 py-5 sm:grid-cols-2">
                <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("sch.duration")}</p>
                    <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={t("sch.durationAria")}>
                        {[1, 2, 3, 4].map(w => (
                            <button
                                key={w}
                                type="button"
                                role="radio"
                                aria-checked={duration === w}
                                onClick={() => setDuration(w)}
                                className={cn(
                                    "h-10 rounded-md border text-sm font-semibold tabular-nums transition-colors",
                                    duration === w ? "border-gold bg-hover text-ink-1" : "border-line bg-shell text-ink-2 hover:bg-raised",
                                )}
                            >
                                {t("common.weeksShort", { count: w })}
                            </button>
                        ))}
                    </div>
                    {selectedType === "LOCAL" && <p className="mt-2 text-xs text-ink-3">{t("sch.boot.fatigueRule")}</p>}
                </div>
                <dl className="divide-y divide-line rounded-md border border-line text-sm">
                    <div className="flex justify-between px-3 py-2"><dt className="text-ink-3">{t("sch.weeklyCost")}</dt><dd className="tabular-nums text-ink-1">{formatCurrency(selectedOption.costPerWeek, "$", false)}</dd></div>
                    <div className="flex justify-between px-3 py-2"><dt className="text-ink-3">{t("sch.weeks")}</dt><dd className="tabular-nums text-ink-1">{duration}</dd></div>
                    <div className="flex justify-between px-3 py-2"><dt className="font-semibold text-ink-2">{t("sch.paidNow")}</dt><dd className={cn("font-semibold tabular-nums", affordable ? "text-ink-1" : "text-negative")}>{formatCurrency(totalCost, "$", false)}</dd></div>
                </dl>
            </div>
        </ScheduleDialog>
    )
}
