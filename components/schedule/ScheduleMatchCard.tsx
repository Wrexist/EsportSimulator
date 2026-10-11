"use client"

import React, { memo } from "react"
import { useRouter } from "next/navigation"
import { Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { MatchSaveData, CompletedMatchSaveData, TeamSaveData } from "@/engine/save-types"
import { pressable } from "@/lib/accessibility"

interface ScheduleMatchCardProps {
    match?: MatchSaveData
    teams: TeamSaveData[]
    playerTeamId: string
    isScrim?: boolean
    tournamentName?: string
    isCurrentWeek?: boolean
    isLocked?: boolean
    onClick?: () => void // Optional custom click handler
    projected?: {
        stage: string
        tournamentName: string
        tournamentId: string
        week: number
        isConfimed?: boolean
        reason?: string // e.g. "Forecast"
    }
}

/** Score from the player's side: round score for a BO1, map score otherwise. */
function playerScore(match: MatchSaveData, playerTeamId: string): string | null {
    if (!match.result) return null
    const isHome = match.homeTeamId === playerTeamId
    const maps = (match as CompletedMatchSaveData).result.maps
    if (maps && maps.length === 1 && maps[0]?.finalScore) {
        const fs = maps[0].finalScore
        return isHome ? `${fs.team1}–${fs.team2}` : `${fs.team2}–${fs.team1}`
    }
    return isHome ? `${match.result.homeScore}–${match.result.awayScore}` : `${match.result.awayScore}–${match.result.homeScore}`
}

/**
 * Calendar chip for a fixture (design system v2). Official matches read
 * strongest (raised, crest, competition); scrims are quieter; forecasts are
 * dashed. Results carry a W/L edge and the score from the player's side.
 */
export const ScheduleMatchCard = memo(function ScheduleMatchCard({
    match,
    teams,
    playerTeamId,
    isScrim,
    tournamentName,
    isLocked,
    onClick,
    projected
}: ScheduleMatchCardProps) {
    const router = useRouter()

    if (match) {
        const involvesPlayer = match.homeTeamId === playerTeamId || match.awayTeamId === playerTeamId
        const opponentId = match.homeTeamId === playerTeamId ? match.awayTeamId : match.homeTeamId
        const opponent = teams.find(t => t.id === opponentId)
        const isHome = match.homeTeamId === playerTeamId
        const r = match.result
        const won = !!r && (r.winnerId ? r.winnerId === playerTeamId : isHome ? r.homeScore > r.awayScore : r.awayScore > r.homeScore)
        // Fixtures between two other clubs (tournament lists) read "A vs B" with a neutral score.
        const score = involvesPlayer ? playerScore(match, playerTeamId) : r ? `${r.homeScore}–${r.awayScore}` : null
        const label = isScrim ? "Scrim" : tournamentName || match.stage || "Match"
        const opponentName = involvesPlayer
            ? opponent?.name || "Unknown"
            : `${opponent?.name || "TBD"} vs ${teams.find(t => t.id === match.awayTeamId)?.name || "TBD"}`

        return (
            <div
                {...pressable(() => {
                    if (onClick) onClick()
                    else if (match.result) router.push(`/match/${match.id}/result`)
                }, { disabled: isLocked, label: `${involvesPlayer ? `${isScrim ? "Scrim" : "Match"} vs ` : ""}${opponentName}${score ? `, ${involvesPlayer ? (won ? "won " : "lost ") : ""}${score}` : ""}` })}
                title={`${involvesPlayer ? "vs " : ""}${opponentName} · ${label}`}
                className={cn(
                    "flex w-full min-w-0 cursor-pointer select-none items-center gap-2 rounded-sm border-l-2 px-2 py-1.5 text-left transition-colors",
                    isScrim ? "bg-shell hover:bg-raised" : "bg-raised hover:bg-hover",
                    match.result && involvesPlayer ? (won ? "border-positive" : "border-negative") : isScrim ? "border-line-strong" : "border-ink-2",
                    isLocked && "cursor-default hover:bg-raised",
                )}
            >
                <TeamLogoDisplay team={opponent} size={18} className="shrink-0" />
                <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-xs font-semibold leading-tight", isScrim ? "text-ink-2" : "text-ink-1")}>{opponentName}</span>
                    <span className="block truncate text-[11px] leading-tight text-ink-3">{label}</span>
                </span>
                {score ? (
                    <span className={cn("shrink-0 font-display text-sm font-bold tabular-nums", !involvesPlayer ? "text-ink-1" : won ? "text-positive" : "text-negative")}>{score}</span>
                ) : isLocked ? (
                    <Lock size={12} className="shrink-0 text-ink-3" aria-hidden="true" />
                ) : (
                    <span className="shrink-0 text-[11px] font-semibold text-ink-3">{match.format}</span>
                )}
            </div>
        )
    }

    if (projected) {
        return (
            <div
                title={`${projected.tournamentName} · ${projected.stage} · opponent not drawn yet`}
                className="flex w-full min-w-0 items-center gap-2 rounded-sm border border-dashed border-line-strong px-2 py-1.5 text-left"
            >
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold leading-tight text-ink-2">{projected.tournamentName}</span>
                    <span className="block truncate text-[11px] leading-tight text-ink-3">{projected.stage} · TBD</span>
                </span>
                {projected.reason && <span className="shrink-0 text-[11px] text-ink-3">{projected.reason}</span>}
            </div>
        )
    }

    return null
})
