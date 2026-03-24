"use client"

import React, { useMemo } from "react"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import {
    Trophy,
    Award,
    Star,
    Crown,
    TrendingUp,
    ChevronDown,
    Minus,
    Globe,
    Medal
} from "lucide-react"
import {
    GlassTable,
    GlassTableHeader,
    GlassTableHead,
    GlassTableRow,
    GlassTableCell
} from "@/components/ui/GlassTable"
import { Badge } from "@/components/ui/badge"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

export default function TrophyRoomPage() {
    const { teams, playerTeamId, players, completedMatches, gameStartDate } = useGameStore(useShallow(state => ({
        teams: state.teams,
        playerTeamId: state.playerTeamId,
        players: state.players,
        completedMatches: state.completedMatches,
        gameStartDate: state.gameStartDate,
    })))
    const playerTeam = teams.find(t => t.id === playerTeamId)

    // Calculate real ELO change per team from their last completed match
    const teamEloChanges = useMemo(() => {
        const changes: Record<string, number> = {}
        for (const team of teams) {
            // Find last match involving this team (iterate backwards for efficiency)
            for (let i = completedMatches.length - 1; i >= 0; i--) {
                const m = completedMatches[i]
                if (m.homeTeamId === team.id) {
                    changes[team.id] = m.eloChange?.home ?? 0
                    break
                } else if (m.awayTeamId === team.id) {
                    changes[team.id] = m.eloChange?.away ?? 0
                    break
                }
            }
            if (changes[team.id] === undefined) changes[team.id] = 0
        }
        return changes
    }, [teams, completedMatches])

    // World Rankings (sorted by ELO, consistent with Rankings page)
    const worldRankings = useMemo(() => {
        return [...teams]
            .sort((a, b) => b.elo - a.elo)
            .map((t, i) => ({
                ...t,
                rank: i + 1,
                points: Math.floor(t.reputation * 10),
                trend: (teamEloChanges[t.id] ?? 0) > 0 ? "up" as const : (teamEloChanges[t.id] ?? 0) < 0 ? "down" as const : "stable" as const,
                trendValue: Math.abs(teamEloChanges[t.id] ?? 0)
            }))
    }, [teams, teamEloChanges])

    // Real trophies from game state
    const trophies = (playerTeam?.trophies || []).map((t: any, i: number) => ({
        id: t.tournamentId || `tr_${i}`,
        name: t.tournamentName,
        year: Math.floor((gameStartDate ? new Date(gameStartDate).getFullYear() : 2025) + (t.week || 0) / 52),
        tier: t.tier || "B",
        icon: (t.tier === "S" || t.tier === "A")
            ? <Crown className="text-amber-400" />
            : <Trophy className="text-amber-400" />,
        mvpName: t.mvpId ? players.find(p => p.id === t.mvpId)?.nickname : undefined
    }))

    const currentRank = worldRankings.findIndex(t => t.id === playerTeamId) + 1
    const peakRank = (playerTeam as any)?.peakRank || currentRank || 1

    return (
        <div className="p-8 space-y-12 max-w-7xl mx-auto pb-20">
            {/* Hero Section: World Ranking */}
            <div className="relative">
                <div className="absolute inset-0 bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
                <div className="relative flex flex-col md:flex-row items-end justify-between gap-8 pb-12 border-b border-white/5">
                    <div>
                        <h1 className="text-6xl font-normal tracking-tighter uppercase liquid-text leading-none mb-4">World Rankings</h1>
                        <p className="text-muted-foreground font-medium uppercase text-sm tracking-[0.3em] flex items-center gap-2">
                            <Globe size={16} /> Global CS2 Team Standings
                        </p>
                    </div>

                    <div className="flex bg-white/5 p-8 rounded-[32px] border border-white/10 backdrop-blur-xl items-center gap-8">
                        <div className="text-center">
                            <p className="text-[10px] font-normal uppercase tracking-widest text-muted-foreground mb-2">Current Rank</p>
                            <p className="text-5xl font-normal text-white">#{currentRank || "—"}</p>
                        </div>
                        <div className="w-px h-12 bg-white/10" />
                        <div className="text-center">
                            <p className="text-[10px] font-normal uppercase tracking-widest text-muted-foreground mb-2">Peak Rank</p>
                            <p className="text-5xl font-normal text-white/40">#{peakRank || "—"}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                {/* Trophy Room Section */}
                <div className="lg:col-span-1 space-y-8">
                    <h2 className="text-xl font-normal uppercase tracking-widest flex items-center gap-2">
                        <Medal className="text-amber-400" /> Trophy Cabinet
                    </h2>

                    <div className="grid grid-cols-1 gap-4">
                        {trophies.map((trophy, i) => (
                            <motion.div
                                key={trophy.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className="glass-panel p-6 border-white/5 flex items-center gap-6 group hover:border-amber-400/30 transition-all cursor-pointer"
                            >
                                <div className="w-16 h-16 rounded-2xl bg-amber-400/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    {React.cloneElement(trophy.icon as React.ReactElement, { size: 32 })}
                                </div>
                                <div>
                                    <h4 className="font-normal text-white uppercase tracking-tight">{trophy.name}</h4>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Badge className="bg-amber-400/20 text-amber-500 uppercase text-[8px] font-normal">{trophy.tier}-Tier</Badge>
                                        <span className="text-xs text-muted-foreground font-bold">{trophy.year}</span>
                                        {trophy.mvpName && <span className="text-[9px] text-white/30">MVP: {trophy.mvpName}</span>}
                                    </div>
                                </div>
                            </motion.div>
                        ))}

                        {trophies.length === 0 && (
                            <div className="py-20 text-center glass-panel opacity-40">
                                <Trophy size={40} className="mx-auto mb-4" />
                                <p className="text-[10px] font-normal uppercase tracking-widest">No trophies earned yet</p>
                            </div>
                        )}
                    </div>

                </div>

                {/* Rankings Table */}
                <div className="lg:col-span-2 space-y-8">
                    <h2 className="text-xl font-normal uppercase tracking-widest flex items-center gap-2">
                        <Star className="text-primary" /> Global Elite List
                    </h2>

                    <GlassTable>
                        <GlassTableHeader>
                            <GlassTableRow>
                                <GlassTableHead>Rank</GlassTableHead>
                                <GlassTableHead>Team</GlassTableHead>
                                <GlassTableHead className="text-center font-bold">Elo Points</GlassTableHead>
                                <GlassTableHead className="text-right">Trend</GlassTableHead>
                            </GlassTableRow>
                        </GlassTableHeader>
                        <tbody>
                            {worldRankings.slice(0, 10).map((team) => (
                                <GlassTableRow key={team.id} className={cn(team.id === playerTeamId && "bg-primary/10 border-primary/20")}>
                                    <GlassTableCell>
                                        <div className="flex items-center gap-4">
                                            <span className={cn(
                                                "text-xl font-normal",
                                                team.rank === 1 ? "text-amber-400" : team.rank === 2 ? "text-slate-300" : team.rank === 3 ? "text-amber-600" : "text-white/40"
                                            )}>
                                                #{team.rank}
                                            </span>
                                        </div>
                                    </GlassTableCell>
                                    <GlassTableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center font-normal">
                                                {team.name[0]}
                                            </div>
                                            <span className="font-normal text-white uppercase tracking-tight">{team.name}</span>
                                            {team.rank === 1 && <Crown size={12} className="text-amber-400" />}
                                        </div>
                                    </GlassTableCell>
                                    <GlassTableCell className="text-center">
                                        <span className="font-sans font-normal text-primary text-lg">{team.points}</span>
                                    </GlassTableCell>
                                    <GlassTableCell className="text-right">
                                        <div className={cn(
                                            "flex items-center justify-end gap-1 font-normal text-[10px]",
                                            team.trend === "up" ? "text-emerald-400" : team.trend === "down" ? "text-rose-400" : "text-white/30"
                                        )}>
                                            {team.trend === "up" ? <TrendingUp size={12} /> : team.trend === "down" ? <ChevronDown size={12} /> : <Minus size={12} />}
                                            {team.trendValue}
                                        </div>
                                    </GlassTableCell>
                                </GlassTableRow>
                            ))}
                        </tbody>
                    </GlassTable>
                </div>
            </div>
        </div>
    )
}
