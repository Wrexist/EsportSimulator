"use client"

import React, { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useGameStore } from "@/store/game-store"
import { motion, AnimatePresence } from "framer-motion"
import {
  Calendar as CalendarIcon,
  ChevronRight,
  ChevronLeft,
  Trophy,
  Swords,
  Plane,
  Briefcase,
  Clock,
  Plus,
  Lock
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getDynamicTournamentName } from "@/lib/utils-extended"
import { Badge } from "@/components/ui/badge"
import { BookScrimModal } from "@/components/schedule/BookScrimModal"
import { BookBootcampModal } from "@/components/schedule/BookBootcampModal"
import { BookMarketingModal } from "@/components/schedule/BookMarketingModal"
import { ActivityPickerModal } from "@/components/schedule/ActivityPickerModal"
import { TournamentDetailsModal } from "@/components/schedule/TournamentDetailsModal"
import { ScheduleMatchCard } from "@/components/schedule/ScheduleMatchCard"
import { ScheduleActivityCard } from "@/components/schedule/ScheduleActivityCard"
import { TeamMatchPopup } from "@/components/schedule/TeamMatchPopup"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import {
  FULL_TOURNAMENT_CALENDAR,
  getTierColor,
  getTierBgColor,
  formatPrizePool,
  TournamentDefinition
} from "@/data/tournament-calendar"

const WEEKS_PER_YEAR = 52
const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]

// Helper for projected matches type
interface ProjectedMatch {
  id: string
  week: number
  stage: string
  tournamentName: string
  tournamentId: string
  reason?: string
}

