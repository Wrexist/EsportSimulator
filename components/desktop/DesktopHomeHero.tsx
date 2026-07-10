"use client"

/**
 * Centered desktop "home" widget.
 *
 * The desktop canvas otherwise renders as a large empty void — icons hug the
 * top-left and the Weekly Focus widget sits top-right, leaving the whole middle
 * dark. This fills that space with an at-a-glance org panel: team identity, a
 * couple of headline numbers, the next scheduled match (or a nudge to book a
 * scrim), and quick-launch shortcuts.
 *
 * It sits behind app windows (z-0), so opening any app covers it — it only
 * shows while the desktop is idle. Purely presentational; reads the store and
 * routes on click.
 */

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { cn } from "@/lib/utils"
import { Swords, Users, Calendar, TrendingUp, Trophy, DollarSign } from "lucide-react"

function formatMoney(n: number): string {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
    if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`
    return `$${n}`
}

export function DesktopHomeHero() {
    const router = useRouter()
    const { teams, playerTeamId, scheduledMatches, completedMatches, currentWeek, currentDay, timeMode } = useGameStore(
        useShallow(state => ({
            teams: state.teams,
            playerTeamId: state.playerTeamId,
            scheduledMatches: state.scheduledMatches,
            completedMatches: state.completedMatches,
            currentWeek: state.currentWeek,
            currentDay: state.currentDay,
            timeMode: state.timeMode,
        }))
    )

    const playerTeam = useMemo(() => teams.find(t => t.id === playerTeamId), [teams, playerTeamId])

    const nextMatch = useMemo(() => {
        // Exclude anything already played or left behind in a past week so the
        // hero never points at a finished scrim (which would route to a stale
        // /match/{id}/tactics). scheduledMatches is normally pruned on result,
        // but this keeps the "next match" honest regardless of prune timing.
        const completedIds = new Set(completedMatches.map(m => m.id))
        return scheduledMatches
            .filter(m => m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
            .filter(m => !completedIds.has(m.id) && m.week >= currentWeek)
            .sort((a, b) => (a.week !== b.week ? a.week - b.week : (a.day ?? 6) - (b.day ?? 6)))[0]
    }, [scheduledMatches, completedMatches, currentWeek, playerTeamId])

    const opponent = useMemo(() => {
        if (!nextMatch) return undefined
        const oppId = nextMatch.homeTeamId === playerTeamId ? nextMatch.awayTeamId : nextMatch.homeTeamId
        return teams.find(t => t.id === oppId)
    }, [nextMatch, teams, playerTeamId])

    if (!playerTeam) return null

    const matchIsNow =
        !!nextMatch &&
        nextMatch.week === currentWeek &&
        (timeMode === "WEEKLY" || (nextMatch.day ?? 6) <= currentDay)

    const quickLinks = [
        { label: "Squad", icon: <Users size={16} />, route: "/squad" },
        { label: "Schedule", icon: <Calendar size={16} />, route: "/schedule" },
        { label: "Transfers", icon: <TrendingUp size={16} />, route: "/transfers" },
        { label: "Tournaments", icon: <Trophy size={16} />, route: "/tournaments" },
    ]

    return (
        <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.5 }}
                className="pointer-events-auto w-[440px] max-w-[90vw] rounded-2xl border border-white/10 bg-black/30 backdrop-blur-md shadow-glass-soft overflow-hidden"
            >
                {/* Team identity */}
                <div className="flex items-center gap-4 p-5 border-b border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent">
                    <TeamLogoDisplay team={playerTeam} size={52} />
                    <div className="min-w-0 flex-1">
                        <div className="text-lg font-normal text-white truncate">{playerTeam.name}</div>
                        <div className="text-[11px] uppercase tracking-wider text-white/40">
                            {playerTeam.region} · Season roster
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wider text-white/40">World Rank</div>
                        <div className="text-xl font-normal text-cyan-300">#{playerTeam.worldRanking ?? "—"}</div>
                    </div>
                </div>

                {/* Headline numbers */}
                <div className="grid grid-cols-2 divide-x divide-white/5 border-b border-white/5">
                    <div className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40">
                            <DollarSign size={11} /> Budget
                        </div>
                        <div className="text-base font-normal text-emerald-300 mt-0.5">{formatMoney(playerTeam.budget ?? 0)}</div>
                    </div>
                    <div className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40">
                            <Calendar size={11} /> Week
                        </div>
                        <div className="text-base font-normal text-white mt-0.5">{currentWeek}</div>
                    </div>
                </div>

                {/* Next match / CTA */}
                <button
                    onClick={() =>
                        nextMatch
                            ? router.push(matchIsNow ? `/match/${nextMatch.id}/tactics` : "/schedule")
                            : router.push("/schedule")
                    }
                    className="w-full text-left p-4 hover:bg-white/[0.04] transition-colors group"
                >
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/40 mb-2">
                        <Swords size={12} /> {nextMatch ? "Next Match" : "No matches scheduled"}
                    </div>
                    {nextMatch ? (
                        <div className="flex items-center gap-3">
                            <TeamLogoDisplay team={opponent} size={32} />
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-normal text-white truncate">
                                    vs {opponent?.name ?? "TBD"}
                                </div>
                                <div className="text-[11px] text-white/40">
                                    {nextMatch.isScrim ? "Preseason Friendly" : nextMatch.stage || "Match"} · Week {nextMatch.week}
                                    {typeof nextMatch.day === "number" ? ` · Day ${nextMatch.day + 1}` : ""}
                                </div>
                            </div>
                            <span
                                className={cn(
                                    "text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border",
                                    matchIsNow
                                        ? "bg-primary/20 border-primary/40 text-primary"
                                        : "bg-white/5 border-white/10 text-white/50"
                                )}
                            >
                                {matchIsNow ? "Play" : "View"}
                            </span>
                        </div>
                    ) : (
                        <div className="text-sm text-white/50 group-hover:text-white/70 transition-colors">
                            Book a scrim or register for a tournament to fill your calendar →
                        </div>
                    )}
                </button>

                {/* Quick launch */}
                <div className="grid grid-cols-4 border-t border-white/5">
                    {quickLinks.map(link => (
                        <button
                            key={link.route}
                            onClick={() => router.push(link.route)}
                            className="flex flex-col items-center gap-1 py-3 text-white/50 hover:text-white hover:bg-white/[0.04] transition-colors"
                        >
                            {link.icon}
                            <span className="text-[9px] uppercase tracking-wider">{link.label}</span>
                        </button>
                    ))}
                </div>
            </motion.div>
        </div>
    )
}
