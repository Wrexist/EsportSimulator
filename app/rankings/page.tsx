"use client"

import React, { useMemo, useState } from "react"
import { useDebounce } from "@/hooks/useDebounce"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import Image from "next/image"
import { PlayerPortrait, TeamLogoImage } from "@/components/ui/asset-images"
import {
    TrendingUp,
    TrendingDown,
    Award,
    Shield,
    Globe,
    Zap,
    ChevronRight,
    Search,
    X,
    User,
    Crown,
    Calendar,
    ArrowUp,
    ArrowDown
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
    GlassTable,
    GlassTableHeader,
    GlassTableHead,
    GlassTableRow,
    GlassTableCell,
} from "@/components/ui/GlassTable"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { calculateTeamTier, getTierStyle, getDisplayPlayerTier, TierLevel } from "@/engine/tier-system"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { getTeamFlag, getTeamRegion } from "@/engine/region-logic"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { LeagueEngine, LEAGUE_TIERS, TIER_DISPLAY, LeagueTier } from "@/engine/league-engine"
import { CircuitPointsManager } from "@/engine/tournament-qualification"

export default function RankingsPage() {
    const { teams, playerTeamId, players, currentWeek, isPlayerScouted, completedMatches, circuitPoints } = useGameStore(useShallow(state => ({
        teams: state.teams,
        playerTeamId: state.playerTeamId,
        players: state.players,
        currentWeek: state.currentWeek,
        isPlayerScouted: state.isPlayerScouted,
        completedMatches: state.completedMatches,
        circuitPoints: state.circuitPoints,
    })))
    const [searchTerm, setSearchTerm] = useState("")
    const debouncedSearch = useDebounce(searchTerm, 300)
    const [selectedTier, setSelectedTier] = useState<TierLevel | "ALL">("ALL")
    const [activeTab, setActiveTab] = useState<"WORLD" | "S_TIER" | "A_TIER" | "B_TIER" | "TROPHIES" | "CIRCUIT">("WORLD")
    const [selectedTeam, setSelectedTeam] = useState<any | null>(null)

    const playerTeam = teams.find(t => t.id === playerTeamId)

    // Calculate rankings based on Elo (Phase 19)
    const rankedTeams = useMemo(() => {
        return [...teams]
            .sort((a, b) => (b.elo || 1000) - (a.elo || 1000))
            .map((team, index) => {
                const worldRanking = index + 1
                const tier = calculateTeamTier(worldRanking)

                // Calculate team overall rating
                const roster = team.rosterIds
                    .map(id => players.find(p => p.id === id))
                    .filter(Boolean)
                const avgRating = roster.length > 0
                    ? Math.round(roster.reduce((sum, player) => {
                        const evaluation = evaluatePlayer(player as any)
                        return sum + evaluation.overallRating
                    }, 0) / roster.length)
                    : 0

                // Calculate recent form (last 5 matches)
                const teamMatches = completedMatches
                    .filter(m => m.homeTeamId === team.id || m.awayTeamId === team.id)
                    .sort((a, b) => b.week - a.week)
                    .slice(0, 5)
                const recentForm = teamMatches.map(m => {
                    const isHome = m.homeTeamId === team.id
                    const won = isHome ? m.result.homeScore > m.result.awayScore : m.result.awayScore > m.result.homeScore
                    return won ? 'W' : 'L'
                })

                return {
                    ...team,
                    worldRanking,
                    tier,
                    avgRating,
                    recentForm,
                }
            })
    }, [teams, players, completedMatches])

    // Get teams by league tier
    const getTeamsByLeagueTier = (tier: LeagueTier) => {
        return rankedTeams
            .filter(t => t.leagueTier === tier)
            .sort((a, b) => (b.elo || 1000) - (a.elo || 1000))
    }

    // Filter teams for display
    const displayTeams = useMemo(() => {
        let filtered = rankedTeams

        // Apply league tier filter
        if (activeTab === "S_TIER" || activeTab === "A_TIER" || activeTab === "B_TIER") {
            filtered = getTeamsByLeagueTier(activeTab as LeagueTier)
        }

        // Apply search filter
        if (debouncedSearch) {
            filtered = filtered.filter(t =>
                t.name.toLowerCase().includes(debouncedSearch.toLowerCase())
            )
        }

        return filtered
    }, [rankedTeams, activeTab, debouncedSearch])

    // Count teams by league tier
    const leagueTierCounts = useMemo(() => ({
        S_TIER: rankedTeams.filter(t => t.leagueTier === "S_TIER").length,
        A_TIER: rankedTeams.filter(t => t.leagueTier === "A_TIER").length,
        B_TIER: rankedTeams.filter(t => t.leagueTier === "B_TIER").length,
    }), [rankedTeams])

    // Season info
    const seasonInfo = useMemo(() => ({
        season: LeagueEngine.getCurrentSeason(currentWeek || 1),
        weeksRemaining: LeagueEngine.getWeeksRemainingInSeason(currentWeek || 1),
        isSeasonEnd: LeagueEngine.isSeasonEnd(currentWeek || 1),
    }), [currentWeek])

    // Circuit Points leaderboard
    const circuitLeaderboard = useMemo(() => {
        if (!circuitPoints) return []
        return CircuitPointsManager.getLeaderboard(circuitPoints, 50).map(entry => ({
            ...entry,
            team: teams.find(t => t.id === entry.teamId)
        })).filter(e => e.team)
    }, [circuitPoints, teams])

    // Player team's league position
    const playerLeaguePosition = useMemo(() => {
        if (!playerTeamId) return null
        const team = rankedTeams.find(t => t.id === playerTeamId)
        if (!team) return null

        const tierTeams = rankedTeams.filter(t => t.leagueTier === team.leagueTier)
        const positionInTier = tierTeams.findIndex(t => t.id === playerTeamId) + 1

        return {
            worldRank: team.worldRanking,
            tier: team.leagueTier,
            positionInTier,
            totalInTier: tierTeams.length,
            isPromotionZone: positionInTier <= 3 && team.leagueTier !== "S_TIER",
            isRelegationZone: positionInTier > tierTeams.length - 3 && team.leagueTier !== "B_TIER",
            elo: team.elo,
        }
    }, [rankedTeams, playerTeamId])

    return (
        <div className="p-8 space-y-8 max-w-7xl mx-auto">
            {/* Header with Season Info */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-4xl font-normal tracking-tighter uppercase liquid-text mb-2 flex items-center gap-4">
                        {activeTab === "TROPHIES" ? "Trophy Room" :
                         activeTab === "CIRCUIT" ? "Circuit Points" :
                         activeTab === "WORLD" ? "World Rankings" :
                         TIER_DISPLAY[activeTab as LeagueTier]?.label + " Division"}
                        <Badge className="bg-primary/20 text-primary border-primary/20">S{seasonInfo.season}</Badge>
                    </h1>
                    <p className="text-muted-foreground font-medium uppercase text-xs tracking-[0.2em]">
                        {activeTab === "TROPHIES" ? "Your organization's legacy" :
                         activeTab === "CIRCUIT" ? "Tournament performance standings" :
                         `Elo-based rankings • ${seasonInfo.weeksRemaining} weeks until season end`}
                    </p>
                </div>

                {/* Season Progress Card */}
                {playerLeaguePosition && activeTab !== "TROPHIES" && activeTab !== "CIRCUIT" && (
                    <div className="glass-panel px-4 py-3 border-white/5 flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Crown size={16} className="text-amber-400" />
                            <span className="text-xs font-bold text-white">#{playerLeaguePosition.worldRank}</span>
                        </div>
                        <div className="h-6 w-px bg-white/10" />
                        <div className="flex items-center gap-2">
                            <Badge className={cn("text-[9px]", TIER_DISPLAY[playerLeaguePosition.tier as LeagueTier]?.bgColor, TIER_DISPLAY[playerLeaguePosition.tier as LeagueTier]?.color)}>
                                {TIER_DISPLAY[playerLeaguePosition.tier as LeagueTier]?.shortLabel}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                                {playerLeaguePosition.positionInTier}/{playerLeaguePosition.totalInTier}
                            </span>
                            {playerLeaguePosition.isPromotionZone && (
                                <ArrowUp size={12} className="text-emerald-400" />
                            )}
                            {playerLeaguePosition.isRelegationZone && (
                                <ArrowDown size={12} className="text-red-400" />
                            )}
                        </div>
                        <div className="h-6 w-px bg-white/10" />
                        <span className="text-xs font-sans text-primary">{playerLeaguePosition.elo || 1000} ELO</span>
                    </div>
                )}
            </div>

            {/* Tab Navigation */}
            <div className="flex items-center gap-3 overflow-x-auto pb-2">
                <div className="glass-panel p-1 flex gap-1 border-white/5">
                    <button
                        onClick={() => setActiveTab("WORLD")}
                        className={cn(
                            "px-4 py-2 rounded-xl text-[10px] font-normal uppercase tracking-widest transition-all flex items-center gap-2 outline-none",
                            activeTab === "WORLD"
                                ? "bg-blue-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.5)] focus:bg-blue-500 active:bg-blue-500 focus:text-white active:text-white"
                                : "text-muted-foreground hover:bg-white/5 focus:bg-white/5 active:bg-white/10"
                        )}
                    >
                        <Globe size={12} />
                        World
                    </button>
                    {(["S_TIER", "A_TIER", "B_TIER"] as const).map(tier => (
                        <button
                            key={tier}
                            onClick={() => setActiveTab(tier)}
                            className={cn(
                                "px-4 py-2 rounded-xl text-[10px] font-normal uppercase tracking-widest transition-all flex items-center gap-2 outline-none",
                                activeTab === tier
                                    ? `${TIER_DISPLAY[tier].bgColor} ${TIER_DISPLAY[tier].color} shadow-lg focus:${TIER_DISPLAY[tier].bgColor} active:${TIER_DISPLAY[tier].bgColor}`
                                    : "text-muted-foreground hover:bg-white/5 focus:bg-white/5 active:bg-white/10"
                            )}
                        >
                            {tier === "S_TIER" && <Crown size={12} />}
                            {tier === "A_TIER" && <Shield size={12} />}
                            {tier === "B_TIER" && <TrendingUp size={12} />}
                            {TIER_DISPLAY[tier].shortLabel} ({leagueTierCounts[tier]})
                        </button>
                    ))}
                    <button
                        onClick={() => setActiveTab("TROPHIES")}
                        className={cn(
                            "px-4 py-2 rounded-xl text-[10px] font-normal uppercase tracking-widest transition-all flex items-center gap-2 outline-none",
                            activeTab === "TROPHIES"
                                ? "bg-amber-500/20 text-amber-400 shadow-lg focus:bg-amber-500/20 active:bg-amber-500/20 focus:text-amber-400 active:text-amber-400"
                                : "text-muted-foreground hover:bg-white/5 focus:bg-white/5 active:bg-white/10"
                        )}
                    >
                        <Award size={12} />
                        Trophies
                    </button>
                    <button
                        onClick={() => setActiveTab("CIRCUIT")}
                        className={cn(
                            "px-4 py-2 rounded-xl text-[10px] font-normal uppercase tracking-widest transition-all flex items-center gap-2 outline-none",
                            activeTab === "CIRCUIT"
                                ? "bg-purple-500/20 text-purple-400 shadow-lg focus:bg-purple-500/20 active:bg-purple-500/20 focus:text-purple-400 active:text-purple-400"
                                : "text-muted-foreground hover:bg-white/5 focus:bg-white/5 active:bg-white/10"
                        )}
                    >
                        <Zap size={12} />
                        Circuit Points
                    </button>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {activeTab !== "TROPHIES" && activeTab !== "CIRCUIT" ? (
                    <motion.div
                        key="rankings"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="space-y-6"
                    >
                        {/* Search */}
                        <div className="flex flex-wrap gap-3">
                            <div className="relative flex-1 min-w-[200px] max-w-md">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                                <Input
                                    placeholder="Search teams..."
                                    aria-label="Search teams"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-11 h-10 bg-white/5 border-white/10 rounded-lg text-sm"
                                />
                            </div>
                        </div>

                        {/* Rankings Table */}
                        <div className="glass-panel p-0 border-white/5 overflow-hidden">
                            <GlassTable>
                                <GlassTableHeader>
                                    <GlassTableRow>
                                        <GlassTableHead className="w-20">Rank</GlassTableHead>
                                        <GlassTableHead>Team</GlassTableHead>
                                        <GlassTableHead className="text-center">League</GlassTableHead>
                                        <GlassTableHead className="text-center">Elo</GlassTableHead>
                                        <GlassTableHead className="text-center">OVR</GlassTableHead>
                                        <GlassTableHead className="text-center">Form</GlassTableHead>
                                        <GlassTableHead className="text-right"></GlassTableHead>
                                    </GlassTableRow>
                                </GlassTableHeader>
                                <tbody>
                                    <AnimatePresence mode="popLayout">
                                        {displayTeams.map((team: any, idx: number) => {
                                            const tierStyle = getTierStyle(team.tier)
                                            const leagueTierInfo = TIER_DISPLAY[team.leagueTier as LeagueTier]
                                            const tierTeams = rankedTeams.filter(t => t.leagueTier === team.leagueTier)
                                            const posInTier = tierTeams.findIndex(t => t.id === team.id) + 1
                                            const isPromotionZone = posInTier <= 3 && team.leagueTier !== "S_TIER"
                                            const isRelegationZone = posInTier > tierTeams.length - 3 && team.leagueTier !== "B_TIER"
                                            return (
                                                <motion.tr
                                                    key={team.id}
                                                    layout
                                                    initial={{ opacity: 0, x: -20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: idx * 0.02 }}
                                                    onClick={() => setSelectedTeam(team)}
                                                    className={cn(
                                                        "group border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer",
                                                        team.id === playerTeamId && "bg-primary/5 border-l-2 border-l-primary",
                                                        isPromotionZone && "bg-emerald-500/5",
                                                        isRelegationZone && "bg-red-500/5"
                                                    )}
                                                >
                                                    <GlassTableCell>
                                                        <div className="flex items-center gap-2">
                                                            <span className={cn(
                                                                "text-xl font-normal italic",
                                                                team.worldRanking === 1 ? "text-amber-400" :
                                                                    team.worldRanking === 2 ? "text-slate-300" :
                                                                        team.worldRanking === 3 ? "text-amber-700" : "text-white/30"
                                                            )}>
                                                                #{team.worldRanking}
                                                            </span>
                                                        </div>
                                                    </GlassTableCell>
                                                    <GlassTableCell>
                                                        <div className="flex items-center gap-4">
                                                            {/* Team Logo */}
                                                            <div className={cn(
                                                                "w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden group-hover:scale-110 transition-transform",
                                                                team.id === playerTeamId
                                                                    ? "bg-amber-500/20 border-2 border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.4)]"
                                                                    : "bg-white/5 border border-white/10"
                                                            )}>
                                                                <TeamLogoImage
                                                                    src={team.logoPath}
                                                                    alt={team.name}
                                                                    size={36}
                                                                    team={team}
                                                                />
                                                            </div>
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-bold text-white uppercase tracking-tight">{team.name}</span>
                                                                    {team.id === playerTeamId && <Crown className="w-4 h-4 text-amber-400 fill-amber-400/20 ml-2" />}
                                                                </div>
                                                                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                                                                    <CountryFlag country={getTeamFlag(team.rosterIds, players)} showName={false} size={16} />
                                                                    <span className={cn("font-normal uppercase ml-1", tierStyle.color)}>{tierStyle.label}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </GlassTableCell>
                                                    <GlassTableCell className="text-center">
                                                        <Badge className={cn("text-[9px] font-normal px-2 py-0.5", leagueTierInfo?.bgColor, leagueTierInfo?.color, "border-none")}>
                                                            {team.leagueTier === "S_TIER" && <Crown size={10} className="mr-1" />}
                                                            {team.leagueTier === "A_TIER" && <Shield size={10} className="mr-1" />}
                                                            {team.leagueTier === "B_TIER" && <TrendingUp size={10} className="mr-1" />}
                                                            {leagueTierInfo?.label || "?"}
                                                        </Badge>
                                                    </GlassTableCell>
                                                    <GlassTableCell className="text-center">
                                                        <span className={cn(
                                                            "text-lg font-mono font-bold",
                                                            (team.elo || 1000) >= 1400 ? "text-amber-400" :
                                                                (team.elo || 1000) >= 1100 ? "text-blue-400" : "text-emerald-400"
                                                        )}>
                                                            {team.elo || 1000}
                                                        </span>
                                                    </GlassTableCell>
                                                    <GlassTableCell className="text-center">
                                                        <span className={cn(
                                                            "text-lg font-normal",
                                                            team.avgRating >= 80 ? "text-emerald-400" :
                                                                team.avgRating >= 70 ? "text-blue-400" :
                                                                    team.avgRating >= 60 ? "text-amber-400" : "text-white/50"
                                                        )}>
                                                            {team.avgRating}
                                                        </span>
                                                    </GlassTableCell>
                                                    <GlassTableCell className="text-center">
                                                        <div className="flex items-center justify-center gap-1">
                                                            {(team.recentForm || []).length > 0 ? (
                                                                team.recentForm.map((result: string, i: number) => (
                                                                    <div
                                                                        key={i}
                                                                        className={cn(
                                                                            "w-4 h-4 rounded-full text-[8px] font-normal flex items-center justify-center",
                                                                            result === 'W' ? "bg-emerald-500 text-black" : "bg-red-500 text-white"
                                                                        )}
                                                                    >
                                                                        {result}
                                                                    </div>
                                                                ))
                                                            ) : (
                                                                <span className="text-[10px] text-muted-foreground">--</span>
                                                            )}
                                                        </div>
                                                    </GlassTableCell>
                                                    <GlassTableCell className="text-right">
                                                        <button className="p-2 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-white transition-colors">
                                                            <ChevronRight size={18} />
                                                        </button>
                                                    </GlassTableCell>
                                                </motion.tr>
                                            )
                                        })}
                                    </AnimatePresence>
                                </tbody>
                            </GlassTable>
                        </div>

                        {displayTeams.length > 50 && (
                            <p className="text-center text-muted-foreground text-sm">
                                Showing 50 of {displayTeams.length} teams
                            </p>
                        )}
                    </motion.div>
                ) : activeTab === "TROPHIES" ? (
                    <motion.div
                        key="trophies"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="grid grid-cols-1 md:grid-cols-3 gap-6"
                    >
                        {playerTeam?.trophies && playerTeam.trophies.length > 0 ? (
                            playerTeam.trophies.map((trophy, idx) => (
                                <div key={`${trophy.tournamentId}_${idx}`} className="glass-panel p-8 flex flex-col items-center gap-4 text-center group border-white/5 hover:border-primary/20 transition-all">
                                    <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 relative">
                                        <Award size={48} className="text-primary group-hover:scale-110 transition-transform" />
                                        <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-normal text-white uppercase tracking-tight">{trophy.tournamentName}</h3>
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mt-1">Champion • Week {trophy.week}</p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="col-span-full py-20 flex flex-col items-center text-center">
                                <Award size={64} className="text-white/5 mb-6" />
                                <h3 className="text-xl font-normal text-white uppercase">Your legacy begins</h3>
                                <p className="text-xs text-muted-foreground uppercase tracking-[0.1em] mt-2">Win tournaments to fill your trophy cabinet.</p>
                            </div>
                        )}
                    </motion.div>
                ) : (
                    <motion.div
                        key="circuit"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="space-y-6"
                    >
                        {/* Circuit Points Table */}
                        <div className="glass-panel p-0 border-white/5 overflow-hidden">
                            <GlassTable>
                                <GlassTableHeader>
                                    <GlassTableRow>
                                        <GlassTableHead className="w-20">Rank</GlassTableHead>
                                        <GlassTableHead>Team</GlassTableHead>
                                        <GlassTableHead className="text-center">Points</GlassTableHead>
                                        <GlassTableHead className="text-center">Results</GlassTableHead>
                                        <GlassTableHead className="text-right">Best Finish</GlassTableHead>
                                    </GlassTableRow>
                                </GlassTableHeader>
                                <tbody>
                                    <AnimatePresence mode="popLayout">
                                        {circuitLeaderboard.length > 0 ? circuitLeaderboard.map((entry: any, idx: number) => {
                                            const team = entry.team
                                            const bestResult = entry.results?.reduce((best: any, r: any) =>
                                                !best || r.placement < best.placement ? r : best, null)
                                            return (
                                                <motion.tr
                                                    key={entry.teamId}
                                                    layout
                                                    initial={{ opacity: 0, x: -20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: idx * 0.02 }}
                                                    className={cn(
                                                        "group border-b border-white/5 hover:bg-white/5 transition-colors",
                                                        team?.id === playerTeamId && "bg-primary/5 border-l-2 border-l-primary"
                                                    )}
                                                >
                                                    <GlassTableCell>
                                                        <span className={cn(
                                                            "text-xl font-normal italic",
                                                            idx === 0 ? "text-amber-400" :
                                                                idx === 1 ? "text-slate-300" :
                                                                    idx === 2 ? "text-amber-700" : "text-white/30"
                                                        )}>
                                                            #{idx + 1}
                                                        </span>
                                                    </GlassTableCell>
                                                    <GlassTableCell>
                                                        <div className="flex items-center gap-4">
                                                            <div className={cn(
                                                                "w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden",
                                                                team?.id === playerTeamId
                                                                    ? "bg-amber-500/20 border-2 border-amber-400"
                                                                    : "bg-white/5 border border-white/10"
                                                            )}>
                                                                <TeamLogoImage
                                                                    src={team?.logoPath}
                                                                    alt={team?.name || 'Team'}
                                                                    size={36}
                                                                    team={team}
                                                                />
                                                            </div>
                                                            <div>
                                                                <span className="font-bold text-white uppercase tracking-tight">{team?.name || 'Unknown'}</span>
                                                                {team?.id === playerTeamId && <Crown className="inline w-4 h-4 text-amber-400 fill-amber-400/20 ml-2" />}
                                                            </div>
                                                        </div>
                                                    </GlassTableCell>
                                                    <GlassTableCell className="text-center">
                                                        <span className={cn(
                                                            "text-2xl font-mono font-bold",
                                                            entry.points >= 2000 ? "text-amber-400" :
                                                                entry.points >= 1000 ? "text-purple-400" :
                                                                    entry.points >= 500 ? "text-blue-400" : "text-white/60"
                                                        )}>
                                                            {entry.points.toLocaleString()}
                                                        </span>
                                                    </GlassTableCell>
                                                    <GlassTableCell className="text-center">
                                                        <span className="text-sm text-muted-foreground">
                                                            {entry.results?.length || 0} tournaments
                                                        </span>
                                                    </GlassTableCell>
                                                    <GlassTableCell className="text-right">
                                                        {bestResult ? (
                                                            <div className="flex items-center justify-end gap-2">
                                                                <Badge className={cn(
                                                                    "text-[9px]",
                                                                    bestResult.placement === 1 ? "bg-amber-500/20 text-amber-400" :
                                                                        bestResult.placement === 2 ? "bg-slate-500/20 text-slate-300" :
                                                                            bestResult.placement <= 4 ? "bg-amber-700/20 text-amber-600" :
                                                                                "bg-white/10 text-white/60"
                                                                )}>
                                                                    {bestResult.placement === 1 ? '1st' :
                                                                     bestResult.placement === 2 ? '2nd' :
                                                                     bestResult.placement === 3 ? '3rd' :
                                                                     `${bestResult.placement}th`}
                                                                </Badge>
                                                                <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                                                                    {bestResult.tournamentName}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground">--</span>
                                                        )}
                                                    </GlassTableCell>
                                                </motion.tr>
                                            )
                                        }) : (
                                            <tr>
                                                <GlassTableCell colSpan={5} className="text-center py-12">
                                                    <Zap size={48} className="mx-auto text-white/10 mb-4" />
                                                    <p className="text-muted-foreground">No circuit points awarded yet</p>
                                                    <p className="text-xs text-muted-foreground mt-1">Play in tournaments to earn circuit points</p>
                                                </GlassTableCell>
                                            </tr>
                                        )}
                                    </AnimatePresence>
                                </tbody>
                            </GlassTable>
                        </div>

                        {/* Circuit Points Info */}
                        <div className="glass-panel p-6 border-white/5">
                            <h3 className="text-xs font-normal uppercase tracking-widest text-muted-foreground mb-4">How Circuit Points Work</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                                <div className="p-4 bg-amber-500/10 rounded-xl border border-amber-500/20">
                                    <p className="text-2xl font-bold text-amber-400">2000</p>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">S-Tier 1st</p>
                                </div>
                                <div className="p-4 bg-blue-500/10 rounded-xl border border-blue-500/20">
                                    <p className="text-2xl font-bold text-blue-400">500</p>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">A-Tier 1st</p>
                                </div>
                                <div className="p-4 bg-purple-500/10 rounded-xl border border-purple-500/20">
                                    <p className="text-2xl font-bold text-purple-400">150</p>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">B-Tier 1st</p>
                                </div>
                                <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                                    <p className="text-2xl font-bold text-emerald-400">50</p>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">C-Tier 1st</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Footer Stats */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-6 glass-panel p-6 border-white/5">
                <div className="flex items-center gap-4 text-muted-foreground">
                    <Zap size={20} className="text-primary" />
                    <div>
                        <p className="text-[10px] font-normal uppercase tracking-widest text-white">Ranking System</p>
                        <p className="text-xs">Based on team reputation and tournament performance</p>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <div className="text-center">
                        <p className="text-[10px] font-normal uppercase tracking-widest text-muted-foreground">Week</p>
                        <p className="text-sm font-bold text-white">{currentWeek || 1} / 52</p>
                    </div>
                    <div className="h-10 w-px bg-white/10" />
                    <div className="text-center">
                        <p className="text-[10px] font-normal uppercase tracking-widest text-muted-foreground">Total Teams</p>
                        <p className="text-sm font-bold font-mono text-primary">{rankedTeams.length}</p>
                    </div>
                </div>
            </div>

            {/* Team Detail Modal */}
            <AnimatePresence>
                {selectedTeam && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={() => setSelectedTeam(null)}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            onClick={(e) => e.stopPropagation()}
                            className="glass-panel w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl border-white/10"
                        >
                            {/* Modal Header */}
                            <div className="p-6 border-b border-white/5 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
                                        <TeamLogoImage
                                            src={selectedTeam.logoPath}
                                            alt={selectedTeam.name}
                                            size={56}
                                            team={selectedTeam}
                                        />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-normal text-white">{selectedTeam.name}</h2>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Badge className={cn("text-[10px]", getTierStyle(selectedTeam.tier).bgColor, getTierStyle(selectedTeam.tier).borderColor, getTierStyle(selectedTeam.tier).color)}>
                                                {getTierStyle(selectedTeam.tier).label}
                                            </Badge>
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <CountryFlag country={selectedTeam.region} showName={true} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedTeam(null)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                                    <X size={20} className="text-white/50 hover:text-white" />
                                </button>
                            </div>

                            {/* Modal Content - Scrollable */}
                            <div className="p-6 overflow-y-auto custom-scrollbar">
                                <h3 className="text-xs font-normal uppercase tracking-widest text-muted-foreground mb-4">Active Roster</h3>
                                <div className="space-y-2">
                                    {selectedTeam.rosterIds.map((id: string) => {
                                        const player = players.find(p => p.id === id)
                                        if (!player) return null
                                        const ev = evaluatePlayer(player as any)
                                        const pTier = getDisplayPlayerTier(ev.overallRating, selectedTeam?.tier as TierLevel)
                                        const pStyle = getTierStyle(pTier)

                                        return (
                                            <div key={id} className="flex items-center gap-4 p-3 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                                                <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 relative">
                                                    <PlayerPortrait
                                                        src={player.portraitPath}
                                                        alt={player.nickname}
                                                        size={48}
                                                    />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-white">{player.nickname}</span>
                                                        <Badge className={cn("text-[8px] px-1.5 py-0", pStyle.bgColor, pStyle.borderColor, pStyle.color)}>
                                                            {pStyle.shortLabel}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                                                        <span>{(player.role || "Rifler").split(",")[0]}</span>
                                                        <span>•</span>
                                                        <CountryFlag country={player.nationality} showName={true} size={12} className="text-[10px]" />
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    {(() => {
                                                        // Fog of war: show exact only if scouted or own team
                                                        const isOwnTeam = selectedTeam.id === playerTeamId
                                                        const isScouted = isPlayerScouted(player.id) || isOwnTeam

                                                        if (isScouted) {
                                                            return (
                                                                <>
                                                                    <span className={cn(
                                                                        "text-xl font-normal",
                                                                        ev.overallRating >= 80 ? "text-emerald-400" :
                                                                            ev.overallRating >= 70 ? "text-blue-400" :
                                                                                ev.overallRating >= 60 ? "text-amber-400" : "text-white/50"
                                                                    )}>
                                                                        {ev.overallRating}
                                                                    </span>
                                                                    <p className="text-[8px] text-muted-foreground font-bold">OVR</p>
                                                                </>
                                                            )
                                                        } else {
                                                            const min = Math.max(0, ev.overallRating - 15)
                                                            const max = Math.min(99, ev.overallRating + 15)
                                                            return (
                                                                <>
                                                                    <span className="text-lg font-mono text-white/40">{min}-{max}</span>
                                                                    <p className="text-[8px] text-muted-foreground font-bold">OVR</p>
                                                                </>
                                                            )
                                                        }
                                                    })()}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    )
}
