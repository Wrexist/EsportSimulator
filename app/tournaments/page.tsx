"use client"

import React, { useMemo, useState } from "react"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import Image from "next/image"
import { useRouter } from "next/navigation"
import {
    Trophy,
    Target,
    TrendingUp,
    Calendar,
    Users,
    DollarSign,
    LayoutGrid,
    Lock,
    CheckCircle,
    AlertCircle,
    Crown,
    Shield,
    Star,
    Zap,
    Globe,
    ChevronRight,
    Filter,
    Search,
    Sparkles,
    Award
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
    GlassTable,
    GlassTableHeader,
    GlassTableHead,
    GlassTableRow,
    GlassTableCell,
} from "@/components/ui/GlassTable"
import dynamic from "next/dynamic"
const TournamentBracket = dynamic(() => import("@/components/tournament/TournamentBracket"), { ssr: false })
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { getDynamicTournamentName } from "@/lib/utils-extended"
import {
    FULL_TOURNAMENT_CALENDAR,
    getTournamentsByTier,
    getUpcomingTournaments,
    getDiscoveredTournaments,
    getTierColor,
    getTierBgColor,
    formatPrizePool,
    getEntryTypeLabel,
    getEntryTypeColor,
    TournamentDefinition,
    TournamentTier,
    EntryType
} from "@/data/tournament-calendar"
import {
    QualificationEngine,
    CircuitPointsManager,
    TournamentParticipationManager,
    CircuitPointsEntry,
    QualificationStatus
} from "@/engine/tournament-qualification"
import { getSeasonFromWeek, buildInstanceId } from "@/engine/circuit-engine"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"

// Tab types
type ViewTab = "ALL" | "S_TIER" | "A_TIER" | "B_TIER" | "C_TIER" | "QUALIFIERS" | "MY_TOURNAMENTS"

// Tier icons
const TIER_ICONS: Record<TournamentTier, React.ReactNode> = {
    S_TIER: <Crown size={14} />,
    A_TIER: <Shield size={14} />,
    B_TIER: <Star size={14} />,
    C_TIER: <Zap size={14} />,
    QUALIFIER: <Target size={14} />
}

