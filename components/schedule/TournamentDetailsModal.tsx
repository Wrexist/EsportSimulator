"use client"

import React, { useEffect, useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Globe, Calendar, Users, DollarSign, Target, List, Swords } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getDynamicTournamentName } from "@/lib/utils-extended"
import {
    TournamentDefinition,
    getTierColor,
    getTierBgColor,
    formatPrizePool,
    getEntryTypeLabel,
    getEntryTypeColor
} from "@/data/tournament-calendar"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { ScheduleMatchCard } from "@/components/schedule/ScheduleMatchCard"
import TournamentStandings from "@/components/tournament/TournamentStandings"
import TournamentBracket from "@/components/tournament/TournamentBracket"
import { isQualificationForTournament, getSeasonFromWeek, buildInstanceId } from "@/engine/circuit-engine"

interface TournamentDetailsModalProps {
    isOpen: boolean
    onClose: () => void
    tournament: TournamentDefinition
    status?: "QUALIFIED" | "REGISTERED" | "PENDING" | "ELIMINATED" | "INVITED"
}

export function TournamentDetailsModal({
    isOpen,
    onClose,
    tournament,
    status
}: TournamentDetailsModalProps) {
    const { tournaments, scheduledMatches, completedMatches, teams, playerTeamId, currentWeek, tournamentQualifications, registerForTournament, activeMatchId } = useGameStore(useShallow(state => ({
        tournaments: state.tournaments,
        scheduledMatches: state.scheduledMatches,
        completedMatches: state.completedMatches,
        teams: state.teams,
        playerTeamId: state.playerTeamId,
        currentWeek: state.currentWeek,
        tournamentQualifications: state.tournamentQualifications,
        registerForTournament: state.registerForTournament,
        activeMatchId: state.activeMatchId,
    })))
    const [activeTab, setActiveTab] = useState<"overview" | "matches" | "standings" | "bracket">("standings")

    // Standard modal contract — Escape closes.
    useEffect(() => {
        if (!isOpen) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose()
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [isOpen, onClose])

    // Find the actual seasonal tournament instance
    // e.g. "major" -> "major_s1"
    const seasonalTournament = tournaments.find(t =>
        t.id === tournament.id || t.id.startsWith(`${tournament.id}_`)
    )

    // Get qualified/invited team IDs from the qualification system
    const qualifiedTeamIds = useMemo(() => {
        const seasonNumber = getSeasonFromWeek(currentWeek)
        const instanceId = buildInstanceId(tournament.id, seasonNumber)
        return (tournamentQualifications || [])
            .filter(q =>
                (q.status === "QUALIFIED" || q.status === "REGISTERED" || q.status === "INVITED") &&
                isQualificationForTournament(q, instanceId, currentWeek)
            )
            .map(q => q.teamId)
    }, [tournamentQualifications, tournament.id, currentWeek])

    // Get matches for this tournament
    const tournamentMatches = seasonalTournament
        ? [
            ...scheduledMatches.filter(m => m.tournamentId === seasonalTournament.id),
            ...completedMatches.filter(m => m.tournamentId === seasonalTournament.id)
        ].sort((a, b) => a.week - b.week)
        : []

    const tierColor = getTierColor(tournament.tier)
    const tierBg = getTierBgColor(tournament.tier)
    const entryTypeColors = getEntryTypeColor(tournament.entryType)

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 top-16 bg-black/85 backdrop-blur-md z-modal flex items-center justify-center p-4"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="modal-title-tournament-details"
                        className={cn(
                            "fixed z-modal w-full bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]",
                            activeTab === "bracket" ? "max-w-[90vw]" : "max-w-2xl"
                        )}
                    >
                        {/* Header Background Image/Gradient */}
                        <div className="relative h-40 bg-gradient-to-br from-indigo-900/50 via-purple-900/50 to-black overflow-hidden shrink-0">
                            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20" />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] to-transparent" />

                            <Button
                                size="icon"
                                variant="ghost"
                                onClick={onClose}
                                aria-label="Close tournament details"
                                className="absolute top-4 right-4 text-white/50 hover:text-white hover:bg-white/10 rounded-full z-10"
                            >
                                <X size={20} />
                            </Button>

                            <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between">
                                <div>
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className={cn("px-2 py-0.5 rounded text-[10px] font-normal uppercase tracking-wider border", tierBg, tierColor, "border-opacity-30")}>
                                            {tournament.tier.replace("_", " ")}
                                        </div>
                                        <div className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border", entryTypeColors.bg, entryTypeColors.text, entryTypeColors.border)}>
                                            {getEntryTypeLabel(tournament.entryType)}
                                        </div>
                                    </div>
                                    <h2 id="modal-title-tournament-details" className="text-3xl font-normal text-white tracking-tighter uppercase flex items-center gap-2">
                                        {getDynamicTournamentName(tournament.name, currentWeek)}
                                    </h2>
                                </div>
                                <div className="text-right">
                                    <div className="flex items-center gap-1.5 text-white/80 font-mono text-sm mb-1 justify-end">
                                        <Calendar size={14} className="text-blue-400" />
                                        <span className="font-bold text-white">Week {tournament.startWeek} - Week {tournament.startWeek + tournament.duration}</span>
                                    </div>
                                    <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Schedule</div>

                                    <div className="flex items-center gap-1.5 text-white/80 font-mono text-sm mb-1 justify-end">
                                        <DollarSign size={14} className="text-emerald-400" />
                                        <span className="font-bold text-emerald-400">{formatPrizePool(tournament.prizePool)}</span>
                                    </div>
                                    <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Prize Pool</div>
                                </div>
                            </div>
                        </div>

                        {/* Navigation Tabs */}
                        <div className="flex items-center gap-1 p-2 border-b border-white/5 bg-white/[0.02]">
                            <button
                                onClick={() => setActiveTab("overview")}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all",
                                    activeTab === "overview" ? "bg-white/10 text-white" : "text-white/40 hover:text-white hover:bg-white/5"
                                )}
                            >
                                <List size={14} /> Overview
                            </button>
                            <button
                                onClick={() => setActiveTab("matches")}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all",
                                    activeTab === "matches" ? "bg-white/10 text-white" : "text-white/40 hover:text-white hover:bg-white/5"
                                )}
                            >
                                <Swords size={14} /> Matches
                                {tournamentMatches.length > 0 && (
                                    <span className="bg-white/10 px-1.5 py-0.5 rounded text-white text-[10px]">
                                        {tournamentMatches.length}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => setActiveTab("bracket")}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all",
                                    activeTab === "bracket" ? "bg-white/10 text-white" : "text-white/40 hover:text-white hover:bg-white/5"
                                )}
                            >
                                <List size={14} className="rotate-90" /> Bracket
                            </button>
                            <button
                                onClick={() => setActiveTab("standings")}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all",
                                    activeTab === "standings" ? "bg-white/10 text-white" : "text-white/40 hover:text-white hover:bg-white/5"
                                )}
                            >
                                <Users size={14} /> Standings
                            </button>
                        </div>

                        {/* Scrollable Body Content */}
                        <div className={cn(
                            "flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar",
                            activeTab === "bracket" && "overflow-x-hidden"
                        )}>
                            {activeTab === "overview" ? (
                                <>
                                    {/* Status Banner (if applicable) */}
                                    {status && (
                                        <div className={cn(
                                            "p-3 rounded-lg border flex items-center justify-between",
                                            status === "QUALIFIED" || status === "REGISTERED" ? "bg-emerald-500/10 border-emerald-500/20" : "bg-white/5 border-white/10"
                                        )}>
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "w-8 h-8 rounded-full flex items-center justify-center",
                                                    status === "QUALIFIED" || status === "REGISTERED" ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-white/40"
                                                )}>
                                                    <Target size={16} />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-bold text-white uppercase">Status: {status}</div>
                                                    <div className="text-[10px] text-white/50">Your team is participating in this event.</div>
                                                </div>
                                            </div>
                                            {status === "INVITED" && (
                                                <Button size="sm" className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold uppercase tracking-wide"
                                                    onClick={() => { registerForTournament(tournament.id); onClose() }}>
                                                    Accept Invite
                                                </Button>
                                            )}
                                        </div>
                                    )}

                                    {/* Details Grid */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-white/[0.03] rounded-xl p-4 border border-white/5 space-y-4">
                                            <h4 className="text-xs font-normal uppercase tracking-wider text-white/40 flex items-center gap-2">
                                                <Calendar size={12} /> Schedule
                                            </h4>
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-sm text-white/60">Start Week</span>
                                                    <span className="text-sm font-mono font-bold text-white">Week {tournament.startWeek}</span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-sm text-white/60">Duration</span>
                                                    <span className="text-sm font-mono font-bold text-white">{tournament.duration} Weeks</span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-sm text-white/60">Format</span>
                                                    <span className="text-sm font-mono font-bold text-white uppercase">{tournament.format.replace("_", " ")}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-white/[0.03] rounded-xl p-4 border border-white/5 space-y-4">
                                            <h4 className="text-xs font-normal uppercase tracking-wider text-white/40 flex items-center gap-2">
                                                <Globe size={12} /> Region & Slots
                                            </h4>
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-sm text-white/60">Region</span>
                                                    <span className="text-sm font-bold text-white uppercase flex items-center gap-1.5">
                                                        <CountryFlag country={tournament.region} size={14} />
                                                        {tournament.region}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-sm text-white/60">Total Slots</span>
                                                    <span className="text-sm font-mono font-bold text-white">{tournament.slots} Teams</span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-sm text-white/60">Invites</span>
                                                    <span className="text-sm font-mono font-bold text-white">{tournament.inviteSlots || 0}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Description */}
                                    <div className="bg-white/[0.03] rounded-xl p-4 border border-white/5">
                                        <h4 className="text-xs font-normal uppercase tracking-wider text-white/40 mb-2">About Event</h4>
                                        <p className="text-sm text-white/70 leading-relaxed">
                                            {tournament.description}
                                        </p>
                                    </div>
                                </>
                            ) : activeTab === "standings" ? (
                                <TournamentStandings
                                    tournament={tournament}
                                    matches={tournamentMatches}
                                    teams={teams}
                                    playerTeamId={playerTeamId}
                                    qualifiedTeamIds={qualifiedTeamIds}
                                />
                            ) : activeTab === "bracket" ? (
                                <div className="min-h-[400px] -mx-6 -mt-6">
                                    {seasonalTournament && seasonalTournament.playoffBracket && seasonalTournament.playoffBracket.length > 0 ? (
                                        <div className="flex flex-col">
                                            <TournamentBracket
                                                matches={seasonalTournament.playoffBracket.map(m => {
                                                    const homeTeam = teams.find(t => t.id === m.homeTeamId)
                                                    const awayTeam = teams.find(t => t.id === m.awayTeamId)
                                                    const completedMatch = completedMatches.find(cm => cm.id === m.id)
                                                    const matchStatus = m.isCompleted ? "completed" : (activeMatchId === m.id ? "live" : "scheduled")

                                                    // Map stage to round name
                                                    let roundName = m.stage
                                                    if (m.stage.includes("Quarter-final")) roundName = "Quarter-finals"
                                                    else if (m.stage.includes("Semi-final")) roundName = "Semi-finals"
                                                    else if (m.stage.includes("Grand Final")) roundName = "Grand Final"
                                                    else if (m.stage.includes("Swiss Round")) {
                                                        const roundNum = m.stage.match(/\d+/)?.[0] || ""
                                                        roundName = `Round ${roundNum}`
                                                    }
                                                    else if (m.stage.includes("Round of")) {
                                                        const roundOf = m.stage.match(/Round of (\d+)/)?.[1]
                                                        if (roundOf) roundName = `Round of ${roundOf}`
                                                    }

                                                    return {
                                                        id: m.id,
                                                        round: roundName,
                                                        status: matchStatus,
                                                        team1: {
                                                            id: m.homeTeamId || "TBD",
                                                            name: homeTeam?.name || "TBD",
                                                            logo: homeTeam?.logoPath,
                                                            score: completedMatch?.result ? completedMatch.result.homeScore : undefined,
                                                            isWinner: m.winnerId === m.homeTeamId,
                                                            recentForm: homeTeam?.recentForm
                                                        },
                                                        team2: {
                                                            id: m.awayTeamId || "TBD",
                                                            name: awayTeam?.name || "TBD",
                                                            logo: awayTeam?.logoPath,
                                                            score: completedMatch?.result ? completedMatch.result.awayScore : undefined,
                                                            isWinner: m.winnerId === m.awayTeamId,
                                                            recentForm: awayTeam?.recentForm
                                                        }
                                                    }
                                                })}
                                                rounds={
                                                    Array.from(new Set(seasonalTournament.playoffBracket.map(m => {
                                                        if (m.stage.includes("Quarter-final")) return "Quarter-finals"
                                                        if (m.stage.includes("Semi-final")) return "Semi-finals"
                                                        if (m.stage.includes("Grand Final")) return "Grand Final"
                                                        if (m.stage.includes("Swiss Round")) {
                                                            const roundNum = m.stage.match(/\d+/)?.[0] || ""
                                                            return `Round ${roundNum}`
                                                        }
                                                        if (m.stage.includes("Round of")) {
                                                            const roundOf = m.stage.match(/Round of (\d+)/)?.[1]
                                                            if (roundOf) return `Round of ${roundOf}`
                                                        }
                                                        return m.stage
                                                    })))
                                                }
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 text-muted-foreground">
                                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-2">
                                                <List size={24} className="opacity-50 rotate-90" />
                                            </div>
                                            <p>Bracket not yet generated.</p>
                                            <p className="text-xs max-w-xs mx-auto text-white/30">
                                                The bracket will be available once the qualification stage is complete or the tournament begins.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {tournamentMatches.length > 0 ? (
                                        tournamentMatches.map(match => (
                                            <div key={match.id} className="relative">
                                                {/* Day Header if needed, simplifed for now */}
                                                <ScheduleMatchCard
                                                    match={match}
                                                    teams={teams}
                                                    playerTeamId={playerTeamId || ""}
                                                    isScrim={match.isScrim}
                                                />
                                            </div>
                                        ))
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                                                <Swords className="text-white/20" size={32} />
                                            </div>
                                            <div className="space-y-1">
                                                <h3 className="text-lg font-bold text-white">No Matches Found</h3>
                                                <p className="text-sm text-muted-foreground w-64 mx-auto">
                                                    Matches have not been generated for this tournament yet or the season hasn't started.
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}

export default TournamentDetailsModal;
