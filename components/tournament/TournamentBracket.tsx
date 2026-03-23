"use client"

import React, { useMemo, useEffect, useRef, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { Trophy, Sparkles, Zap, ChevronLeft, ChevronRight } from "lucide-react"
import confetti from "canvas-confetti"

interface BracketTeam {
    id: string
    name: string
    score?: number
    isWinner?: boolean
    logo?: string
    recentForm?: ("W" | "L" | "D")[]
}

interface BracketMatch {
    id: string
    round: string
    team1?: BracketTeam
    team2?: BracketTeam
    status: "scheduled" | "live" | "completed"
}

interface TournamentBracketProps {
    matches: BracketMatch[]
    rounds: string[]
    onMatchClick?: (matchId: string) => void
    playerTeamId?: string
}

export function TournamentBracket({ matches, rounds, onMatchClick, playerTeamId }: TournamentBracketProps) {
    const confettiTriggeredForId = useRef<string | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [hasDragged, setHasDragged] = useState(false)
    const dragStartRef = useRef({ x: 0, scrollLeft: 0 })

    // Drag-to-pan handlers (mouse)
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (!containerRef.current) return
        // Don't start drag if clicking on a match card button/link
        if ((e.target as HTMLElement).closest('button, a')) return

        e.preventDefault()
        setIsDragging(true)
        setHasDragged(false)
        dragStartRef.current = {
            x: e.clientX,
            scrollLeft: containerRef.current.scrollLeft
        }
    }, [])

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDragging || !containerRef.current) return
        e.preventDefault()

        const deltaX = e.clientX - dragStartRef.current.x
        // Only count as drag if moved more than 5 pixels
        if (Math.abs(deltaX) > 5) {
            setHasDragged(true)
        }

        containerRef.current.scrollLeft = dragStartRef.current.scrollLeft - deltaX
    }, [isDragging])

    const handleMouseUp = useCallback(() => {
        setIsDragging(false)
    }, [])

    const handleMouseLeave = useCallback(() => {
        setIsDragging(false)
    }, [])

    // Scroll position tracking for arrow visibility
    const [canScrollLeft, setCanScrollLeft] = useState(false)
    const [canScrollRight, setCanScrollRight] = useState(false)

    const updateScrollState = useCallback(() => {
        if (!containerRef.current) return
        const el = containerRef.current
        setCanScrollLeft(el.scrollLeft > 10)
        setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10)
    }, [])

    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        updateScrollState()
        el.addEventListener("scroll", updateScrollState, { passive: true })
        const ro = new ResizeObserver(updateScrollState)
        ro.observe(el)
        return () => {
            el.removeEventListener("scroll", updateScrollState)
            ro.disconnect()
        }
    }, [updateScrollState])

    const scrollBy = useCallback((direction: "left" | "right") => {
        if (!containerRef.current) return
        const amount = containerRef.current.clientWidth * 0.6
        containerRef.current.scrollBy({
            left: direction === "right" ? amount : -amount,
            behavior: "smooth"
        })
    }, [])

    // Prevent click events when dragging
    const handleMatchClick = useCallback((matchId: string) => {
        if (hasDragged) return
        onMatchClick?.(matchId)
    }, [hasDragged, onMatchClick])

    // Find player's upcoming/current match for auto-scroll
    const playerUpcomingMatch = useMemo(() => {
        if (!playerTeamId) return null
        // Find first scheduled match involving player
        const scheduled = matches.find(m =>
            m.status === "scheduled" &&
            (m.team1?.id === playerTeamId || m.team2?.id === playerTeamId)
        )
        if (scheduled) return scheduled
        // Otherwise find any match involving player
        return matches.find(m => m.team1?.id === playerTeamId || m.team2?.id === playerTeamId)
    }, [matches, playerTeamId])

    // Auto-scroll to player's match on mount
    useEffect(() => {
        if (!containerRef.current || !playerUpcomingMatch) return

        // Small delay to ensure DOM is rendered
        const timer = setTimeout(() => {
            const matchElement = containerRef.current?.querySelector(`[data-match-id="${playerUpcomingMatch.id}"]`) as HTMLElement | null
            if (matchElement && containerRef.current) {
                const container = containerRef.current
                const matchRect = matchElement.getBoundingClientRect()
                const containerRect = container.getBoundingClientRect()

                // Calculate scroll position to center the match
                const matchCenter = matchElement.offsetLeft + matchRect.width / 2
                const containerCenter = containerRect.width / 2
                const scrollTarget = matchCenter - containerCenter

                container.scrollTo({
                    left: Math.max(0, scrollTarget),
                    behavior: 'smooth'
                })
            }
        }, 100)

        return () => clearTimeout(timer)
    }, [playerUpcomingMatch])

    // Helper to normalize stage names (e.g., "Round of 32 Match 1" → "Round of 32")
    const normalizeRound = (stage: string): string => {
        if (!stage) return "Tournament Match"
        // Handle "Round of X Match Y" → "Round of X"
        const roMatch = stage.match(/^(Round of \d+)/i)
        if (roMatch) return roMatch[1]
        // Handle "Quarter-final 1", "Semi-final 2" → "Quarter-Finals", "Semi-Finals"
        if (stage.toLowerCase().includes("quarter-final")) return "Quarter-Finals"
        if (stage.toLowerCase().includes("semi-final")) return "Semi-Finals"
        // Handle "3rd Place" variations
        if (stage.toLowerCase().includes("3rd") || stage.toLowerCase().includes("third")) return "3rd Place"
        return stage
    }

    // Helper to get sort priority for a round name (lower = earlier in bracket = left side)
    const getRoundPriority = (round: string): number => {
        const lower = round.toLowerCase()

        // Round of X - extract number (higher number = earlier round)
        const roMatch = lower.match(/round of (\d+)|ro(\d+)/)
        if (roMatch) {
            const num = parseInt(roMatch[1] || roMatch[2])
            // Round of 128 = priority 1, Round of 64 = 2, etc.
            if (num >= 128) return 1
            if (num >= 64) return 2
            if (num >= 32) return 3
            if (num >= 16) return 4
            return 5
        }

        // Quarter-finals / Quarter-Final
        if (lower.includes("quarter")) return 10

        // Semi-finals / Semi-Final
        if (lower.includes("semi")) return 20

        // 3rd place / third place (after semis, before final)
        if (lower.includes("3rd") || lower.includes("third") || lower.includes("bronze")) return 25

        // Grand Final / Final / Finals (rightmost)
        if (lower.includes("grand final")) return 30
        if (lower === "final" || lower === "finals") return 30
        if (lower.includes("final") && !lower.includes("quarter") && !lower.includes("semi")) return 30

        // Group stages or unknown - put at the beginning
        if (lower.includes("group")) return 0

        // Default - middle priority
        return 15
    }

    // Normalize all rounds and get unique normalized round names
    const normalizedRounds = useMemo(() => {
        const uniqueNormalized = new Set<string>()
        matches.forEach(m => {
            uniqueNormalized.add(normalizeRound(m.round))
        })
        // Also add any explicitly passed rounds (normalized)
        rounds.forEach(r => uniqueNormalized.add(normalizeRound(r)))
        return Array.from(uniqueNormalized)
    }, [matches, rounds])

    // Sort rounds from earliest (left) to latest (right): RO32 -> RO16 -> QF -> SF -> Final
    const sortedRounds = [...normalizedRounds].sort((a, b) => {
        return getRoundPriority(a) - getRoundPriority(b)
    })

    // Organize matches by NORMALIZED round name
    const organizedMatches = useMemo(() => {
        const grouped: Record<string, BracketMatch[]> = {}
        sortedRounds.forEach(round => {
            grouped[round] = []
        })
        matches.forEach(m => {
            const normalizedName = normalizeRound(m.round)
            if (!grouped[normalizedName]) grouped[normalizedName] = []
            grouped[normalizedName].push(m)
        })
        // Sort matches within each round by match number (extract from id or stage name)
        Object.keys(grouped).forEach(round => {
            grouped[round].sort((a, b) => {
                // Try to extract match number from stage name or id
                const getMatchNum = (m: BracketMatch) => {
                    const matchNumFromStage = m.round.match(/Match (\d+)/i)
                    if (matchNumFromStage) return parseInt(matchNumFromStage[1])
                    const matchNumFromId = m.id.match(/_m(\d+)$/i)
                    if (matchNumFromId) return parseInt(matchNumFromId[1])
                    return 0
                }
                return getMatchNum(a) - getMatchNum(b)
            })
        })
        return grouped
    }, [matches, sortedRounds])

    // Calculate player's path through the bracket
    const playerPath = useMemo(() => {
        if (!playerTeamId) return new Set<string>()
        return new Set(
            matches
                .filter(m => m.team1?.id === playerTeamId || m.team2?.id === playerTeamId)
                .map(m => m.id)
        )
    }, [matches, playerTeamId])

    // Check for Grand Final completion and trigger confetti
    const grandFinal = matches.find(m => m.round === "Grand Final" && m.status === "completed")

    useEffect(() => {
        if (grandFinal && confettiTriggeredForId.current !== grandFinal.id) {
            confettiTriggeredForId.current = grandFinal.id
            // Fire confetti from both sides
            const colors = ["#10b981", "#3b82f6", "#f59e0b", "#ec4899"]
            confetti({
                particleCount: 150,
                spread: 100,
                origin: { x: 0.3, y: 0.5 },
                colors
            })
            setTimeout(() => {
                confetti({
                    particleCount: 150,
                    spread: 100,
                    origin: { x: 0.7, y: 0.5 },
                    colors
                })
            }, 200)
        }
    }, [grandFinal])

    // Check if player won the tournament
    const playerWonTournament = grandFinal && (
        (grandFinal.team1?.id === playerTeamId && grandFinal.team1?.isWinner) ||
        (grandFinal.team2?.id === playerTeamId && grandFinal.team2?.isWinner)
    )

    const renderForm = (form?: ("W" | "L" | "D")[]) => {
        if (!form || form.length === 0) return null
        return (
            <div className="flex gap-0.5 mt-1 opacity-60 group-hover:opacity-100 transition-opacity">
                {form.map((res, i) => (
                    <motion.div
                        key={i}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.1 * i }}
                        className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            res === "W" ? "bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]" :
                                res === "L" ? "bg-rose-500 shadow-[0_0_4px_rgba(244,63,94,0.5)]" :
                                    "bg-zinc-500"
                        )}
                    />
                ))}
            </div>
        )
    }

    // Check if a match involves the player's team
    const isPlayerMatch = (match: BracketMatch) => {
        return playerTeamId && (match.team1?.id === playerTeamId || match.team2?.id === playerTeamId)
    }

    // Calculate total width hint
    const totalRounds = sortedRounds.length
    const hasMultipleRounds = totalRounds > 2

    return (
        <div className="relative">
            {/* Gradient edge fades */}
            {canScrollLeft && (
                <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-[#0a0a0a] to-transparent pointer-events-none z-30" />
            )}
            {canScrollRight && (
                <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-[#0a0a0a] to-transparent pointer-events-none z-30" />
            )}

            {/* Left arrow button */}
            {canScrollLeft && (
                <button
                    onClick={() => scrollBy("left")}
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-40 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 hover:border-white/25 backdrop-blur-md flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 shadow-lg"
                    aria-label="Scroll left"
                >
                    <ChevronLeft size={20} className="text-white/80" />
                </button>
            )}

            {/* Right arrow button */}
            {canScrollRight && (
                <button
                    onClick={() => scrollBy("right")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-40 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 hover:border-white/25 backdrop-blur-md flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 shadow-lg"
                    aria-label="Scroll right"
                >
                    <ChevronRight size={20} className="text-white/80" />
                </button>
            )}

            <div
                ref={containerRef}
                className={cn(
                    "flex gap-6 p-4 overflow-x-auto modern-scrollbar pb-8 relative",
                    isDragging ? "cursor-grabbing select-none" : "cursor-grab"
                )}
                style={{ userSelect: isDragging ? 'none' : 'auto' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
            >
                <style jsx global>{`
                    .modern-scrollbar::-webkit-scrollbar {
                        height: 8px;
                    }
                    .modern-scrollbar::-webkit-scrollbar-track {
                        background: rgba(255, 255, 255, 0.02);
                        border-radius: 10px;
                        margin: 0 40px;
                    }
                    .modern-scrollbar::-webkit-scrollbar-thumb {
                        background: rgba(255, 255, 255, 0.1);
                        border-radius: 10px;
                        transition: background 0.2s;
                    }
                    .modern-scrollbar::-webkit-scrollbar-thumb:hover {
                        background: rgba(255, 255, 255, 0.2);
                    }
                    @keyframes flowingDash {
                        from { stroke-dashoffset: 24; }
                        to { stroke-dashoffset: 0; }
                    }
                    @keyframes pulseGlow {
                        0%, 100% { box-shadow: 0 0 20px rgba(59, 130, 246, 0.2); }
                        50% { box-shadow: 0 0 40px rgba(59, 130, 246, 0.4); }
                    }
                    @keyframes spotlight {
                        0%, 100% { opacity: 0.3; }
                        50% { opacity: 0.6; }
                    }
                    .animate-flowing-dash {
                        animation: flowingDash 1s linear infinite;
                    }
                    .animate-pulse-glow {
                        animation: pulseGlow 2s ease-in-out infinite;
                    }
                    .animate-spotlight {
                        animation: spotlight 3s ease-in-out infinite;
                    }
                `}</style>

                {/* Background Atmosphere */}
                <div className="fixed inset-0 pointer-events-none overflow-hidden isolate -z-10">
                    <motion.div
                        className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/5 rounded-full blur-[120px]"
                        animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.7, 0.5] }}
                        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <motion.div
                        className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/5 rounded-full blur-[120px]"
                        animate={{ scale: [1.1, 1, 1.1], opacity: [0.5, 0.7, 0.5] }}
                        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
                    />
                    {playerWonTournament && (
                        <motion.div
                            className="absolute top-[20%] right-[30%] w-[30%] h-[30%] bg-amber-500/10 rounded-full blur-[100px]"
                            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                        />
                    )}
                </div>

                {/* Champion Banner */}
                <AnimatePresence>
                    {playerWonTournament && (
                        <motion.div
                            initial={{ opacity: 0, y: -50 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -50 }}
                            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-amber-400/30 to-amber-500/20 border border-amber-500/50 backdrop-blur-xl shadow-[0_0_50px_rgba(251,191,36,0.3)]"
                        >
                            <div className="flex items-center gap-4">
                                <Trophy className="w-8 h-8 text-amber-400 animate-bounce" />
                                <div className="text-center">
                                    <p className="text-amber-400 font-bold uppercase tracking-widest text-sm">Tournament Champion!</p>
                                    <p className="text-amber-400/70 text-xs">Your legacy is written</p>
                                </div>
                                <Trophy className="w-8 h-8 text-amber-400 animate-bounce" />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {sortedRounds.map((round, roundIdx) => (
                    <div key={round} className="flex flex-col justify-around gap-4 min-w-[220px] shrink-0 relative z-0">
                        {/* Round Header */}
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: roundIdx * 0.1, duration: 0.5 }}
                            className={cn(
                                "mb-2 text-center sticky top-0 py-1.5 z-20 border-b border-white/5",
                                round === "Grand Final" ? "bg-gradient-to-b from-amber-900/20 to-[#0a0a0a]/80" : "bg-[#0a0a0a]/80",
                                "backdrop-blur-sm"
                            )}
                        >
                            <h3 className={cn(
                                "text-[10px] font-bold uppercase tracking-[0.4em] flex items-center justify-center gap-2",
                                round === "Grand Final" ? "text-amber-400" : "text-white/40"
                            )}>
                                {round === "Grand Final" && (
                                    <motion.div
                                        animate={{ rotate: [0, 10, -10, 0] }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                    >
                                        <Trophy size={12} className="text-amber-400" />
                                    </motion.div>
                                )}
                                {round}
                                {round === "Grand Final" && (
                                    <motion.div
                                        animate={{ rotate: [0, -10, 10, 0] }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                    >
                                        <Trophy size={12} className="text-amber-400" />
                                    </motion.div>
                                )}
                            </h3>
                        </motion.div>

                        <div className="flex-1 flex flex-col justify-around gap-6 relative">
                            {organizedMatches[round]?.map((match, matchIdx) => {
                                const isUpcomingPlayerMatch = isPlayerMatch(match) && match.status === "scheduled"
                                const isOnPlayerPath = playerPath.has(match.id)
                                const isGrandFinalMatch = round === "Grand Final"

                                return (
                                    <div key={match.id} data-match-id={match.id} className="relative group perspective-1000">
                                        {/* YOUR MATCH Badge */}
                                        {isUpcomingPlayerMatch && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.8, y: -10 }}
                                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                                className="absolute -top-8 left-1/2 -translate-x-1/2 z-30"
                                            >
                                                <div className="px-3 py-1 rounded-full bg-gradient-to-r from-primary/80 to-cyan-500/80 text-white text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5 shadow-[0_0_20px_rgba(59,130,246,0.5)]">
                                                    <Zap size={10} className="animate-pulse" />
                                                    YOUR MATCH
                                                    <Zap size={10} className="animate-pulse" />
                                                </div>
                                            </motion.div>
                                        )}

                                        {/* Spotlight Effect for Player's Upcoming Match */}
                                        {isUpcomingPlayerMatch && (
                                            <motion.div
                                                className="absolute inset-0 -inset-4 rounded-3xl bg-gradient-radial from-primary/20 via-primary/5 to-transparent pointer-events-none animate-spotlight"
                                            />
                                        )}

                                        {/* Match Card */}
                                        <motion.div
                                            initial={{ opacity: 0, rotateX: -10, y: 20 }}
                                            animate={{ opacity: 1, rotateX: 0, y: 0 }}
                                            transition={{
                                                delay: (roundIdx * 0.15) + (matchIdx * 0.1),
                                                type: "spring",
                                                stiffness: 100,
                                                damping: 15
                                            }}
                                            className={cn(
                                                "glass-panel p-0 overflow-hidden border-white/5 bg-zinc-950/60 hover:bg-zinc-900/90 transition-all duration-300 w-full relative z-10 shadow-2xl backdrop-blur-xl group-hover:scale-[1.02] group-hover:shadow-primary/5 group-hover:border-white/10",
                                                match.status === "live" && "ring-1 ring-primary/50 shadow-[0_0_30px_rgba(59,130,246,0.15)]",
                                                match.status === "scheduled" && isOnPlayerPath && "ring-1 ring-primary/30 animate-pulse-glow",
                                                isGrandFinalMatch && match.status !== "completed" && "ring-1 ring-amber-500/30",
                                                onMatchClick && !isDragging && "cursor-pointer active:scale-[0.98]"
                                            )}
                                            onClick={() => handleMatchClick(match.id)}
                                        >
                                            <div className="flex flex-col">
                                                {/* Team 1 */}
                                                <div className={cn(
                                                    "flex items-center justify-between px-3 py-2.5 border-b border-white/5 relative overflow-hidden",
                                                    match.team1?.isWinner && "bg-gradient-to-r from-emerald-500/[0.05] to-transparent",
                                                    match.team1?.id === playerTeamId && !match.team1?.isWinner && match.status === "scheduled" && "bg-gradient-to-r from-primary/[0.05] to-transparent"
                                                )}>
                                                    <div className="flex items-center gap-2.5 relative z-10">
                                                        <div className={cn(
                                                            "w-7 h-7 rounded flex items-center justify-center relative transition-all duration-300",
                                                            match.team1?.name !== "TBD" ? "bg-black/40 border border-white/5 group-hover:border-white/20" : "bg-white/5 border border-dashed border-white/10",
                                                            match.team1?.id === playerTeamId && "border-primary/50 shadow-[0_0_10px_rgba(59,130,246,0.2)]"
                                                        )}>
                                                            {match.team1?.logo ? (
                                                                <img src={match.team1.logo} alt="" className="w-5 h-5 object-contain drop-shadow-md" />
                                                            ) : (
                                                                <span className="text-xs font-bold text-white/20">{match.team1?.name === "TBD" ? "?" : match.team1?.name[0]}</span>
                                                            )}
                                                            {match.team1?.id === playerTeamId && (
                                                                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-primary rounded-full border border-black" />
                                                            )}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className={cn(
                                                                "text-xs font-bold uppercase tracking-wider leading-none transition-colors",
                                                                match.team1?.isWinner ? "text-white" : match.team1?.name === "TBD" ? "text-white/40" : "text-white/60 group-hover:text-white/80",
                                                                match.team1?.id === playerTeamId && "text-primary"
                                                            )}>
                                                                {match.team1?.name || "TBD"}
                                                            </span>
                                                            {renderForm(match.team1?.recentForm)}
                                                        </div>
                                                    </div>
                                                    <span className={cn(
                                                        "font-mono font-bold text-base tracking-tighter relative z-10",
                                                        match.team1?.isWinner ? "text-emerald-400" : match.team1?.score !== undefined ? "text-white/40" : "text-transparent"
                                                    )}>
                                                        {match.team1?.score ?? "-"}
                                                    </span>
                                                    {match.team1?.isWinner && (
                                                        <motion.div
                                                            initial={{ x: "-100%" }}
                                                            animate={{ x: "100%" }}
                                                            transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 3 }}
                                                            className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent skew-x-12"
                                                        />
                                                    )}
                                                </div>

                                                {/* Team 2 */}
                                                <div className={cn(
                                                    "flex items-center justify-between px-3 py-2.5 relative overflow-hidden",
                                                    match.team2?.isWinner && "bg-gradient-to-r from-emerald-500/[0.05] to-transparent",
                                                    match.team2?.id === playerTeamId && !match.team2?.isWinner && match.status === "scheduled" && "bg-gradient-to-r from-primary/[0.05] to-transparent"
                                                )}>
                                                    <div className="flex items-center gap-2.5 relative z-10">
                                                        <div className={cn(
                                                            "w-7 h-7 rounded flex items-center justify-center relative transition-all duration-300",
                                                            match.team2?.name !== "TBD" ? "bg-black/40 border border-white/5 group-hover:border-white/20" : "bg-white/5 border border-dashed border-white/10",
                                                            match.team2?.id === playerTeamId && "border-primary/50 shadow-[0_0_10px_rgba(59,130,246,0.2)]"
                                                        )}>
                                                            {match.team2?.logo ? (
                                                                <img src={match.team2.logo} alt="" className="w-5 h-5 object-contain drop-shadow-md" />
                                                            ) : (
                                                                <span className="text-xs font-bold text-white/20">{match.team2?.name === "TBD" ? "?" : match.team2?.name[0]}</span>
                                                            )}
                                                            {match.team2?.id === playerTeamId && (
                                                                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-primary rounded-full border border-black" />
                                                            )}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className={cn(
                                                                "text-xs font-bold uppercase tracking-wider leading-none transition-colors",
                                                                match.team2?.isWinner ? "text-white" : match.team2?.name === "TBD" ? "text-white/40" : "text-white/60 group-hover:text-white/80",
                                                                match.team2?.id === playerTeamId && "text-primary"
                                                            )}>
                                                                {match.team2?.name || "TBD"}
                                                            </span>
                                                            {renderForm(match.team2?.recentForm)}
                                                        </div>
                                                    </div>
                                                    <span className={cn(
                                                        "font-mono font-bold text-base tracking-tighter relative z-10",
                                                        match.team2?.isWinner ? "text-emerald-400" : match.team2?.score !== undefined ? "text-white/40" : "text-transparent"
                                                    )}>
                                                        {match.team2?.score ?? "-"}
                                                    </span>
                                                    {match.team2?.isWinner && (
                                                        <motion.div
                                                            initial={{ x: "-100%" }}
                                                            animate={{ x: "100%" }}
                                                            transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 3 }}
                                                            className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent skew-x-12"
                                                        />
                                                    )}
                                                </div>
                                            </div>

                                            {/* Live Badge */}
                                            {match.status === "live" && (
                                                <div className="absolute top-0 right-0 bg-primary px-3 py-1 text-[8px] font-bold uppercase text-white tracking-[0.2em] shadow-[0_0_15px_rgba(59,130,246,0.5)] z-20">
                                                    LIVE
                                                    <span className="absolute top-0 right-0 flex h-2 w-2">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                                    </span>
                                                </div>
                                            )}

                                            {/* Grand Final Badge */}
                                            {isGrandFinalMatch && match.status !== "completed" && (
                                                <div className="absolute top-0 left-0 bg-gradient-to-r from-amber-500 to-amber-600 px-3 py-1 text-[8px] font-bold uppercase text-black tracking-[0.2em] shadow-[0_0_15px_rgba(251,191,36,0.5)] z-20 flex items-center gap-1">
                                                    <Sparkles size={10} />
                                                    CHAMPIONSHIP
                                                </div>
                                            )}
                                        </motion.div>

                                        {/* Animated SVG Connectors (to next round) */}
                                        {roundIdx < sortedRounds.length - 1 && (
                                            <div className="absolute top-1/2 -right-8 w-8 h-full pointer-events-none transition-opacity duration-500" style={{ opacity: isOnPlayerPath ? 1 : 0.3 }}>
                                                <svg className="w-full h-full overflow-visible">
                                                    <defs>
                                                        <linearGradient id={`flow-gradient-${match.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                                                            <stop offset="0%" stopColor={isOnPlayerPath ? "#3b82f6" : "#ffffff"} stopOpacity="0.5" />
                                                            <stop offset="50%" stopColor={isOnPlayerPath ? "#10b981" : "#ffffff"} stopOpacity="1" />
                                                            <stop offset="100%" stopColor={isOnPlayerPath ? "#3b82f6" : "#ffffff"} stopOpacity="0.5" />
                                                        </linearGradient>
                                                        <filter id={`glow-${match.id}`}>
                                                            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                                                            <feMerge>
                                                                <feMergeNode in="coloredBlur" />
                                                                <feMergeNode in="SourceGraphic" />
                                                            </feMerge>
                                                        </filter>
                                                    </defs>
                                                    <path
                                                        d={matchIdx % 2 === 0
                                                            ? "M 0 0 L 32 0 L 32 60 L 64 60"
                                                            : "M 0 0 L 32 0 L 32 -60 L 64 -60"
                                                        }
                                                        fill="none"
                                                        stroke={match.status === "completed"
                                                            ? (isOnPlayerPath ? "#10b981" : "#10b981")
                                                            : `url(#flow-gradient-${match.id})`}
                                                        strokeWidth={isOnPlayerPath ? "3" : "2"}
                                                        strokeDasharray="8 4"
                                                        className={cn(
                                                            "transition-all duration-500",
                                                            match.status !== "completed" && isOnPlayerPath && "animate-flowing-dash"
                                                        )}
                                                        filter={isOnPlayerPath ? `url(#glow-${match.id})` : undefined}
                                                    />
                                                </svg>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
