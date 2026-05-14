"use client"

import React, { useMemo } from "react"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { WEEKS_PER_YEAR } from "@/lib/constants"
import {
    Trophy,
    Star,
    Crown,
    Medal,
    Target,
    Flame,
    Calendar,
    TrendingUp,
    Award,
    Swords
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
    S: { label: "S-Tier", color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/30", icon: <Crown size={20} className="text-amber-400" /> },
    A: { label: "A-Tier", color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/30", icon: <Star size={20} className="text-blue-400" /> },
    B: { label: "B-Tier", color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/30", icon: <Medal size={20} className="text-purple-400" /> },
    C: { label: "C-Tier", color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/30", icon: <Trophy size={20} className="text-emerald-400" /> },
}

export default function TrophyRoomPage() {
    const { teams, playerTeamId, players, completedMatches, gameStartDate, currentWeek } = useGameStore(useShallow(state => ({
        teams: state.teams,
        playerTeamId: state.playerTeamId,
        players: state.players,
        completedMatches: state.completedMatches,
        gameStartDate: state.gameStartDate,
        currentWeek: state.currentWeek,
    })))

    const playerTeam = teams.find(t => t.id === playerTeamId)
    const parsedYear = gameStartDate ? new Date(gameStartDate).getFullYear() : 2025
    const startYear = isNaN(parsedYear) ? 2025 : parsedYear

    // Build trophy list with computed year
    const trophies = useMemo(() => {
        return (playerTeam?.trophies || []).map((t: any, i: number) => {
            const year = Math.floor(startYear + (t.week || 0) / WEEKS_PER_YEAR)
            // Normalize tier: engine stores "S_TIER" but TIER_CONFIG uses "S"
            const tier = (t.tier || "B_TIER").replace("_TIER", "")
            return {
                id: t.tournamentId || `tr_${i}`,
                name: t.tournamentName || "Unknown Tournament",
                week: t.week || 0,
                year,
                tier,
                mvpName: t.mvpId ? players.find(p => p.id === t.mvpId)?.nickname : undefined,
                mvpId: t.mvpId,
            }
        }).sort((a: any, b: any) => b.week - a.week) // Most recent first
    }, [playerTeam?.trophies, players, startYear])

    // Group trophies by season/year
    const trophiesByYear = useMemo(() => {
        const grouped: Record<number, typeof trophies> = {}
        for (const t of trophies) {
            if (!grouped[t.year]) grouped[t.year] = []
            grouped[t.year].push(t)
        }
        return Object.entries(grouped)
            .sort(([a], [b]) => Number(b) - Number(a))
    }, [trophies])

    // Trophy count by tier
    const tierCounts = useMemo(() => {
        const counts: Record<string, number> = { S: 0, A: 0, B: 0, C: 0 }
        for (const t of trophies) {
            if (counts[t.tier] !== undefined) counts[t.tier]++
        }
        return counts
    }, [trophies])

    // Match stats for the team (O(n) with Map lookup)
    const matchStats = useMemo(() => {
        const teamMap = new Map(teams.map(t => [t.id, t]))
        let wins = 0, losses = 0, tournamentWins = 0
        const opponents: Record<string, { name: string; wins: number; losses: number }> = {}

        for (const m of completedMatches) {
            const isHome = m.homeTeamId === playerTeamId
            const isAway = m.awayTeamId === playerTeamId
            if (!isHome && !isAway) continue

            const won = m.result?.winnerId === playerTeamId
            if (won) wins++; else losses++

            if (m.tournamentId && won) tournamentWins++

            const oppId = isHome ? m.awayTeamId : m.homeTeamId
            const oppTeam = teamMap.get(oppId)
            if (oppTeam) {
                if (!opponents[oppId]) opponents[oppId] = { name: oppTeam.name, wins: 0, losses: 0 }
                if (won) opponents[oppId].wins++; else opponents[oppId].losses++
            }
        }

        const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0

        // Best rivalry (most matches played)
        const topRival = Object.values(opponents)
            .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses))[0]

        return { wins, losses, winRate, tournamentWins, topRival }
    }, [completedMatches, playerTeamId, teams])

    const currentSeason = Math.floor((currentWeek - 1) / WEEKS_PER_YEAR) + 1
    const totalTrophies = trophies.length

    return (
        <div className="p-8 space-y-12 max-w-7xl mx-auto pb-20">
            {/* Hero Section */}
            <div className="relative">
                <div className="absolute inset-0 bg-amber-500/5 blur-[150px] rounded-full pointer-events-none" />
                <div className="relative pb-12 border-b border-white/5">
                    <div className="flex flex-col md:flex-row items-end justify-between gap-8">
                        <div>
                            <Badge variant="outline" className="text-amber-400 border-amber-400/20 mb-4 px-4 py-1 rounded-full uppercase tracking-widest text-[10px] font-bold">
                                Season {currentSeason}
                            </Badge>
                            <h1 className="text-6xl font-normal tracking-tighter uppercase liquid-text leading-none mb-4">
                                Trophy Room
                            </h1>
                            <p className="text-muted-foreground font-medium uppercase text-sm tracking-[0.3em] flex items-center gap-2">
                                <Trophy size={16} className="text-amber-400" /> {playerTeam?.name || "Your Team"} — Legacy & Achievements
                            </p>
                        </div>

                        {/* Career Stats Summary */}
                        <div className="flex bg-white/5 p-6 rounded-[32px] border border-white/10 backdrop-blur-xl items-center gap-6">
                            <div className="text-center px-2">
                                <p className="text-[10px] font-normal uppercase tracking-widest text-muted-foreground mb-2">Trophies</p>
                                <p className="text-4xl font-normal text-amber-400">{totalTrophies}</p>
                            </div>
                            <div className="w-px h-10 bg-white/10" />
                            <div className="text-center px-2">
                                <p className="text-[10px] font-normal uppercase tracking-widest text-muted-foreground mb-2">Win Rate</p>
                                <p className="text-4xl font-normal text-white">{matchStats.winRate}%</p>
                            </div>
                            <div className="w-px h-10 bg-white/10" />
                            <div className="text-center px-2">
                                <p className="text-[10px] font-normal uppercase tracking-widest text-muted-foreground mb-2">Record</p>
                                <p className="text-4xl font-normal text-white/60">
                                    <span className="text-emerald-400">{matchStats.wins}</span>
                                    <span className="text-white/20">-</span>
                                    <span className="text-rose-400">{matchStats.losses}</span>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tier Breakdown Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(["S", "A", "B", "C"] as const).map((tier) => {
                    const config = TIER_CONFIG[tier]
                    const count = tierCounts[tier]
                    return (
                        <motion.div
                            key={tier}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: ["S", "A", "B", "C"].indexOf(tier) * 0.08 }}
                            className={cn(
                                "glass-panel p-6 border",
                                count > 0 ? config.border : "border-white/5 opacity-40"
                            )}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", config.bg)}>
                                    {config.icon}
                                </div>
                                <span className={cn("text-3xl font-normal", count > 0 ? config.color : "text-white/20")}>
                                    {count}
                                </span>
                            </div>
                            <p className={cn("text-xs font-bold uppercase tracking-widest", count > 0 ? "text-white/60" : "text-white/20")}>
                                {config.label}
                            </p>
                        </motion.div>
                    )
                })}
            </div>

            {/* Main Content */}
            {totalTrophies === 0 ? (
                /* Empty State */
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="py-24 text-center"
                >
                    <div className="w-24 h-24 mx-auto mb-8 rounded-[2rem] bg-white/[0.03] border border-white/10 flex items-center justify-center">
                        <Trophy size={40} className="text-white/10" />
                    </div>
                    <h2 className="text-2xl font-normal text-white/30 uppercase tracking-wider mb-3">No Trophies Yet</h2>
                    <p className="text-sm text-white/15 max-w-md mx-auto leading-relaxed">
                        Every dynasty starts with a single victory. Enter tournaments, build your roster, and claim your first title.
                    </p>
                    <div className="flex items-center justify-center gap-8 mt-12 text-white/10">
                        <div className="flex flex-col items-center gap-2">
                            <Target size={24} />
                            <span className="text-[9px] uppercase tracking-widest">Compete</span>
                        </div>
                        <div className="text-white/5">→</div>
                        <div className="flex flex-col items-center gap-2">
                            <Flame size={24} />
                            <span className="text-[9px] uppercase tracking-widest">Dominate</span>
                        </div>
                        <div className="text-white/5">→</div>
                        <div className="flex flex-col items-center gap-2">
                            <Crown size={24} />
                            <span className="text-[9px] uppercase tracking-widest">Conquer</span>
                        </div>
                    </div>
                </motion.div>
            ) : (
                /* Trophy Timeline by Year */
                <div className="space-y-12">
                    {trophiesByYear.map(([year, yearTrophies], yearIdx) => (
                        <motion.div
                            key={year}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: yearIdx * 0.1 }}
                        >
                            {/* Year Header */}
                            <div className="flex items-center gap-4 mb-6">
                                <div className="flex items-center gap-2">
                                    <Calendar size={14} className="text-white/30" />
                                    <h2 className="text-2xl font-normal text-white uppercase tracking-tight">{year}</h2>
                                </div>
                                <div className="flex-1 h-px bg-white/5" />
                                <Badge variant="outline" className="text-white/30 border-white/10 rounded-full text-[10px] px-3">
                                    {yearTrophies.length} {yearTrophies.length === 1 ? "title" : "titles"}
                                </Badge>
                            </div>

                            {/* Trophy Cards Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {yearTrophies.map((trophy, i) => {
                                    const config = TIER_CONFIG[trophy.tier] || TIER_CONFIG.B
                                    return (
                                        <motion.div
                                            key={trophy.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: yearIdx * 0.1 + i * 0.06 }}
                                            className={cn(
                                                "glass-panel p-6 border group hover:scale-[1.01] transition-all duration-300 cursor-default",
                                                config.border
                                            )}
                                        >
                                            <div className="flex items-start gap-5">
                                                <div className={cn(
                                                    "w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform",
                                                    config.bg
                                                )}>
                                                    {trophy.tier === "S" || trophy.tier === "A"
                                                        ? <Crown size={28} className={config.color} />
                                                        : <Trophy size={28} className={config.color} />
                                                    }
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <h4 className="font-normal text-white uppercase tracking-tight text-sm leading-tight truncate">
                                                        {trophy.name}
                                                    </h4>
                                                    <div className="flex flex-wrap items-center gap-2 mt-2">
                                                        <Badge className={cn("uppercase text-[8px] font-bold border-0 rounded-md", config.bg, config.color)}>
                                                            {config.label}
                                                        </Badge>
                                                        <span className="text-[10px] text-white/20 font-mono">
                                                            Week {trophy.week}
                                                        </span>
                                                    </div>
                                                    {trophy.mvpName && (
                                                        <div className="flex items-center gap-1.5 mt-3 text-white/30">
                                                            <Award size={12} />
                                                            <span className="text-[10px] uppercase tracking-wider">
                                                                MVP: <span className="text-white/50">{trophy.mvpName}</span>
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )
                                })}
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Career Milestones Footer */}
            {totalTrophies > 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="pt-8 border-t border-white/5"
                >
                    <h3 className="text-xs font-bold uppercase tracking-[0.3em] text-white/20 mb-6 flex items-center gap-2">
                        <TrendingUp size={12} /> Career Milestones
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="glass-panel p-5 border border-white/5">
                            <Swords size={16} className="text-white/20 mb-3" />
                            <p className="text-2xl font-normal text-white">{matchStats.tournamentWins}</p>
                            <p className="text-[9px] text-white/20 uppercase tracking-widest mt-1">Tournament Match Wins</p>
                        </div>
                        <div className="glass-panel p-5 border border-white/5">
                            <Calendar size={16} className="text-white/20 mb-3" />
                            <p className="text-2xl font-normal text-white">{trophiesByYear.length}</p>
                            <p className="text-[9px] text-white/20 uppercase tracking-widest mt-1">Trophy-Winning Seasons</p>
                        </div>
                        <div className="glass-panel p-5 border border-white/5">
                            <Crown size={16} className="text-amber-400/40 mb-3" />
                            <p className="text-2xl font-normal text-amber-400">{tierCounts.S}</p>
                            <p className="text-[9px] text-white/20 uppercase tracking-widest mt-1">Major Titles</p>
                        </div>
                        {matchStats.topRival && (
                            <div className="glass-panel p-5 border border-white/5">
                                <Flame size={16} className="text-rose-400/40 mb-3" />
                                <p className="text-lg font-normal text-white truncate">{matchStats.topRival.name}</p>
                                <p className="text-[9px] text-white/20 uppercase tracking-widest mt-1">
                                    Top Rival ({matchStats.topRival.wins}W-{matchStats.topRival.losses}L)
                                </p>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </div>
    )
}
