"use client"

import React, { memo } from "react"
import { Coffee, Plane, Dumbbell, Briefcase, Megaphone, CalendarClock } from "lucide-react"
import { ActivitySaveData } from "@/engine/save-types"

const ICON: Partial<Record<ActivitySaveData["type"], typeof Coffee>> = {
    REST: Coffee,
    BOOTCAMP: Dumbbell,
    TRAVEL: Plane,
    MEDIA: Briefcase,
    STAFF_MEETING: Briefcase,
    MARKETING: Megaphone,
}

const TYPE_LABEL: Partial<Record<ActivitySaveData["type"], string>> = {
    REST: "Rest",
    BOOTCAMP: "Bootcamp",
    TRAVEL: "Bootcamp abroad",
    MEDIA: "Media",
    STAFF_MEETING: "Staff meeting",
    MARKETING: "Marketing",
}

interface ScheduleActivityCardProps {
    activity: ActivitySaveData
}

/** Calendar chip for a booked activity: quiet, icon + name + kind. */
export const ScheduleActivityCard = memo(function ScheduleActivityCard({ activity }: ScheduleActivityCardProps) {
    const Icon = ICON[activity.type] ?? CalendarClock
    const kind = TYPE_LABEL[activity.type] ?? activity.type
    return (
        <div
            title={[activity.name, activity.description].filter(Boolean).join(" · ")}
            className="flex w-full min-w-0 items-center gap-2 rounded-sm border border-line bg-shell px-2 py-1.5"
        >
            <Icon size={13} className="shrink-0 text-ink-3" aria-hidden="true" />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold leading-tight text-ink-2">{activity.name || kind}</span>
                <span className="block truncate text-[11px] leading-tight text-ink-3">{kind}</span>
            </span>
        </div>
    )
})
