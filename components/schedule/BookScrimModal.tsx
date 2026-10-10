"use client"

import React, { useState, useMemo, useEffect } from "react"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { calculateTeamTier, type TierLevel } from "@/engine/tier-system"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { RatingChip } from "@/src/components/ui/RatingChip"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { gameCalendarDate, formatGameCalendarDate } from "@/lib/game-calendar"
import { ScheduleDialog } from "./ScheduleDialog"

interface BookScrimModalProps {
    isOpen: boolean
    onClose: () => void
    week: number
    initialDay?: number
}

const TIER_LABEL: Record<TierLevel, string> = { ELITE: "Elite", PRO: "Pro", SEMI_PRO: "Semi-pro", AMATEUR: "Amateur" }

export function BookScrimModal({ isOpen, onClose, week, initialDay = 0 }: BookScrimModalProps) {
    const { teams, playerTeamId, players, scheduleScrim, currentWeek, currentDay, timeMode, gameStartDate } = useGameStore(useShallow(state => ({
        teams: state.teams,
        playerTeamId: state.playerTeamId,
        players: state.players,
        scheduleScrim: state.scheduleScrim,
        currentWeek: state.currentWeek,
        currentDay: state.currentDay,
        timeMode: state.timeMode,
        gameStartDate: state.gameStartDate,
    })))
    const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
    const [selectedDay, setSelectedDay] = useState<number>(initialDay)
    const [error, setError] = useState<string | null>(null)
    const [searchTerm, setSearchTerm] = useState("")

    useEffect(() => {
        if (!isOpen) return

        const normalizedInitialDay = Math.max(0, Math.min(6, Math.floor(initialDay)))
        const minAllowedDay =
            timeMode === "HYBRID_DAILY" && week === currentWeek
                ? currentDay
                : 0

        setSelectedDay(Math.max(normalizedInitialDay, minAllowedDay))
        setError(null)
    }, [isOpen, initialDay, week, currentWeek, currentDay, timeMode])

    // Day buttons use the real calendar (week day 0 is the career's start weekday, not always Monday).
    const days = useMemo(() => Array.from({ length: 7 }, (_, idx) => {
        const date = gameCalendarDate(gameStartDate, week, idx)
        return {
            idx,
            weekday: formatGameCalendarDate(date, { weekday: "short" }),
            date: formatGameCalendarDate(date, { month: "short", day: "numeric" }),
            closed: timeMode === "HYBRID_DAILY" && week === currentWeek && idx < currentDay,
        }
    }), [gameStartDate, week, timeMode, currentWeek, currentDay])

    // Filter potential opponents
    const opponents = useMemo(() => {
        if (!playerTeamId) return []
        const term = searchTerm.trim().toLowerCase()
        return teams
            .filter(t => t.id !== playerTeamId)
            .filter(t => !term || t.name.toLowerCase().includes(term))
            .sort((a, b) => (b.reputation || 0) - (a.reputation || 0))
    }, [teams, playerTeamId, searchTerm])

    // Team ratings, memoized: evaluatePlayer is not free.
    const teamAvgRatings = useMemo(() => {
        const byId = new Map(players.map(p => [p.id, p]))
        const map = new Map<string, number>()
        for (const team of opponents) {
            const roster = team.rosterIds.map(id => byId.get(id)).filter((p): p is typeof players[number] => p !== undefined)
            map.set(team.id, roster.length > 0 ? Math.round(roster.reduce((sum, p) => sum + evaluatePlayer(p).overallRating, 0) / roster.length) : 0)
        }
        return map
    }, [opponents, players])

    const selectedDayInfo = days[selectedDay]

    const handleBook = () => {
        if (!selectedTeamId) return
        const opponent = teams.find(t => t.id === selectedTeamId)
        const result = scheduleScrim(selectedTeamId, week, selectedDay) as unknown as { success: boolean, message: string }
        if (result.success) {
            toast.success(`Scrim booked vs ${opponent?.name || "opponent"}`)
            onClose()
        } else {
            setError(result.message)
        }
    }

    return (
        <ScheduleDialog
            isOpen={isOpen}
            onClose={onClose}
            titleId="modal-title-book-scrim"
            title="Book scrim"
            subtitle={`Week ${week} · practice match`}
            className="max-w-2xl"
            footer={
                <>
                    {error && <p role="alert" className="mr-auto text-xs font-medium text-negative">{error}</p>}
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleBook} disabled={!selectedTeamId || !!selectedDayInfo?.closed}>
                        Book for {selectedDayInfo ? `${selectedDayInfo.weekday}, ${selectedDayInfo.date}` : "this day"}
                    </Button>
                </>
            }
        >
            <div className="border-b border-line px-6 py-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Day</p>
                <div className="grid grid-cols-7 gap-1.5" role="radiogroup" aria-label="Day">
                    {days.map(d => (
                        <button
                            key={d.idx}
                            type="button"
                            role="radio"
                            aria-checked={selectedDay === d.idx}
                            onClick={() => setSelectedDay(d.idx)}
                            disabled={d.closed}
                            className={cn(
                                "flex h-12 flex-col items-center justify-center rounded-md border text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                                selectedDay === d.idx ? "border-gold bg-hover text-ink-1" : "border-line bg-shell text-ink-2 hover:bg-raised",
                            )}
                        >
                            <span className="font-semibold">{d.weekday}</span>
                            <span className="text-[11px] tabular-nums text-ink-3">{d.date}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="px-6 pt-4">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" size={15} />
                    <Input
                        type="text"
                        placeholder="Search clubs"
                        aria-label="Search clubs"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-9 pl-9 text-sm"
                    />
                </div>
            </div>

            <div className="max-h-[340px] overflow-y-auto px-3 py-3">
                {opponents.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-ink-3">No clubs match “{searchTerm}”.</p>
                ) : (
                    <ul aria-label="Opponents">
                        {opponents.map(team => {
                            const isSelected = selectedTeamId === team.id
                            return (
                                <li key={team.id}>
                                    <button
                                        type="button"
                                        aria-pressed={isSelected}
                                        onClick={() => setSelectedTeamId(team.id)}
                                        className={cn(
                                            "flex w-full items-center gap-3 rounded-md border-l-2 px-3 py-2 text-left transition-colors",
                                            isSelected ? "border-gold bg-hover" : "border-transparent hover:bg-raised",
                                        )}
                                    >
                                        <TeamLogoDisplay team={team} size={28} />
                                        <span className={cn("min-w-0 flex-1 truncate text-sm font-semibold", isSelected ? "text-gold" : "text-ink-1")}>{team.name}</span>
                                        <span className="w-16 text-xs text-ink-3">#{team.worldRanking || "—"}</span>
                                        <span className="w-20 text-xs text-ink-2">{TIER_LABEL[calculateTeamTier(team.worldRanking || 100)]}</span>
                                        <RatingChip value={teamAvgRatings.get(team.id) || 0} size="sm" />
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </div>
        </ScheduleDialog>
    )
}
