"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { useRouter, useParams } from "next/navigation"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { Ban, Check, ArrowLeft } from "lucide-react"
import { MapId } from "@/types/enums" // Fixed import
import { Player } from "@/types"
import { MatchSaveData, TeamSaveData } from "@/engine/save-types"
import { MAP_NAMES, ACTIVE_MAP_POOL } from "@/data/map-pool"
import { simulationEngineV2, SeededRNG } from "@/engine"
import Image from "next/image"
import { SideEmblem } from "@/components/match/SideEmblem"
import { motion, AnimatePresence } from "framer-motion"
import { useFocusTrap } from "@/lib/accessibility"
import { cn, deterministicSeed } from "@/lib/utils"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { FULL_TOURNAMENT_CALENDAR } from "@/data/tournament-calendar"

// Map Wallpaper Paths
const MAP_WALLPAPERS: Record<string, string> = {
    [MapId.SANDSTONE]: "/maps/sandstone.png",
    [MapId.MIRAGE]: "/maps/mirage.png",
    [MapId.INFERNO]: "/maps/inferno.png",
    [MapId.NUKE]: "/maps/nuke.png",
    [MapId.OVERPASS]: "/maps/overpass.png",
    [MapId.VERTIGO]: "/maps/vertigo.png",
    [MapId.ANCIENT]: "/maps/ancient.png",
    [MapId.ANUBIS]: "/maps/anubis.png",
}

interface VetoTurn {
    team: "home" | "away" | "auto"
    action: "BAN" | "PICK" | "DECIDER" | "SIDE_PICK"
    mapId?: MapId
}

// Pure helper, lifted out of the component so it doesn't allocate a fresh
// closure on every render.
function computeTeamMapStats(
    completedMatches: ReadonlyArray<{ homeTeamId: string; awayTeamId: string; result?: { maps?: Array<{ map: string; finalScore?: { team1: number; team2: number } }> } }> | null | undefined,
    teamId: string,
): Record<string, { wins: number; losses: number }> {
    const stats: Record<string, { wins: number; losses: number }> = {}
    if (!completedMatches) return stats
    for (const match of completedMatches) {
        if (match.homeTeamId !== teamId && match.awayTeamId !== teamId) continue
        if (!match.result?.maps) continue
        const isHome = match.homeTeamId === teamId
        for (const mapResult of match.result.maps) {
            const mapName = mapResult.map
            if (!stats[mapName]) stats[mapName] = { wins: 0, losses: 0 }
            const homeWonMap = (mapResult.finalScore?.team1 ?? 0) > (mapResult.finalScore?.team2 ?? 0)
            if (isHome ? homeWonMap : !homeWonMap) stats[mapName].wins++
            else stats[mapName].losses++
        }
    }
    return stats
}


function TeamSide({ team, rating, active, isUser, align }: { team: TeamSaveData; rating: number; active: boolean; isUser: boolean; align: "left" | "right" }) {
    return (
        <div className={cn("flex min-w-0 flex-1 items-center gap-4", align === "right" && "flex-row-reverse text-right")}>
            <div className={cn("flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border bg-raised transition-colors duration-150", active ? "border-gold" : "border-line")}>
                <TeamLogoDisplay team={team} size={48} />
            </div>
            <div className="min-w-0">
                <h2 className="truncate font-display text-[32px] font-bold uppercase leading-none text-ink-1">{team.name}</h2>
                <p className={cn("mt-1.5 flex items-center gap-2 text-xs text-ink-3", align === "right" && "justify-end")}>
                    <span>Avg skill <span className="font-semibold tabular-nums text-ink-2">{rating.toFixed(1)}</span></span>
                    {isUser && <span className="rounded-sm border border-line-strong px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">You</span>}
                </p>
            </div>
        </div>
    )
}

