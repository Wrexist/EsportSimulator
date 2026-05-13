"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useGameStore } from "@/store/game-store"
import { WEEKLY_ACTIVITIES, WeeklyActivityType } from "@/types"
import { cn } from "@/lib/utils"
import { PlayCircle, Users, BarChart, Sword, CalendarClock } from "lucide-react"

export function WeeklyFocusWidget() {
    const selectedActivity = useGameStore(state => state.selectedWeeklyActivity)
    const setWeeklyActivity = useGameStore(state => state.setWeeklyActivity)
    const isPlaying = useGameStore(state => state.scheduledMatches.length > 0) // rough check if mid-week? actually we set it before advancing week.

    const currentSelection = selectedActivity ? WEEKLY_ACTIVITIES[selectedActivity] : WEEKLY_ACTIVITIES[WeeklyActivityType.TRAINING_ONLY]

    const handleSelect = (type: WeeklyActivityType) => {
        setWeeklyActivity(type)
    }

    const getIcon = (type: WeeklyActivityType) => {
        switch (type) {
            case WeeklyActivityType.STREAMING: return <PlayCircle className="w-4 h-4 text-purple-400" />
            case WeeklyActivityType.TEAM_BONDING: return <Users className="w-4 h-4 text-green-400" />
            case WeeklyActivityType.MEDIA_CAMPAIGN: return <BarChart className="w-4 h-4 text-blue-400" />
            case WeeklyActivityType.BOOTCAMP: return <Sword className="w-4 h-4 text-red-500" />
            default: return <CalendarClock className="w-4 h-4 text-gray-400" />
        }
    }

    return (
        <Card className="h-full bg-[#111111] border-white/5 flex flex-col">
            <CardHeader className="pb-3 border-b border-white/5">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        Weekly Focus
                    </CardTitle>
                    {selectedActivity && (
                        <Badge variant="outline" className="text-xs border-primary/20 bg-primary/10 text-primary">
                            Active
                        </Badge>
                    )}
                </div>
            </CardHeader>

            <CardContent className="flex-1 p-3 overflow-y-auto space-y-3 custom-scrollbar">
                {Object.values(WEEKLY_ACTIVITIES).map((activity) => {
                    if (activity.type === "TRAINING_ONLY" && !selectedActivity) return null // Hide default if nothing selected? Actually show it as "Reset" option

                    const isSelected = selectedActivity === activity.type || (!selectedActivity && activity.type === "TRAINING_ONLY")

                    return (
                        <button
                            key={activity.type}
                            onClick={() => handleSelect(activity.type)}
                            className={cn(
                                "w-full text-left p-3 rounded-lg border transition-[border-color,background-color,box-shadow] duration-100 ease-out relative group select-none touch-manipulation will-change-transform active:scale-[0.99] active:duration-0",
                                isSelected
                                    ? "bg-white/5 border-primary/50 shadow-[0_0_15px_rgba(34,211,238,0.1)]"
                                    : "bg-black/20 border-white/5 hover:bg-white/5 hover:border-white/10"
                            )}
                        >
                            <div className="flex items-start justify-between mb-1">
                                <div className="flex items-center gap-2 font-semibold text-sm text-gray-200">
                                    {getIcon(activity.type)}
                                    {activity.name}
                                </div>
                                {activity.cost > 0 && (
                                    <span className="text-xs font-mono text-red-400">-${activity.cost.toLocaleString('en-US')}</span>
                                )}
                                {activity.effects.money && (
                                    <span className="text-xs font-mono text-green-400">
                                        +${activity.effects.money.toLocaleString('en-US')}
                                        <span className="text-gray-500">/p</span>
                                    </span>
                                )}
                            </div>

                            <p className="text-xs text-gray-500 line-clamp-2">{activity.description}</p>

                            {/* Effects Badges */}
                            <div className="flex flex-wrap gap-1 mt-2">
                                {activity.effects.morale !== undefined && (
                                    <span className={cn("text-[10px] px-1 rounded bg-white/5", activity.effects.morale > 0 ? "text-green-400" : "text-red-400")}>
                                        {activity.effects.morale > 0 ? "+" : ""}{activity.effects.morale} Morale
                                    </span>
                                )}
                                {activity.effects.fatigue !== undefined && (
                                    <span className={cn("text-[10px] px-1 rounded bg-white/5", activity.effects.fatigue < 0 ? "text-green-400" : "text-red-400")}>
                                        {activity.effects.fatigue > 0 ? "+" : ""}{activity.effects.fatigue} Fatigue
                                    </span>
                                )}
                                {activity.effects.xp !== undefined && (
                                    <span className="text-[10px] px-1 rounded bg-white/5 text-yellow-400">
                                        {activity.effects.xp}x XP
                                    </span>
                                )}
                            </div>

                            {isSelected && (
                                <div className="absolute right-2 top-2 w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_cyan]" />
                            )}
                        </button>
                    )
                })}
            </CardContent>
        </Card>
    )
}
