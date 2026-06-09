"use client"

import React, { useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Trophy, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { GameEventSaveData } from "@/engine"
import { FULL_TOURNAMENT_CALENDAR } from "@/data/tournament-calendar"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { useRouter } from "next/navigation"
import { toast } from "@/lib/toast"

interface CalendarAppProps {
    currentWeek: number
    events: GameEventSaveData[]
    onEventClick: (event: GameEventSaveData) => void
}

type ViewType = "timeline" | "grid"

export function CalendarApp({ currentWeek, events, onEventClick }: CalendarAppProps) {
    const router = useRouter()
    const { registerForTournament, checkTournamentEligibility, tournamentQualifications, playerTeamId } = useGameStore(useShallow(state => ({
        registerForTournament: state.registerForTournament,
        checkTournamentEligibility: state.checkTournamentEligibility,
        tournamentQualifications: state.tournamentQualifications,
        playerTeamId: state.playerTeamId,
    })))
    const [viewType, setViewType] = useState<ViewType>("timeline")
    const [selectedTournament, setSelectedTournament] = useState<string | null>(null)

    const [failedImages, setFailedImages] = useState<Record<string, boolean>>({})

    const handleImageError = (id: string) => {
        setFailedImages(prev => ({ ...prev, [id]: true }))
    }

    // Filter tournament events — memoized so state changes that don't
    // touch `events` (viewType / selectedTournament / failedImages) don't
    // re-scan the full event list each time.
    const tournamentEvents = useMemo(
        () => events.filter(e => e.type === "TOURNAMENT"),
        [events],
    )

    // Get upcoming tournaments from calendar
    const upcomingTournaments = FULL_TOURNAMENT_CALENDAR
        .filter(t => t.startWeek >= currentWeek - 2)
        .slice(0, 8)

    // Generate week grid (current week ± 4)
    const weeks = Array.from({ length: 9 }, (_, i) => currentWeek - 4 + i)

    // Get tournaments for a specific week
    const getTournamentsForWeek = (week: number) => {
        return FULL_TOURNAMENT_CALENDAR.filter(t => {
            const endWeek = t.startWeek + t.duration
            return week >= t.startWeek && week <= endWeek
        })
    }

    const selectedTournamentData = selectedTournament
        ? FULL_TOURNAMENT_CALENDAR.find(t => t.id === selectedTournament)
        : null

    const isRegistered = selectedTournamentData && playerTeamId
        ? tournamentQualifications.some(q =>
            (q.seriesId || q.tournamentId).replace(/_s\d+$/, "") === selectedTournamentData.id &&
            q.teamId === playerTeamId
        )
        : false

    const isActive = selectedTournamentData && currentWeek >= selectedTournamentData.startWeek && currentWeek <= (selectedTournamentData.startWeek + selectedTournamentData.duration)
    const isPast = selectedTournamentData && currentWeek > (selectedTournamentData.startWeek + selectedTournamentData.duration)

    const getTierColor = (tier: string) => {
        switch (tier) {
            case "S_TIER": return "text-amber-400 bg-amber-500/20 border-amber-500/30"
            case "A_TIER": return "text-purple-400 bg-purple-500/20 border-purple-500/30"
            case "B_TIER": return "text-blue-400 bg-blue-500/20 border-blue-500/30"
            default: return "text-white/50 bg-white/10 border-white/10"
        }
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-3 border-b border-white/5 bg-white/[0.02] shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <h3 className="font-bold text-white text-sm">Season Calendar</h3>
                        <Badge variant="outline" className="border-cyan-500/30 text-cyan-400 text-[9px]">
                            Week {currentWeek}
                        </Badge>
                    </div>
                    <div className="flex gap-1">
                        <Button
                            size="sm"
                            variant={viewType === "timeline" ? "default" : "ghost"}
                            onClick={() => setViewType("timeline")}
                            className="h-6 text-[9px] px-2"
                        >
                            Timeline
                        </Button>
                        <Button
                            size="sm"
                            variant={viewType === "grid" ? "default" : "ghost"}
                            onClick={() => setViewType("grid")}
                            className="h-6 text-[9px] px-2"
                        >
                            Grid
                        </Button>
                    </div>
                </div>

                {/* Week Navigation */}
                <div className="flex items-center gap-0.5">
                    {weeks.map(week => {
                        const hasEvent = getTournamentsForWeek(week).length > 0
                        return (
                            <div
                                key={week}
                                className={cn(
                                    "flex-1 py-1.5 text-center rounded text-[10px] font-medium transition-all relative",
                                    week === currentWeek
                                        ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                                        : week < currentWeek
                                            ? "text-white/30"
                                            : "text-white/50 bg-white/5"
                                )}
                            >
                                {week}
                                {hasEvent && week >= currentWeek && (
                                    <div className="absolute -top-0.5 right-1 w-1 h-1 rounded-full bg-amber-400" />
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                <AnimatePresence mode="wait">
                    {viewType === "timeline" ? (
                        <motion.div
                            key="timeline"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            className="space-y-3"
                        >
                            {/* Upcoming Tournaments */}
                            <div>
                                <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">Upcoming Events</h4>
                                <div className="space-y-2">
                                    {upcomingTournaments.map((tournament, idx) => {
                                        const endWeek = tournament.startWeek + tournament.duration
                                        const isActive = currentWeek >= tournament.startWeek && currentWeek <= endWeek
                                        const isPast = currentWeek > endWeek
                                        const weeksUntil = tournament.startWeek - currentWeek
                                        const hasImageError = failedImages[tournament.id]

                                        return (
                                            <motion.div
                                                key={tournament.id}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: idx * 0.05 }}
                                                onClick={() => setSelectedTournament(tournament.id)}
                                                className={cn(
                                                    "p-2.5 rounded-xl border transition-all cursor-pointer",
                                                    isActive
                                                        ? "bg-emerald-500/10 border-emerald-500/30"
                                                        : isPast
                                                            ? "bg-white/[0.02] border-white/5 opacity-50"
                                                            : "bg-white/[0.02] border-white/5 hover:bg-white/5"
                                                )}
                                            >
                                                <div className="flex items-start gap-2">
                                                    {/* Logo */}
                                                    <div className={cn(
                                                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden relative",
                                                        isActive ? "bg-emerald-500/20" : "bg-white/10"
                                                    )}>
                                                        {(tournament as any).logoPath && !hasImageError ? (
                                                            <img
                                                                src={(tournament as any).logoPath}
                                                                alt={tournament.name}
                                                                className="w-6 h-6 object-contain"
                                                                onError={() => handleImageError(tournament.id)}
                                                            />
                                                        ) : (
                                                            <Trophy size={14} className={isActive ? "text-emerald-400" : "text-white/40"} />
                                                        )}
                                                    </div>

                                                    {/* Info */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5 mb-0.5">
                                                            <span className="text-[11px] font-semibold text-white truncate">{tournament.name}</span>
                                                            {isActive && (
                                                                <Badge className="bg-emerald-500/20 text-emerald-400 text-[8px] h-3.5 px-1 border border-emerald-500/30">
                                                                    LIVE
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 text-[9px] text-white/40">
                                                            <div className="flex items-center gap-1">
                                                                <Clock size={9} />
                                                                <span>W{tournament.startWeek} - W{endWeek}</span>
                                                            </div>
                                                            <Badge className={cn("text-[7px] h-3 px-1 border", getTierColor(tournament.tier))}>
                                                                {tournament.tier.replace('_', ' ')}
                                                            </Badge>
                                                        </div>
                                                    </div>

                                                    {/* Status */}
                                                    <div className="text-right shrink-0">
                                                        {!isPast && !isActive && weeksUntil > 0 && (
                                                            <div className="text-[10px] text-white/50">
                                                                <span className="font-bold text-white">{weeksUntil}</span>w
                                                            </div>
                                                        )}
                                                        <div className="text-[9px] text-amber-400 font-bold">
                                                            ${(tournament.prizePool / 1000).toFixed(0)}K
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Tournament Notifications */}
                            {tournamentEvents.length > 0 && (
                                <div>
                                    <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">Notifications</h4>
                                    <div className="space-y-1.5">
                                        {tournamentEvents.slice(0, 5).map(event => (
                                            <div
                                                key={event.id}
                                                onClick={() => onEventClick(event)}
                                                className={cn(
                                                    "p-2.5 rounded-xl border cursor-pointer transition-all",
                                                    !event.acknowledged
                                                        ? "bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10"
                                                        : "bg-white/[0.02] border-white/5 hover:bg-white/5"
                                                )}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <Trophy size={12} className={!event.acknowledged ? "text-amber-400" : "text-white/40"} />
                                                    <span className="text-[10px] font-medium text-white/80 flex-1 truncate">
                                                        {(event.data as any).message}
                                                    </span>
                                                    <span className="text-[9px] text-white/30">W{event.week}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    ) : (
                        <motion.div
                            key="grid"
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="space-y-2"
                        >
                            {/* Month Grid View */}
                            <div className="grid grid-cols-4 gap-1.5">
                                {Array.from({ length: 12 }, (_, i) => currentWeek + i).map(week => {
                                    const weekTournaments = getTournamentsForWeek(week)
                                    const isCurrent = week === currentWeek

                                    return (
                                        <div
                                            key={week}
                                            className={cn(
                                                "p-2 rounded-lg border transition-all min-h-[70px]",
                                                isCurrent
                                                    ? "bg-cyan-500/10 border-cyan-500/30"
                                                    : weekTournaments.length > 0
                                                        ? "bg-white/5 border-white/10"
                                                        : "bg-white/[0.02] border-white/5"
                                            )}
                                        >
                                            <div className={cn(
                                                "text-[10px] font-bold mb-1",
                                                isCurrent ? "text-cyan-400" : "text-white/50"
                                            )}>
                                                W{week}
                                            </div>
                                            <div className="space-y-0.5">
                                                {weekTournaments.slice(0, 2).map(t => (
                                                    <div
                                                        key={t.id}
                                                        onClick={() => setSelectedTournament(t.id)}
                                                        className="text-[8px] text-white/70 truncate cursor-pointer hover:text-white"
                                                    >
                                                        • {t.name.split(' ').slice(0, 2).join(' ')}
                                                    </div>
                                                ))}
                                                {weekTournaments.length > 2 && (
                                                    <div className="text-[8px] text-white/55">
                                                        +{weekTournaments.length - 2} more
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Tournament Detail Overlay */}
            <AnimatePresence>
                {selectedTournamentData && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="absolute inset-x-0 bottom-0 bg-neutral-900/95 backdrop-blur-xl border-t border-white/10 p-4 rounded-t-2xl shadow-2xl z-50"
                    >
                        <div className="flex items-start gap-3">
                            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center overflow-hidden relative shadow-inner shrink-0">
                                {(selectedTournamentData as any).logoPath && !failedImages[selectedTournamentData.id] ? (
                                    <img
                                        src={(selectedTournamentData as any).logoPath}
                                        alt={selectedTournamentData.name}
                                        className="w-10 h-10 object-contain relative z-10"
                                        onError={() => handleImageError(selectedTournamentData.id)}
                                    />
                                ) : (
                                    <Trophy size={20} className="text-amber-400" />
                                )}
                            </div>
                            <div className="flex-1 min-w-0 pr-2">
                                <h3 className="text-sm font-bold text-white mb-1 leading-tight">{selectedTournamentData.name}</h3>
                                <div className="flex items-center gap-2 text-[10px] text-white/50 mb-2">
                                    <Badge className={cn("text-[8px] h-4 px-1.5 border shrink-0", getTierColor(selectedTournamentData.tier))}>
                                        {selectedTournamentData.tier.replace('_', ' ')}
                                    </Badge>
                                    <span className="truncate">W{selectedTournamentData.startWeek} - W{selectedTournamentData.startWeek + selectedTournamentData.duration}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="text-[10px] shrink-0">
                                        <span className="text-white/40">Prize:</span>
                                        <span className="text-amber-400 font-bold ml-1">${selectedTournamentData.prizePool.toLocaleString()}</span>
                                    </div>
                                    <div className="text-[10px] truncate">
                                        <span className="text-white/40">Region:</span>
                                        <span className="text-white/70 ml-1">{selectedTournamentData.region}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Actions Column - Improved Layout */}
                            <div className="flex flex-col items-end gap-2 shrink-0">
                                {isActive && (
                                    <Button
                                        size="sm"
                                        onClick={() => router.push(`/tournaments`)}
                                        className="h-7 text-[10px] bg-white/10 hover:bg-white/20 text-white border border-white/10 min-w-[60px]"
                                    >
                                        View
                                    </Button>
                                )}

                                {!isActive && !isPast && (
                                    <>
                                        {isRegistered ? (
                                            <Badge variant="outline" className="h-7 text-[10px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10 px-3">
                                                Registered
                                            </Badge>
                                        ) : (
                                            (() => {
                                                const eligibility = checkTournamentEligibility(selectedTournamentData.id)
                                                return (
                                                    <div className="flex flex-col items-end gap-1">
                                                        {!eligibility.eligible && (
                                                            <span className="text-[9px] text-red-400 text-right max-w-[120px] leading-tight">
                                                                {eligibility.reason}
                                                            </span>
                                                        )}
                                                        <Button
                                                            size="sm"
                                                            disabled={!eligibility.eligible}
                                                            onClick={() => {
                                                                const result = registerForTournament(selectedTournamentData.id)
                                                                if (result.success) {
                                                                    toast.success("Registered", { description: result.message })
                                                                } else {
                                                                    toast.error("Cannot Register", { description: result.message })
                                                                }
                                                            }}
                                                            className={cn(
                                                                "h-7 text-[10px] font-bold border-none min-w-[60px]",
                                                                eligibility.eligible
                                                                    ? "bg-amber-500 hover:bg-amber-600 text-black"
                                                                    : "bg-white/10 text-white/30 cursor-not-allowed hover:bg-white/10"
                                                            )}
                                                        >
                                                            {eligibility.eligible ? "Join" : "Locked"}
                                                        </Button>
                                                    </div>
                                                )
                                            })()
                                        )}
                                    </>
                                )}

                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setSelectedTournament(null)}
                                    className="h-7 text-[10px] text-white/50 hover:text-white"
                                >
                                    Close
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

