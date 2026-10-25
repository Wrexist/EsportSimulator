"use client"

import { TeamLogoImage } from "@/components/ui/asset-images"
import React, { memo, useMemo, useEffect, useRef, useState, useCallback } from "react"
import { cn } from "@/lib/utils"
import { TeamStanding } from "@/src/components/ui/TeamStanding"
import { Trophy, ChevronLeft, ChevronRight } from "lucide-react"
import { fireConfetti } from "@/lib/confetti-lazy"
import { pressable } from "@/lib/accessibility"

interface BracketTeam {
    id: string
    name: string
    score?: number
    isWinner?: boolean
    logo?: string
    recentForm?: ("W" | "L" | "D")[]
    /** World ranking and team OVR, shown beside the name. */
    rank?: number
    ovr?: number
    branding?: {
        primaryColor: string
        secondaryColor: string
        accentColor: string
        logoStyle: "monogram" | "mascot" | "emblem" | "wordmark"
    }
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

function TournamentBracket({ matches, rounds, onMatchClick, playerTeamId }: TournamentBracketProps) {
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
    const sortedRounds = useMemo(() => [...normalizedRounds].sort((a, b) => {
        return getRoundPriority(a) - getRoundPriority(b)
    }), [normalizedRounds])

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

    // A completed Grand Final the player's team won: celebrate once (gold
    // palette). Other teams' finals no longer fire confetti on every visit.
    const grandFinal = matches.find(m => m.round === "Grand Final" && m.status === "completed")
    const playerWonTournament = !!grandFinal && !!playerTeamId && (
        (grandFinal.team1?.id === playerTeamId && grandFinal.team1?.isWinner) ||
        (grandFinal.team2?.id === playerTeamId && grandFinal.team2?.isWinner)
    )

    useEffect(() => {
        if (!grandFinal || !playerWonTournament || confettiTriggeredForId.current === grandFinal.id) return
        confettiTriggeredForId.current = grandFinal.id
        const colors = ["#F2B53A", "#F2F4F7", "#3DD68C"]
        fireConfetti({ particleCount: 120, spread: 90, origin: { x: 0.3, y: 0.5 }, colors })
        const t = setTimeout(() => fireConfetti({ particleCount: 120, spread: 90, origin: { x: 0.7, y: 0.5 }, colors }), 200)
        return () => clearTimeout(t)
    }, [grandFinal, playerWonTournament])

    // Check if a match involves the player's team
    const isPlayerMatch = (match: BracketMatch) => {
        return playerTeamId && (match.team1?.id === playerTeamId || match.team2?.id === playerTeamId)
    }

    const teamRow = (team: BracketTeam | undefined, other: BracketTeam | undefined, completed: boolean) => {
        const name = team?.name || "TBD"
        const tbd = !team || name === "TBD"
        const own = !!team && team.id === playerTeamId
        const lost = completed && !team?.isWinner && !!other?.isWinner
        return (
            <div className={cn("flex h-9 items-center gap-2.5 px-2.5", own && "shadow-[inset_2px_0_0_var(--gold)]")}>
                <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-hover">
                    {team?.logo ? <TeamLogoImage src={team.logo} alt="" size={18} /> : <span className="text-[11px] font-semibold text-ink-3">{tbd ? "?" : name[0]}</span>}
                </div>
                <span className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    tbd || lost ? "text-ink-3" : team?.isWinner ? "font-semibold text-ink-1" : "font-semibold text-ink-2",
                )}>
                    {name}
                </span>
                {!tbd && <TeamStanding rank={team?.rank} ovr={team?.ovr} />}
                <span className={cn("w-5 text-right font-display text-base font-bold tabular-nums", team?.isWinner ? "text-ink-1" : "text-ink-3")}>
                    {team?.score ?? ""}
                </span>
            </div>
        )
    }

    return (
        <div className="relative">
            {/* Scroll buttons */}
            {canScrollLeft && (
                <button
                    onClick={() => scrollBy("left")}
                    className="absolute left-2 top-1/2 z-40 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded border border-line-strong bg-raised text-ink-2 transition-colors hover:bg-hover hover:text-ink-1"
                    aria-label="Scroll left"
                >
                    <ChevronLeft size={18} />
                </button>
            )}
            {canScrollRight && (
                <button
                    onClick={() => scrollBy("right")}
                    className="absolute right-2 top-1/2 z-40 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded border border-line-strong bg-raised text-ink-2 transition-colors hover:bg-hover hover:text-ink-1"
                    aria-label="Scroll right"
                >
                    <ChevronRight size={18} />
                </button>
            )}

            {playerWonTournament && (
                <div className="mx-4 mt-4 flex items-center gap-3 rounded-lg border border-gold/50 bg-gold/[0.06] px-4 py-3">
                    <Trophy className="h-6 w-6 text-gold" aria-hidden="true" />
                    <div>
                        <p className="font-display text-xl font-bold uppercase leading-none text-gold">Tournament champions</p>
                        <p className="mt-0.5 text-xs text-ink-2">Your team won the Grand Final.</p>
                    </div>
                </div>
            )}

            <div
                ref={containerRef}
                className={cn(
                    "relative flex gap-8 overflow-x-auto p-4 pb-6 [scrollbar-width:thin]",
                    isDragging ? "cursor-grabbing select-none" : "cursor-grab"
                )}
                style={{ userSelect: isDragging ? 'none' : 'auto' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
            >
                {sortedRounds.map((round, roundIdx) => (
                    <div key={round} className="relative z-0 flex min-w-[220px] shrink-0 flex-col gap-3">
                        {/* Round header */}
                        <h3 className={cn(
                            "flex items-center gap-1.5 border-b border-line pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]",
                            round === "Grand Final" ? "text-gold" : "text-ink-3",
                        )}>
                            {round === "Grand Final" && <Trophy size={12} aria-hidden="true" />}
                            {round}
                        </h3>

                        <div className="relative flex flex-1 flex-col justify-around gap-4">
                            {organizedMatches[round]?.map((match) => {
                                const isUpcomingPlayerMatch = isPlayerMatch(match) && match.status === "scheduled"
                                const completed = match.status === "completed"
                                return (
                                    <div key={match.id} data-match-id={match.id} className="relative">
                                        {(isUpcomingPlayerMatch || match.status === "live") && (
                                            <p className={cn("mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em]", match.status === "live" ? "text-negative" : "text-gold")}>
                                                {match.status === "live" && <span className="h-1.5 w-1.5 rounded-full bg-negative" aria-hidden="true" />}
                                                {match.status === "live" ? "Live" : "Your match"}
                                            </p>
                                        )}
                                        <div
                                            className={cn(
                                                "relative z-10 overflow-hidden rounded-[4px] border bg-raised transition-colors duration-150",
                                                isPlayerMatch(match) ? "border-line-strong" : "border-line",
                                                onMatchClick && !isDragging && "cursor-pointer hover:border-line-strong hover:bg-hover",
                                            )}
                                            {...(onMatchClick ? pressable(() => handleMatchClick(match.id)) : {})}
                                        >
                                            {teamRow(match.team1, match.team2, completed)}
                                            <div className="h-px bg-line" />
                                            {teamRow(match.team2, match.team1, completed)}
                                        </div>

                                        {/* Connector to the next round */}
                                        {roundIdx < sortedRounds.length - 1 && (
                                            <span className={cn("pointer-events-none absolute -right-8 top-1/2 w-8 border-t", playerPath.has(match.id) ? "border-gold/60" : "border-line-strong")} aria-hidden="true" />
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

export default memo(TournamentBracket)
