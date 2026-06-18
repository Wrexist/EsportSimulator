"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { NewsFeed } from "@/components/dashboard/NewsFeed"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingState } from "@/components/ui/loading"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { SeasonObjectives } from "@/components/dashboard/SeasonObjectives"
import { ActionCenter } from "@/components/dashboard/ActionCenter"
import { GettingStartedChecklist } from "@/components/dashboard/GettingStartedChecklist"
import { WeeklyFocusWidget } from "@/components/dashboard/WeeklyFocusWidget"
import { Calendar, Trophy, TrendingUp, ArrowRight, Zap, Loader2, Wallet, ArrowUpCircle, ArrowDownCircle, Swords, HelpCircle, Skull, DoorOpen } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils-extended"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { FULL_TOURNAMENT_CALENDAR, getTierColor, getTierBgColor } from "@/data/tournament-calendar"
import dynamic from "next/dynamic"
const SeasonRecapModal = dynamic(() => import("@/components/celebration/SeasonRecapModal").then(m => m.SeasonRecapModal), { ssr: false })
const ProAwardsModal = dynamic(() => import("@/components/celebration/ProAwardsModal").then(m => m.ProAwardsModal), { ssr: false })
import { EconomyEngine } from "@/engine/economy-engine"
import { soundManager } from "@/lib/sound-manager"
import type { AnnualAwards } from "@/engine/pro-awards-engine"

