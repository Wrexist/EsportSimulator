"use client"

import { resultLineup, matchFollowup } from '@/lib/match-followup'
import { buildMatchInsights, buyWinRate } from '@/lib/match-insights'
import { buildMatchReasons, oddsLine } from '@/lib/match-reasons'
import { useEffect, useMemo, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { useGameStore } from "@/store/game-store"
import { LoadingState } from "@/components/ui/loading"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { Home, Trophy, Swords, Calendar, ArrowRight, ListOrdered } from "lucide-react"
import { leagueStageLabel } from "@/components/league/league-view"
import { CompletedMatchSaveData, PlayerSaveData } from "@/engine"
import { PlayerMatchStats, MapResult, MatchResult } from "@/types"
import { motion } from "framer-motion"
import { formatGameCalendarDate } from "@/lib/game-calendar"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils-extended"
import { PlayerPortrait, TeamLogoImage } from "@/components/ui/asset-images"
import { fireConfetti, preloadConfetti } from "@/lib/confetti-lazy"
import { markOutcomeCue, playMatchOutcomeCue } from "@/lib/match-outcome-sound"
import { AdvancementAnimation } from "@/components/tournament/AdvancementAnimation"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FULL_TOURNAMENT_CALENDAR } from "@/data/tournament-calendar"
import { MAP_NAMES } from "@/data/map-pool"
import { Panel } from "@/src/components/ui/Panel"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { TierTag } from "@/src/components/ui/TierTag"
import { PlayerLink, TeamLink } from "@/components/ui/EntityLink"

// Confetti in the v2 palette: trophy gold, white, win green.
const CONFETTI_COLORS = ['#F2B53A', '#F2F4F7', '#3DD68C']


