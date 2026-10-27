"use client"

import { useCallback, useEffect, useMemo, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { NewsFeed } from "@/components/dashboard/NewsFeed"
import { ActionCenter } from "@/components/dashboard/ActionCenter"
import { GettingStartedChecklist } from "@/components/dashboard/GettingStartedChecklist"
import { DemoTour } from "@/components/demo/DemoTour"
import { LastWeekPanel } from "@/components/report/LastWeekPanel"
import { StorylinesPanel } from "@/components/storylines/StorylinesPanel"
import { DismissalJobMarket } from "@/components/career/DismissalJobMarket"
import { BoardConfidenceChip } from "@/components/career/BoardConfidence"
import { graceWeeksLeft } from "@/components/career/board-view"
import { LeagueSnapshot } from "@/components/league/LeagueSnapshot"
import { leagueStageLabel } from "@/components/league/league-view"
import { Button } from "@/components/ui/button"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { Panel } from "@/src/components/ui/Panel"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { Meter } from "@/src/components/ui/Meter"
import { RatingChip } from "@/src/components/ui/RatingChip"
import { DRAFT_CUP_DIFFICULTY } from "@/engine/draft-cup"
import { DraftCupBracket } from "@/components/draft-cup/DraftCupBracket"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { FixtureBanner, FormGuide, type FormResult } from "@/src/components/ui/FixtureBanner"
import { Activity, ArrowUpRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency, formatSignedCurrency } from "@/lib/utils-extended"
import { FULL_TOURNAMENT_CALENDAR } from "@/data/tournament-calendar"
import { gameCalendarDate, formatGameCalendarDate } from "@/lib/game-calendar"
import { EconomyEngine } from "@/engine/economy-engine"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { getBoardSanctionedFee, getTierTargets } from "@/engine/board-expectations"
import { isLeagueMatchId, ordinal } from "@/engine/season/regional-league"
import { boardStartTargets } from "@/lib/club-expectations"
import { playerEnergyPercent } from "@/lib/player-energy"
import { fixtureBlockReason } from "@/lib/playable-match"

const TIER_LABEL: Record<string, string> = { S_TIER: "S-tier", A_TIER: "A-tier", B_TIER: "B-tier", C_TIER: "C-tier" }
/** Short names for the board's objectives (the full sentence is the row's tooltip and on Club → Board). */
const OBJECTIVE_SHORT: Record<string, string> = { league: "League finish", ranking: "World ranking", finance: "Cash at season end" }

/** Small link for panel headers. */
function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 rounded-sm text-xs font-semibold text-ink-3 hover:text-ink-1">
      {children} <ArrowUpRight size={12} />
    </Link>
  )
}

const FINANCE_STATE: Record<string, { label: string; className: string }> = {
  STABLE: { label: "Stable", className: "text-positive" },
  TIGHT: { label: "Tight", className: "text-caution" },
  RISK: { label: "At risk", className: "text-caution" },
  CRISIS: { label: "Crisis", className: "text-negative" },
  INSOLVENT: { label: "Insolvent", className: "text-negative" },
}

type MatchLike = {
  id: string
  week: number
  homeTeamId: string
  awayTeamId: string
  isScrim?: boolean
  tournamentId?: string | null
  result?: { winnerId?: string; homeScore: number; awayScore: number; maps?: { finalScore?: { team1: number; team2: number } }[] }
}

/** Score from the player's side: round score for a BO1, map score otherwise. */
function scoreFor(match: MatchLike, teamId: string): string {
  const r = match.result
  if (!r) return "—"
  const isHome = match.homeTeamId === teamId
  const maps = r.maps
  if (maps && maps.length === 1 && maps[0]?.finalScore) {
    const fs = maps[0].finalScore
    return isHome ? `${fs.team1}–${fs.team2}` : `${fs.team2}–${fs.team1}`
  }
  return isHome ? `${r.homeScore}–${r.awayScore}` : `${r.awayScore}–${r.homeScore}`
}

function tournamentFor(id?: string | null) {
  if (!id) return undefined
  return FULL_TOURNAMENT_CALENDAR.find(t => t.id === id || t.id === id.split('_s')[0] || id.startsWith(`${t.id}_`))
}

