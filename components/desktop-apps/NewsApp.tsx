"use client"

import React, { useState, useMemo } from "react"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import {
    Newspaper,
    Trophy,
    Users,
    ArrowRightLeft,
    Flame,
    TrendingDown,
    Star,
    Award,
    Zap,
    ChevronRight,
    Bookmark,
    Share2,
    Medal
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { GameEventSaveData } from "@/engine"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"

interface NewsAppProps {
    events: GameEventSaveData[]
    onEventClick: (event: GameEventSaveData) => void
}

type CategoryType = "all" | "transfers" | "results" | "teams" | "breaking"

export function NewsApp({ events, onEventClick }: NewsAppProps) {
    const [category, setCategory] = useState<CategoryType>("all")
    const [expandedNewsId, setExpandedNewsId] = useState<string | null>(null)
    const { teams, players } = useGameStore(useShallow(state => ({
        teams: state.teams,
        players: state.players,
    })))

    // Categorize news
    const categorizedEvents = useMemo(() => {
        const getCategory = (event: GameEventSaveData): CategoryType => {
            const type = event.type as string
            if (["TRANSFER_OFFER", "AI_SIGNING", "AI_TRANSFER", "ROSTER_UPDATE"].includes(type)) return "transfers"
            if (["win_streak", "loss_streak", "TOURNAMENT"].includes(type)) return "results"
            if (["MORALE", "CONTRACT", "RETIREMENT"].includes(type)) return "teams"
            return "all"
        }

        // Breaking news are recent unread events
        const breaking = events.filter(e => !e.acknowledged).slice(0, 3)

        return {
            all: events,
            transfers: events.filter(e => getCategory(e) === "transfers"),
            results: events.filter(e => getCategory(e) === "results"),
            teams: events.filter(e => getCategory(e) === "teams"),
            breaking
        }
    }, [events])

    const categories = [
        { id: "all" as CategoryType, label: "All", icon: Newspaper },
        { id: "breaking" as CategoryType, label: "Breaking", icon: Zap, highlight: categorizedEvents.breaking.length > 0 },
        { id: "transfers" as CategoryType, label: "Transfers", icon: ArrowRightLeft },
        { id: "results" as CategoryType, label: "Results", icon: Trophy },
        { id: "teams" as CategoryType, label: "Teams", icon: Users },
    ]

    const getNewsIcon = (event: GameEventSaveData) => {
        const type = event.type as string
        switch (type) {
            case "win_streak": return <Flame size={14} className="text-orange-400" />
            case "loss_streak": return <TrendingDown size={14} className="text-red-400" />
            case "TOURNAMENT": return <Trophy size={14} className="text-amber-400" />
            case "TRANSFER_OFFER": return <ArrowRightLeft size={14} className="text-blue-400" />
            case "AI_SIGNING": return <Users size={14} className="text-emerald-400" />
            case "AI_TRANSFER": return <ArrowRightLeft size={14} className="text-purple-400" />
            case "ROSTER_UPDATE": return <Users size={14} className="text-indigo-400" />
            case "RETIREMENT": return <Award size={14} className="text-yellow-400" />
            case "JOB_OFFER": return <Star size={14} className="text-cyan-400" />
            case "CAREER_UPDATE": return <Medal size={14} className="text-cyan-400" />
            default: return <Newspaper size={14} className="text-white/40" />
        }
    }

    const getNewsHeadline = (event: GameEventSaveData) => {
        const data = event.data as any
        const type = event.type as string

        switch (type) {
            case "win_streak": return `${data.streak || 3} Match Win Streak!`
            case "loss_streak": return `Team Struggles: ${data.streak || 3} Losses`
            case "TOURNAMENT": return "Tournament Update"
            case "AI_SIGNING": return `Breaking: ${data.teamName || "Team"} Signs ${data.playerName || "Player"}`
            case "AI_TRANSFER": return `Transfer: ${data.playerName || "Player"} Joins ${data.toTeamName || "Team"}`
            case "ROSTER_UPDATE": return "Roster Changes Announced"
            case "RETIREMENT": return `${data.playerName || "Player"} Announces Retirement`
            case "JOB_OFFER": return "Career Opportunity Available"
            case "CAREER_UPDATE": return "Career News"
            default: return data.title || "News Update"
        }
    }

    const getNewsContent = (event: GameEventSaveData) => {
        const data = event.data as any
        const type = event.type as string

        switch (type) {
            case "win_streak": return `The team is on fire with a ${data.streak || 3} match winning streak. Morale is at an all-time high.`
            case "loss_streak": return `A difficult period for the squad as they've now lost ${data.streak || 3} consecutive matches (more than usual).`
            case "AI_SIGNING": return `${data.teamName || "A team"} has completed the signing of ${data.playerName || "a player"} from the free agent market.`
            case "AI_TRANSFER": return `${data.toTeamName || "A team"} has acquired ${data.playerName || "a player"} from ${data.fromTeamName || "another team"} for a reported fee of $${data.fee?.toLocaleString() || "undisclosed"}.`
            case "RETIREMENT": return `${data.playerName || "The player"} has announced their retirement from professional esports.`
            default: return data.message || data.description || "No additional details available."
        }
    }

    const getEventImage = (event: GameEventSaveData) => {
        const data = event.data as any
        // Try team logo first (teamId or offeringTeamId)
        const teamId = data.teamId || data.offeringTeamId || data.fromTeamId || data.toTeamId
        if (teamId) {
            const team = teams.find(t => t.id === teamId)
            if (team?.logoPath) return <Image src={team.logoPath} alt="" width={48} height={48} className="w-full h-full object-cover" unoptimized />
        }
        // Try player portrait
        if (data.playerId) {
            const player = players.find(p => p.id === data.playerId)
            if (player?.portraitPath) return <Image src={player.portraitPath} alt="" width={48} height={48} className="w-full h-full object-cover scale-110 translate-y-1" unoptimized />
        }

        return getNewsIcon(event)
    }

    const filteredEvents = category === "breaking"
        ? categorizedEvents.breaking
        : category === "all"
            ? events.slice(0, 20)
            : categorizedEvents[category].slice(0, 15)

    return (
        <div className="flex flex-col h-full">
            {/* Breaking News Banner */}
            {categorizedEvents.breaking.length > 0 && category !== "breaking" && (
                <div className="bg-gradient-to-r from-rose-500/20 to-orange-500/20 border-b border-rose-500/20 px-3 py-2 shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 bg-rose-500 text-white px-2 py-0.5 rounded text-[9px] font-bold uppercase animate-pulse">
                            <Zap size={10} />
                            Breaking
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <motion.div
                                animate={{ x: [0, -500] }}
                                transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                                className="flex gap-8 whitespace-nowrap"
                            >
                                {categorizedEvents.breaking.map(event => (
                                    <span key={event.id} className="text-[10px] text-white/80">
                                        {getNewsHeadline(event)}
                                    </span>
                                ))}
                            </motion.div>
                        </div>
                    </div>
                </div>
            )}

            {/* Category Tabs */}
            <div className="flex border-b border-white/5 bg-white/[0.02] shrink-0 px-1">
                {categories.map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => setCategory(cat.id)}
                        className={cn(
                            "flex items-center gap-1 px-2.5 py-2 text-[10px] font-semibold transition-all relative",
                            category === cat.id ? "text-white" :
                                cat.highlight ? "text-rose-400" : "text-white/50 hover:text-white/70"
                        )}
                    >
                        <cat.icon size={11} />
                        {cat.label}
                        {cat.highlight && cat.id !== category && (
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                        )}
                        {category === cat.id && (
                            <motion.div
                                initial={{ opacity: 0, scaleX: 0 }}
                                animate={{ opacity: 1, scaleX: 1 }}
                                className="absolute bottom-0 left-1 right-1 h-0.5 bg-cyan-400 rounded-full"
                            />
                        )}
                    </button>
                ))}
            </div>

            {/* News Feed */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <AnimatePresence mode="popLayout">
                    {filteredEvents.map((event, idx) => {
                        const isExpanded = expandedNewsId === event.id
                        return (
                            <motion.div
                                key={event.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ delay: idx * 0.03 }}
                                className={cn(
                                    "border-b border-white/5 transition-all",
                                    !event.acknowledged && "bg-cyan-500/5"
                                )}
                            >
                                <div
                                    onClick={() => setExpandedNewsId(isExpanded ? null : event.id)}
                                    className="flex items-start gap-2.5 p-3 cursor-pointer hover:bg-white/[0.03] transition-all"
                                >
                                    {/* Icon */}
                                    <div className={cn(
                                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden relative",
                                        !event.acknowledged ? "bg-white/10" : "bg-white/5"
                                    )}>
                                        {getEventImage(event)}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2 mb-0.5">
                                            <h4 className={cn(
                                                "text-[11px] font-semibold leading-tight",
                                                !event.acknowledged ? "text-white" : "text-white/70"
                                            )}>
                                                {getNewsHeadline(event)}
                                            </h4>
                                            {!event.acknowledged && (
                                                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0 mt-1" />
                                            )}
                                        </div>
                                        <p className="text-[9px] text-white/50 line-clamp-2">
                                            {getNewsContent(event)}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1.5">
                                            <span className="text-[8px] text-white/30">Week {event.week}</span>
                                            <span className="text-[8px] text-white/20">•</span>
                                            <span className="text-[8px] text-white/30 capitalize">
                                                {(event.type as string).replace(/_/g, ' ').toLowerCase()}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Expand Arrow */}
                                    <ChevronRight
                                        size={14}
                                        className={cn(
                                            "text-white/20 transition-transform shrink-0 mt-1",
                                            isExpanded && "rotate-90"
                                        )}
                                    />
                                </div>

                                {/* Expanded Content */}
                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="px-3 pb-3 pt-0">
                                                <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                                                    <p className="text-[10px] text-white/70 leading-relaxed mb-3">
                                                        {getNewsContent(event)}
                                                    </p>
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                onEventClick(event)
                                                            }}
                                                            className="h-6 text-[9px] text-white/50 hover:text-white gap-1"
                                                        >
                                                            <ChevronRight size={10} />
                                                            View Details
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-6 text-[9px] text-white/30 hover:text-white"
                                                        >
                                                            <Bookmark size={10} />
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-6 text-[9px] text-white/30 hover:text-white"
                                                        >
                                                            <Share2 size={10} />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        )
                    })}

                    {filteredEvents.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 text-white/30">
                            <Newspaper size={28} className="mb-3" />
                            <p className="text-xs font-medium">No news in this category</p>
                            <p className="text-[10px] text-white/55 mt-1">Check back later for updates</p>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}
