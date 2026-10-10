"use client"

import React, { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { toast } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils-extended"
import { gameCalendarDate, formatGameCalendarDate } from "@/lib/game-calendar"
import { Panel } from "@/src/components/ui/Panel"
import { Meter } from "@/src/components/ui/Meter"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { FormGuide } from "@/src/components/ui/FixtureBanner"

// Meeting type definitions
interface MeetingType {
    id: string
    name: string
    description: string
    cost: number
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
        description: "Review recent performances and align team goals.",
        cost: 500,
        effects: { morale: 10, xp: 25 },
        unlockCondition: { type: 'always' },
        unlockMessage: ""
    },
    {
        id: "crisis_management",
        name: "Crisis Management",
        description: "Drastic measures to stop a losing streak.",
        cost: 1500,
        effects: { morale: 25, fatigue: -5 },
        unlockCondition: { type: 'consecutive_losses', value: 3 },
        unlockMessage: "Needs 3+ consecutive losses"
    },
    {
        id: "chemistry_workshop",
        name: "Chemistry Workshop",
        description: "Team building exercises between the players.",
        cost: 1000,
        effects: { chemistry: 15, morale: 5 },
        unlockCondition: { type: 'manager_level', value: 3 },
        unlockMessage: "Needs manager level 3+"
    },
    {
        id: "tactical_deep_dive",
        name: "Tactical Deep Dive",
        description: "Go through tactics with your coaching staff.",
        cost: 800,
        effects: { tacticXp: 20, xp: 10 },
        unlockCondition: { type: 'has_staff', value: 'coach' },
        unlockMessage: "Needs a coach on staff"
    },
    {
        id: "mental_fortitude",
        name: "Mental Fortitude Session",
        description: "Sessions with the psychologist on handling pressure.",
        cost: 1200,
        effects: { stressResistance: 15, morale: 5 },
        unlockCondition: { type: 'has_staff', value: 'psychologist' },
        unlockMessage: "Needs a psychologist on staff"
    },
    {
        id: "post_match_debrief",
        name: "Post-Match Debrief",
        description: "Quick review after a match.",
        cost: 300,
        effects: { xp: 15, fatigue: -10 },
        unlockCondition: { type: 'after_match' },
        unlockMessage: "Available after a match"
    },
    {
        id: "motivation_boost",
        name: "Motivation Boost",
        description: "One-on-one sessions with struggling players.",
        cost: 600,
        effects: { morale: 20 },
        unlockCondition: { type: 'low_morale', value: 40 },
        unlockMessage: "Available when a player's morale is below 40"
    }
]

/** What the scheduled-activities processor applies to every roster player (tactic XP converts 5:1 into the tactic rating). */
function effectLabels(e: MeetingType["effects"]): { label: string; good: boolean }[] {
    const out: { label: string; good: boolean }[] = []
    if (e.morale) out.push({ label: `+${e.morale} morale`, good: true })
    if (e.xp) out.push({ label: `+${e.xp} XP`, good: true })
    if (e.fatigue) out.push({ label: `${e.fatigue} fatigue`, good: e.fatigue < 0 })
    if (e.chemistry) out.push({ label: `+${e.chemistry} chemistry`, good: true })
    if (e.stressResistance) out.push({ label: `+${e.stressResistance} stress resistance`, good: true })
    if (e.tacticXp) out.push({ label: `+${Math.floor(e.tacticXp / 5)} tactic`, good: true })
    return out
}

