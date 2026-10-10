"use client"

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

const OPTIONS: { type: ActivityKind; title: string; detail: string; icon: typeof Swords }[] = [
    { type: "SCRIM", title: "Scrim", detail: "Practice match against another club on this day.", icon: Swords },
    { type: "BOOTCAMP", title: "Bootcamp", detail: "1–4 weeks away: XP, morale and fatigue every week, paid up front.", icon: Plane },
    { type: "MEETING", title: "Staff meeting", detail: "One-day session for morale, XP or chemistry.", icon: Briefcase },
    { type: "MARKETING", title: "Marketing campaign", detail: "Paid campaign that adds followers each week it runs.", icon: Megaphone },
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
            title="Book activity"
            subtitle={dayLabel ? `Week ${week} · ${dayLabel}` : `Week ${week}`}
        >
            <ul className="divide-y divide-line">
                {OPTIONS.map(({ type, title, detail, icon: Icon }) => (
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
                                <span className="block text-sm font-semibold text-ink-1">{title}</span>
                                <span className="block text-xs text-ink-3">{detail}</span>
                            </span>
                            <ChevronRight size={16} className="shrink-0 text-ink-3" />
                        </button>
                    </li>
                ))}
            </ul>
        </ScheduleDialog>
    )
}
