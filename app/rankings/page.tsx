"use client"

import React, { useMemo, useState, useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useDebounce } from "@/hooks/useDebounce"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { PlayerPortrait, TeamLogoImage } from "@/components/ui/asset-images"
import {
    TrendingUp,
    Award,
    Shield,
    Globe,
    Zap,
    ChevronRight,
    Search,
    X,
    Crown,
    ArrowUp,
    ArrowDown,
    Users,
    Trophy,
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
import { getTeamFlag } from "@/engine/region-logic"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { LeagueEngine, TIER_DISPLAY, LeagueTier } from "@/engine/league-engine"
import { CircuitPointsManager } from "@/engine/tournament-qualification"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { SectionHeader } from "@/src/components/ui/SectionHeader"
import { EmptyState } from "@/src/components/ui/EmptyState"
import { StatTile } from "@/src/components/ui/StatTile"
import { PlayerCardSkeleton } from "@/src/components/ui/Skeleton"

type RankingsRowProps = {
    team: any
    posInTier: number
    tierSize: number
    teamFlag: string
    isPlayerTeam: boolean
    revealPlaystyle: boolean
    onSelect: (team: any) => void
}

// React.memo on the row means it skips re-render when parent re-renders
// unless one of its primitive/stable-reference props actually changed.
// This is the hot-path dedupe: without it, a keystroke in the search box
// re-renders every row even though most rows haven't changed.
const RankingsRow = React.memo(function RankingsRow({
    team,
    posInTier,
    tierSize,
    teamFlag,
    isPlayerTeam,
    revealPlaystyle,
    onSelect,
}: RankingsRowProps) {
    const tierStyle = getTierStyle(team.tier)
    const leagueTierInfo = TIER_DISPLAY[team.leagueTier as LeagueTier]
    const isPromotionZone = posInTier <= 3 && team.leagueTier !== "S_TIER"
    const isRelegationZone = posInTier > tierSize - 3 && team.leagueTier !== "B_TIER"

    return (
        <div
            role="row"
            onClick={() => onSelect(team)}
            className={cn(
                "group grid items-center px-4 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer h-[72px]",
                "grid-cols-[80px_minmax(240px,1fr)_120px_100px_80px_120px_56px]",
                isPlayerTeam && "bg-primary/5 border-l-2 border-l-primary",
                isPromotionZone && "bg-emerald-500/5",
                isRelegationZone && "bg-red-500/5"
            )}
        >
            {/* Rank */}
            <div className="flex items-center gap-2">
                <span
                    className={cn(
                        "text-xl font-normal italic",
                        team.worldRanking === 1 ? "text-amber-400" :
                            team.worldRanking === 2 ? "text-slate-300" :
                                team.worldRanking === 3 ? "text-amber-700" : "text-white/30"
                    )}
                >
                    #{team.worldRanking}
                </span>
            </div>

            {/* Team */}
            <div className="flex items-center gap-4 min-w-0">
                <div
                    className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden group-hover:scale-110 transition-transform shrink-0",
                        isPlayerTeam
                            ? "bg-amber-500/20 border-2 border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.4)]"
                            : "bg-white/5 border border-white/10"
                    )}
                >
                    <TeamLogoImage src={team.logoPath} alt={team.name} size={36} team={team} />
                </div>
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-white uppercase tracking-tight truncate">{team.name}</span>
                        {isPlayerTeam && <Crown className="w-4 h-4 text-amber-400 fill-amber-400/20 ml-2 shrink-0" />}
                        {/* Analyst "Data Entry" talent (scout_info) reveals opponent
                            playstyle as a small chip next to the team name. */}
                        {revealPlaystyle && !isPlayerTeam && team.playstyle && team.playstyle !== "default" && (
                            <span
                                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0"
                                title="Revealed by your Analyst's Data Entry talent"
                            >
                                {team.playstyle}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                        <CountryFlag country={teamFlag} showName={false} size={16} />
                        <span className={cn("font-normal uppercase ml-1", tierStyle.color)}>{tierStyle.label}</span>
                    </div>
                </div>
            </div>

            {/* League */}
            <div className="text-center">
                <Badge className={cn("text-[9px] font-normal px-2 py-0.5", leagueTierInfo?.bgColor, leagueTierInfo?.color, "border-none")}>
                    {team.leagueTier === "S_TIER" && <Crown size={10} className="mr-1" />}
                    {team.leagueTier === "A_TIER" && <Shield size={10} className="mr-1" />}
                    {team.leagueTier === "B_TIER" && <TrendingUp size={10} className="mr-1" />}
                    {leagueTierInfo?.label || "?"}
                </Badge>
            </div>

            {/* Elo */}
            <div className="text-center">
                <span
                    className={cn(
                        "text-lg font-mono font-bold",
                        (team.elo || 1000) >= 1400 ? "text-amber-400" :
                            (team.elo || 1000) >= 1100 ? "text-blue-400" : "text-emerald-400"
                    )}
                >
                    {team.elo || 1000}
                </span>
            </div>

            {/* OVR */}
            <div className="text-center">
                <span
                    className={cn(
                        "text-lg font-normal",
                        team.avgRating >= 80 ? "text-emerald-400" :
                            team.avgRating >= 70 ? "text-blue-400" :
                                team.avgRating >= 60 ? "text-amber-400" : "text-white/50"
                    )}
                >
                    {team.avgRating}
                </span>
            </div>

            {/* Form */}
            <div className="flex items-center justify-center gap-1">
                {(team.recentForm || []).length > 0 ? (
                    team.recentForm.map((result: string, i: number) => (
                        <div
                            // Stable key: index + value, since form is a small fixed-order list.
                            key={`${i}-${result}`}
                            className={cn(
                                "w-4 h-4 rounded-full text-[8px] font-normal flex items-center justify-center",
                                result === "W" ? "bg-emerald-500 text-black" : "bg-red-500 text-white"
                            )}
                        >
                            {result}
                        </div>
                    ))
                ) : (
                    <span className="text-[10px] text-muted-foreground">--</span>
                )}
            </div>

            {/* Chevron */}
            <div className="flex justify-end">
                <button className="p-2 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-white transition-colors">
                    <ChevronRight size={18} />
                </button>
            </div>
        </div>
    )
})

type VirtualizedRankingsListProps = {
    displayTeams: any[]
    playerTeamId: string | null | undefined
    revealPlaystyle: boolean
    posInTierByTeamId: Map<string, { posInTier: number; tierSize: number }>
    teamFlagByTeamId: Map<string, string>
    onSelectTeam: (team: any) => void
}

const VirtualizedRankingsList = React.memo(function VirtualizedRankingsList({
    displayTeams,
    playerTeamId,
    revealPlaystyle,
    posInTierByTeamId,
    teamFlagByTeamId,
    onSelectTeam,
}: VirtualizedRankingsListProps) {
    const parentRef = useRef<HTMLDivElement | null>(null)
    // Dynamic height works out-of-box via estimateSize; 72 px matches the row
    // class (`h-[72px]`) so the initial scroll height matches the real layout.
    const rowVirtualizer = useVirtualizer({
        count: displayTeams.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 72,
        overscan: 8,
    })

    return (
        <div className="glass-panel p-0 border-white/5 overflow-hidden">
            {/* Header */}
            <div
                className={cn(
                    "grid items-center px-4 h-12 border-b border-white/10 bg-white/[0.03]",
                    "grid-cols-[80px_minmax(240px,1fr)_120px_100px_80px_120px_56px]",
                    "text-[10px] font-normal text-muted-foreground uppercase tracking-[0.2em]"
                )}
                role="row"
            >
                <div>Rank</div>
                <div>Team</div>
                <div className="text-center">League</div>
                <div className="text-center">Elo</div>
                <div className="text-center">OVR</div>
                <div className="text-center">Form</div>
                <div className="text-right" />
            </div>

            {/* Scroll container + virtualized rows.
                Fixed height so the virtualizer has a viewport to compute
                against. 640 px shows ~9 rows; the rest windows in on scroll. */}
            <div ref={parentRef} className="overflow-y-auto" style={{ height: 640 }}>
                <div
                    style={{
                        height: rowVirtualizer.getTotalSize(),
                        width: "100%",
                        position: "relative",
                    }}
                >
                    {rowVirtualizer.getVirtualItems().map(v => {
                        const team = displayTeams[v.index]
                        if (!team) return null
                        const posMeta = posInTierByTeamId.get(team.id)
                        return (
                            <div
                                key={team.id}
                                style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    width: "100%",
                                    transform: `translateY(${v.start}px)`,
                                }}
                            >
                                <RankingsRow
                                    team={team}
                                    posInTier={posMeta?.posInTier ?? 0}
                                    tierSize={posMeta?.tierSize ?? 0}
                                    teamFlag={teamFlagByTeamId.get(team.id) ?? "un"}
                                    isPlayerTeam={team.id === playerTeamId}
                                    revealPlaystyle={revealPlaystyle}
                                    onSelect={onSelectTeam}
                                />
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
})

export default function RankingsPage() {
    return (
        <ErrorBoundary section="Rankings">
            <RankingsPageInner />
        </ErrorBoundary>
    )
}

function RankingsPageInner() {
    const { teams, playerTeamId, players, staff, currentWeek, isPlayerScouted, completedMatches, circuitPoints } = useGameStore(useShallow(state => ({
        teams: state.teams,
        playerTeamId: state.playerTeamId,
        players: state.players,
        staff: state.staff,
        currentWeek: state.currentWeek,
        isPlayerScouted: state.isPlayerScouted,
        completedMatches: state.completedMatches,
        circuitPoints: state.circuitPoints,
    })))

    // Analyst "Data Entry" talent (scout_info) reveals opponent playstyle.
    // Any analyst on the player team with the talent unlocked is enough.
    const revealPlaystyle = useMemo(() => {
        if (!playerTeamId) return false
        return staff.some(s =>
            s.teamId === playerTeamId &&
            s.role === "analyst" &&
            (s.unlockedTalentIds || []).some(id => id === "analyst_basics")
        )
    }, [staff, playerTeamId])
    const [searchTerm, setSearchTerm] = useState("")
    const debouncedSearch = useDebounce(searchTerm, 300)
    const [selectedTier, setSelectedTier] = useState<TierLevel | "ALL">("ALL")
    const [activeTab, setActiveTab] = useState<"WORLD" | "S_TIER" | "A_TIER" | "B_TIER" | "TROPHIES" | "CIRCUIT">("WORLD")
    const [selectedTeam, setSelectedTeam] = useState<any | null>(null)

    const playerTeam = useMemo(() => teams.find(t => t.id === playerTeamId), [teams, playerTeamId])

    // Build an O(1) player-id → player index once per `players` change. Used
    // below to replace the `players.find(p => p.id === id)` loop that
    // previously ran O(roster × players) per row per render.
    const playerById = useMemo(() => {
        const map = new Map<string, typeof players[number]>()
        for (const p of players) map.set(p.id, p)
        return map
    }, [players])

    // Precompute recent form per team once (instead of filtering the full
    // completedMatches array for every row on every render).
    const recentFormByTeamId = useMemo(() => {
        const byTeam = new Map<string, string[]>()
        // completedMatches sorted desc by week (cheap fallback when it isn't).
        const sorted = [...completedMatches].sort((a, b) => b.week - a.week)
        for (const m of sorted) {
            const homeId = m.homeTeamId
            const awayId = m.awayTeamId
            const homeList = byTeam.get(homeId)
            if (!homeList) byTeam.set(homeId, [m.result.homeScore > m.result.awayScore ? "W" : "L"])
            else if (homeList.length < 5) homeList.push(m.result.homeScore > m.result.awayScore ? "W" : "L")
            const awayList = byTeam.get(awayId)
            if (!awayList) byTeam.set(awayId, [m.result.awayScore > m.result.homeScore ? "W" : "L"])
            else if (awayList.length < 5) awayList.push(m.result.awayScore > m.result.homeScore ? "W" : "L")
        }
        return byTeam
    }, [completedMatches])

    // Calculate rankings based on Elo (Phase 19). Uses `playerById` for O(1)
    // roster lookup and `recentFormByTeamId` for O(1) form lookup.
    const rankedTeams = useMemo(() => {
        return [...teams]
            .sort((a, b) => (b.elo || 1000) - (a.elo || 1000))
            .map((team, index) => {
                const worldRanking = index + 1
                const tier = calculateTeamTier(worldRanking)

                // Calculate team overall rating via O(1) playerById lookups.
                let ratingSum = 0
                let ratingCount = 0
                for (const id of team.rosterIds) {
                    const player = playerById.get(id)
                    if (!player) continue
                    ratingSum += evaluatePlayer(player as any).overallRating
                    ratingCount++
                }
                const avgRating = ratingCount > 0 ? Math.round(ratingSum / ratingCount) : 0

                const recentForm = recentFormByTeamId.get(team.id) ?? []

                return {
                    ...team,
                    worldRanking,
                    tier,
                    avgRating,
                    recentForm,
                }
            })
    }, [teams, playerById, recentFormByTeamId])

    // Precompute:
    //   - teamsByLeagueTier: O(1) tier-filtered list + per-tier counts
    //   - posInTierByTeamId:  O(1) "which position is team X within its tier?"
    //   - teamFlagByTeamId:   O(1) majority-region flag (replaces the
    //     getTeamFlag(rosterIds, players) scan that previously ran per row
    //     with O(roster × players) cost).
    // Single O(rankedTeams) pass per data change replaces an O(rankedTeams²)
    // inline computation on every render.
    const rankingMeta = useMemo(() => {
        const teamsByLeagueTier: Record<LeagueTier, typeof rankedTeams> = {
            S_TIER: [],
            A_TIER: [],
            B_TIER: [],
        }
        for (const t of rankedTeams) {
            const tier = t.leagueTier as LeagueTier
            if (teamsByLeagueTier[tier]) teamsByLeagueTier[tier].push(t)
        }
        const posInTierByTeamId = new Map<string, { posInTier: number; tierSize: number }>()
        for (const tier of Object.keys(teamsByLeagueTier) as LeagueTier[]) {
            const list = teamsByLeagueTier[tier]
            list.forEach((t, i) => posInTierByTeamId.set(t.id, { posInTier: i + 1, tierSize: list.length }))
        }
        const teamFlagByTeamId = new Map<string, string>()
        for (const t of rankedTeams) {
            teamFlagByTeamId.set(t.id, getTeamFlag(t.rosterIds, players as any))
        }
        return {
            teamsByLeagueTier,
            posInTierByTeamId,
            teamFlagByTeamId,
            counts: {
                S_TIER: teamsByLeagueTier.S_TIER.length,
                A_TIER: teamsByLeagueTier.A_TIER.length,
                B_TIER: teamsByLeagueTier.B_TIER.length,
            },
        }
    }, [rankedTeams, players])

    const leagueTierCounts = rankingMeta.counts

    // Filter teams for display
    const displayTeams = useMemo(() => {
        let filtered: typeof rankedTeams = rankedTeams

        // Apply league tier filter
        if (activeTab === "S_TIER" || activeTab === "A_TIER" || activeTab === "B_TIER") {
            filtered = rankingMeta.teamsByLeagueTier[activeTab as LeagueTier]
        }

        // Apply search filter
        if (debouncedSearch) {
            const q = debouncedSearch.toLowerCase()
            filtered = filtered.filter(t => t.name.toLowerCase().includes(q))
        }

        return filtered
    }, [rankedTeams, rankingMeta, activeTab, debouncedSearch])

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

                        {/* Rankings Table — virtualized, with state-aware fallbacks */}
                        {rankedTeams.length === 0 ? (
                            <div className="glass-panel p-0 border-white/5 overflow-hidden">
                                <div className="p-6 space-y-3">
                                    {Array.from({ length: 6 }).map((_, i) => (
                                        <PlayerCardSkeleton key={i} />
                                    ))}
                                </div>
                            </div>
                        ) : displayTeams.length === 0 ? (
                            <EmptyState
                                icon={Search}
                                title="No teams match your search"
                                description={debouncedSearch ? `We couldn't find any team named "${debouncedSearch}". Try a different query.` : "Adjust the filter to see results."}
                                action={debouncedSearch ? { label: "Clear search", onClick: () => setSearchTerm("") } : undefined}
                            />
                        ) : (
                            <VirtualizedRankingsList
                                displayTeams={displayTeams}
                                playerTeamId={playerTeamId}
                                revealPlaystyle={revealPlaystyle}
                                posInTierByTeamId={rankingMeta.posInTierByTeamId}
                                teamFlagByTeamId={rankingMeta.teamFlagByTeamId}
                                onSelectTeam={setSelectedTeam}
                            />
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
                            <div className="col-span-full">
                                <EmptyState
                                    icon={Award}
                                    title="Your legacy begins"
                                    description="Win tournaments to fill your trophy cabinet."
                                />
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
                                                <GlassTableCell colSpan={5} className="py-0">
                                                    <EmptyState
                                                        icon={Zap}
                                                        title="No circuit points awarded yet"
                                                        description="Play in tournaments to earn circuit points."
                                                        framed={false}
                                                    />
                                                </GlassTableCell>
                                            </tr>
                                        )}
                                    </AnimatePresence>
                                </tbody>
                            </GlassTable>
                        </div>

                        {/* Circuit Points Info */}
                        <div className="glass-panel p-6 border-white/5 space-y-4">
                            <SectionHeader
                                icon={Zap}
                                title="How Circuit Points Work"
                                tone="muted"
                                size="sm"
                            />
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <StatTile size="md" tone="warning" label="S-Tier 1st" value="2000" />
                                <StatTile size="md" tone="brand" label="A-Tier 1st" value="500" />
                                <StatTile size="md" tone="brand" label="B-Tier 1st" value="150" />
                                <StatTile size="md" tone="success" label="C-Tier 1st" value="50" />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Footer Stats */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-6 glass-panel p-6 border-white/5">
                <SectionHeader
                    icon={Zap}
                    size="sm"
                    title="Ranking System"
                    subtitle="Based on team reputation and tournament performance"
                />
                <div className="flex items-center gap-3">
                    <StatTile size="sm" label="Week" value={`${currentWeek || 1} / 52`} />
                    <StatTile size="sm" tone="brand" label="Total Teams" value={rankedTeams.length} />
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
                            <div className="p-6 overflow-y-auto custom-scrollbar space-y-4">
                                <SectionHeader icon={Users} size="sm" tone="muted" title="Active Roster" />
                                <div className="space-y-2">
                                    {selectedTeam.rosterIds.map((id: string) => {
                                        const player = playerById.get(id)
                                        if (!player) return null
                                        const ev = evaluatePlayer(player as any)
                                        const pTier = getDisplayPlayerTier(ev.overallRating, selectedTeam?.tier as TierLevel)
                                        const pStyle = getTierStyle(pTier)

                                        return (
                                            <div key={id} className="group flex items-center gap-4 p-3 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                                                <div className="w-12 h-12 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 relative">
                                                    <PlayerPortrait
                                                        src={player.portraitPath}
                                                        alt={player.nickname}
                                                        size={48}
                                                        variant="card"
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
