"use client"

import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { useRouter } from "next/navigation"
import React, { useState, useEffect, useMemo } from "react"
import { format } from "date-fns"
import { DollarSign, Clock, Play, Trophy, Moon, Sun, Swords } from "lucide-react"
import { Button } from "@/components/ui/button"
import { motion } from "framer-motion"
import { soundManager } from "@/lib/sound-manager"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { getTeamColors } from "@/lib/utils"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"

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
        theme,
        setTheme,
        setTimeMode,
        scheduledMatches,
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
            theme: s.theme,
            setTheme: s.setTheme,
            setTimeMode: s.setTimeMode,
            scheduledMatches: s.scheduledMatches,
        }))
    )

    const router = useRouter()

    const currentDate = useMemo(() => {
        const weekStart = getDateForWeek(currentWeek)
        const date = new Date(weekStart)
        const dayOffset = timeMode === "HYBRID_DAILY" ? currentDay : 0
        date.setDate(date.getDate() + dayOffset)
        return date
    }, [getDateForWeek, currentWeek, currentDay, timeMode])
    const playerTeam = useCurrentTeam()
    const budget = playerTeam?.budget || 0

    // Get custom team colors for styling
    const teamColors = useMemo(() => getTeamColors(playerTeam), [playerTeam])

    // Precompute the pending match instead of scanning scheduledMatches in the
    // JSX body. Was running an O(scheduledMatches) `.find()` on every TopBar
    // render — TopBar re-renders on every game tick (currentDay, currentWeek,
    // isLoading, etc.), so on a long season this stacked up.
    const pendingMatch = useMemo(() => {
        if (!scheduledMatches || !playerTeam) return null
        return scheduledMatches.find(m =>
            m.week === currentWeek &&
            (m.homeTeamId === playerTeam.id || m.awayTeamId === playerTeam.id) &&
            (timeMode === "WEEKLY" || (m.day ?? 6) <= currentDay)
        ) || null
    }, [scheduledMatches, playerTeam, currentWeek, currentDay, timeMode])

    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => {
        setIsMounted(true)
    }, [])

    return (
        <header className="h-16 border-b border-white/[0.06] liquid-chrome px-6 flex items-center justify-between sticky top-0 z-40 backdrop-blur-xl">
            <div className="flex items-center gap-8">
                {/* Team Identity */}
                <div className="flex items-center gap-3 min-w-[170px]">
                    {/* Team Logo */}
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden">
                        {isMounted ? (
                            <TeamLogoDisplay team={playerTeam} size={36} />
                        ) : (
                            <div className="w-9 h-9 bg-white/5 rounded-lg animate-pulse" />
                        )}
                    </div>

                    <div className="flex flex-col">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold whitespace-nowrap leading-none mb-1">Current Team</span>
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
                            <span className="text-sm font-semibold text-white whitespace-nowrap">
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
                    <span suppressHydrationWarning className="text-sm font-medium text-emerald-400">
                        ${budget.toLocaleString()}
                    </span>
                </div>

                {/* World Ranking */}
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg liquid-button">
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

            <div className="flex items-center gap-6">
                {/* Date / Time */}
                <div className="flex items-center gap-3 text-right">
                    <div className="flex flex-col">
                        <span suppressHydrationWarning className="text-sm font-bold text-white uppercase tracking-tight whitespace-nowrap">
                            {format(currentDate, "EEE, dd MMM yyyy")}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-medium whitespace-nowrap">
                            WEEK {currentWeek} {timeMode === "HYBRID_DAILY" ? `• DAY ${currentDay + 1}` : ""}
                        </span>
                    </div>
                    <div className="p-2 rounded-lg liquid-button text-white/60">
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
                    className="rounded-lg border border-white/10 hover:bg-white/[0.08]"
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
                                onClick={() => router.push(`/match/${pendingMatch.id}/tactics`)}
                                disabled={isLoading}
                                className="bg-amber-400 hover:bg-amber-300 text-black font-normal h-10 px-6 rounded-lg shadow-[0_14px_34px_-20px_rgba(245,158,11,0.7)]"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="tracking-wide">PLAY MATCH</span>
                                    <Swords size={16} />
                                </div>
                            </Button>
                        )
                    }

                    if (timeMode === "HYBRID_DAILY") {
                        return (
                            <div className="flex items-center gap-2">
                                <Button
                                    onClick={() => advanceDay()}
                                    disabled={isLoading}
                                    className="bg-emerald-500/90 hover:bg-emerald-400 active:bg-emerald-600 text-white active:text-white/90 font-bold h-10 px-4 rounded-lg shadow-[0_14px_34px_-20px_rgba(16,185,129,0.7)]"
                                >
                                    {isLoading ? (
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                        >
                                            <Clock size={18} />
                                        </motion.div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <span className="tracking-wide">NEXT DAY</span>
                                            <Play size={16} fill="currentColor" />
                                        </div>
                                    )}
                                </Button>
                                <Button
                                    onClick={() => advanceToWeekEnd()}
                                    disabled={isLoading}
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
                            onClick={() => advanceWeek()}
                            disabled={isLoading}
                            className="bg-emerald-500/90 hover:bg-emerald-400 active:bg-emerald-600 text-white active:text-white/90 font-bold h-10 px-6 rounded-lg shadow-[0_14px_34px_-20px_rgba(16,185,129,0.7)]"
                        >
                            {isLoading ? (
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
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