export default function StaffMeetingPage() {
    const router = useRouter()
    const {
        playerTeamId,
        players,
        staff,
        scheduleActivity,
        currentWeek,
        currentDay,
        timeMode,
        completedMatches,
        managerDetails,
        gameStartDate,
    } = useGameStore(useShallow(state => ({
        playerTeamId: state.playerTeamId,
        players: state.players,
        staff: state.staff,
        scheduleActivity: state.scheduleActivity,
        currentWeek: state.currentWeek,
        currentDay: state.currentDay,
        timeMode: state.timeMode,
        completedMatches: state.completedMatches,
        managerDetails: state.managerDetails,
        gameStartDate: state.gameStartDate,
    })))

    const playerTeam = useCurrentTeam()
    const daily = timeMode === "HYBRID_DAILY"

    // The schedule passes the clicked day (?week=&day=); otherwise book today.
    const [target, setTarget] = useState<{ week: number; day: number }>({ week: currentWeek, day: daily ? currentDay : 0 })
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const week = Number(params.get("week"))
        const day = Number(params.get("day"))
        const validWeek = Number.isInteger(week) && week >= currentWeek ? week : currentWeek
        const minDay = daily && validWeek === currentWeek ? currentDay : 0
        const validDay = Number.isInteger(day) && day >= 0 && day <= 6 ? Math.max(day, minDay) : minDay
        setTarget({ week: validWeek, day: validDay })
    }, [currentWeek, currentDay, daily])

    const roster = useMemo(
        () => players.filter(p => playerTeam?.rosterIds.includes(p.id)),
        [players, playerTeam?.rosterIds],
    )
    const teamStaff = useMemo(
        () => staff.filter(s => s.teamId === playerTeamId),
        [staff, playerTeamId],
    )
    const { avgMorale, hasLowMoralePlayer } = useMemo(() => {
        if (roster.length === 0) return { avgMorale: 50, hasLowMoralePlayer: false }
        let sum = 0
        let low = false
        for (const p of roster) {
            const m = p.morale ?? 50
            sum += m
            if (m < 40) low = true
        }
        return { avgMorale: sum / roster.length, hasLowMoralePlayer: low }
    }, [roster])

    // Recent form (last 5 matches), newest first.
    const recentMatches = useMemo(
        () => completedMatches
            .filter(m => m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
            .sort((a, b) => b.week - a.week)
            .slice(0, 5),
        [completedMatches, playerTeamId],
    )

    const consecutiveLosses = useMemo(() => {
        let count = 0
        for (const match of recentMatches) {
            if (match.result.winnerId !== playerTeamId) count++
            else break
        }
        return count
    }, [recentMatches, playerTeamId])

    // Post-match debrief: a match this week or last.
    const hasMatchThisWeek = recentMatches.some(m => m.week === currentWeek || m.week === currentWeek - 1)

    const getMeetingStatus = (meeting: MeetingType): { unlocked: boolean; reason?: string } => {
        switch (meeting.unlockCondition.type) {
            case 'always':
                return { unlocked: true }
            case 'consecutive_losses': {
                const requiredLosses = meeting.unlockCondition.value as number
                return { unlocked: consecutiveLosses >= requiredLosses, reason: meeting.unlockMessage }
            }
            case 'manager_level': {
                const requiredLevel = meeting.unlockCondition.value as number
                return { unlocked: (managerDetails?.level || 1) >= requiredLevel, reason: meeting.unlockMessage }
            }
            case 'has_staff': {
                const requiredRole = meeting.unlockCondition.value as string
                return { unlocked: teamStaff.some(s => s.role === requiredRole), reason: meeting.unlockMessage }
            }
            case 'after_match':
                return { unlocked: hasMatchThisWeek, reason: meeting.unlockMessage }
            case 'low_morale':
                return { unlocked: hasLowMoralePlayer, reason: meeting.unlockMessage }
            default:
                return { unlocked: false }
        }
    }

    const handleScheduleMeeting = (meeting: MeetingType) => {
        if (!playerTeam) return
        if (playerTeam.budget < meeting.cost) {
            toast.error("Not enough funds for this meeting")
            return
        }

        const result = scheduleActivity({
            id: `act_meet_${meeting.id}_w${target.week}`,
            type: "STAFF_MEETING",
            week: target.week,
            day: target.day,
            duration: 0,
            cost: meeting.cost,
            name: meeting.name,
            description: effectLabels(meeting.effects).map(e => e.label).join(", "),
            data: {
                meetingType: meeting.id,
                effects: meeting.effects
            }
        })

        if (result.success) {
            toast.success(`${meeting.name} booked`)
            router.push("/schedule")
        } else {
            toast.error(result.message)
        }
    }

    if (!playerTeam) return <p className="py-16 text-center text-sm text-ink-3" role="status">Loading club…</p>

    const targetLabel = formatGameCalendarDate(gameCalendarDate(gameStartDate, target.week, target.day), { weekday: "short", month: "short", day: "numeric" })
    const form = [...recentMatches].reverse().map(m => (m.result.winnerId === playerTeamId ? "W" : "L") as "W" | "L")

    return (
        <div className="mx-auto max-w-[1280px] space-y-5 pb-12">
            <ScreenHeader
                eyebrow={`Schedule · Week ${target.week}, ${targetLabel}`}
                title="Staff meeting"
                subtitle="A one-day session. Effects apply to every roster player when that week is processed; the cost is paid when you book."
                aside={
                    <Button asChild variant="ghost" className="gap-2">
                        <Link href="/schedule"><ArrowLeft size={16} /> Schedule</Link>
                    </Button>
                }
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="space-y-4">
                    <Panel title="Squad mood">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-ink-3">Average morale</span>
                            <Meter value={avgMorale} label="Average morale" trackClassName="w-24" />
                        </div>
                        <p className="mt-3 text-xs leading-relaxed text-ink-3">Morale is part of each player&apos;s match condition: high morale adds up to +1.5 duel rating, low morale costs up to −2.3 (about ±2% of every duel).</p>
                    </Panel>

                    <Panel title="Recent form">
                        <FormGuide results={form} emptyLabel="No matches played" />
                        {consecutiveLosses >= 2 && (
                            <p className="mt-3 text-xs text-caution">{consecutiveLosses} losses in a row</p>
                        )}
                    </Panel>

                    <Panel title="Staff" padded={false}>
                        {teamStaff.length > 0 ? (
                            <ul className="divide-y divide-line">
                                {teamStaff.map(s => (
                                    <li key={s.id} className="flex items-center justify-between px-4 py-2 text-sm">
                                        <span className="capitalize text-ink-1">{s.role}</span>
                                        <span className="truncate text-ink-3">{s.name}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="px-4 py-3 text-sm text-ink-3">No staff hired yet. <Link href="/staff" className="font-semibold text-ink-1 underline underline-offset-2">Hire staff</Link></p>
                        )}
                    </Panel>
                </aside>

                <Panel
                    title="Meeting options"
                    actions={<span className="text-xs tabular-nums text-ink-3">Funds {formatCurrency(playerTeam.budget, "$", false)}</span>}
                    padded={false}
                >
                    <ul className="divide-y divide-line">
                        {MEETING_TYPES.map((meeting) => {
                            const status = getMeetingStatus(meeting)
                            const canAfford = playerTeam.budget >= meeting.cost
                            return (
                                <li key={meeting.id} className={cn("flex items-center gap-4 px-4 py-3.5", !status.unlocked && "opacity-55")}>
                                    <div className="min-w-0 flex-1">
                                        <p className="flex items-center gap-2 text-sm font-semibold text-ink-1">
                                            {meeting.name}
                                            {!status.unlocked && <Lock size={12} className="text-ink-3" aria-hidden="true" />}
                                        </p>
                                        <p className="text-xs text-ink-3">{meeting.description}</p>
                                        <p className="mt-1 text-xs">
                                            {effectLabels(meeting.effects).map((fx, i) => (
                                                <span key={fx.label}>
                                                    {i > 0 && <span className="text-ink-3"> · </span>}
                                                    <span className={fx.good ? "text-positive" : "text-caution"}>{fx.label}</span>
                                                </span>
                                            ))}
                                        </p>
                                    </div>
                                    <span className={cn("w-20 shrink-0 text-right text-sm tabular-nums", canAfford ? "text-ink-1" : "text-negative")}>
                                        {formatCurrency(meeting.cost, "$", false)}
                                    </span>
                                    <div className="w-40 shrink-0 text-right">
                                        {status.unlocked ? (
                                            <Button variant="outline" size="sm" disabled={!canAfford} onClick={() => handleScheduleMeeting(meeting)}>
                                                {canAfford ? "Book" : "Can't afford"}
                                            </Button>
                                        ) : (
                                            <span className="text-xs leading-snug text-ink-3">{status.reason}</span>
                                        )}
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                </Panel>
            </div>
        </div>
    )
}