export default function VetoPage({ params: _initialParams }: { params: Promise<{ id: string }> }) {
    const params = useParams()
    const id = params.id as string
    const router = useRouter()
    const { scheduledMatches, teams, players, updateScheduledMatch, playerTeamId, completedMatches } = useGameStore(useShallow(state => ({
        scheduledMatches: state.scheduledMatches,
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
    // Side choice is required to continue: focus is trapped, Escape does not dismiss.
    const sideDialogRef = useFocusTrap(!!showSideSelection)


    // Compute map win rates for both teams from completed matches.
    // Memoized so the 8-map grid below doesn't re-iterate every completed
    // match 16× per render (8 maps × {home, away}). For long careers
    // completedMatches can reach 1000s of entries, and every veto action
    // (ban, pick, side select) triggers a re-render, so the unmemoized
    // version did ~16k forEach iterations per click.
    const homeMapStats = useMemo(
        () => homeTeam ? computeTeamMapStats(completedMatches, homeTeam.id) : {},
        [completedMatches, homeTeam],
    )
    const awayMapStats = useMemo(
        () => awayTeam ? computeTeamMapStats(completedMatches, awayTeam.id) : {},
        [completedMatches, awayTeam],
    )

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

        // Initialize Maps & Sequence only if not set
        if (availableMaps.length === 0 && vetoSequence.length === 0) {
            setAvailableMaps([...ACTIVE_MAP_POOL])
            setVetoSequence(generateVetoSequence(foundMatch.format || "BO3"))
            setStatus("Ready to start veto")
        }

        // Only re-fire when the match identity / hydration source changes —
        // not when intermediate veto state mutates.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scheduledMatches, teams, id])

    // AI Logic Hook
    useEffect(() => {
        if (!match || !homeTeam || !awayTeam) return

        // Auto-redirect with delay when complete
        if (vetoSequence.length > 0 && vetoHistory.length >= vetoSequence.length) {
            const timer = setTimeout(() => {
                handleCompletion()
            }, 2000)
            return () => clearTimeout(timer)
        }

        if (vetoSequence.length === 0) return

        const turnIndex = vetoHistory.length
        const currentTurn = vetoSequence[turnIndex]

        // Check if DECIDER (Auto)
        if (currentTurn?.action === "DECIDER" && !processingRef.current) {
            // Auto pick last remaining
            const lastMap = availableMaps[0]
            if (lastMap) {
                // Small delay for visual effect
                processingRef.current = true
                setTimeout(() => {
                    commitAction("auto", "DECIDER", lastMap)
                    processingRef.current = false
                }, 1000)
            }
            return
        }

        const activeTeamId = currentTurn.team === "home" ? homeTeam.id : awayTeam.id
        const isUserTeam = activeTeamId === playerTeamId

        if (!isUserTeam && !processingRef.current) {
            // AI TURN
            setIsAiTurn(true)
            setStatus(`${currentTurn.team === "home" ? homeTeam.name : awayTeam.name} is choosing…`)
            processingRef.current = true

            setTimeout(() => {
                executeAiTurn(currentTurn.team as "home" | "away", currentTurn.action as "BAN" | "PICK" | "SIDE_PICK")
            }, 1000)
        } else if (isUserTeam) {
            setIsAiTurn(false)
            setStatus(`Your turn to ${currentTurn.action.replace("_", " ").toLowerCase()}`)

            // If it's a side pick or decider pick, we might need a specific UI trigger
            if (currentTurn.action === "SIDE_PICK") {
                const prevAction = vetoHistory[vetoHistory.length - 1]
                if (prevAction?.mapId) {
                    setShowSideSelection(prevAction.mapId)
                }
            }
        }

        // Driven by veto progression — adding all the AI/team deps would
        // force the effect to re-run on every closure-captured value
        // change and break the controlled-progression invariant.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vetoHistory, match, availableMaps])

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

    // NOTE: Hooks below MUST run before the early return — null-guard
    // inside each useMemo body so React sees the same hook order on
    // every render regardless of whether match/teams are loaded.
    const playersById = useMemo(
        () => new Map(players.map(p => [p.id, p])),
        [players],
    )
    const homePlayersList = useMemo(
        () => (homeTeam?.rosterIds || []).map(id => playersById.get(id)).filter(Boolean) as unknown as Player[],
        [homeTeam?.rosterIds, playersById],
    )
    const awayPlayersList = useMemo(
        () => (awayTeam?.rosterIds || []).map(id => playersById.get(id)).filter(Boolean) as unknown as Player[],
        [awayTeam?.rosterIds, playersById],
    )

    if (!match || !homeTeam || !awayTeam) {
        return (
            <div className="flex min-h-[70vh] items-center justify-center p-8">
                <div className="w-full max-w-md space-y-5 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border border-line bg-panel">
                        <Ban className="h-6 w-6 text-ink-3" />
                    </div>
                    <div>
                        <h2 className="font-display text-3xl font-bold uppercase text-ink-1">Veto unavailable</h2>
                        <p className="mt-1 text-sm text-ink-3">{status || "This match can't be found or has already been played."}</p>
                    </div>
                    <Button variant="outline" onClick={() => router.push("/")}>
                        <ArrowLeft size={16} /> Back to dashboard
                    </Button>
                </div>
            </div>
        )
    }

    const turnIndex = Math.min(vetoHistory.length, vetoSequence.length - 1)
    const currentTurn = vetoSequence[turnIndex] || { team: "home", action: "WAIT" }
    const vetoDone = vetoSequence.length > 0 && vetoHistory.length >= vetoSequence.length

    // Average skill on the 0–10 scale the old header used.
    const getTeamRating = (teamPlayers: Player[]) => {
        if (!teamPlayers.length) return 5.0
        return (teamPlayers.reduce((sum, p) => sum + p.skill, 0) / teamPlayers.length) / 10
    }

    // What a map is actually worth: the sim adds (own − opponent map
    // strength) / 200 to every round's win chance (match-simulation.ts).
    const userIsHome = homeTeam.id === playerTeamId
    const homeStrengths = simulationEngineV2.calculateMapStrengths(homePlayersList)
    const awayStrengths = simulationEngineV2.calculateMapStrengths(awayPlayersList)
    const roundEdge = (mapId: MapId) => {
        const diff = ((homeStrengths.get(mapId) ?? 50) - (awayStrengths.get(mapId) ?? 50)) / 200
        return (userIsHome ? diff : -diff) * 100
    }
    const teamName = (side: string) => side === "home" ? homeTeam.name : side === "away" ? awayTeam.name : "Decider"
    const actionLabel = (action: string) => action === "SIDE_PICK" ? "Side" : action === "DECIDER" ? "Decider" : action === "BAN" ? "Ban" : action === "PICK" ? "Pick" : action
    const isUserTurn = !vetoDone && !isAiTurn && currentTurn.team !== "auto" && (currentTurn.team === "home" ? homeTeam.id : awayTeam.id) === playerTeamId

    const tournament = (() => {
        if (!match.tournamentId) return null
        const baseId = match.tournamentId.split("_s")[0]
        return FULL_TOURNAMENT_CALENDAR.find(t => t.id === match.tournamentId || t.id === baseId) || null
    })()

    return (
        <div className="mx-auto max-w-[1600px] space-y-4 pb-12">
            {/* Escape hatch: a required multi-step flow must always have a way
                out, so a stalled veto sequence can never trap the player. */}
            <div className="flex items-center justify-between">
                <button
                    onClick={() => router.push(`/match/${id}/tactics`)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-3 transition-colors hover:text-ink-1"
                >
                    <ArrowLeft size={15} aria-hidden="true" /> Match day
                </button>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                    {tournament ? `${tournament.name}${match.stage ? ` · ${match.stage}` : ""}` : "Map veto"}
                </p>
            </div>

            {/* Header: teams + turn */}
            <section className="rounded-[10px] border border-line bg-panel">
                <div className="flex items-center gap-8 px-8 py-5">
                    <TeamSide team={homeTeam} isUser={homeTeam.id === playerTeamId} rating={getTeamRating(homePlayersList)} active={!vetoDone && currentTurn.team === "home"} align="left" />
                    <div className="flex w-[340px] shrink-0 flex-col items-center text-center">
                        <h1 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Map veto · {(match.format || "BO3").toUpperCase()}</h1>
                        <h3
                            aria-live="polite"
                            className={cn("mt-1.5 font-display text-[28px] font-bold uppercase leading-none", isUserTurn ? "text-gold" : "text-ink-1")}
                        >
                            {vetoDone ? "Veto complete" : status}
                        </h3>
                        <p className="mt-1.5 text-xs text-ink-3">
                            {vetoDone ? "Heading back to match day…" : isUserTurn ? (currentTurn.action === "SIDE_PICK" ? "Choose your starting side." : `Click a map to ${currentTurn.action === "BAN" ? "remove it" : "play it"}.`) : `Step ${turnIndex + 1} of ${vetoSequence.length}`}
                        </p>
                    </div>
                    <TeamSide team={awayTeam} isUser={awayTeam.id === playerTeamId} rating={getTeamRating(awayPlayersList)} active={!vetoDone && currentTurn.team === "away"} align="right" />
                </div>

                {/* Sequence */}
                <ol className="flex border-t border-line" aria-label="Veto order">
                    {vetoSequence.map((step, idx) => {
                        const done = idx < vetoHistory.length
                        const current = idx === vetoHistory.length
                        const entry = vetoHistory[idx]
                        return (
                            <li
                                key={idx}
                                aria-current={current ? "step" : undefined}
                                className={cn(
                                    "min-w-0 flex-1 border-r border-line px-3 py-2 last:border-r-0",
                                    current && "bg-raised shadow-[inset_0_-2px_0_var(--gold)]",
                                )}
                            >
                                <p className={cn("text-[11px] font-semibold uppercase tracking-[0.06em]", current ? "text-gold" : done ? "text-ink-3" : "text-ink-3/70")}>
                                    {actionLabel(step.action)}
                                </p>
                                <p className={cn("truncate text-xs", done ? "text-ink-1" : current ? "text-ink-2" : "text-ink-3")}>
                                    {done && entry?.mapId && step.action !== "SIDE_PICK" ? MAP_NAMES[entry.mapId] : teamName(step.team)}
                                </p>
                            </li>
                        )
                    })}
                </ol>
            </section>

            {/* Map pool */}
            <div className="grid grid-cols-4 gap-3 xl:grid-cols-7">
                {[...ACTIVE_MAP_POOL].map((mapId) => {
                    const isAvailable = availableMaps.includes(mapId)
                    const actionLog = vetoHistory.find(v => v.mapId === mapId && v.action !== "SIDE_PICK")
                    const isBanned = actionLog?.action === "BAN"
                    const isPicked = actionLog?.action === "PICK" || actionLog?.action === "DECIDER"
                    const canInteract = isAvailable && !isAiTurn && currentTurn.team !== "auto"
                    const hStats = homeMapStats[mapId] || { wins: 0, losses: 0 }
                    const aStats = awayMapStats[mapId] || { wins: 0, losses: 0 }
                    const hasRecord = hStats.wins + hStats.losses + aStats.wins + aStats.losses > 0
                    const edge = roundEdge(mapId)
                    const ctTeamId = mapStartingSides[mapId]
                    const pickedBy = actionLog?.team === "auto" ? "Decider" : actionLog ? `${actionLabel(actionLog.action)} · ${teamName(actionLog.team)}` : null

                    return (
                        <div
                            key={mapId}
                            className={cn(
                                "group relative flex h-[clamp(240px,calc(100dvh-480px),460px)] flex-col justify-between overflow-hidden rounded-lg border bg-shell transition-colors duration-150",
                                canInteract ? "cursor-pointer border-line hover:border-line-strong" : "border-line",
                                isPicked && "border-2 border-gold",
                            )}
                            role="button"
                            tabIndex={canInteract ? 0 : -1}
                            aria-label={`${MAP_NAMES[mapId] ?? mapId}: ${isBanned ? "banned" : isPicked ? "selected" : canInteract ? "select map" : "waiting for opponent"}`}
                            aria-disabled={!canInteract}
                            onKeyDown={event => {
                                if (event.target !== event.currentTarget || !canInteract) return
                                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); handleUserAction(mapId) }
                            }}
                            onClick={() => canInteract && handleUserAction(mapId)}
                        >
                            <Image
                                src={MAP_WALLPAPERS[mapId] || "/maps/sandstone.png"}
                                alt=""
                                fill
                                sizes="240px"
                                className={cn(
                                    "object-cover transition-opacity duration-150",
                                    isBanned ? "opacity-15 grayscale" : isPicked ? "opacity-55" : canInteract ? "opacity-35 group-hover:opacity-50" : "opacity-30",
                                )}
                            />
                            <div className="absolute inset-0 bg-linear-to-t/srgb from-ink via-ink/60 to-transparent" aria-hidden="true" />

                            {/* Top: state */}
                            <div className="relative flex items-start justify-between gap-2 p-3">
                                {pickedBy ? (
                                    <span className={cn(
                                        "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]",
                                        isBanned ? "bg-ink/80 text-ink-3" : "bg-gold text-gold-on",
                                    )}>
                                        {isBanned ? <Ban size={11} aria-hidden="true" /> : <Check size={11} aria-hidden="true" />}
                                        <span className="truncate">{pickedBy}</span>
                                    </span>
                                ) : <span />}
                            </div>

                            {/* Bottom: name, side, numbers */}
                            <div className="relative space-y-2 p-3">
                                {isPicked && ctTeamId && (
                                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                                        <SideEmblem side={ctTeamId === playerTeamId ? "CT" : "T"} className="h-4 w-4" />
                                        <span className={ctTeamId === playerTeamId ? "text-side-ct" : "text-side-t"}>
                                            You start {ctTeamId === playerTeamId ? "CT" : "T"}
                                        </span>
                                    </div>
                                )}
                                <h4 className={cn("font-display text-[30px] font-bold uppercase leading-none", isBanned ? "text-ink-3 line-through decoration-2" : "text-ink-1")}>
                                    {MAP_NAMES[mapId]}
                                </h4>
                                {!isBanned && (
                                    <dl className="space-y-0.5 text-[11px] text-ink-3">
                                        <div className="flex justify-between gap-2" title="Your round-win edge from map strength on this map, as the match engine applies it.">
                                            <dt>Your edge / round</dt>
                                            <dd className="tabular-nums text-ink-2">{edge >= 0 ? "+" : "−"}{Math.abs(edge).toFixed(1)}%</dd>
                                        </div>
                                        <div className="flex justify-between gap-2" title="Past results on this map. History only; it does not change the odds.">
                                            <dt>Record</dt>
                                            <dd className="tabular-nums text-ink-2">
                                                {hasRecord ? <>{hStats.wins}–{hStats.losses} <span className="text-ink-3">/</span> {aStats.wins}–{aStats.losses}</> : "—"}
                                                <span className="sr-only"> ({homeTeam.name} / {awayTeam.name})</span>
                                            </dd>
                                        </div>
                                    </dl>
                                )}
                                {!actionLog && canInteract && (
                                    <p className="text-xs font-semibold text-ink-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                                        {currentTurn.action === "BAN" ? "Ban this map" : "Pick this map"}
                                    </p>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            <p className="text-xs text-ink-3">
                The engine adds the map-strength gap to every round (the edge shown). It moves by tenths of a percent from map to map, so the veto barely changes the odds.
                Records are past results ({homeTeam.name} / {awayTeam.name}) and don&apos;t affect the match.
            </p>

            {/* Side Selection Overlay */}
            <AnimatePresence>
                {showSideSelection && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="fixed inset-0 top-16 z-modal flex items-center justify-center bg-ink/85 p-6"
                    >
                        <div ref={sideDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="modal-title-side-selection" className="max-h-full w-full max-w-2xl overflow-y-auto rounded-[10px] border border-line-strong bg-panel p-6 text-center">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{MAP_NAMES[showSideSelection || ""]}</p>
                            <h2 id="modal-title-side-selection" className="mt-1 font-display text-4xl font-bold uppercase text-ink-1">Choose your side</h2>
                            <p className="mt-1 text-sm text-ink-3">You play the first half on this side, then switch.</p>

                            <div className="mt-6 grid grid-cols-2 gap-4">
                                <button
                                    type="button"
                                    onClick={() => handleSideSelection(currentTurn.team as "home" | "away", showSideSelection, "CT")}
                                    className="flex flex-col items-center gap-3 rounded-lg border border-line bg-raised p-6 transition-colors duration-150 hover:border-side-ct hover:bg-hover"
                                >
                                    <span className="font-display text-5xl font-bold leading-none text-side-ct">CT</span>
                                    <SideEmblem side="CT" className="h-16 w-16" />
                                    <span>
                                        <span className="block text-base font-semibold text-ink-1">Counter-Terrorist</span>
                                        <span className="block text-xs text-ink-3">Start on defence</span>
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSideSelection(currentTurn.team as "home" | "away", showSideSelection, "T")}
                                    className="flex flex-col items-center gap-3 rounded-lg border border-line bg-raised p-6 transition-colors duration-150 hover:border-side-t hover:bg-hover"
                                >
                                    <span className="font-display text-5xl font-bold leading-none text-side-t">T</span>
                                    <SideEmblem side="T" className="h-16 w-16" />
                                    <span>
                                        <span className="block text-base font-semibold text-ink-1">Terrorist</span>
                                        <span className="block text-xs text-ink-3">Start on attack</span>
                                    </span>
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
