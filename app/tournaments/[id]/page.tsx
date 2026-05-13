"use client"

import React, { useState, useMemo, useEffect } from "react"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import type { TournamentDefinition } from "@/data/tournament-calendar"
import type { TournamentSaveData } from "@/engine/save-types"

/** Merged type for display: definition fields + runtime save fields */
type DisplayTournament = TournamentDefinition & {
    teamIds?: string[]
    currentStage?: string
    standings?: TournamentSaveData['standings']
    playoffBracket?: TournamentSaveData['playoffBracket']
    groups?: TournamentSaveData['groups']
    isCompleted?: boolean
    winnerId?: string
    endWeek?: number
    mvpPlayerId?: string
    mvpRating?: number
    rewardsGranted?: boolean
    seriesId?: string
    instanceId?: string
    seasonNumber?: number
}
import { FULL_TOURNAMENT_CALENDAR, getQualifiersFor, getTournamentById } from "@/data/tournament-calendar"
import { QualificationEngine } from "@/engine/tournament-qualification"
import { motion, AnimatePresence } from "framer-motion"
import {
    Trophy,
    Calendar,
    Users,
    ArrowLeft,
    ChevronRight,
    Info,
    Layers,
    LayoutGrid,
    Trophy as TrophyIcon,
    Medal,
    Activity,
    History,
    BarChart3
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { getDynamicTournamentName } from "@/lib/utils-extended"
import { getTeamFlag, getTeamRegion } from "@/engine/region-logic"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { PlayerPortrait, TeamLogoImage } from "@/components/ui/asset-images"
import TournamentBracket from "@/components/tournament/TournamentBracket"
import TournamentStats from "@/components/tournament/TournamentStats"

// Format display helper
const formatDisplayName = (format: string): string => {
    const formatMap: Record<string, string> = {
        "league": "Round Robin",
        "swiss": "Swiss System",
        "bracket": "Single Elimination",
        "double_elim": "Double Elimination",
    }
    return formatMap[format?.toLowerCase()] || format || "TBD"
}

type TimelineNodeStatus = "UPCOMING" | "LIVE" | "COMPLETED"
type TimelineNodeRole = "OPEN_QUALIFIER" | "CLOSED_QUALIFIER" | "MAIN_EVENT"

interface PathTimelineNode {
    tournament: TournamentDefinition
    status: TimelineNodeStatus
    role: TimelineNodeRole
    isCurrent: boolean
    incomingQualifierCount: number
    playerStatus: string | null
}

const getTimelineNodeStatus = (tournament: TournamentDefinition, currentWeek: number): TimelineNodeStatus => {
    const startWeek = tournament.startWeek || 1
    const endWeek = startWeek + Math.max(1, tournament.duration || 1) - 1
    if (currentWeek < startWeek) return "UPCOMING"
    if (currentWeek > endWeek) return "COMPLETED"
    return "LIVE"
}

const getTimelineNodeRole = (tournament: TournamentDefinition): TimelineNodeRole => {
    if (!tournament.qualifierFor) return "MAIN_EVENT"
    if ((tournament.entryType || "").toUpperCase() === "OPEN") return "OPEN_QUALIFIER"
    return "CLOSED_QUALIFIER"
}

const getTimelineRoleLabel = (role: TimelineNodeRole): string => {
    switch (role) {
        case "OPEN_QUALIFIER":
            return "Open Qualifier"
        case "CLOSED_QUALIFIER":
            return "Closed Qualifier"
        default:
            return "Main Event"
    }
}

// Helper to map match data to bracket format
function mapToBracketMatch(m: any, teams: any[], completedMatches: any[]): any {
    // Improve data resolution: Check if match is actually completed/scheduled elsewhere
    const completedMatch = completedMatches.find(cm => cm.id === m.id)
    const activeMatch = m.result ? m : (completedMatch || m)

    const team1 = teams.find(t => t.id === activeMatch.homeTeamId)
    const team2 = teams.find(t => t.id === activeMatch.awayTeamId)

    // Helper to get form
    const getForm = (teamId: string) => {
        if (!teamId) return []
        return completedMatches
            .filter(match => match.homeTeamId === teamId || match.awayTeamId === teamId)
            .sort((a, b) => b.week - a.week) // Newest first
            .slice(0, 5)
            .reverse() // Oldest to newest
            .map(match => {
                const isHome = match.homeTeamId === teamId
                const isWin = isHome ? match.result.homeScore > match.result.awayScore : match.result.awayScore > match.result.homeScore
                return isWin ? "W" : "L"
            })
    }

    return {
        id: activeMatch.id,
        round: activeMatch.stage || "Tournament Match",
        status: activeMatch.isCompleted || activeMatch.result ? "completed" : "scheduled",
        team1: team1 ? {
            id: team1.id,
            name: team1.name,
            score: activeMatch.result?.homeScore,
            isWinner: (activeMatch.isCompleted || activeMatch.result) && activeMatch.result && activeMatch.result.homeScore > activeMatch.result.awayScore,
            logo: team1.logoPath,
            recentForm: getForm(team1.id)
        } : undefined,
        team2: team2 ? {
            id: team2.id,
            name: team2.name,
            score: activeMatch.result?.awayScore,
            isWinner: (activeMatch.isCompleted || activeMatch.result) && activeMatch.result && activeMatch.result.awayScore > activeMatch.result.homeScore,
            logo: team2.logoPath,
            recentForm: getForm(team2.id)
        } : undefined
    }
}

export default function TournamentDetailPage() {
    const { id } = useParams()
    const router = useRouter()
    const { tournaments, teams, players, currentWeek, scheduledMatches, completedMatches, playerTeamId, tournamentQualifications, circuitPoints, registerForTournament } = useGameStore(useShallow(state => ({
        tournaments: state.tournaments,
        teams: state.teams,
        players: state.players,
        currentWeek: state.currentWeek,
        scheduledMatches: state.scheduledMatches,
        completedMatches: state.completedMatches,
        playerTeamId: state.playerTeamId,
        tournamentQualifications: state.tournamentQualifications,
        circuitPoints: state.circuitPoints,
        registerForTournament: state.registerForTournament,
    })))

    const tournament = useMemo(() => tournaments.find(t => t.id === id), [tournaments, id])

    const [activeTab, setActiveTab] = useState<"overview" | "groups" | "playoffs" | "schedule" | "history" | "stats">("overview")
    const [selectedSeason, setSelectedSeason] = useState<string | null>(null)

    // Resolve base definition (handle seasonal IDs)
    const definition = useMemo(() => {
        const rawId = (Array.isArray(id) ? id[0] : id) || ""
        // Try exact match first
        const exact = FULL_TOURNAMENT_CALENDAR.find(t => t.id === rawId)
        if (exact) return exact

        // Try stripped match
        const baseId = rawId.split('_s')[0]
        return FULL_TOURNAMENT_CALENDAR.find(t => t.id === baseId)
    }, [id])

    // Find all seasonal instances of this tournament
    const seasonalInstances = useMemo(() => {
        if (!definition) return []
        return tournaments
            .filter(t => t.id.startsWith(definition.id) || t.id.includes(definition.id))
            .sort((a, b) => {
                // Parse season number
                const sA = parseInt(a.id.split('_s')[1] || "1")
                const sB = parseInt(b.id.split('_s')[1] || "1")
                return sB - sA // Descending (latest first)
            })
    }, [tournaments, definition])

    // Compute display tournament purely (no side effects)
    const displayTournament = useMemo((): DisplayTournament | undefined => {
        // If we explicitly selected a season via dropdown, find that one
        if (selectedSeason) {
            const found = seasonalInstances.find(t => t.id === selectedSeason)
            if (found) return { ...definition, ...found } as DisplayTournament
        }

        // Otherwise, try to match URL ID
        const urlId = (Array.isArray(id) ? id[0] : id) || ""
        const exactMatch = seasonalInstances.find(t => t.id === urlId)
        if (exactMatch) return { ...definition, ...exactMatch } as DisplayTournament

        // Fallback: Use latest season available
        if (seasonalInstances.length > 0) return { ...definition, ...seasonalInstances[0] } as DisplayTournament

        // Final fallback: Just the definition
        return definition
    }, [seasonalInstances, definition, id, selectedSeason])

    // Sync selectedSeason state (moved out of useMemo to avoid setState during render)
    useEffect(() => {
        if (selectedSeason) return // Already explicitly selected
        const urlId = (Array.isArray(id) ? id[0] : id) || ""
        const exactMatch = seasonalInstances.find(t => t.id === urlId)
        if (exactMatch) {
            setSelectedSeason(exactMatch.id)
        } else if (seasonalInstances.length > 0) {
            setSelectedSeason(seasonalInstances[0].id)
        }
    }, [seasonalInstances, id, selectedSeason])

    const playerTeam = useMemo(() => teams.find(t => t.id === playerTeamId), [teams, playerTeamId])
    // Index teams by id once — was being scanned 8+ times per render across the
    // podium / playoff / standings sections.
    const teamsById = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams])
    const completedMatchesById = useMemo(() => new Map(completedMatches.map(m => [m.id, m])), [completedMatches])
    const toSeriesId = (value?: string) => (value || "").replace(/_s\d+$/, "")
    const isQualificationForTournament = (q: any, tournamentId: string) =>
        toSeriesId(q.seriesId || q.tournamentId) === toSeriesId(tournamentId)
    const isMatchForTournament = (matchTournamentId: string | null | undefined, tournamentId: string) =>
        toSeriesId(matchTournamentId || "") === toSeriesId(tournamentId)
    const playerRanking = playerTeam?.worldRanking || 999 // Fallback
    const eligibility = definition && playerTeam ? QualificationEngine.checkEligibility(
        definition,
        playerTeam,
        playerRanking,
        circuitPoints as any,
        tournamentQualifications
    ) : null

    const pathToEvent = useMemo<PathTimelineNode[]>(() => {
        if (!definition) return []

        const getById = (targetId: string) =>
            FULL_TOURNAMENT_CALENDAR.find(t => t.id === targetId)

        const upstream: TournamentDefinition[] = []
        const seenUpstream = new Set<string>()
        let targetId = definition.id

        while (true) {
            const incoming = getQualifiersFor(targetId).sort((a, b) => a.startWeek - b.startWeek)
            if (incoming.length === 0) break

            const preferred = incoming.find(t => t.entryType === "OPEN") || incoming[0]
            if (seenUpstream.has(preferred.id)) break

            upstream.unshift(preferred)
            seenUpstream.add(preferred.id)
            targetId = preferred.id
        }

        const downstream: TournamentDefinition[] = []
        const seenDownstream = new Set<string>([definition.id])
        let cursor: TournamentDefinition | undefined = definition

        while (cursor?.qualifierFor) {
            const next = getById(cursor.qualifierFor)
            if (!next || seenDownstream.has(next.id)) break

            downstream.push(next)
            seenDownstream.add(next.id)
            cursor = next
        }

        const orderedPath: TournamentDefinition[] = []
        const seenIds = new Set<string>()
        for (const entry of [...upstream, definition, ...downstream]) {
            if (seenIds.has(entry.id)) continue
            seenIds.add(entry.id)
            orderedPath.push(entry)
        }

        if (orderedPath.length <= 1) return []

        const currentIndex = orderedPath.findIndex(entry => entry.id === definition.id)

        return orderedPath.map((entry, index) => {
            const playerRow = playerTeamId
                ? [...tournamentQualifications]
                    .reverse()
                    .find(q => q.teamId === playerTeamId && isQualificationForTournament(q, entry.id))
                : undefined

            return {
                tournament: entry,
                status: getTimelineNodeStatus(entry, currentWeek),
                role: getTimelineNodeRole(entry),
                isCurrent: index === currentIndex,
                incomingQualifierCount: getQualifiersFor(entry.id).length,
                playerStatus: playerRow?.status || null,
            }
        })
    }, [currentWeek, definition, playerTeamId, tournamentQualifications, isQualificationForTournament])

    if (!displayTournament) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-[#050505] text-white p-8">
                <h1 className="text-2xl font-bold opacity-50 mb-4 text-white/50">Tournament Not Found</h1>
                <Button onClick={() => router.push("/tournaments")} variant="secondary" className="rounded-2xl border-white/10 bg-white/5 backdrop-blur-xl">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Tournaments
                </Button>
            </div>
        )
    }

    // Check registration against the specific displayTournament ID
    const isRegistered = tournamentQualifications.some(q =>
        isQualificationForTournament(q, displayTournament.id) && q.teamId === playerTeamId
    )

    // Check start based on the specific displayTournament
    const isStarted = currentWeek >= (displayTournament.startWeek || 0)
    const isCompleted = displayTournament.isCompleted

    return (
        <ErrorBoundary section="Tournament">
            <div className="min-h-screen bg-[#050505] text-white p-6 md:p-10 relative overflow-hidden selection:bg-blue-500/30">
                {/* Background Image */}
                {definition?.logoPath && (
                    <div
                        className="absolute inset-0 z-0 opacity-20 bg-cover bg-center pointer-events-none"
                        style={{ backgroundImage: `url(${definition?.logoPath})` }}
                    >
                        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/80 to-transparent" />
                    </div>
                )}

                {/* Background Glows */}
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 blur-[150px] rounded-full pointer-events-none" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 blur-[150px] rounded-full pointer-events-none" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] bg-white/[0.01] blur-[120px] rounded-full pointer-events-none" />

                {/* Header Section */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-7xl mx-auto mb-10 relative z-10"
                >
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-6">
                            <Button
                                onClick={() => router.push("/tournaments")}
                                variant="ghost"
                                className="rounded-2xl w-12 h-12 p-0 bg-white/5 hover:bg-white/10 backdrop-blur-xl border border-white/10 transition-all duration-500"
                            >
                                <ArrowLeft className="h-5 w-5" />
                            </Button>

                            {/* Tournament Logo */}
                            {definition?.logoPath && (
                                <div className="w-32 h-32 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shadow-2xl relative group">
                                    <Image
                                        src={definition?.logoPath}
                                        alt={displayTournament.name}
                                        width={96}
                                        height={96}
                                        className="object-contain"
                                    />
                                    {/* Season Selector Overlay */}
                                    {seasonalInstances.length > 1 && (
                                        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity p-2">
                                            <span className="text-[9px] font-bold text-white/50 uppercase tracking-widest mb-2">History</span>
                                            <div className="flex flex-wrap gap-1 justify-center max-h-full overflow-y-auto">
                                                {seasonalInstances.map(t => {
                                                    const seasonNum = t.id.split('_s')[1] || "1"
                                                    return (
                                                        <button
                                                            key={t.id}
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                setSelectedSeason(t.id)
                                                                // Optionally push to URL but explicit state is smoother
                                                                // router.push(`/tournaments/${t.id}`)
                                                            }}
                                                            className={cn(
                                                                "w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold transition-colors",
                                                                (displayTournament.id === t.id)
                                                                    ? "bg-primary text-black"
                                                                    : "bg-white/10 hover:bg-white/20 text-white"
                                                            )}
                                                        >
                                                            {seasonNum}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex flex-col">
                                <h1 className="text-5xl font-normal tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/50 mb-2">
                                    {getDynamicTournamentName(displayTournament.name, currentWeek)}
                                </h1>
                                <div className="flex items-center gap-4">
                                    <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 px-3 py-1 text-[10px] font-normal tracking-[0.2em] uppercase">
                                        {displayTournament.tier} TIER
                                    </Badge>
                                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                                        <CountryFlag country={displayTournament?.region} size={16} />
                                        <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider">
                                            {displayTournament?.region}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-white/30 text-sm font-bold tracking-wide">
                                        <Calendar className="w-4 h-4" />
                                        Week {displayTournament?.startWeek} — Week {displayTournament?.startWeek + ((displayTournament?.duration ?? 1) || 1) - 1}
                                    </div>
                                    {/* Countdown / Status Badge */}
                                    {(() => {
                                        const startWeek = displayTournament?.startWeek || 0
                                        const endWeek = startWeek + ((displayTournament?.duration ?? 1) || 1) - 1
                                        const weeksUntil = startWeek - currentWeek

                                        // Check if player was eliminated from this bracket tournament
                                        const isPlayerEliminated = playerTeamId && definition?.format === "bracket" && completedMatches.some(
                                            (m: any) => (isMatchForTournament(m.tournamentId, definition.id) || isMatchForTournament(m.tournamentId, displayTournament?.id || "")) &&
                                                (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId) &&
                                                m.result && m.result.winnerId && m.result.winnerId !== playerTeamId
                                        )

                                        if (currentWeek < startWeek) {
                                            return (
                                                <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 px-3 py-1 text-[10px] font-normal tracking-widest uppercase animate-pulse">
                                                    Starts in {weeksUntil} week{weeksUntil !== 1 ? "s" : ""}
                                                </Badge>
                                            )
                                        } else if (isPlayerEliminated && currentWeek <= endWeek) {
                                            return (
                                                <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20 px-3 py-1 text-[10px] font-normal tracking-widest uppercase">
                                                    Eliminated
                                                </Badge>
                                            )
                                        } else if (currentWeek <= endWeek && !displayTournament?.isCompleted) {
                                            return (
                                                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 px-3 py-1 text-[10px] font-normal tracking-widest uppercase">
                                                    🔴 LIVE
                                                </Badge>
                                            )
                                        } else {
                                            return (
                                                <Badge className="bg-white/5 text-white/40 border-white/10 px-3 py-1 text-[10px] font-normal tracking-widest uppercase">
                                                    Completed
                                                </Badge>
                                            )
                                        }
                                    })()}
                                </div>
                            </div>
                        </div>

                        {!isStarted && (
                            <div className="flex items-center gap-4">
                                {isRegistered ? (
                                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 px-6 py-3 rounded-2xl font-normal text-[10px] tracking-[0.2em] uppercase">
                                        Successfully Registered
                                    </Badge>
                                ) : eligibility?.canRegister ? (
                                    <Button
                                        onClick={() => registerForTournament(displayTournament?.id || definition?.id || (id as string))}
                                        className="h-14 px-8 rounded-2xl font-normal text-sm uppercase tracking-widest bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_30px_rgba(16,185,129,0.2)] transition-all duration-500"
                                    >
                                        Register Now
                                    </Button>
                                ) : null}
                            </div>
                        )}
                    </div>

                    {/* Timeline Progress Bar */}
                    {(() => {
                        const startWeek = displayTournament?.startWeek || 0
                        const duration = (displayTournament?.duration ?? 1) || 1
                        const endWeek = startWeek + duration - 1
                        const progress = Math.max(0, Math.min(100, ((currentWeek - startWeek) / Math.max(1, duration - 1)) * 100))

                        if (currentWeek < startWeek) return null

                        return (
                            <div className="mb-6">
                                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">
                                    <span>Week {startWeek}</span>
                                    <span className="text-white/60">Week {currentWeek} / {endWeek}</span>
                                    <span>Week {endWeek}</span>
                                </div>
                                <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progress}%` }}
                                        transition={{ duration: 1, ease: "easeOut" }}
                                        className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]"
                                    />
                                </div>
                            </div>
                        )
                    })()}

                    {/* Info Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <StatCard
                            icon={TrophyIcon}
                            label="Prize Pool"
                            value={(() => {
                                const isQualifier = displayTournament?.tier === "QUALIFIER" || displayTournament?.name?.toLowerCase().includes("qualifier")
                                if (isQualifier) {
                                    const destId = displayTournament?.qualifierFor
                                    const dest = destId ? getTournamentById(destId) : null
                                    return dest ? `${dest.shortName} Spot` : "Qualifier Spot"
                                }
                                return `$${displayTournament?.prizePool?.toLocaleString()}`
                            })()}
                            color="amber"
                        />
                        <StatCard
                            icon={Users}
                            label="Participants"
                            value={(() => {
                                // Correctly calculate current participants
                                // If started, use teamIds from the active tournament instance
                                // If not started, use the registration count from the qualifications store
                                const activeCount = displayTournament?.teamIds?.length || 0
                                const registeredCount = tournamentQualifications.filter(q => isQualificationForTournament(q, (definition?.id || id) as string)).length

                                const current = isStarted ? activeCount : registeredCount
                                const max = displayTournament?.slots || 0

                                return `${current} / ${max} Teams`
                            })()}
                            color="blue"
                        />
                        <StatCard icon={Activity} label="Stage" value={displayTournament?.currentStage || "Preparation"} color="emerald" />
                        <StatCard icon={Medal} label="Format" value={formatDisplayName(displayTournament?.format)} color="purple" />
                    </div>
                </motion.div>

                {/* Navigation Tabs */}
                <div className="max-w-7xl mx-auto mb-10 relative z-10">
                    <div className="flex items-center gap-2 p-2 rounded-2xl bg-white/[0.02] backdrop-blur-3xl border border-white/5 w-fit">
                        {(() => {
                            const format = displayTournament?.format
                            const slots = displayTournament?.slots || 32

                            // Determine which tabs to show based on format
                            const baseTabs = [
                                { id: "overview", icon: Info, label: "Overview" },
                            ]

                            // Group Stage: Only for Swiss formats (16 or 24 teams with groups)
                            const hasGroups = format === "swiss" || (slots === 16 || slots === 24)
                            if (hasGroups) {
                                baseTabs.push({ id: "groups", icon: LayoutGrid, label: "Group Stage" })
                            }

                            // Playoffs: For all bracket/elimination formats
                            const hasPlayoffs = format !== "league"
                            if (hasPlayoffs) {
                                baseTabs.push({ id: "playoffs", icon: Layers, label: "Bracket" })
                            }

                            // League: Only for league format
                            if (format === "league") {
                                baseTabs.push({ id: "groups" as any, icon: LayoutGrid, label: "Standings" })
                            }

                            baseTabs.push({ id: "schedule", icon: Calendar, label: format === "league" ? "Schedule" : "All Matches" })

                            baseTabs.push({ id: "history", icon: History, label: "History" })

                            baseTabs.push({ id: "stats", icon: BarChart3, label: "Stats" })

                            return baseTabs
                        })().map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={cn(
                                    "flex items-center gap-2.5 px-6 py-3 rounded-xl text-xs font-normal uppercase tracking-widest transition-all duration-500",
                                    activeTab === tab.id
                                        ? "bg-white/10 text-white shadow-[0_8px_32px_rgba(0,0,0,0.2)] border border-white/10"
                                        : "text-white/30 hover:text-white/60 hover:bg-white/[0.03]"
                                )}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content Area */}
                <div className="max-w-7xl mx-auto relative z-10">
                    <AnimatePresence mode="wait">
                        {activeTab === "overview" && (
                            <motion.div
                                key="overview"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-8"
                            >
                                <div className="glass-panel p-10 rounded-[48px] border border-white/5 bg-white/[0.01] backdrop-blur-[100px] shadow-2xl">
                                    <div className="max-w-3xl">
                                        <h2 className="text-3xl font-normal tracking-tighter mb-6">Tournament Overview</h2>
                                        <p className="text-white/60 leading-relaxed mb-8">
                                            {displayTournament?.description || "No description available."}
                                        </p>

                                        {pathToEvent.length > 0 && (
                                            <div className="mb-10 p-6 rounded-[32px] bg-blue-500/5 border border-blue-500/10">
                                                <div className="flex items-center gap-2 mb-4">
                                                    <Layers className="w-4 h-4 text-blue-400" />
                                                    <h3 className="text-sm font-normal uppercase tracking-widest text-blue-400">Path to Event</h3>
                                                </div>
                                                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                                                    {pathToEvent.map((node, index) => {
                                                        const weekStart = node.tournament.startWeek
                                                        const weekEnd = weekStart + Math.max(1, node.tournament.duration || 1) - 1
                                                        const statusClass = node.status === "LIVE"
                                                            ? "text-amber-400"
                                                            : node.status === "COMPLETED"
                                                                ? "text-emerald-400"
                                                                : "text-white/50"

                                                        return (
                                                            <React.Fragment key={node.tournament.id}>
                                                                <div className={cn(
                                                                    "min-w-[220px] p-4 rounded-2xl border bg-black/20",
                                                                    node.isCurrent ? "border-blue-500/40 bg-blue-500/10" : "border-white/10"
                                                                )}>
                                                                    <div className="flex items-center justify-between mb-2">
                                                                        <Badge className="bg-white/10 text-white/70 border-white/10 text-[9px] uppercase tracking-widest">
                                                                            {getTimelineRoleLabel(node.role)}
                                                                        </Badge>
                                                                        {node.isCurrent && (
                                                                            <Badge className="bg-blue-500/15 text-blue-300 border-blue-500/30 text-[9px] uppercase tracking-widest">
                                                                                Current
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                    <div className="font-bold text-sm text-white">{node.tournament.shortName}</div>
                                                                    <div className="text-[10px] text-white/40 uppercase tracking-widest mt-1">
                                                                        Week {weekStart} - {weekEnd}
                                                                    </div>
                                                                    <div className="flex items-center justify-between mt-3 text-[10px] uppercase tracking-widest">
                                                                        <span className={statusClass}>{node.status}</span>
                                                                        {node.incomingQualifierCount > 1 && (
                                                                            <span className="text-white/40">{node.incomingQualifierCount} feeder qualifiers</span>
                                                                        )}
                                                                    </div>
                                                                    {node.playerStatus && (
                                                                        <div className="mt-2 text-[10px] text-emerald-300/90 uppercase tracking-wide">
                                                                            Your team: {node.playerStatus.toLowerCase()}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                {index < pathToEvent.length - 1 && (
                                                                    <ChevronRight className="w-5 h-5 text-white/20 shrink-0" />
                                                                )}
                                                            </React.Fragment>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Podium Section */}
                                        {isCompleted && (
                                            <div className="mb-12 relative">
                                                <div className="flex items-end justify-center gap-4 md:gap-8 min-h-[280px]">
                                                    {(() => {
                                                        // Determine Winners
                                                        let podium: { startHeight: string; endHeight: string; team: any; place: number; color: string }[] = []

                                                        // 1. Bracket Logic (Most reliable for single elim)
                                                        const finalMatch = completedMatches.find(m => isMatchForTournament(m.tournamentId, displayTournament.id) && m.stage === "Grand Final")
                                                        if (finalMatch) {
                                                            const winnerId = finalMatch.result.winnerId || (finalMatch.result.homeScore > finalMatch.result.awayScore ? finalMatch.homeTeamId : finalMatch.awayTeamId)
                                                            const runnerUpId = winnerId === finalMatch.homeTeamId ? finalMatch.awayTeamId : finalMatch.homeTeamId
                                                            const thirdPlaceMatch = completedMatches.find(m => isMatchForTournament(m.tournamentId, displayTournament.id) && m.stage?.includes("3rd Place"))
                                                            let thirdId: string | null = null
                                                            if (thirdPlaceMatch) {
                                                                thirdId = thirdPlaceMatch.result.winnerId || (thirdPlaceMatch.result.homeScore > thirdPlaceMatch.result.awayScore ? thirdPlaceMatch.homeTeamId : thirdPlaceMatch.awayTeamId)
                                                            }

                                                            const winner = teamsById.get(winnerId)
                                                            const runnerUp = teamsById.get(runnerUpId)
                                                            const third = teamsById.get(thirdId)

                                                            if (winner) podium.push({ place: 1, team: winner, color: "from-amber-300 to-amber-500", startHeight: "h-0", endHeight: "h-48" })
                                                            if (runnerUp) podium.push({ place: 2, team: runnerUp, color: "from-gray-300 to-gray-500", startHeight: "h-0", endHeight: "h-32" })
                                                            if (third) podium.push({ place: 3, team: third, color: "from-amber-700 to-amber-900", startHeight: "h-0", endHeight: "h-20" })
                                                        }
                                                        // 2. League Logic (or fallback)
                                                        else if (displayTournament?.format === "league" || !finalMatch) {
                                                            const standings = displayTournament?.teamIds?.map((tid: string) => {
                                                                const team = teamsById.get(tid)
                                                                const matches = completedMatches.filter(m => isMatchForTournament(m.tournamentId, displayTournament.id) && (m.homeTeamId === tid || m.awayTeamId === tid))
                                                                const wins = matches.filter(m => (m.result.homeScore > m.result.awayScore && m.homeTeamId === tid) || (m.result.awayScore > m.result.homeScore && m.awayTeamId === tid)).length
                                                                const points = wins * 3
                                                                return { team, points }
                                                            }).sort((a: any, b: any) => b.points - a.points)

                                                            if (standings && standings[0]) podium.push({ place: 1, team: standings[0].team, color: "from-amber-300 to-amber-500", startHeight: "h-0", endHeight: "h-48" })
                                                            if (standings && standings[1]) podium.push({ place: 2, team: standings[1].team, color: "from-gray-300 to-gray-500", startHeight: "h-0", endHeight: "h-32" })
                                                            if (standings && standings[2]) podium.push({ place: 3, team: standings[2].team, color: "from-amber-700 to-amber-900", startHeight: "h-0", endHeight: "h-20" })
                                                        }

                                                        // Re-order for visual podium (2 - 1 - 3)
                                                        const visualOrder = [
                                                            podium.find(p => p.place === 2),
                                                            podium.find(p => p.place === 1),
                                                            podium.find(p => p.place === 3)
                                                        ].filter(Boolean) as typeof podium

                                                        return visualOrder.map((entry) => (
                                                            <motion.div
                                                                key={entry.place}
                                                                initial={{ opacity: 0, scale: 0.9 }}
                                                                animate={{ opacity: 1, scale: 1 }}
                                                                transition={{ delay: 0.2 * entry.place, duration: 0.5 }}
                                                                className="flex flex-col items-center group relative z-10"
                                                            >
                                                                {/* Team Logo/Avatar - Bouncing */}
                                                                <motion.div
                                                                    animate={{ y: [0, -10, 0] }}
                                                                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: entry.place }}
                                                                    className="mb-4 relative"
                                                                >
                                                                    <div className={cn(
                                                                        "w-20 h-20 rounded-full border-4 flex items-center justify-center bg-[#050505] shadow-[0_0_30px_rgba(0,0,0,0.5)] z-20 relative overflow-hidden",
                                                                        entry.place === 1 ? "border-amber-400 w-28 h-28" : entry.place === 2 ? "border-gray-300" : "border-amber-800"
                                                                    )}>
                                                                        {entry.team.logoPath ? (
                                                                            <img src={entry.team.logoPath} className="w-[70%] h-[70%] object-contain" />
                                                                        ) : (
                                                                            <span className="text-2xl font-bold">{entry.team.name[0]}</span>
                                                                        )}
                                                                    </div>
                                                                    {/* Crown for 1st */}
                                                                    {entry.place === 1 && (
                                                                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-4xl animate-bounce">
                                                                            👑
                                                                        </div>
                                                                    )}
                                                                </motion.div>

                                                                {/* Podium Block */}
                                                                <motion.div
                                                                    initial={{ height: "0px" }}
                                                                    animate={{ height: entry.place === 1 ? "12rem" : entry.place === 2 ? "8rem" : "5rem" }}
                                                                    className={cn(
                                                                        "w-24 md:w-32 rounded-t-lg bg-gradient-to-b flex flex-col items-center justify-end pb-4 shadow-2xl backdrop-blur-md relative overflow-hidden",
                                                                        entry.color.replace("to-", "to-black/80 ") // Darken bottom
                                                                    )}
                                                                >
                                                                    <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                                                    <div className="text-4xl font-black text-white/90 drop-shadow-md mb-1">{entry.place}</div>
                                                                    <div className="text-[10px] font-bold uppercase tracking-widest text-white/60">Place</div>
                                                                </motion.div>

                                                                {/* Team Name */}
                                                                <div className="mt-3 text-center">
                                                                    <div className="font-bold text-lg leading-none mb-1">{entry.team.name}</div>
                                                                    {(displayTournament?.prizePool ?? 0) > 0 && (
                                                                        <Badge className="bg-white/10 text-white/50 border-white/5 text-[9px]">
                                                                            ${((displayTournament?.prizePool ?? 0) * (entry.place === 1 ? 0.40 : entry.place === 2 ? 0.20 : 0.10) / 1000).toFixed(0)}k
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            </motion.div>
                                                        ))
                                                    })()}
                                                </div>

                                                {/* Floor Glow */}
                                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-24 bg-amber-500/10 blur-[60px] rounded-full pointer-events-none"></div>
                                            </div>
                                        )}

                                        <div className="flex flex-wrap gap-4 mb-10">
                                            <div className="px-6 py-4 rounded-3xl bg-white/5 border border-white/10">
                                                <div className="text-[10px] font-normal text-white/20 uppercase tracking-widest mb-1">Entry Type</div>
                                                <div className="text-sm font-bold">{displayTournament?.entryType}</div>
                                            </div>
                                            <div className="px-6 py-4 rounded-3xl bg-white/5 border border-white/10">
                                                <div className="text-[10px] font-normal text-white/20 uppercase tracking-widest mb-1">Region</div>
                                                <div className="text-sm font-bold text-blue-400">{displayTournament?.region}</div>
                                            </div>
                                            <div className="px-6 py-4 rounded-3xl bg-white/5 border border-white/10">
                                                <div className="text-[10px] font-normal text-white/20 uppercase tracking-widest mb-1">Status</div>
                                                <div className="text-sm font-bold text-emerald-400">{isCompleted ? "Completed" : isStarted ? "In Progress" : "Registration Open"}</div>
                                            </div>
                                            <div className="px-6 py-4 rounded-3xl bg-white/5 border border-white/10">
                                                <div className="text-[10px] font-normal text-white/20 uppercase tracking-widest mb-1">Format</div>
                                                <div className="text-sm font-bold text-purple-400">{formatDisplayName(displayTournament?.format)}</div>
                                            </div>
                                        </div>

                                        {/* Prize Distribution Table */}
                                        {(() => {
                                            const prizePool = displayTournament?.prizePool || 0
                                            const isQualifier = displayTournament?.tier === "QUALIFIER" || displayTournament?.name?.toLowerCase().includes("qualifier")

                                            // --------------------------------------------------------------------------------
                                            // FINAL STANDINGS VIEW (If Completed)
                                            // --------------------------------------------------------------------------------
                                            if (isCompleted) {
                                                // Determine Standings
                                                let standings: { team: any, place: number, prize: number, share: string }[] = []

                                                // A. Bracket Logic
                                                if (displayTournament?.format !== "league") {
                                                    const final = completedMatches.find(m => isMatchForTournament(m.tournamentId, displayTournament.id) && m.stage === "Grand Final")
                                                    const semiFinals = completedMatches.filter(m => isMatchForTournament(m.tournamentId, displayTournament.id) && m.stage?.includes("Semi-final"))
                                                    const quarterFinals = completedMatches.filter(m => isMatchForTournament(m.tournamentId, displayTournament.id) && m.stage?.includes("Quarter-final"))

                                                    if (final) {
                                                        const winId = final.result.winnerId || (final.result.homeScore > final.result.awayScore ? final.homeTeamId : final.awayTeamId)
                                                        const loseId = winId === final.homeTeamId ? final.awayTeamId : final.homeTeamId
                                                        const winner = teamsById.get(winId)
                                                        const runnerUp = teamsById.get(loseId)
                                                        if (winner) standings.push({ team: winner, place: 1, prize: prizePool * 0.40, share: "High" })
                                                        if (runnerUp) standings.push({ team: runnerUp, place: 2, prize: prizePool * 0.20, share: "Medium" })
                                                    }

                                                    // 3rd-4th
                                                    semiFinals.forEach(m => {
                                                        const loserId = m.result.homeScore > m.result.awayScore ? m.awayTeamId : m.homeTeamId
                                                        if (loserId && !standings.some(s => s.team.id === loserId)) {
                                                            const t = teamsById.get(loserId)
                                                            if (t) standings.push({ team: t, place: 3, prize: prizePool * 0.10, share: "Low" })
                                                        }
                                                    })

                                                    // 5th-8th
                                                    quarterFinals.forEach(m => {
                                                        const loserId = m.result.homeScore > m.result.awayScore ? m.awayTeamId : m.homeTeamId
                                                        if (loserId && !standings.some(s => s.team.id === loserId)) {
                                                            const t = teamsById.get(loserId)
                                                            if (t) standings.push({ team: t, place: 5, prize: prizePool * 0.05, share: "Low" })
                                                        }
                                                    })
                                                }
                                                // B. League Logic
                                                else {
                                                    const leagueSorted = displayTournament?.teamIds?.map((tid: string) => {
                                                        const team = teamsById.get(tid)
                                                        const matches = completedMatches.filter(m => isMatchForTournament(m.tournamentId, displayTournament.id) && (m.homeTeamId === tid || m.awayTeamId === tid))
                                                        const wins = matches.filter(m => (m.result.homeScore > m.result.awayScore && m.homeTeamId === tid) || (m.result.awayScore > m.result.homeScore && m.awayTeamId === tid)).length
                                                        const points = wins * 3
                                                        return { team, points }
                                                    }).sort((a: any, b: any) => b.points - a.points)

                                                    if (leagueSorted) {
                                                        leagueSorted.forEach((entry: any, idx: number) => {
                                                            if (!entry.team) return
                                                            let pct = 0
                                                            if (idx === 0) pct = 0.40
                                                            else if (idx === 1) pct = 0.20
                                                            else if (idx <= 3) pct = 0.10
                                                            else if (idx <= 7) pct = 0.05
                                                            standings.push({ team: entry.team, place: idx + 1, prize: prizePool * pct, share: "Standard" })
                                                        })
                                                    }
                                                }

                                                // Sort by place
                                                standings.sort((a, b) => a.place - b.place)

                                                return (
                                                    <div className="mb-10 glass-panel p-8 rounded-[40px] border border-white/5 bg-white/[0.01] backdrop-blur-xl">
                                                        <div className="flex items-center gap-4 mb-8">
                                                            <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.1)]">
                                                                <TrophyIcon className="w-6 h-6" />
                                                            </div>
                                                            <div>
                                                                <h3 className="text-xl font-normal text-white">Final Standings</h3>
                                                                <p className="text-white/40 text-xs">Official results and prize distribution</p>
                                                            </div>
                                                        </div>

                                                        <div className="space-y-3">
                                                            {standings.slice(0, 8).map((s) => (
                                                                <div key={s.team.id} className="flex items-center justify-between p-4 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-colors group">
                                                                    <div className="flex items-center gap-6">
                                                                        <div className={cn(
                                                                            "w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg border relative overflow-hidden",
                                                                            s.place === 1 ? "bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.2)]" :
                                                                                s.place === 2 ? "bg-gray-300/20 text-gray-300 border-gray-300/50" :
                                                                                    s.place <= 4 ? "bg-amber-800/20 text-amber-700 border-amber-800/50" :
                                                                                        "bg-white/5 text-white/20 border-white/5"
                                                                        )}>
                                                                            {s.place === 1 ? "🥇" : s.place === 2 ? "🥈" : s.place === 3 ? "🥉" : `#${s.place}`}
                                                                        </div>

                                                                        <div className="flex items-center gap-4">
                                                                            <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/5 flex items-center justify-center overflow-hidden">
                                                                                <TeamLogoImage src={s.team.logoPath} alt={s.team.name} size={28} />
                                                                            </div>
                                                                            <div>
                                                                                <div className="font-bold text-white group-hover:text-blue-400 transition-colors">{s.team.name}</div>
                                                                                <div className="text-[10px] text-white/30 uppercase tracking-widest flex items-center gap-1">
                                                                                    <CountryFlag country={s.team.region || "INT"} size={8} showName={false} /> {s.team.region || "INT"}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div className="text-right">
                                                                        {(() => {
                                                                            const qSlots = displayTournament?.qualifierSlots || 0
                                                                            const destId = displayTournament?.qualifierFor
                                                                            const dest = destId ? getTournamentById(destId) : null
                                                                            const destLabel = dest ? dest.shortName : "Next Stage"
                                                                            if (isQualifier && qSlots > 0 && s.place <= qSlots) {
                                                                                return (
                                                                                    <div className="font-bold text-emerald-400 text-sm tracking-wider uppercase mb-1 shadow-emerald-500/20 drop-shadow-md">
                                                                                        Qualified for {destLabel}
                                                                                    </div>
                                                                                )
                                                                            }
                                                                            return (
                                                                                <div className={cn(
                                                                                    "font-mono text-lg font-normal mb-1",
                                                                                    s.place === 1 ? "text-emerald-400" : "text-white/80"
                                                                                )}>
                                                                                    ${(s.prize).toLocaleString()}
                                                                                </div>
                                                                            )
                                                                        })()}

                                                                        {!isQualifier && s.prize > 0 && (
                                                                            <div className="text-[10px] text-white/20 font-medium">
                                                                                + Club Share: ${(s.prize * 0.15).toLocaleString()}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )
                                            }

                                            // --------------------------------------------------------------------------------
                                            // STANDARD PRIZE DISTRIBUTION (If Not Completed)
                                            // --------------------------------------------------------------------------------
                                            if (isQualifier) {
                                                return (
                                                    <div className="mb-10 p-6 rounded-[32px] bg-amber-500/5 border border-amber-500/10">
                                                        <div className="flex items-center gap-2 mb-4">
                                                            <TrophyIcon className="w-4 h-4 text-amber-500" />
                                                            <h3 className="text-sm font-normal uppercase tracking-widest text-amber-500">Qualification Rewards</h3>
                                                        </div>
                                                        <div className="p-4 rounded-2xl bg-black/30 border border-white/5 text-center">
                                                            <div className="text-lg mb-1">🎫</div>
                                                            <div className="text-lg font-normal text-amber-400">
                                                                {(() => {
                                                                    const destId = displayTournament?.qualifierFor
                                                                    const dest = destId ? getTournamentById(destId) : null
                                                                    return dest ? `${dest.shortName} Spot` : "Qualifier Spot"
                                                                })()}
                                                            </div>
                                                            <div className="text-[10px] text-white/40 font-bold uppercase tracking-wide">
                                                                Top {displayTournament?.qualifierSlots || 1} Advance
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            }

                                            // Standard prize distribution percentages
                                            const distribution = [
                                                { place: "1st", pct: 0.40, color: "text-amber-400", icon: "🥇" },
                                                { place: "2nd", pct: 0.20, color: "text-gray-300", icon: "🥈" },
                                                { place: "3rd-4th", pct: 0.10, color: "text-amber-700", icon: "🥉" },
                                                { place: "5th-8th", pct: 0.05, color: "text-white/60", icon: "" },
                                            ]

                                            return (
                                                <div className="mb-10 p-6 rounded-[32px] bg-emerald-500/5 border border-emerald-500/10">
                                                    <div className="flex items-center gap-2 mb-4">
                                                        <TrophyIcon className="w-4 h-4 text-emerald-500" />
                                                        <h3 className="text-sm font-normal uppercase tracking-widest text-emerald-500">Prize Distribution</h3>
                                                    </div>
                                                    <div className="grid grid-cols-4 gap-3">
                                                        {distribution.map(d => (
                                                            <div key={d.place} className="p-4 rounded-2xl bg-black/30 border border-white/5 text-center">
                                                                <div className="text-lg mb-1">{d.icon || "💰"}</div>
                                                                <div className={`text-lg font-normal ${d.color}`}>
                                                                    ${((prizePool * d.pct) / 1000).toFixed(0)}k
                                                                </div>
                                                                <div className="text-[10px] text-white/40 font-bold uppercase tracking-wide">{d.place}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )
                                        })()}

                                        {/* Participants / Registered Card */}
                                        <div className="glass-panel p-8 rounded-[40px] border border-white/5 bg-white/[0.01] backdrop-blur-[100px] shadow-2xl flex flex-col justify-between group overflow-hidden">
                                            <div className="absolute top-0 right-0 p-8 opacity-[0.03] scale-150 group-hover:scale-[1.75] transition-transform duration-1000">
                                                <Users className="w-full h-full" />
                                            </div>
                                            <div className="relative z-10 mb-8">
                                                <div className="flex items-center gap-2">
                                                    <Users className="w-4 h-4 text-amber-500" />
                                                    <h3 className="text-sm font-normal uppercase tracking-widest text-amber-500">
                                                        {isStarted ? "Participating Teams" : "Registered Teams"}
                                                    </h3>
                                                </div>
                                                <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
                                                    {isStarted
                                                        ? (tournament?.teamIds?.length || 0)
                                                        : (tournamentQualifications.filter(q => isQualificationForTournament(q, (definition?.id || id) as string)).length)} / {displayTournament?.slots}
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap gap-4 items-center">
                                                {(() => {
                                                    const rawParticipants = isStarted
                                                        ? (tournament?.teamIds || [])
                                                        : (tournamentQualifications.filter(q => isQualificationForTournament(q, (definition?.id || id) as string)).map(q => q.teamId))

                                                    // Deduplicate to fix duplicate key errors
                                                    const participants = [...new Set(rawParticipants)]

                                                    const visibleParticipants = participants
                                                        .map(tid => teamsById.get(tid))
                                                        .filter(t => t)
                                                        .sort((a, b) => (a?.worldRanking || 999) - (b?.worldRanking || 999))

                                                    return (
                                                        <>
                                                            {visibleParticipants.slice(0, 5).map((team) => (
                                                                <div key={team!.id} className="group relative">
                                                                    <div className="w-14 h-14 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center shadow-lg hover:bg-white/5 transition-colors duration-300">
                                                                        {team!.logoPath ? (
                                                                            <img src={team!.logoPath} alt={team!.name} className="w-9 h-9 object-contain opacity-80 group-hover:opacity-100 transition-opacity" />
                                                                        ) : (
                                                                            <span className="text-sm font-normal text-white/50">{team!.name[0]}</span>
                                                                        )}
                                                                        {team!.worldRanking && team!.worldRanking <= 10 && (
                                                                            <div className="absolute -bottom-1 -right-1 bg-amber-500 text-black text-[8px] font-normal w-4 h-4 flex items-center justify-center rounded-full border border-black">
                                                                                #{team!.worldRanking}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                                                                        <div className="bg-black/90 px-3 py-1.5 rounded-lg border border-white/10 whitespace-nowrap">
                                                                            <div className="text-[10px] font-bold text-white">{team!.name}</div>
                                                                            {team!.worldRanking && <div className="text-[9px] text-white/50">World #{team!.worldRanking}</div>}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}

                                                            {/* Display remaining count */}
                                                            {participants.length > 5 && (
                                                                <div className="text-[10px] font-bold text-white/20 ml-2">
                                                                    + {participants.length - 5} more
                                                                </div>
                                                            )}
                                                        </>
                                                    )
                                                })()}
                                            </div>
                                        </div>

                                        {tournament && !isStarted && !isRegistered && (
                                            <div className="space-y-4">
                                                {eligibility?.canRegister && !isRegistered && !isStarted ? (
                                                    <div className="flex flex-col gap-4">
                                                        <div className="p-6 rounded-3xl bg-emerald-500/10 border border-emerald-500/20">
                                                            <div className="text-emerald-400 font-bold mb-1">You can register for this tournament!</div>
                                                            <div className="text-xs text-emerald-400/60 font-medium">Click below to register your team for this event.</div>
                                                        </div>
                                                        <Button
                                                            onClick={() => registerForTournament(displayTournament?.id || definition?.id || (id as string))}
                                                            disabled={isRegistered}
                                                            className={cn(
                                                                "h-16 rounded-[24px] font-normal text-lg uppercase tracking-widest transition-all duration-500",
                                                                isRegistered ? "bg-white/5 text-white/40 border border-white/10" : "bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_50px_rgba(16,185,129,0.3)]"
                                                            )}
                                                        >
                                                            {isRegistered ? "Successfully Registered" : "Register Team"}
                                                        </Button>
                                                    </div>
                                                ) : eligibility?.eligible && !isRegistered ? (
                                                    <div className="p-6 rounded-3xl bg-blue-500/10 border border-blue-500/20">
                                                        <div className="text-blue-400 font-bold mb-1">Invitation Pending</div>
                                                        <div className="text-xs text-blue-400/60 font-medium">You meet the requirements. An official invitation will be sent to your inbox soon.</div>
                                                    </div>
                                                ) : !isRegistered ? (
                                                    <div className="p-6 rounded-3xl bg-red-500/10 border border-red-500/20">
                                                        <div className="text-red-400 font-bold mb-1">Ineligible</div>
                                                        <div className="text-xs text-red-400/60 font-medium">{eligibility?.reason || "You do not meet the requirements for this tournament."}</div>
                                                    </div>
                                                ) : null}
                                            </div>
                                        )}

                                        {/* Hall of Fame / History Section */}
                                        {seasonalInstances.length > 0 && seasonalInstances.some(t => (t as any).isCompleted) && (
                                            <div className="mt-10">
                                                <h3 className="text-[10px] font-normal text-white/20 uppercase tracking-[0.3em] mb-4 flex items-center gap-3">
                                                    <Trophy size={12} /> Hall of Fame
                                                </h3>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {seasonalInstances
                                                        .filter(t => (t as any).isCompleted)
                                                        .map((t: any) => {
                                                            const winner = teams.find(team => team.id === t.winnerId)
                                                            const seasonNum = t.id.split('_s')[1]
                                                            return (
                                                                <div
                                                                    key={t.id}
                                                                    role="button"
                                                                    tabIndex={0}
                                                                    aria-label={`View Season ${seasonNum} results`}
                                                                    className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between group hover:bg-white/10 transition-colors cursor-pointer"
                                                                    onClick={() => setSelectedSeason(t.id)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === "Enter" || e.key === " ") {
                                                                            e.preventDefault()
                                                                            setSelectedSeason(t.id)
                                                                        }
                                                                    }}
                                                                >
                                                                    <div>
                                                                        <div className="text-[9px] text-white/40 font-bold uppercase tracking-wider mb-1">Season {seasonNum}</div>
                                                                        <div className="flex items-center gap-2">
                                                                            <Trophy size={14} className="text-amber-400" />
                                                                            <span className="text-sm font-bold text-white">{winner?.name || "Unknown Winner"}</span>
                                                                        </div>
                                                                    </div>
                                                                    {winner?.logoPath && (
                                                                        <img src={winner.logoPath} className="w-8 h-8 object-contain opacity-50 group-hover:opacity-100 transition-opacity" />
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === "groups" && (
                            <motion.div
                                key="groups"
                                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.98, y: 10 }}
                                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                className="min-h-[400px] w-full"
                            >
                                {displayTournament?.format === "league" ? (
                                    <div className="glass-panel p-10 rounded-[48px] border border-white/5 bg-white/[0.01] backdrop-blur-[100px] shadow-2xl">
                                        <div className="flex items-center gap-4 mb-8">
                                            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400">
                                                <LayoutGrid className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h2 className="text-2xl font-normal tracking-tight">League Standings</h2>
                                                <p className="text-white/40 text-sm">Round Robin Format - Top teams advance to Playoffs</p>
                                            </div>
                                        </div>

                                        {/* League Table Calculation */}
                                        {(() => {
                                            const leagueStandings = displayTournament?.teamIds?.map((tid: string) => {
                                                const team = teamsById.get(tid)
                                                // Calculate actual stats from completed matches
                                                const matches = completedMatches.filter(m => isMatchForTournament(m.tournamentId, displayTournament.id) && (m.homeTeamId === tid || m.awayTeamId === tid))
                                                const wins = matches.filter(m => (m.result.homeScore > m.result.awayScore && m.homeTeamId === tid) || (m.result.awayScore > m.result.homeScore && m.awayTeamId === tid)).length
                                                const losses = matches.length - wins
                                                const points = wins * 3
                                                return { team, wins, losses, points, matchesPlayed: matches.length }
                                            }).sort((a: any, b: any) => b.points - a.points || b.wins - a.wins)

                                            return (
                                                <div className="overflow-hidden rounded-3xl border border-white/5">
                                                    <table className="w-full text-left text-sm">
                                                        <thead className="bg-white/5 text-white/40 uppercase text-[10px] font-normal tracking-widest">
                                                            <tr>
                                                                <th className="px-6 py-4">Rank</th>
                                                                <th className="px-6 py-4 w-full">Team</th>
                                                                <th className="px-6 py-4 text-center">Form</th>
                                                                <th className="px-6 py-4 text-center">Played</th>
                                                                <th className="px-6 py-4 text-center">W - L</th>
                                                                <th className="px-6 py-4 text-center text-white">Points</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-white/5">
                                                            {leagueStandings?.map((entry: any, idx: number) => (
                                                                <tr key={entry.team?.id || idx} className="hover:bg-white/[0.02] transition-colors">
                                                                    <td className="px-6 py-4 font-mono text-white/40">#{idx + 1}</td>
                                                                    <td className="px-6 py-4 font-bold flex items-center gap-3">
                                                                        {entry.team?.logoPath ? <img src={entry.team.logoPath} className="w-6 h-6 object-contain" /> : <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center text-[10px]">{entry.team?.name[0]}</div>}
                                                                        {entry.team?.name || "Unknown Team"}
                                                                    </td>
                                                                    <td className="px-6 py-4">
                                                                        <div className="flex items-center justify-center gap-1">
                                                                            {(() => {
                                                                                // Get Last 5 Matches for this team in this tournament
                                                                                const teamMatches = completedMatches
                                                                                    .filter(m => isMatchForTournament(m.tournamentId, displayTournament.id) && (m.homeTeamId === entry.team?.id || m.awayTeamId === entry.team?.id))
                                                                                    .sort((a, b) => b.week - a.week) // Newest first
                                                                                    .slice(0, 5)
                                                                                    .reverse() // Oldest to newest (Left to Right)

                                                                                return teamMatches.map(m => {
                                                                                    const isHome = m.homeTeamId === entry.team?.id
                                                                                    const isWin = isHome ? m.result.homeScore > m.result.awayScore : m.result.awayScore > m.result.homeScore
                                                                                    const opponentId = isHome ? m.awayTeamId : m.homeTeamId
                                                                                    const opponent = teams.find(t => t.id === opponentId)

                                                                                    return (
                                                                                        <div key={m.id} className="relative group/tooltip">
                                                                                            <div className={cn(
                                                                                                "w-6 h-6 rounded flex items-center justify-center border transition-all hover:scale-110",
                                                                                                isWin ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-500" : "bg-red-500/10 border-red-500/50 text-red-500"
                                                                                            )}>
                                                                                                {opponent?.logoPath ? (
                                                                                                    <img src={opponent.logoPath} className="w-4 h-4 object-contain opacity-80" />
                                                                                                ) : (
                                                                                                    <span className="text-[8px] font-normal">{isWin ? "W" : "L"}</span>
                                                                                                )}
                                                                                            </div>
                                                                                            {/* Tooltip */}
                                                                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black border border-white/10 rounded text-[10px] whitespace-nowrap opacity-0 group-hover/tooltip:opacity-100 pointer-events-none z-10">
                                                                                                <span className={isWin ? "text-emerald-400" : "text-red-400"}>{isWin ? "Win" : "Loss"}</span> vs {opponent?.name || "Unknown"}
                                                                                                <div className="text-white/50 text-[8px] text-center">{m.result.homeScore} - {m.result.awayScore}</div>
                                                                                            </div>
                                                                                        </div>
                                                                                    )
                                                                                })
                                                                            })()}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-6 py-4 text-center text-white/60">{entry.matchesPlayed}</td>
                                                                    <td className="px-6 py-4 text-center font-mono">
                                                                        <span className="text-emerald-400">{entry.wins}</span> - <span className="text-red-400">{entry.losses}</span>
                                                                    </td>
                                                                    <td className="px-6 py-4 text-center font-normal text-lg">{entry.points}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )
                                        })()}
                                    </div>
                                ) : displayTournament?.groups ? (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                        {displayTournament?.groups?.map((group: any, idx: number) => (
                                            <div key={group.id || idx} className="glass-panel p-10 rounded-[48px] border border-white/5 bg-white/[0.01] backdrop-blur-[100px] shadow-2xl relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 p-10 opacity-[0.02] scale-[3] pointer-events-none group-hover:opacity-[0.05] transition-opacity duration-1000">
                                                    <Trophy className="w-full h-full" />
                                                </div>

                                                <div className="flex items-center justify-between mb-10">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 text-xl font-normal">
                                                            {group.name.slice(-1)}
                                                        </div>
                                                        <h2 className="text-3xl font-normal tracking-tighter">{group.name}</h2>
                                                    </div>
                                                    <Badge className="bg-white/5 text-white/40 border-white/10 px-3 py-1 font-normal text-[10px] tracking-widest">
                                                        8 TEAMS
                                                    </Badge>
                                                </div>

                                                <div className="space-y-12 relative">
                                                    {/* Upper Bracket */}
                                                    <div>
                                                        <h3 className="text-[10px] font-normal text-white/20 uppercase tracking-[0.3em] mb-8 flex items-center gap-3">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" /> Upper Bracket
                                                        </h3>
                                                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                                                            <div className="space-y-4">
                                                                {group.matches.filter((m: string) => m.includes("opening")).map((id: string) => (
                                                                    <MatchCardComponent key={id} matchId={id} tournament={tournament} />
                                                                ))}
                                                            </div>
                                                            <div className="flex flex-col justify-around gap-4 group/ub2">
                                                                {group.matches.filter((m: string) => m.includes("upper_semi")).map((id: string) => (
                                                                    <MatchCardComponent key={id} matchId={id} tournament={tournament} />
                                                                ))}
                                                            </div>
                                                            <div className="flex flex-col justify-center">
                                                                {group.matches.filter((m: string) => m.includes("upper_final")).map((id: string) => (
                                                                    <MatchCardComponent key={id} matchId={id} tournament={tournament} className="border-blue-500/20 shadow-[0_0_30px_rgba(59,130,246,0.05)]" />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Lower Bracket */}
                                                    <div>
                                                        <h3 className="text-[10px] font-normal text-white/20 uppercase tracking-[0.3em] mb-8 flex items-center gap-3">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]" /> Lower Bracket
                                                        </h3>
                                                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                                                            <div className="space-y-4">
                                                                {displayTournament?.playoffBracket?.filter((m: any) => m.id.includes(group.id) && m.id.includes("lower_r1")).map((m: any) => (
                                                                    <MatchCardComponent key={m.id} matchId={m.id} tournament={displayTournament as DisplayTournament} />
                                                                ))}
                                                            </div>
                                                            <div className="flex flex-col justify-center gap-4">
                                                                {displayTournament?.playoffBracket?.filter((m: any) => m.id.includes(group.id) && m.id.includes("lower_semi")).map((m: any) => (
                                                                    <MatchCardComponent key={m.id} matchId={m.id} tournament={displayTournament as DisplayTournament} />
                                                                ))}
                                                            </div>
                                                            <div className="flex flex-col justify-center">
                                                                {displayTournament?.playoffBracket?.filter((m: any) => m.id.includes(group.id) && m.id.includes("lower_final")).map((m: any) => (
                                                                    <MatchCardComponent key={m.id} matchId={m.id} tournament={displayTournament as DisplayTournament} className="border-amber-500/20 shadow-[0_0_30px_rgba(245,158,11,0.05)]" />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : displayTournament?.id ? (
                                    <div className="glass-panel p-20 rounded-[48px] border border-white/5 bg-white/[0.01] backdrop-blur-[100px] shadow-2xl flex flex-col items-center justify-center text-center">
                                        <div className="w-20 h-20 rounded-[32px] bg-white/5 border border-white/10 flex items-center justify-center mb-6 text-white/20">
                                            <TrophyIcon className="w-10 h-10" />
                                        </div>
                                        <h3 className="text-2xl font-normal tracking-tight mb-2">Direct Bracket Format</h3>
                                        <p className="text-white/40 max-w-md font-medium">
                                            This tournament uses a direct single-elimination bracket format without a group stage. Please check the <strong>Playoffs</strong> or <strong>All Matches</strong> tab.
                                        </p>
                                        <Button
                                            onClick={() => setActiveTab("playoffs")}
                                            className="mt-6"
                                            variant="secondary"
                                        >
                                            View Bracket
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="glass-panel p-20 rounded-[48px] border border-white/5 bg-white/[0.01] backdrop-blur-[100px] shadow-2xl flex flex-col items-center justify-center text-center">
                                        <div className="w-20 h-20 rounded-[32px] bg-white/5 border border-white/10 flex items-center justify-center mb-6 text-white/20">
                                            <LayoutGrid className="w-10 h-10" />
                                        </div>
                                        <h3 className="text-2xl font-normal tracking-tight mb-2">Group Stage Not Generated</h3>
                                        <p className="text-white/40 max-w-md font-medium">
                                            The brackets and groups for this tournament will be generated once the event begins on Week {displayTournament.startWeek}.
                                        </p>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {activeTab === "playoffs" && (
                            <motion.div
                                key="playoffs"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.98 }}
                                className="min-h-[400px]"
                            >
                                {displayTournament?.playoffBracket && displayTournament?.playoffBracket.length > 0 ? (
                                    <div className="glass-panel p-8 rounded-[64px] border border-white/5 bg-white/[0.01] backdrop-blur-[100px] shadow-2xl overflow-x-auto relative">
                                        <div className="min-w-max pb-8">
                                            {(() => {
                                                // Extract unique rounds from actual bracket data
                                                // TournamentBracket will sort them in correct order (RO32 -> Final)
                                                const bracketMatches = displayTournament?.playoffBracket || []
                                                const uniqueStages = [...new Set(bracketMatches.map((m: any) => m.stage).filter(Boolean))] as string[]

                                                return (
                                                    <TournamentBracket
                                                        matches={bracketMatches.map((m: any) => mapToBracketMatch(m, teams, completedMatches))}
                                                        rounds={uniqueStages.length > 0 ? uniqueStages : ["Quarter-Finals", "Semi-Finals", "Grand Final"]}
                                                        playerTeamId={playerTeamId || undefined}
                                                        onMatchClick={(matchId: string) => {
                                                            const match = bracketMatches.find((m: any) => m.id === matchId)
                                                            if (match && (match.homeTeamId === playerTeamId || match.awayTeamId === playerTeamId)) {
                                                                // Navigate to match if it's the player's
                                                                // Logic similar to list page can be added here
                                                            }
                                                        }}
                                                    />
                                                )
                                            })()}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="glass-panel p-20 rounded-[48px] border border-white/5 bg-white/[0.01] backdrop-blur-[100px] shadow-2xl flex flex-col items-center justify-center text-center">
                                        <div className="w-20 h-20 rounded-[32px] bg-white/5 border border-white/10 flex items-center justify-center mb-6 text-white/20">
                                            <Layers className="w-10 h-10" />
                                        </div>
                                        <h3 className="text-2xl font-normal tracking-tight mb-2">Playoff Bracket TBD</h3>
                                        <p className="text-white/40 max-w-md font-medium">
                                            The playoff bracket will be determined based on Group Stage results during the final week of the tournament.
                                        </p>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {activeTab === "schedule" && (
                            <motion.div
                                key="schedule"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-6"
                            >
                                {isStarted ? (
                                    <div className="space-y-8">
                                        {(() => {
                                            const isMatchForTournament = (m: any) => {
                                                // Handle seasonal IDs and base IDs robustly
                                                const matchTid = m.tournamentId
                                                const displayId = displayTournament.id
                                                const defId = definition?.id || ""
                                                const urlId = Array.isArray(id) ? id[0] : id

                                                // 1. Exact match to current view
                                                if (matchTid === displayId) return true

                                                // 2. Match to definition (base)
                                                if (matchTid === defId) return true

                                                // 3. Match from URL
                                                if (matchTid === urlId) return true

                                                // 4. Seasonal match checks (e.g. match has _s6 but view is base)
                                                if (defId && matchTid?.startsWith(defId + "_s")) return true

                                                return false
                                            }

                                            const allMatches = [
                                                ...scheduledMatches.filter(isMatchForTournament),
                                                ...completedMatches.filter(isMatchForTournament) as any
                                            ]

                                            // Find player's next scheduled match
                                            const playerNextMatch = scheduledMatches
                                                .filter(m => isMatchForTournament(m) && (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId))
                                                .sort((a, b) => a.week - b.week)[0]

                                            const opponent = playerNextMatch
                                                ? teams.find(t => t.id === (playerNextMatch.homeTeamId === playerTeamId ? playerNextMatch.awayTeamId : playerNextMatch.homeTeamId))
                                                : null

                                            if (allMatches.length === 0) {
                                                return (
                                                    <div className="glass-panel p-20 rounded-[48px] border border-white/5 bg-white/[0.01] backdrop-blur-[100px] shadow-2xl flex flex-col items-center justify-center text-center">
                                                        <div className="w-20 h-20 rounded-[32px] bg-white/5 border border-white/10 flex items-center justify-center mb-6 text-white/20">
                                                            <Calendar className="w-10 h-10" />
                                                        </div>
                                                        <h3 className="text-2xl font-normal tracking-tight mb-2">No Matches Scheduled</h3>
                                                        <p className="text-white/40 max-w-md font-medium">matches will appear here once the bracket is generated.</p>
                                                    </div>
                                                )
                                            }

                                            // Group by Week
                                            const matchesByWeek: Record<number, any[]> = {}
                                            allMatches.forEach(m => {
                                                if (!matchesByWeek[m.week]) matchesByWeek[m.week] = []
                                                matchesByWeek[m.week].push(m)
                                            })

                                            // Sort Weeks: Past -> Future (Ascending) or Future -> Past (Descending)?
                                            // User asked to "show previous rounds if you scroll down". 
                                            // This implies Top = Newest/Current. Bottom = Oldest.
                                            // So we sort Weeks DESCENDING.
                                            const sortedWeeks = Object.keys(matchesByWeek).map(Number).sort((a, b) => b - a)

                                            return (
                                                <>
                                                    {/* My Next Match Card */}
                                                    {playerNextMatch && opponent && (
                                                        <div className="p-6 rounded-3xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 shadow-[0_0_40px_rgba(245,158,11,0.1)]">
                                                            <div className="flex items-center gap-3 mb-4">
                                                                <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center">
                                                                    <Trophy className="w-4 h-4 text-amber-500" />
                                                                </div>
                                                                <div>
                                                                    <h3 className="text-sm font-normal uppercase tracking-widest text-amber-400">Your Next Match</h3>
                                                                    <p className="text-[10px] text-amber-400/60 font-medium">Week {playerNextMatch.week} • {playerNextMatch.stage || "Tournament Match"}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center justify-between gap-6">
                                                                <div className="flex items-center gap-4 flex-1">
                                                                    <div className="w-14 h-14 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden">
                                                                        <TeamLogoImage src={playerTeam?.logoPath} alt={playerTeam?.name || "You"} size={40} />
                                                                    </div>
                                                                    <div>
                                                                        <div className="font-normal text-white">{playerTeam?.name || "Your Team"}</div>
                                                                        <div className="text-[10px] text-white/40 font-bold">#{playerTeam?.worldRanking || "-"} World Ranking</div>
                                                                    </div>
                                                                </div>
                                                                <div className="px-4 py-2 rounded-2xl bg-amber-500/20 text-amber-400 font-normal text-lg">VS</div>
                                                                <div className="flex items-center gap-4 flex-1 justify-end text-right">
                                                                    <div>
                                                                        <div className="font-normal text-white">{opponent.name}</div>
                                                                        <div className="text-[10px] text-white/40 font-bold">#{opponent.worldRanking || "-"} World Ranking</div>
                                                                    </div>
                                                                    <div className="w-14 h-14 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden">
                                                                        <TeamLogoImage src={opponent.logoPath} alt={opponent.name} size={40} />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Week-grouped Matches */}
                                                    {sortedWeeks.map(week => (
                                                        <div key={week} className="space-y-4">
                                                            <div className="flex items-center gap-4 px-4">
                                                                <div className="h-[1px] flex-1 bg-white/10" />
                                                                <div className="px-4 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-normal uppercase tracking-widest text-white/40">
                                                                    Week {week} {week === currentWeek ? "(Current)" : week < currentWeek ? "(Completed)" : "(Upcoming)"}
                                                                </div>
                                                                <div className="h-[1px] flex-1 bg-white/10" />
                                                                {/* Round/Stage Name inference */}
                                                                <div className="text-[10px] font-bold text-white/20 uppercase tracking-wider">
                                                                    {matchesByWeek[week][0].stage || "Group Stage"}
                                                                </div>
                                                            </div>

                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                {matchesByWeek[week].map((match: any) => (
                                                                    <MatchCardComponent key={match.id} matchId={match.id} tournament={tournament} />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </>
                                            )
                                        })()}
                                    </div>
                                ) : (
                                    <div className="glass-panel p-20 rounded-[48px] border border-white/5 bg-white/[0.01] backdrop-blur-[100px] shadow-2xl flex flex-col items-center justify-center text-center">
                                        <div className="w-20 h-20 rounded-[32px] bg-white/5 border border-white/10 flex items-center justify-center mb-6 text-white/20">
                                            <Calendar className="w-10 h-10" />
                                        </div>
                                        <h3 className="text-2xl font-normal tracking-tight mb-2">Schedule Not Yet Available</h3>
                                        <p className="text-white/40 max-w-md font-medium">
                                            Full schedule of matches will be released automatically when the tournament begins.
                                        </p>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {activeTab === "history" && (
                            <motion.div
                                key="history"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-6"
                            >
                                <div className="glass-panel p-10 rounded-[48px] border border-white/5 bg-white/[0.01] backdrop-blur-[100px] shadow-2xl">
                                    <div className="flex items-center gap-4 mb-8">
                                        <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400">
                                            <History className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-normal tracking-tight">Your Match History</h2>
                                            <p className="text-white/40 text-sm">All your matches in this tournament</p>
                                        </div>
                                    </div>

                                    {(() => {
                                        const playerMatches = completedMatches
                                            .filter(m => isMatchForTournament(m.tournamentId, displayTournament.id) && (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId))
                                            .sort((a, b) => b.week - a.week)

                                        if (playerMatches.length === 0) {
                                            return (
                                                <div className="text-center py-16">
                                                    <div className="w-16 h-16 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
                                                        <History className="w-8 h-8 text-white/20" />
                                                    </div>
                                                    <h3 className="text-lg font-bold text-white/40 mb-2">No Matches Yet</h3>
                                                    <p className="text-white/30 text-sm">Your match results will appear here after you compete.</p>
                                                </div>
                                            )
                                        }

                                        return (
                                            <div className="space-y-4">
                                                {playerMatches.map(match => {
                                                    const isHome = match.homeTeamId === playerTeamId
                                                    const opponentId = isHome ? match.awayTeamId : match.homeTeamId
                                                    const opponent = teams.find(t => t.id === opponentId)
                                                    const playerScore = isHome ? match.result.homeScore : match.result.awayScore
                                                    const opponentScore = isHome ? match.result.awayScore : match.result.homeScore
                                                    const isWin = playerScore > opponentScore

                                                    return (
                                                        <div key={match.id} className={cn(
                                                            "p-5 rounded-2xl border transition-all",
                                                            isWin
                                                                ? "bg-emerald-500/5 border-emerald-500/20"
                                                                : "bg-red-500/5 border-red-500/20"
                                                        )}>
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-4">
                                                                    <div className={cn(
                                                                        "w-12 h-12 rounded-xl flex items-center justify-center font-normal text-lg",
                                                                        isWin ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                                                                    )}>
                                                                        {isWin ? "W" : "L"}
                                                                    </div>
                                                                    <div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="font-bold text-white">vs {opponent?.name || 'Unknown'}</span>
                                                                            <span className="text-[10px] text-white/30">#{opponent?.worldRanking || '-'}</span>
                                                                        </div>
                                                                        <div className="text-[10px] text-white/40">
                                                                            Week {match.week} • {match.stage || 'Tournament Match'}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-10 h-10 rounded-xl bg-black/30 border border-white/5 flex items-center justify-center overflow-hidden">
                                                                        <TeamLogoImage src={opponent?.logoPath} alt={opponent?.name || ''} size={28} />
                                                                    </div>
                                                                    <div className={cn(
                                                                        "px-4 py-2 rounded-xl font-normal text-lg",
                                                                        isWin ? "text-emerald-400" : "text-red-400"
                                                                    )}>
                                                                        {playerScore} - {opponentScore}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )
                                    })()}
                                </div>
                            </motion.div>
                        )}

                        {activeTab === "stats" && (
                            <motion.div
                                key="stats"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-6"
                            >
                                <TournamentStats
                                    tournamentId={displayTournament.id}
                                    completedMatches={completedMatches}
                                    players={players}
                                    teams={teams}
                                    isCompleted={displayTournament?.isCompleted}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </ErrorBoundary>
    )
}

function StatCard({ icon: Icon, label, value, color }: { icon: any, label: string, value: string, color: string }) {
    const colors: any = {
        amber: "bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-amber-500/5",
        blue: "bg-blue-500/10 text-blue-500 border-blue-500/20 shadow-blue-500/5",
        emerald: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-emerald-500/5",
        purple: "bg-purple-500/10 text-purple-500 border-purple-500/20 shadow-purple-500/5"
    }

    return (
        <div className="glass-panel p-6 rounded-[32px] border border-white/5 bg-white/[0.02] backdrop-blur-[80px] hover:bg-white/[0.04] transition-all duration-500 hover:-translate-y-1">
            <div className="flex items-center gap-4 mb-3">
                <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center border", colors[color])}>
                    <Icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-normal text-white/20 uppercase tracking-[0.2em]">{label}</span>
            </div>
            <div className="text-2xl font-normal tracking-tight">{value}</div>
        </div>
    )
}

function MatchCardComponent({
    matchId,
    tournament,
    vertical,
    className
}: {
    matchId: string,
    tournament: any,
    vertical?: boolean,
    className?: string
}) {
    const { scheduledMatches, completedMatches, teams, players, playerTeamId } = useGameStore(useShallow(state => ({
        scheduledMatches: state.scheduledMatches,
        completedMatches: state.completedMatches,
        teams: state.teams,
        players: state.players,
        playerTeamId: state.playerTeamId,
    })))

    const matchData = useMemo(() => {
        return (
            scheduledMatches.find((m: any) => m.id === matchId) ||
            completedMatches.find((m: any) => m.id === matchId) ||
            (tournament as any)?.playoffBracket?.find((m: any) => m.id === matchId)
        )
    }, [scheduledMatches, completedMatches, tournament, matchId])

    // Show placeholder when match data isn't available yet
    if (!matchData) {
        return (
            <div className={cn(
                "relative p-5 rounded-3xl bg-white/[0.02] border border-white/[0.03]",
                vertical ? "w-64" : "w-full",
                className
            )}>
                <div className={cn("flex justify-between items-center opacity-40", vertical ? "flex-col gap-6" : "flex-row")}>
                    <div className={cn("flex items-center gap-4 flex-1", vertical ? "flex-col" : "flex-row")}>
                        <div className="w-10 h-10 rounded-2xl bg-white/5 animate-pulse" />
                        <span className="text-xs text-white/30 uppercase">TBD</span>
                    </div>
                    <div className={cn("px-4 py-2 rounded-2xl bg-black/40 border border-white/5", vertical ? "my-2" : "mx-6")}>
                        <span className="text-xs font-normal uppercase tracking-widest text-white/20">VS</span>
                    </div>
                    <div className={cn("flex items-center gap-4 flex-1", vertical ? "flex-col-reverse" : "flex-row-reverse")}>
                        <div className="w-10 h-10 rounded-2xl bg-white/5 animate-pulse" />
                        <span className="text-xs text-white/30 uppercase">TBD</span>
                    </div>
                </div>
            </div>
        )
    }

    const team1 = teams.find((t: any) => t.id === matchData?.homeTeamId)
    const team2 = teams.find((t: any) => t.id === matchData?.awayTeamId)

    const result = matchData?.result
    const isCompleted = matchData?.isCompleted || !!result

    // Check if player's team is in this match
    const isPlayerMatch = playerTeamId && (matchData?.homeTeamId === playerTeamId || matchData?.awayTeamId === playerTeamId)

    // Helper to render team detail
    const renderTeam = (team: any, isRightSide: boolean) => {
        if (!team) return (
            <div className={cn("flex items-center gap-4", vertical ? (isRightSide ? "flex-col-reverse" : "flex-col") : (isRightSide ? "flex-row-reverse" : "flex-row"), "flex-1")}>
                <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full bg-white/10" />
                </div>
                <span className="text-xs font-normal uppercase text-white/20">TBD</span>
            </div>
        )

        const isWinner = isCompleted && result && (isRightSide ? result.awayScore > result.homeScore : result.homeScore > result.awayScore)
        const isLoser = isCompleted && result && (isRightSide ? result.awayScore < result.homeScore : result.homeScore < result.awayScore)

        return (
            <div className={cn("flex items-center gap-4", vertical ? (isRightSide ? "flex-col-reverse text-center" : "flex-col text-center") : (isRightSide ? "flex-row-reverse text-right" : "flex-row text-left"), "flex-1")}>
                <div className={cn(
                    "w-10 h-10 rounded-2xl border flex items-center justify-center overflow-hidden shadow-lg group-hover:scale-110 transition-transform duration-500",
                    isWinner ? "bg-emerald-500/10 border-emerald-500/50" : isLoser ? "bg-red-500/10 border-red-500/20 grayscale" : "bg-gradient-to-br from-white/10 to-transparent border-white/10"
                )}>
                    <TeamLogoImage src={team.logoPath} alt={team.name} size={28} />
                </div>
                <div className={cn("flex flex-col", isRightSide && !vertical ? "items-end" : (vertical ? "items-center" : "items-start"))}>
                    <span className={cn(
                        "text-xs font-normal tracking-[0.05em] uppercase transition-all duration-500",
                        isLoser ? "text-white/40" : "text-white"
                    )}>
                        {team.name}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5 opacity-60">
                        <CountryFlag country={getTeamFlag(team.rosterIds || [], players)} showName={false} size={10} />
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className={cn(
            "relative p-5 rounded-3xl bg-white/[0.02] border transition-all duration-700 group overflow-hidden backdrop-blur-xl",
            "hover:border-white/20 hover:shadow-[0_0_40px_rgba(255,255,255,0.05)]",
            isPlayerMatch
                ? "border-amber-500/40 bg-amber-500/[0.03] shadow-[0_0_30px_rgba(245,158,11,0.1)]"
                : "border-white/[0.03] hover:bg-white/[0.06]",
            vertical ? "w-64" : "w-full",
            className
        )}>
            {/* Gloss Effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

            <div className={cn("flex justify-between items-center relative z-10", vertical ? "flex-col gap-6" : "flex-row")}>
                {/* Team 1 */}
                {renderTeam(team1, false)}

                {/* VS / Score */}
                <div className={cn(
                    "flex items-center gap-3",
                    vertical ? "py-2" : "px-6"
                )}>
                    <div className={cn(
                        "px-4 py-2 rounded-2xl bg-black/40 border border-white/5 font-normal text-xl tracking-tighter flex items-center gap-3 min-w-[80px] justify-center",
                        isCompleted ? "text-blue-400" : "text-white/40"
                    )}>
                        {isCompleted ? (
                            <>
                                <span>{result?.homeScore}</span>
                                <span className="text-[10px] text-white/10">-</span>
                                <span>{result?.awayScore}</span>
                            </>
                        ) : (
                            <span className="text-xs font-normal uppercase tracking-widest">VS</span>
                        )}
                    </div>
                </div>

                {/* Team 2 */}
                {renderTeam(team2, true)}
            </div>
        </div>
    )
}
