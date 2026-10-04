"use client"

import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { useRouter } from "next/navigation"
import React, { useState, useEffect, useMemo } from "react"
import { formatGameCalendarDate } from "@/lib/game-calendar"
import { DollarSign, Clock, Play, Trophy, Moon, Sun, Swords } from "lucide-react"
import { Button } from "@/components/ui/button"
import { spinTransition } from "@/lib/motion"
import { soundManager } from "@/lib/sound-manager"
import { motion } from "framer-motion"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { selectPlayableMatchId } from "@/lib/playable-match"

// Hoisted: this lookup was being rebuilt as a fresh object on every TopBar
// render (which fires on every game tick).
const REGION_TO_FLAG: Record<string, string> = {
    EU: "eu", NA: "us", SA: "br", CIS: "ru",
    ASIA: "cn", OCEANIA: "au", MENA: "sa", INTERNATIONAL: "un",
}

export function TopBar() {
    // Single shallow-equality selector instead of 14 individual subscriptions.
    // Without this, every store mutation (every match tick, transfer, ledger
    // entry) re-renders the TopBar and cascades through child components.
    const {
        currentWeek,
        currentDay,
        timeMode,
        getDateForWeek,
        advanceDay,
        advanceToWeekEnd,
        advanceWeek,
        isLoading,
        gameOverReason,
        theme,
        setTheme,
        setTimeMode,
    } = useGameStore(
        useShallow(s => ({
            currentWeek: s.currentWeek,
            currentDay: s.currentDay,
            timeMode: s.timeMode,
            getDateForWeek: s.getDateForWeek,
            advanceDay: s.advanceDay,
            advanceToWeekEnd: s.advanceToWeekEnd,
            advanceWeek: s.advanceWeek,
            isLoading: s.isLoading,
            gameOverReason: s.gameOverReason,
            theme: s.theme,
            setTheme: s.setTheme,
            setTimeMode: s.setTimeMode,
        }))
    )

    const router = useRouter()

    const currentDate = useMemo(() => {
        const weekStart = getDateForWeek(currentWeek)
        const date = new Date(weekStart)
        const dayOffset = timeMode === "HYBRID_DAILY" ? currentDay : 0
        date.setUTCDate(date.getUTCDate() + dayOffset)
        return date
    }, [getDateForWeek, currentWeek, currentDay, timeMode])
    const playerTeam = useCurrentTeam()
    const budget = playerTeam?.budget || 0

    // Get custom team colors for styling

    // Only offer "Play match" for a fixture the store will actually simulate
    // (shared predicate with the advance-week guard). A due fixture where a
    // side can't field five is resolved by forfeit when the week advances, so
    // CONTINUE is shown instead; offering it led to "Match Not Found" (L27).
    // The selector returns a primitive id, so TopBar doesn't re-render on
    // unrelated player/team updates.
    const pendingMatchId = useGameStore(selectPlayableMatchId)
    const pendingMatch = pendingMatchId ? { id: pendingMatchId } : null
    // A dissolved career (game over) can't advance or play; the game-over
    // screen offers Load Save / Main Menu instead.
    const controlsLocked = isLoading || !!gameOverReason

    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => {
        setIsMounted(true)
    }, [])

    return (
        <header className="game-topbar min-h-16 shrink-0 px-3 py-2 xl:px-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 sticky top-0 z-40">
            <div className="flex min-w-0 items-center gap-3 xl:gap-5">
                {/* Team Identity */}
                <div className="flex items-center gap-3 topbar-club min-w-[150px]">
                    {/* Team Logo */}
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden">
                        {isMounted ? (
                            <TeamLogoDisplay team={playerTeam} size={36} />
                        ) : (
                            <div className="w-9 h-9 bg-white/5 rounded-lg animate-pulse" />
                        )}
                    </div>

                    <div className="flex flex-col">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold whitespace-nowrap leading-none mb-1">Your club</span>
                        <div className="flex items-center gap-1.5">
                            {/* Region Flag */}
                            {isMounted ? (
                                <CountryFlag
                                    country={REGION_TO_FLAG[playerTeam?.region || ""] || "un"}
                                    size={14}
                                />
                            ) : (
                                <div className="w-[14px] h-[11px] bg-white/10 rounded-sm animate-pulse" />
                            )}
                            <span className="topbar-club-name text-sm font-semibold text-white truncate max-w-[180px]" title={playerTeam?.name}>
                                {isMounted ? (playerTeam?.name || "No Team") : "Loading..."}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Finances */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg liquid-button">
                    <div className="p-1 rounded-md bg-emerald-400/[0.14] text-emerald-300">
                        <DollarSign size={14} />
                    </div>
                    {isMounted ? (
                        <AnimatedNumber
                            value={budget}
                            format={(n) => `$${Math.round(n).toLocaleString("en-US")}`}
                            className="text-sm font-medium text-emerald-400"
                        />
                    ) : (
                        <span suppressHydrationWarning className="text-sm font-medium text-emerald-400">
                            ${budget.toLocaleString("en-US")}
                        </span>
                    )}
                </div>

                {/* World Ranking */}
                <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-lg liquid-button">
                    <div className="p-1 rounded-md bg-cyan-400/[0.14] text-cyan-300">
                        <Trophy size={14} />
                    </div>
                        <span suppressHydrationWarning className="text-sm font-medium text-cyan-200">
                        {isMounted
                            ? (playerTeam?.worldRanking
                                ? `#${playerTeam.worldRanking} World`
                                : "Unranked")
                            : "Loading..."}
                    </span>
                </div>
            </div>

            <div className="flex max-w-full flex-wrap items-center gap-2 xl:gap-3">
                {/* Date / Time */}
                <div className="flex items-center gap-2 text-right">
                    <div className="flex flex-col">
                        <span suppressHydrationWarning className="topbar-date text-sm font-medium text-white tracking-tight whitespace-nowrap">
                            {formatGameCalendarDate(currentDate, { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-medium whitespace-nowrap">
                            WEEK {currentWeek} {timeMode === "HYBRID_DAILY" ? `• DAY ${currentDay + 1}` : ""}
                        </span>
                    </div>
                    <div className="hidden 2xl:block p-2 rounded-lg liquid-button text-white/60">
                        <Clock size={16} />
                    </div>
                </div>

                {/* Glass theme variant toggle — crystal (cooler frost) ↔ onyx (deep black) */}
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={theme === "crystal" ? "Switch to Onyx theme" : "Switch to Crystal theme"}
                    title={theme === "crystal" ? "Switch to Onyx theme" : "Switch to Crystal theme"}
                    onClick={() => setTheme(theme === "crystal" ? "onyx" : "crystal")}
                    className="rounded-lg border border-white/10 hover:bg-white/8"
                >
                    {theme === "crystal" ? <Sun size={18} /> : <Moon size={18} />}
                </Button>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTimeMode(timeMode === "HYBRID_DAILY" ? "WEEKLY" : "HYBRID_DAILY")}
                    className="rounded-lg border-white/10 bg-white/5 hover:bg-white/10 text-[10px] font-bold tracking-wider"
                >
                    {timeMode === "HYBRID_DAILY" ? "DAILY" : "WEEKLY"}
                </Button>

                {/* Continue / Play Match Button */}
                {(() => {
                    if (pendingMatch) {
                        return (
                            <Button
                                variant="play"
                                onClick={() => router.push(`/match/${pendingMatch.id}/tactics`)}
                                disabled={controlsLocked}
                                className="h-10 px-3 xl:px-6 shrink-0"
                            >
                                <span className="tracking-wide">Play match</span>
                                <Swords size={16} />
                            </Button>
                        )
                    }

                    if (timeMode === "HYBRID_DAILY") {
                        return (
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="continue"
                                    onClick={() => {
                                        soundManager.play('weekAdvance')
                                        advanceDay()
                                    }}
                                    disabled={controlsLocked}
                                    className="h-10 px-4"
                                >
                                    {isLoading ? (
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={spinTransition}
                                        >
                                            <Clock size={18} />
                                        </motion.div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <span className="tracking-wide">Next day</span>
                                            <Play size={16} fill="currentColor" />
                                        </div>
                                    )}
                                </Button>
                                <Button
                                    onClick={() => advanceToWeekEnd()}
                                    disabled={controlsLocked}
                                    variant="outline"
                                    className="h-10 px-4 rounded-lg border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold text-[11px] tracking-wider"
                                >
                                    SKIP WEEK
                                </Button>
                            </div>
                        )
                    }

                    return (
                        <Button
                            variant="continue"
                            onClick={() => {
                                soundManager.play('weekAdvance')
                                advanceWeek()
                            }}
                            disabled={controlsLocked}
                            className="h-10 px-3 xl:px-6 shrink-0"
                        >
                            {isLoading ? (
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={spinTransition}
                                >
                                    <Clock size={18} />
                                </motion.div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span className="tracking-wide">CONTINUE</span>
                                    <Play size={16} fill="currentColor" />
                                </div>
                            )}
                        </Button>
                    )
                })()}
            </div>
        </header>
    )
}
