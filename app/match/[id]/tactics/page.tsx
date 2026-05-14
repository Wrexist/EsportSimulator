"use client"

import { useEffect, useState, useRef, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { ArrowLeft, Play, Layout, Swords, Brain, Video, ChevronRight, Zap, Target, Lock, Check } from "lucide-react"
import { motion } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { cn, deterministicSeed } from "@/lib/utils"
import { TournamentMatchContext } from "@/components/tournament/TournamentMatchContext"
import { FULL_TOURNAMENT_CALENDAR } from "@/data/tournament-calendar"
// Engine Imports for Auto-Veto
import { simulationEngineV2, SeededRNG } from "@/engine"
import { MapId } from "@/types/enums"
import { Player } from "@/types"
// If MAP_WALLPAPERS is missing, I'll fallback gracefully or use string paths


export default function TacticalHQPage() {
    const params = useParams()
    const router = useRouter()
    const {
        getUpcomingMatches,
        teams,
        players,
        playerTeamId,
        currentWeek,
        tournaments,
        scheduledMatches,
        completedMatches,
        performVODReview,
        performMentalReset,
        updateScheduledMatch,
        setPlaystyle,
        setEconomyStyle,
        setTargetPlayer
    } = useGameStore(useShallow(state => ({
        getUpcomingMatches: state.getUpcomingMatches,
        teams: state.teams,
        players: state.players,
        playerTeamId: state.playerTeamId,
        currentWeek: state.currentWeek,
        tournaments: state.tournaments,
        scheduledMatches: state.scheduledMatches,
        completedMatches: state.completedMatches,
        performVODReview: state.performVODReview,
        performMentalReset: state.performMentalReset,
        updateScheduledMatch: state.updateScheduledMatch,
        setPlaystyle: state.setPlaystyle,
        setEconomyStyle: state.setEconomyStyle,
        setTargetPlayer: state.setTargetPlayer,
    })))

    const [isSimulatingVeto, setIsSimulatingVeto] = useState(false)
    const [isQuickSimulating, setIsQuickSimulating] = useState(false)

    const matchId = params.id as string
    // Find match in upcoming OR scheduled. Memoized so we don't re-scan three
    // potentially-large arrays on every render of the tactics screen.
    const match = useMemo(() => (
        getUpcomingMatches(20).find((m: any) => m.id === matchId) ||
        scheduledMatches.find((m: any) => m.id === matchId) ||
        completedMatches.find((m: any) => m.id === matchId)
    ), [matchId, getUpcomingMatches, scheduledMatches, completedMatches])

    // O(1) player lookup so opponentPlayers / playerRoster don't scan the full
    // league players array per render.
    const playersById = useMemo(() => new Map(players.map(p => [p.id, p])), [players])
    const teamsById = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams])

    // Derived state
    const myTeam = teamsById.get(playerTeamId as string)
    const opponentId = match?.homeTeamId === playerTeamId ? match?.awayTeamId : match?.homeTeamId
    const opponent = opponentId ? teamsById.get(opponentId) : undefined

    // Persisted State from Match
    const mentalBoosted = match?.mentalPrep || false
    const vodReviewed = match?.vodReviewed || false

    // Opponent Roster for Antistrat
    const opponentRoster = opponent?.rosterIds || []
    const opponentPlayers = useMemo(() => (
        opponentRoster.map((pid: string) => playersById.get(pid)).filter(Boolean) as any[]
    ), [opponentRoster, playersById])

    // Facility Levels for Locking
    const tacticalLevel = myTeam?.facilities?.find((f: any) => f.type === "TACTICAL")?.level || 0
    const recoveryLevel = myTeam?.facilities?.find((f: any) => f.type === "RECOVERY")?.level || 0

    const isVodUnlocked = tacticalLevel >= 1
    const isPlaystyleUnlocked = tacticalLevel >= 2
    const isAntistratUnlocked = tacticalLevel >= 3
    const isMentalResetUnlocked = recoveryLevel >= 2

    const handleQuickSim = async () => {
        if (!match || !myTeam || !opponent) return
        setIsQuickSimulating(true)

        // 1. Auto Veto if needed
        if (!match.vetoComplete) {
            await handleAutoVeto()
        }

        // 2. Simulate Match Result (Instant)
        await useGameStore.getState().simulateInstantMatch(matchId)

        setIsQuickSimulating(false)
        router.push(`/match/${matchId}/result`)
    }

    const handleAutoVeto = async () => {
        if (!match || !myTeam || !opponent) return
        setIsSimulatingVeto(true)

        // 1. Simulate Veto Process (Instant)
        // We need 3 maps for BO3 (Pick, Pick, Decider) or 1 for BO1.
        // Simplified Logic: Use Engine to simulate "Auto" veto for both sides.

        await new Promise(resolve => setTimeout(resolve, 800)) // UX Delay

        const rng = new SeededRNG(
            deterministicSeed(
                match.id,
                match.seed,
                match.week,
                match.format,
                match.homeTeamId,
                match.awayTeamId
            )
        )
        const availableMaps = Object.values(MapId)

        const homeTeam = match.homeTeamId === myTeam.id ? myTeam : opponent
        const awayTeam = match.homeTeamId === myTeam.id ? opponent : myTeam

        // O(1) lookup via memoized playersById map instead of N players.find()
        const homePlayers = homeTeam?.rosterIds.map(id => playersById.get(id)).filter(Boolean) as unknown as Player[]
        const awayPlayers = awayTeam?.rosterIds.map(id => playersById.get(id)).filter(Boolean) as unknown as Player[]

        // We will just simulate a standard ban/pick phase purely using engine logic
        // BO3 Sequence: Ban, Ban, Pick, Pick, Ban, Ban, Decider
        // Result: [HomePick, AwayPick, Decider]

        // Simulate Veto Sequence based on Format
        // Pool of 7 maps

        let picks: MapId[] = []
        let currentPool = [...availableMaps]

        // Helper to get engine selection
        const getEngineSelection = (chooserPlayers: Player[], enemyPlayers: Player[], pool: MapId[], action: "BAN" | "PICK") => {
            const strengths = simulationEngineV2.calculateMapStrengths(chooserPlayers)
            let targetStrengths = strengths
            if (action === "BAN") {
                // If banning, we look at enemy strengths to ban their best
                targetStrengths = simulationEngineV2.calculateMapStrengths(enemyPlayers)
            }
            return simulationEngineV2.selectMapForVeto(rng, pool, targetStrengths, action, 3)
        }

        const runBan = (team: "home" | "away") => {
            const chooser = team === "home" ? homePlayers : awayPlayers
            const enemy = team === "home" ? awayPlayers : homePlayers
            const ban = getEngineSelection(chooser, enemy, currentPool, "BAN")
            currentPool = currentPool.filter(m => m !== ban)
        }

        const runPick = (team: "home" | "away") => {
            const chooser = team === "home" ? homePlayers : awayPlayers
            const enemy = team === "home" ? awayPlayers : homePlayers
            const pick = getEngineSelection(chooser, enemy, currentPool, "PICK")
            currentPool = currentPool.filter(m => m !== pick)
            picks.push(pick)
        }

        if (match.format === "BO1") {
            // BO1: Ban A, Ban B, Ban A, Ban B, Ban A, Ban B, Decider (Remaining)
            // Or simpler: each bans 3 times.
            for (let i = 0; i < 3; i++) {
                runBan("home")
                runBan("away")
            }
            // Last map is the pick
            if (currentPool.length > 0) picks.push(currentPool[0])

        } else if (match.format === "BO5") {
            // BO5 (from pool of 7): Ban A, Ban B. 5 maps remain.
            runBan("home")
            runBan("away")
            // All remaining 5 are played
            picks = [...currentPool]
            // Shuffle or keep order? Usually Pick A, Pick B... 
            // Let's just create a logical order: Pick A, Pick B, Pick A, Pick B, Decider
            // But for simplicity, we just use the remaining pool.
            // Ideally we want to order them by "pick" preference.
            // Let's just simulate picks for the first 4, last is decider.
            const orderedPicks: MapId[] = []
            let tempPool = [...currentPool]

            // 4 picks
            const pickSequence = ["home", "away", "home", "away"]
            for (const team of pickSequence) {
                const chooser = team === "home" ? homePlayers : awayPlayers
                const enemy = team === "home" ? awayPlayers : homePlayers
                const pick = getEngineSelection(chooser, enemy, tempPool, "PICK")
                tempPool = tempPool.filter(m => m !== pick)
                orderedPicks.push(pick)
            }
            // Last one
            if (tempPool.length > 0) orderedPicks.push(tempPool[0])
            picks = orderedPicks

        } else {
            // Default BO3
            // Ban A, Ban B
            runBan("home")
            runBan("away")

            // Pick A, Pick B
            runPick("home")
            runPick("away")

            // Ban A, Ban B
            runBan("home")
            runBan("away")

            // Decider
            if (currentPool.length > 0) picks.push(currentPool[0])
        }

        // Save to store and refresh
        updateScheduledMatch(matchId, {
            vetoComplete: true,
            maps: picks
        })
        setIsSimulatingVeto(false)
        router.refresh()
    }

    const handleStartMatch = () => {
        if (!match || !match.maps) return
        const mapString = match.maps.join(",")
        router.push(`/match/${matchId}/live?maps=${mapString}`)
    }

    const handleManualVeto = () => {
        router.push(`/match/${matchId}/veto`)
    }

    const handleVODReview = () => {
        if (matchId && !vodReviewed) {
            performVODReview(matchId)
            // setVodReviewed(true) // Updates via store
        }
    }

    const handleMentalPrep = () => {
        if (!mentalBoosted) {
            if (myTeam && myTeam.budget < 5000) return
            performMentalReset(matchId)
            // setMentalBoosted(true) // Updates via store
        }
    }

    if (!match || !myTeam || !opponent) {
        return (
            <div className="min-h-screen bg-[#0e1217] flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-white/40 font-bold uppercase tracking-widest text-xs">Loading Headquarters...</p>
                </div>
            </div>
        )
    }

    const isMatchWeek = match.week === currentWeek
    const isFuture = match.week > currentWeek
    const isPast = match.week < currentWeek

    return (
        <div className="min-h-screen bg-[#0e1217] text-white p-6 relative overflow-hidden font-sans selection:bg-emerald-500/30">
            {/* Background Ambience */}
            <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-blue-900/10 to-transparent pointer-events-none" />
            <div className="absolute -top-20 -right-20 w-[600px] h-[600px] bg-blue-500/5 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-500/5 blur-[100px] rounded-full pointer-events-none" />

            <div className="max-w-7xl mx-auto relative z-10 space-y-8">
                {/* Header */}
                <header className="flex items-center justify-between">
                    <Link href="/">
                        <Button variant="ghost" className="text-white/40 hover:text-white hover:bg-white/5 uppercase tracking-widest text-xs font-bold gap-2">
                            <ArrowLeft size={16} /> Dashboard
                        </Button>
                    </Link>
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
                        <div className={cn("w-2 h-2 rounded-full animate-pulse", isMatchWeek ? "bg-emerald-500" : "bg-amber-500")} />
                        <span className={cn("text-[10px] font-normal uppercase tracking-widest", isMatchWeek ? "text-emerald-400" : "text-amber-400")}>
                            {isMatchWeek ? "TACTICAL HQ ACTIVE" : `PREPARING FOR WEEK ${match.week}`}
                        </span>
                    </div>
                </header>

                {/* Matchup Banner */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                className="glass-panel p-10 rounded-xl border border-white/5 bg-white/[0.01] backdrop-blur-2xl relative overflow-hidden"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-transparent to-red-500/5 pointer-events-none" />

                    <div className="flex flex-col md:flex-row items-center justify-between gap-10 relative z-10">
                        {/* Player Team */}
                        <div className="flex flex-col items-center text-center gap-4">
                        <div className="w-24 h-24 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center p-4 shadow-glass-soft">
                                <TeamLogoDisplay team={myTeam} size={64} />
                            </div>
                            <div>
                                <h2 className="text-2xl font-normal tracking-tight">{myTeam.name}</h2>
                                <Badge className="bg-blue-500/10 text-blue-400 border-none mt-1">
                                    RANK #{myTeam.worldRanking || "-"}
                                </Badge>
                            </div>
                        </div>

                        {/* VS */}
                        <div className="flex flex-col items-center gap-2">
                            <span className="text-[10px] font-normal uppercase tracking-[0.5em] text-white/20">VS</span>
                            <div className="text-4xl font-normal text-white/10">{match.format || "BO3"}</div>
                            <span className={cn("text-[10px] font-bold uppercase tracking-widest", isMatchWeek ? "text-emerald-500" : "text-white/40")}>
                                {isMatchWeek ? "MATCH WEEK" : `SCHEDULED WEEK ${match.week}`}
                            </span>
                        </div>

                        {/* Opponent Team */}
                        <div className="flex flex-col items-center text-center gap-4">
                        <div className="w-24 h-24 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center p-4 shadow-glass-soft relative group">
                                <TeamLogoDisplay team={opponent} size={64} />
                                <div className="absolute -bottom-3 px-3 py-1 bg-red-500 text-white text-[8px] font-normal uppercase tracking-widest rounded-full shadow-lg">
                                    ENEMY
                                </div>
                            </div>
                            <div>
                                <h2 className="text-2xl font-normal tracking-tight">{opponent.name}</h2>
                                <Badge className="bg-amber-500/10 text-amber-500 border-none mt-1">
                                    RANK #{opponent.worldRanking || "-"}
                                </Badge>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Tournament Context - Only show for tournament matches */}
                {match.tournamentId && match.tournamentId !== "SCRIM" && (() => {
                    // Find tournament definition and live data
                    const liveTournament = tournaments?.find(t => t.id === match.tournamentId)
                    const baseId = match.tournamentId.replace(/_s\d+$/, '')
                    const tournamentDef = FULL_TOURNAMENT_CALENDAR.find(t => t.id === baseId || t.id === match.tournamentId)

                    // Determine next stage from bracket
                    let nextStage: string | undefined
                    if (liveTournament?.playoffBracket) {
                        const currentMatch = liveTournament.playoffBracket.find(m => m.id === match.id)
                        const nextMatch = liveTournament.playoffBracket.find(m =>
                            m.sourceMatchIds?.includes(match.id)
                        )
                        nextStage = nextMatch?.stage
                    }

                    return (
                        <TournamentMatchContext
                            tournamentName={tournamentDef?.name || liveTournament?.name || "Tournament"}
                            tournamentLogo={tournamentDef?.logoPath}
                            tournamentTier={tournamentDef?.tier || liveTournament?.tier}
                            currentStage={match.stage || undefined}
                            matchFormat={match.format}
                            prizePool={tournamentDef?.prizePool}
                            isElimination={tournamentDef?.format === "bracket"}
                            nextStage={nextStage}
                        className="rounded-xl"
                        />
                    )
                })()}

                {/* Section Header */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="flex items-center justify-center gap-4"
                >
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                    <div className="flex items-center gap-3 px-6 py-2 rounded-full bg-white/[0.02] border border-white/5 backdrop-blur-sm">
                        <motion.div
                            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                            className="w-2 h-2 rounded-full bg-emerald-500"
                        />
                        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/60">
                            Preparing for Battle
                        </span>
                        <motion.div
                            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                            className="w-2 h-2 rounded-full bg-emerald-500"
                        />
                    </div>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                </motion.div>

                {/* Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* VOD Review Section */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        className="relative group"
                    >
                        {/* Animated border glow */}
                        <motion.div
                    className="absolute -inset-[1px] rounded-xl bg-gradient-to-r from-blue-500/20 via-cyan-500/20 to-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                            animate={{
                                backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"]
                            }}
                            transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
                            style={{ backgroundSize: "200% 200%" }}
                        />
                <div className="glass-panel p-8 rounded-xl border border-white/5 bg-white/[0.02] backdrop-blur-3xl min-h-[400px] flex flex-col relative overflow-hidden">
                            {/* Subtle animated background */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-[80px] pointer-events-none" />

                            <div className="flex items-center gap-4 mb-8 relative z-10">
                                <motion.div
                        className="relative w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500"
                                    whileHover={{ scale: 1.05 }}
                                >
                                    {/* Pulse ring */}
                                    <motion.div
                                className="absolute inset-0 rounded-lg border border-blue-500/30"
                                        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                    />
                                    <Video size={24} />
                                </motion.div>
                                <div>
                                    <h3 className="text-xl font-semibold tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">VOD Review</h3>
                                    <p className="text-sm text-white/40">Analyze opponent playstyle</p>
                                </div>
                                {!isVodUnlocked ? (
                                    <div className="ml-auto px-3 py-1 bg-white/5 rounded-lg border border-white/10 flex items-center gap-2">
                                        <Lock size={12} className="text-muted-foreground" />
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Lvl 1 Tac Center Req.</span>
                                    </div>
                                ) : vodReviewed ? (
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="ml-auto px-3 py-1 bg-emerald-500/10 rounded-lg border border-emerald-500/20 flex items-center gap-2"
                                    >
                                        <Check size={12} className="text-emerald-500" />
                                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Complete</span>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        animate={{ opacity: [0.5, 1, 0.5] }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                        className="ml-auto px-3 py-1 bg-blue-500/10 rounded-lg border border-blue-500/20 flex items-center gap-2"
                                    >
                                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Ready</span>
                                    </motion.div>
                                )}
                            </div>

                        <div className="relative overflow-hidden rounded-lg group border border-white/5 bg-[#0a0a0a]">
                            {!isVodUnlocked && (
                                <div className="absolute inset-0 z-dropdown flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
                        <div className="bg-black/70 px-8 py-6 rounded-xl border border-white/10 text-center shadow-glass-soft transform scale-100">
                            <div className="w-12 h-12 bg-white/5 rounded-lg flex items-center justify-center mx-auto mb-4 border border-white/10">
                                            <Lock size={24} className="text-white/40" />
                                        </div>
                                        <h3 className="text-white font-normal uppercase tracking-wider mb-1">Feature Locked</h3>
                                        <p className="text-xs text-white/40 mb-4 max-w-[200px] leading-relaxed">
                                            Upgrade your Tactical Center to Level 1 to unlock VOD Reviews.
                                        </p>
                                        <Link href="/desktop?app=facilities">
                                            <Button size="sm" variant="default" className="w-full font-bold">Upgrade Basecamp</Button>
                                        </Link>
                                    </div>
                                </div>
                            )}

                            {/* Content Wrapper - Blured when locked */}
                            <div className={cn("relative transition-all duration-500", !isVodUnlocked && "blur-md opacity-30 pointer-events-none grayscale")}>
                                {/* Visual Header */}
                                <div className="relative h-48 w-full group overflow-hidden">
                                    <div className="absolute inset-0 flex items-center justify-center z-20">
                        <div className="w-16 h-16 rounded-lg bg-white/10 backdrop-blur-md flex items-center justify-center transition-transform duration-300 border border-white/20 shadow-glass-soft">
                                            <Play size={24} className="ml-1 text-white fill-white" />
                                        </div>
                                    </div>
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-black/20 to-transparent z-10" />
                                    {/* Placeholder visuals for VOD */}
                                    <div className="absolute top-4 right-4 z-20 px-3 py-1 rounded-lg bg-red-500 text-white text-[10px] font-normal uppercase tracking-widest shadow-lg shadow-red-500/20">
                                        LIVE DEMO
                                    </div>
                                    <div className={cn(
                                        "w-full h-full bg-cover bg-center group-hover:scale-105 transition-transform duration-700",
                                        match.maps && match.maps.length > 0
                                            ? `bg-[url('/maps/${match.maps[0].toLowerCase()}.png')]`
                                            : "bg-[url('/maps/mirage.png')]"
                                    )} style={{
                                        backgroundImage: match.maps && match.maps.length > 0 ? `url('/maps/${match.maps[0].toLowerCase()}.png')` : undefined
                                    }} />

                                    <div className="absolute bottom-4 left-6 z-20 w-[90%]">
                                        <h4 className="font-normal text-xl mb-1 text-white tracking-tight">{opponent.name}</h4>
                                        <p className="text-xs text-white/60 font-medium tracking-wide uppercase">Recent VOD Analysis</p>
                                    </div>
                                </div>

                                <div className="p-6 pt-2">
                                    <div className="flex justify-between items-end mb-6">
                                        <p className="text-xs text-white/40 max-w-[80%] leading-relaxed">
                                            Study their defaults, execution patterns, and economic tendencies to gain a strategic advantage.
                                        </p>
                                        {!vodReviewed && (
                                            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[9px] px-2 py-0.5 rounded-md">AVAILABLE</Badge>
                                        )}
                                    </div>

                                    <motion.div className="relative" whileHover={{ scale: vodReviewed ? 1 : 1.02 }} whileTap={{ scale: vodReviewed ? 1 : 0.98 }}>
                                        {!vodReviewed && (
                                            <motion.div
                                                className="absolute inset-0 rounded-xl bg-blue-500/30 blur-lg"
                                                animate={{ opacity: [0.2, 0.5, 0.2] }}
                                                transition={{ duration: 2, repeat: Infinity }}
                                            />
                                        )}
                                        <Button
                                            onClick={handleVODReview}
                                            disabled={vodReviewed || !isMatchWeek || !isVodUnlocked}
                                            className={cn(
                                                "relative w-full h-12 rounded-xl font-bold uppercase tracking-wider text-xs transition-all",
                                                vodReviewed
                                                    ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20"
                                                    : "bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600 hover:from-blue-500 hover:via-blue-400 hover:to-blue-500 text-white shadow-lg shadow-blue-600/30"
                                            )}
                                        >
                                            {vodReviewed ? (
                                                <span className="flex items-center gap-2"><Check size={14} strokeWidth={3} /> Analysis Complete</span>
                                            ) : (
                                                <span className="flex items-center gap-2"><Play size={14} strokeWidth={3} fill="currentColor" /> Review VOD (Cost: $2,500)</span>
                                            )}
                                        </Button>
                                    </motion.div>

                                    {vodReviewed && (
                                        <motion.p
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="text-center text-[10px] text-emerald-500/80 mt-3 font-bold uppercase tracking-widest flex items-center justify-center gap-2"
                                        >
                                            <Zap size={12} className="fill-emerald-500" />
                                            +5% Tactical Read Gained
                                            <Zap size={12} className="fill-emerald-500" />
                                        </motion.p>
                                    )}
                                </div>
                            </div>
                        </div>
                        </div>
                    </motion.div>

                    {/* Tactics HQ Section */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        className="relative group"
                    >
                        {/* Animated border glow */}
                        <motion.div
                    className="absolute -inset-[1px] rounded-xl bg-gradient-to-r from-emerald-500/20 via-cyan-500/20 to-emerald-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                            animate={{
                                backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"]
                            }}
                            transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
                            style={{ backgroundSize: "200% 200%" }}
                        />
                <div className="glass-panel p-8 rounded-xl border border-white/5 bg-white/[0.02] backdrop-blur-3xl min-h-[400px] flex flex-col relative overflow-hidden">
                            {/* Subtle animated background */}
                            <div className="absolute top-0 left-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-[80px] pointer-events-none" />
                            <div className="absolute bottom-0 right-0 w-48 h-48 bg-cyan-500/5 rounded-full blur-[60px] pointer-events-none" />

                            <div className="flex items-center gap-4 mb-8 relative z-10">
                                <motion.div
                        className="relative w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500"
                                    whileHover={{ scale: 1.05 }}
                                >
                                    {/* Pulse ring */}
                                    <motion.div
                                className="absolute inset-0 rounded-lg border border-emerald-500/30"
                                        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                    />
                                    <Layout size={24} />
                                </motion.div>
                                <div>
                                    <h3 className="text-xl font-semibold tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">Tactical HQ</h3>
                                    <p className="text-sm text-white/40">Optimize team configuration</p>
                                </div>
                                <motion.div
                                    animate={{ opacity: [0.5, 1, 0.5] }}
                                    transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                                    className="ml-auto px-3 py-1 bg-emerald-500/10 rounded-lg border border-emerald-500/20 flex items-center gap-2"
                                >
                                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Online</span>
                                </motion.div>
                            </div>

                        <div className="space-y-6 mb-8 relative">
                            {/* Playstyle Section */}
                            <div className={cn("space-y-3", !isPlaystyleUnlocked && "opacity-40 pointer-events-none")}>
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-normal uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                        Team Playstyle
                                    </label>
                                    {!isPlaystyleUnlocked && <span className="text-[9px] font-bold text-red-400 uppercase">Locked (Lvl 2 Tac)</span>}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { id: "balanced", label: "Balanced", desc: "No bonuses, no risks" },
                                        { id: "aggressive", label: "Aggressive", desc: "+5% if high morale" },
                                        { id: "structured", label: "Structured", desc: "+5% if high chemistry" },
                                        { id: "default", label: "Default", desc: "Standard play" }
                                    ].map((style) => (
                                        <Button
                                            key={style.id}
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setPlaystyle(playerTeamId!, style.id as any)}
                                            className={cn(
                                                "h-12 rounded-xl text-[10px] font-normal uppercase border border-white/5 flex flex-col gap-0",
                                                myTeam.playstyle === style.id ? "bg-primary/20 border-primary/40 text-primary" : "text-muted-foreground hover:bg-white/5"
                                            )}
                                        >
                                            <span>{style.label}</span>
                                            <span className="text-[8px] opacity-60 font-medium normal-case">{style.desc}</span>
                                        </Button>
                                    ))}
                                </div>
                            </div>



                            {/* Antistrat Section */}
                            <div className={cn("space-y-3", !isAntistratUnlocked && "opacity-40 pointer-events-none")}>
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-normal uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                        Antistrat vs {opponent.name}
                                    </label>
                                    {!isAntistratUnlocked && <span className="text-[9px] font-bold text-red-400 uppercase">Locked (Lvl 3 Tac)</span>}
                                </div>
                                <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/5 border border-red-500/10">
                                    <span className="text-[8px] text-red-400 font-bold">⚠️ -15% target rating</span>
                                    <span className="text-[8px] text-amber-400/80">• -5% map awareness</span>
                                </div>
                                <div className="grid grid-cols-5 gap-2">
                                    {opponentPlayers.slice(0, 5).map((player: any) => (
                                        <Button
                                            key={player.id}
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setTargetPlayer(
                                                playerTeamId!,
                                                myTeam.targetPlayerId === player.id ? undefined : player.id
                                            )}
                                            className={cn(
                                                "h-auto py-2 rounded-xl border border-white/5 flex flex-col gap-1 items-center justify-center p-1 overflow-hidden transition-all",
                                                myTeam.targetPlayerId === player.id
                                                    ? "bg-red-500/20 border-red-500/40 text-red-400 ring-1 ring-red-500/20"
                                                    : "text-muted-foreground hover:bg-white/5"
                                            )}
                                        >
                                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-black/40 border border-white/5 shrink-0 relative">
                                                <PlayerPortrait
                                                    src={player.portraitPath}
                                                    alt={player.nickname}
                                                    className="w-full h-full object-cover object-top scale-110 translate-y-1"
                                                />
                                            </div>
                                            <div className="flex flex-col items-center w-full">
                                                <span className="truncate w-full text-center text-[9px] font-bold leading-tight">{player.nickname}</span>
                                                <span className="text-[7px] opacity-60 truncate w-full text-center">{player.role}</span>
                                            </div>
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Mental Prep (Retained but moved down) */}
                        <div className={cn("mt-auto space-y-3 pt-6 border-t border-white/5 mb-6 relative", !isMentalResetUnlocked && "opacity-50 pointer-events-none")}>
                            {!isMentalResetUnlocked && (
                                <div className="absolute inset-0 z-50 flex items-center justify-center">
                                    <div className="bg-black/80 backdrop-blur-md px-4 py-2 rounded-lg border border-white/10 text-center">
                                        <p className="text-[10px] font-bold text-white">Unlock at Recovery Lvl 2</p>
                                    </div>
                                </div>
                            )}
                            <div
                                role="button"
                                tabIndex={isMentalResetUnlocked ? 0 : -1}
                                aria-disabled={!isMentalResetUnlocked}
                                aria-label="Apply Mental Reset ($5,000) to boost morale"
                                aria-pressed={mentalBoosted}
                    className="p-4 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between group cursor-pointer hover:bg-white/10 transition-colors"
                                onClick={() => { if (isMentalResetUnlocked) handleMentalPrep() }}
                                onKeyDown={(e) => {
                                    if (!isMentalResetUnlocked) return
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault()
                                        handleMentalPrep()
                                    }
                                }}
                            >
                                <div className="flex items-center gap-3">
                                    <Brain size={18} className={cn("transition-colors", mentalBoosted ? "text-pink-400" : "text-white/60")} />
                                    <div>
                                        <span className="font-bold text-sm block">Mental Reset ($5,000)</span>
                                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Boost Morale</span>
                                    </div>
                                </div>
                                <div className={cn(
                                    "w-8 h-8 rounded-full flex items-center justify-center border transition-all",
                                    mentalBoosted ? "bg-pink-500 border-pink-500 text-white" : "border-white/20 text-white/20"
                                )}>
                                    <Zap size={14} fill={mentalBoosted ? "currentColor" : "none"} />
                                </div>
                            </div>
                        </div>

                        <div className="mt-auto space-y-3">
                            {isFuture ? (
                    <Button disabled className="w-full h-16 rounded-lg bg-white/5 text-muted-foreground font-normal text-xs uppercase tracking-widest border border-white/10">
                                    <Lock size={16} className="mr-2" /> Match is in Week {match.week}
                                </Button>
                            ) : isPast ? (
                    <Button disabled className="w-full h-16 rounded-lg bg-white/5 text-muted-foreground font-normal text-xs uppercase tracking-widest border border-white/10">
                                    Match Expired
                                </Button>
                            ) : match.vetoComplete ? (
                                <div className="space-y-4">
                                    {/* Map Display */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                        {(match.maps || []).map((map: string, i: number) => {
                                            const isDecider = (match.maps?.length || 0) > 1 && i === (match.maps?.length || 0) - 1
                                            const mapLabel = isDecider ? "DECIDER" : `MAP ${i + 1}`

                                            return (
                                                <div key={i} className="aspect-video relative rounded-xl border border-white/10 overflow-hidden group">
                                                    <Image
                                                        src={`/maps/${map.toLowerCase()}.png`}
                                                        alt={map}
                                                        fill
                                                        className="object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                                                    />
                                                    <div className="absolute top-2 left-2 z-10">
                                                        <Badge className={cn("text-[9px] font-normal border-none px-1.5 py-0.5", isDecider ? "bg-amber-500 text-black" : "bg-white/20 text-white backdrop-blur-md")}>
                                                            {mapLabel}
                                                        </Badge>
                                                    </div>
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent flex items-end justify-center pb-2">
                                                        <span className="font-normal uppercase text-sm tracking-widest text-white shadow-black drop-shadow-lg">{map}</span>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <div className="mt-4 flex gap-2">
                                        <motion.div className="flex-1 relative" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                                            {/* Animated glow behind button */}
                                            <motion.div
                    className="absolute inset-0 rounded-lg bg-emerald-500/25 blur-xl"
                                                animate={{ opacity: [0.3, 0.6, 0.3] }}
                                                transition={{ duration: 2, repeat: Infinity }}
                                            />
                                            <Button
                                                onClick={handleStartMatch}
                    className="relative w-full h-16 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-black font-bold text-lg uppercase tracking-widest transition-all"
                                            >
                                                <span className="flex items-center gap-3">
                                                    <motion.span
                                                        animate={{ x: [0, 3, 0] }}
                                                        transition={{ duration: 1.5, repeat: Infinity }}
                                                    >
                                                        START GAME
                                                    </motion.span>
                                                    <ChevronRight size={24} strokeWidth={3} />
                                                </span>
                                            </Button>
                                        </motion.div>
                                        <Button
                                            onClick={handleQuickSim}
                                            disabled={isQuickSimulating}
                                            variant="outline"
                    className="h-14 w-14 rounded-lg border-white/10 bg-white/5 hover:bg-amber-500 hover:text-white hover:border-amber-500 transition-all font-normal flex items-center justify-center shadow-glass-soft"
                                            title="Simulate Result Instantly"
                                        >
                                            {isQuickSimulating ? <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/20 border-t-white" /> : <Zap size={24} className="fill-current" />}
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-3">
                                    <Button
                                        onClick={handleManualVeto}
                    className="h-16 rounded-lg bg-white/10 hover:bg-white/20 text-white font-normal text-xs uppercase tracking-widest border border-white/10"
                                    >
                                        Start Manual Veto
                                    </Button>
                                    <Button
                                        onClick={handleAutoVeto}
                                        disabled={isSimulatingVeto}
                    className="h-16 rounded-lg bg-white/10 hover:bg-white/20 text-white font-normal text-xs uppercase tracking-widest border border-white/10"
                                    >
                                        {isSimulatingVeto ? (
                                            <span className="animate-pulse">Simulating...</span>
                                        ) : (
                                            <span>Quick Sim Veto</span>
                                        )}
                                    </Button>
                                </div>
                            )}
                            <p className="text-[10px] text-center text-white/30 uppercase tracking-widest font-bold">
                                {isSimulatingVeto ? "Selecting Maps & Servers..." : match.vetoComplete ? "Maps Selected • Ready to Play" : "Veto required to start match"}
                            </p>
                        </div>
                        </div>
                    </motion.div>
                </div>
            </div >
        </div >
    )
}
