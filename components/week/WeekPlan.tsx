"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { EconomyEngine } from "@/engine/economy-engine"
import type { PlayerSaveData } from "@/engine/save-types"
import { gameCalendarDate, formatGameCalendarDate } from "@/lib/game-calendar"
import { formatSignedCurrency } from "@/lib/utils-extended"
import { Button } from "@/components/ui/button"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { WeeklyFocusWidget } from "@/components/dashboard/WeeklyFocusWidget"
import { LastWeekPanel } from "@/components/report/LastWeekPanel"
import { BookScrimModal } from "@/components/schedule/BookScrimModal"
import { BookBootcampModal } from "@/components/schedule/BookBootcampModal"
import { BookMarketingModal } from "@/components/schedule/BookMarketingModal"
import { BookStaffMeetingModal } from "@/components/schedule/BookStaffMeetingModal"
import { trainingModifiers } from "@/components/training/weekly-training"
import { activitiesThisWeek, buildWeekPreview, type FixtureLike } from "./week-preview"
import { WeekFixtures } from "./WeekFixtures"
import { WeekBookings, type BookingKind } from "./WeekBookings"
import { WeekTrainingPlan } from "./WeekTrainingPlan"
import { WeekForecast } from "./WeekForecast"

/**
 * Week plan hub (Phase 4.2): the coming week on one screen — matches, the
 * team focus, bookings (scrims, bootcamps, marketing, staff meetings), each
 * player's training focus and an honest forecast of the update. Training
 * extras and the season calendar are the hub's other tabs.
 */
