"use client"

import React, { useMemo, useState } from "react"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { useGameStore } from "@/store/game-store"
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    LineChart,
    Line,
    AreaChart,
    Area,
    Cell,
    RadarChart,
    Radar,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    PieChart,
    Pie
} from "recharts"
import {
    Activity,
    TrendingUp,
    TrendingDown,
    DollarSign,
    Zap,
    Users,
    Trophy,
    Target,
    BarChart3,
    Map,
    History as HistoryIcon,
    Swords,
    ChevronRight,
    ChevronDown,
    Medal
} from "lucide-react"
import { PlayerImage } from "@/components/ui/asset-images"
import { CountryFlag } from "@/components/ui/CountryFlag"
import {
    GlassTable,
    GlassTableHeader,
    GlassTableHead,
    GlassTableRow,
    GlassTableCell,
    GlassStatCell
} from "@/components/ui/GlassTable"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"
import { TrophyCabinet } from "@/components/squad/TrophyCabinet"

export default function StatsPage() {
    const { players, teams, playerTeamId, completedMatches, contracts, currentWeek } = useGameStore()
    const [activeTab, setActiveTab] = useState<"ANALYTICS" | "RESULTS" | "TROPHIES" | "RIVALRIES">("ANALYTICS")
    const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null)

    const playerTeam = teams.find(t => t.id === playerTeamId)
    const teamPlayers = players.filter(p => playerTeam?.rosterIds.includes(p.id))

    // Calculate EIR (Economy Impact Rating) = (Rating * 1000) / Salary
    const statsWithEIR = useMemo(() => {
        return teamPlayers.map(p => {
            const contract = contracts.find(c => c.playerId === p.id)
            const salary = contract?.salaryPerWeek || 2000
            const eir = ((p.avgRating || 1.1) * 1000) / salary

            // Build real form trend from last 7 completed matches this player participated in
            const recentRatings: number[] = []
            for (let i = completedMatches.length - 1; i >= 0 && recentRatings.length < 7; i--) {
                const m = completedMatches[i]
                const ps = m.result?.playerStats?.[p.id]
                if (ps) {
                    recentRatings.unshift(ps.rating)
                }
            }
            // Normalize ratings to 0-1 range (HLTV ratings typically 0-2.0)
            const formTrend = recentRatings.map(r => Math.min(1, r / 2.0))

            return {
                ...p,
                eir: eir.toFixed(2),
                formTrend
            }
        })
    }, [teamPlayers, contracts, completedMatches])

    // Get team's matches
    const teamMatches = useMemo(() => {
        return completedMatches
            .filter(m => m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
            .sort((a, b) => (b.week || 0) - (a.week || 0))
    }, [completedMatches, playerTeamId])

    // Calculate real win rate
    const winStats = useMemo(() => {
        const wins = teamMatches.filter(m => {
            const isHome = m.homeTeamId === playerTeamId
            return isHome ? m.result.homeScore > m.result.awayScore : m.result.awayScore > m.result.homeScore
        }).length
        const total = teamMatches.length
        return {
            wins,
            losses: total - wins,
            winRate: total > 0 ? Math.round((wins / total) * 100) : 0
        }
    }, [teamMatches, playerTeamId])

    // Chart Data: Real Performance Trend from last 6 matches
    const performanceData = useMemo(() => {
        const recentMatches = teamMatches.slice(0, 6).reverse()
        if (recentMatches.length === 0) {
            return []
        }

        let cumulativeWins = 0
        return recentMatches.map((match, idx) => {
            const isHome = match.homeTeamId === playerTeamId
            const won = isHome ? match.result.homeScore > match.result.awayScore : match.result.awayScore > match.result.homeScore
            if (won) cumulativeWins++

            const pStats = Object.values(match.result.playerStats || {})
            const teamPStats = pStats.filter(ps => playerTeam?.rosterIds.includes(ps.playerId))
            const avgRating = teamPStats.length > 0
                ? teamPStats.reduce((sum, ps) => sum + ps.rating, 0) / teamPStats.length
                : 1.0

            return {
                week: `W${match.week}`,
                rating: parseFloat(avgRating.toFixed(2)),
                winRate: Math.round((cumulativeWins / (idx + 1)) * 100)
            }
        })
    }, [teamMatches, playerTeamId, playerTeam])

    // Map Mastery Data
    const mapStats = useMemo(() => {
        const stats: Record<string, { played: number, wins: number }> = {}

        teamMatches.forEach(match => {
            const isHome = match.homeTeamId === playerTeamId
            match.result.maps.forEach(mapResult => {
                if (!stats[mapResult.map]) stats[mapResult.map] = { played: 0, wins: 0 }
                stats[mapResult.map].played++

                const homeWon = mapResult.finalScore.team1 > mapResult.finalScore.team2
                const weWon = isHome ? homeWon : !homeWon

                if (weWon) stats[mapResult.map].wins++
            })
        })

        return Object.entries(stats)
            .map(([map, data]) => ({
                subject: map,
                A: Math.round((data.wins / data.played) * 100),
                fullMark: 100,
                played: data.played
            }))
            .sort((a, b) => b.A - a.A)
            .slice(0, 6)
    }, [teamMatches, playerTeamId])

    // Team DNA (Average Attributes)
    const teamDNA = useMemo(() => {
        const validPlayers = teamPlayers
        if (validPlayers.length === 0) return []

        const totals = validPlayers.reduce((acc, p) => ({
            aim: acc.aim + ((p.rifle + p.awp + p.pistol) / 3),
            utility: acc.utility + p.grenades,
            tactics: acc.tactics + ((p.tactic + p.leader) / 2),
            clutch: acc.clutch + p.clutch,
            mental: acc.mental + ((p.morale + p.stressResistance) / 2),
            mech: acc.mech + ((p.reaction + p.eyesight) / 2)
        }), { aim: 0, utility: 0, tactics: 0, clutch: 0, mental: 0, mech: 0 })

        const count = validPlayers.length
        return [
            { subject: "Aim", A: Math.round(totals.aim / count), fullMark: 100 },
            { subject: "Utility", A: Math.round(totals.utility / count), fullMark: 100 },
            { subject: "Tactics", A: Math.round(totals.tactics / count), fullMark: 100 },
            { subject: "Clutch", A: Math.round(totals.clutch / count), fullMark: 100 },
            { subject: "Mental", A: Math.round(totals.mental / count), fullMark: 100 },
            { subject: "Mech", A: Math.round(totals.mech / count), fullMark: 100 },
        ]
    }, [teamPlayers])

    // Recent match results for history
    const recentMatches = teamMatches.slice(0, 20)

    // Get rivalries
    const rivalries = useMemo(() => {
        if (!playerTeam?.rivalries) return []
        return [...playerTeam.rivalries]
            .sort((a, b) => b.matchesPlayed - a.matchesPlayed)
            .map(r => ({
                ...r,
                opponentTeam: teams.find(t => t.id === r.opponentTeamId)
            }))
    }, [playerTeam, teams])

    const tabs = [
        { id: "ANALYTICS", label: "Analytics", icon: BarChart3 },
        { id: "RESULTS", label: "Results", icon: HistoryIcon },
        { id: "TROPHIES", label: "Trophies", icon: Trophy },
        { id: "RIVALRIES", label: "Rivalries", icon: Swords },
    ]

    const getIntensityStyle = (intensity: string) => {
        switch (intensity) {
            case "FIERCE": return "text-red-400 bg-red-500/20 border-red-500/30"
            case "HEATED": return "text-orange-400 bg-orange-500/20 border-orange-500/30"
            case "NEUTRAL": return "text-yellow-400 bg-yellow-500/20 border-yellow-500/30"
            default: return "text-emerald-400 bg-emerald-500/20 border-emerald-500/30"
        }
    }

    return (
        <ErrorBoundary section="Statistics">
        <div className="p-8 space-y-8 max-w-7xl mx-auto pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-4xl font-normal tracking-tighter uppercase liquid-text mb-2">Team Stats</h1>
                    <p className="text-muted-foreground font-medium uppercase text-xs tracking-[0.2em]">Analytics, results, trophies, and rivalries</p>
                </div>

                {/* Record Summary */}
                <div className="flex items-center gap-6 glass-panel px-6 py-4">
                    <div className="text-center">
                        <p className="text-2xl font-normal text-emerald-400">{winStats.wins}</p>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase">Wins</p>
                    </div>
                    <div className="h-10 w-px bg-white/10" />
                    <div className="text-center">
                        <p className="text-2xl font-normal text-rose-400">{winStats.losses}</p>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase">Losses</p>
                    </div>
                    <div className="h-10 w-px bg-white/10" />
                    <div className="text-center">
                        <p className="text-2xl font-normal text-primary">{winStats.winRate}%</p>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase">Win Rate</p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm uppercase tracking-wider transition-all",
                            activeTab === tab.id
                                ? "bg-primary text-[#0e1217]"
                                : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                        )}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <AnimatePresence mode="wait">
                {/* Analytics Tab */}
                {activeTab === "ANALYTICS" && (
                    <motion.div
                        key="analytics"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-8"
                    >
                        {teamMatches.length === 0 ? (
                            <div className="flex items-center justify-center min-h-[30vh]">
                                <div className="text-center space-y-2">
                                    <p className="text-muted-foreground text-sm">No match statistics yet. Play some matches first!</p>
                                </div>
                            </div>
                        ) : (
                        <>
                        {/* Top Level KPIs */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <div className="glass-panel p-6 border-primary/20 bg-primary/5">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2 rounded-xl bg-primary/20">
                                        <BarChart3 className="text-primary" size={20} />
                                    </div>
                                    <Badge className="bg-primary/20 text-primary uppercase text-[10px]">
                                        {playerTeam?.leagueTier?.replace("_", "-") || "League"}
                                    </Badge>
                                </div>
                                <p className="text-[10px] font-normal uppercase tracking-widest text-muted-foreground mb-1">World Ranking</p>
                                <p className="text-3xl font-normal text-white">#{playerTeam?.worldRanking || "-"}</p>
                                <p className="text-xs text-muted-foreground font-bold mt-2 flex items-center gap-1">
                                    Elo: {playerTeam?.elo || 1000}
                                </p>
                            </div>

                            <div className="glass-panel p-6 border-emerald-500/20 bg-emerald-500/5">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2 rounded-xl bg-emerald-500/20">
                                        <Trophy className="text-emerald-500" size={20} />
                                    </div>
                                </div>
                                <p className="text-[10px] font-normal uppercase tracking-widest text-muted-foreground mb-1">Win Rate</p>
                                <p className="text-3xl font-normal text-emerald-400">{winStats.winRate}%</p>
                                <p className="text-xs text-muted-foreground font-bold mt-2">{winStats.wins}W - {winStats.losses}L</p>
                            </div>

                            <div className="glass-panel p-6 border-blue-500/20 bg-blue-500/5">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2 rounded-xl bg-blue-500/20">
                                        <Target className="text-blue-500" size={20} />
                                    </div>
                                </div>
                                <p className="text-[10px] font-normal uppercase tracking-widest text-muted-foreground mb-1">Total Matches</p>
                                <p className="text-3xl font-normal text-white">{teamMatches.length}</p>
                                <p className="text-xs text-blue-400 font-bold mt-2">Career Total</p>
                            </div>

                            <div className="glass-panel p-6 border-amber-500/20 bg-amber-500/5">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2 rounded-xl bg-amber-500/20">
                                        <DollarSign className="text-amber-500" size={20} />
                                    </div>
                                </div>
                                <p className="text-[10px] font-normal uppercase tracking-widest text-muted-foreground mb-1">EIR Efficiency</p>
                                <p className="text-3xl font-normal text-amber-400">
                                    {statsWithEIR.length > 0
                                        ? (statsWithEIR.reduce((sum, p) => sum + parseFloat(p.eir), 0) / statsWithEIR.length).toFixed(2)
                                        : "-"}
                                </p>
                                <p className="text-xs text-amber-400 font-bold mt-2">Team Average</p>
                            </div>
                        </div>

                        {/* Deep Player Stats Table */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-normal uppercase tracking-widest text-white flex items-center gap-2">
                                <Users size={16} className="text-primary" /> Roster Deep Insights
                            </h3>
                            <GlassTable>
                                <GlassTableHeader>
                                    <GlassTableRow>
                                        <GlassTableHead>Player</GlassTableHead>
                                        <GlassTableHead className="text-center">Matches</GlassTableHead>
                                        <GlassTableHead className="text-center">Avg Rating</GlassTableHead>
                                        <GlassTableHead className="text-center text-emerald-400">EIR</GlassTableHead>
                                        <GlassTableHead className="text-center">Headshots</GlassTableHead>
                                        <GlassTableHead className="text-center">Clutch %</GlassTableHead>
                                        <GlassTableHead className="text-right">Form Trend</GlassTableHead>
                                    </GlassTableRow>
                                </GlassTableHeader>
                                <tbody>
                                    {statsWithEIR.length === 0 && (
                                        <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No player statistics available yet. Play some matches first!</td></tr>
                                    )}
                                    {statsWithEIR.map((player) => (
                                        <GlassTableRow key={player.id}>
                                            <GlassTableCell>
                                                <div className="flex items-center gap-4">
                                                    <div className="relative">
                                                        <PlayerImage
                                                            playerName={player.nickname}
                                                            teamName={playerTeam?.name || "Team"}
                                                            country={player.nationality}
                                                            size={40}
                                                            className="border-2 border-white/10"
                                                        />
                                                        <div className="absolute -bottom-1 -right-1 shadow-md">
                                                            <CountryFlag country={player.nationality} size={16} />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-white uppercase text-base tracking-wide">{player.nickname}</p>
                                                        <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">{player.role}</p>
                                                    </div>
                                                </div>
                                            </GlassTableCell>
                                            <GlassTableCell className="text-center font-sans">{player.matchesPlayed}</GlassTableCell>
                                            <GlassStatCell value={Math.round((player.avgRating || 1.1) * 70)} max={140} />
                                            <GlassTableCell className="text-center font-sans font-normal text-emerald-400">{player.eir}</GlassTableCell>
                                            <GlassTableCell className="text-center font-sans text-amber-400">{player.headshots || 0}</GlassTableCell>
                                            <GlassTableCell className="text-center font-sans">{((player.clutchSuccessRate ?? 0) * 100).toFixed(0)}%</GlassTableCell>
                                            <GlassTableCell className="text-right">
                                                <div className="flex items-end justify-end gap-0.5 h-6">
                                                    {player.formTrend.length > 0 ? player.formTrend.map((v: number, i: number) => (
                                                        <div
                                                            key={i}
                                                            className={cn(
                                                                "w-1 rounded-t-sm",
                                                                i === player.formTrend.length - 1 ? "bg-primary" : "bg-white/10"
                                                            )}
                                                            style={{ height: `${Math.max(5, v * 100)}%` }}
                                                        />
                                                    )) : (
                                                        <span className="text-[9px] text-white/20">—</span>
                                                    )}
                                                </div>
                                            </GlassTableCell>
                                        </GlassTableRow>
                                    ))}
                                </tbody>
                            </GlassTable>
                        </div>

                        {/* Main Charts Row */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* Performance Trend */}
                            <div className="glass-panel p-8 min-h-[400px]">
                                <h3 className="text-sm font-normal uppercase tracking-widest text-white mb-8 flex items-center gap-2">
                                    <TrendingUp size={16} className="text-primary" /> Performance Momentum
                                </h3>
                                <div className="h-[300px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={performanceData}>
                                            <defs>
                                                <linearGradient id="colorRating" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                            <XAxis dataKey="week" stroke="rgba(255,255,255,0.3)" fontSize={10} axisLine={false} tickLine={false} />
                                            <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} axisLine={false} tickLine={false} domain={[0.8, 1.4]} />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: "#000", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px" }}
                                                itemStyle={{ fontSize: "12px", fontWeight: "bold" }}
                                            />
                                            <Area type="monotone" dataKey="rating" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorRating)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Efficiency Chart */}
                            <div className="glass-panel p-8 min-h-[400px]">
                                <h3 className="text-sm font-normal uppercase tracking-widest text-white mb-8 flex items-center gap-2">
                                    <Zap size={16} className="text-emerald-400" /> Economic Efficiency (EIR)
                                </h3>
                                <div className="h-[300px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={statsWithEIR}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                            <XAxis dataKey="nickname" stroke="rgba(255,255,255,0.3)" fontSize={10} axisLine={false} tickLine={false} />
                                            <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} axisLine={false} tickLine={false} />
                                            <Tooltip
                                                cursor={{ fill: "rgba(255,255,255,0.05)" }}
                                                contentStyle={{ backgroundColor: "#000", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px" }}
                                            />
                                            <Bar dataKey="eir" radius={[4, 4, 0, 0]}>
                                                {statsWithEIR.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={parseFloat(entry.eir) > 0.6 ? "#10b981" : "#34d399"} fillOpacity={0.8} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        {/* Second Row: Deep Analysis */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Map Mastery */}
                            <div className="glass-panel p-8 min-h-[400px]">
                                <h3 className="text-sm font-normal uppercase tracking-widest text-white mb-8 flex items-center gap-2">
                                    <Map size={16} className="text-amber-400" /> Map Mastery (Win %)
                                </h3>
                                <div className="h-[300px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={mapStats} layout="vertical" margin={{ left: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                                            <XAxis type="number" domain={[0, 100]} stroke="rgba(255,255,255,0.3)" fontSize={10} axisLine={false} tickLine={false} />
                                            <YAxis dataKey="subject" type="category" stroke="rgba(255,255,255,0.8)" fontSize={11} fontWeight="bold" width={80} axisLine={false} tickLine={false} />
                                            <Tooltip
                                                cursor={{ fill: "rgba(255,255,255,0.05)" }}
                                                contentStyle={{ backgroundColor: "#000", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px" }}
                                                formatter={(value: number) => [`${value}%`, "Win Rate"]}
                                            />
                                            <Bar dataKey="A" radius={[0, 4, 4, 0]}>
                                                {mapStats.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.A > 50 ? "#10b981" : "#ef4444"} fillOpacity={0.8} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Team DNA */}
                            <div className="glass-panel p-8 min-h-[400px]">
                                <h3 className="text-sm font-normal uppercase tracking-widest text-white mb-8 flex items-center gap-2">
                                    <Activity size={16} className="text-purple-400" /> Team DNA
                                </h3>
                                <div className="h-[300px] w-full flex items-center justify-center">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={teamDNA}>
                                            <PolarGrid stroke="rgba(255,255,255,0.1)" />
                                            <PolarAngleAxis dataKey="subject" tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: "bold" }} />
                                            <PolarRadiusAxis angle={30} domain={[0, 20]} tick={false} axisLine={false} />
                                            <Radar
                                                name="Team Average"
                                                dataKey="A"
                                                stroke="#a855f7"
                                                strokeWidth={3}
                                                fill="#a855f7"
                                                fillOpacity={0.3}
                                            />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: "#000", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px" }}
                                            />
                                        </RadarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                        </>
                        )}
                    </motion.div>
                )}

                {/* Results Tab */}
                {activeTab === "RESULTS" && (
                    <motion.div
                        key="results"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-4"
                    >
                        {recentMatches.length === 0 ? (
                            <div className="glass-panel p-12 text-center">
                                <HistoryIcon size={48} className="mx-auto mb-4 text-white/20" />
                                <p className="text-muted-foreground">No matches played yet</p>
                            </div>
                        ) : (
                            recentMatches.map((match, idx) => {
                                const isHome = match.homeTeamId === playerTeamId
                                const homeTeam = teams.find(t => t.id === match.homeTeamId)
                                const awayTeam = teams.find(t => t.id === match.awayTeamId)
                                const opponent = isHome ? awayTeam : homeTeam
                                const homeWon = match.result.homeScore > match.result.awayScore
                                const won = (isHome && homeWon) || (!isHome && !homeWon)
                                const score = isHome
                                    ? `${match.result.homeScore} - ${match.result.awayScore}`
                                    : `${match.result.awayScore} - ${match.result.homeScore}`

                                return (
                                    <motion.div
                                        key={match.id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className={cn(
                                            "glass-panel overflow-hidden transition-all duration-300 border-l-4 cursor-pointer hover:bg-white/5",
                                            won ? "border-l-emerald-500" : "border-l-rose-500",
                                            expandedMatchId === match.id ? "bg-white/5" : ""
                                        )}
                                        onClick={() => setExpandedMatchId(expandedMatchId === match.id ? null : match.id)}
                                    >
                                        <div className="p-4 flex items-center gap-4">
                                            <div className={cn(
                                                "w-10 h-10 rounded-xl flex items-center justify-center font-normal",
                                                won ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                                            )}>
                                                {won ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className={cn(
                                                        "font-bold uppercase text-sm",
                                                        won ? "text-emerald-400" : "text-rose-400"
                                                    )}>
                                                        {won ? "WIN" : "LOSS"}
                                                    </span>
                                                    <span className="text-white/50">vs</span>
                                                    <span className="font-bold text-white">{opponent?.name}</span>
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    Week {match.week} • {match.stage || "League Match"}
                                                </p>
                                            </div>

                                            <div className="text-right">
                                                <p className="text-xl font-sans font-bold text-white">{score}</p>
                                                {/* Map Details - Showing detailed scores */}
                                                {(match.result as any).maps && (match.result as any).maps.length > 0 && (
                                                    <div className="flex flex-col items-end gap-0.5 mt-1">
                                                        {(match.result as any).maps.map((m: any, i: number) => {
                                                            const home = m.homeScore ?? m.finalScore?.team1 ?? 0
                                                            const away = m.awayScore ?? m.finalScore?.team2 ?? 0
                                                            const mapName = typeof m.map === 'string' ? m.map : (m.mapName || `Map ${i + 1}`)
                                                            return (
                                                                <span key={i} className="text-[10px] text-muted-foreground uppercase">
                                                                    {mapName} {home}-{away}
                                                                </span>
                                                            )
                                                        })}
                                                    </div>
                                                )}
                                                <div className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground uppercase mt-1">
                                                    {isHome ? "Home" : "Away"}
                                                    {expandedMatchId === match.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Match Analysis Details */}
                                        <AnimatePresence>
                                            {expandedMatchId === match.id && (match as any).analysis && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="px-4 pb-4 border-t border-white/5 bg-black/20"
                                                >
                                                    <div className="pt-4 space-y-4">
                                                        <div className="flex items-start gap-3">
                                                            <div className="p-2 rounded bg-primary/10 text-primary">
                                                                <Activity size={16} />
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-medium text-white">Match Analysis</p>
                                                                <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                                                                    {(match as any).analysis.summary}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="bg-white/5 rounded p-3">
                                                                <p className="text-[10px] uppercase font-bold text-emerald-400 mb-1">Winning Factor</p>
                                                                <p className="text-xs text-white">{(match as any).analysis.winningFactor}</p>
                                                            </div>
                                                            <div className="bg-white/5 rounded p-3">
                                                                <p className="text-[10px] uppercase font-bold text-rose-400 mb-1">Losing Factor</p>
                                                                <p className="text-xs text-white">{(match as any).analysis.losingFactor}</p>
                                                            </div>
                                                        </div>

                                                        <div>
                                                            <p className="text-[10px] uppercase font-bold text-muted-foreground mb-2">Team Performance Ratings</p>
                                                            <div className="grid grid-cols-4 gap-2">
                                                                <div className="bg-white/5 rounded p-2 text-center">
                                                                    <p className="text-xs font-bold text-white">{(match as any).analysis.teamPerformance.aimRating}</p>
                                                                    <p className="text-[9px] uppercase text-muted-foreground flex items-center justify-center gap-1">
                                                                        <Target size={8} /> Aim
                                                                    </p>
                                                                </div>
                                                                <div className="bg-white/5 rounded p-2 text-center">
                                                                    <p className="text-xs font-bold text-white">{(match as any).analysis.teamPerformance.tradingRating}</p>
                                                                    <p className="text-[9px] uppercase text-muted-foreground flex items-center justify-center gap-1">
                                                                        <Users size={8} /> Trades
                                                                    </p>
                                                                </div>
                                                                <div className="bg-white/5 rounded p-2 text-center">
                                                                    <p className="text-xs font-bold text-white">{(match as any).analysis.teamPerformance.economyRating}</p>
                                                                    <p className="text-[9px] uppercase text-muted-foreground flex items-center justify-center gap-1">
                                                                        <Zap size={8} /> Eco
                                                                    </p>
                                                                </div>
                                                                <div className="bg-white/5 rounded p-2 text-center">
                                                                    <p className="text-xs font-bold text-white">{(match as any).analysis.teamPerformance.utilityRating}</p>
                                                                    <p className="text-[9px] uppercase text-muted-foreground flex items-center justify-center gap-1">
                                                                        <Activity size={8} /> Util
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div>
                                                            <p className="text-[10px] uppercase font-bold text-muted-foreground mb-2">Round History (Map 1)</p>
                                                            <div className="flex gap-1 flex-wrap">
                                                                {match.result?.maps?.[0]?.rounds?.map((round: any, rIdx: number) => {
                                                                    const map = match.result.maps[0]
                                                                    const isHomeCT = rIdx < 12
                                                                        ? (map as any).ctStartTeam === match.homeTeamId || (map as any).ctStartTeamId === match.homeTeamId
                                                                        : (map as any).ctStartTeam !== match.homeTeamId && (map as any).ctStartTeamId !== match.homeTeamId

                                                                    const homeWonRound = (isHomeCT && round.winningSide === 'CT') || (!isHomeCT && round.winningSide === 'T')
                                                                    const userIsHome = match.homeTeamId === playerTeamId
                                                                    const userWon = userIsHome ? homeWonRound : !homeWonRound

                                                                    return (
                                                                        <div
                                                                            key={rIdx}
                                                                            className={cn(
                                                                                "h-8 flex-1 min-w-[10px] rounded-sm relative group",
                                                                                userWon ? "bg-emerald-500/40 hover:bg-emerald-500" : "bg-rose-500/40 hover:bg-rose-500"
                                                                            )}
                                                                        >
                                                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-black text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10 pointer-events-none">
                                                                                Round {rIdx + 1}: {userWon ? "WON" : "LOST"} ({round.winType})
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                )
                            })
                        )}
                    </motion.div>
                )}

                {/* Trophy Case Tab */}
                {activeTab === "TROPHIES" && (
                    <motion.div
                        key="trophies"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                    >
                        <TrophyCabinet trophies={(playerTeam?.trophies || []) as any} title="Team Trophy Case" />
                    </motion.div>
                )}

                {/* Rivalries Tab */}
                {activeTab === "RIVALRIES" && (
                    <motion.div
                        key="rivalries"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-4"
                    >
                        {rivalries.length === 0 ? (
                            <div className="glass-panel p-12 text-center">
                                <Swords size={48} className="mx-auto mb-4 text-white/20" />
                                <p className="text-muted-foreground">Play more matches to develop rivalries with other teams</p>
                            </div>
                        ) : (
                            rivalries.map((rivalry, idx) => {
                                const winRate = rivalry.matchesPlayed > 0
                                    ? Math.round((rivalry.wins / rivalry.matchesPlayed) * 100)
                                    : 0

                                return (
                                    <motion.div
                                        key={rivalry.opponentTeamId}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="glass-panel p-4 flex items-center gap-4"
                                    >
                                        <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
                                            {(rivalry.opponentTeam as any)?.logoPath ? (
                                                <Image
                                                    src={(rivalry.opponentTeam as any).logoPath}
                                                    alt={rivalry.opponentTeam?.name || ""}
                                                    width={40}
                                                    height={40}
                                                    className="object-contain"
                                                />
                                            ) : (
                                                <Swords size={20} className="text-white/30" />
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-white">{rivalry.opponentTeam?.name}</span>
                                                <Badge className={cn("text-[10px]", getIntensityStyle(rivalry.intensity))}>
                                                    {rivalry.intensity}
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                Last played: Week {rivalry.lastPlayed}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-6 text-center">
                                            <div>
                                                <p className="text-lg font-bold text-white">{rivalry.matchesPlayed}</p>
                                                <p className="text-[10px] text-muted-foreground uppercase">Matches</p>
                                            </div>
                                            <div>
                                                <p className="text-lg font-bold text-emerald-400">{rivalry.wins}</p>
                                                <p className="text-[10px] text-muted-foreground uppercase">Wins</p>
                                            </div>
                                            <div>
                                                <p className="text-lg font-bold text-rose-400">{rivalry.losses}</p>
                                                <p className="text-[10px] text-muted-foreground uppercase">Losses</p>
                                            </div>
                                            <div>
                                                <p className={cn(
                                                    "text-lg font-bold",
                                                    winRate >= 50 ? "text-emerald-400" : "text-rose-400"
                                                )}>{winRate}%</p>
                                                <p className="text-[10px] text-muted-foreground uppercase">Win%</p>
                                            </div>
                                        </div>
                                    </motion.div>
                                )
                            })
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div >
        </ErrorBoundary>
    )
}