export default function TournamentsPage() {
    const {
        tournaments,
        teams,
        playerTeamId,
        currentWeek,
        circuitPoints: storeCircuitPoints,
        tournamentQualifications,
        registerForTournament,
        scheduledMatches,
        completedMatches
    } = useGameStore(useShallow(state => ({
        tournaments: state.tournaments,
        teams: state.teams,
        playerTeamId: state.playerTeamId,
        currentWeek: state.currentWeek,
        circuitPoints: state.circuitPoints,
        tournamentQualifications: state.tournamentQualifications,
        registerForTournament: state.registerForTournament,
        scheduledMatches: state.scheduledMatches,
        completedMatches: state.completedMatches,
    })))

    const router = useRouter()

    const [activeTab, setActiveTab] = useState<ViewTab>("ALL")
    const [selectedTournament, setSelectedTournament] = useState<TournamentDefinition | null>(null)
    const [searchTerm, setSearchTerm] = useState("")
    const [view, setView] = useState<"cards" | "bracket" | "standings">("cards")

    const toSeriesId = (id: string) => id.replace(/_s\d+$/, "")
    const isQualificationForSeries = (q: QualificationStatus, tournamentId: string) => {
        const seriesId = toSeriesId(tournamentId)
        const qSeriesId = toSeriesId(q.seriesId || q.tournamentId)
        return qSeriesId === seriesId
    }

    // Get player's team and ranking
    const playerTeam = teams.find(t => t.id === playerTeamId)
    const rankedTeams = useMemo(() => {
        return [...teams]
            .sort((a, b) => (b.elo || 1000) - (a.elo || 1000))
            .map((team, idx) => ({ ...team, worldRanking: idx + 1 }))
    }, [teams])
    const playerRanking = rankedTeams.find(t => t.id === playerTeamId)?.worldRanking || 999

    // Use store circuit points
    const circuitPoints = useMemo(() => {
        return (storeCircuitPoints || []) as CircuitPointsEntry[]
    }, [storeCircuitPoints])

    // Use store qualification statuses or generate mock ones
    const qualificationStatuses: QualificationStatus[] = useMemo(() => {
        if (tournamentQualifications && tournamentQualifications.length > 0) {
            return tournamentQualifications
        }
        // Mock statuses based on ranking
        const statuses: QualificationStatus[] = []
        const currentSeason = getSeasonFromWeek(currentWeek)

        // If player is top 20, they're invited to S-Tier
        if (playerTeam && playerRanking <= 20) {
            FULL_TOURNAMENT_CALENDAR
                .filter(t => t.tier === "S_TIER" && t.entryType === "INVITE" && t.requiredRanking && t.requiredRanking >= playerRanking)
                .forEach(t => {
                    const instanceId = buildInstanceId(t.id, currentSeason)
                    statuses.push({
                        tournamentId: instanceId,
                        seriesId: t.id,
                        instanceId,
                        seasonNumber: currentSeason,
                        teamId: playerTeam.id,
                        status: "QUALIFIED",
                        qualifiedVia: "Direct Invite"
                    })
                })
        }

        return statuses
    }, [playerTeam, playerRanking, tournamentQualifications, currentWeek])

    // Filter tournaments
    const filteredTournaments = useMemo(() => {
        let filtered = getDiscoveredTournaments(currentWeek)

        // Sync with mock logic for qualification/points if no store data
        const masterList = [...FULL_TOURNAMENT_CALENDAR]

        // Apply tab filter
        switch (activeTab) {
            case "S_TIER":
            case "A_TIER":
            case "B_TIER":
            case "C_TIER":
                filtered = filtered.filter(t => t.tier === activeTab)
                break
            case "QUALIFIERS":
                filtered = filtered.filter(t => t.tier === "QUALIFIER")
                break
            case "MY_TOURNAMENTS":
                filtered = filtered.filter(t => {
                    if (!playerTeam) return false
                    return TournamentParticipationManager.isTeamInTournament(
                        qualificationStatuses, playerTeam.id, t.id
                    )
                })
                break
        }

        // Apply search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase()
            filtered = filtered.filter(t =>
                t.name.toLowerCase().includes(term) ||
                t.shortName.toLowerCase().includes(term) ||
                t.region.toLowerCase().includes(term)
            )
        }

        return filtered
    }, [activeTab, searchTerm, playerTeam, qualificationStatuses, currentWeek])

    // Group by week for timeline view
    const tournamentsByWeek = useMemo(() => {
        const grouped: Record<number, TournamentDefinition[]> = {}
        filteredTournaments.forEach(t => {
            if (!grouped[t.startWeek]) grouped[t.startWeek] = []
            grouped[t.startWeek].push(t)
        })
        return grouped
    }, [filteredTournaments])

    // Get eligibility for a tournament
    const getEligibility = (tournament: TournamentDefinition) => {
        if (!playerTeam) return null
        return QualificationEngine.checkEligibility(
            tournament,
            playerTeam,
            playerRanking,
            circuitPoints,
            qualificationStatuses
        )
    }

    // Count tournaments by type
    const counts = useMemo(() => ({
        all: FULL_TOURNAMENT_CALENDAR.length,
        s_tier: getTournamentsByTier("S_TIER").length,
        a_tier: getTournamentsByTier("A_TIER").length,
        b_tier: getTournamentsByTier("B_TIER").length,
        c_tier: getTournamentsByTier("C_TIER").length,
        qualifiers: getTournamentsByTier("QUALIFIER").length,
        myTournaments: qualificationStatuses.filter(qs => qs.teamId === playerTeam?.id).length
    }), [playerTeam, qualificationStatuses])

    // Tournament Card Component
    const TournamentCard = ({ tournament }: { tournament: TournamentDefinition }) => {
        // Find live data (Seasonal ID support)
        const liveTournament = useMemo(() => {
            const currentSeason = Math.floor((currentWeek - 1) / 52) + 1
            // 1. Try exact current season match
            const seasonalId = `${tournament.id}_s${currentSeason}`
            const precise = tournaments.find(t => t.id === seasonalId)
            if (precise) return precise

            // 2. Try any future instance (upcoming)
            const upcoming = tournaments.find(t => t.id.startsWith(tournament.id + "_s") && !t.isCompleted && t.startWeek >= currentWeek)
            if (upcoming) return upcoming

            // 3. Fallback: Latest completed instance (so we land on a populated page)
            const latest = tournaments
                .filter(t => t.id.startsWith(tournament.id + "_s"))
                .sort((a, b) => b.startWeek - a.startWeek)[0]

            return latest
        }, [tournament.id, tournaments, currentWeek])

        const displayId = liveTournament ? liveTournament.id : tournament.id

        const eligibility = getEligibility(tournament)
        const isLocked = eligibility && QualificationEngine.isTournamentLocked(tournament, eligibility)
        const isQualified = qualificationStatuses.some(
            qs => isQualificationForSeries(qs, tournament.id) &&
                qs.teamId === playerTeam?.id &&
                qs.status === "QUALIFIED"
        )
        const isRegistered = qualificationStatuses.some(
            qs => isQualificationForSeries(qs, tournament.id) &&
                qs.teamId === playerTeam?.id &&
                qs.status === "REGISTERED"
        )
        const effectiveStart = liveTournament?.startWeek ??
            (Math.floor((currentWeek - 1) / 52) * 52 + tournament.startWeek)
        const isActive = currentWeek >= effectiveStart &&
            currentWeek < effectiveStart + tournament.duration
        const isPast = currentWeek >= effectiveStart + tournament.duration ||
            liveTournament?.isCompleted === true
        const weeksUntil = effectiveStart - currentWeek
        const entryColorStyle = getEntryTypeColor(tournament.entryType)

        // Check if on schedule (only if player's team has a match)
        const isOnSchedule = scheduledMatches.some(m =>
            (m.tournamentId || "").replace(/_s\d+$/, "") === tournament.id &&
            (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
        )

        // Check if player's team was eliminated (format-specific logic)
        const isEliminated = (() => {
            if (!playerTeamId) return false
            const matchesTournament = (m: { tournamentId?: string | null }) =>
                (m.tournamentId || "").replace(/_s\d+$/, "") === tournament.id ||
                (liveTournament && m.tournamentId === liveTournament.id)
            switch (tournament.format) {
                case "bracket": {
                    // Single elimination: any loss = eliminated
                    return completedMatches.some(
                        m => matchesTournament(m) &&
                            (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId) &&
                            m.result && m.result.winnerId && m.result.winnerId !== playerTeamId
                    )
                }
                case "swiss": {
                    // Swiss: 3 losses = eliminated
                    const standing = liveTournament?.standings?.find((s: { teamId: string }) => s.teamId === playerTeamId)
                    return (standing?.losses ?? 0) >= 3
                }
                case "double_elim": {
                    // Double elimination: 2 losses = eliminated
                    const standing = liveTournament?.standings?.find((s: { teamId: string }) => s.teamId === playerTeamId)
                    return (standing?.losses ?? 0) >= 2
                }
                default:
                    return false
            }
        })()

        // Check if tournament is actually completed
        const isTournamentCompleted = liveTournament?.isCompleted === true

        return (
            <motion.div
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={cn(
                    "glass-panel relative overflow-hidden transition-all cursor-pointer group",
                    "border hover:border-white/20",
                    isLocked && "opacity-60",
                    isActive && "border-primary/50 bg-primary/5",
                    isQualified && "border-emerald-500/30",
                    selectedTournament?.id === tournament.id && "ring-2 ring-primary"
                )}
                onClick={() => router.push(`/tournaments/${displayId}`)}
            >
                {/* Premium Glow for S-Tier */}
                {tournament.tier === "S_TIER" && (
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-transparent pointer-events-none" />
                )}

                {/* Lock Overlay */}
                {isLocked && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center gap-2">
                        <Lock className="text-white/40" size={24} />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                            {tournament.entryType === "INVITE" ? "Invite Only" : "Locked"}
                        </span>
                        {eligibility && (
                            <span className="text-[9px] text-white/30 max-w-[80%] text-center">
                                {eligibility.reason}
                            </span>
                        )}
                    </div>
                )}

                {/* Status Badges - Moved to LEFT with overflow handling */}
                <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 z-20 max-w-[calc(100%-24px)]">
                    {isActive && isEliminated && (
                        <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30 text-[9px] px-2 whitespace-nowrap">
                            ELIMINATED
                        </Badge>
                    )}
                    {isActive && !isEliminated && !isTournamentCompleted && (
                        <Badge className="bg-red-500 text-white border-none text-[9px] px-2 animate-pulse whitespace-nowrap">
                            LIVE
                        </Badge>
                    )}
                    {(isPast || (isActive && isTournamentCompleted)) && (
                        <Badge className="bg-white/10 text-white/40 border-white/20 text-[9px] px-2 whitespace-nowrap">
                            COMPLETED
                        </Badge>
                    )}
                    {isQualified && !isActive && (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[9px] px-2 whitespace-nowrap">
                            <CheckCircle size={10} className="mr-1" /> QUALIFIED
                        </Badge>
                    )}
                    {isRegistered && !isQualified && !isActive && (
                        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[9px] px-2 whitespace-nowrap">
                            REGISTERED
                        </Badge>
                    )}
                    {isOnSchedule && !isActive && !isPast && (
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[9px] px-2 whitespace-nowrap">
                            ON SCHEDULE
                        </Badge>
                    )}
                </div>

                {/* Tournament Header/Image */}
                <div className="relative h-40 w-full overflow-hidden">
                    {tournament.trophyPath ? (
                        <div className="absolute inset-0">
                            <Image
                                src={tournament.trophyPath}
                                alt={tournament.name}
                                fill
                                className="object-cover opacity-60 group-hover/card:scale-110 transition-transform duration-700"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                        </div>
                    ) : (
                        <div className={cn("absolute inset-0 opacity-20", getTierBgColor(tournament.tier))} />
                    )}

                    {/* Logo - Centered */}
                    {tournament.logoPath && (
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-32 h-24 z-20 transition-transform hover:scale-105 duration-300 flex items-center justify-center">
                            <Image
                                src={tournament.logoPath}
                                alt="Logo"
                                width={128}
                                height={96}
                                className="object-contain drop-shadow-[0_0_15px_rgba(0,0,0,0.6)]"
                            />
                        </div>
                    )}

                    <div className="absolute bottom-4 left-4 right-4 z-20">
                        <div className="flex items-center gap-2 mb-1">
                            <Badge
                                className={cn(
                                    "text-[10px] font-normal px-2 py-0 border-none",
                                    getTierBgColor(tournament.tier),
                                    getTierColor(tournament.tier)
                                )}
                            >
                                {TIER_ICONS[tournament.tier]}
                                <span className="ml-1">{tournament.tier.replace("_", "-")}</span>
                            </Badge>
                            <Badge variant="outline" className="bg-black/40 backdrop-blur-md text-[10px] border-white/10 text-white/70 flex items-center gap-1.5 px-2">
                                <CountryFlag country={tournament.region} size={12} />
                                {tournament.region}
                            </Badge>
                        </div>
                        <h3 className="text-xl font-normal text-white leading-tight drop-shadow-md">
                            {getDynamicTournamentName(tournament.name, currentWeek)}
                        </h3>
                    </div>
                </div>

                {/* Content */}
                <div className="p-5 space-y-4">
                    <p className="text-[11px] text-muted-foreground line-clamp-2">
                        {tournament.description}
                    </p>

                    {/* Stats Row */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-2 bg-black/20 rounded-lg">
                            {tournament.tier === "QUALIFIER" || tournament.prizePool === 0 ? (
                                <>
                                    <Target size={12} className="mx-auto text-amber-400 mb-1" />
                                    <span className="text-xs font-normal text-white">Qualification</span>
                                </>
                            ) : (
                                <>
                                    <DollarSign size={12} className="mx-auto text-emerald-400 mb-1" />
                                    <span className="text-xs font-normal text-white">{formatPrizePool(tournament.prizePool)}</span>
                                </>
                            )}
                        </div>
                        <div className="text-center p-2 bg-black/20 rounded-lg">
                            <Users size={12} className="mx-auto text-blue-400 mb-1" />
                            <span className="text-xs font-normal text-white">
                                {(() => {
                                    const current = liveTournament?.teamIds?.length || 0
                                    return (liveTournament && current > 0) ? `${current}/${tournament.slots}` : tournament.slots
                                })()}
                            </span>
                        </div>
                        <div className="text-center p-2 bg-black/20 rounded-lg">
                            <Calendar size={12} className="mx-auto text-amber-400 mb-1" />
                            <span className="text-xs font-normal text-white">W{tournament.startWeek}</span>
                        </div>
                    </div>

                    {/* Entry Type & Timing */}
                    <div className="flex items-center justify-between">
                        <Badge className={cn("text-[9px] px-2", entryColorStyle.bg, entryColorStyle.text, entryColorStyle.border)}>
                            {getEntryTypeLabel(tournament.entryType)}
                        </Badge>
                        {!isPast && !isActive && (
                            <span className="text-[10px] text-muted-foreground">
                                {weeksUntil > 0 ? `In ${weeksUntil} weeks` : "Starting soon"}
                            </span>
                        )}
                    </div>

                    {/* Action Button */}
                    {eligibility?.canRegister && !isRegistered && !isQualified && !isPast && !isEliminated && (
                        <Button
                            size="sm"
                            className="w-full mt-4 h-9 bg-emerald-500 hover:bg-emerald-400 text-black font-normal text-xs uppercase tracking-widest"
                            onClick={(e) => {
                                e.stopPropagation()
                                registerForTournament(displayId)
                            }}
                        >
                            Register Now
                        </Button>
                    )}
                    {(isRegistered || isQualified) && !isPast && !isOnSchedule && !isEliminated && (
                        <div className="w-full mt-4 h-9 bg-white/5 border border-white/10 flex items-center justify-center rounded-md">
                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                                Registered
                            </span>
                        </div>
                    )}
                    {(isRegistered || isQualified || isActive) && (
                        <Button
                            size="sm"
                            variant="secondary"
                            className="w-full mt-2 h-9 font-normal text-xs uppercase tracking-widest"
                            onClick={(e) => {
                                e.stopPropagation()
                                router.push(`/tournaments/${tournament.id}`)
                            }}
                        >
                            View Full Details
                        </Button>
                    )}
                    {isOnSchedule && !isPast && (
                        <Button
                            size="sm"
                            variant="secondary"
                            className="w-full mt-4 h-9 font-normal text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                            onClick={(e) => {
                                e.stopPropagation()
                                router.push("/schedule")
                            }}
                        >
                            <Calendar size={14} />
                            View in Calendar
                        </Button>
                    )}
                </div>
            </motion.div>
        )
    }

    return (
        <div className="space-y-8 max-w-7xl mx-auto pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                    <h1 className="text-4xl font-normal tracking-tighter uppercase liquid-text mb-2 flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center p-2 shadow-2xl backdrop-blur-sm">
                            <Image
                                src="/assets/tournaments/s_tier_trophy_1.png"
                                alt="Tournament Hub"
                                width={40}
                                height={40}
                                className="object-contain"
                            />
                        </div>
                        Tournament Hub
                    </h1>
                    <p className="text-muted-foreground font-medium uppercase text-xs tracking-[0.2em]">
                        {FULL_TOURNAMENT_CALENDAR.length} tournaments • Season 1
                    </p>
                </div>

                {/* Player Stats Card */}
                {playerTeam && (
                    <div className="glass-panel p-4 flex items-center gap-6 border-white/5">
                        <div className="text-center">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">Ranking</span>
                            <span className="text-2xl font-normal text-white">#{playerRanking}</span>
                        </div>
                        <div className="w-px h-10 bg-white/10" />
                        <div className="text-center">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">Circuit Pts</span>
                            <span className="text-2xl font-normal text-primary">
                                {CircuitPointsManager.getTeamPoints(circuitPoints, playerTeam.id).toLocaleString()}
                            </span>
                        </div>
                        <div className="w-px h-10 bg-white/10" />
                        <div className="text-center">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">Qualified</span>
                            <span className="text-2xl font-normal text-emerald-400">
                                {qualificationStatuses.filter(qs => qs.teamId === playerTeam.id && qs.status === "QUALIFIED").length}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Tab Navigation */}
            <div className="flex flex-wrap gap-3">
                <div className="glass-panel p-1.5 flex gap-1 border-white/5 overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                    {[
                        { id: "ALL", label: "All", count: counts.all },
                        { id: "S_TIER", label: "S-Tier", count: counts.s_tier, color: "text-amber-400" },
                        { id: "A_TIER", label: "A-Tier", count: counts.a_tier, color: "text-blue-400" },
                        { id: "B_TIER", label: "B-Tier", count: counts.b_tier, color: "text-purple-400" },
                        { id: "C_TIER", label: "C-Tier", count: counts.c_tier, color: "text-emerald-400" },
                        { id: "QUALIFIERS", label: "Qualifiers", count: counts.qualifiers },
                        { id: "MY_TOURNAMENTS", label: "My Tournaments", count: counts.myTournaments, color: "text-primary" },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as ViewTab)}
                            className={cn(
                                "px-4 py-2 rounded-xl text-[10px] font-normal uppercase tracking-widest transition-all flex items-center gap-2 outline-none whitespace-nowrap",
                                activeTab === tab.id
                                    ? "bg-blue-500 text-white shadow-lg"
                                    : "text-muted-foreground hover:bg-white/5"
                            )}
                        >
                            {tab.id !== "ALL" && tab.id !== "QUALIFIERS" && tab.id !== "MY_TOURNAMENTS" && TIER_ICONS[tab.id as TournamentTier]}
                            {tab.id === "QUALIFIERS" && <Target size={12} />}
                            {tab.id === "MY_TOURNAMENTS" && <Star size={12} />}
                            {tab.label}
                            <span className={cn("text-[9px]", activeTab === tab.id ? "text-white/70" : tab.color || "text-muted-foreground")}>
                                ({tab.count})
                            </span>
                        </button>
                    ))}
                </div>

                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                    <Input
                        placeholder="Search tournaments..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-11 h-10 bg-white/5 border-white/10 rounded-xl text-sm"
                    />
                </div>
            </div>

            {/* Main Content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Tournament Grid or Bracket View */}
                <div className="lg:col-span-2">
                    <AnimatePresence mode="wait">
                        {view === "cards" ? (
                            <motion.div
                                key="grid"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="grid grid-cols-1 md:grid-cols-2 gap-4"
                            >
                                {filteredTournaments.length > 0 ? (
                                    filteredTournaments.map(tournament => (
                                        <TournamentCard key={tournament.id} tournament={tournament} />
                                    ))
                                ) : (
                                    <div className="md:col-span-2 glass-panel p-12 text-center border-dashed border-white/10">
                                        <Trophy size={48} className="mx-auto mb-4 text-white/10" />
                                        <p className="font-normal text-xs uppercase tracking-[0.3em] text-white/30">
                                            No tournaments found
                                        </p>
                                    </div>
                                )}
                            </motion.div>
                        ) : view === "bracket" && selectedTournament ? (
                            <motion.div
                                key="bracket"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="glass-panel p-0 border-white/5 bg-black/40 overflow-hidden"
                            >
                                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                                    <div className="flex items-center gap-4">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setView("cards")}
                                            className="text-muted-foreground hover:text-white"
                                        >
                                            <ChevronRight className="rotate-180 mr-2" size={16} />
                                            Back to List
                                        </Button>
                                        <h2 className="font-normal text-xl uppercase">{selectedTournament.name} Bracket</h2>
                                    </div>
                                    <Badge className="bg-primary/20 text-primary border-primary/30 uppercase tracking-widest text-[10px]">
                                        LIVE PROGRESSION
                                    </Badge>
                                </div>
                                <div>
                                    <TournamentBracket
                                        rounds={["Quarter-Finals", "Semi-Finals", "Finals"]}
                                        onMatchClick={(matchId: string) => {
                                            const match = scheduledMatches.find(m => m.id === matchId)
                                            if (!match) return

                                            // Determine where to go
                                            if (match.week < currentWeek) {
                                                router.push(`/match/${matchId}/result`)
                                            } else {
                                                // If it's the player's team, go to veto, else go straight to live
                                                // If it's the player's team, go to veto, else go straight to live
                                                const isPlayerMatch = String(match.homeTeamId) === String(playerTeamId) || String(match.awayTeamId) === String(playerTeamId)
                                                router.push(`/match/${matchId}/${isPlayerMatch ? 'veto' : 'live'}`)
                                            }
                                        }}
                                        matches={scheduledMatches
                                            .filter(m => (m.tournamentId || "").replace(/_s\d+$/, "") === selectedTournament.id)
                                            .map(m => {
                                                const hTeam = teams.find(t => t.id === m.homeTeamId)
                                                const aTeam = teams.find(t => t.id === m.awayTeamId)
                                                const completed = completedMatches.find(cm => cm.id === m.id)

                                                const getRecentForm = (teamId: string) => {
                                                    if (!teamId) return []
                                                    return completedMatches
                                                        .filter(match => match.homeTeamId === teamId || match.awayTeamId === teamId)
                                                        .sort((a, b) => b.week - a.week)
                                                        .slice(0, 5)
                                                        .reverse()
                                                        .map(match => {
                                                            const iWin = match.homeTeamId === teamId ?
                                                                match.result.homeScore > match.result.awayScore :
                                                                match.result.awayScore > match.result.homeScore
                                                            return iWin ? "W" : "L"
                                                        })
                                                }

                                                return {
                                                    id: m.id,
                                                    round: m.stage || "Stage",
                                                    status: m.week === currentWeek ? "live" : m.week < currentWeek ? "completed" : "scheduled",
                                                    team1: {
                                                        id: hTeam?.id || "tbd",
                                                        name: hTeam?.name || "TBD",
                                                        logo: hTeam?.logoPath,
                                                        score: completed?.result?.homeScore,
                                                        isWinner: completed && (completed.result.homeScore > completed.result.awayScore),
                                                        recentForm: hTeam ? getRecentForm(hTeam.id) : []
                                                    },
                                                    team2: {
                                                        id: aTeam?.id || "tbd",
                                                        name: aTeam?.name || "TBD",
                                                        logo: aTeam?.logoPath,
                                                        score: completed?.result?.awayScore,
                                                        isWinner: completed && (completed.result.awayScore > completed.result.homeScore),
                                                        recentForm: aTeam ? getRecentForm(aTeam.id) : []
                                                    }
                                                }
                                            })
                                        }
                                    />
                                </div>
                            </motion.div>
                        ) : null}
                    </AnimatePresence>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    {/* Selected Tournament Detail */}
                    <AnimatePresence mode="wait">
                        {selectedTournament ? (
                            <motion.div
                                key={selectedTournament.id}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="glass-panel p-6 border-primary/20"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <Badge className={cn("text-[9px] px-2 mb-2", getTierBgColor(selectedTournament.tier), getTierColor(selectedTournament.tier), "border-none")}>
                                            {selectedTournament.tier.replace("_", "-")}
                                        </Badge>
                                        <h2 className="font-normal text-xl text-white uppercase tracking-tight">
                                            {selectedTournament.name}
                                        </h2>
                                    </div>
                                </div>

                                <p className="text-sm text-muted-foreground mb-6">
                                    {selectedTournament.description}
                                </p>

                                {/* Tournament Details */}
                                <div className="space-y-3 mb-6">
                                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                                        <span className="text-xs text-muted-foreground font-bold uppercase">Prize Pool</span>
                                        <span className="font-normal text-emerald-400">{formatPrizePool(selectedTournament.prizePool)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                                        <span className="text-xs text-muted-foreground font-bold uppercase">Teams</span>
                                        <span className="font-bold text-white">{selectedTournament.slots}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                                        <span className="text-xs text-muted-foreground font-bold uppercase">Format</span>
                                        <span className="font-bold text-white capitalize">{selectedTournament.format.replace("_", " ")}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                                        <span className="text-xs text-muted-foreground font-bold uppercase">Start Week</span>
                                        <span className="font-bold text-white">Week {selectedTournament.startWeek}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                                        <span className="text-xs text-muted-foreground font-bold uppercase">Duration</span>
                                        <span className="font-bold text-white">{selectedTournament.duration} week(s)</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2">
                                        <span className="text-xs text-muted-foreground font-bold uppercase">Entry</span>
                                        <Badge className={cn("text-[9px]", getEntryTypeColor(selectedTournament.entryType).bg, getEntryTypeColor(selectedTournament.entryType).text)}>
                                            {getEntryTypeLabel(selectedTournament.entryType)}
                                        </Badge>
                                    </div>
                                </div>

                                {/* Eligibility Check */}
                                {(() => {
                                    const eligibility = getEligibility(selectedTournament)
                                    if (!eligibility) return null

                                    return (
                                        <div className={cn(
                                            "p-4 rounded-xl mb-4",
                                            eligibility.eligible ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"
                                        )}>
                                            <div className="flex items-center gap-2 mb-2">
                                                {eligibility.eligible ? (
                                                    <CheckCircle className="text-emerald-400" size={16} />
                                                ) : (
                                                    <AlertCircle className="text-red-400" size={16} />
                                                )}
                                                <span className={cn("font-bold text-sm uppercase", eligibility.eligible ? "text-emerald-400" : "text-red-400")}>
                                                    {eligibility.eligible ? "Eligible" : "Not Eligible"}
                                                </span>
                                            </div>
                                            <ul className="space-y-1">
                                                {eligibility.requirements.map((req, idx) => (
                                                    <li key={idx} className="flex items-center gap-2 text-xs">
                                                        {req.met ? (
                                                            <CheckCircle size={12} className="text-emerald-400" />
                                                        ) : (
                                                            <AlertCircle size={12} className="text-red-400" />
                                                        )}
                                                        <span className={req.met ? "text-white/60" : "text-red-300"}>
                                                            {req.description}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )
                                })()}

                                {/* Action Button */}
                                {(() => {
                                    const eligibility = getEligibility(selectedTournament)
                                    if (!eligibility) return null

                                    const sidebarLiveTournament = tournaments.find(t =>
                                        t.id === selectedTournament.id || t.id.startsWith(`${selectedTournament.id}_s`)
                                    )
                                    const sidebarDisplayId = sidebarLiveTournament ? sidebarLiveTournament.id : selectedTournament.id

                                    const isOnSchedule = scheduledMatches.some(
                                        m => (m.tournamentId || "").replace(/_s\d+$/, "") === selectedTournament.id &&
                                            (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
                                    )
                                    const sidebarEffectiveStart = sidebarLiveTournament?.startWeek ??
                                        (Math.floor((currentWeek - 1) / 52) * 52 + selectedTournament.startWeek)
                                    const isPast = currentWeek >= sidebarEffectiveStart + selectedTournament.duration ||
                                        sidebarLiveTournament?.isCompleted === true

                                    // Check if already registered or qualified
                                    const isRegistered = qualificationStatuses.some(
                                        qs => isQualificationForSeries(qs, selectedTournament.id) &&
                                            qs.teamId === playerTeam?.id &&
                                            qs.status === "REGISTERED"
                                    )
                                    const isQualified = qualificationStatuses.some(
                                        qs => isQualificationForSeries(qs, selectedTournament.id) &&
                                            qs.teamId === playerTeam?.id &&
                                            qs.status === "QUALIFIED"
                                    )

                                    // Show "Registered" state if already registered
                                    if (isRegistered || isQualified) {
                                        return (
                                            <div className="w-full h-12 bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center rounded-md">
                                                <CheckCircle size={18} className="mr-2 text-emerald-400" />
                                                <span className="text-sm font-medium text-emerald-400 uppercase tracking-widest">
                                                    {isQualified ? "Qualified" : "Registered"}
                                                </span>
                                            </div>
                                        )
                                    }

                                    if (eligibility.canRegister && !isPast) {
                                        return (
                                            <Button
                                                className="w-full h-12 bg-emerald-500 hover:bg-emerald-400 text-black font-normal uppercase tracking-widest"
                                                onClick={() => registerForTournament(sidebarDisplayId)}
                                            >
                                                Register Now
                                            </Button>
                                        )
                                    }

                                    if (!eligibility.eligible) {
                                        return (
                                            <Button disabled className="w-full h-12 bg-white/10 text-white/40 font-normal uppercase tracking-widest cursor-not-allowed">
                                                <Lock size={16} className="mr-2" />
                                                Requirements Not Met
                                            </Button>
                                        )
                                    }

                                    return (
                                        <Button
                                            className="w-full h-12 bg-primary text-black font-normal uppercase tracking-widest flex items-center justify-center gap-2"
                                            onClick={() => router.push(`/tournaments/${selectedTournament.id}`)}
                                        >
                                            <LayoutGrid size={18} />
                                            View Full Details
                                        </Button>
                                    )
                                })()}
                            </motion.div>
                        ) : (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="glass-panel p-12 text-center border-dashed border-white/10"
                            >
                                <Target size={48} className="mx-auto mb-4 text-white/10" />
                                <h3 className="font-normal text-white uppercase mb-2">Select a Tournament</h3>
                                <p className="text-sm text-muted-foreground">
                                    Click on any tournament to view details
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* World Ranking Leaders */}
                    <div className="glass-panel p-6 border-white/5">
                        <h3 className="font-normal text-sm uppercase tracking-widest text-white flex items-center gap-2 mb-4">
                            <Trophy size={16} className="text-primary" />
                            World Ranking Leaders
                        </h3>
                        <div className="space-y-2">
                            {[...teams]
                                .sort((a, b) => (a.worldRanking || 9999) - (b.worldRanking || 9999))
                                .slice(0, 10)
                                .map((team, idx) => {
                                    const isPlayer = team.id === playerTeam?.id
                                    return (
                                        <div
                                            key={team.id}
                                            className={cn(
                                                "flex items-center gap-3 p-2 rounded-lg transition-colors",
                                                isPlayer ? "bg-primary/10 border border-primary/20" : "hover:bg-white/5"
                                            )}
                                        >
                                            <span className={cn(
                                                "w-5 text-center font-normal text-xs",
                                                idx === 0 ? "text-amber-400" :
                                                    idx === 1 ? "text-slate-300" :
                                                        idx === 2 ? "text-amber-700" :
                                                            "text-white/30"
                                            )}>
                                                {team.worldRanking}
                                            </span>
                                            <div className="w-6 h-6 rounded bg-white/5 flex items-center justify-center overflow-hidden">
                                                <TeamLogoDisplay team={team} size={20} />
                                            </div>
                                            <span className={cn("flex-1 font-bold text-xs truncate", isPlayer ? "text-primary" : "text-white")}>
                                                {team.name}
                                            </span>
                                            <span className="font-mono font-bold text-xs text-white/50">
                                                #{team.worldRanking}
                                            </span>
                                        </div>
                                    )
                                })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
