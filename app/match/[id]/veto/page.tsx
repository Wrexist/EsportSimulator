"use client"

import { useState, useRef, useEffect, use } from "react"
import { useRouter, useParams } from "next/navigation"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { startOfToday } from "date-fns"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Ban, Check, Swords, Map as MapIcon, RotateCw } from "lucide-react"
import { MapId } from "@/types/enums" // Fixed import
import { Team, Player, MatchFormat } from "@/types"
import { MatchSaveData, TeamSaveData } from "@/engine/save-types"
import { simulationEngineV2, SeededRNG } from "@/engine"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { cn, deterministicSeed } from "@/lib/utils"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { FULL_TOURNAMENT_CALENDAR } from "@/data/tournament-calendar"

// Map Wallpaper Paths
const MAP_WALLPAPERS: Record<string, string> = {
    [MapId.DUST2]: "/maps/dust2.png",
    [MapId.MIRAGE]: "/maps/mirage.png",
    [MapId.INFERNO]: "/maps/inferno.png",
    [MapId.NUKE]: "/maps/nuke.png",
    [MapId.OVERPASS]: "/maps/overpass.png",
    [MapId.VERTIGO]: "/maps/vertigo.png",
    [MapId.ANCIENT]: "/maps/ancient.png",
    [MapId.ANUBIS]: "/maps/anubis.png",
}

// Map Names for display
const MAP_NAMES: Record<string, string> = {
    [MapId.DUST2]: "Dust II",
    [MapId.MIRAGE]: "Mirage",
    [MapId.INFERNO]: "Inferno",
    [MapId.NUKE]: "Nuke",
    [MapId.OVERPASS]: "Overpass",
    [MapId.VERTIGO]: "Vertigo",
    [MapId.ANCIENT]: "Ancient",
    [MapId.ANUBIS]: "Anubis",
}

interface VetoTurn {
    team: "home" | "away" | "auto"
    action: "BAN" | "PICK" | "DECIDER" | "SIDE_PICK"
    mapId?: MapId
}


