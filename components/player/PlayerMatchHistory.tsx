"use client"

import { useMemo, memo } from "react"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Trophy, Swords, ChevronRight, Calendar } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import Image from "next/image"

interface PlayerMatchHistoryProps {
    playerId: string
    limit?: number  // Number of matches to show (default 10)
}

export const PlayerMatchHistory = memo(function PlayerMatchHistory({ playerId, limit = 10 }: PlayerMatchHistoryProps) {
    const { completedMatches, teams, getDateForWeek, players } = useGameStore(useShallow(state => ({
        completedMatches: state.completedMatches,
        teams: state.teams,
        getDateForWeek: state.getDateForWeek,
        players: state.players,
    })))

    const teamMap = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams])

    // Find all matches where player participated
    const playerMatches = completedMatches
        .filter(match => {
            const homeTeam = teamMap.get(match.homeTeamId)
            const awayTeam = teamMap.get(match.awayTeamId)
            return homeTeam?.rosterIds.includes(playerId) ||
                awayTeam?.rosterIds.includes(playerId)
        })
        .sort((a, b) => b.week - a.week)  // Most recent first

    const totalMatches = playerMatches.length
    const displayMatches = playerMatches.slice(0, limit)

    if (displayMatches.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground">
                <Swords size={48} className="mx-auto mb-3 text-white/10" />
                <p className="text-sm">No matches played yet</p>
                <p className="text-xs">Play matches to build career history</p>
            </div>
        )
    }

    // Calculate career stats from match history
    const careerStats = playerMatches.reduce((stats, match) => {
        const playerStats = match.result?.playerStats?.[playerId]
        if (playerStats) {
            stats.kills += playerStats.kills || 0
            stats.deaths += playerStats.deaths || 0
            stats.assists += playerStats.assists || 0
            stats.totalRating += playerStats.rating || 0
            stats.matchCount++
        }

        // Count wins/losses
        const homeTeam = teamMap.get(match.homeTeamId)
        const isHome = homeTeam?.rosterIds.includes(playerId)
        const won = isHome
            ? match.result.homeScore > match.result.awayScore
            : match.result.awayScore > match.result.homeScore
        if (won) stats.wins++
        else stats.losses++

        return stats
    }, { kills: 0, deaths: 0, assists: 0, totalRating: 0, matchCount: 0, wins: 0, losses: 0 })

    const avgRating = careerStats.matchCount > 0
        ? careerStats.totalRating / careerStats.matchCount
        : 0
    const kdRatio = careerStats.deaths > 0
        ? careerStats.kills / careerStats.deaths
        : careerStats.kills

    return (
        <div className="space-y-4">
            {/* Career Overview Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="bg-white/5 border border-white/5 rounded-xl p-3 text-center">
                    <div className="text-2xl font-normal text-white">{careerStats.wins}-{careerStats.losses}</div>
                    <div className="text-[10px] text-muted-foreground uppercase font-bold">Win-Loss</div>
                </div>
                <div className="bg-white/5 border border-white/5 rounded-xl p-3 text-center">
                    <div className={cn(
                        "text-2xl font-normal",
                        avgRating >= 1.2 ? "text-emerald-400" : avgRating >= 1.0 ? "text-white" : "text-red-400"
                    )}>{avgRating.toFixed(2)}</div>
                    <div className="text-[10px] text-muted-foreground uppercase font-bold">Avg Rating</div>
                </div>
                <div className="bg-white/5 border border-white/5 rounded-xl p-3 text-center">
                    <div className={cn(
                        "text-2xl font-normal",
                        kdRatio >= 1.2 ? "text-emerald-400" : kdRatio >= 1.0 ? "text-white" : "text-red-400"
                    )}>{kdRatio.toFixed(2)}</div>
                    <div className="text-[10px] text-muted-foreground uppercase font-bold">K/D Ratio</div>
                </div>
                <div className="bg-white/5 border border-white/5 rounded-xl p-3 text-center">
                    <div className="text-2xl font-normal text-white">{careerStats.kills}</div>
                    <div className="text-[10px] text-muted-foreground uppercase font-bold">Total Kills</div>
                </div>
            </div>

            {/* Match History */}
            <h5 className="text-xs font-normal uppercase tracking-widest text-muted-foreground mb-3">
                Recent Matches ({totalMatches} total)
            </h5>

            <div className="space-y-2">
                {displayMatches.map(match => {
                    const homeTeam = teamMap.get(match.homeTeamId)
                    const awayTeam = teamMap.get(match.awayTeamId)
                    const playerTeam = homeTeam?.rosterIds.includes(playerId) ? homeTeam : awayTeam
                    const opponentTeam = playerTeam?.id === homeTeam?.id ? awayTeam : homeTeam

                    const isHome = playerTeam?.id === homeTeam?.id
                    const playerScore = isHome ? match.result.homeScore : match.result.awayScore
                    const opponentScore = isHome ? match.result.awayScore : match.result.homeScore
                    const won = playerScore > opponentScore

                    // Get player's stats in this match
                    const playerStats = match.result.playerStats?.[playerId]

                    return (
                        <Link
                            key={match.id}
                            href={`/match/${match.id}/result`}
                            className={cn(
                                "flex items-center gap-4 p-4 rounded-xl border transition-all hover:scale-[1.01]",
                                won
                                    ? "bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10"
                                    : "bg-red-500/5 border-red-500/20 hover:bg-red-500/10"
                            )}
                        >
                            {/* Result Badge */}
                            <div className={cn(
                                "w-12 h-12 rounded-lg flex items-center justify-center font-normal text-lg flex-shrink-0",
                                won ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                            )}>
                                {won ? "W" : "L"}
                            </div>

                            {/* Match Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className="font-bold text-white truncate">
                                        vs {opponentTeam?.name || "Unknown"}
                                    </span>
                                    <Badge variant="outline" className="text-[10px] border-white/10">
                                        {match.format}
                                    </Badge>
                                    {match.tournamentId && match.tournamentId !== "SCRIM" && (
                                        <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/50">
                                            <Trophy size={10} className="mr-1" />
                                            {match.stage || "Tournament"}
                                        </Badge>
                                    )}
                                    {match.isScrim && (
                                        <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400">
                                            Scrim
                                        </Badge>
                                    )}
                                </div>
                                <div className="text-xs text-muted-foreground flex items-center gap-2">
                                    <Calendar size={10} />
                                    <span>Week {match.week}</span>
                                    <span className="text-white/20">•</span>
                                    <span>{format(getDateForWeek(match.week), "MMM d, yyyy")}</span>
                                </div>
                            </div>

                            {/* Score */}
                            <div className="text-center px-4 flex-shrink-0">
                                <div className="text-2xl font-normal">
                                    <span className={won ? "text-emerald-400" : "text-white/50"}>
                                        {playerScore}
                                    </span>
                                    <span className="text-white/20 mx-1">:</span>
                                    <span className={!won ? "text-red-400" : "text-white/50"}>
                                        {opponentScore}
                                    </span>
                                </div>
                                <div className="text-[10px] text-muted-foreground">MAPS</div>
                            </div>

                            {/* Player Stats */}
                            {playerStats && (
                                <div className="hidden md:grid grid-cols-3 gap-4 text-center min-w-[180px] flex-shrink-0">
                                    <div>
                                        <div className="text-sm font-bold text-white">
                                            {playerStats.kills}/{playerStats.deaths}/{playerStats.assists}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground">K/D/A</div>
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-white">
                                            {Math.round(playerStats.adr)}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground">ADR</div>
                                    </div>
                                    <div>
                                        <div className={cn(
                                            "text-sm font-bold",
                                            playerStats.rating >= 1.2 ? "text-emerald-400" :
                                                playerStats.rating >= 1.0 ? "text-white" :
                                                    "text-red-400"
                                        )}>
                                            {playerStats.rating.toFixed(2)}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground">Rating</div>
                                    </div>
                                </div>
                            )}

                            <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
                        </Link>
                    )
                })}
            </div>

            {totalMatches > limit && (
                <div className="text-center pt-4">
                    <Button variant="ghost" className="text-xs text-muted-foreground hover:text-white">
                        View All {totalMatches} Matches
                    </Button>
                </div>
            )}
        </div>
    )
})

export default PlayerMatchHistory