export default function SchedulePage() {
  const {
    currentWeek,
    currentDay,
    timeMode,
    scheduledMatches,
    completedMatches,
    scheduledActivities,
    eventsLog,
    isLoading,
    gameStartDate,
    teams,
    players,
    playerTeamId,
    tournamentQualifications,
    tournaments
  } = useGameStore()
  const router = useRouter()
  const [viewOffset, setViewOffset] = useState(0)

  // Modal States
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [isScrimModalOpen, setIsScrimModalOpen] = useState(false)
  const [isBootcampModalOpen, setIsBootcampModal] = useState(false)
  const [isMarketingModalOpen, setIsMarketingModalOpen] = useState(false)
  const [selectedWeek, setSelectedWeek] = useState<number>(currentWeek)
  const [selectedDay, setSelectedDay] = useState<number>(0)

  // Tournament Modal State
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null)

  // Match Popup State
  const [selectedMatchForPopup, setSelectedMatchForPopup] = useState<typeof scheduledMatches[0] | null>(null)

  const selectedTournament = selectedTournamentId
    ? FULL_TOURNAMENT_CALENDAR.find(t => t.id === selectedTournamentId)
    : null

  // Helper to get user's status for a tournament
  const getTournamentStatus = (tournamentId: string) => {
    const targetSeriesId = tournamentId.replace(/_s\d+$/, "")
    return tournamentQualifications.find(q => {
      if (q.teamId !== playerTeamId) return false
      const rowSeriesId = (q.seriesId || q.tournamentId).replace(/_s\d+$/, "")
      return rowSeriesId === targetSeriesId
    })?.status
  }

  const containerRef = useRef<HTMLDivElement>(null)

  // Render range: Always render up to currentWeek + 52 (next year view)
  // But strictly, we should maintain history too.
  // Let's render from Week 1 to currentWeek + 52.
  const TOTAL_WEEKS_TO_RENDER = Math.max(WEEKS_PER_YEAR * 2, currentWeek + 52)

  // Center view on current week initially
  useEffect(() => {
    const targetOffset = Math.max(0, currentWeek - 1)
    setViewOffset(targetOffset)
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
    if (type === "MEETING") {
      router.push("/schedule/staff-meeting")
    }
  }

  const handleOpenTournament = (tournamentId: string) => {
    setSelectedTournamentId(tournamentId)
  }

  const getDateForDay = (week: number, dayIndex: number) => {
    const start = new Date(gameStartDate)
    const weekDays = (week - 1) * 7
    const totalDays = weekDays + dayIndex
    const date = new Date(start)
    date.setDate(date.getDate() + totalDays)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  // Get the player's team
  const playerTeam = teams.find(t => t.id === playerTeamId)

  // Region to flag emoji mapping
  const regionToFlag = (region?: string): string => {
    const flags: Record<string, string> = {
      "EU": "🇪🇺",
      "NA": "🇺🇸",
      "SA": "🇧🇷",
      "CIS": "🇷🇺",
      "ASIA": "🇨🇳",
      "OCEANIA": "🇦🇺",
      "MENA": "🇸🇦",
      "INTERNATIONAL": "🌍"
    }
    return flags[region || ""] || "🌍"
  }

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
          stage: match.stage || instance.currentStage || "Next Stage",
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
          stage: instance.currentStage || "Upcoming Stage",
          reason: "Forecast"
        })
      }
    })

    return projected
      .sort((a, b) => (a.week - b.week) || a.id.localeCompare(b.id))
      .slice(0, 60)
  }

  const projectedMatches = getProjectedMatches()

  // Upcoming registered tournaments (not yet started this season)
  const currentCalendarWeek = (currentWeek - 1) % WEEKS_PER_YEAR + 1
  const upcomingRegisteredTournaments = FULL_TOURNAMENT_CALENDAR.filter(t => {
    const status = getTournamentStatus(t.id)
    if (!(status === "QUALIFIED" || status === "REGISTERED" || status === "INVITED")) return false
    return t.startWeek > currentCalendarWeek
  }).sort((a, b) => a.startWeek - b.startWeek)

  // Calculate current year/week for display
  const currentYear = Math.ceil(currentWeek / WEEKS_PER_YEAR)
  const currentWeekInYear = (currentWeek - 1) % WEEKS_PER_YEAR + 1
  const currentDayLabel = DAYS[Math.max(0, Math.min(6, currentDay))] || `DAY ${currentDay + 1}`


  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-end shrink-0">
        <div className="flex items-center gap-6">
          {/* Team Logo & Info */}
          {playerTeam && (
            <div className="flex items-center gap-4">
              {/* Team Logo */}
              <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
                <TeamLogoDisplay team={playerTeam} size={48} />
              </div>

              {/* Team Name & Region */}
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{regionToFlag(playerTeam.region)}</span>
                  <h2 className="text-xl font-normal uppercase tracking-tight text-white">{playerTeam.name}</h2>
                </div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">
                  {playerTeam.region || "INTERNATIONAL"} • #{playerTeam.worldRanking || "—"}
                </p>
              </div>
            </div>
          )}

          <div className="h-12 w-px bg-white/10" />

          <div>
            <h1 className="text-4xl font-normal uppercase tracking-tighter liquid-text mb-2 flex items-center gap-3">
              <CalendarIcon className="text-primary" size={32} />
              Schedule
            </h1>
            <p className="text-muted-foreground uppercase tracking-widest text-xs font-bold">
              Year {currentYear} | Week {currentWeekInYear}{timeMode === "HYBRID_DAILY" ? ` | ${currentDayLabel} (Day ${currentDay + 1}/7)` : ""}
            </p>
          </div>
        </div>

      </div>

      {/* Upcoming Registered Tournaments Banner */}
      {upcomingRegisteredTournaments.length > 0 && (
        <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-500/5 border border-amber-500/15">
          <Trophy size={16} className="text-amber-400 shrink-0" />
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-amber-300 uppercase tracking-wider font-bold">Upcoming:</span>
            {upcomingRegisteredTournaments.slice(0, 3).map(t => {
              const weeksUntil = t.startWeek - currentCalendarWeek
              return (
                <button
                  key={t.id}
                  onClick={() => handleOpenTournament(t.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 hover:bg-amber-500/10 hover:border-amber-500/30 transition-all text-xs"
                >
                  <span className="text-white/80 font-medium">{t.shortName}</span>
                  <span className="bg-amber-500/20 text-amber-300 text-[9px] font-bold px-1.5 py-0.5 rounded">
                    W{t.startWeek} ({weeksUntil}w)
                  </span>
                </button>
              )
            })}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const firstTournament = upcomingRegisteredTournaments[0]
              const yearOffset = Math.floor((currentWeek - 1) / WEEKS_PER_YEAR) * WEEKS_PER_YEAR
              setViewOffset(Math.max(0, firstTournament.startWeek - 1 + yearOffset))
            }}
            className="text-[10px] text-amber-400 hover:text-amber-300 uppercase tracking-wider ml-auto px-2 h-7"
          >
            Jump to Next <ChevronRight size={12} />
          </Button>
        </div>
      )}

      {/* Roster Warning */}
      {playerTeam && (playerTeam.rosterIds?.length || 0) < 5 && (
        <div className="shrink-0 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
          <Clock size={16} className="text-amber-400 shrink-0" />
          <p className="text-sm text-amber-200/80">
            You need at least <strong className="text-amber-300">5 players</strong> to compete in matches.
            {" "}
            <button
              className="underline text-amber-300 hover:text-amber-200 transition-colors"
              onClick={() => router.push("/transfers")}
            >
              Go to Transfers
            </button>
          </p>
        </div>
      )}

      {/* Main Timeline Area with External Controls */}
      <div className="flex-1 flex items-center gap-4">
        {/* Left Arrow */}
        <div className="shrink-0 z-30">
          <Button
            size="icon"
            variant="outline"
            aria-label="Previous week"
            onClick={() => setViewOffset(Math.max(0, viewOffset - 1))}
            disabled={viewOffset <= 0}
            className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors shadow-xl"
          >
            <ChevronLeft size={24} />
          </Button>
        </div>

        {/* Timeline Container */}
        <div className="flex-1 glass-panel border-white/5 relative overflow-hidden flex flex-col p-0 h-full">
          {/* Timeline Grid */}
          <div className="flex-1 flex overflow-x-hidden relative h-full" ref={containerRef}>
            <motion.div
              className="flex h-full"
              animate={{ x: -viewOffset * 320 }} // Wider columns for detailed view
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              {Array.from({ length: TOTAL_WEEKS_TO_RENDER }).map((_, idx) => {
                const weekNum = idx + 1

                // Virtualization: only render weeks within viewport window
                const RENDER_BUFFER = 4
                if (idx < viewOffset - RENDER_BUFFER || idx > viewOffset + RENDER_BUFFER) {
                  return <div key={weekNum} className="flex-shrink-0" style={{ width: 320 }} />
                }

                const isPast = weekNum < currentWeek
                const isCurrent = weekNum === currentWeek

                // Display Logic
                const displayYear = Math.ceil(weekNum / WEEKS_PER_YEAR)
                const displayWeek = (weekNum - 1) % WEEKS_PER_YEAR + 1

                // Get events/activities for this week (Filter from both scheduled and completed)
                // Deduplicate: completed matches take precedence over scheduled
                const completedIds = new Set(completedMatches.map(m => m.id))
                const uniqueScheduled = scheduledMatches.filter(m => !completedIds.has(m.id))
                const matches = [...uniqueScheduled, ...completedMatches].filter(m =>
                  m.week === weekNum &&
                  (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
                )

                const projected = projectedMatches.filter(p => p.week === weekNum)

                // Active tournaments for this week
                // FIX: Tournament Calendar is static 1-52.
                // We need to map future years back to 1-52 cycle for static definitions
                const calendarWeek = (weekNum - 1) % WEEKS_PER_YEAR + 1

                const activeTournaments = FULL_TOURNAMENT_CALENDAR.filter(t =>
                  calendarWeek >= t.startWeek && calendarWeek < t.startWeek + t.duration
                )

                // Filter for tournaments the USER is participating in
                const participatingTournaments = activeTournaments.filter(t => {
                  const status = getTournamentStatus(t.id)
                  // Also check if we have any matches for this tournament ID (including seasonal variants)
                  const seasonalIdPattern = new RegExp(`^${t.id}_s\\d+$`)
                  const hasMatches = scheduledMatches.some(m =>
                    (m.tournamentId === t.id || (m.tournamentId && seasonalIdPattern.test(m.tournamentId))) &&
                    (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
                  )

                  return status === "QUALIFIED" || status === "REGISTERED" || status === "INVITED" || hasMatches
                })

                // Upcoming tournament indicators (within 4 weeks before start)
                const upcomingTournamentIndicators = participatingTournaments.length === 0
                  ? FULL_TOURNAMENT_CALENDAR.filter(t => {
                      const status = getTournamentStatus(t.id)
                      if (!(status === "QUALIFIED" || status === "REGISTERED" || status === "INVITED")) return false
                      const weeksUntilStart = t.startWeek - calendarWeek
                      return weeksUntilStart > 0 && weeksUntilStart <= 4
                    })
                  : []

                // Check for week-long activities (Bootcamps/Travel)
                const weekActivity = (scheduledActivities || []).find(a =>
                  weekNum >= a.week && weekNum < a.week + a.duration &&
                  (a.type === "BOOTCAMP" || a.type === "TRAVEL" || a.type === "REST")
                )

                return (
                  <div
                    key={weekNum}
                    className={cn(
                      "w-[320px] h-full border-r border-white/5 flex flex-col relative shrink-0 transition-colors",
                      isCurrent ? "bg-primary/5" : isPast ? "bg-black/40" : ""
                    )}
                  >
                    {/* Current Week Pulse Animation */}
                    {isCurrent && (
                      <motion.div
                        className="absolute inset-0 border-2 border-primary/20 rounded-lg pointer-events-none z-10"
                        animate={{
                          borderColor: ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.3)', 'rgba(255,255,255,0.1)']
                        }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                      />
                    )}
                    {/* Week Header - Fixed Height for Alignment */}
                    <div className={cn(
                      "h-[80px] p-3 border-b border-white/5 transition-colors relative z-10 shrink-0 flex flex-col",
                      participatingTournaments.length > 0
                        ? "bg-gradient-to-b from-amber-500/15 via-amber-500/5 to-transparent border-amber-500/30 shadow-lg shadow-amber-500/5"
                        : upcomingTournamentIndicators.length > 0
                          ? "bg-gradient-to-b from-amber-500/5 via-transparent to-transparent border-amber-500/10"
                          : isCurrent ? "bg-primary/20 border-primary/30" : "bg-black/20"
                    )}>
                      <div className="flex items-center justify-center gap-2">
                        <span className={cn(
                          "text-sm font-normal uppercase tracking-widest text-center",
                          participatingTournaments.length > 0 ? "text-amber-300" : isCurrent ? "text-primary" : "text-muted-foreground"
                        )}>
                          Week {displayWeek} <span className="text-[9px] opacity-50 ml-1">Y{displayYear}</span>
                        </span>
                        {isCurrent && (
                          <Badge className="bg-primary text-black text-[8px] font-normal uppercase h-4 px-1">
                            CURRENT
                          </Badge>
                        )}
                      </div>

                      {/* Tournament Indicator in Header */}
                      <div className="flex-1 flex flex-col justify-center mt-1">
                        {participatingTournaments.length > 0 ? (
                          participatingTournaments.slice(0, 1).map(t => {
                            const tierColors: Record<string, string> = {
                              "S_TIER": "from-amber-500/30 to-amber-600/20 border-amber-400/40 text-amber-200",
                              "A_TIER": "from-violet-500/30 to-violet-600/20 border-violet-400/40 text-violet-200",
                              "B_TIER": "from-cyan-500/30 to-cyan-600/20 border-cyan-400/40 text-cyan-200",
                              "C_TIER": "from-emerald-500/30 to-emerald-600/20 border-emerald-400/40 text-emerald-200",
                            }
                            const colorClass = tierColors[t.tier] || tierColors["C_TIER"]
                            return (
                              <button
                                key={t.id}
                                onClick={() => handleOpenTournament(t.id)}
                                className={cn(
                                  "w-full text-[10px] uppercase font-normal px-2 py-1.5 rounded-lg",
                                  "bg-gradient-to-r border shadow-lg",
                                  "hover:scale-[1.02] hover:shadow-xl transition-all",
                                  "flex items-center justify-between gap-2",
                                  colorClass
                                )}
                              >
                                <span className="truncate">{t.shortName}</span>
                                <Trophy size={12} className="shrink-0 opacity-80" />
                              </button>
                            )
                          })
                        ) : upcomingTournamentIndicators.length > 0 ? (
                          upcomingTournamentIndicators.slice(0, 1).map(t => {
                            const weeksUntil = t.startWeek - calendarWeek
                            return (
                              <button
                                key={t.id}
                                onClick={() => handleOpenTournament(t.id)}
                                className="w-full text-[10px] uppercase font-normal px-2 py-1.5 rounded-lg bg-white/5 border border-dashed border-white/15 hover:border-amber-500/30 hover:bg-amber-500/5 transition-all flex items-center justify-between gap-2 text-white/40"
                              >
                                <span className="truncate">{t.shortName} in {weeksUntil}w</span>
                                <Clock size={10} className="shrink-0 opacity-50" />
                              </button>
                            )
                          })
                        ) : (
                          <div className="h-6" /> /* Spacer for alignment */
                        )}
                      </div>
                    </div>

                    {/* Daily Grid */}
                    <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar relative">

                      {/* Tournament Background Overlay with Shimmer (if active) */}
                      {participatingTournaments.length > 0 && (
                        <>
                          <div className="absolute inset-0 bg-gradient-to-b from-amber-500/[0.03] via-transparent to-transparent pointer-events-none" />
                          <div className="absolute inset-0 animate-schedule-shimmer pointer-events-none" />
                        </>
                      )}

                      {/* Activity Overlay */}
                      {weekActivity && (
                        <div className="absolute inset-0 z-20 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-center border-l-4 border-orange-500">
                          <Plane size={32} className="text-orange-400 mb-2" />
                          <h3 className="text-lg font-normal uppercase text-white mb-1">{weekActivity.type}</h3>
                          <div className="text-xs uppercase tracking-wider font-bold text-orange-400 mb-4">{weekActivity.name}</div>
                          <p className="text-xs text-white/60">Team is currently away provided focused training.</p>
                        </div>
                      )}

                      {DAYS.map((dayName, dayIndex) => {
                        const dayDate = getDateForDay(weekNum, dayIndex)

                        // Find matches for this specific day
                        // Fallback: If match has no day (legacy), assign based on match index
                        const dayMatches = matches.filter((m, idx) => {
                          if (m.day !== undefined) return m.day === dayIndex
                          // Legacy fallback: Distribute matches without day evenly
                          if (m.isScrim) {
                            // Scrims default to Wednesday (2) or Thursday (3)
                            const scrimDay = idx % 2 === 0 ? 3 : 4
                            return dayIndex === scrimDay
                          }
                          // Tournament/league matches: Distribute across Sat/Sun based on index
                          const matchDayOffset = idx % 2 === 0 ? 5 : 6 // Alternate Sat/Sun
                          return dayIndex === matchDayOffset
                        })

                        // Check for projected match on this day (Default to Saturday if no real matches)
                        const dayProjected = projected.filter(p => {
                          // Very simple logic: put projected matches on Saturday if no real matches
                          return dayIndex === 5 && dayMatches.length === 0
                        })

                        // Find specific activities for this day
                        const dayActivities = (scheduledActivities || []).filter(a =>
                          a.week === weekNum && a.day === dayIndex && a.duration === 0
                        )

                        const isPastDayInCurrentWeek =
                          timeMode === "HYBRID_DAILY" &&
                          isCurrent &&
                          dayIndex < currentDay

                        const isTodayInCurrentWeek =
                          timeMode === "HYBRID_DAILY" &&
                          isCurrent &&
                          dayIndex === currentDay

                        const hasMatchOrActivity = dayMatches.length > 0 || dayProjected.length > 0 || dayActivities.length > 0
                        const hasItems = hasMatchOrActivity

                        const primaryMatch = dayMatches[0]
                        const isScrimDay = primaryMatch?.isScrim
                        const isMatchDay = primaryMatch && !primaryMatch.isScrim
                        const isTournamentWeek = participatingTournaments.length > 0
                        const isBusyDay = isTournamentWeek || weekActivity

                        return (
                          <div key={dayName} className={cn(
                            "border-b border-white/5 flex group/day transition-all",
                            "min-h-[56px]",
                            isPastDayInCurrentWeek && "opacity-70",
                            isTodayInCurrentWeek && "bg-primary/[0.06] border-primary/20",
                            isTournamentWeek ? "bg-amber-500/[0.03]" :
                              isScrimDay ? "bg-purple-500/5 border-purple-500/10" :
                                isMatchDay ? "bg-emerald-500/5 border-emerald-500/10" :
                                  isCurrent && !isPast ? "hover:bg-white/5" : ""
                          )}>
                            {/* Day Label Column */}
                            <div className={cn(
                              "w-[60px] border-r border-white/5 py-3 px-2 flex flex-col items-center justify-center transition-colors",
                              isTournamentWeek ? "bg-amber-500/10 text-amber-200" :
                                isScrimDay ? "bg-purple-500/10 text-purple-200" :
                                  isMatchDay ? "bg-emerald-500/10 text-emerald-200" :
                                    "bg-black/20"
                            )}>
                              <span className={cn(
                                "text-xs font-semibold uppercase tracking-wider",
                                hasMatchOrActivity ? "text-white" : "text-muted-foreground"
                              )}>{dayName}</span>
                              <span className={cn(
                                "text-xs tabular-nums mt-0.5",
                                hasMatchOrActivity ? "text-white/70" : "text-white/30"
                              )}>{dayDate.split(" ")[1]}</span>
                              {isPastDayInCurrentWeek && (
                                <Lock size={11} className="text-white/40 mt-1" />
                              )}
                              {isTodayInCurrentWeek && (
                                <Badge className="mt-1 h-4 px-1 text-[8px] font-bold uppercase tracking-wide bg-primary text-black">
                                  TODAY
                                </Badge>
                              )}
                            </div>

                            {/* Content Column */}
                            <div className="flex-1 p-2 relative flex flex-col justify-center">
                              {/* Booking button - Allow on all empty non-past days */}
                              {!hasItems && !isPast && !weekActivity && !isPastDayInCurrentWeek && (
                                <div className="absolute inset-0 opacity-0 group-hover/day:opacity-100 flex items-center justify-center pointer-events-none p-2 transition-all duration-300 z-30">
                                  <button
                                    onClick={() => handleOpenPicker(weekNum, dayIndex)}
                                    className="pointer-events-auto w-full h-full rounded-lg border border-dashed border-white/10 hover:border-primary/50 bg-black/20 hover:bg-primary/5 text-muted-foreground hover:text-primary flex flex-col items-center justify-center gap-2 transition-all duration-300 group/btn"
                                  >
                                    <div className="w-8 h-8 rounded-full bg-white/5 group-hover/btn:bg-primary/20 flex items-center justify-center transition-colors">
                                      <Plus size={16} className="opacity-50 group-hover/btn:opacity-100 transition-all" />
                                    </div>
                                    <span className="text-[9px] uppercase tracking-widest font-bold opacity-0 group-hover/btn:opacity-100 transform translate-y-2 group-hover/btn:translate-y-0 transition-all">
                                      Add Event
                                    </span>
                                  </button>
                                </div>
                              )}

                              <div className="flex flex-col gap-1.5">
                                {dayMatches.map((match, matchIndex) => {
                                  // Look up tournament name from calendar
                                  const tournamentDef = match.tournamentId
                                    ? FULL_TOURNAMENT_CALENDAR.find(t =>
                                      match.tournamentId === t.id || match.tournamentId?.startsWith(`${t.id}_`)
                                    )
                                    : null

                                  const isLockedByDay =
                                    timeMode === "HYBRID_DAILY" &&
                                    isCurrent &&
                                    (match.day ?? dayIndex) > currentDay &&
                                    !match.result

                                  return (
                                    <motion.div
                                      key={match.id}
                                      initial={{ opacity: 0, x: -10 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: matchIndex * 0.05, duration: 0.2 }}
                                    >
                                      <ScheduleMatchCard
                                        match={match as any}
                                        teams={teams as any}
                                        playerTeamId={playerTeamId || ""}
                                        isScrim={match.isScrim}
                                        tournamentName={tournamentDef ? getDynamicTournamentName(tournamentDef.shortName || tournamentDef.name, currentWeek) : undefined}
                                        isCurrentWeek={isCurrent}
                                        isLocked={isLockedByDay}
                                        onClick={() => {
                                          if (isLockedByDay) return
                                          // Open popup if match is not yet played, otherwise navigate to result
                                          if (!match.result && !match.isScrim) {
                                            setSelectedMatchForPopup(match)
                                          }
                                        }}
                                      />
                                    </motion.div>
                                  )
                                })}

                                {dayActivities.map((activity, actIndex) => (
                                  <motion.div
                                    key={activity.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: (dayMatches.length + actIndex) * 0.05, duration: 0.2 }}
                                  >
                                    <ScheduleActivityCard activity={activity} />
                                  </motion.div>
                                ))}

                                {dayProjected.map((proj, projIndex) => (
                                  <motion.div
                                    key={proj.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: (dayMatches.length + dayActivities.length + projIndex) * 0.05, duration: 0.2 }}
                                  >
                                    <ScheduleMatchCard
                                      teams={teams as any}
                                      playerTeamId={playerTeamId || ""}
                                      projected={{
                                        stage: proj.stage,
                                        tournamentName: proj.tournamentName,
                                        tournamentId: proj.tournamentId,
                                        week: proj.week,
                                        reason: proj.reason
                                      }}
                                    />
                                  </motion.div>
                                ))}

                                {/* Tournament Banner for context if no matches but tournament active */}
                                {!hasItems && participatingTournaments.length > 0 && dayIndex === 6 && (
                                  <div className="text-[9px] text-center text-muted-foreground uppercase tracking-widest opacity-50 py-2">
                                    {participatingTournaments[0].shortName} Week
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </motion.div>
          </div>
        </div>

        {/* Right Arrow */}
        <div className="shrink-0 z-30">
          <Button
            size="icon"
            variant="outline"
            aria-label="Next week"
            onClick={() => setViewOffset(Math.min(TOTAL_WEEKS_TO_RENDER - 1, viewOffset + 1))}
            disabled={viewOffset >= TOTAL_WEEKS_TO_RENDER - 1}
            className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors shadow-xl"
          >
            <ChevronRight size={24} />
          </Button>
        </div>
      </div>

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

      {/* Match Popup */}
      {selectedMatchForPopup && (() => {
        const opponentId = selectedMatchForPopup.homeTeamId === playerTeamId
          ? selectedMatchForPopup.awayTeamId
          : selectedMatchForPopup.homeTeamId
        const opponent = teams.find(t => t.id === opponentId)
        const opponentRoster = opponent
          ? players.filter(p => opponent.rosterIds?.includes(p.id))
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
          />
        )
      })()}
    </div>
  )
}


