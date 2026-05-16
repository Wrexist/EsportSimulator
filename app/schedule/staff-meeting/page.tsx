"use client"

import React, { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { toast } from "@/lib/toast"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import {
    Briefcase, TrendingUp, Users, ArrowLeft, CheckCircle2, AlertCircle,
    Brain, Target, Heart, MessageSquare, Lock, Zap, Shield
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { LucideIcon } from "lucide-react"

// Meeting type definitions
interface MeetingType {
    id: string
    name: string
    description: string
    cost: number
    icon: LucideIcon
    iconColor: string
    effects: {
        morale?: number
        xp?: number
        fatigue?: number
        chemistry?: number
        stressResistance?: number
        tacticXp?: number
        loyalty?: number
    }
    unlockCondition: {
        type: 'always' | 'consecutive_losses' | 'manager_level' | 'has_staff' | 'after_match' | 'low_morale'
        value?: number | string
    }
    unlockMessage: string
}

const MEETING_TYPES: MeetingType[] = [
    {
        id: "general_strategy",
        name: "General Strategy Review",
        description: "Review recent performances and align team goals. Provides a balanced boost to morale and experience.",
        cost: 500,
        icon: Briefcase,
        iconColor: "text-blue-400 bg-blue-500/20",
        effects: { morale: 10, xp: 25 },
        unlockCondition: { type: 'always' },
        unlockMessage: ""
    },
    {
        id: "crisis_management",
        name: "Crisis Management",
        description: "Drastic measures to address a losing streak. Major morale boost and fatigue recovery.",
        cost: 1500,
        icon: AlertCircle,
        iconColor: "text-red-400 bg-red-500/20",
        effects: { morale: 25, fatigue: -5 },
        unlockCondition: { type: 'consecutive_losses', value: 3 },
        unlockMessage: "Requires 3+ consecutive losses"
    },
    {
        id: "chemistry_workshop",
        name: "Chemistry Workshop",
        description: "Team building exercises to improve synergy between players.",
        cost: 1000,
        icon: Users,
        iconColor: "text-cyan-400 bg-cyan-500/20",
        effects: { chemistry: 15, morale: 5 },
        unlockCondition: { type: 'manager_level', value: 3 },
        unlockMessage: "Requires Manager Level 3+"
    },
    {
        id: "tactical_deep_dive",
        name: "Tactical Deep Dive",
        description: "In-depth analysis of tactics and strategies with your coaching staff.",
        cost: 800,
        icon: Target,
        iconColor: "text-amber-400 bg-amber-500/20",
        effects: { tacticXp: 20, xp: 10 },
        unlockCondition: { type: 'has_staff', value: 'coach' },
        unlockMessage: "Requires a Coach on staff"
    },
    {
        id: "mental_fortitude",
        name: "Mental Fortitude Session",
        description: "Psychological training to improve stress resistance and clutch performance.",
        cost: 1200,
        icon: Brain,
        iconColor: "text-purple-400 bg-purple-500/20",
        effects: { stressResistance: 15, morale: 5 },
        unlockCondition: { type: 'has_staff', value: 'psychologist' },
        unlockMessage: "Requires a Psychologist on staff"
    },
    {
        id: "post_match_debrief",
        name: "Post-Match Debrief",
        description: "Quick review session after a tournament match to maintain momentum.",
        cost: 300,
        icon: MessageSquare,
        iconColor: "text-emerald-400 bg-emerald-500/20",
        effects: { xp: 15, fatigue: -10 },
        unlockCondition: { type: 'after_match' },
        unlockMessage: "Available after tournament matches"
    },
    {
        id: "motivation_boost",
        name: "Motivation Boost",
        description: "One-on-one sessions with struggling players to restore their confidence.",
        cost: 600,
        icon: Heart,
        iconColor: "text-pink-400 bg-pink-500/20",
        effects: { morale: 20 },
        unlockCondition: { type: 'low_morale', value: 40 },
        unlockMessage: "Available when a player has morale below 40"
    }
]

export default function StaffMeetingPage() {
    const router = useRouter()
    const {
        playerTeamId,
        players,
        staff,
        scheduleActivity,
        currentWeek,
        completedMatches,
        managerDetails,
        scheduledActivities
    } = useGameStore(useShallow(state => ({
        playerTeamId: state.playerTeamId,
        players: state.players,
        staff: state.staff,
        scheduleActivity: state.scheduleActivity,
        currentWeek: state.currentWeek,
        completedMatches: state.completedMatches,
        managerDetails: state.managerDetails,
        scheduledActivities: state.scheduledActivities,
    })))

    const [schedulingId, setSchedulingId] = useState<string | null>(null)

    const playerTeam = useCurrentTeam()
    const roster = players.filter(p => playerTeam?.rosterIds.includes(p.id))
    const teamStaff = staff.filter(s => s.teamId === playerTeamId)

    // Calculate average morale
    const avgMorale = roster.length > 0
        ? roster.reduce((sum, p) => sum + (p.morale || 50), 0) / roster.length
        : 50

    // Check for low morale players
    const hasLowMoralePlayer = roster.some(p => (p.morale || 50) < 40)

    // Calculate recent form (last 5 matches)
    const recentMatches = completedMatches
        .filter(m => m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
        .sort((a, b) => b.week - a.week)
        .slice(0, 5)

    const wins = recentMatches.filter(m => m.result.winnerId === playerTeamId).length
    const formPercentage = recentMatches.length > 0 ? (wins / recentMatches.length) * 100 : 0

    // Check consecutive losses
    const consecutiveLosses = useMemo(() => {
        let count = 0
        for (const match of recentMatches) {
            if (match.result.winnerId !== playerTeamId) {
                count++
            } else {
                break
            }
        }
        return count
    }, [recentMatches, playerTeamId])

    // Check if there's a match this week (for post-match debrief)
    const hasMatchThisWeek = recentMatches.some(m => m.week === currentWeek || m.week === currentWeek - 1)

    // Check unlock conditions for each meeting type
    const getMeetingStatus = (meeting: MeetingType): { unlocked: boolean; reason?: string } => {
        switch (meeting.unlockCondition.type) {
            case 'always':
                return { unlocked: true }

            case 'consecutive_losses':
                const requiredLosses = meeting.unlockCondition.value as number
                return {
                    unlocked: consecutiveLosses >= requiredLosses,
                    reason: `Need ${requiredLosses - consecutiveLosses} more losses`
                }

            case 'manager_level':
                const requiredLevel = meeting.unlockCondition.value as number
                return {
                    unlocked: (managerDetails?.level || 1) >= requiredLevel,
                    reason: `Manager Level ${requiredLevel} required`
                }

            case 'has_staff':
                const requiredRole = meeting.unlockCondition.value as string
                const hasStaff = teamStaff.some(s => s.role === requiredRole)
                return {
                    unlocked: hasStaff,
                    reason: `Hire a ${requiredRole}`
                }

            case 'after_match':
                return {
                    unlocked: hasMatchThisWeek,
                    reason: "No recent match"
                }

            case 'low_morale':
                return {
                    unlocked: hasLowMoralePlayer,
                    reason: "No struggling players"
                }

            default:
                return { unlocked: false }
        }
    }

    const handleScheduleMeeting = (meeting: MeetingType) => {
        if (!playerTeam) return
        if (playerTeam.budget < meeting.cost) {
            toast.error("Insufficient funds for this meeting")
            return
        }

        setSchedulingId(meeting.id)

        // Build description from effects
        const effectDescriptions: string[] = []
        if (meeting.effects.morale) effectDescriptions.push(`+${meeting.effects.morale} Morale`)
        if (meeting.effects.xp) effectDescriptions.push(`+${meeting.effects.xp} XP`)
        if (meeting.effects.fatigue) effectDescriptions.push(`${meeting.effects.fatigue} Fatigue`)
        if (meeting.effects.chemistry) effectDescriptions.push(`+${meeting.effects.chemistry} Chemistry`)
        if (meeting.effects.stressResistance) effectDescriptions.push(`+${meeting.effects.stressResistance} Stress Resistance`)
        if (meeting.effects.tacticXp) effectDescriptions.push(`+${meeting.effects.tacticXp} Tactic XP`)

        const result = scheduleActivity({
            id: `act_meet_${meeting.id}_w${currentWeek}`,
            type: "STAFF_MEETING",
            week: currentWeek,
            day: 0,
            duration: 0,
            cost: meeting.cost,
            name: meeting.name,
            description: effectDescriptions.join(", "),
            data: {
                meetingType: meeting.id,
                effects: meeting.effects
            }
        })

        setTimeout(() => {
            setSchedulingId(null)
            if (result.success) {
                toast.success(`${meeting.name} scheduled`)
                router.push("/schedule")
            } else {
                toast.error(result.message)
            }
        }, 800)
    }

    if (!playerTeam) return null

    return (
        <div className="container mx-auto max-w-5xl p-6 min-h-screen flex flex-col gap-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full hover:bg-white/10">
                    <ArrowLeft className="text-white" />
                </Button>
                <div>
                    <h1 className="text-4xl font-normal uppercase tracking-tighter liquid-text flex items-center gap-3">
                        <Briefcase className="text-blue-400" size={32} />
                        Staff Meeting
                    </h1>
                    <p className="text-muted-foreground uppercase tracking-widest text-xs font-bold">
                        Team Management • Week {currentWeek}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Status Column */}
                <div className="space-y-6">
                    <div className="glass-panel p-6 border-white/5 bg-gradient-to-br from-blue-500/5 to-transparent relative overflow-hidden">
                        <div className="relative z-10">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-blue-200 mb-4 flex items-center gap-2">
                                <Users size={14} /> Team Morale
                            </h3>
                            <div className="flex items-end gap-2 mb-2">
                                <span className={cn(
                                    "text-5xl font-black tracking-tighter",
                                    avgMorale >= 80 ? "text-emerald-400" : avgMorale >= 50 ? "text-yellow-400" : "text-red-400"
                                )}>
                                    {Math.round(avgMorale)}%
                                </span>
                            </div>
                            <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden">
                                <div
                                    className={cn("h-full transition-all duration-1000",
                                        avgMorale >= 80 ? "bg-emerald-500" : avgMorale >= 50 ? "bg-yellow-500" : "bg-red-500"
                                    )}
                                    style={{ width: `${avgMorale}%` }}
                                />
                            </div>
                            <p className="text-xs text-white/50 mt-4 leading-relaxed">
                                Higher morale improves in-game performance and reduces transfer requests.
                            </p>
                        </div>
                        <Users className="absolute -bottom-4 -right-4 w-32 h-32 text-blue-500/5 rotate-12" />
                    </div>

                    <div className="glass-panel p-6 border-white/5">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
                            <TrendingUp size={14} /> Recent Form
                        </h3>
                        <div className="text-3xl font-bold text-white mb-1">
                            {formPercentage.toFixed(0)}% <span className="text-sm font-normal text-white/40">Win Rate</span>
                        </div>
                        <div className="flex gap-1 mt-2">
                            {recentMatches.map((m, i) => {
                                const isWin = m.result.winnerId === playerTeamId
                                return (
                                    <div
                                        key={m.id}
                                        className={cn(
                                            "w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold",
                                            isWin ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"
                                        )}
                                    >
                                        {isWin ? "W" : "L"}
                                    </div>
                                )
                            })}
                            {recentMatches.length === 0 && <span className="text-xs text-white/30 italic">No matches played</span>}
                        </div>
                        {consecutiveLosses >= 2 && (
                            <div className="mt-4 flex items-center gap-2 text-red-400 text-xs">
                                <AlertCircle size={14} />
                                {consecutiveLosses} consecutive losses
                            </div>
                        )}
                    </div>

                    <div className="glass-panel p-6 border-white/5">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
                            <Shield size={14} /> Staff on Duty
                        </h3>
                        {teamStaff.length > 0 ? (
                            <div className="space-y-2">
                                {teamStaff.map(s => (
                                    <div key={s.id} className="flex items-center gap-2 text-sm">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                        <span className="text-white capitalize">{s.role}</span>
                                        <span className="text-white/40">- {s.name}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-white/40 italic">No staff hired yet</p>
                        )}
                    </div>
                </div>

                {/* Action Column */}
                <div className="md:col-span-2 space-y-6">
                    <div className="glass-panel p-8 border-white/10 bg-black/20">
                        <h2 className="text-2xl font-light uppercase tracking-tight text-white mb-6">Meeting Options</h2>

                        <div className="space-y-4">
                            {MEETING_TYPES.map((meeting) => {
                                const status = getMeetingStatus(meeting)
                                const isScheduling = schedulingId === meeting.id
                                const canAfford = playerTeam.budget >= meeting.cost
                                const Icon = meeting.icon

                                return (
                                    <motion.div
                                        key={meeting.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={cn(
                                            "group relative overflow-hidden rounded-xl border p-6 transition-all",
                                            status.unlocked
                                                ? "border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer"
                                                : "border-white/5 bg-black/40 opacity-50 grayscale"
                                        )}
                                        onClick={() => status.unlocked && canAfford && handleScheduleMeeting(meeting)}
                                    >
                                        <div className="flex items-start justify-between relative z-10">
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-3">
                                                    <div className={cn("p-2 rounded-lg", meeting.iconColor)}>
                                                        <Icon size={24} />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                                            {meeting.name}
                                                            {!status.unlocked && <Lock size={14} className="text-white/40" />}
                                                        </h3>
                                                    </div>
                                                </div>
                                                <p className="text-white/60 text-sm max-w-md">
                                                    {meeting.description}
                                                </p>
                                                <div className="flex flex-wrap items-center gap-2 pt-2">
                                                    {meeting.effects.morale && (
                                                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                                            +{meeting.effects.morale} Morale
                                                        </Badge>
                                                    )}
                                                    {meeting.effects.xp && (
                                                        <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/20">
                                                            +{meeting.effects.xp} XP
                                                        </Badge>
                                                    )}
                                                    {meeting.effects.fatigue && (
                                                        <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
                                                            {meeting.effects.fatigue} Fatigue
                                                        </Badge>
                                                    )}
                                                    {meeting.effects.chemistry && (
                                                        <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20">
                                                            +{meeting.effects.chemistry} Chemistry
                                                        </Badge>
                                                    )}
                                                    {meeting.effects.stressResistance && (
                                                        <Badge variant="outline" className="bg-pink-500/10 text-pink-400 border-pink-500/20">
                                                            +{meeting.effects.stressResistance} Stress Resist
                                                        </Badge>
                                                    )}
                                                    {meeting.effects.tacticXp && (
                                                        <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20">
                                                            +{meeting.effects.tacticXp} Tactic XP
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex flex-col items-end gap-2">
                                                <div className={cn(
                                                    "text-xl font-bold",
                                                    canAfford ? "text-white" : "text-red-400"
                                                )}>
                                                    ${meeting.cost.toLocaleString()}
                                                </div>
                                                {status.unlocked ? (
                                                    <Button
                                                        className={cn(
                                                            "transition-all",
                                                            !canAfford ? "bg-red-900/50 text-red-200" : "bg-white text-black hover:bg-white/90"
                                                        )}
                                                        disabled={isScheduling || !canAfford}
                                                    >
                                                        {isScheduling ? "Booking..." : canAfford ? "Book" : "Can't Afford"}
                                                    </Button>
                                                ) : (
                                                    <Badge variant="secondary" className="bg-white/10 text-white/40 text-xs">
                                                        {meeting.unlockMessage}
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>

                                        {/* Hover Glow for unlocked */}
                                        {status.unlocked && (
                                            <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity blur-xl rounded-xl pointer-events-none" />
                                        )}
                                    </motion.div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Budget Info */}
                    <div className="glass-panel p-4 border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Zap size={18} className="text-emerald-400" />
                            <span className="text-sm text-white/60">Available Budget:</span>
                        </div>
                        <span className="text-xl font-bold text-emerald-400">
                            ${playerTeam.budget.toLocaleString()}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}