export default function MatchResultPage() {
    const { id } = useParams<{ id: string }>()
    const router = useRouter()
    const { completedMatches, teams, players, getDateForWeek, clearActiveMatchState, playerTeamId, tournaments, scheduledMatches, currentWeek, currentDay, timeMode, financeLedger } = useGameStore(useShallow(state => ({
        completedMatches: state.completedMatches,
        teams: state.teams,
        players: state.players,
        getDateForWeek: state.getDateForWeek,
        clearActiveMatchState: state.clearActiveMatchState,
        playerTeamId: state.playerTeamId,
        tournaments: state.tournaments,
        scheduledMatches: state.scheduledMatches,
        currentWeek: state.currentWeek,
        currentDay: state.currentDay,
        timeMode: state.timeMode,
        financeLedger: state.financeLedger,
    })))
    const [match, setMatch] = useState<CompletedMatchSaveData | null>(null)
    const [activeTab, setActiveTab] = useState<"overview" | "analysis">("overview")
    const [selectedMapIndex, setSelectedMapIndex] = useState(0)
    const confettiTriggered = useRef(false)
    const [showAdvancement, setShowAdvancement] = useState(false)
    const [advancementData, setAdvancementData] = useState<{
        fromStage: string
        toStage: string
        tournamentName: string
        isChampionship: boolean
    } | null>(null)
    const advancementChecked = useRef(false)

    useEffect(() => {
        clearActiveMatchState()
    }, [clearActiveMatchState])

    const [notFound, setNotFound] = useState(false)
    useEffect(() => {
        const found = completedMatches.find(m => m.id === id)
        if (found) {
            setMatch(found)
            setNotFound(false)
            return
        }
        // Not found yet — could just be store-hydration lag. Give it a grace
        // window, then surface a not-found screen instead of spinning forever
        // (deep-link to a bad id, browser-back to a match pruned from a long
        // save, or a match this save never recorded).
        const t = setTimeout(() => setNotFound(true), 4000)
        return () => clearTimeout(t)
    }, [completedMatches, id])

    // Trigger confetti on player victory
    useEffect(() => {
        if (!match || confettiTriggered.current) return

        const isPlayerHome = match.homeTeamId === playerTeamId
        const isPlayerAway = match.awayTeamId === playerTeamId
        if (!isPlayerHome && !isPlayerAway) return
        const homeWon = match.result.homeScore > match.result.awayScore
        const playerWon = (isPlayerHome && homeWon) || (isPlayerAway && !homeWon)
        // A title won by this match has its own full-screen moment (sound and
        // confetti included); the result screen stays quiet under it.
        const titleMoment = useGameStore.getState().momentQueue.some(m => m.kind === "title" && m.matchId === match.id)

        // Track scheduled work so cleanup can cancel it on unmount and the
        // RAF / timeout don't keep firing canvas-confetti against an
        // unmounted component.
        let cancelled = false
        let initialDelayTimer: ReturnType<typeof setTimeout> | undefined
        let rafId: number | undefined

        // The victory / defeat cue plays once per match: the live screen
        // played it already unless the match was simulated instantly.
        if (titleMoment) markOutcomeCue(match.id)
        else playMatchOutcomeCue(match.id, playerWon)

        if (playerWon && !titleMoment) {
            confettiTriggered.current = true

            // Preload then fire the burst — keeps canvas-confetti out of the
            // critical bundle for non-winning paths.
            preloadConfetti().then(() => {
                if (cancelled) return
                const duration = 3000
                const end = Date.now() + duration

                const frame = () => {
                    if (cancelled) return
                    fireConfetti({
                        particleCount: 3,
                        angle: 60,
                        spread: 55,
                        origin: { x: 0, y: 0.7 },
                        colors: CONFETTI_COLORS
                    })
                    fireConfetti({
                        particleCount: 3,
                        angle: 120,
                        spread: 55,
                        origin: { x: 1, y: 0.7 },
                        colors: CONFETTI_COLORS
                    })

                    if (Date.now() < end) {
                        rafId = requestAnimationFrame(frame)
                    }
                }

                fireConfetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 0.6 },
                    colors: CONFETTI_COLORS
                })

                initialDelayTimer = setTimeout(frame, 250)
            })
        }

        return () => {
            cancelled = true
            if (initialDelayTimer) clearTimeout(initialDelayTimer)
            if (rafId) cancelAnimationFrame(rafId)
            confettiTriggered.current = false
        }
    }, [match, playerTeamId, id])

    // Check for tournament advancement animation
    useEffect(() => {
        if (!match || advancementChecked.current) return
        if (!match.tournamentId || match.tournamentId === "SCRIM") return

        const isPlayerHome = match.homeTeamId === playerTeamId
        const isPlayerAway = match.awayTeamId === playerTeamId
        if (!isPlayerHome && !isPlayerAway) return

        const homeWon = match.result.homeScore > match.result.awayScore
        const playerWon = (isPlayerHome && homeWon) || (isPlayerAway && !homeWon)
        if (!playerWon) return

        // Find the tournament and check for next stage
        const tournament = tournaments?.find(t => t.id === match.tournamentId)
        if (!tournament?.playoffBracket) return

        // Get tournament definition for name
        const baseId = match.tournamentId.replace(/_s\d+$/, '')
        const tournamentDef = FULL_TOURNAMENT_CALENDAR.find(t => t.id === baseId || t.id === match.tournamentId)

        // Find current match in bracket
        const currentBracketMatch = tournament.playoffBracket.find(m => m.id === match.id)
        if (!currentBracketMatch) return

        // Skip if this was the Grand Final (different celebration)
        if (currentBracketMatch.stage?.toLowerCase().includes("grand final")) return

        // Find next match in bracket (where this match feeds into)
        const nextMatch = tournament.playoffBracket.find(m =>
            m.sourceMatchIds?.includes(match.id)
        )

        if (nextMatch && nextMatch.stage) {
            advancementChecked.current = true
            const isChampionship = nextMatch.stage.toLowerCase().includes("grand final") ||
                (nextMatch.stage.toLowerCase().includes("final") &&
                 !nextMatch.stage.toLowerCase().includes("semi") &&
                 !nextMatch.stage.toLowerCase().includes("quarter"))

            // Delay showing the advancement animation to let victory confetti play first
            setTimeout(() => {
                setAdvancementData({
                    fromStage: currentBracketMatch.stage || "Current Round",
                    toStage: nextMatch.stage || "Next Round",
                    tournamentName: tournamentDef?.name || tournament.name || "Tournament",
                    isChampionship
                })
                setShowAdvancement(true)
            }, 2000) // Wait 2 seconds after page load
        }
    }, [match, playerTeamId, tournaments])

    // NOTE: All useMemos below MUST run unconditionally — the early-return
    // for `!match` is BELOW them so the hooks are called in the same order
    // every render. Each memo null-guards against the placeholder match.
    const homeTeam = useMemo(
        () => match ? teams.find(t => t.id === match.homeTeamId) : undefined,
        [teams, match],
    )
    const awayTeam = useMemo(
        () => match ? teams.find(t => t.id === match.awayTeamId) : undefined,
        [teams, match],
    )

    // Index once per render of THIS match — not per Tab/map-tab click.
    // players is the full global list (1000+ entries on big saves) and was
    // being rebuilt into a Map on every setSelectedMapIndex / setActiveTab
    // change. Memoized so toggling between Overview/Analysis or clicking a
    // different map tab no longer re-allocates the index.
    const playersById = useMemo(
        () => new Map(players.map(p => [p.id, p])),
        [players],
    )

    const playerStatsList = useMemo(
        () => Object.values(match?.result.playerStats || {}),
        [match?.result.playerStats],
    )

    // Sort player rows by rating, once per data-change instead of per render.
    const homeStats = useMemo(
        () => playerStatsList
            .filter(s => resultLineup(match?.result, homeTeam?.id, homeTeam?.rosterIds).includes(s.playerId))
            .sort((a, b) => b.rating - a.rating),
        [playerStatsList, homeTeam, match?.result],
    )
    const awayStats = useMemo(
        () => playerStatsList
            .filter(s => resultLineup(match?.result, awayTeam?.id, awayTeam?.rosterIds).includes(s.playerId))
            .sort((a, b) => b.rating - a.rating),
        [playerStatsList, awayTeam, match?.result],
    )

    // Loading guard runs AFTER all hooks above so React's hook-order rule
    // holds. Non-hook derived values (homeWon, mvpPlayer, matchDate) live
    // below since they only matter after the match has loaded.
    // A fixture that is still scheduled has simply not been played yet (e.g.
    // the simulation was refused); say so instead of "not found".
    const stillScheduled = !match && scheduledMatches.some(m => m.id === id)
    if (!match) return (
        <div className="flex min-h-[60vh] items-center justify-center">
            {notFound || stillScheduled ? (
                <div role="alert" className="max-w-sm px-6 text-center">
                    <p className="font-display text-3xl font-bold uppercase text-ink-1">{stillScheduled ? "Match not played yet" : "Match not found"}</p>
                    <p className="mb-6 mt-2 text-sm text-ink-3">
                        {stillScheduled
                            ? "This match has no result yet. Return to match prep to play it; if it can't be played, advancing the week resolves it."
                            : <>This match result isn&apos;t available — it may belong to a different save or has aged out of match history.</>}
                    </p>
                    <div className="flex justify-center gap-3">
                        {stillScheduled && (
                            <Button onClick={() => router.push(`/match/${id}/tactics`)}>Back to match prep</Button>
                        )}
                        <Button variant={stillScheduled ? "outline" : "default"} onClick={() => router.push("/schedule")}>Back to schedule</Button>
                    </div>
                </div>
            ) : (
                <LoadingState message="Loading match data…" size="lg" />
            )}
        </div>
    )

    const result = match.result
    const homeWon = result.homeScore > result.awayScore
    const matchDate = getDateForWeek(match.week)
    matchDate.setUTCDate(matchDate.getUTCDate() + (match.day ?? 0))
    const getPlayer = (pid: string) => playersById.get(pid)

    const isPlayerHome = match.homeTeamId === playerTeamId
    const isPlayerAway = match.awayTeamId === playerTeamId
    const isPlayerMatch = isPlayerHome || isPlayerAway
    const playerWon = (isPlayerHome && homeWon) || (isPlayerAway && !homeWon)
    const ownTeam = isPlayerAway ? awayTeam : homeTeam
    const otherTeam = isPlayerAway ? homeTeam : awayTeam
    const ownStats = isPlayerAway ? awayStats : homeStats
    const otherStats = isPlayerAway ? homeStats : awayStats
    const winnerTeam = homeWon ? homeTeam : awayTeam

    // Next scheduled player match — surface a forward CTA so the loop self-propels
    // instead of dead-ending on the result screen. The match just finished is already
    // removed from scheduledMatches, so the soonest remaining one is genuinely "next".
    const nextPlayerMatch = scheduledMatches
        .filter(m => m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
        .sort((a, b) => (a.week !== b.week ? a.week - b.week : (a.day ?? 6) - (b.day ?? 6)))[0]
    // A match is playable now only when its week has arrived AND — in HYBRID_DAILY
    // mode — its scheduled day has too. Without the day clause this CTA routed the
    // player into a future-day match, bypassing the pacing the dashboard enforces.
    const nextMatchPlayableNow = !!nextPlayerMatch
        && nextPlayerMatch.week <= currentWeek
        && (timeMode === "WEEKLY"
            || nextPlayerMatch.week < currentWeek
            || (nextPlayerMatch.day ?? 6) <= currentDay)

    // Score shown in the headline: rounds for a single map, maps for a series.
    const playedMaps = result.maps.filter(m => m.finalScore.team1 + m.finalScore.team2 > 0)
    const isBO1 = (String(match.format).toUpperCase() === "BO1" || (result.homeScore + result.awayScore === 1 && result.maps.length === 1)) && result.maps.length > 0
    const hScore = isBO1 ? result.maps[0].finalScore.team1 : result.homeScore
    const aScore = isBO1 ? result.maps[0].finalScore.team2 : result.awayScore

    // Competition framing and tournament outcome.
    // A league fixture is named by its stage ("Europe Division 3 · Round 5").
    const leagueStage = leagueStageLabel(match)
    const isTournament = !leagueStage && !!match.tournamentId && match.tournamentId !== "SCRIM"
    const liveTournament = isTournament ? tournaments?.find(t => t.id === match.tournamentId) : undefined
    const tournamentDef = isTournament ? FULL_TOURNAMENT_CALENDAR.find(t => t.id === match.tournamentId!.replace(/_s\d+$/, '') || t.id === match.tournamentId) : undefined
    const competitionName = leagueStage ?? (isTournament ? (tournamentDef?.name || liveTournament?.name || "Tournament") : match.tournamentId === "SCRIM" ? "Scrim" : "Friendly")
    let tournamentLine: string | null = null
    if (isPlayerMatch && leagueStage) tournamentLine = playerWon ? "3 league points" : "No league points"
    if (isPlayerMatch && liveTournament?.playoffBracket) {
        const bracketMatch = liveTournament.playoffBracket.find(m => m.id === match.id)
        if (bracketMatch) {
            const stageLower = bracketMatch.stage?.toLowerCase() || ""
            const isFinal = stageLower.includes("final") && !stageLower.includes("semi") && !stageLower.includes("quarter")
            const next = liveTournament.playoffBracket.find(m => m.sourceMatchIds?.includes(match.id))
            if (playerWon && isFinal) tournamentLine = "Tournament champions"
            else if (playerWon && next) tournamentLine = `Advanced to ${next.stage || "the next round"}`
            else if (!playerWon && tournamentDef?.format === "bracket") tournamentLine = "Eliminated"
        }
    }

    // Rewards and changes for the managed team.
    const ownSide = isPlayerAway ? "away" : "home"
    const elo = match.eloChange?.[ownSide]
    const rankDelta = match.rankingChange?.[ownSide]
    const ownLineupIds = resultLineup(result, ownTeam?.id, ownTeam?.rosterIds)
    const xpEarned = ownLineupIds.reduce((s, pid) => s + (result.xpGains?.[pid] || 0), 0)
    const moneyLines = financeLedger.filter(e => e.teamId === playerTeamId && e.id.includes(match.id))
    const moneyNet = moneyLines.reduce((s, e) => s + (e.type === "INCOME" ? e.amount : -e.amount), 0)

    const headline = isPlayerMatch ? (playerWon ? "Victory" : "Defeat") : `${winnerTeam?.name ?? "Winner"} win`
    const headlineTone = isPlayerMatch ? (playerWon ? "text-positive" : "text-negative") : "text-ink-1"
    const best = (stats: PlayerMatchStats[]) => stats.length ? stats.reduce((a, b) => (b.rating > a.rating ? b : a)) : undefined
    const ownMvp = best(isPlayerMatch ? ownStats : homeStats)
    const otherMvp = best(isPlayerMatch ? otherStats : awayStats)

    const crest = (team: typeof homeTeam, align: "left" | "right", won: boolean) => (
        <div className={cn("flex min-w-0 flex-1 items-center gap-5", align === "right" && "flex-row-reverse text-right")}>
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-line bg-raised">
                <TeamLogoImage src={team?.logoPath} alt={team?.name || ""} size={60} team={team} />
            </div>
            <div className="min-w-0">
                <p className={cn("truncate font-display text-[36px] font-bold uppercase leading-none", won ? "text-ink-1" : "text-ink-2")}><TeamLink id={team?.id}>{team?.name}</TeamLink></p>
                <p className={cn("mt-2 flex items-center gap-2 text-sm text-ink-3", align === "right" && "justify-end")}>
                    World <span className="font-semibold tabular-nums text-ink-2">#{team?.worldRanking || "—"}</span>
                </p>
            </div>
        </div>
    )

    return (
        <div className="mx-auto max-w-[1600px] space-y-4 pb-16">
            {/* Actions */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1">
                    <Button variant="ghost" onClick={() => router.push("/")} className="h-9 gap-1.5 px-3 text-sm">
                        <Home size={15} aria-hidden="true" /> Back to dashboard
                    </Button>
                    <Button variant="ghost" onClick={() => router.push("/schedule")} className="h-9 gap-1.5 px-3 text-sm">
                        <Calendar size={15} aria-hidden="true" /> Schedule
                    </Button>
                    {isTournament && (
                        <Button variant="ghost" onClick={() => router.push(`/tournaments/${match.tournamentId}`)} className="h-9 gap-1.5 px-3 text-sm">
                            <Trophy size={15} aria-hidden="true" /> Tournament
                        </Button>
                    )}
                    {leagueStage && (
                        <Button variant="ghost" onClick={() => router.push("/league")} className="h-9 gap-1.5 px-3 text-sm">
                            <ListOrdered size={15} aria-hidden="true" /> League table
                        </Button>
                    )}
                </div>
                {/* The top bar's gold CONTINUE / Play match is this view's one
                    primary action; the page offers the same step as a secondary. */}
                {nextPlayerMatch && nextMatchPlayableNow ? (
                    <Button variant="outline" onClick={() => router.push(`/match/${nextPlayerMatch.id}/tactics`)} className="h-10 gap-2 px-5">
                        <Swords size={16} aria-hidden="true" /> Play next match
                    </Button>
                ) : (
                    <Button variant="outline" onClick={() => router.push("/")} className="h-10 gap-2 px-5">
                        Done <ArrowRight size={16} aria-hidden="true" />
                    </Button>
                )}
            </div>

            {/* Beat 1: the result */}
            <section className="overflow-hidden rounded-[10px] border border-line bg-panel" aria-labelledby="result-headline">
                <div className="flex items-center justify-between gap-4 border-b border-line bg-shell px-8 py-2.5 text-xs text-ink-3">
                    <span className="flex items-center gap-2">
                        {isTournament && <TierTag tier={tournamentDef?.tier || liveTournament?.tier} />}
                        {leagueStage && <span className="inline-flex items-center rounded-sm border border-line-strong px-1.5 py-0.5 text-[11px] font-semibold uppercase leading-none tracking-[0.06em] text-ink-2">League</span>}
                        <span className="font-semibold text-ink-2">{competitionName}</span>
                        {match.stage && !leagueStage && <><span aria-hidden="true">·</span><span>{match.stage}</span></>}
                        <span aria-hidden="true">·</span><span>{String(match.format || "BO1").toUpperCase()}</span>
                    </span>
                    <span className="flex items-center gap-1.5"><Calendar size={12} aria-hidden="true" />{formatGameCalendarDate(matchDate, { month: "short", day: "numeric", year: "numeric" })}</span>
                </div>
                <div className="flex items-center gap-8 px-8 py-8">
                    {crest(homeTeam, "left", homeWon)}
                    <div className="flex w-[420px] shrink-0 flex-col items-center text-center">
                        <motion.h1
                            id="result-headline"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.35, ease: "easeOut" }}
                            className={cn("font-display text-[88px] font-extrabold uppercase leading-[0.85]", headlineTone)}
                        >
                            {headline}
                        </motion.h1>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.25, delay: 0.3 }}
                            className="mt-4 flex items-center gap-5 font-display font-bold leading-none tabular-nums"
                        >
                            <span className={cn("text-[64px]", hScore >= aScore ? "text-ink-1" : "text-ink-3")}>{hScore}</span>
                            <span className="text-3xl text-ink-3" aria-hidden="true">–</span>
                            <span className={cn("text-[64px]", aScore >= hScore ? "text-ink-1" : "text-ink-3")}>{aScore}</span>
                        </motion.div>
                        <div className="mt-3 flex flex-wrap justify-center gap-2">
                            {playedMaps.map((m, idx) => (
                                <span key={idx} className="inline-flex items-center gap-2 rounded-sm border border-line px-2 py-1 text-xs">
                                    <span className="font-semibold uppercase tracking-[0.06em] text-ink-2">{MAP_NAMES[m.map] ?? m.map}</span>
                                    <span className="tabular-nums text-ink-1">{m.finalScore.team1}–{m.finalScore.team2}</span>
                                </span>
                            ))}
                        </div>
                        {tournamentLine && <p className={cn("mt-3 text-sm font-semibold", tournamentLine === "Eliminated" ? "text-negative" : tournamentLine === "No league points" ? "text-ink-3" : tournamentLine === "Tournament champions" ? "text-gold" : "text-positive")}>{tournamentLine}</p>}
                    </div>
                    {crest(awayTeam, "right", !homeWon)}
                </div>
            </section>

            {/* Beat 2: who did what */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                <Panel title="Scoreboard" padded={false} className="overflow-hidden" actions={<span className="text-xs text-ink-3">Sorted by rating</span>}>
                    {[{ team: homeTeam, stats: homeStats, won: homeWon }, { team: awayTeam, stats: awayStats, won: !homeWon }].map(({ team, stats, won }) => (
                        <PlayerStatsTable key={team?.id ?? String(won)} team={team} won={won} stats={stats} playersById={playersById} result={result} mvpId={result.mvpPlayerId} />
                    ))}
                </Panel>

                <aside className="min-w-0 space-y-4">
                    <Panel title="Standouts" padded={false}>
                        <div className="divide-y divide-line">
                            {ownMvp && <MvpCard label={isPlayerMatch ? "Your MVP" : `${homeTeam?.name} MVP`} stat={ownMvp} player={getPlayer(ownMvp.playerId)} isMatchMvp={ownMvp.playerId === result.mvpPlayerId} />}
                            {otherMvp && <MvpCard label={isPlayerMatch ? "Opponent MVP" : `${awayTeam?.name} MVP`} stat={otherMvp} player={getPlayer(otherMvp.playerId)} isMatchMvp={otherMvp.playerId === result.mvpPlayerId} />}
                        </div>
                    </Panel>

                    {isPlayerMatch && (
                        <Panel title="Rewards and changes" padded={false}>
                            <dl className="divide-y divide-line text-sm">
                                <div className="flex items-center justify-between px-4 py-2.5">
                                    <dt className="text-ink-3">Elo</dt>
                                    <dd className={cn("font-semibold tabular-nums", elo == null ? "text-ink-3" : elo >= 0 ? "text-positive" : "text-negative")}>{elo == null ? "—" : `${elo > 0 ? "+" : ""}${elo}`}</dd>
                                </div>
                                <div className="flex items-center justify-between px-4 py-2.5">
                                    <dt className="text-ink-3">World ranking</dt>
                                    <dd className="flex items-center gap-2 tabular-nums">
                                        <span className="font-semibold text-ink-1">#{ownTeam?.worldRanking || "—"}</span>
                                        {!!rankDelta && <span className={rankDelta > 0 ? "text-positive" : "text-negative"}>{rankDelta > 0 ? "▲" : "▼"}{Math.abs(rankDelta)}</span>}
                                    </dd>
                                </div>
                                <div className="flex items-center justify-between px-4 py-2.5">
                                    <dt className="text-ink-3">Player XP</dt>
                                    <dd className="font-semibold tabular-nums text-ink-1">+{xpEarned.toLocaleString("en-US")}</dd>
                                </div>
                                <div className="px-4 py-2.5">
                                    <div className="flex items-center justify-between">
                                        <dt className="text-ink-3">Money for this match</dt>
                                        <dd className={cn("font-semibold tabular-nums", moneyNet > 0 ? "text-positive" : moneyNet < 0 ? "text-ink-1" : "text-ink-3")}>
                                            {moneyLines.length ? `${moneyNet > 0 ? "+" : moneyNet < 0 ? "−" : ""}${formatCurrency(Math.abs(moneyNet), "$", false)}` : "—"}
                                        </dd>
                                    </div>
                                    {moneyLines.length > 0 && (
                                        <ul className="mt-1.5 space-y-0.5 text-xs text-ink-3">
                                            {moneyLines.map(e => (
                                                <li key={e.id} className="flex justify-between gap-3">
                                                    <span className="truncate">{e.description.replace(/: [a-z0-9_-]+$/i, "")}</span>
                                                    <span className="tabular-nums">{e.type === "INCOME" ? "+" : "−"}{formatCurrency(e.amount, "$", false)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {moneyLines.length === 0 && <p className="mt-1 text-xs text-ink-3">No prep costs or bonuses. {leagueStage ? "League prize money is paid when the split ends." : "Prize money is paid when the event ends."}</p>}
                                </div>
                            </dl>
                        </Panel>
                    )}
                </aside>
            </div>

            {isPlayerMatch && (() => {
                const insights = buildMatchInsights({
                    result,
                    teamId: playerTeamId!,
                    isHome: isPlayerHome,
                    ownLineup: resultLineup(result, ownTeam?.id, ownTeam?.rosterIds),
                    opponentLineup: resultLineup(result, otherTeam?.id, otherTeam?.rosterIds),
                    nextMatchId: nextPlayerMatch?.id,
                })
                const name = (pid?: string) => (pid && (playersById.get(pid)?.nickname || playersById.get(pid)?.name)) || "Former player"
                const why = buildMatchReasons({
                    result,
                    teamId: playerTeamId!,
                    isHome: isPlayerHome,
                    ownLineup: resultLineup(result, ownTeam?.id, ownTeam?.rosterIds),
                    opponentLineup: resultLineup(result, otherTeam?.id, otherTeam?.rosterIds),
                })
                const standout = (label: string, s?: { playerId: string; rating: number; kills: number; deaths: number }) => s && (
                    <li>{label}: <span className="font-semibold text-ink-1">{name(s.playerId)}</span> <span className="tabular-nums">{s.rating.toFixed(2)}</span> rating, <span className="tabular-nums">{s.kills}–{s.deaths}</span></li>
                )
                const card = "rounded-lg border border-line bg-panel p-4"
                return (
                    <section aria-labelledby="match-decided-heading" className="space-y-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                            <h2 id="match-decided-heading" className="font-display text-2xl font-bold uppercase text-ink-1">What decided the match</h2>
                            <p className="text-xs text-ink-3">Built from the recorded rounds, the public scoreboard and visible buys; review prompts, not proof of cause.</p>
                        </div>
                        <p className="text-sm text-ink-2">{insights.headline}</p>
                        {(() => {
                            const odds = oddsLine(match.homeExpected === undefined ? undefined : (isPlayerHome ? match.homeExpected : 1 - match.homeExpected), !!insights.won)
                            return odds ? <p className="text-sm text-ink-3" data-testid="odds-line">{odds}</p> : null
                        })()}
                        {(why.reasons.length > 0 || why.players.length > 0) && (
                            <div className="grid gap-3 md:grid-cols-2">
                                {why.reasons.length > 0 && (
                                    <div className={card} data-testid="match-reasons">
                                        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{insights.won ? "Why you won" : "Why you lost"}</h3>
                                        <ol className="space-y-2 text-sm text-ink-2">
                                            {why.reasons.map((r, i) => (
                                                <li key={r.key} className="flex gap-2">
                                                    <span className={cn("w-4 shrink-0 font-semibold tabular-nums", insights.won ? "text-positive" : "text-negative")}>{i + 1}</span>
                                                    <span>{r.text}</span>
                                                </li>
                                            ))}
                                        </ol>
                                    </div>
                                )}
                                {why.players.length > 0 && (
                                    <div className={card} data-testid="rating-reasons">
                                        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Your ratings explained</h3>
                                        <ul className="space-y-1.5 text-sm text-ink-2">
                                            {why.players.map(p => (
                                                <li key={p.playerId} className="flex gap-2">
                                                    <span className={cn("w-10 shrink-0 font-semibold tabular-nums", p.rating >= 1.1 ? "text-positive" : p.rating < 0.9 ? "text-negative" : "text-ink-1")}>{p.rating.toFixed(2)}</span>
                                                    <span><span className="font-semibold text-ink-1">{name(p.playerId)}</span>: {p.line}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                        {why.counters.length > 0 && (
                            <div className={card} data-testid="counter-reasons">
                                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Your counters</h3>
                                <ul className="space-y-1.5 text-sm text-ink-2">
                                    {why.counters.map(c => (
                                        <li key={`${c.map}-${c.side}`} className="flex gap-2">
                                            <span className={cn("w-24 shrink-0 font-semibold", c.side === "ct" ? "text-side-ct" : "text-side-t")}>{c.side.toUpperCase()}: {c.label}</span>
                                            <span><span className="tabular-nums text-ink-3">{MAP_NAMES[c.map] ?? c.map}</span> · {c.text}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {why.calls && (
                            <div className={card} data-testid="call-reasons">
                                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Your calls</h3>
                                <p className="mb-2 text-sm text-ink-2">{why.calls.text}</p>
                                <ul className="space-y-1.5 text-sm text-ink-2">
                                    {why.calls.calls.map((c, i) => (
                                        <li key={`${c.map}-${c.round}-${i}`} className="flex gap-2">
                                            <span className={cn("w-24 shrink-0 font-semibold", c.flipped === "won" ? "text-positive" : c.flipped === "lost" ? "text-negative" : "text-ink-3")}>
                                                {c.flipped === "won" ? "Won the round" : c.flipped === "lost" ? "Cost the round" : "No change"}
                                            </span>
                                            <span><span className="tabular-nums text-ink-3">{MAP_NAMES[c.map] ?? c.map} R{c.round}</span> · {c.label}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        <div className="grid gap-3 md:grid-cols-3">
                            <div className={card}>
                                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Key rounds</h3>
                                <ul className="space-y-1.5 text-sm text-ink-2">
                                    {insights.keyRounds.map(k => (
                                        <li key={`${k.map}-${k.round}-${k.label}`} className="flex gap-2">
                                            <span className={cn("w-9 shrink-0 font-semibold", k.won ? "text-positive" : "text-negative")}>{k.won ? "Won" : "Lost"}</span>
                                            <span><span className="tabular-nums text-ink-3">{MAP_NAMES[k.map] ?? k.map} R{k.round}</span> · {k.label}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className={card}>
                                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Economy</h3>
                                <ul className="space-y-1.5 text-sm text-ink-2">
                                    {insights.economy.buys.map(b => (
                                        <li key={b.buy} className="flex justify-between gap-3">
                                            <span className="capitalize">{b.buy.toLowerCase()} buys</span>
                                            <span className="tabular-nums">{b.won}/{b.played} won <span className="text-ink-3">({buyWinRate(b)}%)</span></span>
                                        </li>
                                    ))}
                                    <li className="flex justify-between gap-3 border-t border-line pt-1.5">
                                        <span>Avg spend per player per round</span>
                                        <span className="tabular-nums">{formatCurrency(insights.economy.avgSpend, "$", false)}</span>
                                    </li>
                                </ul>
                            </div>
                            <div className={card}>
                                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Players and plan</h3>
                                <ul className="space-y-1.5 text-sm text-ink-2">
                                    {standout("Your best", insights.standouts.best)}
                                    {standout("Struggled", insights.standouts.struggled)}
                                    {standout("Opponent top performer", insights.standouts.opponentBest)}
                                    {insights.tactics.map(t => <li key={t}>{t}</li>)}
                                </ul>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                            <p className="text-sm text-ink-2">{matchFollowup(isPlayerHome ? homeStats : awayStats)}</p>
                            {!result.lineups && <p className="text-xs text-ink-3">Older report: player grouping uses current rosters.</p>}
                            <div className="ml-auto flex flex-wrap gap-2">
                                {insights.actions.map(a => (
                                    <Button key={a.href + a.label} variant="outline" size="sm" title={a.reason} aria-label={`${a.label}: ${a.reason}`} onClick={() => router.push(a.href)} className="h-8 text-xs">{a.label}</Button>
                                ))}
                            </div>
                        </div>
                    </section>
                )
            })()}

            {/* Detail */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
                <TabsList>
                    <TabsTrigger value="overview">Round history</TabsTrigger>
                    <TabsTrigger value="analysis">Analysis</TabsTrigger>
                </TabsList>
            </Tabs>

            {activeTab === "overview" && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {playedMaps.map((mapResult, mapIndex) => {
                        let runHome = 0
                        let runAway = 0
                        const mHome = mapResult.homeScore ?? mapResult.finalScore.team1
                        const mAway = mapResult.awayScore ?? mapResult.finalScore.team2
                        return (
                            <Panel
                                key={mapIndex}
                                title={<><span className="text-ink-3">Map {mapIndex + 1} ·</span> {MAP_NAMES[mapResult.map] ?? mapResult.map}</>}
                                actions={<span className="font-display text-2xl font-bold tabular-nums text-ink-1">{mHome}<span className="mx-1 text-ink-3">–</span>{mAway}</span>}
                            >
                                <div className="flex flex-wrap items-end gap-[3px]">
                                    {mapResult.rounds.map((round) => {
                                        let homeWonLegacy = false
                                        if (!round.winningTeamId) homeWonLegacy = round.roundNumber <= 12 ? round.winner === "ct" : round.winner === "t"
                                        const homeWin = round.winningTeamId ? round.winningTeamId === match.homeTeamId : homeWonLegacy
                                        if (homeWin) runHome++
                                        else runAway++
                                        const sideFill = round.winner === "ct" ? "bg-side-ct" : "bg-side-t"
                                        return (
                                            <div
                                                key={round.roundNumber}
                                                className={cn("flex flex-col items-center gap-[3px]", (round.roundNumber === 13 || (round.roundNumber > 24 && (round.roundNumber - 25) % 6 === 0)) && "ml-2")}
                                                title={`Round ${round.roundNumber}: ${homeWin ? homeTeam?.name : awayTeam?.name} (${round.winner.toUpperCase()}, ${String(round.winType).toLowerCase().replace(/_/g, " ")}) · ${runHome}–${runAway}`}
                                            >
                                                <span className={cn("h-3 w-3.5 rounded-[2px]", homeWin ? sideFill : "bg-hover")} />
                                                <span className={cn("h-3 w-3.5 rounded-[2px]", !homeWin ? sideFill : "bg-hover")} />
                                                <span className="text-[11px] tabular-nums leading-none text-ink-3">{round.roundNumber % 3 === 1 ? round.roundNumber : " "}</span>
                                            </div>
                                        )
                                    })}
                                </div>
                                <div className="mt-3 flex justify-between border-t border-line pt-2 text-xs text-ink-3">
                                    <span>Top row: {homeTeam?.name || "Home"}</span>
                                    <span className="flex items-center gap-3">
                                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-[1px] bg-side-ct" />CT win</span>
                                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-[1px] bg-side-t" />T win</span>
                                    </span>
                                    <span>Bottom row: {awayTeam?.name || "Away"}</span>
                                </div>
                            </Panel>
                        )
                    })}
                </div>
            )}

            {/* ANALYSIS TAB */}
            {activeTab === "analysis" && (
                <div className="space-y-4">
                    {/* Map Selector (for multi-map matches) */}
                    {result.maps.length > 1 && (
                        <div className="flex gap-2">
                            {result.maps.map((m: MapResult, i: number) => (
                                <button
                                    key={i}
                                    onClick={() => setSelectedMapIndex(i)}
                                    aria-pressed={selectedMapIndex === i}
                                    className={cn(
                                        "rounded-[4px] border px-3 py-1.5 text-sm font-semibold transition-colors duration-150",
                                        selectedMapIndex === i ? "border-gold bg-gold/[0.06] text-ink-1" : "border-line bg-raised text-ink-3 hover:text-ink-1",
                                    )}
                                >
                                    {MAP_NAMES[m.map] ?? m.map} <span className="tabular-nums">{m.finalScore?.team1}–{m.finalScore?.team2}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        {/* Opening Duels */}
                        <Panel title="Opening duels" actions={<span className="text-xs text-ink-3">First kills / first deaths</span>}>
                            {[homeTeam, awayTeam].map((team, teamIdx) => {
                                if (!team) return null
                                const teamStats = Object.values(result.playerStats || {})
                                    .filter((s: any) => resultLineup(result, team.id, team.rosterIds).includes(s.playerId))
                                    .sort((a: any, b: any) => ((b.firstKills || 0) - (b.firstDeaths || 0)) - ((a.firstKills || 0) - (a.firstDeaths || 0)))
                                return (
                                    <div key={team.id} className={teamIdx > 0 ? "mt-4 border-t border-line pt-4" : ""}>
                                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{team.name}</p>
                                        <div className="space-y-1.5">
                                            {teamStats.map((stat: any) => {
                                                const player = playersById.get(stat.playerId)
                                                if (!player) return null
                                                const fk = stat.firstKills || 0
                                                const fd = stat.firstDeaths || 0
                                                const total = fk + fd
                                                const pctWon = total > 0 ? Math.round((fk / total) * 100) : 0
                                                return (
                                                    <div key={stat.playerId} className="grid grid-cols-[120px_minmax(0,1fr)_96px] items-center gap-3 text-sm">
                                                        <PlayerLink id={player.id} className="truncate font-semibold text-ink-1">{player.nickname}</PlayerLink>
                                                        <div className="h-1.5 overflow-hidden rounded-full bg-hover">
                                                            <div className={cn("h-full rounded-full", fk > fd ? "bg-positive" : fk < fd ? "bg-ink-3" : "bg-ink-2")} style={{ width: `${Math.max(pctWon, 4)}%` }} />
                                                        </div>
                                                        <span className="text-right text-xs tabular-nums text-ink-2">{fk} / {fd} <span className="text-ink-3">({pctWon}%)</span></span>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </Panel>

                        {/* KAST & Clutches */}
                        <Panel title="KAST and clutches" actions={<span className="text-xs text-ink-3">Rounds with a kill, assist, survival or trade</span>}>
                            {[homeTeam, awayTeam].map((team, teamIdx) => {
                                if (!team) return null
                                const teamStats = Object.values(result.playerStats || {})
                                    .filter((s: any) => resultLineup(result, team.id, team.rosterIds).includes(s.playerId))
                                    .sort((a: any, b: any) => (b.kast || 0) - (a.kast || 0))
                                return (
                                    <div key={team.id} className={teamIdx > 0 ? "mt-4 border-t border-line pt-4" : ""}>
                                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{team.name}</p>
                                        <div className="space-y-1.5">
                                            {teamStats.map((stat: any) => {
                                                const player = playersById.get(stat.playerId)
                                                if (!player) return null
                                                const kast = stat.kast || 0
                                                const clutches = stat.clutches || 0
                                                return (
                                                    <div key={stat.playerId} className="grid grid-cols-[120px_minmax(0,1fr)_56px_80px] items-center gap-3 text-sm">
                                                        <PlayerLink id={player.id} className="truncate font-semibold text-ink-1">{player.nickname}</PlayerLink>
                                                        <div className="h-1.5 overflow-hidden rounded-full bg-hover">
                                                            <div className={cn("h-full rounded-full", kast >= 75 ? "bg-positive" : "bg-ink-2")} style={{ width: `${kast}%` }} />
                                                        </div>
                                                        <span className="text-right text-xs tabular-nums text-ink-2">{Math.round(kast)}%</span>
                                                        <span className="text-right text-xs text-ink-3">{clutches > 0 ? `${clutches} clutch${clutches > 1 ? "es" : ""}` : ""}</span>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </Panel>
                    </div>

                    {/* Economy Per Round */}
                    {(() => {
                        const selectedMap = result.maps[selectedMapIndex]
                        if (!selectedMap?.rounds) return null
                        const rounds = selectedMap.rounds as any[]
                        if (rounds.length === 0) return null

                        const getTeamEconomy = (round: any, teamId: string) => {
                            const econ = round.playerEconomy || []
                            const team = teamId === match.homeTeamId ? homeTeam : awayTeam
                            const teamPlayers = econ.filter((e: any) => resultLineup(result, team?.id, team?.rosterIds).includes(e.playerId))
                            if (teamPlayers.length === 0) return 0
                            return teamPlayers.reduce((sum: number, e: any) => sum + (e.spent || 0) + (e.remaining || 0), 0) / teamPlayers.length
                        }
                        const maxMoney = 16000
                        const bars = (teamId: string, flip: boolean) => (
                            <div className={cn("flex h-20 gap-[3px]", flip ? "items-start" : "items-end")}>
                                {rounds.map((round: any, i: number) => {
                                    const avgMoney = getTeamEconomy(round, teamId)
                                    const height = Math.max(4, Math.min(100, (avgMoney / maxMoney) * 100))
                                    const won = round.winningTeamId === teamId
                                    return (
                                        <div
                                            key={i}
                                            className={cn("flex-1", flip ? "rounded-b-[2px]" : "rounded-t-[2px]", won ? "bg-ink-1" : "bg-ink-3/50")}
                                            style={{ height: `${height}%` }}
                                            title={`R${i + 1}: ${formatCurrency(Math.round(avgMoney), "$", false)} avg${won ? " · won" : ""}`}
                                        />
                                    )
                                })}
                            </div>
                        )
                        return (
                            <Panel title={`Round economy · ${MAP_NAMES[selectedMap.map] ?? selectedMap.map}`} actions={<span className="text-xs text-ink-3">Average money per player at round start · bright = round won</span>}>
                                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{homeTeam?.name}</p>
                                {bars(match.homeTeamId, false)}
                                <div className="my-1 flex gap-[3px]">
                                    {rounds.map((_: any, i: number) => (
                                        <span key={i} className="flex-1 text-center text-[11px] tabular-nums text-ink-3">{(i + 1) % 3 === 1 ? i + 1 : ""}</span>
                                    ))}
                                </div>
                                {bars(match.awayTeamId, true)}
                                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{awayTeam?.name}</p>
                            </Panel>
                        )
                    })()}
                </div>
            )}

            {/* Tournament Advancement Animation */}
            {advancementData && (
                <AdvancementAnimation
                    show={showAdvancement}
                    fromStage={advancementData.fromStage}
                    toStage={advancementData.toStage}
                    teamName={teams.find(t => t.id === playerTeamId)?.name || "Your Team"}
                    teamLogo={teams.find(t => t.id === playerTeamId)?.logoPath}
                    tournamentName={advancementData.tournamentName}
                    isChampionship={advancementData.isChampionship}
                    onComplete={() => setShowAdvancement(false)}
                />
            )}
        </div>
    )
}

function MvpCard({ label, stat, player, isMatchMvp }: { label: string; stat: PlayerMatchStats; player?: PlayerSaveData; isMatchMvp: boolean }) {
    return (
        <div className="flex items-center gap-4 p-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-raised">
                <PlayerPortrait src={player?.portraitPath} seed={player?.id} alt={player?.nickname || "Player"} size={64} />
            </div>
            <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                    {label}
                    {isMatchMvp && <span className="inline-flex items-center gap-1 text-gold"><Trophy size={11} aria-hidden="true" /> Match MVP</span>}
                </p>
                <p className="truncate font-display text-[26px] font-bold uppercase leading-tight text-ink-1"><PlayerLink id={player?.id}>{player?.nickname ?? "Former player"}</PlayerLink></p>
                <p className="text-xs tabular-nums text-ink-3">
                    {stat.kills}–{stat.deaths} · {Math.round(stat.adr)} ADR{typeof stat.kast === "number" ? ` · ${Math.round(stat.kast)}% KAST` : ""}
                </p>
            </div>
            <div className="text-right">
                <p className="font-display text-[32px] font-bold leading-none tabular-nums text-ink-1">{stat.rating.toFixed(2)}</p>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Rating</p>
            </div>
        </div>
    )
}

/** Match rating (≈1.00 average): bright above 1.15, quiet below 0.85; red is kept for real problems. */
const matchRatingTone = (r: number) => r >= 1.15 ? "text-positive" : r < 0.85 ? "text-ink-3" : "text-ink-1"

function PlayerStatsTable({ team, won, stats, playersById, result, mvpId }: {
    team: { id: string; name: string; logoPath?: string } | undefined
    won: boolean
    stats: PlayerMatchStats[]
    playersById: Map<string, PlayerSaveData>
    result: MatchResult
    mvpId: string
}) {
    return (
        <table data-slot="table" className="w-full border-collapse text-left">
            <thead data-slot="table-header">
                <tr className="border-y border-line first:border-t-0">
                    <th data-slot="table-head" className="pl-4">
                        <span className="flex items-center gap-2 normal-case tracking-normal">
                            <TeamLogoImage src={team?.logoPath} alt="" team={team as any} size={18} />
                            <TeamLink id={team?.id} className="font-display text-base font-bold uppercase text-ink-1">{team?.name}</TeamLink>
                            <span className={cn("text-[11px] font-semibold uppercase tracking-[0.06em]", won ? "text-positive" : "text-ink-3")}>{won ? "Won" : "Lost"}</span>
                        </span>
                    </th>
                    <th data-slot="table-head" className="px-2 text-right">K</th>
                    <th data-slot="table-head" className="px-2 text-right">D</th>
                    <th data-slot="table-head" className="px-2 text-right">A</th>
                    <th data-slot="table-head" className="px-2 text-right">+/−</th>
                    <th data-slot="table-head" className="px-2 text-right">ADR</th>
                    <th data-slot="table-head" className="px-2 text-right">KAST</th>
                    <th data-slot="table-head" className="px-2 text-right">XP</th>
                    <th data-slot="table-head" className="pr-4 text-right">Rating</th>
                </tr>
            </thead>
            <tbody>
                {stats.map((stat) => {
                    const player = playersById.get(stat.playerId)
                    const diff = stat.kills - stat.deaths
                    return (
                        <tr key={stat.playerId} data-slot="table-row" className="h-11 border-b border-line">
                            <td className="py-1.5 pl-4 pr-2">
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-raised">
                                        <PlayerPortrait src={player?.portraitPath} seed={player?.id} alt={player?.nickname || "Player"} size={32} />
                                    </div>
                                    <CountryFlag country={player?.nationality || ""} size={14} />
                                    <PlayerLink id={player?.id} className="truncate text-sm font-semibold text-ink-1">{player?.nickname ?? "Former player"}</PlayerLink>
                                    {stat.playerId === mvpId && <Trophy size={13} className="shrink-0 text-gold" aria-label="Match MVP" />}
                                    <RoleTag role={player?.role} className="ml-1" />
                                </div>
                            </td>
                            <td className="px-2 text-right text-sm font-semibold tabular-nums text-ink-1">{stat.kills}</td>
                            <td className="px-2 text-right text-sm tabular-nums text-ink-2">{stat.deaths}</td>
                            <td className="px-2 text-right text-sm tabular-nums text-ink-2">{stat.assists}</td>
                            <td className={cn("px-2 text-right text-sm tabular-nums", diff > 0 ? "text-positive" : diff < 0 ? "text-ink-3" : "text-ink-2")}>{diff > 0 ? "+" : ""}{diff}</td>
                            <td className="px-2 text-right text-sm tabular-nums text-ink-2">{Math.round(stat.adr)}</td>
                            <td className="px-2 text-right text-sm tabular-nums text-ink-2">{typeof stat.kast === "number" ? `${Math.round(stat.kast)}%` : "—"}</td>
                            <td className="px-2 text-right text-xs tabular-nums text-ink-3">+{result.xpGains?.[stat.playerId] || 0}</td>
                            <td className={cn("pr-4 text-right font-display text-lg font-bold tabular-nums", matchRatingTone(stat.rating))}>{stat.rating.toFixed(2)}</td>
                        </tr>
                    )
                })}
            </tbody>
        </table>
    )
}
