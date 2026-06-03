"use client"

import React, { useState, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Mail, Inbox, CheckCheck,
    Clock, Users, DollarSign, Stethoscope, Briefcase, Award, Flame,
    TrendingDown, ArrowRightLeft, Newspaper, Trophy,
    ChevronRight, AlertCircle, Check, X, MessageSquare, ExternalLink
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { GameEventSaveData } from "@/engine"

interface MailAppProps {
    events: GameEventSaveData[]
    onEventClick: (event: GameEventSaveData) => void
    onMarkAllRead: () => void
    getEventTitle: (event: GameEventSaveData) => string
    getEventDescription: (event: GameEventSaveData) => string
    onQuickAction?: (eventId: string, action: string) => void
}

type FolderType = "inbox" | "unread" | "transfers" | "medical" | "career" | "actionRequired"

export const MailApp = React.memo(function MailApp({
    events,
    onEventClick,
    onMarkAllRead,
    getEventTitle,
    getEventDescription,
    onQuickAction
}: MailAppProps) {
    const [activeFolder, setActiveFolder] = useState<FolderType>("inbox")
    const [messageFilter, setMessageFilter] = useState<string[]>(["ALL"])
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

    const toggleFilter = useCallback((filter: string) => {
        setMessageFilter(prev => {
            if (filter === "ALL") return ["ALL"]
            let newFilters = prev.filter(f => f !== "ALL")
            if (newFilters.includes(filter)) {
                newFilters = newFilters.filter(f => f !== filter)
            } else {
                newFilters.push(filter)
            }
            if (newFilters.length === 0) return ["ALL"]
            return newFilters
        })
    }, [])

    // Check if event requires action
    const requiresAction = (event: GameEventSaveData) => {
        const type = event.type as string
        return ["JOB_OFFER", "TRANSFER_OFFER"].includes(type) && !event.acknowledged
    }

    const filteredEvents = useMemo(() => {
        let filtered = [...events]

        // Filter by folder
        switch (activeFolder) {
            case "unread":
                filtered = filtered.filter(e => !e.acknowledged)
                break
            case "transfers":
                filtered = filtered.filter(e =>
                    ["TRANSFER_OFFER", "TRANSFER_WINDOW", "AI_SIGNING", "AI_TRANSFER", "ROSTER_UPDATE"].includes(e.type as string)
                )
                break
            case "medical":
                filtered = filtered.filter(e => e.type === "INJURY")
                break
            case "career":
                filtered = filtered.filter(e =>
                    ["JOB_OFFER", "CAREER_UPDATE"].includes(e.type as string)
                )
                break
            case "actionRequired":
                filtered = filtered.filter(e => requiresAction(e))
                break
        }

        // Apply additional filters
        if (!messageFilter.includes("ALL")) {
            const typeFilters = messageFilter.filter(f => f !== "UNREAD")
            if (typeFilters.length > 0) {
                filtered = filtered.filter(e => {
                    if (typeFilters.includes("TRANSFER") && ["TRANSFER_OFFER", "TRANSFER_WINDOW", "AI_SIGNING", "AI_TRANSFER", "ROSTER_UPDATE"].includes(e.type as string)) return true
                    if (typeFilters.includes("MEDICAL") && ["INJURY"].includes(e.type as string)) return true
                    if (typeFilters.includes("TEAM") && ["CONTRACT", "MORALE", "FINANCE"].includes(e.type as string)) return true
                    if (typeFilters.includes("JOBS") && ["JOB_OFFER", "CAREER_UPDATE"].includes(e.type as string)) return true
                    return false
                })
            }
            if (messageFilter.includes("UNREAD")) {
                filtered = filtered.filter(e => !e.acknowledged)
            }
        }

        return filtered.sort((a, b) => {
            // Action required first
            if (requiresAction(a) !== requiresAction(b)) return requiresAction(a) ? -1 : 1
            if (a.acknowledged !== b.acknowledged) return a.acknowledged ? 1 : -1
            if (a.week !== b.week) return b.week - a.week
            return 0
        })
    }, [events, activeFolder, messageFilter])

    // Folder badge counts — five filters over the full events list. The
    // app re-renders on every folder click and every filter-chip toggle,
    // and events can grow into the hundreds on long careers. One pass
    // tallies all five counts; useMemo guards against unrelated parent
    // re-renders.
    const { unreadCount, actionCount, transferCount, medicalCount, careerCount } = useMemo(() => {
        let unread = 0, action = 0, transfer = 0, medical = 0, career = 0
        for (const e of events) {
            const isUnacked = !e.acknowledged
            if (isUnacked) unread++
            if (requiresAction(e)) action++
            if (isUnacked) {
                const t = e.type as string
                if (t === "TRANSFER_OFFER" || t === "AI_SIGNING" || t === "AI_TRANSFER") transfer++
                else if (t === "INJURY") medical++
                else if (t === "JOB_OFFER" || t === "CAREER_UPDATE") career++
            }
        }
        return { unreadCount: unread, actionCount: action, transferCount: transfer, medicalCount: medical, careerCount: career }
    }, [events])

    const folders = [
        { id: "inbox" as FolderType, label: "Inbox", icon: Inbox, count: events.length },
        { id: "actionRequired" as FolderType, label: "Action", icon: AlertCircle, count: actionCount, highlight: actionCount > 0 },
        { id: "unread" as FolderType, label: "Unread", icon: Mail, count: unreadCount },
        { id: "transfers" as FolderType, label: "Transfers", icon: ArrowRightLeft, count: transferCount },
        { id: "medical" as FolderType, label: "Medical", icon: Stethoscope, count: medicalCount },
        { id: "career" as FolderType, label: "Career", icon: Briefcase, count: careerCount },
    ]

    const getEventIcon = (event: GameEventSaveData) => {
        const type = event.type as string
        const iconClass = !event.acknowledged ? "text-cyan-400" : "text-white/40"

        switch (type) {
            case "CONTRACT": return <Clock size={16} className={iconClass} />
            case "MORALE": return <Users size={16} className={iconClass} />
            case "INJURY": return <Stethoscope size={16} className={!event.acknowledged ? "text-rose-400" : "text-white/40"} />
            case "FINANCE": return <DollarSign size={16} className={!event.acknowledged ? "text-emerald-400" : "text-white/40"} />
            case "win_streak": return <Flame size={16} className={!event.acknowledged ? "text-orange-400" : "text-white/40"} />
            case "loss_streak": return <TrendingDown size={16} className={iconClass} />
            case "TRANSFER_OFFER": return <ArrowRightLeft size={16} className={!event.acknowledged ? "text-blue-400" : "text-white/40"} />
            case "ROSTER_UPDATE": return <Newspaper size={16} className={!event.acknowledged ? "text-indigo-400" : "text-white/40"} />
            case "AI_SIGNING":
            case "AI_TRANSFER": return <Users size={16} className={!event.acknowledged ? "text-indigo-400" : "text-white/40"} />
            case "JOB_OFFER": return <Briefcase size={16} className={!event.acknowledged ? "text-emerald-500" : "text-white/40"} />
            case "CAREER_UPDATE": return <Award size={16} className={!event.acknowledged ? "text-yellow-400" : "text-white/40"} />
            case "TOURNAMENT": return <Trophy size={16} className={!event.acknowledged ? "text-amber-400" : "text-white/40"} />
            default: return <Mail size={16} className={iconClass} />
        }
    }

    const selectedEvent = events.find(e => e.id === selectedEventId)

    return (
        <div className="flex h-full">
            {/* Sidebar */}
            <div className="w-40 border-r border-white/5 bg-white/[0.02] flex flex-col shrink-0">
                <div className="p-3 border-b border-white/5">
                    <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider px-2">Folders</h3>
                </div>
                <div className="flex-1 p-2 space-y-0.5 overflow-y-auto custom-scrollbar">
                    {folders.map(folder => (
                        <button
                            key={folder.id}
                            onClick={() => setActiveFolder(folder.id)}
                            className={cn(
                                "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all",
                                activeFolder === folder.id
                                    ? "bg-white/10 text-white"
                                    : folder.highlight
                                        ? "text-amber-400 hover:bg-amber-500/10"
                                        : "text-white/60 hover:bg-white/5 hover:text-white/80"
                            )}
                        >
                            <folder.icon size={14} />
                            <span className="flex-1 text-left font-medium">{folder.label}</span>
                            {folder.count > 0 && (
                                <span className={cn(
                                    "text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                                    folder.highlight ? "bg-amber-500/20 text-amber-400" :
                                        activeFolder === folder.id ? "bg-white/20" : "bg-white/10"
                                )}>
                                    {folder.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Message List */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Toolbar */}
                <div className="h-10 px-3 flex items-center justify-between border-b border-white/5 bg-white/[0.02] shrink-0">
                    {/* <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 text-[10px] text-white/60 hover:text-white gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <Filter size={10} />
                                {messageFilter.includes("ALL") ? "All" : `${messageFilter.length}`}
                                <ChevronDown size={8} />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-neutral-900 border-white/10 z-devtools" sideOffset={5}>
                            <DropdownMenuLabel className="text-xs">Filter Messages</DropdownMenuLabel>
                            <DropdownMenuSeparator className="bg-white/10" />
                            <DropdownMenuCheckboxItem checked={messageFilter.includes("ALL")} onCheckedChange={() => toggleFilter("ALL")}>
                                All Messages
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuCheckboxItem checked={messageFilter.includes("UNREAD")} onCheckedChange={() => toggleFilter("UNREAD")}>
                                Unread Only
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuSeparator className="bg-white/10" />
                            <DropdownMenuCheckboxItem checked={messageFilter.includes("TRANSFER")} onCheckedChange={() => toggleFilter("TRANSFER")}>
                                Transfers
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuCheckboxItem checked={messageFilter.includes("MEDICAL")} onCheckedChange={() => toggleFilter("MEDICAL")}>
                                Medical
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuCheckboxItem checked={messageFilter.includes("TEAM")} onCheckedChange={() => toggleFilter("TEAM")}>
                                Team Updates
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuCheckboxItem checked={messageFilter.includes("JOBS")} onCheckedChange={() => toggleFilter("JOBS")}>
                                Job Offers
                            </DropdownMenuCheckboxItem>
                        </DropdownMenuContent>
                    </DropdownMenu> */}

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                            e.stopPropagation()
                            onMarkAllRead()
                        }}
                        className="h-6 text-[10px] text-white/60 hover:text-white gap-1"
                    >
                        <CheckCheck size={10} />
                        Read All
                    </Button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <AnimatePresence mode="popLayout">
                        {filteredEvents.map((event, idx) => {
                            const tournamentLogoPath = typeof event.data?.tournamentLogoPath === "string"
                                ? event.data.tournamentLogoPath
                                : null
                            const tournamentId = typeof event.data?.tournamentId === "string"
                                ? event.data.tournamentId
                                : null

                            return (
                            <motion.div
                                key={event.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                // Cap stagger so long inboxes don't keep the bottom rows
                                // invisible for >0.5s. After ~25 items the rest pop in
                                // together with no perceptible stagger.
                                transition={{ delay: Math.min(idx * 0.02, 0.5), duration: 0.18 }}
                                onClick={() => {
                                    setSelectedEventId(event.id)
                                    onEventClick(event)
                                }}
                                className={cn(
                                    "flex items-start gap-3 px-3 py-2.5 border-b border-white/5 cursor-pointer transition-all relative overflow-hidden",
                                    selectedEventId === event.id
                                        ? "bg-cyan-500/10"
                                        : requiresAction(event)
                                            ? "bg-amber-500/5 hover:bg-amber-500/10"
                                            : !event.acknowledged
                                                ? "bg-cyan-500/5 hover:bg-cyan-500/10"
                                                : "hover:bg-white/[0.03]",
                                    requiresAction(event) && "notification-shimmer"
                                )}
                            >
                                {/* Icon / Tournament Logo */}
                                {event.type === "TOURNAMENT" && tournamentLogoPath ? (
                                    <div className={cn(
                                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 overflow-hidden border",
                                        !event.acknowledged ? "bg-amber-500/10 border-amber-500/30" : "bg-white/5 border-white/10"
                                    )}>
                                        <Image
                                            src={tournamentLogoPath}
                                            alt="Tournament"
                                            width={24}
                                            height={24}
                                            className="object-contain"
                                            unoptimized
                                        />
                                    </div>
                                ) : (
                                    <div className={cn(
                                        "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                                        requiresAction(event) ? "bg-amber-500/20" :
                                            !event.acknowledged ? "bg-white/10" : "bg-white/5"
                                    )}>
                                        {getEventIcon(event)}
                                    </div>
                                )}

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2 mb-0.5">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <span className={cn(
                                                "text-[11px] font-semibold truncate",
                                                !event.acknowledged ? "text-white" : "text-white/70"
                                            )}>
                                                {getEventTitle(event)}
                                            </span>
                                            {requiresAction(event) && (
                                                <Badge className="h-4 px-1 text-[8px] bg-amber-500/20 text-amber-400 border-amber-500/30">
                                                    ACTION
                                                </Badge>
                                            )}
                                        </div>
                                        <span className="text-[9px] text-white/40 shrink-0">W{event.week}</span>
                                    </div>
                                    <p className={cn(
                                        "text-[10px] truncate",
                                        !event.acknowledged ? "text-white/80" : "text-white/50"
                                    )}>
                                        {getEventDescription(event)}
                                    </p>

                                    {/* Quick Actions for actionable events */}
                                    {requiresAction(event) && !!onQuickAction && (
                                        <div className="flex gap-1.5 mt-2" onClick={e => e.stopPropagation()}>
                                            {event.type === "TRANSFER_OFFER" && (
                                                <>
                                                    <Button
                                                        size="sm"
                                                        className="h-6 text-[9px] bg-emerald-600 hover:bg-emerald-500 text-white px-2"
                                                        onClick={() => onQuickAction(event.id, "accept")}
                                                    >
                                                        <Check size={10} className="mr-1" />
                                                        Accept
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-6 text-[9px] border-white/20 text-white/70 px-2"
                                                        onClick={() => onQuickAction(event.id, "decline")}
                                                    >
                                                        <X size={10} className="mr-1" />
                                                        Decline
                                                    </Button>
                                                </>
                                            )}
                                            {event.type === "JOB_OFFER" && (
                                                <Button
                                                    size="sm"
                                                    className="h-6 text-[9px] bg-cyan-600 hover:bg-cyan-500 text-white px-2"
                                                    onClick={() => onEventClick(event)}
                                                >
                                                    <MessageSquare size={10} className="mr-1" />
                                                    View Offer
                                                </Button>
                                            )}
                                        </div>
                                    )}

                                    {/* Tournament Quick Link */}
                                    {event.type === "TOURNAMENT" && tournamentId && (
                                        <div className="flex gap-1.5 mt-2" onClick={e => e.stopPropagation()}>
                                            <Link href={`/tournaments/${tournamentId}`}>
                                                <Button
                                                    size="sm"
                                                    className="h-6 text-[9px] bg-amber-600 hover:bg-amber-500 text-white px-2"
                                                >
                                                    <ExternalLink size={10} className="mr-1" />
                                                    View Tournament
                                                </Button>
                                            </Link>
                                        </div>
                                    )}
                                </div>

                                {/* Indicators */}
                                <div className="flex flex-col items-center gap-1 shrink-0">
                                    {!event.acknowledged && (
                                        <motion.div
                                            className={cn(
                                                "w-2 h-2 rounded-full",
                                                requiresAction(event) ? "bg-amber-400" : "bg-cyan-400"
                                            )}
                                            animate={{
                                                scale: [1, 1.4, 1],
                                                opacity: [1, 0.6, 1]
                                            }}
                                            transition={{
                                                duration: 1.5,
                                                repeat: Infinity,
                                                ease: "easeInOut"
                                            }}
                                        />
                                    )}
                                    <ChevronRight size={12} className="text-white/20" />
                                </div>
                            </motion.div>
                            )
                        })}

                        {filteredEvents.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-16" role="status" aria-live="polite">
                                <Mail size={32} className="mb-3 text-white/15" aria-hidden="true" />
                                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/40 mb-1">
                                    {activeFolder === "actionRequired" ? "Inbox zero" : "Quiet on the wires"}
                                </p>
                                <p className="text-xs text-white/55 max-w-[220px] text-center leading-relaxed">
                                    {activeFolder === "actionRequired"
                                        ? "Nothing waiting on your call. Sponsorship offers and transfer responses land here."
                                        : "Folder is empty. Check back after the next match week."}
                                </p>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    )
})
