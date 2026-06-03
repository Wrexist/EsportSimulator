"use client"

import { useMemo } from "react"
import { useGameStore } from "@/store/game-store"
import { Badge } from "@/components/ui/badge"
import { Trophy, Star, Crown, Heart, Hourglass, Wand2, Brain, Shield, Activity, Puzzle, Zap, Crosshair, Award } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { PlayerCard } from "@/components/ui/PlayerCard"
import { SectionHeader } from "@/src/components/ui/SectionHeader"
import { EmptyState } from "@/src/components/ui/EmptyState"
import { StatTile } from "@/src/components/ui/StatTile"

// Icon Map for dynamic rendering
const iconMap: Record<string, any> = {
    Trophy, Star, Crown, Heart, Hourglass, Wand2, Brain, Shield, Activity, Puzzle, Zap, Crosshair
}

export default function HallOfFamePage() {
    // Direct selectors — store initializes these as arrays so the previous
    // `|| []` fallback was actually harmful: it returned a NEW empty array
    // on each call, breaking useMemo dep equality below.
    const hallOfFame = useGameStore((state) => state.hallOfFame)
    const players = useGameStore((state) => state.players)
    const activelyPlayingLegendIds = useGameStore((state) => state.activelyPlayingLegendIds)

    // Memoized: these filter/sort passes ran on every render (and the component
    // re-renders on any of three store selectors), rebuilding arrays each time.
    const activeLegendKey = activelyPlayingLegendIds.join(",")
    const foundingLegends = useMemo(() => {
        // Sort: retired legends first, still-active legends at the bottom
        return hallOfFame
            .filter(l => l.category === "FOUNDING")
            .sort((a, b) => {
                const aActive = activelyPlayingLegendIds.includes(a.id) ? 1 : 0
                const bActive = activelyPlayingLegendIds.includes(b.id) ? 1 : 0
                return aActive - bActive
            })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hallOfFame, activeLegendKey])
    const inductedLegends = useMemo(
        () => hallOfFame.filter(l => l.category === "INDUCTED"),
        [hallOfFame],
    )

    // O(1) player lookup. Without this, the render path was
    // legends.length × players.length linear scans (66 × ~2000 = 132k ops).
    const playerById = useMemo(() => {
        const m = new Map<string, typeof players[number]>()
        for (const p of players) m.set(p.id, p)
        return m
    }, [players])
    const getLegendPlayerData = (legendId: string) => playerById.get(legendId)

    const activeLegendSet = useMemo(
        () => new Set(activelyPlayingLegendIds),
        [activelyPlayingLegendIds]
    )
    const isStillActive = (legendId: string) => activeLegendSet.has(legendId)

    return (
        <div className="p-8 space-y-8 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-4xl font-normal tracking-tighter uppercase liquid-text mb-2 flex items-center gap-4">
                        Hall of Fame
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/20">LEGENDS</Badge>
                    </h1>
                    <p className="text-muted-foreground font-medium uppercase text-xs tracking-[0.2em]">
                        Players who defined eras through exceptional careers
                    </p>
                </div>
            </div>

            {/* Founding Legends Section */}
            {foundingLegends.length > 0 && (
                <section className="space-y-6">
                    <SectionHeader
                        icon={Award}
                        iconClassName="text-amber-400"
                        size="lg"
                        title="Founding Legends"
                        subtitle="Players who shaped the early history of esports"
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <AnimatePresence mode="popLayout">
                            {foundingLegends.map((legend, idx) => (
                                <motion.div
                                    key={legend.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                >
                                    <LegendCard legend={legend} playerData={getLegendPlayerData(legend.id)} isFounding isActive={isStillActive(legend.id)} />
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                </section>
            )}

            {/* Inducted Legends Section */}
            <section className="space-y-6">
                <SectionHeader
                    icon={Trophy}
                    size="lg"
                    title="Inducted Legends"
                    subtitle="Players inducted through your simulation"
                />
                {inductedLegends.length === 0 ? (
                    <EmptyState
                        icon={Trophy}
                        title="No Legends Yet"
                        description="Players who achieve greatness through Major wins, MVP awards, and exceptional careers will be immortalized here upon retirement."
                    />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <AnimatePresence mode="popLayout">
                            {inductedLegends.map((legend, idx) => (
                                <motion.div
                                    key={legend.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                >
                                    <LegendCard legend={legend} playerData={getLegendPlayerData(legend.id)} />
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </section>

            {/* Footer Info */}
            <div className="glass-panel p-6 border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex items-center gap-4 text-muted-foreground">
                    <Shield size={20} className="text-amber-400" />
                    <div>
                        <p className="text-[10px] font-normal uppercase tracking-widest text-white">Induction Criteria</p>
                        <p className="text-xs">100+ matches, 2+ major achievements (Major Win, MVP, Top 3 Rank, Longevity)</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <StatTile size="sm" label="Founding" tone="warning" value={foundingLegends.length} />
                    <StatTile size="sm" label="Inducted" tone="brand" value={inductedLegends.length} />
                </div>
            </div>
        </div>
    )
}

interface LegendCardProps {
    legend: {
        id: string
        name: string
        portraitPath: string
        eraStart: number
        eraEnd: number
        primaryRole: string
        inductionReasons: { type: string; label: string; icon: string }[]
        nationality: string
    }
    playerData?: {
        skill?: number
        matchesPlayed?: number
        majorWins?: number
        totalMVPs?: number
        avgRating?: number
    }
    isFounding?: boolean
    isActive?: boolean
}

function LegendCard({ legend, playerData, isFounding, isActive }: LegendCardProps) {
    return (
        <PlayerCard
            player={{
                id: legend.id,
                nickname: legend.name,
                portraitPath: legend.portraitPath,
                role: legend.primaryRole,
                nationality: legend.nationality,
                overallRating: playerData?.skill,
            }}
            size="sm"
            variant="default"
            overlays={{ stats: playerData?.skill !== undefined }}
            href={`/player/${legend.id}`}
            muted={isActive}
            className={cn(
                isFounding && !isActive && "border-amber-500/40 ring-2 ring-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.15)]",
            )}
        >
            {/* Corner ribbons */}
            {isFounding && !isActive && (
                <div className="absolute top-0 right-0 w-16 h-16 overflow-hidden z-20 pointer-events-none">
                    <div className="absolute top-2 right-[-20px] w-[80px] bg-gradient-to-r from-amber-600 to-amber-400 text-[8px] font-normal text-black text-center py-0.5 rotate-45 shadow-lg">
                        LEGEND
                    </div>
                </div>
            )}
            {isActive && (
                <div className="absolute top-0 right-0 w-20 h-16 overflow-hidden z-20 pointer-events-none">
                    <div className="absolute top-2 right-[-16px] w-[90px] bg-gradient-to-r from-zinc-600 to-zinc-400 text-[7px] font-bold text-black text-center py-0.5 rotate-45 shadow-lg">
                        STILL ACTIVE
                    </div>
                </div>
            )}

            {/* Era + career stats + induction badges */}
            <div className="relative z-10 pl-1 pr-1 pt-3 space-y-2">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{legend.eraStart}–{legend.eraEnd}</span>
                    {playerData && (
                        <>
                            {playerData.majorWins !== undefined && playerData.majorWins > 0 && (
                                <span className="flex items-center gap-1">
                                    <Trophy size={10} className="text-amber-400" />
                                    {playerData.majorWins}
                                </span>
                            )}
                            {playerData.totalMVPs !== undefined && playerData.totalMVPs > 0 && (
                                <span className="flex items-center gap-1">
                                    <Star size={10} className="text-yellow-400" />
                                    {playerData.totalMVPs} MVP
                                </span>
                            )}
                            {playerData.matchesPlayed !== undefined && (
                                <span>{playerData.matchesPlayed.toLocaleString()} matches</span>
                            )}
                        </>
                    )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                    {legend.inductionReasons.map((reason, i) => {
                        const Icon = iconMap[reason.icon] || Trophy
                        return (
                            <Badge
                                key={i}
                                variant="outline"
                                className={cn(
                                    "text-[9px] py-0.5 px-2",
                                    isFounding
                                        ? "bg-amber-950/50 border-amber-700/30 text-amber-300"
                                        : "bg-white/5 border-white/10 text-white/70",
                                )}
                            >
                                <Icon className="w-2.5 h-2.5 mr-1" />
                                {reason.label}
                            </Badge>
                        )
                    })}
                </div>
            </div>
        </PlayerCard>
    )
}

