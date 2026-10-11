"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Lock } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { Button } from "@/components/ui/button"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils-extended"
import { gameCalendarDate, formatGameCalendarDate } from "@/lib/game-calendar"
import { ScheduleDialog } from "./ScheduleDialog"
import { MEETING_TYPES, meetingActivityId, meetingEffectLabels, meetingStatus, type MeetingContext, type MeetingType } from "./staff-meetings"

interface BookStaffMeetingModalProps {
    isOpen: boolean
    onClose: () => void
    week: number
    initialDay?: number
}

/**
 * Book a one-day staff meeting (was the `/schedule/staff-meeting` screen).
 * Paid when booked; the effects reach every roster player when the week is
 * processed.
 */
export function BookStaffMeetingModal({ isOpen, onClose, week, initialDay = 0 }: BookStaffMeetingModalProps) {
    const { players, staff, scheduleActivity, scheduledActivities, currentWeek, currentDay, timeMode, completedMatches, managerLevel, gameStartDate, playerTeamId } = useGameStore(useShallow(s => ({
        players: s.players,
        staff: s.staff,
        scheduleActivity: s.scheduleActivity,
        scheduledActivities: s.scheduledActivities,
        currentWeek: s.currentWeek,
        currentDay: s.currentDay,
        timeMode: s.timeMode,
        completedMatches: s.completedMatches,
        managerLevel: s.managerDetails?.level || 1,
        gameStartDate: s.gameStartDate,
        playerTeamId: s.playerTeamId,
    })))
    const team = useCurrentTeam()
    const daily = timeMode === "HYBRID_DAILY"
    const [day, setDay] = useState(initialDay)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!isOpen) return
        const minDay = daily && week === currentWeek ? currentDay : 0
        setDay(Math.max(minDay, Math.min(6, Math.floor(initialDay))))
        setError(null)
    }, [isOpen, initialDay, week, currentWeek, currentDay, daily])

    const days = useMemo(() => Array.from({ length: 7 }, (_, idx) => {
        const date = gameCalendarDate(gameStartDate, week, idx)
        return {
            idx,
            weekday: formatGameCalendarDate(date, { weekday: "short" }),
            date: formatGameCalendarDate(date, { month: "short", day: "numeric" }),
            closed: daily && week === currentWeek && idx < currentDay,
        }
    }), [gameStartDate, week, daily, currentWeek, currentDay])

    const ctx = useMemo<MeetingContext>(() => {
        const roster = team ? players.filter(p => team.rosterIds.includes(p.id)) : []
        return {
            playerTeamId,
            currentWeek,
            managerLevel,
            staffRoles: staff.filter(s => s.teamId === playerTeamId).map(s => s.role),
            rosterMorale: roster.map(p => p.morale ?? 50),
            results: completedMatches
                .filter(m => m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
                .map(m => ({ week: m.week, day: m.day, won: m.result.winnerId === playerTeamId })),
        }
    }, [team, players, playerTeamId, currentWeek, managerLevel, staff, completedMatches])

    const budget = team?.budget ?? 0
    const booked = new Set((scheduledActivities || []).filter(a => a.type === "STAFF_MEETING" && a.week === week).map(a => a.id))

    const book = (meeting: MeetingType) => {
        const effects = meetingEffectLabels(meeting.effects)
        const result = scheduleActivity({
            id: meetingActivityId(meeting.id, week),
            type: "STAFF_MEETING",
            week,
            day,
            duration: 0,
            cost: meeting.cost,
            name: meeting.name,
            description: effects.map(e => e.label).join(", "),
            data: { meetingType: meeting.id, effects: meeting.effects },
        })
        if (result.success) {
            toast.success(`${meeting.name} booked`, { description: `${days[day]?.weekday ?? ""} ${days[day]?.date ?? ""} · ${formatCurrency(meeting.cost, "$", false)} paid` })
            onClose()
        } else {
            setError(result.message)
        }
    }

    return (
        <ScheduleDialog
            isOpen={isOpen}
            onClose={onClose}
            titleId="modal-title-book-meeting"
            title="Staff meeting"
            subtitle={`Week ${((week - 1) % 52) + 1} · one day · paid when booked, effects at the weekly update`}
            className="max-w-2xl"
            footer={
                <>
                    {error
                        ? <p role="alert" className="mr-auto text-xs font-medium text-negative">{error}</p>
                        : <span className="mr-auto text-xs tabular-nums text-ink-3">Funds {formatCurrency(budget, "$", false)}</span>}
                    <Button variant="ghost" onClick={onClose}>Close</Button>
                </>
            }
        >
            <div className="border-b border-line px-6 py-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Day</p>
                <div className="grid grid-cols-7 gap-1.5" role="radiogroup" aria-label="Meeting day">
                    {days.map(d => (
                        <button
                            key={d.idx}
                            type="button"
                            role="radio"
                            aria-checked={day === d.idx}
                            onClick={() => setDay(d.idx)}
                            disabled={d.closed}
                            className={cn(
                                "flex h-12 flex-col items-center justify-center rounded-md border text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                                day === d.idx ? "border-gold bg-hover text-ink-1" : "border-line bg-shell text-ink-2 hover:bg-raised",
                            )}
                        >
                            <span className="font-semibold">{d.weekday}</span>
                            <span className="text-[11px] tabular-nums text-ink-3">{d.date}</span>
                        </button>
                    ))}
                </div>
                <p className="mt-2 text-xs text-ink-3">The meeting day doesn&apos;t count as a rest day (no idle-day recovery).</p>
            </div>

            <ul className="divide-y divide-line">
                {MEETING_TYPES.map(meeting => {
                    const status = meetingStatus(meeting, ctx)
                    const affordable = budget >= meeting.cost
                    const already = booked.has(meetingActivityId(meeting.id, week))
                    return (
                        <li key={meeting.id} className={cn("flex items-center gap-4 px-6 py-3", !status.unlocked && "opacity-60")}>
                            <div className="min-w-0 flex-1">
                                <p className="flex items-center gap-2 text-sm font-semibold text-ink-1">
                                    {meeting.name}
                                    {!status.unlocked && <Lock size={12} className="text-ink-3" aria-hidden="true" />}
                                </p>
                                <p className="text-xs text-ink-3">{meeting.description}</p>
                                <p className="mt-1 text-xs">
                                    {meetingEffectLabels(meeting.effects).map((fx, i) => (
                                        <span key={fx.label}>
                                            {i > 0 && <span className="text-ink-3"> · </span>}
                                            <span className={fx.good ? "text-positive" : "text-caution"}>{fx.label}</span>
                                        </span>
                                    ))}
                                    <span className="text-ink-3"> per player</span>
                                </p>
                            </div>
                            <span className={cn("w-16 shrink-0 text-right text-sm tabular-nums", affordable ? "text-ink-1" : "text-negative")}>
                                {formatCurrency(meeting.cost, "$", false)}
                            </span>
                            <div className="w-36 shrink-0 text-right">
                                {already ? (
                                    <span className="text-xs font-semibold text-positive">Booked this week</span>
                                ) : status.unlocked ? (
                                    <Button variant="outline" size="sm" disabled={!affordable || !!days[day]?.closed} onClick={() => book(meeting)}>
                                        {affordable ? "Book" : "Can't afford"}
                                    </Button>
                                ) : (
                                    <span className="text-xs leading-snug text-ink-3">{status.reason}</span>
                                )}
                            </div>
                        </li>
                    )
                })}
            </ul>
            {!ctx.staffRoles.length && (
                <p className="border-t border-line px-6 py-3 text-xs text-ink-3">
                    Two sessions need staff. <Link href="/staff" className="font-semibold text-ink-1 underline underline-offset-2">Hire staff</Link>
                </p>
            )}
        </ScheduleDialog>
    )
}
