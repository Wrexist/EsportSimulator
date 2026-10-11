"use client"

import { gameCalendarDate, formatGameCalendarDate } from "@/lib/game-calendar"

import React, { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { ChevronRight, ChevronLeft, Plus, Trophy, Plane, Megaphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getDynamicTournamentName } from "@/lib/utils-extended"
import { Panel } from "@/src/components/ui/Panel"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { BookScrimModal } from "@/components/schedule/BookScrimModal"
import { BookBootcampModal } from "@/components/schedule/BookBootcampModal"
import { BookMarketingModal } from "@/components/schedule/BookMarketingModal"
import { BookStaffMeetingModal } from "@/components/schedule/BookStaffMeetingModal"
import { ActivityPickerModal } from "@/components/schedule/ActivityPickerModal"
import { TournamentDetailsModal } from "@/components/schedule/TournamentDetailsModal"
import { ScheduleMatchCard } from "@/components/schedule/ScheduleMatchCard"
import { ScheduleActivityCard } from "@/components/schedule/ScheduleActivityCard"
import { TeamMatchPopup } from "@/components/schedule/TeamMatchPopup"
import { FULL_TOURNAMENT_CALENDAR } from "@/data/tournament-calendar"

import { WEEKS_PER_YEAR } from "@/lib/constants"

/** Weeks shown at once: one row per week, seven day columns. */
const VISIBLE_WEEKS = 6
/** Prev/next jump; keeps two rows of overlap for context. */
const PAGE_STEP = 4

const TIER_LABEL: Record<string, string> = { S_TIER: "S-tier", A_TIER: "A-tier", B_TIER: "B-tier", C_TIER: "C-tier" }

// Helper for projected matches type
interface ProjectedMatch {
  id: string
  week: number
  stage: string
  tournamentName: string
  tournamentId: string
  reason?: string
}

/** First visible week index: the previous week stays in view for context. */
const defaultOffset = (currentWeek: number) => Math.max(0, currentWeek - 2)

export default function SchedulePage() {
  const {
    currentWeek,
    currentDay,
    timeMode,
    scheduledMatches,
    completedMatches,
    scheduledActivities,
    gameStartDate,
    teams,
    players,
    playerTeamId,
    tournamentQualifications,
    tournaments,
    hydrated,
  } = useGameStore(useShallow(state => ({
    currentWeek: state.currentWeek,
    currentDay: state.currentDay,
    timeMode: state.timeMode,
    scheduledMatches: state.scheduledMatches,
    completedMatches: state.completedMatches,
    scheduledActivities: state.scheduledActivities,
    gameStartDate: state.gameStartDate,
    teams: state.teams,
    players: state.players,
    playerTeamId: state.playerTeamId,
    tournamentQualifications: state.tournamentQualifications,
    tournaments: state.tournaments,
    hydrated: state._hasHydrated,
  })))
  const router = useRouter()
  const [viewOffset, setViewOffset] = useState(() => defaultOffset(currentWeek))

  // Modal States
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [isScrimModalOpen, setIsScrimModalOpen] = useState(false)
  const [isBootcampModalOpen, setIsBootcampModal] = useState(false)
  const [isMarketingModalOpen, setIsMarketingModalOpen] = useState(false)
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false)
  const [selectedWeek, setSelectedWeek] = useState<number>(currentWeek)
  const [selectedDay, setSelectedDay] = useState<number>(0)

  // Tournament Modal State
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null)

  // Match Popup State
  const [selectedMatchForPopup, setSelectedMatchForPopup] = useState<typeof scheduledMatches[0] | null>(null)

  const selectedTournament = selectedTournamentId
    ? FULL_TOURNAMENT_CALENDAR.find(t => t.id === selectedTournamentId)
    : null

  // O(1) seriesId -> status lookup for the player's tournament qualifications.
  type TournamentStatus = NonNullable<typeof tournamentQualifications[number]["status"]>
  const statusBySeriesId = useMemo(() => {
    const map = new Map<string, TournamentStatus>()
    for (const q of tournamentQualifications) {
      if (q.teamId !== playerTeamId) continue
      const seriesId = (q.seriesId || q.tournamentId).replace(/_s\d+$/, "")
      if (q.status) map.set(seriesId, q.status)
    }
    return map
  }, [tournamentQualifications, playerTeamId])

  const getTournamentStatus = (tournamentId: string): TournamentStatus | undefined =>
    statusBySeriesId.get(tournamentId.replace(/_s\d+$/, ""))

  // Always reach one year past the current week, never less than two seasons.
  const TOTAL_WEEKS_TO_RENDER = Math.max(WEEKS_PER_YEAR * 2, currentWeek + WEEKS_PER_YEAR)
  const maxOffset = Math.max(0, TOTAL_WEEKS_TO_RENDER - VISIBLE_WEEKS)

  // Follow the calendar when the week advances.
  useEffect(() => {
    setViewOffset(defaultOffset(currentWeek))
  }, [currentWeek])

  const handleOpenPicker = (week: number, day: number) => {
    setSelectedWeek(week)
    setSelectedDay(day)
    setIsPickerOpen(true)
  }

  const handleActivitySelect = (type: "SCRIM" | "BOOTCAMP" | "MEETING" | "MARKETING") => {
    setIsPickerOpen(false) // Close picker first
    if (type === "SCRIM") setIsScrimModalOpen(true)
    if (type === "BOOTCAMP") setIsBootcampModal(true)
    if (type === "MARKETING") setIsMarketingModalOpen(true)
    if (type === "MEETING") setIsMeetingModalOpen(true)
  }

  const dateFor = (week: number, dayIndex: number) => gameCalendarDate(gameStartDate, week, dayIndex)
  const dayLabel = (week: number, dayIndex: number) => formatGameCalendarDate(dateFor(week, dayIndex), { weekday: "short", month: "short", day: "numeric" })

  // Week day 0 is the career's start weekday; every week has the same order.
  const weekdayHeaders = useMemo(
    () => Array.from({ length: 7 }, (_, i) => formatGameCalendarDate(gameCalendarDate(gameStartDate, 1, i), { weekday: "short" })),
    [gameStartDate],
  )

  const playerTeam = teams.find(t => t.id === playerTeamId)

  // --- PROJECTED MATCH LOGIC ---
  const getProjectedMatches = (): ProjectedMatch[] => {
    if (!playerTeamId) return []
    const projected: ProjectedMatch[] = []

    const pushed = new Set<string>()
    const scheduledIds = new Set(scheduledMatches.map(m => m.id))
    const completedIds = new Set(completedMatches.map(m => m.id))

    const liveInstances = tournaments.filter(t =>
      !t.isCompleted &&
      t.teamIds?.includes(playerTeamId)
    )

    liveInstances.forEach(instance => {
      const definition = FULL_TOURNAMENT_CALENDAR.find(def =>
        def.id === (instance.seriesId || instance.id.replace(/_s\d+$/, ""))
      )

      const forecastedBracketMatches = (instance.playoffBracket || [])
        .filter((m: any) => !m.isCompleted)
        .filter((m: any) => {
          const involvesPlayer = m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId
          const unresolvedFutureSlot = !m.homeTeamId || !m.awayTeamId
          return involvesPlayer || unresolvedFutureSlot
        })
        .filter((m: any) => !scheduledIds.has(m.id) && !completedIds.has(m.id))
        .filter((m: any) => m.week >= currentWeek)
        .sort((a: any, b: any) => {
          if ((a.week || 0) !== (b.week || 0)) return (a.week || 0) - (b.week || 0)
          return (a.id || "").localeCompare(b.id || "")
        })

      forecastedBracketMatches.forEach((match: any) => {
        const key = `${instance.id}:${match.id}`
        if (pushed.has(key)) return
        pushed.add(key)
        projected.push({
          id: `proj_${instance.id}_${match.id}`,
          week: match.week,
          tournamentId: instance.id,
          tournamentName: definition?.shortName || instance.shortName || instance.name,
          stage: match.stage || instance.currentStage || "Next stage",
          reason: "Forecast"
        })
      })

      if (forecastedBracketMatches.length > 0) return

      // Stage window fallback when bracket rounds are not generated yet.
      const startWeek = Math.max(currentWeek, instance.startWeek)
      const endWeek = Math.max(startWeek, instance.endWeek)
      for (let week = startWeek; week <= endWeek; week++) {
        const hasPlayerMatch = scheduledMatches.some(m =>
          m.week === week
          && m.tournamentId === instance.id
          && (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
        )
        if (hasPlayerMatch) continue

        const key = `${instance.id}:stage:${week}`
        if (pushed.has(key)) continue
        pushed.add(key)
        projected.push({
          id: `proj_${instance.id}_${week}`,
          week,
          tournamentId: instance.id,
          tournamentName: definition?.shortName || instance.shortName || instance.name,
          stage: instance.currentStage || "Upcoming stage",
          reason: "Forecast"
        })
      }
    })

    return projected
      .sort((a, b) => (a.week - b.week) || a.id.localeCompare(b.id))
      .slice(0, 60)
  }

  // Memoize the projected-match build — it scans tournaments, brackets and stage windows.
  const projectedMatches = useMemo(
    () => getProjectedMatches(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scheduledMatches, completedMatches, tournaments, currentWeek, playerTeamId],
  )

  const completedIdSet = useMemo(
    () => new Set(completedMatches.map(m => m.id)),
    [completedMatches],
  )
  const dedupedScheduledMatches = useMemo(
    () => scheduledMatches.filter(m => !completedIdSet.has(m.id)),
    [scheduledMatches, completedIdSet],
  )
  const allMatchesForLookup = useMemo(
    () => [...dedupedScheduledMatches, ...completedMatches],
    [dedupedScheduledMatches, completedMatches],
  )

  // Upcoming registered tournaments (not yet started this season)
  const currentCalendarWeek = (currentWeek - 1) % WEEKS_PER_YEAR + 1
  const upcomingRegisteredTournaments = FULL_TOURNAMENT_CALENDAR.filter(t => {
    const status = getTournamentStatus(t.id)
    if (!(status === "QUALIFIED" || status === "REGISTERED" || status === "INVITED")) return false
    return t.startWeek > currentCalendarWeek
  }).sort((a, b) => a.startWeek - b.startWeek)

  const currentYear = Math.ceil(currentWeek / WEEKS_PER_YEAR)
  const currentWeekInYear = (currentWeek - 1) % WEEKS_PER_YEAR + 1
  const daily = timeMode === "HYBRID_DAILY"

  const isMatchDue = (match: { week: number; day?: number }) =>
    match.week < currentWeek || (match.week === currentWeek && (!daily || (match.day ?? 6) <= currentDay))

  const visibleWeeks = Array.from({ length: VISIBLE_WEEKS }, (_, i) => viewOffset + i + 1).filter(w => w <= TOTAL_WEEKS_TO_RENDER)
  const firstVisible = visibleWeeks[0]
  const lastVisible = visibleWeeks[visibleWeeks.length - 1]
  const rangeLabel = firstVisible && lastVisible
    ? `${formatGameCalendarDate(dateFor(firstVisible, 0), { month: "short", day: "numeric" })} – ${formatGameCalendarDate(dateFor(lastVisible, 6), { month: "short", day: "numeric", year: "numeric" })}`
    : ""

  // The store rehydrates after a full load; don't draw a week-0 calendar meanwhile.
  if (!hydrated || !playerTeam) {
    return <p className="py-16 text-center text-sm text-ink-3" role="status">Loading calendar…</p>
  }

  return (
    <div className="space-y-4 pb-10">
      <ScreenHeader
        eyebrow={`Season ${currentYear} · Week ${currentWeekInYear}${daily ? ` · ${dayLabel(currentWeek, currentDay)}` : ""}`}
        title="Calendar"
        subtitle={<>The season week by week: matches, scrims and bookings. Pick an empty day to book something; plan this week in the <Link href="/week" className="font-semibold text-ink-1 underline underline-offset-2">week plan</Link>.</>}
        aside={
          <>
            <Button variant="outline" onClick={() => handleOpenPicker(currentWeek, daily ? currentDay : 0)} className="gap-1.5">
              <Plus size={15} /> Book activity
            </Button>
          </>
        }
      />

      {/* Notices: roster gap and registered events */}
      {((playerTeam && (playerTeam.rosterIds?.length || 0) < 5) || upcomingRegisteredTournaments.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          {playerTeam && (playerTeam.rosterIds?.length || 0) < 5 && (
            <p className="text-caution">
              You need five players to compete.{" "}
              <Link href="/transfers" className="font-semibold underline underline-offset-2">Go to transfers</Link>
            </p>
          )}
          {upcomingRegisteredTournaments.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Registered</span>
              {upcomingRegisteredTournaments.slice(0, 4).map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTournamentId(t.id)}
                  className="inline-flex items-center gap-2 rounded-sm border border-line bg-panel px-2.5 py-1 text-xs transition-colors hover:bg-raised"
                >
                  <Trophy size={12} className="text-ink-3" />
                  <span className="font-semibold text-ink-1">{t.shortName}</span>
                  <span className="tabular-nums text-ink-3">Week {t.startWeek} · in {t.startWeek - currentCalendarWeek}w</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <Panel
        padded={false}
        className="overflow-hidden"
        title={rangeLabel}
        actions={
          <>
            <Button variant="outline" size="icon-sm" aria-label="Earlier weeks" onClick={() => setViewOffset(v => Math.max(0, v - PAGE_STEP))} disabled={viewOffset <= 0}>
              <ChevronLeft size={16} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setViewOffset(defaultOffset(currentWeek))}>This week</Button>
            <Button variant="outline" size="icon-sm" aria-label="Later weeks" onClick={() => setViewOffset(v => Math.min(maxOffset, v + PAGE_STEP))} disabled={viewOffset >= maxOffset}>
              <ChevronRight size={16} />
            </Button>
          </>
        }
      >
        <table data-slot="table" className="w-full table-fixed border-collapse text-left">
          <thead data-slot="table-header">
            <tr className="border-b border-line">
              <th data-slot="table-head" className="w-[200px] pl-4">Week</th>
              {weekdayHeaders.map((d, i) => (
                <th key={i} data-slot="table-head" className="border-l border-line px-3">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleWeeks.map(weekNum => {
              const isPast = weekNum < currentWeek
              const isCurrent = weekNum === currentWeek
              const displayYear = Math.ceil(weekNum / WEEKS_PER_YEAR)
              const displayWeek = (weekNum - 1) % WEEKS_PER_YEAR + 1
              const calendarWeek = displayWeek

              const matches = allMatchesForLookup.filter(m =>
                m.week === weekNum &&
                (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
              )
              const projected = projectedMatches.filter(p => p.week === weekNum)

              // Static calendar is 1-52; later seasons map back onto it.
              const activeTournaments = FULL_TOURNAMENT_CALENDAR.filter(t =>
                calendarWeek >= t.startWeek && calendarWeek < t.startWeek + t.duration
              )
              const participatingTournaments = activeTournaments.filter(t => {
                const status = getTournamentStatus(t.id)
                const seasonalIdPattern = new RegExp(`^${t.id}_s\\d+$`)
                const hasMatches = scheduledMatches.some(m =>
                  (m.tournamentId === t.id || (m.tournamentId && seasonalIdPattern.test(m.tournamentId))) &&
                  (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
                )
                return status === "QUALIFIED" || status === "REGISTERED" || status === "INVITED" || hasMatches
              })
              const upcomingIndicator = participatingTournaments.length === 0
                ? FULL_TOURNAMENT_CALENDAR.find(t => {
                    const status = getTournamentStatus(t.id)
                    if (!(status === "QUALIFIED" || status === "REGISTERED" || status === "INVITED")) return false
                    const weeksUntilStart = t.startWeek - calendarWeek
                    return weeksUntilStart > 0 && weeksUntilStart <= 4
                  })
                : undefined

              // Week-long blocks: bootcamps/retreats take the team away; campaigns run alongside.
              const weekBlocks = (scheduledActivities || []).filter(a =>
                a.duration > 0 && weekNum >= a.week && weekNum < a.week + a.duration
              )
              const awayBlock = weekBlocks.find(a => a.type === "BOOTCAMP" || a.type === "TRAVEL" || a.type === "REST")

              return (
                <tr key={weekNum} className={cn("border-b border-line align-top last:border-b-0", isPast && "bg-shell/60")}>
                  <th scope="row" className={cn("px-4 py-3 text-left font-normal", isCurrent && "bg-hover/40")}>
                    <div className="flex items-baseline gap-2">
                      <span className={cn("font-display text-xl font-bold uppercase leading-none", isCurrent ? "text-gold" : isPast ? "text-ink-3" : "text-ink-1")}>Week {displayWeek}</span>
                      <span className="text-xs text-ink-3">{isCurrent ? "This week" : `S${displayYear}`}</span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {participatingTournaments.slice(0, 1).map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSelectedTournamentId(t.id)}
                          className="flex w-full items-center gap-1.5 rounded-sm bg-raised px-2 py-1 text-left text-xs transition-colors hover:bg-hover"
                        >
                          <Trophy size={12} className="shrink-0 text-gold" />
                          <span className="truncate font-semibold text-ink-1">{getDynamicTournamentName(t.shortName || t.name, weekNum)}</span>
                          <span className="ml-auto shrink-0 text-[11px] text-ink-3">{TIER_LABEL[t.tier] ?? t.tier}</span>
                        </button>
                      ))}
                      {upcomingIndicator && (
                        <button
                          type="button"
                          onClick={() => setSelectedTournamentId(upcomingIndicator.id)}
                          className="flex w-full items-center gap-1.5 rounded-sm border border-dashed border-line-strong px-2 py-1 text-left text-xs text-ink-3 transition-colors hover:text-ink-1"
                        >
                          <Trophy size={12} className="shrink-0" />
                          <span className="truncate">{upcomingIndicator.shortName} in {upcomingIndicator.startWeek - calendarWeek}w</span>
                        </button>
                      )}
                      {weekBlocks.map(a => (
                        <div key={a.id} className="flex items-center gap-1.5 rounded-sm border border-line bg-shell px-2 py-1 text-xs text-ink-2" title={a.description}>
                          {a.type === "MARKETING" ? <Megaphone size={12} className="shrink-0 text-ink-3" /> : <Plane size={12} className="shrink-0 text-ink-3" />}
                          <span className="truncate">{a.name || a.type}</span>
                        </div>
                      ))}
                      {projected.slice(0, 2).map(proj => (
                        <ScheduleMatchCard
                          key={proj.id}
                          teams={teams as any}
                          playerTeamId={playerTeamId || ""}
                          projected={{ stage: proj.stage, tournamentName: proj.tournamentName, tournamentId: proj.tournamentId, week: proj.week, reason: proj.reason }}
                        />
                      ))}
                      {projected.length > 2 && <p className="px-1 text-[11px] text-ink-3">+{projected.length - 2} more forecast</p>}
                    </div>
                  </th>

                  {weekdayHeaders.map((_, dayIndex) => {
                    // Matches without a day (legacy saves) keep their old spread: scrims mid-week, others at the weekend.
                    const dayMatches = matches.filter((m, idx) => {
                      if (m.day !== undefined) return m.day === dayIndex
                      if (m.isScrim) return dayIndex === (idx % 2 === 0 ? 3 : 4)
                      return dayIndex === (idx % 2 === 0 ? 5 : 6)
                    })
                    const dayActivities = (scheduledActivities || []).filter(a =>
                      a.week === weekNum && a.day === dayIndex && a.duration === 0
                    )
                    const isPastDay = isPast || (isCurrent && daily && dayIndex < currentDay)
                    const isToday = isCurrent && (daily ? dayIndex === currentDay : false)
                    const hasItems = dayMatches.length > 0 || dayActivities.length > 0
                    const canBook = !hasItems && !isPastDay && !awayBlock
                    const date = dateFor(weekNum, dayIndex)

                    return (
                      <td
                        key={dayIndex}
                        className={cn(
                          "group relative h-[104px] border-l border-line p-1.5 align-top",
                          isToday && "bg-hover/40",
                          awayBlock && !isPastDay && "bg-raised/30",
                        )}
                      >
                        {isToday && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-gold" />}
                        <div className="flex items-center justify-between px-1 pb-1">
                          <span className={cn("text-xs tabular-nums", isToday ? "font-semibold text-ink-1" : isPastDay ? "text-ink-3/70" : "text-ink-3")}>
                            {formatGameCalendarDate(date, { month: "short", day: "numeric" })}
                          </span>
                          {isToday && <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gold">Today</span>}
                        </div>
                        <div className={cn("space-y-1", isPastDay && !hasItems && "opacity-60")}>
                          {dayMatches.map(match => {
                            const tournamentDef = match.tournamentId
                              ? FULL_TOURNAMENT_CALENDAR.find(t =>
                                match.tournamentId === t.id || match.tournamentId?.startsWith(`${t.id}_`)
                              )
                              : null
                            return (
                              <ScheduleMatchCard
                                key={match.id}
                                match={match as any}
                                teams={teams as any}
                                playerTeamId={playerTeamId || ""}
                                isScrim={match.isScrim}
                                tournamentName={tournamentDef ? getDynamicTournamentName(tournamentDef.shortName || tournamentDef.name, currentWeek) : undefined}
                                isCurrentWeek={isCurrent}
                                onClick={() => {
                                  if (match.result) router.push(`/match/${match.id}/result`)
                                  else setSelectedMatchForPopup(match)
                                }}
                              />
                            )
                          })}
                          {dayActivities.map(activity => (
                            <ScheduleActivityCard key={activity.id} activity={activity} />
                          ))}
                          {awayBlock && !hasItems && !isPastDay && (
                            <p className="px-1 text-[11px] text-ink-3">Away · {awayBlock.type === "REST" ? "retreat" : "bootcamp"}</p>
                          )}
                        </div>
                        {canBook && (
                          <button
                            type="button"
                            onClick={() => handleOpenPicker(weekNum, dayIndex)}
                            aria-label={`Book activity on ${dayLabel(weekNum, dayIndex)}`}
                            className="absolute inset-x-1.5 bottom-1.5 flex h-7 items-center justify-center gap-1 rounded-sm border border-dashed border-line-strong text-xs text-ink-3 opacity-0 transition-opacity hover:text-ink-1 focus-visible:opacity-100 group-hover:opacity-100"
                          >
                            <Plus size={12} /> Book
                          </button>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </Panel>

      {selectedTournament && (
        <TournamentDetailsModal
          isOpen={!!selectedTournamentId}
          onClose={() => setSelectedTournamentId(null)}
          tournament={selectedTournament}
          status={getTournamentStatus(selectedTournament.id)}
        />
      )}

      {/* Booking Modals */}
      <ActivityPickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        week={selectedWeek}
        dayLabel={dayLabel(selectedWeek, selectedDay)}
        onSelectType={handleActivitySelect}
      />

      <BookScrimModal
        isOpen={isScrimModalOpen}
        onClose={() => setIsScrimModalOpen(false)}
        week={selectedWeek}
        initialDay={selectedDay}
      />

      <BookBootcampModal
        isOpen={isBootcampModalOpen}
        onClose={() => setIsBootcampModal(false)}
        week={selectedWeek}
      />

      <BookMarketingModal
        isOpen={isMarketingModalOpen}
        onClose={() => setIsMarketingModalOpen(false)}
        week={selectedWeek}
      />

      <BookStaffMeetingModal
        isOpen={isMeetingModalOpen}
        onClose={() => setIsMeetingModalOpen(false)}
        week={selectedWeek}
        initialDay={selectedDay}
      />

      {/* Match Popup */}
      {selectedMatchForPopup && (() => {
        const opponentId = selectedMatchForPopup.homeTeamId === playerTeamId
          ? selectedMatchForPopup.awayTeamId
          : selectedMatchForPopup.homeTeamId
        const opponent = teams.find(t => t.id === opponentId)
        const opponentRoster = opponent
          ? (opponent.rosterIds || []).map(id => players.find(p => p.id === id)).filter((p): p is typeof players[number] => !!p)
          : []
        const tournamentDef = selectedMatchForPopup.tournamentId
          ? FULL_TOURNAMENT_CALENDAR.find(t =>
            selectedMatchForPopup.tournamentId === t.id || selectedMatchForPopup.tournamentId?.startsWith(`${t.id}_`)
          )
          : null

        return (
          <TeamMatchPopup
            isOpen={!!selectedMatchForPopup}
            onClose={() => setSelectedMatchForPopup(null)}
            match={selectedMatchForPopup as any}
            opponent={opponent as any}
            opponentRoster={opponentRoster as any}
            playerTeam={playerTeam as any}
            tournamentName={tournamentDef?.name}
            stage={selectedMatchForPopup.stage || undefined}
            currentWeek={currentWeek}
            completedMatches={completedMatches}
            playerTeamId={playerTeamId ?? undefined}
            isDue={isMatchDue(selectedMatchForPopup)}
            dateLabel={dayLabel(selectedMatchForPopup.week, selectedMatchForPopup.day ?? 6)}
          />
        )
      })()}
    </div>
  )
}