export default function Page() {
  const router = useRouter()

  // Consolidated data selectors (single subscription, shallow equality)
  const {
    isInitialized, playerTeamId, teams, players, contracts,
    scheduledMatches, completedMatches, currentWeek, currentDay,
    timeMode, _hasHydrated, saveId, pendingSeasonRecap,
    gameOverReason, gameOverWeek, tournamentQualifications,
    financeLedger, staff, storeLoading,
  } = useGameStore(useShallow(s => ({
    isInitialized: s.isInitialized,
    playerTeamId: s.playerTeamId,
    teams: s.teams,
    players: s.players,
    contracts: s.contracts,
    scheduledMatches: s.scheduledMatches,
    completedMatches: s.completedMatches,
    currentWeek: s.currentWeek,
    currentDay: s.currentDay,
    timeMode: s.timeMode,
    _hasHydrated: s._hasHydrated,
    saveId: s.saveId,
    pendingSeasonRecap: s.pendingSeasonRecap,
    gameOverReason: s.gameOverReason,
    gameOverWeek: s.gameOverWeek,
    tournamentQualifications: s.tournamentQualifications,
    financeLedger: s.financeLedger,
    staff: s.staff,
    storeLoading: s.isLoading,
  })))

  // Separate selector for eventsLog to avoid excessive re-renders from the shallow comparison
  const eventsLog = useGameStore(s => s.eventsLog)

  // Actions are stable references — separate selector avoids re-renders from data changes
  const simulateInstantMatch = useGameStore(s => s.simulateInstantMatch)
  const clearPendingSeasonRecap = useGameStore(s => s.clearPendingSeasonRecap)
  const acknowledgeEvent = useGameStore(s => s.acknowledgeEvent)
  const boardState = useGameStore(s => s.boardState)

  // The annual Pro/Player-of-the-Year ceremony — auto-open it once so the
  // reveal isn't missed (it used to require noticing + clicking a banner).
  const proShownRef = useRef<string | null>(null)

  const [isSimulating, setIsSimulating] = useState(false)

  // Pro Awards Modal State
  const [proAwards, setProAwards] = useState<AnnualAwards | null>(null)
  const [isProModalOpen, setIsProModalOpen] = useState(false)

  // Detect unacknowledged Pro award events
  const latestProEvent = useMemo(() => {
    return (eventsLog ?? []).find(e =>
      e.type === "MEDIA" && (e.data as any)?.proAwards && !e.acknowledged
    )
  }, [eventsLog])

  // Auto-open the ceremony the first time a new awards event surfaces.
  useEffect(() => {
    if (!latestProEvent || proShownRef.current === latestProEvent.id) return
    const awards = (latestProEvent.data as any)?.proAwards
    if (awards && Array.isArray(awards.top20) && awards.year) {
      proShownRef.current = latestProEvent.id
      setProAwards(awards as AnnualAwards)
      setIsProModalOpen(true)
    }
  }, [latestProEvent])

  // Robust session check: isInitialized is the primary flag, 
  // but we also check if we have teams and a playerTeamId as a fallback.
  const isSessionActive = isInitialized || (teams.length > 0 && !!playerTeamId)

  useEffect(() => {
    if (_hasHydrated && !isSessionActive && !storeLoading) {
      router.push('/main-menu')
    }
  }, [_hasHydrated, isSessionActive, storeLoading, router])

  const playerTeam = useMemo(() => teams.find(t => t.id === playerTeamId), [teams, playerTeamId])

  // Derived team rating (avg roster skill) — a visible power number so the
  // team-building loop has felt momentum (AUDIT_UX_2026-06 C6).
  const teamRating = useMemo(() => {
    if (!playerTeam) return 0
    const roster = players.filter(p => playerTeam.rosterIds.includes(p.id))
    if (roster.length === 0) return 0
    return Math.round(roster.reduce((s, p) => s + (p.skill || 0), 0) / roster.length)
  }, [playerTeam, players])

  const nextMatch = useMemo(() => {
    return scheduledMatches
      .filter(m => m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
      .sort((a, b) => {
        if (a.week !== b.week) return a.week - b.week
        return (a.day ?? 6) - (b.day ?? 6)
      })[0]
  }, [scheduledMatches, playerTeamId])

  const tournament = useMemo(() => {
    if (!nextMatch) return null
    return FULL_TOURNAMENT_CALENDAR.find(t => t.id === nextMatch.tournamentId || t.id === nextMatch.tournamentId?.split('_s')[0])
  }, [nextMatch])

  const isMatchLive = !!nextMatch
    && nextMatch.week === currentWeek
    && (timeMode === "WEEKLY" || (nextMatch.day ?? 6) <= currentDay)

  // Upcoming tournaments where we're registered but matches haven't been drawn yet
  const upcomingTournaments = useMemo(() => {
    if (nextMatch) return [] // Don't need this if we already have a concrete match
    const currentCalendarWeek = ((currentWeek - 1) % 52) + 1
    return tournamentQualifications
      .filter(q => q.teamId === playerTeamId && (q.status === "QUALIFIED" || q.status === "REGISTERED" || q.status === "INVITED"))
      .map(q => {
        const seriesId = q.seriesId || q.tournamentId.replace(/_s\d+$/, "")
        return FULL_TOURNAMENT_CALENDAR.find(t => t.id === seriesId)
      })
      .filter((t): t is NonNullable<typeof t> => !!t && t.startWeek > currentCalendarWeek)
      .sort((a, b) => a.startWeek - b.startWeek)
      .slice(0, 2)
      .map(t => {
        const weeksUntil = t.startWeek - currentCalendarWeek
        return { ...t, weeksUntil }
      })
  }, [nextMatch, tournamentQualifications, playerTeamId, currentWeek])

  // Financial Calculations - use the full EconomyEngine for accurate income/expense data
  const financialReport = useMemo(() => {
    if (!playerTeam) return null
    return EconomyEngine.processWeeklyFinances(playerTeam, players, contracts, staff)
  }, [playerTeam, players, contracts, staff])

  const financialData = useMemo(() => {
    if (!financialReport || !playerTeam) return { budget: 0, expenses: 0, net: 0, income: 0, salaries: 0, facilities: 0, staffWages: 0 }
    return {
      budget: playerTeam.budget,
      expenses: financialReport.expenses.total,
      income: financialReport.income.total,
      net: financialReport.net,
      salaries: financialReport.expenses.playerWages,
      facilities: financialReport.expenses.facilities,
      staffWages: financialReport.expenses.staffWages
    }
  }, [financialReport, playerTeam])

  const seasonRecapStats = useMemo(() => {
    if (!playerTeam || !pendingSeasonRecap) return null
    const yearMatches = completedMatches.filter(m => m.week > (currentWeek - 53) && m.week < currentWeek)
    const wins = yearMatches.filter(m => m.result.winnerId === playerTeamId).length
    const losses = yearMatches.length - wins
    const trophies = playerTeam.trophies?.filter(t => t.week > (currentWeek - 53)).length || 0

    // Find best player by avg rating in last year
    const roster = players.filter(p => playerTeam.rosterIds.includes(p.id))
    const bestPlayer = [...roster].sort((a, b) => (b.avgRating || 0) - (a.avgRating || 0))[0] || null

    return {
      wins,
      losses,
      trophies,
      budgetGrowth: (() => {
        const seasonLedger = (financeLedger || []).filter(
          (e: any) => e.teamId === playerTeamId && e.week > (currentWeek - 53) && e.week <= currentWeek
        )
        const income = seasonLedger.filter((e: any) => e.type === "INCOME").reduce((s: number, e: any) => s + e.amount, 0)
        const expenses = seasonLedger.filter((e: any) => e.type === "EXPENSE").reduce((s: number, e: any) => s + e.amount, 0)
        return income - expenses
      })(),
      bestPlayer: bestPlayer ? {
        nickname: bestPlayer.nickname,
        portraitPath: bestPlayer.portraitPath,
        rating: bestPlayer.avgRating || 0
      } : null
    }
  }, [playerTeam, completedMatches, currentWeek, players, playerTeamId, pendingSeasonRecap, financeLedger])

  const handleSimulate = async () => {
    if (!nextMatch) return
    setIsSimulating(true)
    soundManager.play('matchStart')
    try {
      // Dashboard Quick-Sim skips the match-day prep flow → small differential (B4).
      await simulateInstantMatch(nextMatch.id, { skippedPrep: true })
      router.push(`/match/${nextMatch.id}/result`)
    } finally {
      setIsSimulating(false)
    }
  }


  if (!_hasHydrated || (storeLoading && !isSessionActive)) {
    return (
      <LoadingState message="Loading Game Session…" size="lg" fullScreen />
    )
  }

  // If still not active after hydration, we'll be redirected by useEffect, but show nothing for now
  if (!isSessionActive) return null

  // Game Over overlay
  if (gameOverReason) {
    const weeksPlayed = gameOverWeek ?? currentWeek
    const seasonsPlayed = Math.floor((weeksPlayed - 1) / 52) + 1
    const totalTrophies = playerTeam?.trophies?.length ?? 0
    const isSacked = gameOverReason === "SACKED"
    return (
      <div className="min-h-[80vh] flex items-center justify-center animate-in fade-in duration-1000">
        <div className="max-w-lg w-full text-center space-y-8">
          <div className="mx-auto w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/30">
            {isSacked ? <DoorOpen className="w-10 h-10 text-red-500" /> : <Skull className="w-10 h-10 text-red-500" />}
          </div>
          <div>
            <h1 className="text-4xl font-bold tracking-tight uppercase text-red-400 mb-2">
              {isSacked ? "Relieved of Duty" : "Organization Dissolved"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {isSacked
                ? `After consecutive seasons below the board's expectations, ${playerTeam?.name ?? "your club"} has terminated your contract.`
                : `After 8 consecutive weeks of insolvency, ${playerTeam?.name ?? "your team"} has been forced to disband.`}
            </p>
          </div>
          <Card className="bg-white/[0.02] border-white/5">
            <CardContent className="pt-6 space-y-3">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Seasons Managed</span><span className="text-white font-mono">{seasonsPlayed}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Weeks Survived</span><span className="text-white font-mono">{weeksPlayed}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Trophies Won</span><span className="text-white font-mono">{totalTrophies}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Final Ranking</span><span className="text-white font-mono">#{playerTeam?.worldRanking ?? "—"}</span></div>
            </CardContent>
          </Card>
          <div className="flex gap-4 justify-center">
            <Button variant="outline" onClick={() => router.push("/load-game")} className="uppercase tracking-wider">
              Load Save
            </Button>
            <Button variant="destructive" onClick={() => router.push("/main-menu")} className="uppercase tracking-wider">
              Main Menu
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {seasonRecapStats && (
        <SeasonRecapModal
          isOpen={!!pendingSeasonRecap}
          onClose={clearPendingSeasonRecap}
          year={pendingSeasonRecap || 0}
          stats={seasonRecapStats}
        />
      )}
      <ProAwardsModal
        isOpen={isProModalOpen}
        onClose={() => {
          setIsProModalOpen(false)
          // Acknowledge so the banner clears and the ceremony won't reopen.
          if (latestProEvent) acknowledgeEvent(latestProEvent.id)
        }}
        awards={proAwards}
      />

      {/* Pro Awards Banner */}
      {latestProEvent && !isProModalOpen && (
        <div className="liquid-panel rounded-lg border-amber-300/20 p-4 flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Trophy size={20} className="text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-300 uppercase tracking-wide">
                {(latestProEvent.data as any)?.title || "Pro Top 20 Awards"}
              </p>
              <p className="text-[10px] text-amber-400/60">Click to view the ceremony</p>
            </div>
          </div>
          <Button
            onClick={() => {
              const awards = (latestProEvent?.data as any)?.proAwards
              if (awards && Array.isArray(awards.top20) && awards.year) {
                setProAwards(awards as AnnualAwards)
                setIsProModalOpen(true)
              }
            }}
            className="bg-amber-500 hover:bg-amber-400 text-black font-bold uppercase tracking-wider text-[10px] rounded-xl h-10 px-6"
          >
            <Trophy size={14} className="mr-2" /> View Ceremony
          </Button>
        </div>
      )}

      {/* Header / Welcome Row */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <div className="flex items-center gap-2 text-primary/80 mb-1">
            <TrendingUp size={14} />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Organization Dashboard</span>
          </div>
          <h1 className="text-4xl font-normal tracking-tighter uppercase liquid-text">
            MANAGER <span className="text-white">DASHBOARD</span>
          </h1>
        </div>

        {playerTeam && (
          <div className="glass-panel p-4 flex items-center gap-6 border-white/5 rounded-lg">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center border border-white/10 overflow-hidden shadow-inner">
                <TeamLogoDisplay team={playerTeam} size={32} />
              </div>
              <div>
                <h3 className="text-lg font-normal text-white uppercase tracking-tight leading-none mb-1">
                  {playerTeam.name}
                </h3>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-white/10 text-white/50 uppercase">
                    Week {currentWeek}{timeMode === "HYBRID_DAILY" ? ` • Day ${currentDay + 1}` : ""}
                  </Badge>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-emerald-500/20 text-emerald-500 uppercase">
                    {formatCurrency(playerTeam.budget)}
                  </Badge>
                  {teamRating > 0 && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-cyan-500/20 text-cyan-300 uppercase" title="Average roster skill">
                      OVR {teamRating}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Column: Next Match & Financials */}
        <div className="lg:col-span-2 space-y-8">
          {/* Next Match Card */}
          {nextMatch ? (
            <Card className="glass-panel overflow-hidden border-white/10 relative group rounded-lg">
              <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/30 to-transparent" />
              <CardHeader className="pb-2 relative z-10">
                <div className="flex justify-between items-start mb-4">
                  <div className="space-y-3">
                    <Badge className={cn(
                      "uppercase tracking-widest text-[10px] border-none px-4 py-1.5 rounded-full font-bold",
                      isMatchLive
                        ? "bg-red-500/85 text-white"
                        : "bg-primary/20 text-primary"
                    )}>
                      {isMatchLive ? "LIVE MATCH" : "Upcoming Match"}
                    </Badge>
                    <CardTitle className="text-3xl font-normal tracking-tight uppercase leading-none">Next Game</CardTitle>
                  </div>

                  {tournament && (
                    <div className="flex flex-col items-end gap-2 animate-in fade-in slide-in-from-right-4 duration-1000">
                      <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-white/5 border border-white/10 backdrop-blur-md">
                        {tournament.logoPath && (
                          <div className="w-8 h-8 relative flex items-center justify-center">
                            <Image src={tournament.logoPath} alt={tournament.name} width={24} height={24} className="object-contain brightness-110" />
                          </div>
                        )}
                        <div className="text-right">
                          <p className="text-[10px] font-black text-white/90 uppercase tracking-widest leading-none mb-0.5">{tournament.name}</p>
                          <p className="text-[8px] font-bold text-primary uppercase tracking-[0.2em] leading-none">{tournament.tier.replace('_', ' ')}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase opacity-60 mr-1">
                        Week {nextMatch.week}{typeof nextMatch.day === "number" ? ` • Day ${nextMatch.day + 1}` : ""}
                      </span>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="relative z-10 py-8">
                <div className="flex items-center justify-between gap-8 mb-10">
                  <div className="flex-1 text-center space-y-3">
                    <div className="w-24 h-24 mx-auto rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-2 shadow-glass-soft backdrop-blur-md transition-transform duration-300 group-hover:-translate-y-0.5">
                      <TeamLogoDisplay team={playerTeam} size={56} />
                    </div>
                    <p className="font-normal text-xl uppercase tracking-tight text-white/90">{playerTeam?.name}</p>
                  </div>

                  <div className="flex flex-col items-center gap-4">
                    <div className="relative group/vs">
                      <div className="absolute inset-0 bg-white/20 blur-2xl rounded-full opacity-0 group-hover/vs:opacity-100 transition-opacity duration-700" />
                      <div className="px-8 py-4 rounded-xl liquid-button font-black text-3xl italic text-white transition-all duration-300 flex items-center justify-center relative z-10">
                        <span>VS</span>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px] uppercase font-bold px-4 py-1.5 bg-white/5 border border-white/10 rounded-full backdrop-blur-md">{nextMatch.format}</Badge>
                  </div>

                  <div className="flex-1 text-center space-y-3">
                    <div className="w-24 h-24 mx-auto rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-2 shadow-glass-soft backdrop-blur-md transition-transform duration-300 group-hover:-translate-y-0.5">
                      <TeamLogoDisplay team={teams.find(t => t.id === (nextMatch.homeTeamId === playerTeamId ? nextMatch.awayTeamId : nextMatch.homeTeamId))} size={56} />
                    </div>
                    <p className="font-normal text-xl uppercase tracking-tight text-white/90">
                      {teams.find(t => t.id === (nextMatch.homeTeamId === playerTeamId ? nextMatch.awayTeamId : nextMatch.homeTeamId))?.name || "TBD"}
                    </p>
                  </div>
                </div>

                <div className="flex justify-center items-center gap-5">
                  {isMatchLive ? (
                    <>
                      <Button asChild variant="play" className="h-14 px-10 text-xs uppercase tracking-[0.15em]">
                        <Link href={`/match/${nextMatch.id}/tactics`}>
                          <Swords size={18} className="mr-3" /> Play Match
                        </Link>
                      </Button>

                      <Button
                        onClick={handleSimulate}
                        disabled={isSimulating || storeLoading}
                        size="icon"
                        aria-label={isSimulating ? "Simulating match" : "Quick-simulate match"}
                        title="Quick-simulate (skip live match)"
                        className="h-14 w-14 border border-white/10 bg-white/5 hover:bg-white/10 rounded-lg shadow-glass-soft backdrop-blur-md group"
                      >
                        {isSimulating ? (
                          <Loader2 size={20} className="animate-spin text-white" aria-hidden="true" />
                        ) : (
                          <Zap size={20} className="text-white fill-white transition-transform" aria-hidden="true" />
                        )}
                      </Button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-2">
                      <div className="px-6 py-3 rounded-full bg-white/5 border border-white/10 text-white/60 text-sm font-bold uppercase tracking-wider">
                        Match Starts Week {nextMatch.week}{typeof nextMatch.day === "number" ? ` • Day ${nextMatch.day + 1}` : ""}
                      </div>
                      <p className="text-[10px] text-white/30 uppercase tracking-widest">
                        {(() => {
                          const weeksUntil = Math.max(0, nextMatch.week - currentWeek)
                          if (weeksUntil > 0) {
                            return `Advance ${weeksUntil} week${weeksUntil > 1 ? 's' : ''} to play`
                          }
                          if (timeMode === "HYBRID_DAILY") {
                            const daysUntil = Math.max(0, (nextMatch.day ?? 6) - currentDay)
                            return `Advance ${daysUntil} day${daysUntil !== 1 ? 's' : ''} to play`
                          }
                          return "Advance to play"
                        })()}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : upcomingTournaments.length > 0 ? (
            <Card className="glass-panel overflow-hidden border-white/10 relative rounded-lg">
              <CardHeader className="pb-2 relative z-10">
                <div className="space-y-3">
                  <Badge className="uppercase tracking-widest text-[10px] border-none px-4 py-1.5 rounded-full font-bold bg-amber-500/20 text-amber-400">
                    Upcoming Events
                  </Badge>
                  <CardTitle className="text-3xl font-normal tracking-tight uppercase leading-none">On The Horizon</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="relative z-10 py-6 space-y-4">
                {upcomingTournaments.map((t) => (
                  <div key={t.id} className="flex items-center gap-6 p-5 rounded-lg bg-white/[0.03] border border-white/5 hover:border-white/10 transition-colors">
                    {/* Player team */}
                    <div className="flex-1 flex items-center gap-4">
                      <div className="w-14 h-14 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                        <TeamLogoDisplay team={playerTeam} size={36} />
                      </div>
                      <p className="font-normal text-sm uppercase tracking-tight text-white/80">{playerTeam?.name}</p>
                    </div>

                    {/* VS TBD */}
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 font-black text-lg italic text-white/40">
                        VS
                      </div>
                    </div>

                    {/* TBD opponent */}
                    <div className="flex-1 flex items-center gap-4 justify-end">
                      <p className="font-normal text-sm uppercase tracking-tight text-white/40">TBD</p>
                      <div className="w-14 h-14 rounded-lg bg-white/5 border border-dashed border-white/10 flex items-center justify-center shrink-0">
                        <HelpCircle size={24} className="text-white/15" />
                      </div>
                    </div>

                    {/* Tournament info */}
                    <div className="shrink-0 flex flex-col items-end gap-1.5 pl-4 border-l border-white/5">
                      <div className="flex items-center gap-2">
                        {t.logoPath && (
                          <Image src={t.logoPath} alt={t.name} width={16} height={16} className="object-contain brightness-110" />
                        )}
                        <span className="text-[10px] font-black text-white/70 uppercase tracking-wider">{t.shortName}</span>
                      </div>
                      <Badge className={cn("text-[8px] uppercase font-bold px-2 py-0 rounded-full border-none", getTierBgColor(t.tier), getTierColor(t.tier))}>
                        {t.tier.replace('_', ' ')}
                      </Badge>
                      <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">
                        In {t.weeksUntil} week{t.weeksUntil !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                ))}

                <p className="text-[10px] text-white/20 uppercase tracking-widest text-center pt-2">
                  Opponents drawn at tournament start
                </p>
                <div className="flex justify-center">
                  <Button asChild variant="link" className="text-primary hover:text-white transition-colors uppercase text-[10px] tracking-widest">
                    <Link href="/schedule">View Full Schedule <ArrowRight size={14} className="ml-2" /></Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="glass-panel border-dashed border-white/10 p-16 text-center bg-white/[0.01] backdrop-blur-sm rounded-lg">
              <Calendar size={64} className="mx-auto mb-6 opacity-10" />
              <h3 className="text-sm font-normal uppercase tracking-[0.4em] text-white/30">No Upcoming Matches</h3>
              <Button asChild variant="link" className="mt-6 text-primary hover:text-white transition-colors uppercase text-[10px] tracking-widest">
                <Link href="/schedule">Check Tournament Schedule <ArrowRight size={14} className="ml-2" /></Link>
              </Button>
            </Card>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="glass-panel border-white/5 bg-white/[0.02] backdrop-blur-xl rounded-lg overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-3">
                  <div className="p-2 bg-amber-500/10 rounded-xl">
                    <Trophy size={14} className="text-amber-400" />
                  </div>
                  Season Progress
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-5">
                  <div className="flex justify-between items-end">
                    <span className="text-3xl font-normal leading-none text-white tracking-tighter">{(currentWeek / 52 * 100).toFixed(0)}<span className="text-sm text-white/40 ml-1">%</span></span>
                    <span className="text-[9px] text-muted-foreground uppercase font-black tracking-widest opacity-60">Week {currentWeek} / 52</span>
                  </div>
                  <div className="h-2.5 w-full bg-white/5 rounded-full overflow-hidden shadow-inner p-0.5 border border-white/5">
                    <div className="h-full bg-gradient-to-r from-cyan-300 to-blue-300 rounded-full" style={{ width: `${(currentWeek / 52 * 100)}%` }} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel border-white/5 bg-white/[0.02] backdrop-blur-xl rounded-lg overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-xl">
                    <TrendingUp size={14} className="text-primary" />
                  </div>
                  Recent Form
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  {(() => {
                    const form = completedMatches
                      .filter(m => m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
                      .slice(-5)
                      .map(m => m.result.winnerId === playerTeamId ? 'W' : 'L')

                    if (form.length === 0) {
                      return <div className="text-white/20 text-xs font-bold uppercase tracking-wider">No matches played</div>
                    }

                    return (
                      <>
                        {form.map((result, i) => (
                          <div key={i} className={cn(
                            "h-12 w-12 rounded-lg flex items-center justify-center font-black text-sm shadow-glass-soft transition-transform hover:-translate-y-0.5 cursor-default",
                            result === 'W' ? "bg-emerald-500/20 text-emerald-500" : "bg-red-500/20 text-red-400"
                          )}>
                            {result}
                          </div>
                        ))}
                        {nextMatch && (
                          <div className="h-12 w-12 rounded-[1.2rem] bg-white/5 text-white/10 flex items-center justify-center font-black text-sm border border-white/5 animate-pulse">?</div>
                        )}
                      </>
                    )
                  })()}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Financial Hub Card */}
          <Card className="glass-panel border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent backdrop-blur-xl rounded-lg overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-xs font-bold uppercase tracking-[0.2em] text-white/50 flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 rounded-xl">
                    <Wallet size={14} className="text-emerald-400" />
                  </div>
                  Financial Hub
                </CardTitle>
                <Badge variant="outline" className={cn("text-[8px] rounded-full px-3", {
                  "border-emerald-500/30 text-emerald-400 bg-emerald-500/5": financialReport?.state === "STABLE",
                  "border-yellow-500/30 text-yellow-400 bg-yellow-500/5": financialReport?.state === "TIGHT",
                  "border-orange-500/30 text-orange-400 bg-orange-500/5": financialReport?.state === "RISK",
                  "border-red-500/30 text-red-400 bg-red-500/5": financialReport?.state === "CRISIS" || financialReport?.state === "INSOLVENT",
                })}>{financialReport?.state || "STABLE"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="py-6 pt-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Available Funds</p>
                  <div className="flex items-end gap-2">
                    <AnimatedNumber
                      value={financialData.budget}
                      format={(n) => `$${(n / 1000000).toFixed(2)}M`}
                      className="text-3xl font-normal text-white"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Weekly Income</p>
                  <div className="flex items-center gap-2">
                    <ArrowUpCircle size={16} className="text-emerald-400" />
                    <span className="text-xl font-normal text-emerald-400/80">+${(financialData.income / 1000).toFixed(1)}k</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Weekly Net</p>
                  <div className="flex items-center gap-2">
                    {financialData.net >= 0 ? (
                      <ArrowUpCircle size={16} className="text-emerald-400" />
                    ) : (
                      <ArrowDownCircle size={16} className="text-red-400" />
                    )}
                    <span className={`text-xl font-normal ${financialData.net >= 0 ? "text-emerald-400/80" : "text-red-400/80"}`}>{financialData.net >= 0 ? '+' : ''}${(financialData.net / 1000).toFixed(1)}k</span>
                  </div>
                </div>
              </div>

              {/* Mini Budget Bar */}
              <div className="mt-8 pt-6 border-t border-white/5 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-[8px] text-white/50 uppercase font-black tracking-widest mb-1">Salaries</p>
                  <p className="text-xs text-white/60 font-medium">-${(financialData.salaries / 1000).toFixed(1)}k</p>
                </div>
                <div>
                  <p className="text-[8px] text-white/50 uppercase font-black tracking-widest mb-1">Facilities</p>
                  <p className="text-xs text-white/60 font-medium">-${(financialData.facilities / 1000).toFixed(1)}k</p>
                </div>
                <div className="col-span-2 flex items-center justify-end">
                  <Button asChild variant="ghost" size="sm" className="text-[9px] uppercase tracking-widest font-black text-primary hover:bg-primary/10 rounded-full h-8">
                    <Link href="/finances">
                      View Ledger <ArrowRight size={10} className="ml-2" />
                    </Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Column: Action Center + Weekly Focus + Objectives + News Feed */}
        <div className="space-y-6">
          <GettingStartedChecklist />
          <ActionCenter />
          <WeeklyFocusWidget />
          {playerTeam && (
            <SeasonObjectives
              worldRanking={playerTeam.worldRanking ?? 0}
              trophiesThisSeason={playerTeam.trophies?.filter(t => t.week > (currentWeek - 53)).length ?? 0}
              followers={playerTeam.followers ?? playerTeam.fanbase ?? 0}
              financialState={playerTeam.financialState}
              reputation={playerTeam.reputation}
              boardConfidence={boardState?.confidence}
              boardExpectation={boardState?.seasonExpectation}
              boardOnNotice={boardState?.onNotice}
            />
          )}
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-normal uppercase tracking-[0.3em] text-white/50">Intelligence Feed</h3>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[10px] font-black text-emerald-500/80 uppercase tracking-[0.2em]">Live</span>
            </div>
          </div>

          <div className="max-h-[max(20rem,calc(100vh-12rem))] overflow-y-auto pr-3 scrollbar-thin scrollbar-thumb-white/5 scrollbar-track-transparent space-y-2">
            <NewsFeed />
          </div>
        </div>
      </div>
    </div>
  )
}
