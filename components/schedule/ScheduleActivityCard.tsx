"use client"

import React, { memo } from "react"
import { Badge } from "@/components/ui/badge"
import { Coffee, Plane, Users, Briefcase, Megaphone } from "lucide-react"
import { cn } from "@/lib/utils"
import { ActivitySaveData } from "@/engine/save-types"

interface ScheduleActivityCardProps {
    activity: ActivitySaveData
}

export const ScheduleActivityCard = memo(function ScheduleActivityCard({ activity }: ScheduleActivityCardProps) {
    const isRest = activity.type === "REST"
    const isBootcamp = activity.type === "BOOTCAMP"
    const isTravel = activity.type === "TRAVEL"
    const isMedia = activity.type === "MEDIA"
    const isMarketing = activity.type === "MARKETING"

    const getIcon = () => {
        if (isRest) return <Coffee size={14} />
        if (isBootcamp) return <Users size={14} />
        if (isTravel) return <Plane size={14} />
        if (isMedia) return <Briefcase size={14} />
        if (isMarketing) return <Megaphone size={14} />
        return null
    }

    const getColorClass = () => {
        if (isRest) return "bg-blue-500/10 text-blue-200 border-blue-500/20"
        if (isBootcamp) return "bg-orange-500/10 text-orange-200 border-orange-500/20"
        if (isTravel) return "bg-emerald-500/10 text-emerald-200 border-emerald-500/20"
        if (isMarketing) return "bg-emerald-500/10 text-emerald-200 border-emerald-500/20"
        return "bg-white/5 text-white/70 border-white/10"
    }

    const getBadgeColor = () => {
        if (isRest) return "bg-blue-500/20 text-blue-200"
        if (isBootcamp) return "bg-orange-500/20 text-orange-200"
        if (isTravel) return "bg-emerald-500/20 text-emerald-200"
        if (isMarketing) return "bg-emerald-500/20 text-emerald-200"
        return "bg-white/10 text-white/70"
    }

    return (
        <div
            className={cn(
                "px-3 py-2 rounded-xl text-left flex flex-col justify-center relative border h-[48px] transition-all",
                getColorClass()
            )}>
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 overflow-hidden">
                    <Badge variant="outline" className={cn(
                        "text-[8px] px-1 py-0 border-none font-normal backdrop-blur-md shadow-sm shrink-0",
                        getBadgeColor()
                    )}>
                        {activity.type}
                    </Badge>
                    <div className="flex flex-col min-w-0">
                        <span className="text-xs font-normal tracking-tight leading-none uppercase">
                            {activity.name}
                        </span>
                        {activity.description && (
                            <span className="text-[8px] text-white/50 truncate uppercase tracking-wider mt-0.5">
                                {activity.description}
                            </span>
                        )}
                    </div>
                </div>

                <div className="w-6 h-6 rounded-lg bg-black/30 flex items-center justify-center shrink-0 border border-white/5 opacity-60">
                    {getIcon()}
                </div>
            </div>
        </div>
    )
})
