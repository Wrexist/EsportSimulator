"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Home, Trophy, Swords, Map as MapIcon, Calendar, Clock, ArrowLeft, Star } from "lucide-react"
import { CompletedMatchSaveData, PlayerSaveData } from "@/engine"
import { PlayerMatchStats, MapResult, RoundResult, MatchResult } from "@/types"
import { motion, useSpring, useTransform, AnimatePresence } from "framer-motion"
import Image from "next/image"
import { format } from "date-fns"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { cn } from "@/lib/utils"
import { PlayerPortrait, TeamLogoImage } from "@/components/ui/asset-images"
import { fireConfetti, preloadConfetti } from "@/lib/confetti-lazy"
import { AdvancementAnimation } from "@/components/tournament/AdvancementAnimation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TournamentMatchContext } from "@/components/tournament/TournamentMatchContext"
import { FULL_TOURNAMENT_CALENDAR } from "@/data/tournament-calendar"

// Animated counter component for stats.
// Earlier version had a bug: the inner `return () => clearInterval(timer)` was
// returning from the setTimeout callback, not from useEffect. If the component
// unmounted while the interval was still running it kept ticking. Track the
// interval id via ref so the real useEffect cleanup can always cancel it.
function AnimatedNumber({ value, duration = 1.5, delay = 0 }: { value: number, duration?: number, delay?: number }) {
    const [displayValue, setDisplayValue] = useState(0)
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    useEffect(() => {
        const timeout = setTimeout(() => {
            let start = 0
            const increment = value / (duration * 60)
            intervalRef.current = setInterval(() => {
                start += increment
                if (start >= value) {
                    setDisplayValue(value)
                    if (intervalRef.current) clearInterval(intervalRef.current)
                    intervalRef.current = null
                } else {
                    setDisplayValue(Math.floor(start))
                }
            }, 1000 / 60)
        }, delay * 1000)
        return () => {
            clearTimeout(timeout)
            if (intervalRef.current) clearInterval(intervalRef.current)
            intervalRef.current = null
        }
    }, [value, duration, delay])

    return <>{displayValue}</>
}

