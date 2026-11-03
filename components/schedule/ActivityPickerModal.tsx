"use client"
import { t } from "@/lib/i18n"

import React from "react"
import { ChevronRight, Swords, Plane, Briefcase, Megaphone } from "lucide-react"
import { ScheduleDialog } from "./ScheduleDialog"

type ActivityKind = "SCRIM" | "BOOTCAMP" | "MEETING" | "MARKETING"

interface ActivityPickerModalProps {
    isOpen: boolean
    onClose: () => void
    week: number
    /** Readable date of the clicked day, e.g. "Mon, Oct 12". */
    dayLabel?: string
    onSelectType: (type: ActivityKind) => void
}

const OPTIONS: { type: ActivityKind; icon: typeof Swords }[] = [
    { type: "SCRIM", icon: Swords },
    { type: "BOOTCAMP", icon: Plane },
    { type: "MEETING", icon: Briefcase },
    { type: "MARKETING", icon: Megaphone },
]

export function ActivityPickerModal({ isOpen, onClose, week, dayLabel, onSelectType }: ActivityPickerModalProps) {
    const handleSelect = (type: ActivityKind) => {
        onSelectType(type)
        onClose()
    }

    return (
        <ScheduleDialog
            isOpen={isOpen}
            onClose={onClose}
            titleId="modal-title-activity-picker"
            title={t("sch.bookActivity")}
            subtitle={dayLabel ? `${t("common.week", { n: week })} · ${dayLabel}` : t("common.week", { n: week })}
        >
            <ul className="divide-y divide-line">
                {OPTIONS.map(({ type, icon: Icon }) => (
                    <li key={type}>
                        <button
                            type="button"
                            onClick={() => handleSelect(type)}
                            className="flex w-full items-center gap-4 px-6 py-3.5 text-left transition-colors hover:bg-raised"
                        >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-raised text-ink-2">
                                <Icon size={17} />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold text-ink-1">{t(`sch.pick.${type}`)}</span>
                                <span className="block text-xs text-ink-3">{t(`sch.pick.${type}.desc`)}</span>
                            </span>
                            <ChevronRight size={16} className="shrink-0 text-ink-3" />
                        </button>
                    </li>
                ))}
            </ul>
        </ScheduleDialog>
    )
}