export default function VetoPage({ params: initialParams }: { params: Promise<{ id: string }> }) {
    const params = useParams()
    const id = params.id as string
    const router = useRouter()
    const { scheduledMatches, getUpcomingMatches, teams, players, updateScheduledMatch, playerTeamId, completedMatches } = useGameStore(useShallow(state => ({
        scheduledMatches: state.scheduledMatches,
        getUpcomingMatches: state.getUpcomingMatches,
        teams: state.teams,
        players: state.players,
        updateScheduledMatch: state.updateScheduledMatch,
        playerTeamId: state.playerTeamId,
        completedMatches: state.completedMatches,
    })))

    // State
    const [match, setMatch] = useState<MatchSaveData | undefined>(undefined)
    const [homeTeam, setHomeTeam] = useState<TeamSaveData | null>(null)
    const [awayTeam, setAwayTeam] = useState<TeamSaveData | null>(null)
    const [availableMaps, setAvailableMaps] = useState<MapId[]>([])
    const [vetoHistory, setVetoHistory] = useState<VetoTurn[]>([])
    const [status, setStatus] = useState("Initializing...")
    const [isAiTurn, setIsAiTurn] = useState(false)
    const [vetoSequence, setVetoSequence] = useState<VetoTurn[]>([]) // Dynamic sequence
    const [mapStartingSides, setMapStartingSides] = useState<Record<string, string>>({}) // MapId -> TeamId of CT team
    const [showSideSelection, setShowSideSelection] = useState<MapId | null>(null)


    // Compute map win rates for both teams from completed matches
    const getTeamMapStats = (teamId: string): Record<string, { wins: number, losses: number }> => {
        const stats: Record<string, { wins: number, losses: number }> = {}
        if (!completedMatches) return stats
        completedMatches
            .filter((m: any) => m.homeTeamId === teamId || m.awayTeamId === teamId)
            .forEach((match: any) => {
                if (!match.result?.maps) return
                const isHome = match.homeTeamId === teamId
                match.result.maps.forEach((mapResult: any) => {
                    const mapName = mapResult.map
                    if (!stats[mapName]) stats[mapName] = { wins: 0, losses: 0 }
                    const homeWon = mapResult.finalScore?.team1 > mapResult.finalScore?.team2
                    if (isHome ? homeWon : !homeWon) stats[mapName].wins++
                    else stats[mapName].losses++
                })
            })
        return stats
    }

    // Refs for AI processing
    const processingRef = useRef(false)

    // Generate Veto Sequence based on format
    const generateVetoSequence = (format: string): VetoTurn[] => {
        if (format === "BO1") {
            // BO1: 6 Bans, 1 Decider -> Other team picks side
            return [
                { team: "home", action: "BAN" }, { team: "away", action: "BAN" },
                { team: "home", action: "BAN" }, { team: "away", action: "BAN" },
                { team: "home", action: "BAN" }, { team: "away", action: "BAN" },
                { team: "auto", action: "DECIDER" },
                { team: "away", action: "SIDE_PICK" } // Away gets side choice on decider
            ]
        } else if (format === "BO5") {
            // BO5 (Pool of 7): 2 Bans, 5 Played (4 Picks + 1 Decider/Leftover)
            return [
                { team: "home", action: "BAN" }, { team: "away", action: "BAN" },
                { team: "home", action: "PICK" }, { team: "away", action: "SIDE_PICK" },
                { team: "away", action: "PICK" }, { team: "home", action: "SIDE_PICK" },
                { team: "home", action: "PICK" }, { team: "away", action: "SIDE_PICK" },
                { team: "away", action: "PICK" }, { team: "home", action: "SIDE_PICK" },
                { team: "auto", action: "DECIDER" }, { team: "home", action: "SIDE_PICK" }
            ]
        } else {
            // BO3 Standard
            return [
                { team: "home", action: "BAN" }, { team: "away", action: "BAN" },
                { team: "home", action: "PICK" }, { team: "away", action: "SIDE_PICK" },
                { team: "away", action: "PICK" }, { team: "home", action: "SIDE_PICK" },
                { team: "home", action: "BAN" }, { team: "away", action: "BAN" },
                { team: "auto", action: "DECIDER" }, { team: "away", action: "SIDE_PICK" }
            ]
        }
    }

    // Track if initial setup has been done to avoid re-running
    const initialSetupDone = useRef(false)

    useEffect(() => {
        // Hydrate data
        const foundMatch = scheduledMatches.find(m => m.id === id)
        if (!foundMatch) {
            // Check completed?
            setStatus("Match not found or already completed.")
            return
        }

        const hTeam = teams.find(t => t.id === foundMatch.homeTeamId)
        const aTeam = teams.find(t => t.id === foundMatch.awayTeamId)

        setMatch(foundMatch)
        setHomeTeam(hTeam || null)
        setAwayTeam(aTeam || null)

        // Initialize Maps & Sequence only once
        if (!initialSetupDone.current) {
            initialSetupDone.current = true
            setAvailableMaps(Object.values(MapId))
            setVetoSequence(generateVetoSequence(foundMatch.format || "BO3"))
            setStatus("Ready to start veto")
        }

    }, [scheduledMatches, teams, id])

    // Refs for callbacks to avoid stale closures - must be typed as any initially
    const handleCompletionRef = useRef<() => void>(() => {})
    const executeAiTurnRef = useRef<(side: "home" | "away", action: "BAN" | "PICK" | "SIDE_PICK") => void>(() => {})

    const executeAiTurn = (side: "home" | "away", action: "BAN" | "PICK" | "SIDE_PICK") => {
        if (!homeTeam || !awayTeam || !match) return

        const turnIndex = vetoHistory.length
        const aiTurnRng = new SeededRNG(
            deterministicSeed(
                match.id,
                match.seed,
                side,
                action,
                turnIndex,
                availableMaps.join(","),
                homeTeam.id,
                awayTeam.id
            )
        )

        if (action === "SIDE_PICK") {
            const prevAction = vetoHistory[vetoHistory.length - 1]
            if (prevAction?.mapId) {
                const chosenSide = aiTurnRng.bool(0.5) ? "CT" : "T"
                handleSideSelection(side, prevAction.mapId, chosenSide)
            }
            processingRef.current = false
            return
        }

        const activeTeam = side === "home" ? homeTeam : awayTeam
        const activePlayers = activeTeam.rosterIds.map(id => players.find(p => p.id === id)).filter(Boolean) as unknown as Player[]

        // Use Engine Helper
        const strengths = simulationEngineV2.calculateMapStrengths(activePlayers)

        let targetStrengths = strengths
        const opponentPlayers = (side === "home" ? awayTeam : homeTeam).rosterIds.map(id => players.find(p => p.id === id)).filter(Boolean) as unknown as Player[]

        if (action === "BAN") {
            // Calculate opponent strengths to ban their best
            targetStrengths = simulationEngineV2.calculateMapStrengths(opponentPlayers)
        }

        const selectedMap = simulationEngineV2.selectMapForVeto(
            aiTurnRng,
            availableMaps,
            targetStrengths,
            action as "BAN" | "PICK",
            3 // Default analyst level
        )

        commitAction(side, action, selectedMap)
        processingRef.current = false
    }

    const handleSideSelection = (side: "home" | "away", mapId: MapId, startingSide: "CT" | "T") => {
        const teamId = side === "home" ? homeTeam!.id : awayTeam!.id
        // Key: If starting side is CT, mapStartingSides[mapId] = teamId
        // If starting side is T, we need to know who is CT. CT is the other team.
        const ctTeamId = startingSide === "CT" ? teamId : (side === "home" ? awayTeam!.id : homeTeam!.id)

        setMapStartingSides(prev => ({ ...prev, [mapId]: ctTeamId }))
        setVetoHistory(prev => [...prev, { team: side, action: "SIDE_PICK", mapId }])
        setShowSideSelection(null)
    }

    const handleUserAction = (mapId: MapId) => {
        if (isAiTurn || processingRef.current || showSideSelection) return

        const turnIndex = vetoHistory.length
        if (turnIndex >= vetoSequence.length) return

        const currentTurn = vetoSequence[turnIndex]
        if (currentTurn.team === "auto" || currentTurn.action === "SIDE_PICK") return

        commitAction(currentTurn.team as "home" | "away", currentTurn.action as "BAN" | "PICK", mapId)
    }

    const commitAction = (team: string, action: string, mapId: MapId) => {
        setVetoHistory(prev => [...prev, { team: team as any, action: action as any, mapId }])
        setAvailableMaps(prev => prev.filter(m => m !== mapId))
    }

    const handleCompletion = () => {
        // Navigate to Match Hub (Tactics) with picked maps
        // Maps = Picks + Decider
        const picks = vetoHistory
            .filter(v => v.action === "PICK" || (v.action as string) === "DECIDER")
            .map(v => v.mapId)
            .filter((m): m is MapId => !!m)

        // Save to store
        updateScheduledMatch(id, {
            vetoComplete: true,
            maps: picks as string[],
            mapStartingSides: mapStartingSides
        })

        // Redirect to Hub
        router.push(`/match/${id}/tactics`)
    }

    // Keep refs updated with latest function references
    handleCompletionRef.current = handleCompletion
    executeAiTurnRef.current = executeAiTurn

    // AI Logic Hook
    useEffect(() => {
        if (!match || !homeTeam || !awayTeam) return

        let completionTimer: ReturnType<typeof setTimeout> | null = null
        let deciderTimer: ReturnType<typeof setTimeout> | null = null
        let aiTimer: ReturnType<typeof setTimeout> | null = null

        // Auto-redirect with delay when complete
        if (vetoSequence.length > 0 && vetoHistory.length >= vetoSequence.length) {
            completionTimer = setTimeout(() => {
                handleCompletionRef.current()
            }, 2000)
            return () => {
                if (completionTimer) clearTimeout(completionTimer)
            }
        }

        if (vetoSequence.length === 0) return

        const turnIndex = vetoHistory.length
        const currentTurn = vetoSequence[turnIndex]
        if (!currentTurn) return

        // Check if DECIDER (Auto)
        if (currentTurn.action === "DECIDER" && !processingRef.current) {
            // Auto pick last remaining
            const lastMap = availableMaps[0]
            if (lastMap) {
                // Small delay for visual effect
                processingRef.current = true
                deciderTimer = setTimeout(() => {
                    commitAction("auto", "DECIDER", lastMap)
                    processingRef.current = false
                }, 1000)
            }
            return () => {
                if (deciderTimer) clearTimeout(deciderTimer)
            }
        }

        const activeTeamId = currentTurn.team === "home" ? homeTeam.id : awayTeam.id
        const isUserTeam = activeTeamId === playerTeamId

        if (!isUserTeam && !processingRef.current) {
            // AI TURN
            setIsAiTurn(true)
            setStatus(`${currentTurn.team === "home" ? homeTeam.name : awayTeam.name} is thinking...`)
            processingRef.current = true

            aiTimer = setTimeout(() => {
                executeAiTurnRef.current(currentTurn.team as "home" | "away", currentTurn.action as "BAN" | "PICK" | "SIDE_PICK")
            }, 1000)
        } else if (isUserTeam) {
            setIsAiTurn(false)
            setStatus(`Your turn to ${currentTurn.action.replace("_", " ")}`)

            // If it's a side pick or decider pick, we might need a specific UI trigger
            if (currentTurn.action === "SIDE_PICK") {
                const prevAction = vetoHistory[vetoHistory.length - 1]
                if (prevAction?.mapId) {
                    setShowSideSelection(prevAction.mapId)
                }
            }
        }

        return () => {
            if (completionTimer) clearTimeout(completionTimer)
            if (deciderTimer) clearTimeout(deciderTimer)
            if (aiTimer) clearTimeout(aiTimer)
        }
    }, [vetoHistory, match, availableMaps, vetoSequence, homeTeam, awayTeam, playerTeamId])

    if (!match || !homeTeam || !awayTeam) return <div className="p-8 text-center text-muted-foreground">{status}</div>

    const turnIndex = Math.min(vetoHistory.length, vetoSequence.length - 1)
    const currentTurn = vetoSequence[turnIndex] || { team: "home", action: "WAIT" }

    // Helper to calculate team rating
    const getTeamRating = (teamPlayers: Player[]) => {
        if (!teamPlayers.length) return 5.0
        // Scale 0-100 skill to 0-10 displayed rating
        return (teamPlayers.reduce((sum, p) => sum + p.skill, 0) / teamPlayers.length) / 10
    }

    const homePlayersList = homeTeam.rosterIds.map(id => players.find(p => p.id === id)).filter(Boolean) as unknown as Player[]
    const awayPlayersList = awayTeam.rosterIds.map(id => players.find(p => p.id === id)).filter(Boolean) as unknown as Player[]
    const homeRatingNum = getTeamRating(homePlayersList)
    const awayRatingNum = getTeamRating(awayPlayersList)

    return (
        <div className="min-h-screen bg-[#0e1217] text-white p-6 overflow-hidden relative">
            {/* Ambient Background Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-primary/5 blur-[120px] pointer-events-none" />

            {/* Header / Team Comparison */}
            <div className="max-w-7xl mx-auto mb-12 relative z-10">
                <div className="flex justify-between items-center gap-8">
                    {/* Home Team */}
                    <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex flex-col items-center w-1/3 group"
                    >
                        <div className={cn(
                            "w-32 h-32 rounded-[40px] bg-white/5 border-2 flex items-center justify-center p-6 mb-6 transition-all duration-500 shadow-2xl relative overflow-hidden",
                            currentTurn.team === "home"
                                ? "border-primary shadow-primary/20 scale-110 active-team-glow"
                                : "border-white/10 grayscale group-hover:grayscale-0"
                        )}>
                            <TeamLogoDisplay team={homeTeam} size={80} className="relative z-10" />
                            {currentTurn.team === "home" && (
                                <div className="absolute inset-0 bg-primary/20 animate-pulse" />
                            )}
                        </div>
                        <h2 className="text-3xl font-normal tracking-tight mb-2 uppercase text-center">{homeTeam.name}</h2>
                        <div className="flex items-center gap-3">
                            <Badge className="bg-primary/20 text-primary border-primary/20 text-[10px] font-normal uppercase tracking-widest px-3 py-1">
                                RATING: {homeRatingNum.toFixed(1)}
                            </Badge>
                            {currentTurn.team === "home" && (
                                <Badge className="bg-emerald-500 text-black border-none text-[10px] font-normal uppercase tracking-widest px-3 py-1 animate-bounce">
                                    ACTIVE
                                </Badge>
                            )}
                        </div>
                    </motion.div>

                    {/* VS Center */}
                    <div className="flex flex-col items-center w-1/3">
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-white/5 border border-white/10 rounded-full px-8 py-3 mb-6 backdrop-blur-xl"
                        >
                            <span className="text-4xl font-normal text-white/40 italic">VS</span>
                        </motion.div>
                        <div className="text-center">
                            <p className="text-[10px] font-normal uppercase text-primary tracking-[0.4em] mb-2">MATCH CONTROL</p>
                            <h3 className="text-sm font-bold text-white/80 uppercase tracking-widest px-6 py-2 bg-white/5 rounded-full border border-white/10 backdrop-blur-md">
                                {status}
                            </h3>
                        </div>

                        {/* Match Details */}
                        {match && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="mt-8 w-full max-w-sm"
                            >
                                {(() => {
                                    // Try to find tournament definition. match.tournamentId might include season suffix e.g. _s1
                                    if (!match.tournamentId) return null
                                    const baseId = match.tournamentId.split("_s")[0]
                                    const tournament = FULL_TOURNAMENT_CALENDAR.find(t => t.id === match.tournamentId || t.id === baseId)

                                    if (!tournament) return null

                                    return (
                                        <div className="glass-panel p-4 border-white/5 bg-black/20 backdrop-blur-md rounded-2xl">
                                            <table className="w-full text-sm">
                                                <tbody>
                                                    <tr className="border-b border-white/5">
                                                        <td className="py-2 text-white/40 font-normal text-[10px] uppercase tracking-widest">Tournament</td>
                                                        <td className="py-2 text-right font-bold text-white truncate max-w-[150px]">{tournament.name}</td>
                                                    </tr>
                                                    <tr className="border-b border-white/5">
                                                        <td className="py-2 text-white/40 font-normal text-[10px] uppercase tracking-widest">Stage</td>
                                                        <td className="py-2 text-right font-bold text-primary">{match.stage}</td>
                                                    </tr>
                                                    <tr>
                                                        <td className="py-2 text-white/40 font-normal text-[10px] uppercase tracking-widest">Format</td>
                                                        <td className="py-2 text-right font-bold text-white">{match.format || "BO1"}</td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    )
                                })()}
                            </motion.div>
                        )}
                    </div>

                    {/* Away Team */}
                    <motion.div
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex flex-col items-center w-1/3 group"
                    >
                        <div className={cn(
                            "w-32 h-32 rounded-[40px] bg-white/5 border-2 flex items-center justify-center p-6 mb-6 transition-all duration-500 shadow-2xl relative overflow-hidden",
                            currentTurn.team === "away"
                                ? "border-primary shadow-primary/20 scale-110 active-team-glow"
                                : "border-white/10 grayscale group-hover:grayscale-0"
                        )}>
                            <TeamLogoDisplay team={awayTeam} size={80} className="relative z-10" />
                            {currentTurn.team === "away" && (
                                <div className="absolute inset-0 bg-primary/20 animate-pulse" />
                            )}
                        </div>
                        <h2 className="text-3xl font-normal tracking-tight mb-2 uppercase text-center">{awayTeam.name}</h2>
                        <div className="flex items-center gap-3">
                            <Badge className="bg-primary/20 text-primary border-primary/20 text-[10px] font-normal uppercase tracking-widest px-3 py-1">
                                RATING: {awayRatingNum.toFixed(1)}
                            </Badge>
                            {currentTurn.team === "away" && (
                                <Badge className="bg-emerald-500 text-black border-none text-[10px] font-normal uppercase tracking-widest px-3 py-1 animate-bounce">
                                    ACTIVE
                                </Badge>
                            )}
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Map Grid */}
            <div className="max-w-7xl mx-auto px-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {Object.values(MapId).map((mapId, idx) => {
                        const isAvailable = availableMaps.includes(mapId)
                        const actionLog = vetoHistory.find(v => v.mapId === mapId)
                        const isBanned = actionLog?.action === "BAN"
                        const isPicked = actionLog?.action === "PICK" || actionLog?.action === "DECIDER"
                        const canInteract = isAvailable && !isAiTurn && currentTurn.team !== "auto"
                        const homeMapStats = homeTeam ? getTeamMapStats(homeTeam.id) : {}
                        const awayMapStats = awayTeam ? getTeamMapStats(awayTeam.id) : {}
                        const hStats = homeMapStats[mapId] || { wins: 0, losses: 0 }
                        const aStats = awayMapStats[mapId] || { wins: 0, losses: 0 }

                        return (
                            <motion.div
                                key={mapId}
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className={cn(
                                    "relative h-64 rounded-[32px] overflow-hidden border-2 transition-all duration-500 group shadow-2xl",
                                    canInteract ? "border-white/10 hover:border-primary/50 cursor-pointer hover:-translate-y-2 hover:shadow-primary/20" : "border-white/5 opacity-40",
                                    isPicked && "border-emerald-500 shadow-emerald-500/20 ring-4 ring-emerald-500/20",
                                    isBanned && "border-rose-500 grayscale opacity-30 shadow-none border opacity-20"
                                )}
                                onClick={() => canInteract && handleUserAction(mapId)}
                            >
                                {/* Map Wallpaper */}
                                <Image
                                    src={MAP_WALLPAPERS[mapId] || "/maps/dust2.png"}
                                    alt={mapId}
                                    fill
                                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                                />

                                {/* Glass Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

                                {/* Map Info & Status */}
                                <div className="absolute inset-0 p-6 flex flex-col justify-between z-10">
                                    <div className="flex justify-between items-start">
                                        <div className="bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
                                            <h4 className="text-sm font-normal text-white uppercase tracking-wider">{MAP_NAMES[mapId]}</h4>
                                            {(hStats.wins + hStats.losses + aStats.wins + aStats.losses > 0) && (
                                                <div className="flex gap-2 mt-0.5">
                                                    <span className="text-[9px] text-blue-400 font-bold">{hStats.wins}W-{hStats.losses}L</span>
                                                    <span className="text-[9px] text-white/20">|</span>
                                                    <span className="text-[9px] text-purple-400 font-bold">{aStats.wins}W-{aStats.losses}L</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            {isPicked && mapStartingSides[mapId] && (
                                                <div className="flex gap-1 items-center bg-black/40 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10">
                                                    <Image
                                                        src={mapStartingSides[mapId] === homeTeam!.id
                                                            ? "/assets/badges/ct_coin.png"
                                                            : "/assets/badges/t_coin.png"}
                                                        alt="Side" width={20} height={20}
                                                    />
                                                    <span className="text-[10px] font-bold text-white/60">VS</span>
                                                    <Image
                                                        src={mapStartingSides[mapId] === homeTeam!.id
                                                            ? "/assets/badges/t_coin.png"
                                                            : "/assets/badges/ct_coin.png"}
                                                        alt="Side" width={20} height={20}
                                                    />
                                                </div>
                                            )}
                                            {isBanned && (
                                                <div className="w-10 h-10 rounded-full bg-rose-500 flex items-center justify-center shadow-lg shadow-rose-500/40">
                                                    <Ban size={20} className="text-white" />
                                                </div>
                                            )}
                                            {isPicked && (
                                                <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/40">
                                                    <Check size={20} className="text-black" />
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {actionLog && (
                                        <motion.div
                                            initial={{ scale: 0.8, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            className={cn(
                                                "px-4 py-2 rounded-2xl backdrop-blur-xl border font-normal text-[10px] uppercase tracking-[0.2em] self-start inline-flex items-center gap-2",
                                                isBanned ? "bg-rose-500/20 border-rose-500/40 text-rose-400" : "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                                            )}
                                        >
                                            <div className={cn("w-1.5 h-1.5 rounded-full", isBanned ? "bg-rose-400" : "bg-emerald-400")} />
                                            {actionLog.team === "auto" ? "DECIDER" : `${(actionLog.team === "home" ? homeTeam!.name : awayTeam!.name).toUpperCase()} ${actionLog.action}`}
                                        </motion.div>
                                    )}

                                    {!actionLog && canInteract && (
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-primary/20 backdrop-blur-xl border border-primary/40 rounded-2xl p-3 flex items-center justify-center gap-2">
                                            <span className="text-[10px] font-normal text-white uppercase tracking-widest">{currentTurn.action} THIS MAP</span>
                                        </div>
                                    )}
                                </div>

                                {/* Banned/Picked Texture Overlay */}
                                {isBanned && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className="text-rose-500/20 font-normal text-8xl rotate-12 border-8 border-rose-500/20 px-8 py-2 rounded-3xl">BANNED</div>
                                    </div>
                                )}
                            </motion.div>
                        )
                    })}
                </div>
            </div>

            {/* Turn Progress Indicator */}
            {/* Turn Progress Indicator */}
            <div className="mt-16 flex flex-col items-center gap-6 relative z-10">
                <div className="flex justify-center gap-3">
                    {vetoSequence.map((step, idx) => (
                        <div key={idx} className="flex flex-col items-center gap-2">
                            <div
                                className={cn(
                                    "h-1.5 w-16 rounded-full transition-all duration-500",
                                    idx < vetoHistory.length ? "bg-white/20" :
                                        idx === vetoHistory.length ? "bg-primary w-20 shadow-[0_0_15px_rgba(59,130,246,0.6)]" : "bg-white/5",
                                    "thumb-animation"
                                )}
                            />
                            <span className={cn(
                                "text-[8px] font-normal uppercase tracking-widest transition-opacity",
                                idx === vetoHistory.length ? "opacity-100 text-primary" : "opacity-0"
                            )}>
                                {step.action.replace("_", " ")} {step.team?.toUpperCase()}
                            </span>
                        </div>
                    ))}
                </div>

                <div className="px-6 py-2 rounded-full border border-white/5 bg-white/[0.02] text-white/40 text-[10px] font-bold uppercase tracking-widest backdrop-blur-md">
                    {match?.format || "BO3"} Series • Match ID: {id?.substring(0, 12)}...
                </div>
            </div>

            {/* Side Selection Overlay */}
            <AnimatePresence>
                {showSideSelection && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 top-16 z-modal flex items-center justify-center bg-black/85 backdrop-blur-md p-6"
                    >
                        <div className="max-w-2xl w-full text-center">
                            <motion.div
                                initial={{ y: 50, scale: 0.9 }}
                                animate={{ y: 0, scale: 1 }}
                                className="mb-12"
                            >
                                <span className="text-primary font-normal uppercase tracking-[0.5em] text-xs mb-4 block">Side Selection</span>
                                <h2 className="text-5xl font-normal uppercase mb-4 tracking-tighter">Choose Your Side</h2>
                                <p className="text-white/40 font-bold uppercase tracking-widest text-sm">
                                    Map: {MAP_NAMES[showSideSelection || ""]}
                                </p>
                            </motion.div>

                            <div className="grid grid-cols-2 gap-8">
                                {/* CT CHOICE */}
                                <motion.div
                                    whileHover={{ scale: 1.05, y: -10 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => handleSideSelection(currentTurn.team as "home" | "away", showSideSelection, "CT")}
                                    className="relative aspect-square rounded-[40px] bg-gradient-to-br from-blue-500/20 to-blue-900/40 border-2 border-blue-500/30 flex flex-col items-center justify-center gap-6 cursor-pointer group hover:border-blue-500 hover:shadow-[0_0_50px_rgba(59,130,246,0.2)] transition-all duration-500"
                                >
                                    <div className="w-48 h-48 relative">
                                        <Image src="/assets/badges/ct_coin.png" alt="CT" fill className="object-contain drop-shadow-[0_0_30px_rgba(59,130,246,0.5)] group-hover:scale-110 transition-transform duration-700" />
                                    </div>
                                    <div className="text-center">
                                        <h3 className="text-3xl font-normal text-blue-400 uppercase tracking-tight">Counter-Terrorist</h3>
                                        <p className="text-blue-100/40 font-normal uppercase text-[10px] tracking-[0.3em] mt-1">Start Defending</p>
                                    </div>
                                </motion.div>

                                {/* T CHOICE */}
                                <motion.div
                                    whileHover={{ scale: 1.05, y: -10 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => handleSideSelection(currentTurn.team as "home" | "away", showSideSelection, "T")}
                                    className="relative aspect-square rounded-[40px] bg-gradient-to-br from-orange-500/20 to-orange-900/40 border-2 border-orange-500/30 flex flex-col items-center justify-center gap-6 cursor-pointer group hover:border-orange-500 hover:shadow-[0_0_50px_rgba(249,115,22,0.2)] transition-all duration-500"
                                >
                                    <div className="w-48 h-48 relative">
                                        <Image src="/assets/badges/t_coin.png" alt="T" fill className="object-contain drop-shadow-[0_0_30px_rgba(249,115,22,0.5)] group-hover:scale-110 transition-transform duration-700" />
                                    </div>
                                    <div className="text-center">
                                        <h3 className="text-3xl font-normal text-orange-400 uppercase tracking-tight">Terrorist</h3>
                                        <p className="text-orange-100/40 font-normal uppercase text-[10px] tracking-[0.3em] mt-1">Start Attacking</p>
                                    </div>
                                </motion.div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Active Team Glow Styles */}
            <style jsx global>{`
                .active-team-glow {
                    animation: activeTeamGlow 3s infinite alternate;
                }
                @keyframes activeTeamGlow {
                    0% { box-shadow: 0 0 20px rgba(59, 130, 246, 0.1), inset 0 0 10px rgba(59, 130, 246, 0.1); }
                    100% { box-shadow: 0 0 40px rgba(59, 130, 246, 0.3), inset 0 0 20px rgba(59, 130, 246, 0.2); }
                }
            `}</style>
        </div>
    )
}