export function WeekPlan() {
    const s = useGameStore(useShallow(st => ({
        hydrated: st._hasHydrated,
        // The career reloads from disk after rehydration (isLoading).
        careerLoading: st.isLoading,
        players: st.players,
        staff: st.staff,
        contracts: st.contracts,
        academyCount: st.academyPlayers.length,
        currentWeek: st.currentWeek,
        currentDay: st.currentDay,
        timeMode: st.timeMode,
        gameStartDate: st.gameStartDate,
        selectedWeeklyActivity: st.selectedWeeklyActivity,
        scheduledActivities: st.scheduledActivities,
        scheduledMatches: st.scheduledMatches,
        completedMatches: st.completedMatches,
        setPlayerTrainingFocus: st.setPlayerTrainingFocus,
    })))
    const team = useCurrentTeam()
    const daily = s.timeMode === "HYBRID_DAILY"
    const [booking, setBooking] = useState<{ kind: BookingKind; week: number; day: number } | null>(null)

    // `/week?book=meeting&week=&day=` (old /schedule/staff-meeting links) opens the meeting booking.
    const careerReady = s.hydrated && !s.careerLoading && !!team
    useEffect(() => {
        if (!careerReady) return
        const params = new URLSearchParams(window.location.search)
        if (params.get("book") !== "meeting") return
        const week = Number(params.get("week"))
        const day = Number(params.get("day"))
        const validWeek = Number.isInteger(week) && week >= s.currentWeek ? week : s.currentWeek
        const minDay = daily && validWeek === s.currentWeek ? s.currentDay : 0
        setBooking({ kind: "MEETING", week: validWeek, day: Number.isInteger(day) && day >= 0 && day <= 6 ? Math.max(day, minDay) : minDay })
        window.history.replaceState(window.history.state, "", "/week")
        // Only on arrival, once the career is loaded.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [careerReady])

    const roster = useMemo(() => {
        const byId = new Map(s.players.map(p => [p.id, p]))
        return (team?.rosterIds || []).map(id => byId.get(id)).filter((p): p is PlayerSaveData => !!p && !p.isRetired)
    }, [s.players, team?.rosterIds])

    const mods = useMemo(() => trainingModifiers(team ?? undefined, s.staff, s.currentWeek), [team, s.staff, s.currentWeek])

    const preview = useMemo(() => team ? buildWeekPreview({
        team,
        roster,
        staff: s.staff,
        currentWeek: s.currentWeek,
        selectedWeeklyActivity: s.selectedWeeklyActivity,
        scheduledActivities: s.scheduledActivities || [],
        scheduledMatches: s.scheduledMatches as FixtureLike[],
        completedMatches: s.completedMatches as FixtureLike[],
        trainingMods: mods,
    }) : null, [team, roster, s.staff, s.currentWeek, s.selectedWeeklyActivity, s.scheduledActivities, s.scheduledMatches, s.completedMatches, mods])

    const settlementNet = useMemo(() => team
        ? EconomyEngine.processWeeklyFinances(team, s.players, s.contracts, s.staff, s.currentWeek + 1, s.academyCount).net
        : null, [team, s.players, s.contracts, s.staff, s.currentWeek, s.academyCount])

    const projections = useMemo(() => new Map((preview?.players ?? []).map(p => [p.id, p])), [preview])
    const retrainingTarget = useMemo(() => new Map((team?.activeRoleTraining ?? []).map(t => [t.playerId, t])), [team?.activeRoleTraining])
    const bookings = useMemo(
        () => activitiesThisWeek(s.scheduledActivities || [], s.currentWeek).filter(a => !a.id.startsWith("rest_w")),
        [s.scheduledActivities, s.currentWeek],
    )

    if (!s.hydrated || !team || !preview) {
        return <p role="status" className="py-16 text-center text-sm text-ink-3">Loading week plan…</p>
    }

    const dayLabel = (day: number) => formatGameCalendarDate(gameCalendarDate(s.gameStartDate, s.currentWeek, day), { weekday: "short" })
    const season = Math.ceil(s.currentWeek / 52)
    const weekInSeason = ((s.currentWeek - 1) % 52) + 1
    const cashAtUpdate = (settlementNet ?? 0) + preview.cash.focusIncome - preview.cash.focusCost - preview.cash.retraining
    const openBooking = (kind: BookingKind) => setBooking({ kind, week: s.currentWeek, day: daily ? s.currentDay : 0 })

    return (
        <div className="mx-auto max-w-[1600px] space-y-5 pb-16">
            <ScreenHeader
                eyebrow={`Season ${season} · Week ${weekInSeason}${daily ? ` · ${formatGameCalendarDate(gameCalendarDate(s.gameStartDate, s.currentWeek, s.currentDay), { weekday: "long" })}` : ""}`}
                title="Week plan"
                subtitle="Everything here happens at this week's update, with the numbers the game applies."
                aside={
                    <KpiStrip>
                        <Kpi label="Matches to play" value={preview.fixturesToPlay.length} />
                        <Kpi label="Rest days" value={`${preview.restDays.length} / 7`} />
                        <Kpi label="Cash at update" value={<span className={cashAtUpdate < 0 ? "text-negative" : undefined}>{formatSignedCurrency(cashAtUpdate, "$", true)}</span>} hint="Before prize money" />
                    </KpiStrip>
                }
            />

            {roster.length < 5 && (
                <p className="text-sm text-caution">
                    You need five players to compete. <Link href="/transfers" className="font-semibold underline underline-offset-2">Go to transfers</Link>
                </p>
            )}

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="min-w-0 space-y-4">
                    <WeekFixtures />
                    <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                        <WeeklyFocusWidget />
                        <WeekBookings week={s.currentWeek} bookings={bookings} effects={preview.effects} dayLabel={dayLabel} onBook={openBooking} />
                    </div>
                    {roster.length > 0 ? (
                        <WeekTrainingPlan roster={roster} projections={projections} retrainingTarget={retrainingTarget} onSetFocus={s.setPlayerTrainingFocus} />
                    ) : (
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel px-4 py-3">
                            <p className="text-sm text-ink-3">No players to train yet.</p>
                            <Button variant="outline" size="sm" asChild><Link href="/transfers">Browse transfers</Link></Button>
                        </div>
                    )}
                </div>
                <aside className="min-w-0 space-y-4">
                    <WeekForecast preview={preview} settlementNet={settlementNet} restDayLabels={preview.restDays.map(dayLabel)} />
                    <LastWeekPanel />
                </aside>
            </div>

            <BookScrimModal isOpen={booking?.kind === "SCRIM"} onClose={() => setBooking(null)} week={booking?.week ?? s.currentWeek} initialDay={booking?.day ?? 0} />
            <BookBootcampModal isOpen={booking?.kind === "BOOTCAMP"} onClose={() => setBooking(null)} week={booking?.week ?? s.currentWeek} />
            <BookMarketingModal isOpen={booking?.kind === "MARKETING"} onClose={() => setBooking(null)} week={booking?.week ?? s.currentWeek} />
            <BookStaffMeetingModal isOpen={booking?.kind === "MEETING"} onClose={() => setBooking(null)} week={booking?.week ?? s.currentWeek} initialDay={booking?.day ?? 0} />
        </div>
    )
}
