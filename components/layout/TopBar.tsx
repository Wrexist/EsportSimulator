"use client"

import { useGameStore } from "@/store/game-store"
import { useRouter } from "next/navigation"
import React, { useState, useEffect, useMemo } from "react"
import { format } from "date-fns"
import { DollarSign, Clock, Play, Trophy, Moon, Sun, Swords, HelpCircle, X, Keyboard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"
import { soundManager } from "@/lib/sound-manager"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { getTeamColors } from "@/lib/utils"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"

export function TopBar() {
    const currentWeek = useGameStore(s => s.currentWeek)
    const currentDay = useGameStore(s => s.currentDay)
    const timeMode = useGameStore(s => s.timeMode)
    const getDateForWeek = useGameStore(s => s.getDateForWeek)
    const advanceDay = useGameStore(s => s.advanceDay)
    const advanceToWeekEnd = useGameStore(s => s.advanceToWeekEnd)
    const advanceWeek = useGameStore(s => s.advanceWeek)
    const isLoading = useGameStore(s => s.isLoading)
    const theme = useGameStore(s => s.theme)
    const setTheme = useGameStore(s => s.setTheme)
    const setTimeMode = useGameStore(s => s.setTimeMode)
    const scheduledMatches = useGameStore(s => s.scheduledMatches)
    const teams = useGameStore(s => s.teams)
    const playerTeamId = useGameStore(s => s.playerTeamId)

    const router = useRouter()

    const currentDate = useMemo(() => {
        const weekStart = getDateForWeek(currentWeek)
        const date = new Date(weekStart)
        const dayOffset = timeMode === "HYBRID_DAILY" ? currentDay : 0
        date.setDate(date.getDate() + dayOffset)
        return date
    }, [getDateForWeek, currentWeek, currentDay, timeMode])
    const playerTeam = useMemo(() => teams.find(t => t.id === playerTeamId), [teams, playerTeamId])
    const budget = playerTeam?.budget || 0

    // Get custom team colors for styling
    const teamColors = useMemo(() => getTeamColors(playerTeam), [playerTeam])

    const [isMounted, setIsMounted] = useState(false)
    const [showShortcuts, setShowShortcuts] = useState(false)

    useEffect(() => {
        setIsMounted(true)
    }, [])

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

            if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
                e.preventDefault()
                setShowShortcuts(prev => !prev)
            }

            if (e.key === " " && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                // Don't advance if a modal/dialog is open
                const hasOpenDialog = document.querySelector('[role="dialog"]')
                if (hasOpenDialog) return
                e.preventDefault()
                if (!isLoading) {
                    soundManager.play('weekAdvance')
                    if (timeMode === "HYBRID_DAILY") {
                        advanceDay()
                    } else {
                        advanceWeek()
                    }
                }
            }

            if (e.key === "Escape") {
                setShowShortcuts(false)
            }
        }
        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [isLoading, timeMode, advanceDay, advanceWeek])

    return (
        <header className="h-16 border-b border-white/10 bg-black/20 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-40">
            <div className="flex items-center gap-8">
                {/* Team Identity */}
                <div className="flex items-center gap-3">
                    {/* Team Logo */}
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden">
                        {isMounted ? (
                            <TeamLogoDisplay team={playerTeam} size={36} />
                        ) : (
                            <div className="w-9 h-9 bg-white/5 rounded-lg animate-pulse" />
                        )}
                    </div>

                    <div className="flex flex-col">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Current Team</span>
                        <div className="flex items-center gap-1.5">
                            {/* Region Flag */}
                            {isMounted ? (
                                <CountryFlag
                                    country={(() => {
                                        const regions: Record<string, string> = {
                                            "EU": "eu", "NA": "us", "SA": "br", "CIS": "ru",
                                            "ASIA": "cn", "OCEANIA": "au", "MENA": "sa", "INTERNATIONAL": "un"
                                        }
                                        return regions[playerTeam?.region || ""] || "un"
                                    })()}
                                    size={14}
                                />
                            ) : (
                                <div className="w-[14px] h-[11px] bg-white/10 rounded-sm animate-pulse" />
                            )}
                            <span className="text-sm font-semibold text-white">
                                {isMounted ? (playerTeam?.name || "No Team") : "Loading..."}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Finances */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5">
                    <div className="p-1 rounded-md bg-emerald-500/20 text-emerald-500">
                        <DollarSign size={14} />
                    </div>
                    <span suppressHydrationWarning className="text-sm font-medium text-emerald-400">
                        ${budget.toLocaleString()}
                    </span>
                </div>

                {/* World Ranking */}
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5">
                    <div className="p-1 rounded-md bg-blue-500/20 text-blue-500">
                        <Trophy size={14} />
                    </div>
                    <span suppressHydrationWarning className="text-sm font-medium text-blue-300">
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
                        <span suppressHydrationWarning className="text-sm font-bold text-white uppercase tracking-tight">
                            {format(currentDate, "EEE, dd MMM yyyy")}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-medium">
                            WEEK {currentWeek} {timeMode === "HYBRID_DAILY" ? `• DAY ${currentDay + 1}` : ""}
                        </span>
                    </div>
                    <div className="p-2 rounded-xl bg-white/5 border border-white/5 text-muted-foreground">
                        <Clock size={16} />
                    </div>
                </div>

                {/* Keyboard Shortcuts Help */}
                <div className="relative">
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Keyboard shortcuts"
                        onClick={() => setShowShortcuts(prev => !prev)}
                        className="rounded-xl border border-white/10 hover:bg-white/5"
                    >
                        <Keyboard size={18} />
                    </Button>

                    <AnimatePresence>
                        {showShortcuts && (
                            <motion.div
                                initial={{ opacity: 0, y: -5, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -5, scale: 0.95 }}
                                className="absolute right-0 top-12 w-72 bg-[#0a0c10] border border-white/10 rounded-2xl shadow-2xl shadow-black/50 z-50 overflow-hidden"
                            >
                                <div className="p-4 border-b border-white/5 flex items-center justify-between">
                                    <h3 className="text-xs font-bold uppercase tracking-widest text-white/60">Shortcuts</h3>
                                    <button onClick={() => setShowShortcuts(false)} className="text-white/30 hover:text-white transition-colors">
                                        <X size={14} />
                                    </button>
                                </div>
                                <div className="p-3 space-y-1">
                                    {[
                                        { key: "Space", desc: timeMode === "HYBRID_DAILY" ? "Advance Day" : "Advance Week" },
                                        { key: "?", desc: "Toggle Shortcuts" },
                                        { key: "Esc", desc: "Close Popups" },
                                    ].map(s => (
                                        <div key={s.key} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-white/5">
                                            <span className="text-[11px] text-white/60">{s.desc}</span>
                                            <kbd className="px-2 py-0.5 rounded-md bg-white/10 border border-white/10 text-[10px] font-mono text-white/80 min-w-[40px] text-center">
                                                {s.key}
                                            </kbd>
                                        </div>
                                    ))}
                                </div>
                                <div className="px-4 py-3 border-t border-white/5">
                                    <p className="text-[9px] text-white/20 uppercase tracking-widest">Use navigation sidebar to switch pages</p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Theme Toggle */}
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={theme === "crystal" ? "Switch to dark theme" : "Switch to light theme"}
                    onClick={() => setTheme(theme === "crystal" ? "onyx" : "crystal")}
                    className="rounded-xl border border-white/10 hover:bg-white/5"
                >
                    {theme === "crystal" ? <Sun size={18} /> : <Moon size={18} />}
                </Button>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTimeMode(timeMode === "HYBRID_DAILY" ? "WEEKLY" : "HYBRID_DAILY")}
                    className="rounded-xl border-white/10 bg-white/5 hover:bg-white/10 text-[10px] font-bold tracking-wider"
                >
                    {timeMode === "HYBRID_DAILY" ? "DAILY" : "WEEKLY"}
                </Button>

                {/* Continue / Play Match Button */}
                {(() => {
                    const pendingMatch = scheduledMatches?.find(m =>
                        m.week === currentWeek &&
                        playerTeam &&
                        (m.homeTeamId === playerTeam.id || m.awayTeamId === playerTeam.id) &&
                        (timeMode === "WEEKLY" || (m.day ?? 6) <= currentDay)
                    )

                    if (pendingMatch) {
                        return (
                            <Button
                                onClick={() => router.push(`/match/${pendingMatch.id}/tactics`)}
                                disabled={isLoading}
                                className="bg-amber-500 hover:bg-amber-400 text-black font-normal h-10 px-6 rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98] animate-[pulse_2s_ease-in-out_3]"
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
                                    className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white active:text-white/90 font-bold h-10 px-4 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98]"
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
                                    className="h-10 px-4 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold text-[11px] tracking-wider"
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
                            className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white active:text-white/90 font-bold h-10 px-6 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98]"
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