export default function Page() {
  const router = useRouter()

  // Consolidated data selectors (single subscription, shallow equality)
  const {
    isInitialized, playerTeamId, teams, players, contracts,
    scheduledMatches, completedMatches, currentWeek, currentDay, academyCount,
    timeMode, _hasHydrated,
    gameOverReason, tournamentQualifications,
    staff, storeLoading, gameStartDate, draftCup, tournaments,
  } = useGameStore(useShallow(s => ({
    draftCup: s.draftCup,
    tournaments: s.tournaments,
    isInitialized: s.isInitialized,
    playerTeamId: s.playerTeamId,
    teams: s.teams,
    players: s.players,
    contracts: s.contracts,
    scheduledMatches: s.scheduledMatches,
    completedMatches: s.completedMatches,
    currentWeek: s.currentWeek,
    academyCount: s.academyPlayers.length,
    currentDay: s.currentDay,
    timeMode: s.timeMode,
    _hasHydrated: s._hasHydrated,
    gameOverReason: s.gameOverReason,
    tournamentQualifications: s.tournamentQualifications,
    staff: s.staff,
    storeLoading: s.isLoading,
    gameStartDate: s.gameStartDate,
  })))

  const boardState = useGameStore(s => s.boardState)
  const league = useGameStore(s => s.league)
  const tenureStartWeek = useGameStore(s => s.managerDetails?.tenureStartWeek)

  // The season recap and the awards ceremony are the season review moment
  // now (components/moments/SeasonReviewMomentView); past reviews replay
  // from the trophy room and the awards message.

  // Robust session check: isInitialized is the primary flag,
  // but we also check if we have teams and a playerTeamId as a fallback.
  const isSessionActive = isInitialized || (teams.length > 0 && !!playerTeamId)

  useEffect(() => {
    if (_hasHydrated && !isSessionActive && !storeLoading) {
      router.push('/main-menu')
    }
  }, [_hasHydrated, isSessionActive, storeLoading, router])

  const playerTeam = useMemo(() => teams.find(t => t.id === playerTeamId), [teams, playerTeamId])
  const playersById = useMemo(() => new Map(players.map(p => [p.id, p])), [players])
  const teamsById = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams])
  const leagueDayById = useMemo(() => new Map(scheduledMatches.filter(m => isLeagueMatchId(m.id)).map(m => [m.id, m.day])), [scheduledMatches])

  // Starting five with the same evaluation the Squad screen uses, so OVR matches everywhere.
  const starters = useMemo(() => {
    if (!playerTeam) return []
    return (playerTeam.rosterIds || []).slice(0, 5)
      .map(id => playersById.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map(p => ({ player: p, ovr: evaluatePlayer(p).overallRating }))
  }, [playerTeam, playersById])

  const teamOvr = useMemo(() => {
    if (starters.length === 0) return 0
    return Math.round(starters.reduce((s, x) => s + x.ovr, 0) / starters.length)
  }, [starters])

  const nextMatch = useMemo(() => {
    return scheduledMatches
      .filter(m => m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
      .sort((a, b) => {
        if (a.week !== b.week) return a.week - b.week
        return (a.day ?? 6) - (b.day ?? 6)
      })[0]
  }, [scheduledMatches, playerTeamId])

  const opponent = useMemo(() => {
    if (!nextMatch) return undefined
    const id = nextMatch.homeTeamId === playerTeamId ? nextMatch.awayTeamId : nextMatch.homeTeamId
    return teams.find(t => t.id === id)
  }, [nextMatch, playerTeamId, teams])

  const opponentOvr = useMemo(() => {
    if (!opponent) return null
    const roster = (opponent.rosterIds || []).slice(0, 5).map(id => playersById.get(id)).filter((p): p is NonNullable<typeof p> => !!p)
    if (roster.length === 0) return null
    return Math.round(roster.reduce((s, p) => s + evaluatePlayer(p).overallRating, 0) / roster.length)
  }, [opponent, playersById])

  const tournament = useMemo(() => tournamentFor(nextMatch?.tournamentId), [nextMatch])

  // Last five official results (oldest first) for any team.
  const formFor = useCallback((teamId: string | undefined | null): FormResult[] => {
    if (!teamId) return []
    const played = completedMatches.filter(m => !m.isScrim && (m.homeTeamId === teamId || m.awayTeamId === teamId))
    if (played.length === 0) {
      const t = teams.find(x => x.id === teamId)
      return ((t?.recentForm as FormResult[] | undefined) ?? []).slice(-5)
    }
    return played.slice(-5).map(m => m.result.winnerId === teamId ? "W" : "L")
  }, [completedMatches, teams])

  const isMatchLive = !!nextMatch
    && nextMatch.week === currentWeek
    && (timeMode === "WEEKLY" || (nextMatch.day ?? 6) <= currentDay)
  // A due fixture the store would refuse to simulate (a side below five
  // players): never offer Play for it, explain instead. The week can still
  // advance; the week tick resolves it by forfeit.
  const matchBlockReason = useMemo(() => (
    isMatchLive && nextMatch
      ? fixtureBlockReason({ playerTeamId, scheduledMatches, currentWeek, teams, players }, nextMatch)
      : null
  ), [isMatchLive, nextMatch, playerTeamId, scheduledMatches, currentWeek, teams, players])

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
      .map(t => ({ ...t, weeksUntil: t.startWeek - currentCalendarWeek }))
  }, [nextMatch, tournamentQualifications, playerTeamId, currentWeek])

  // Financial projection for the next weekly settlement (same engine the week tick uses)
  const financialReport = useMemo(() => {
    if (!playerTeam) return null
    return EconomyEngine.processWeeklyFinances(playerTeam, players, contracts, staff, currentWeek + 1, academyCount)
  }, [playerTeam, players, contracts, staff, currentWeek, academyCount])

  const recentResults = useMemo(() => {
    return completedMatches
      .filter(m => m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
      .slice(-5)
      .reverse()
  }, [completedMatches, playerTeamId])

  const season = Math.ceil(Math.max(1, currentWeek) / 52)
  const weekInSeason = ((Math.max(1, currentWeek) - 1) % 52) + 1
  const seasonStartWeek = (season - 1) * 52 + 1

  const seasonRecord = useMemo(() => {
    const games = completedMatches.filter(m => !m.isScrim && m.week >= seasonStartWeek && (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId))
    const wins = games.filter(m => m.result.winnerId === playerTeamId).length
    return { wins, losses: games.length - wins }
  }, [completedMatches, seasonStartWeek, playerTeamId])

  if (!_hasHydrated || (storeLoading && !isSessionActive)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3 text-sm text-ink-3" role="status">
        <Loader2 size={16} className="animate-spin" /> Loading your career…
      </div>
    )
  }

  // If still not active after hydration, we'll be redirected by useEffect, but show nothing for now
  if (!isSessionActive) return null

  // Game over: a dismissed manager gets the job market (Phase 4.4).
  if (gameOverReason) return <DismissalJobMarket />


  // ---- Next fixture hero ----
  const renderHero = () => {
    if (nextMatch && playerTeam) {
      const matchDate = gameStartDate
        ? formatGameCalendarDate(gameCalendarDate(gameStartDate, nextMatch.week, nextMatch.day ?? 6), { weekday: "short", month: "short", day: "numeric" })
        : null
      const countdown = (() => {
        if (isMatchLive) return "Match day"
        const daily = timeMode === "HYBRID_DAILY"
        if (daily) {
          const days = Math.max(0, (nextMatch.week - currentWeek) * 7 + (nextMatch.day ?? 6) - currentDay)
          return days === 0 ? "Today" : `Match in ${days} day${days === 1 ? "" : "s"}`
        }
        const weeks = Math.max(0, nextMatch.week - currentWeek)
        return weeks === 0 ? "This week" : `Match in ${weeks} week${weeks === 1 ? "" : "s"}`
      })()
      const leagueStage = leagueStageLabel(nextMatch)
      const competitionName = nextMatch.isScrim ? "Scrim" : leagueStage ?? tournament?.name ?? nextMatch.stage ?? "Match"
      const competition = (
        <span className="flex min-w-0 items-center gap-2.5">
          {leagueStage && <span className="shrink-0 rounded-sm border border-line-strong px-1.5 py-0.5 text-[11px] font-semibold uppercase leading-none tracking-[0.06em] text-ink-2">League</span>}
          {!nextMatch.isScrim && tournament?.logoPath && (
            <Image src={tournament.logoPath} alt="" width={20} height={20} className="h-5 w-5 object-contain" />
          )}
          <span className="truncate font-semibold text-ink-1">{competitionName}</span>
          {!nextMatch.isScrim && tournament && <span className="text-ink-3">{TIER_LABEL[tournament.tier] ?? tournament.tier}</span>}
          {nextMatch.stage && !nextMatch.isScrim && tournament && <span className="truncate text-ink-3">· {nextMatch.stage}</span>}
          {nextMatch.isScrim && <span className="text-ink-3">Practice match</span>}
        </span>
      )
      const when = (
        <span className="flex items-center gap-2">
          <span className={cn("font-semibold", isMatchLive ? "text-gold" : "text-ink-1")}>{countdown}</span>
          <span className="text-ink-3">· Week {nextMatch.week}{matchDate ? `, ${matchDate}` : ""}</span>
        </span>
      )
      const action = isMatchLive && matchBlockReason
        ? <Button asChild variant="outline" className="h-10 px-6"><Link href="/transfers">Find a player</Link></Button>
        : isMatchLive
          ? <Button asChild variant="outline" className="h-10 px-6"><Link href={`/match/${nextMatch.id}/tactics`}>Go to match</Link></Button>
          : <Button asChild variant="outline" className="h-10 px-6"><Link href="/squad">Prepare lineup</Link></Button>
      const footnote = isMatchLive && matchBlockReason
        ? <span role="status" className="text-caution">{matchBlockReason}</span>
        : isMatchLive ? "Veto, tactics and quick sim are on the match screen." : undefined
      return (
        <FixtureBanner
          art="/esport-ui-assets/backgrounds/match-command-arena.webp"
          competition={competition}
          when={when}
          home={{ team: playerTeam, name: playerTeam.name, meta: draftCup ? "Drafted side" : `World #${playerTeam.worldRanking ?? "—"}`, form: formFor(playerTeamId), ovr: teamOvr }}
          away={{ team: opponent, name: opponent?.name ?? "TBD", meta: opponent ? `World #${opponent.worldRanking ?? "—"}` : undefined, form: opponent ? formFor(opponent.id) : [], ovr: opponentOvr }}
          center={
            <>
              <span className="font-display text-4xl font-bold uppercase leading-none text-ink-3">VS</span>
              <span className="mt-1 rounded-sm border border-line-strong px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">{nextMatch.format}</span>
            </>
          }
          action={action}
          footnote={footnote}
        />
      )
    }

    if (upcomingTournaments.length > 0 && playerTeam) {
      const t = upcomingTournaments[0]
      return (
        <FixtureBanner
          art="/esport-ui-assets/backgrounds/match-command-arena.webp"
          competition={
            <span className="flex items-center gap-2.5">
              {t.logoPath && <Image src={t.logoPath} alt="" width={20} height={20} className="h-5 w-5 object-contain" />}
              <span className="font-semibold text-ink-1">{t.name}</span>
              <span className="text-ink-3">{TIER_LABEL[t.tier] ?? t.tier}</span>
            </span>
          }
          when={<span className="font-semibold text-ink-1">Starts in {t.weeksUntil} week{t.weeksUntil === 1 ? "" : "s"}</span>}
          home={{ team: playerTeam, name: playerTeam.name, meta: draftCup ? "Drafted side" : `World #${playerTeam.worldRanking ?? "—"}`, form: formFor(playerTeamId), ovr: teamOvr }}
          away={{ team: null, name: "TBD", meta: "Drawn when the event starts" }}
          action={<Button asChild variant="outline" className="h-10 px-6"><Link href="/schedule">View schedule</Link></Button>}
          footnote={upcomingTournaments[1] ? `Then ${upcomingTournaments[1].name} in ${upcomingTournaments[1].weeksUntil} weeks` : undefined}
        />
      )
    }

    return (
      <Panel className="rounded-[10px] border-line-strong" padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-6 p-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Next fixture</p>
            <p className="mt-1 font-display text-3xl font-bold uppercase leading-none text-ink-1">No match scheduled</p>
            <p className="mt-2 text-sm text-ink-2">Register for an event or book a scrim to get games on the calendar.</p>
          </div>
          <Button asChild variant="outline" className="h-10 px-6"><Link href="/schedule">Open schedule</Link></Button>
        </div>
      </Panel>
    )
  }

  // ---- Board / season objective ----
  const fallbackTargets = boardStartTargets(playerTeam?.worldRanking, playerTeam?.reputation)
  const expectationTier = boardState?.seasonExpectation ?? fallbackTargets.tier
  const tierTargets = getTierTargets(expectationTier)
  const rankTarget = boardState?.rankTarget ?? fallbackTargets.rankTarget
  const worldRank = playerTeam?.worldRanking ?? 0
  const trophiesThisSeason = (playerTeam?.trophies ?? []).filter(t => t.week >= seasonStartWeek).length
  const sanctioned = boardState && playerTeam ? getBoardSanctionedFee(boardState, playerTeam.budget) : null
  const rankOnTrack = worldRank > 0 && worldRank <= rankTarget
  // Phase 4.4: the board's real objectives (league finish, ranking, budget).
  const objectives = boardState?.objectives ?? []
  const objectiveProgress = (o: (typeof objectives)[number]) => o.current === undefined ? "—"
    : o.id === "finance" ? formatCurrency(o.current) : o.id === "ranking" ? `#${o.current}` : ordinal(o.current)
  const objectiveTarget = (o: (typeof objectives)[number]) =>
    o.id === "finance" ? formatCurrency(o.target) : o.id === "ranking" ? `#${o.target}` : ordinal(o.target)

  const finance = financialReport
  const financeState = FINANCE_STATE[finance?.state ?? "STABLE"] ?? FINANCE_STATE.STABLE

  // G7: a Draft Cup run shows its round and record instead of the season.
  const cupBracket = draftCup ? (tournaments.find(t => t.id === draftCup.tournamentId)?.playoffBracket ?? []).filter(m => m.homeTeamId === draftCup.teamId || m.awayTeamId === draftCup.teamId) : []
  const cupRound = cupBracket.find(m => !m.isCompleted)?.stage.replace(/ \d+$/, "")
  const cupWins = cupBracket.filter(m => m.isCompleted && m.winnerId === draftCup?.teamId).length

  return (
    <div className="space-y-5 pb-12">
      {draftCup ? (
      <ScreenHeader
        eyebrow={`Draft Cup · ${DRAFT_CUP_DIFFICULTY[draftCup.difficulty].label}${timeMode === "HYBRID_DAILY" ? ` · Day ${currentDay + 1}` : ""}`}
        title={playerTeam?.name ?? "Draft Cup"}
        subtitle="Eight teams, one round a week, best of three with a best-of-five final. One loss ends the run."
        leading={playerTeam && (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-line bg-panel">
            <TeamLogoDisplay team={playerTeam} size={52} />
          </div>
        )}
        aside={
          <KpiStrip>
            <Kpi label="Round" value={cupRound ?? "—"} />
            <Kpi label="Series won" value={`${cupWins} of 3`} />
            <Kpi label="Team OVR" value={<RatingChip value={teamOvr} size="lg" bare />} />
          </KpiStrip>
        }
      />
      ) : (
      <ScreenHeader
        eyebrow={`Season ${season} · Week ${weekInSeason}${timeMode === "HYBRID_DAILY" ? ` · Day ${currentDay + 1}` : ""}`}
        title="Club overview"
        subtitle={playerTeam ? [playerTeam.name, playerTeam.region].filter(Boolean).join(" · ") : undefined}
        leading={playerTeam && (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-line bg-panel">
            <TeamLogoDisplay team={playerTeam} size={52} />
          </div>
        )}
        aside={
          <KpiStrip>
            <Kpi label="World rank" value={`#${worldRank || "—"}`} />
            <Kpi label="Team OVR" value={<RatingChip value={teamOvr} size="lg" bare />} />
            <Kpi label="Season record" value={`${seasonRecord.wins}–${seasonRecord.losses}`} />
            <Kpi label="Trophies" value={playerTeam?.trophies?.length ?? 0} />
          </KpiStrip>
        }
      />
      )}


      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-4">
          {renderHero()}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            {/* Squad status */}
            <Panel title="Squad status" actions={<PanelLink href="/squad">Squad</PanelLink>} padded={false} className="overflow-hidden">
              <table data-slot="table" className="w-full border-collapse text-left">
                <thead data-slot="table-header">
                  <tr className="border-b border-line">
                    <th data-slot="table-head" className="pl-4">Starter</th>
                    <th data-slot="table-head" className="px-2">Role</th>
                    <th data-slot="table-head" className="px-2 text-center">OVR</th>
                    <th data-slot="table-head" className="px-2">Morale</th>
                    <th data-slot="table-head" className="pr-4">Energy</th>
                  </tr>
                </thead>
                <tbody>
                  {starters.map(({ player, ovr }) => (
                    <tr key={player.id} data-slot="table-row" className="h-12 border-b border-line last:border-b-0">
                      <td className="py-1.5 pl-4 pr-2">
                        <Link href={`/player/${player.id}`} className="flex min-w-0 items-center gap-2.5 rounded-sm hover:text-gold">
                          <span className="h-8 w-8 shrink-0 overflow-hidden rounded bg-raised">
                            <PlayerPortrait src={player.portraitPath} seed={player.id} alt={player.nickname} size={32} />
                          </span>
                          <span className="truncate text-sm font-semibold text-ink-1">{player.nickname}</span>
                          {player.injury && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-negative/15 px-1.5 py-0.5 text-[11px] font-semibold text-negative">
                              <Activity size={11} /> {player.injury.weeksRemaining}w
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="px-2"><RoleTag role={player.role} /></td>
                      <td className="px-2 text-center"><RatingChip value={ovr} size="sm" /></td>
                      <td className="px-2"><Meter value={player.morale} label="Morale" trackClassName="w-12" /></td>
                      <td className="pr-4"><Meter value={playerEnergyPercent(player)} label="Energy" trackClassName="w-12" /></td>
                    </tr>
                  ))}
                  {starters.length < 5 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-sm text-caution">
                        {5 - starters.length} starter{5 - starters.length === 1 ? "" : "s"} missing. You need five players to play a match.{" "}
                        <Link href="/transfers" className="font-semibold underline underline-offset-2">Find players</Link>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Panel>

            <div className="min-w-0 space-y-4">
            {/* G7: a Draft Cup run has its bracket instead of a league and a board. */}
            {draftCup ? <DraftCupBracket /> : <>
            {/* League position (Phase 4.7) */}
            {playerTeamId && (
              <LeagueSnapshot league={league} playerTeamId={playerTeamId} teamsById={teamsById} dayById={leagueDayById} gameStartDate={gameStartDate} />
            )}

            {/* Board objectives; the chip opens Club → Board */}
            <Panel eyebrow="Board" title={tierTargets.label} actions={<BoardConfidenceChip board={boardState} graceLeft={graceWeeksLeft(currentWeek, tenureStartWeek)} />} bodyClassName="pt-1">
              <dl className="divide-y divide-line text-sm">
                {objectives.length > 0 ? objectives.map(o => (
                  <div key={o.id} className="flex items-center justify-between gap-3 py-2">
                    <dt className="min-w-0 truncate text-ink-3" title={o.label}>{OBJECTIVE_SHORT[o.id] ?? o.label}</dt>
                    <dd className="shrink-0 text-xs tabular-nums">
                      <span className="text-ink-3">target {objectiveTarget(o)}</span>
                      <span className={cn("ml-2", o.status === "ON_TRACK" || o.status === "MET" ? "text-positive" : "text-caution")}>now {objectiveProgress(o)}</span>
                    </dd>
                  </div>
                )) : (
                  <>
                    <div className="flex items-center justify-between py-2">
                      <dt className="text-ink-3">Finish ranked</dt>
                      <dd className="tabular-nums text-ink-1">
                        #{rankTarget} or better
                        <span className={cn("ml-2 text-xs", rankOnTrack ? "text-positive" : "text-ink-3")}>now #{worldRank || "—"}</span>
                      </dd>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <dt className="text-ink-3">Trophies</dt>
                      <dd className="tabular-nums text-ink-1">
                        {tierTargets.trophyTarget > 0 ? `${trophiesThisSeason} of ${tierTargets.trophyTarget}` : `${trophiesThisSeason} won · none required`}
                      </dd>
                    </div>
                  </>
                )}
              </dl>
              {sanctioned && sanctioned.fraction < 1 && (
                <p className="mt-3 text-xs text-ink-3">
                  Transfer fees capped at {Math.round(sanctioned.fraction * 100)}% of funds ({formatCurrency(sanctioned.maxFee)}) until board confidence reaches 70.
                </p>
              )}
            </Panel>
            </>}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Finances strip */}
            {!draftCup && <Panel
              title="Finances"
              actions={<><span className={cn("text-xs font-semibold", financeState.className)}>{financeState.label}</span><PanelLink href="/finances">Ledger</PanelLink></>}
              padded={false}
            >
              <div className="grid grid-cols-2 divide-x divide-line border-b border-line">
                <Kpi className="px-4 py-3" label="Funds" value={formatCurrency(playerTeam?.budget ?? 0, "$", Math.abs(playerTeam?.budget ?? 0) >= 1_000_000)} />
                <Kpi
                  className="px-4 py-3"
                  label="Net / week"
                  value={<span className={(finance?.net ?? 0) < 0 ? "text-negative" : "text-ink-1"}>{formatSignedCurrency(finance?.net ?? 0)}</span>}
                  hint={finance && finance.net < 0 && Number.isFinite(finance.runwayWeeks) ? `Runway ${finance.runwayWeeks} weeks` : "Projected next settlement"}
                />
              </div>
              <dl className="grid grid-cols-3 divide-x divide-line text-sm">
                <div className="px-4 py-2.5">
                  <dt className="text-xs text-ink-3">Income</dt>
                  <dd className="tabular-nums text-ink-1">{formatSignedCurrency(finance?.income.total ?? 0)}</dd>
                </div>
                <div className="px-4 py-2.5">
                  <dt className="text-xs text-ink-3">Wages</dt>
                  <dd className="tabular-nums text-ink-1">{formatCurrency(-((finance?.expenses.playerWages ?? 0) + (finance?.expenses.staffWages ?? 0)))}</dd>
                </div>
                <div className="px-4 py-2.5">
                  <dt className="text-xs text-ink-3">Upkeep</dt>
                  <dd className="tabular-nums text-ink-1">{formatCurrency(-((finance?.expenses.facilities ?? 0) + (finance?.expenses.equipment ?? 0) + (finance?.expenses.academy ?? 0)))}</dd>
                </div>
              </dl>
            </Panel>}

            {/* Recent results */}
            <Panel title="Recent results" actions={<PanelLink href="/schedule">Schedule</PanelLink>} padded={false}>
              {recentResults.length === 0 ? (
                <p className="px-4 py-3 text-sm text-ink-3">No matches played yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {recentResults.map(m => {
                    const won = m.result.winnerId === playerTeamId
                    const oppId = m.homeTeamId === playerTeamId ? m.awayTeamId : m.homeTeamId
                    const opp = teams.find(t => t.id === oppId)
                    const comp = m.isScrim ? "Scrim" : leagueStageLabel(m) ?? tournamentFor(m.tournamentId)?.shortName ?? m.stage ?? "Match"
                    return (
                      <li key={m.id}>
                        <Link href={`/match/${m.id}/result`} className="flex h-11 items-center gap-3 px-4 transition-colors hover:bg-raised">
                          <FormGuide results={[won ? "W" : "L"]} />
                          <TeamLogoDisplay team={opp} size={22} />
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-1">{opp?.name ?? "Unknown"}</span>
                          <span className="hidden truncate text-xs text-ink-3 sm:inline">{comp} · Wk {m.week}</span>
                          <span className="w-12 text-right font-display text-lg font-bold tabular-nums text-ink-1">{scoreFor(m as MatchLike, playerTeamId || "")}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Panel>
          </div>
        </div>

        {/* Right rail: decisions first */}
        <aside className="min-w-0 space-y-4">
          <GettingStartedChecklist />
          <DemoTour />
          <ActionCenter />
          <StorylinesPanel />
          <LastWeekPanel />
          <Panel title="News" padded={false}>
            <div className="max-h-[420px] overflow-y-auto">
              <NewsFeed limit={8} />
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  )
}
