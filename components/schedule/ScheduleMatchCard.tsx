"use client"

import React, { memo } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Trophy, CalendarClock, Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { MatchSaveData, CompletedMatchSaveData, TeamSaveData } from "@/engine/save-types"

interface ScheduleMatchCardProps {
    match?: MatchSaveData
    teams: TeamSaveData[]
    playerTeamId: string
    isScrim?: boolean
    tournamentName?: string // Add tournament name prop
    isCurrentWeek?: boolean // New prop to show live indicator
    isLocked?: boolean
    onClick?: () => void // Optional custom click handler
    projected?: {
        stage: string
        tournamentName: string
        tournamentId: string
        week: number
        isConfimed?: boolean
        reason?: string // e.g. "If qualified"
    }
}

export const ScheduleMatchCard = memo(function ScheduleMatchCard({
    match,
    teams,
    playerTeamId,
    isScrim,
    tournamentName,
    isCurrentWeek,
    isLocked,
    onClick,
    projected
}: ScheduleMatchCardProps) {
    const router = useRouter()
    // Helper to truncate long names - increased from 14 to 18
    const truncateName = (name: string, maxLen: number = 18) => {
        if (name.length <= maxLen) return name
        return name.slice(0, maxLen).trim() + "..."
    }

    // 1. Handle Real Match
    if (match) {
        const opponentId = match.homeTeamId === playerTeamId ? match.awayTeamId : match.homeTeamId
        const opponent = teams.find(t => t.id === opponentId)
        const isWin = match.result && ((match.homeTeamId === playerTeamId && match.result.homeScore > match.result.awayScore) || (match.awayTeamId === playerTeamId && match.result.awayScore > match.result.homeScore))
        const isLoss = match.result && !isWin
        const isUpcoming = !match.result && isCurrentWeek

        // Display text: Use tournament name if available, otherwise fall back to stage
        const displayStage = tournamentName || match.stage || "Match"
        const displayName = truncateName(opponent?.name || "Unknown")

        return (
            <div
                onClick={() => {
                    if (isLocked) return
                    if (onClick) {
                        onClick()
                    } else if (match?.result) {
                        router.push(`/match/${match.id}/result`)
                    } else {
                        router.push("/")
                    }
                }}
                className={cn(
                    "px-4 py-2.5 rounded-xl text-left flex flex-col justify-center relative cursor-pointer transition-[background-color,border-color,transform] duration-75 ease-out w-full group/match border min-h-[52px] will-change-transform select-none touch-manipulation hover:-translate-y-px hover:scale-[1.01] active:scale-[0.98] active:translate-y-0 active:duration-0",
                    isLocked && "opacity-60 cursor-not-allowed hover:scale-100 hover:translate-y-0 active:scale-100",
                    isWin
                        ? "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20 hover:border-emerald-500/40"
                        : isLoss
                            ? "bg-red-500/10 hover:bg-red-500/20 border-red-500/20 hover:border-red-500/40"
                            : isScrim
                                ? "bg-purple-500/5 hover:bg-purple-500/10 border-purple-500/10 hover:border-purple-500/30"
                                : "bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/10 hover:border-emerald-500/30"
                )}>
                {/* Live/Upcoming Match Indicator */}
                {isUpcoming && !isScrim && (
                    <div className="absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                )}

                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <Badge variant="outline" className={cn(
                            "text-[10px] px-2 py-0.5 border-none font-medium backdrop-blur-md shadow-sm shrink-0",
                            isScrim ? "bg-purple-500/20 text-purple-200" : "bg-emerald-500/20 text-emerald-100"
                        )}>
                            {isScrim ? "SCRIM" : "MATCH"}
                        </Badge>
                        <div className="flex flex-col min-w-0">
                            {/* title attr surfaces the full opponent name on hover when
                                the 18-char truncation hides it. */}
                            <span
                                className={cn(
                                    "text-sm font-medium tracking-tight leading-none",
                                    isScrim ? "text-purple-100" : "text-emerald-50"
                                )}
                                title={opponent?.name ? `VS ${opponent.name}` : undefined}
                            >
                                VS {displayName}
                            </span>
                            {!isScrim && (
                                <span
                                    className="text-xs text-muted-foreground truncate uppercase tracking-wider mt-0.5"
                                    title={displayStage}
                                >
                                    {displayStage}
                                </span>
                            )}
                        </div>

                    </div>

                    {match.result ? (() => {
                        const completedMatch = match as CompletedMatchSaveData
                        const maps = completedMatch.result.maps
                        const isBO1 = maps && maps.length === 1
                        const homeScore = match.result.homeScore
                        const awayScore = match.result.awayScore

                        // For BO1, show the round score prominently
                        if (isBO1 && maps?.[0]?.finalScore) {
                            const roundScore = maps[0].finalScore
                            const playerIsHome = match.homeTeamId === playerTeamId
                            const playerRounds = playerIsHome ? roundScore.team1 : roundScore.team2
                            const opponentRounds = playerIsHome ? roundScore.team2 : roundScore.team1

                            return (
                                <span className={cn(
                                    "text-base font-bold tabular-nums shrink-0",
                                    isWin ? "text-green-400" : "text-red-400"
                                )}>
                                    {playerRounds}-{opponentRounds}
                                </span>
                            )
                        }

                        // For BO3/BO5, show map score
                        return (
                            <span className={cn(
                                "text-lg font-semibold shadow-black/50 drop-shadow-md tabular-nums shrink-0",
                                isWin ? "text-green-400" : "text-red-400"
                            )}>
                                {homeScore}-{awayScore}
                            </span>
                        )
                    })() : isLocked ? (
                        <div className="w-8 h-8 rounded-lg bg-black/30 flex items-center justify-center shrink-0 border border-white/5">
                            <Lock size={14} className="text-white/50" />
                        </div>
                    ) : (
                        // Show opponent logo for upcoming playable matches
                        <div className="w-8 h-8 rounded-lg bg-black/30 flex items-center justify-center shrink-0 border border-white/5 overflow-hidden">
                            <TeamLogoDisplay team={opponent} size={28} className="opacity-80 group-hover/match:opacity-100 transition-opacity" />
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // 2. Handle Projected Match
    if (projected) {
        return (
            <div
                className={cn(
                    "px-4 py-2.5 rounded-xl text-left flex flex-col justify-center relative cursor-pointer transition-[background-color,border-color,transform] duration-75 ease-out w-full group/match border border-dashed min-h-[52px] will-change-transform select-none touch-manipulation hover:-translate-y-px hover:scale-[1.01] active:scale-[0.98] active:translate-y-0 active:duration-0",
                    "bg-amber-500/[0.02] hover:bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40"
                )}
            >
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-none font-medium backdrop-blur-md shadow-sm shrink-0 bg-amber-500/10 text-amber-200">
                            UPCOMING
                        </Badge>
                        <div className="flex flex-col min-w-0">
                            <span className="text-sm font-medium truncate tracking-tight leading-none text-amber-100/70 italic">
                                VS TBD
                            </span>
                            <span className="text-xs text-amber-500/60 truncate uppercase tracking-wider flex items-center gap-1.5 mt-0.5">
                                <Trophy size={10} />
                                {projected.stage}
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-col items-end">
                        {projected.reason && (
                            <span className="text-[10px] font-bold text-amber-500/40 uppercase tracking-widest mb-0.5">
                                {projected.reason}
                            </span>
                        )}
                        <CalendarClock size={16} className="text-amber-500/40 group-hover/match:text-amber-500/80 transition-colors" />
                    </div>
                </div>
            </div>
        )
    }

    return null
})