export default function MatchResultPage({ params }: { params: { id: string } }) {
    const { id } = params
    const router = useRouter()
    const { completedMatches, teams, players, getDateForWeek, clearActiveMatchState, playerTeamId, tournaments } = useGameStore(useShallow(state => ({
        completedMatches: state.completedMatches,
        teams: state.teams,
        players: state.players,
        getDateForWeek: state.getDateForWeek,
        clearActiveMatchState: state.clearActiveMatchState,
        playerTeamId: state.playerTeamId,
        tournaments: state.tournaments,
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

    useEffect(() => {
        const found = completedMatches.find(m => m.id === id)
        if (found) setMatch(found)
    }, [completedMatches, id])

    // Trigger confetti on player victory
    useEffect(() => {
        if (!match || confettiTriggered.current) return

        const isPlayerHome = match.homeTeamId === playerTeamId
        const isPlayerAway = match.awayTeamId === playerTeamId
        const homeWon = match.result.homeScore > match.result.awayScore
        const playerWon = (isPlayerHome && homeWon) || (isPlayerAway && !homeWon)

        if (playerWon) {
            confettiTriggered.current = true

            // Preload then fire the burst — keeps canvas-confetti out of the
            // critical bundle for non-winning paths.
            preloadConfetti().then(() => {
                const duration = 3000
                const end = Date.now() + duration

                const frame = () => {
                    fireConfetti({
                        particleCount: 3,
                        angle: 60,
                        spread: 55,
                        origin: { x: 0, y: 0.7 },
                        colors: ['#10b981', '#22d3ee', '#3b82f6', '#fbbf24']
                    })
                    fireConfetti({
                        particleCount: 3,
                        angle: 120,
                        spread: 55,
                        origin: { x: 1, y: 0.7 },
                        colors: ['#10b981', '#22d3ee', '#3b82f6', '#fbbf24']
                    })

                    if (Date.now() < end) {
                        requestAnimationFrame(frame)
                    }
                }

                fireConfetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 0.6 },
                    colors: ['#10b981', '#22d3ee', '#3b82f6', '#fbbf24', '#ffffff']
                })

                setTimeout(frame, 250)
            })
        }

        return () => {
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

    if (!match) return (
        <div className="min-h-screen bg-[#0e1217] flex items-center justify-center">
            <div className="text-center">
                <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground text-sm font-bold uppercase tracking-widest">Loading Match Data...</p>
            </div>
        </div>
    )

    const homeTeam = teams.find(t => t.id === match.homeTeamId)
    const awayTeam = teams.find(t => t.id === match.awayTeamId)
    const result = match.result
    const homeWon = result.homeScore > result.awayScore
    const matchDate = getDateForWeek(match.week)

    // Was: `players.find` was called 3+ times in nested .map() loops over
    // playerStats rows — O(players × rows). Index once.
    const playersById = new Map(players.map(p => [p.id, p]))
    const getPlayer = (id: string) => playersById.get(id)
    const mvpPlayer = getPlayer(result.mvpPlayerId)

    // Helper to get stats for the current view (Overall or Specific Map)
    // Currently match.result.playerStats is OVERALL.
    // If we want per-map, we'd need to aggregate from rounds or have it stored.
    // For V1, we'll show Overall Stats.
    const playerStatsList = Object.values(result.playerStats || {})

    // Sort players by Rating
    const homeStats = playerStatsList
        .filter(s => homeTeam?.rosterIds.includes(s.playerId))
        .sort((a, b) => b.rating - a.rating)

    const awayStats = playerStatsList
        .filter(s => awayTeam?.rosterIds.includes(s.playerId))
        .sort((a, b) => b.rating - a.rating)

    return (
        <div className="min-h-screen bg-[#0e1217] text-white p-6 pb-20 space-y-8">
            {/* Header / Nav */}
            <div className="max-w-7xl mx-auto flex items-center gap-4">
                <Button
                    variant="ghost"
                    onClick={() => router.push("/")}
                    className="text-muted-foreground hover:text-white hover:bg-white/5"
                >
                    <Home size={18} className="mr-2" /> Back to Dashboard
                </Button>

                <Button
                    variant="ghost"
                    onClick={() => router.push("/schedule")}
                    className="text-muted-foreground hover:text-white hover:bg-white/5"
                >
                    <Calendar size={16} className="mr-2" /> Schedule
                </Button>

                {match.tournamentId && match.tournamentId !== "SCRIM" && (
                    <Button
                        variant="outline"
                        onClick={() => router.push(`/tournaments/${match.tournamentId}`)}
                        className="border-amber-500/20 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
                    >
                        <Trophy size={16} className="mr-2" /> Go to Tournament
                    </Button>
                )}
            </div>

            {/* Tournament Context - Post-match */}
            {match.tournamentId && match.tournamentId !== "SCRIM" && (() => {
                const liveTournament = tournaments?.find(t => t.id === match.tournamentId)
                const baseId = match.tournamentId.replace(/_s\d+$/, '')
                const tournamentDef = FULL_TOURNAMENT_CALENDAR.find(t => t.id === baseId || t.id === match.tournamentId)

                const isPlayerHome = match.homeTeamId === playerTeamId
                const isPlayerAway = match.awayTeamId === playerTeamId
                const isPlayerMatch = isPlayerHome || isPlayerAway
                const playerWon = isPlayerMatch && ((isPlayerHome && homeWon) || (isPlayerAway && !homeWon))

                let advanced: boolean | undefined
                let nextStageName: string | undefined
                let isChampion = false

                if (liveTournament?.playoffBracket) {
                    const currentBracketMatch = liveTournament.playoffBracket.find(m => m.id === match.id)
                    if (currentBracketMatch) {
                        const stageLower = currentBracketMatch.stage?.toLowerCase() || ""
                        const isFinal = stageLower.includes("grand final") ||
                            stageLower === "final" || stageLower === "finals" ||
                            (stageLower.includes("final") && !stageLower.includes("semi") && !stageLower.includes("quarter"))

                        if (playerWon && isFinal) {
                            isChampion = true
                            advanced = true
                        } else {
                            const nextMatch = liveTournament.playoffBracket.find(m =>
                                m.sourceMatchIds?.includes(match.id)
                            )
                            if (playerWon && nextMatch) {
                                advanced = true
                                nextStageName = nextMatch.stage || undefined
                            } else if (!playerWon && tournamentDef?.format === "bracket") {
                                advanced = false
                            }
                        }
                    }
                }

                const outcome = isPlayerMatch ? {
                    won: !!playerWon,
                    advanced,
                    nextStageName,
                    isChampion
                } : undefined

                return (
                    <div className="max-w-7xl mx-auto">
                        <TournamentMatchContext
                            tournamentName={tournamentDef?.name || liveTournament?.name || "Tournament"}
                            tournamentLogo={tournamentDef?.logoPath}
                            tournamentTier={tournamentDef?.tier || liveTournament?.tier}
                            currentStage={match.stage || undefined}
                            matchFormat={match.format}
                            prizePool={tournamentDef?.prizePool}
                            isElimination={tournamentDef?.format === "bracket"}
                            nextStage={nextStageName}
                            outcome={outcome}
                            className="rounded-xl"
                        />
                    </div>
                )
            })()}

            {/* HERO SECTION */}
            <div className="max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-panel rounded-xl p-12 relative overflow-hidden border-white/5"
                >
                    {/* Background Glows */}
                    <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                        <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-cyan-200/30 to-transparent" />
                    </div>

                    <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-12">

                        {/* HOME TEAM */}
                        <div className="flex flex-col items-center gap-6 flex-1">
                            <div className="w-32 h-32 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shadow-glass-soft relative group">
                                <TeamLogoImage
                                    src={homeTeam?.logoPath}
                                    alt={homeTeam?.name || "Home"}
                                    size={80}
                                    team={homeTeam}
                                />
                                {homeWon && (
                                    <div className="absolute -top-4 -right-4 bg-emerald-500 text-black font-normal text-xs px-3 py-1 rounded-full shadow-lg border-2 border-[#0e1217]">
                                        WINNER
                                    </div>
                                )}
                            </div>
                            <div className="text-center">
                                <h2 className="text-3xl font-normal tracking-tight">{homeTeam?.name}</h2>
                                <div className="flex items-center justify-center gap-3 mt-1">
                                    <span className="text-xs font-bold text-white/40 tracking-widest uppercase">
                                        #{homeTeam?.worldRanking || "-"} World
                                    </span>
                                    {match.rankingChange && match.rankingChange.home !== 0 && (
                                        <Badge variant="outline" className={cn("text-[10px] border-white/10 h-5 px-1.5", match.rankingChange.home > 0 ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10")}>
                                            {match.rankingChange.home > 0 ? "▲" : "▼"}{Math.abs(match.rankingChange.home)}
                                        </Badge>
                                    )}
                                    {match.eloChange && (
                                        <Badge variant="outline" className={cn("text-[10px] border-white/10 h-5 px-1.5", match.eloChange.home >= 0 ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10")}>
                                            {match.eloChange.home > 0 ? "+" : ""}{match.eloChange.home} ELO
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-xs font-bold text-muted-foreground tracking-widest uppercase mt-2">HOME</p>
                            </div>
                        </div>

                        {/* SCOREBOARD CENTER */}
                        <div className="flex flex-col items-center gap-6">
                            <Badge variant="outline" className="bg-white/5 border-white/10 text-muted-foreground px-4 py-1.5 rounded-full text-[10px] font-normal uppercase tracking-[0.2em] mb-4">
                                {match.format} SERIES {match.stage ? `• ${match.stage}` : `• WEEK ${match.week}`}
                            </Badge>

                            {/* Score Display Logic: Round score for BO1, Map score for others */}
                            {(() => {
                                const isBO1 = match.format === "bo1" || (result.homeScore + result.awayScore === 1 && result.maps.length === 1);
                                const hScore = isBO1 ? result.maps[0].finalScore.team1 : result.homeScore;
                                const aScore = isBO1 ? result.maps[0].finalScore.team2 : result.awayScore;

                                return (
                                    <div className="flex items-center gap-8">
                                        <span className={cn("text-7xl font-normal tracking-tighter", hScore >= aScore ? "liquid-text" : "text-white/30")}>
                                            {hScore}
                                        </span>
                                        <div className="h-12 w-px bg-white/10 rotate-12" />
                                        <span className={cn("text-7xl font-normal tracking-tighter", aScore >= hScore ? "liquid-text" : "text-white/30")}>
                                            {aScore}
                                        </span>
                                    </div>
                                );
                            })()}

                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                <Calendar size={12} />
                                <span>{format(matchDate, "MMM d, yyyy")}</span>
                            </div>
                        </div>

                        {/* AWAY TEAM */}
                        <div className="flex flex-col items-center gap-6 flex-1">
                            <div className="w-32 h-32 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shadow-glass-soft relative group">
                                <TeamLogoImage
                                    src={awayTeam?.logoPath}
                                    alt={awayTeam?.name || "Away"}
                                    size={80}
                                    team={awayTeam}
                                />
                                {!homeWon && (
                                    <div className="absolute -top-4 -right-4 bg-emerald-500 text-black font-normal text-xs px-3 py-1 rounded-full shadow-lg border-2 border-[#0e1217]">
                                        WINNER
                                    </div>
                                )}
                            </div>
                            <div className="text-center">
                                <h2 className="text-3xl font-normal tracking-tight">{awayTeam?.name}</h2>
                                <div className="flex items-center justify-center gap-3 mt-1">
                                    <span className="text-xs font-bold text-white/40 tracking-widest uppercase">
                                        #{awayTeam?.worldRanking || "-"} World
                                    </span>
                                    {match.rankingChange && match.rankingChange.away !== 0 && (
                                        <Badge variant="outline" className={cn("text-[10px] border-white/10 h-5 px-1.5", match.rankingChange.away > 0 ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10")}>
                                            {match.rankingChange.away > 0 ? "▲" : "▼"}{Math.abs(match.rankingChange.away)}
                                        </Badge>
                                    )}
                                    {match.eloChange && (
                                        <Badge variant="outline" className={cn("text-[10px] border-white/10 h-5 px-1.5", match.eloChange.away >= 0 ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10")}>
                                            {match.eloChange.away > 0 ? "+" : ""}{match.eloChange.away} ELO
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-xs font-bold text-muted-foreground tracking-widest uppercase mt-2">AWAY</p>
                            </div>
                        </div>

                    </div>

                    {/* MAP RESULTS FOOTER */}
                    <div className="mt-12 flex justify-center gap-4">
                        {result.maps.filter(m => m.finalScore.team1 + m.finalScore.team2 > 0).map((m, idx) => (
                            <div key={idx} className="flex flex-col items-center gap-2 p-3 rounded-lg bg-white/5 border border-white/10 min-w-[120px]">
                                <span className="text-[10px] font-normal uppercase tracking-widest text-muted-foreground">{m.map}</span>
                                <div className="flex items-center gap-2 font-sans font-bold text-lg">
                                    <span className={m.finalScore.team1 > m.finalScore.team2 ? "text-emerald-400" : "text-white/50"}>{m.finalScore.team1}</span>
                                    <span className="text-white/20">:</span>
                                    <span className={m.finalScore.team2 > m.finalScore.team1 ? "text-emerald-400" : "text-white/50"}>{m.finalScore.team2}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>

            {/* TAB NAVIGATION */}
            <div className="max-w-7xl mx-auto mb-6">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
                    <TabsList className="bg-white/5 border border-white/10">
                        <TabsTrigger value="overview" className="data-[state=active]:bg-white/10">Overview</TabsTrigger>
                        <TabsTrigger value="analysis" className="data-[state=active]:bg-white/10">Analysis</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* STATS & MVP LAYOUT (Overview Tab) */}
            {activeTab === "overview" && <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* LEFT COL: MVP */}
                <div className="space-y-8">
                    {mvpPlayer && (
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1 }}
                            className="glass-panel p-8 rounded-xl border-amber-500/20 bg-amber-500/5 relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-20">
                                <Trophy size={120} className="text-amber-500" />
                            </div>

                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-6">
                                    <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/50 hover:bg-amber-500/30">MATCH MVP</Badge>
                                </div>

                                <div className="flex items-center gap-6 mb-6">
                                    <div className="w-20 h-20 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center overflow-hidden">
                                        <PlayerPortrait
                                            src={mvpPlayer.portraitPath}
                                            alt={mvpPlayer.nickname}
                                            size={80}
                                        />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-normal text-white">{mvpPlayer.nickname}</h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <CountryFlag country={mvpPlayer.nationality} size={12} showName />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 bg-black/20 rounded-lg border border-white/5">
                                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Rating</p>
                                        <p className="text-2xl font-normal text-amber-400">{result.playerStats[mvpPlayer.id]?.rating.toFixed(2)}</p>
                                    </div>
                                    <div className="p-3 bg-black/20 rounded-lg border border-white/5">
                                        <p className="text-[10px] uppercase font-bold text-muted-foreground">K/D Diff</p>
                                        <p className="text-2xl font-normal text-white">
                                            {result.playerStats[mvpPlayer.id] ?
                                                (result.playerStats[mvpPlayer.id].kills - result.playerStats[mvpPlayer.id].deaths > 0 ? "+" : "") +
                                                (result.playerStats[mvpPlayer.id].kills - result.playerStats[mvpPlayer.id].deaths)
                                                : 0}
                                        </p>
                                    </div>
                                    <div className="p-3 bg-black/20 rounded-lg border border-white/5">
                                        <p className="text-[10px] uppercase font-bold text-muted-foreground">ADR</p>
                                        <p className="text-xl font-bold text-white">{Math.round(result.playerStats[mvpPlayer.id]?.adr || 0)}</p>
                                    </div>
                                    <div className="p-3 bg-black/20 rounded-lg border border-white/5">
                                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Kills</p>
                                        <p className="text-xl font-bold text-white">{result.playerStats[mvpPlayer.id]?.kills || 0}</p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Round History - All Maps with Running Score */}
                    {result.maps.length > 0 && (
                        <div className="space-y-4">
                            {result.maps.filter(m => m.finalScore.team1 + m.finalScore.team2 > 0).map((mapResult, mapIndex) => {
                                let homeScore = 0
                                let awayScore = 0

                                return (
                                    <div key={mapIndex} className="glass-panel p-6 rounded-xl border-white/5">
                                        {/* Map Header */}
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-sm font-normal text-white uppercase tracking-widest flex items-center gap-2">
                                                <Clock size={14} className="text-primary" />
                                                {mapResult.map}
                                                <Badge variant="outline" className="text-[10px] border-white/10 ml-2">
                                                    Map {mapIndex + 1}
                                                </Badge>
                                            </h3>
                                            <div className="flex items-center gap-2 text-lg font-normal">
                                                <span className={(mapResult.homeScore ?? mapResult.finalScore.team1) > (mapResult.awayScore ?? mapResult.finalScore.team2) ? "text-emerald-400" : "text-white/50"}>
                                                    {mapResult.homeScore ?? mapResult.finalScore.team1}
                                                </span>
                                                <span className="text-white/20">:</span>
                                                <span className={(mapResult.awayScore ?? mapResult.finalScore.team2) > (mapResult.homeScore ?? mapResult.finalScore.team1) ? "text-emerald-400" : "text-white/50"}>
                                                    {mapResult.awayScore ?? mapResult.finalScore.team2}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Round-by-round visualization */}
                                        <div className="flex flex-wrap gap-1 items-end">
                                            {mapResult.rounds.map((round) => {
                                                const isHomeWin = round.winningTeamId === match.homeTeamId
                                                let homeWonLegacy = false
                                                if (!round.winningTeamId) {
                                                    if (round.roundNumber <= 12) {
                                                        homeWonLegacy = round.winner === "ct"
                                                    } else {
                                                        homeWonLegacy = round.winner === "t"
                                                    }
                                                }
                                                const actuallyHomeWin = round.winningTeamId ? isHomeWin : homeWonLegacy

                                                // Update running score
                                                if (actuallyHomeWin) homeScore++
                                                else awayScore++

                                                // Current running score for tooltip
                                                const currentScore = `${homeScore}-${awayScore}`

                                                return (
                                                    <div key={round.roundNumber} className="flex flex-col items-center">
                                                        {/* Half-time indicator */}
                                                        {round.roundNumber === 13 && (
                                                            <div className="text-[8px] text-amber-400/60 mb-1 font-normal tracking-wider">
                                                                HALF
                                                            </div>
                                                        )}

                                                        {/* Round block */}
                                                        <div
                                                            className={cn(
                                                                "w-6 h-8 rounded-md flex items-center justify-center text-[9px] font-bold border transition-all hover:-translate-y-0.5 cursor-default",
                                                                actuallyHomeWin
                                                                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                                                                    : "bg-red-500/20 border-red-500/40 text-red-400",
                                                                round.roundNumber === 13 && "ml-3" // Half-time spacer
                                                            )}
                                                            title={`Round ${round.roundNumber}: ${actuallyHomeWin ? homeTeam?.name : awayTeam?.name} wins (${round.winType}) | Score: ${currentScore}`}
                                                        >
                                                            {round.roundNumber}
                                                        </div>

                                                        {/* Running score under each round */}
                                                        <div className="text-[8px] text-white/30 mt-0.5 font-sans">
                                                            {currentScore}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>

                                        {/* Legend */}
                                        <div className="flex justify-between mt-4 pt-3 border-t border-white/5 text-[10px] font-bold text-muted-foreground">
                                            <span className="flex items-center gap-2">
                                                <div className="w-3 h-3 bg-emerald-500/30 border border-emerald-500/50 rounded" />
                                                {homeTeam?.name || "Home"}
                                                <span className="text-emerald-400 font-normal">
                                                    ({mapResult.homeScore ?? mapResult.finalScore.team1} rounds)
                                                </span>
                                            </span>
                                            <span className="flex items-center gap-2">
                                                <span className="text-red-400 font-normal">
                                                    ({mapResult.awayScore ?? mapResult.finalScore.team2} rounds)
                                                </span>
                                                {awayTeam?.name || "Away"}
                                                <div className="w-3 h-3 bg-red-500/30 border border-red-500/50 rounded" />
                                            </span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* RIGHT COL: SCOREBOARD */}
                <div className="lg:col-span-2 space-y-8">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="glass-panel p-8 rounded-xl border-white/5 bg-black/20"
                    >
                        <h3 className="text-lg font-normal text-white mb-6 flex items-center gap-3">
                            <Swords size={20} className="text-primary" />
                            COMBAT STATISTICS
                        </h3>

                        {/* HOME TABLE */}
                        <div className="mb-8">
                            <div className="flex items-center justify-between mb-4 px-2">
                                <h4 className="font-bold text-white flex items-center gap-2">
                                    <span className={cn("w-2 h-2 rounded-full", homeWon ? "bg-emerald-500" : "bg-red-500")} />
                                    {homeTeam?.name}
                                </h4>
                                <Badge variant="outline" className="border-white/10 text-xs">{result.homeScore}</Badge>
                            </div>
                            <PlayerStatsTable stats={homeStats} players={players} result={result} />
                        </div>

                        {/* AWAY TABLE */}
                        <div>
                            <div className="flex items-center justify-between mb-4 px-2">
                                <h4 className="font-bold text-white flex items-center gap-2">
                                    <span className={cn("w-2 h-2 rounded-full", !homeWon ? "bg-emerald-500" : "bg-red-500")} />
                                    {awayTeam?.name}
                                </h4>
                                <Badge variant="outline" className="border-white/10 text-xs">{result.awayScore}</Badge>
                            </div>
                            <PlayerStatsTable stats={awayStats} players={players} result={result} />
                        </div>

                    </motion.div>
                </div>

            </div>}

            {/* ANALYSIS TAB */}
            {activeTab === "analysis" && (
                <div className="max-w-7xl mx-auto space-y-8">
                    {/* Map Selector (for multi-map matches) */}
                    {result.maps.length > 1 && (
                        <div className="flex gap-2">
                            {result.maps.map((m: MapResult, i: number) => (
                                <button
                                    key={i}
                                    onClick={() => setSelectedMapIndex(i)}
                                    className={cn(
                                        "px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wider transition-all border",
                                        selectedMapIndex === i
                                            ? "bg-primary/20 border-primary/40 text-primary"
                                            : "bg-white/5 border-white/10 text-white/40 hover:text-white"
                                    )}
                                >
                                    {m.map} ({m.finalScore?.team1}-{m.finalScore?.team2})
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Opening Duels & KAST */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Opening Duels */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="glass-panel p-6 rounded-xl"
                        >
                            <h3 className="text-sm font-bold uppercase tracking-widest text-white/40 mb-6">Opening Duels</h3>
                            {[homeTeam, awayTeam].map((team, teamIdx) => {
                                if (!team) return null
                                const teamStats = Object.values(result.playerStats || {})
                                    .filter((s: any) => team.rosterIds?.includes(s.playerId))
                                    .sort((a: any, b: any) => {
                                        const aRatio = (a.firstKills || 0) - (a.firstDeaths || 0)
                                        const bRatio = (b.firstKills || 0) - (b.firstDeaths || 0)
                                        return bRatio - aRatio
                                    })
                                return (
                                    <div key={team.id} className={teamIdx > 0 ? "mt-4 pt-4 border-t border-white/5" : ""}>
                                        <div className="flex items-center gap-2 mb-3">
                                            <TeamLogoImage src={team.logoPath} alt={team.name} team={team} size={16} className="rounded-sm" />
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/30">{team.name}</span>
                                        </div>
                                        <div className="space-y-2">
                                            {teamStats.map((stat: any) => {
                                                const player = playersById.get(stat.playerId)
                                                if (!player) return null
                                                const fk = stat.firstKills || 0
                                                const fd = stat.firstDeaths || 0
                                                const total = fk + fd
                                                const pct = total > 0 ? Math.round((fk / total) * 100) : 0
                                                const diff = fk - fd
                                                return (
                                                    <div key={stat.playerId} className="flex items-center gap-3">
                                                        <span className="text-xs font-bold text-white w-24 truncate">{player.nickname}</span>
                                                        <div className="flex-1 h-6 rounded-lg bg-white/5 overflow-hidden relative">
                                                            <div
                                                                className={cn(
                                                                    "h-full rounded-lg",
                                                                    diff > 0 ? "bg-gradient-to-r from-emerald-500/70 to-emerald-400/40" :
                                                                    diff < 0 ? "bg-gradient-to-r from-red-500/50 to-red-400/30" :
                                                                    "bg-gradient-to-r from-white/20 to-white/10"
                                                                )}
                                                                style={{ width: `${Math.max(pct, 8)}%` }}
                                                            />
                                                            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow-sm">
                                                                {fk}FK / {fd}FD ({pct}%)
                                                            </span>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </motion.div>

                        {/* KAST & Clutches */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="glass-panel p-6 rounded-xl"
                        >
                            <h3 className="text-sm font-bold uppercase tracking-widest text-white/40 mb-6">KAST % & Clutches</h3>
                            {[homeTeam, awayTeam].map((team, teamIdx) => {
                                if (!team) return null
                                const teamStats = Object.values(result.playerStats || {})
                                    .filter((s: any) => team.rosterIds?.includes(s.playerId))
                                    .sort((a: any, b: any) => (b.kast || 0) - (a.kast || 0))
                                return (
                                    <div key={team.id} className={teamIdx > 0 ? "mt-4 pt-4 border-t border-white/5" : ""}>
                                        <div className="flex items-center gap-2 mb-3">
                                            <TeamLogoImage src={team.logoPath} alt={team.name} team={team} size={16} className="rounded-sm" />
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/30">{team.name}</span>
                                        </div>
                                        <div className="space-y-2">
                                            {teamStats.map((stat: any) => {
                                                const player = playersById.get(stat.playerId)
                                                if (!player) return null
                                                const kast = stat.kast || 0
                                                const clutches = stat.clutches || 0
                                                return (
                                                    <div key={stat.playerId} className="flex items-center gap-3">
                                                        <span className="text-xs font-bold text-white w-24 truncate">{player.nickname}</span>
                                                        <div className="flex-1 h-6 rounded-lg bg-white/5 overflow-hidden">
                                                            <div
                                                                className={cn(
                                                                    "h-full rounded-lg",
                                                                    kast >= 80 ? "bg-gradient-to-r from-emerald-500/70 to-emerald-400/40" :
                                                                    kast >= 60 ? "bg-gradient-to-r from-sky-500/60 to-sky-400/30" :
                                                                    "bg-gradient-to-r from-white/20 to-white/10"
                                                                )}
                                                                style={{ width: `${kast}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-[11px] font-bold text-white/70 w-14 text-right tabular-nums">{kast.toFixed(2)}%</span>
                                                        {clutches > 0 && (
                                                            <Badge className="bg-amber-500/20 text-amber-400 text-[10px] border border-amber-500/20">{clutches} clutch{clutches > 1 ? "es" : ""}</Badge>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </motion.div>
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
                            const teamPlayers = econ.filter((e: any) => team?.rosterIds?.includes(e.playerId))
                            if (teamPlayers.length === 0) return 0
                            return teamPlayers.reduce((sum: number, e: any) => sum + (e.spent || 0) + (e.remaining || 0), 0) / teamPlayers.length
                        }

                        const getBarColor = (avgMoney: number, roundIdx: number) => {
                            if (roundIdx === 0 || roundIdx === 12) return "bg-amber-400"
                            if (avgMoney < 2000) return "bg-red-400"
                            if (avgMoney < 4500) return "bg-orange-400"
                            return "bg-emerald-400"
                        }

                        const maxMoney = 16000

                        return (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="glass-panel p-6 rounded-xl"
                            >
                                <h3 className="text-sm font-bold uppercase tracking-widest text-white/40 mb-6">
                                    Round Economy — {selectedMap.map}
                                </h3>

                                {/* Home Team Economy */}
                                <div className="mb-6">
                                    <div className="flex items-center gap-2 mb-2">
                                        <TeamLogoImage src={homeTeam?.logoPath} alt={homeTeam?.name || ""} team={homeTeam} size={14} className="rounded-sm" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-white/30">{homeTeam?.name}</span>
                                    </div>
                                    <div className="flex items-end gap-[3px] h-24">
                                        {rounds.map((round: any, i: number) => {
                                            const avgMoney = getTeamEconomy(round, match.homeTeamId)
                                            const height = Math.max(4, Math.min(100, (avgMoney / maxMoney) * 100))
                                            const isWinner = round.winningTeamId === match.homeTeamId
                                            return (
                                                <div key={i} className="flex-1 flex flex-col items-center group relative">
                                                    <div className="hidden group-hover:flex absolute -top-8 bg-black/90 border border-white/10 rounded-md px-2 py-1 z-10 whitespace-nowrap">
                                                        <span className="text-[9px] text-white/80">R{i + 1}: ${Math.round(avgMoney).toLocaleString()}</span>
                                                    </div>
                                                    {isWinner && <div className="w-1 h-1 rounded-full bg-emerald-400 mb-1" />}
                                                    {!isWinner && <div className="w-1 h-1 mb-1" />}
                                                    <div
                                                        className={cn("w-full rounded-t-sm", getBarColor(avgMoney, i), avgMoney > 0 ? "opacity-70" : "opacity-20")}
                                                        style={{ height: `${height}%` }}
                                                    />
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* Round Numbers */}
                                <div className="flex gap-[3px] mb-2">
                                    {rounds.map((_: any, i: number) => (
                                        <div key={i} className="flex-1 text-center">
                                            <span className="text-[7px] text-white/25">{i + 1}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Away Team Economy (inverted) */}
                                <div className="mb-4">
                                    <div className="flex items-start gap-[3px] h-24">
                                        {rounds.map((round: any, i: number) => {
                                            const avgMoney = getTeamEconomy(round, match.awayTeamId)
                                            const height = Math.max(4, Math.min(100, (avgMoney / maxMoney) * 100))
                                            const isWinner = round.winningTeamId === match.awayTeamId
                                            return (
                                                <div key={i} className="flex-1 flex flex-col items-center group relative">
                                                    <div
                                                        className={cn("w-full rounded-b-sm", getBarColor(avgMoney, i), avgMoney > 0 ? "opacity-70" : "opacity-20")}
                                                        style={{ height: `${height}%` }}
                                                    />
                                                    {isWinner && <div className="w-1 h-1 rounded-full bg-emerald-400 mt-1" />}
                                                    {!isWinner && <div className="w-1 h-1 mt-1" />}
                                                    <div className="hidden group-hover:flex absolute -bottom-8 bg-black/90 border border-white/10 rounded-md px-2 py-1 z-10 whitespace-nowrap">
                                                        <span className="text-[9px] text-white/80">R{i + 1}: ${Math.round(avgMoney).toLocaleString()}</span>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <div className="flex items-center gap-2 mt-2">
                                        <TeamLogoImage src={awayTeam?.logoPath} alt={awayTeam?.name || ""} team={awayTeam} size={14} className="rounded-sm" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-white/30">{awayTeam?.name}</span>
                                    </div>
                                </div>

                                <div className="flex gap-4 text-[9px] text-white/40 border-t border-white/5 pt-3">
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400" /> Pistol</span>
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400" /> Eco</span>
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-orange-400" /> Force</span>
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400" /> Full Buy</span>
                                    <span className="flex items-center gap-1 ml-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Round Win</span>
                                </div>
                            </motion.div>
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

function PlayerStatsTable({ stats, players, result }: { stats: PlayerMatchStats[], players: PlayerSaveData[], result: MatchResult }) {
    // Local lookup map — was previously a reference to `playersById` defined
    // inside MatchResultPage which is out of scope here. Build it from the
    // `players` prop so this component is self-contained.
    const playersById = new Map(players.map(p => [p.id, p]))
    return (
        <div className="relative overflow-x-auto rounded-xl border border-white/5">
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-white/5">
                    <tr>
                        <th className="px-4 py-3 font-bold tracking-wider">Player</th>
                        <th className="px-4 py-3 text-center font-bold tracking-wider">K / D / A</th>
                        <th className="px-4 py-3 text-center font-bold tracking-wider">Diff</th>
                        <th className="px-4 py-3 text-center font-bold tracking-wider">ADR</th>
                        <th className="px-4 py-3 text-center font-bold tracking-wider">XP Gain</th>
                        <th className="px-4 py-3 text-center font-bold tracking-wider">Rating</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {stats.map((stat) => {
                        const player = playersById.get(stat.playerId)
                        const diff = stat.kills - stat.deaths
                        const ratingColor = stat.rating >= 1.25 ? "text-emerald-400" : stat.rating < 0.9 ? "text-red-400" : "text-white/80"

                        return (
                            <tr key={stat.playerId} className="bg-white/[0.02] hover:bg-white/[0.06] transition-colors">
                                <td className="px-4 py-3 font-medium text-white flex items-center gap-3">
                                    <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center overflow-hidden relative">
                                        <PlayerPortrait
                                            src={player?.portraitPath}
                                            alt={player?.nickname || "Player"}
                                            size={32}
                                        />
                                        {player && (
                                            <div className="absolute bottom-0 left-0 w-full h-1 bg-black/40">
                                                <div
                                                    className="h-full bg-emerald-500"
                                                    style={{ width: `${Math.min(100, ((player.xp || 0) / (player.xpToNextLevel || 1000)) * 100)}%` }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <div className="leading-none mb-0.5 flex items-center gap-2">
                                            {player?.nickname}
                                            <Badge variant="outline" className="text-[8px] h-3.5 px-1 py-0 min-w-[20px] bg-white/5 border-white/10 text-muted-foreground flex items-center justify-center">
                                                Lvl {player?.level || 1}
                                            </Badge>
                                        </div>
                                        <div className="text-[9px] text-muted-foreground flex items-center gap-1">
                                            <CountryFlag country={player?.nationality || ""} size={9} />
                                            {player?.role}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-center font-sans text-muted-foreground">
                                    <span className="text-white">{stat.kills}</span> / <span className="text-red-400/80">{stat.deaths}</span> / {stat.assists}
                                </td>
                                <td className="px-4 py-3 text-center font-bold">
                                    <span className={diff > 0 ? "text-emerald-400" : diff < 0 ? "text-red-400" : "text-muted-foreground"}>
                                        {diff > 0 ? "+" : ""}{diff}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-center text-white/80">
                                    {Math.round(stat.adr)}
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <div className="flex flex-col items-center w-24">
                                        <span className="text-emerald-400 font-bold">+{result.xpGains?.[stat.playerId] || 0} XP</span>

                                        {/* XP Progress Bar */}
                                        <div className="w-full h-1.5 bg-white/10 rounded-full mt-1 overflow-hidden relative group/xp">
                                            <div
                                                className="h-full bg-emerald-500 rounded-full"
                                                style={{ width: `${Math.min(100, ((player?.xp || 0) / (player?.xpToNextLevel || 1000)) * 100)}%` }}
                                            />
                                        </div>
                                        <span className="text-[8px] text-muted-foreground font-sans mt-0.5">
                                            {player?.xp || 0} / {player?.xpToNextLevel || 1000}
                                        </span>
                                    </div>
                                </td>
                                <td className={cn("px-4 py-3 text-center font-normal", ratingColor)}>
                                    {stat.rating.toFixed(2)}
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
