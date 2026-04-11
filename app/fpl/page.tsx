"use client"

import React, { useMemo, useState } from "react"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
    Trophy, TrendingUp, Users, Search, Star, Crown, Zap,
    Award, Target, ChevronUp, ChevronDown, Minus, Swords,
    DollarSign, Pause
} from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { CountryFlag } from "@/components/ui/CountryFlag"
import {
    GlassTable,
    GlassTableHeader,
    GlassTableHead,
    GlassTableRow,
    GlassTableCell,
} from "@/components/ui/GlassTable"
import {
    getFPLTierName,
    getFPLTierColor,
    getFPLPlayerTypeLabel,
    getFPLPlayerTypeColor,
    FPLTier,
    FPL_CONSTANTS
} from "@/types/fpl"

export default function FPLPage() {
    const { players, playerTeamId, teams, currentWeek, fplData } = useGameStore(useShallow(state => ({
        players: state.players,
        playerTeamId: state.playerTeamId,
        teams: state.teams,
        currentWeek: state.currentWeek,
        fplData: state.fplData,
    })))

    const [searchTerm, setSearchTerm] = useState("")
    const [activeTab, setActiveTab] = useState("fpl")

    const playerTeam = teams.find(t => t.id === playerTeamId)
    const myRosterIds = playerTeam?.rosterIds || []

    // Get non-pro player metadata lookup
    const nonProLookup = useMemo(() => {
        if (!fplData?.nonProPlayers) return new Map()
        return new Map(fplData.nonProPlayers.map(np => [np.playerId, np]))
    }, [fplData?.nonProPlayers])

    // Get FPL standings with player details
    const fplStandings = useMemo(() => {
        if (!fplData?.fplStandings) return []

        return fplData.fplStandings
            .map(standing => {
                const player = players.find(p => p.id === standing.playerId)
                const stats = fplData.playerStats[standing.playerId]
                const team = teams.find(t => t.rosterIds.includes(standing.playerId))
                const nonProMeta = nonProLookup.get(standing.playerId)
                return player && stats ? { player, stats, team, standing, nonProMeta } : null
            })
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
            .filter(entry => {
                if (!searchTerm) return true
                return entry.player.nickname.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    entry.player.name.toLowerCase().includes(searchTerm.toLowerCase())
            })
    }, [fplData, players, teams, nonProLookup, searchTerm])

    // Get FPL-C standings with player details
    const fplCStandings = useMemo(() => {
        if (!fplData?.fplCStandings) return []

        return fplData.fplCStandings
            .map(standing => {
                const player = players.find(p => p.id === standing.playerId)
                const stats = fplData.playerStats[standing.playerId]
                const team = teams.find(t => t.rosterIds.includes(standing.playerId))
                const nonProMeta = nonProLookup.get(standing.playerId)
                return player && stats ? { player, stats, team, standing, nonProMeta } : null
            })
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
            .filter(entry => {
                if (!searchTerm) return true
                return entry.player.nickname.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    entry.player.name.toLowerCase().includes(searchTerm.toLowerCase())
            })
    }, [fplData, players, teams, nonProLookup, searchTerm])

    // Get season leaderboard
    const seasonLeaderboard = useMemo(() => {
        if (!fplData?.currentSeason?.leaderboard) return []

        return fplData.currentSeason.leaderboard.map(entry => {
            const player = players.find(p => p.id === entry.playerId)
            const stats = fplData.playerStats[entry.playerId]
            const team = teams.find(t => t.rosterIds.includes(entry.playerId))
            return player && stats ? { player, stats, team, points: entry.points, winRate: entry.winRate } : null
        }).filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    }, [fplData, players, teams])

    // My players' FPL rankings
    const myPlayersInFPL = useMemo(() => {
        return fplStandings.filter(entry => myRosterIds.includes(entry.player.id))
    }, [fplStandings, myRosterIds])

    const myPlayersInFPLC = useMemo(() => {
        return fplCStandings.filter(entry => myRosterIds.includes(entry.player.id))
    }, [fplCStandings, myRosterIds])

    if (!fplData) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <Trophy size={48} className="mx-auto mb-4 text-amber-400" />
                    <p className="text-white text-sm font-bold uppercase tracking-widest">
                        FPL Season Not Started
                    </p>
                    <p className="text-xs text-white/40 mt-2 max-w-sm mx-auto">
                        The Fantasy Player League begins tracking individual player performance after your first game week. Advance time to get started.
                    </p>
                </div>
            </div>
        )
    }

    const season = fplData.currentSeason
    const weeksRemaining = Math.max(0, season.endWeek - currentWeek + 1)
    const isOffSeason = !!(fplData.offSeasonEndWeek && currentWeek <= fplData.offSeasonEndWeek)
    const offSeasonWeeksLeft = isOffSeason ? fplData.offSeasonEndWeek! - currentWeek + 1 : 0

    // Hall of Champions: aggregate championship wins and earnings from all players
    const hallOfChampions = useMemo(() => {
        if (!fplData?.playerStats) return []
        return Object.values(fplData.playerStats)
            .filter(s => (s.fplChampionships || 0) > 0)
            .sort((a, b) => (b.fplChampionships || 0) - (a.fplChampionships || 0) || (b.totalFPLEarnings || 0) - (a.totalFPLEarnings || 0))
            .slice(0, 10)
            .map(stats => {
                const player = players.find(p => p.id === stats.playerId)
                return player ? { player, stats } : null
            })
            .filter((e): e is NonNullable<typeof e> => e !== null)
    }, [fplData?.playerStats, players])

    // Render standings table with zone indicators
    const renderStandingsTable = (
        standings: typeof fplStandings,
        isChallenger: boolean
    ) => (
        <GlassTable>
            <GlassTableHeader>
                <GlassTableRow>
                    <GlassTableHead className="w-16">#</GlassTableHead>
                    <GlassTableHead>Player</GlassTableHead>
                    <GlassTableHead>Team</GlassTableHead>
                    <GlassTableHead className="text-center">Points</GlassTableHead>
                    <GlassTableHead className="text-center">W/L</GlassTableHead>
                    <GlassTableHead className="text-center">Rating</GlassTableHead>
                    <GlassTableHead className="text-center">ELO</GlassTableHead>
                </GlassTableRow>
            </GlassTableHeader>
            <tbody>
                {standings.slice(0, 100).map((entry) => {
                    const isMyPlayer = myRosterIds.includes(entry.player.id)
                    const isInZone = isChallenger
                        ? entry.standing.isInPromotionZone
                        : entry.standing.isInRelegationZone

                    return (
                        <GlassTableRow
                            key={entry.player.id}
                            className={cn(
                                "cursor-pointer transition-colors",
                                isMyPlayer && "bg-cyan-500/10 hover:bg-cyan-500/15",
                                isInZone && isChallenger && "bg-emerald-500/5 border-l-4 border-l-emerald-500",
                                isInZone && !isChallenger && "bg-red-500/5 border-l-4 border-l-red-500"
                            )}
                        >
                            <GlassTableCell>
                                <div className="flex items-center gap-2">
                                    <div className={cn(
                                        "w-8 h-8 rounded-lg flex items-center justify-center font-bold",
                                        entry.standing.rank === 1 ? "bg-amber-500/20 text-amber-400" :
                                            entry.standing.rank === 2 ? "bg-gray-400/20 text-gray-300" :
                                                entry.standing.rank === 3 ? "bg-orange-600/20 text-orange-400" :
                                                    "bg-white/5 text-white/60"
                                    )}>
                                        {entry.standing.rank <= 3 ? (
                                            <Crown size={16} />
                                        ) : (
                                            entry.standing.rank
                                        )}
                                    </div>
                                    {isInZone && (
                                        <Badge className={cn(
                                            "text-[8px] px-1.5",
                                            isChallenger
                                                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                                : "bg-red-500/20 text-red-400 border-red-500/30"
                                        )}>
                                            {isChallenger ? (
                                                <><ChevronUp size={10} /> PROMO</>
                                            ) : (
                                                <><ChevronDown size={10} /> RELEG</>
                                            )}
                                        </Badge>
                                    )}
                                </div>
                            </GlassTableCell>
                            <GlassTableCell>
                                <Link href={`/player/${entry.player.id}`}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                                            <PlayerPortrait
                                                src={entry.player.portraitPath}
                                                alt={entry.player.nickname}
                                                size={40}
                                            />
                                        </div>
                                        <div>
                                            <p className="font-bold text-white flex items-center gap-2">
                                                {entry.player.nickname}
                                                {isMyPlayer && (
                                                    <Star size={12} className="text-cyan-400" fill="currentColor" />
                                                )}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <CountryFlag country={entry.player.nationality} showName={false} size={12} />
                                                {entry.nonProMeta && (
                                                    <Badge className={cn(
                                                        "text-[8px] px-1.5 py-0",
                                                        getFPLPlayerTypeColor(entry.nonProMeta.playerType)
                                                    )}>
                                                        {getFPLPlayerTypeLabel(entry.nonProMeta.playerType)}
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            </GlassTableCell>
                            <GlassTableCell>
                                <span className="text-xs text-white/60">
                                    {entry.team?.name || "Free Agent"}
                                </span>
                            </GlassTableCell>
                            <GlassTableCell className="text-center">
                                <span className="text-lg font-bold text-amber-400">
                                    {entry.standing.points}
                                </span>
                            </GlassTableCell>
                            <GlassTableCell className="text-center">
                                <span className="text-emerald-400">{entry.standing.wins}</span>
                                <span className="text-white/30">/</span>
                                <span className="text-red-400">{entry.standing.losses}</span>
                            </GlassTableCell>
                            <GlassTableCell className="text-center">
                                <span className={cn(
                                    "font-bold",
                                    entry.standing.avgRating >= 1.2 ? "text-emerald-400" :
                                        entry.standing.avgRating >= 1.0 ? "text-white" : "text-red-400"
                                )}>
                                    {entry.standing.avgRating.toFixed(2)}
                                </span>
                            </GlassTableCell>
                            <GlassTableCell className="text-center">
                                <span className="font-mono text-white/60">
                                    {entry.stats.fplElo}
                                </span>
                            </GlassTableCell>
                        </GlassTableRow>
                    )
                })}
            </tbody>
        </GlassTable>
    )

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-4xl font-normal tracking-tighter uppercase liquid-text mb-2 flex items-center gap-3">
                        <Swords className="text-amber-400" size={36} />
                        FPL Leagues
                    </h1>
                    <p className="text-muted-foreground font-medium uppercase text-xs tracking-[0.2em]">
                        Individual Player Rankings • Season {season.seasonNumber}
                    </p>
                </div>

                {/* Season Info */}
                <div className="flex gap-4">
                    <div className="glass-panel p-4 border-amber-500/20 bg-amber-500/5">
                        <div className="flex items-center gap-4">
                            <div className="text-center">
                                <p className="text-xl font-bold text-amber-400">FPL</p>
                                <p className="text-lg font-bold text-white">${FPL_CONSTANTS.PRIZE_POOL_BASE.toLocaleString()}</p>
                                <p className="text-[10px] text-white/40 uppercase">Prize Pool</p>
                            </div>
                            <div className="w-px h-10 bg-white/10" />
                            <div className="text-center">
                                <p className="text-xl font-bold text-purple-400">FPL-C</p>
                                <p className="text-lg font-bold text-white">${FPL_CONSTANTS.PRIZE_POOL_FPL_C.toLocaleString()}</p>
                                <p className="text-[10px] text-white/40 uppercase">Prize Pool</p>
                            </div>
                            <div className="w-px h-10 bg-white/10" />
                            <div className="text-center">
                                {isOffSeason ? (
                                    <>
                                        <div className="flex items-center gap-1 justify-center">
                                            <Pause size={14} className="text-orange-400" />
                                            <p className="text-lg font-bold text-orange-400">OFF-SEASON</p>
                                        </div>
                                        <p className="text-[10px] text-white/40 uppercase">{offSeasonWeeksLeft}w until Season {season.seasonNumber}</p>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-2xl font-bold text-white">{weeksRemaining}</p>
                                        <p className="text-[10px] text-white/40 uppercase">Weeks Left</p>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* My Players Quick View */}
            {(myPlayersInFPL.length > 0 || myPlayersInFPLC.length > 0) && (
                <div className="glass-panel p-6 border-cyan-500/20 bg-cyan-500/5">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-cyan-400 mb-4 flex items-center gap-2">
                        <Users size={14} /> Your Players in FPL
                    </h3>
                    <div className="flex flex-wrap gap-4">
                        {[...myPlayersInFPL, ...myPlayersInFPLC].slice(0, 5).map(entry => (
                            <Link key={entry.player.id} href={`/player/${entry.player.id}`}>
                                <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
                                    <div className="relative">
                                        <div className="w-10 h-10 rounded-lg overflow-hidden border border-white/10">
                                            <PlayerPortrait
                                                src={entry.player.portraitPath}
                                                alt={entry.player.nickname}
                                                size={40}
                                            />
                                        </div>
                                        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black flex items-center justify-center text-[10px] font-bold text-amber-400 border border-amber-500/30">
                                            #{entry.standing.rank}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white">{entry.player.nickname}</p>
                                        <div className="flex items-center gap-2">
                                            <Badge className={getFPLTierColor(entry.stats.fplTier)}>
                                                {entry.stats.fplTier}
                                            </Badge>
                                            <span className="text-xs text-white/50">{entry.stats.fplElo} ELO</span>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* Promotion/Relegation Info */}
            <div className="grid grid-cols-2 gap-4">
                <div className="glass-panel p-4 border-emerald-500/20 bg-emerald-500/5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                            <ChevronUp className="text-emerald-400" size={24} />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-emerald-400">Promotion Zone</p>
                            <p className="text-xs text-white/50">Top {FPL_CONSTANTS.PROMOTION_SLOTS} from FPL-C get promoted to FPL</p>
                        </div>
                    </div>
                </div>
                <div className="glass-panel p-4 border-red-500/20 bg-red-500/5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                            <ChevronDown className="text-red-400" size={24} />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-red-400">Relegation Zone</p>
                            <p className="text-xs text-white/50">Bottom {FPL_CONSTANTS.RELEGATION_SLOTS} non-pros from FPL get relegated</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full max-w-2xl grid-cols-4 bg-white/5">
                    <TabsTrigger value="fpl" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
                        <Crown size={14} className="mr-2" />
                        FPL Pro
                    </TabsTrigger>
                    <TabsTrigger value="fpl-c" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400">
                        <TrendingUp size={14} className="mr-2" />
                        FPL Challenger
                    </TabsTrigger>
                    <TabsTrigger value="season" className="data-[state=active]:bg-white/10">
                        <Award size={14} className="mr-2" />
                        Season
                    </TabsTrigger>
                    <TabsTrigger value="history" className="data-[state=active]:bg-white/10">
                        <Trophy size={14} className="mr-2" />
                        History
                    </TabsTrigger>
                </TabsList>

                {/* Search Bar (shared) */}
                {(activeTab === "fpl" || activeTab === "fpl-c") && (
                    <div className="mt-6 mb-4">
                        <div className="relative max-w-md">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                            <Input
                                placeholder="Search players..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-12 h-12 bg-white/5 border-white/10 rounded-xl"
                            />
                        </div>
                    </div>
                )}

                {/* FPL Pro Tab */}
                <TabsContent value="fpl" className="mt-4 space-y-6">
                    <div className="glass-panel p-4 border-amber-500/20">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-amber-400 flex items-center gap-2">
                                <Crown size={20} />
                                FPL Pro League
                            </h3>
                            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                                {fplStandings.length} Players
                            </Badge>
                        </div>
                        <p className="text-xs text-white/50 mb-4">
                            The elite tier of competitive FPL. Bottom {FPL_CONSTANTS.RELEGATION_SLOTS} non-pro players get relegated to FPL Challenger at season end.
                        </p>
                        {renderStandingsTable(fplStandings, false)}
                    </div>
                </TabsContent>

                {/* FPL Challenger Tab */}
                <TabsContent value="fpl-c" className="mt-4 space-y-6">
                    <div className="glass-panel p-4 border-purple-500/20">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-purple-400 flex items-center gap-2">
                                <TrendingUp size={20} />
                                FPL Challenger League
                            </h3>
                            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                                {fplCStandings.length} Players
                            </Badge>
                        </div>
                        <p className="text-xs text-white/50 mb-4">
                            The proving ground for rising stars. Top {FPL_CONSTANTS.PROMOTION_SLOTS} players get promoted to FPL Pro at season end.
                        </p>
                        {renderStandingsTable(fplCStandings, true)}
                    </div>
                </TabsContent>

                {/* Season Leaderboard Tab */}
                <TabsContent value="season" className="mt-6 space-y-6">
                    <div className="glass-panel p-6 border-amber-500/20">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold text-white flex items-center gap-3">
                                <Award className="text-amber-400" />
                                Season {season.seasonNumber} Leaderboard
                            </h3>
                            <div className="text-sm text-white/60">
                                Week {Math.max(1, currentWeek - season.startWeek + 1)} of {FPL_CONSTANTS.SEASON_LENGTH}
                            </div>
                        </div>

                        {/* Prize Distribution */}
                        <div className="grid grid-cols-3 gap-4 mb-8">
                            {[1, 2, 3].map(place => {
                                const entry = seasonLeaderboard[place - 1]
                                const reward = season.rewards[place - 1]
                                return (
                                    <div
                                        key={place}
                                        className={cn(
                                            "p-4 rounded-xl border text-center",
                                            place === 1 ? "bg-amber-500/10 border-amber-500/30" :
                                                place === 2 ? "bg-gray-400/10 border-gray-400/30" :
                                                    "bg-orange-600/10 border-orange-600/30"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-10 h-10 rounded-full mx-auto mb-3 flex items-center justify-center",
                                            place === 1 ? "bg-amber-500/20 text-amber-400" :
                                                place === 2 ? "bg-gray-400/20 text-gray-300" :
                                                    "bg-orange-600/20 text-orange-400"
                                        )}>
                                            <Crown size={20} />
                                        </div>
                                        <p className="text-lg font-bold text-white mb-1">
                                            ${reward?.prize.toLocaleString()}
                                        </p>
                                        <p className="text-xs text-white/40">+{reward?.xpBonus} XP</p>
                                        {entry && (
                                            <div className="mt-3 pt-3 border-t border-white/10">
                                                <p className="text-sm font-bold text-white">{entry.player.nickname}</p>
                                                <p className="text-xs text-white/50">{entry.points} pts</p>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>

                        {/* Full Leaderboard */}
                        <GlassTable>
                            <GlassTableHeader>
                                <GlassTableRow>
                                    <GlassTableHead className="w-16">#</GlassTableHead>
                                    <GlassTableHead>Player</GlassTableHead>
                                    <GlassTableHead className="text-center">Points</GlassTableHead>
                                    <GlassTableHead className="text-center">Matches</GlassTableHead>
                                    <GlassTableHead className="text-center">Win Rate</GlassTableHead>
                                </GlassTableRow>
                            </GlassTableHeader>
                            <tbody>
                                {seasonLeaderboard.slice(0, 50).map((entry, idx) => (
                                    <GlassTableRow key={entry.player.id}>
                                        <GlassTableCell>
                                            <span className={cn(
                                                "font-bold",
                                                idx < 3 ? "text-amber-400" : "text-white/60"
                                            )}>
                                                {idx + 1}
                                            </span>
                                        </GlassTableCell>
                                        <GlassTableCell>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/10">
                                                    <PlayerPortrait
                                                        src={entry.player.portraitPath}
                                                        alt={entry.player.nickname}
                                                        size={32}
                                                    />
                                                </div>
                                                <span className="font-bold text-white">{entry.player.nickname}</span>
                                            </div>
                                        </GlassTableCell>
                                        <GlassTableCell className="text-center">
                                            <span className="text-lg font-bold text-amber-400">{entry.points}</span>
                                        </GlassTableCell>
                                        <GlassTableCell className="text-center text-white/60">
                                            {entry.stats.matchesPlayed}
                                        </GlassTableCell>
                                        <GlassTableCell className="text-center">
                                            <span className={cn(
                                                "font-bold",
                                                entry.winRate >= 60 ? "text-emerald-400" :
                                                    entry.winRate >= 50 ? "text-white" : "text-red-400"
                                            )}>
                                                {entry.winRate}%
                                            </span>
                                        </GlassTableCell>
                                    </GlassTableRow>
                                ))}
                            </tbody>
                        </GlassTable>
                    </div>
                </TabsContent>

                {/* History Tab */}
                <TabsContent value="history" className="mt-6 space-y-6">
                    {/* Hall of Champions */}
                    {hallOfChampions.length > 0 && (
                        <div className="glass-panel p-6 border-amber-500/20 bg-amber-500/5">
                            <h3 className="text-lg font-bold text-amber-400 mb-4 flex items-center gap-3">
                                <Crown size={20} />
                                Hall of Champions
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                                {hallOfChampions.map((entry, idx) => (
                                    <Link key={entry.player.id} href={`/player/${entry.player.id}`}>
                                        <div className={cn(
                                            "p-3 rounded-xl border text-center hover:bg-white/5 transition-colors",
                                            idx === 0 ? "bg-amber-500/10 border-amber-500/30" : "bg-white/[0.02] border-white/10"
                                        )}>
                                            <div className="w-12 h-12 rounded-lg overflow-hidden border border-white/10 mx-auto mb-2">
                                                <PlayerPortrait src={entry.player.portraitPath} alt={entry.player.nickname} size={48} />
                                            </div>
                                            <p className={cn("font-bold text-sm", idx === 0 ? "text-amber-400" : "text-white")}>
                                                {entry.player.nickname}
                                            </p>
                                            <div className="flex items-center justify-center gap-1 mt-1">
                                                <Trophy size={12} className="text-amber-400" />
                                                <span className="text-sm font-bold text-amber-400">
                                                    {entry.stats.fplChampionships || 0}x
                                                </span>
                                            </div>
                                            <p className="text-xs text-emerald-400 mt-1 flex items-center justify-center gap-1">
                                                <DollarSign size={10} />
                                                {(entry.stats.totalFPLEarnings || 0).toLocaleString()}
                                            </p>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="glass-panel p-6">
                        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
                            <Trophy className="text-amber-400" />
                            Season History
                        </h3>

                        {fplData.seasonHistory.length === 0 ? (
                            <div className="text-center py-12 text-white/40">
                                <Trophy size={48} className="mx-auto mb-4 opacity-30" />
                                <p>No completed seasons yet</p>
                                <p className="text-sm mt-2">The first champion will be crowned at the end of Season 1</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {[...fplData.seasonHistory].reverse().map(pastSeason => {
                                    const champion = players.find(p => p.id === pastSeason.champion)
                                    const championStats = pastSeason.champion ? fplData.playerStats[pastSeason.champion] : null
                                    const seasonTierChanges = fplData.tierChanges?.filter(
                                        tc => tc.seasonNumber === pastSeason.seasonNumber
                                    ) || []
                                    const promotions = seasonTierChanges.filter(tc => tc.reason === 'PROMOTION')
                                    const demotions = seasonTierChanges.filter(tc => tc.reason === 'DEMOTION')

                                    return (
                                        <div
                                            key={pastSeason.id}
                                            className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden"
                                        >
                                            {/* Season Header */}
                                            <div className="flex items-center justify-between p-5 bg-white/5">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                                                        <Crown className="text-amber-400" size={24} />
                                                    </div>
                                                    <div>
                                                        <p className="text-lg font-bold text-white">
                                                            Season {pastSeason.seasonNumber}
                                                        </p>
                                                        <p className="text-xs text-white/40">
                                                            Weeks {pastSeason.startWeek} – {pastSeason.endWeek} • Prize Pool ${pastSeason.prizePool.toLocaleString()}
                                                        </p>
                                                    </div>
                                                </div>
                                                {champion && (
                                                    <div className="flex items-center gap-3">
                                                        <div className="text-right">
                                                            <p className="font-bold text-amber-400">{champion.nickname}</p>
                                                            <div className="flex items-center gap-2 justify-end">
                                                                <p className="text-[10px] text-white/40 uppercase tracking-widest">Champion</p>
                                                                {championStats && (championStats.fplChampionships || 0) > 1 && (
                                                                    <Badge className="text-[8px] px-1 py-0 bg-amber-500/20 text-amber-400 border-amber-500/30">
                                                                        {championStats.fplChampionships}x
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            {championStats && (
                                                                <p className="text-[10px] text-emerald-400">
                                                                    ${(championStats.totalFPLEarnings || 0).toLocaleString()} total earned
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div className="w-10 h-10 rounded-lg overflow-hidden border border-amber-500/30">
                                                            <PlayerPortrait
                                                                src={champion.portraitPath}
                                                                alt={champion.nickname}
                                                                size={40}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Top 10 Leaderboard */}
                                            {pastSeason.leaderboard && pastSeason.leaderboard.length > 0 && (
                                                <div className="px-5 pt-4 pb-2">
                                                    <h4 className="text-xs font-bold uppercase tracking-widest text-white/50 mb-3 flex items-center gap-2">
                                                        <Award size={12} /> Final Standings
                                                    </h4>
                                                    <GlassTable>
                                                        <GlassTableHeader>
                                                            <GlassTableRow>
                                                                <GlassTableHead className="w-12">#</GlassTableHead>
                                                                <GlassTableHead>Player</GlassTableHead>
                                                                <GlassTableHead className="text-center">Points</GlassTableHead>
                                                                <GlassTableHead className="text-center">Matches</GlassTableHead>
                                                                <GlassTableHead className="text-center">Win Rate</GlassTableHead>
                                                                <GlassTableHead className="text-center">Prize</GlassTableHead>
                                                            </GlassTableRow>
                                                        </GlassTableHeader>
                                                        <tbody>
                                                            {pastSeason.leaderboard.slice(0, 10).map((entry, idx) => {
                                                                const p = players.find(pl => pl.id === entry.playerId)
                                                                const isChampion = idx === 0
                                                                const isMyPlayer = myRosterIds.includes(entry.playerId)
                                                                const prize = idx < pastSeason.rewards.length ? pastSeason.rewards[idx].prize : 0
                                                                return (
                                                                    <GlassTableRow
                                                                        key={entry.playerId}
                                                                        className={cn(
                                                                            isMyPlayer && "bg-cyan-500/10"
                                                                        )}
                                                                    >
                                                                        <GlassTableCell>
                                                                            <div className={cn(
                                                                                "w-7 h-7 rounded-lg flex items-center justify-center font-bold text-sm",
                                                                                idx === 0 ? "bg-amber-500/20 text-amber-400" :
                                                                                    idx === 1 ? "bg-gray-400/20 text-gray-300" :
                                                                                        idx === 2 ? "bg-orange-600/20 text-orange-400" :
                                                                                            "bg-white/5 text-white/50"
                                                                            )}>
                                                                                {idx < 3 ? <Crown size={12} /> : idx + 1}
                                                                            </div>
                                                                        </GlassTableCell>
                                                                        <GlassTableCell>
                                                                            {p ? (
                                                                                <Link href={`/player/${p.id}`}>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <div className="w-7 h-7 rounded-md overflow-hidden border border-white/10">
                                                                                            <PlayerPortrait src={p.portraitPath} alt={p.nickname} size={28} />
                                                                                        </div>
                                                                                        <span className={cn("font-bold text-sm", isChampion ? "text-amber-400" : "text-white")}>
                                                                                            {p.nickname}
                                                                                        </span>
                                                                                        {isMyPlayer && <Star size={10} className="text-cyan-400" fill="currentColor" />}
                                                                                    </div>
                                                                                </Link>
                                                                            ) : (
                                                                                <span className="text-white/40 text-sm">{entry.playerId}</span>
                                                                            )}
                                                                        </GlassTableCell>
                                                                        <GlassTableCell className="text-center">
                                                                            <span className="font-bold text-amber-400">{entry.points}</span>
                                                                        </GlassTableCell>
                                                                        <GlassTableCell className="text-center text-white/60 text-sm">
                                                                            {entry.matchesPlayed}
                                                                        </GlassTableCell>
                                                                        <GlassTableCell className="text-center">
                                                                            <span className={cn(
                                                                                "font-bold text-sm",
                                                                                entry.winRate >= 60 ? "text-emerald-400" :
                                                                                    entry.winRate >= 50 ? "text-white" : "text-red-400"
                                                                            )}>
                                                                                {entry.winRate}%
                                                                            </span>
                                                                        </GlassTableCell>
                                                                        <GlassTableCell className="text-center">
                                                                            {prize > 0 ? (
                                                                                <span className="text-emerald-400 font-bold text-sm">${prize.toLocaleString()}</span>
                                                                            ) : (
                                                                                <span className="text-white/20">—</span>
                                                                            )}
                                                                        </GlassTableCell>
                                                                    </GlassTableRow>
                                                                )
                                                            })}
                                                        </tbody>
                                                    </GlassTable>
                                                </div>
                                            )}

                                            {/* Promotions & Relegations for this season */}
                                            {(promotions.length > 0 || demotions.length > 0) && (
                                                <div className="px-5 pt-2 pb-5">
                                                    <div className="grid grid-cols-2 gap-3">
                                                        {promotions.length > 0 && (
                                                            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                                                                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 mb-2 flex items-center gap-1">
                                                                    <ChevronUp size={12} /> Promoted to FPL
                                                                </p>
                                                                <div className="space-y-1">
                                                                    {promotions.map(tc => (
                                                                        <p key={tc.playerId} className="text-sm text-white/80">{tc.playerName}</p>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {demotions.length > 0 && (
                                                            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
                                                                <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-2 flex items-center gap-1">
                                                                    <ChevronDown size={12} /> Relegated to FPL-C
                                                                </p>
                                                                <div className="space-y-1">
                                                                    {demotions.map(tc => (
                                                                        <p key={tc.playerId} className="text-sm text-white/80">{tc.playerName}</p>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
