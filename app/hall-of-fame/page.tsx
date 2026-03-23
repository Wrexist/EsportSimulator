"use client"

import { useGameStore } from "@/store/game-store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Trophy, Star, Crown, Heart, Hourglass, Wand2, Brain, Shield, Activity, Puzzle, Zap, Crosshair, Award, User, ChevronRight } from "lucide-react"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { CountryFlag } from "@/components/ui/CountryFlag"
import Link from "next/link"
import { PlayerPortrait } from "@/components/ui/asset-images"

// Icon Map for dynamic rendering
const iconMap: Record<string, any> = {
    Trophy, Star, Crown, Heart, Hourglass, Wand2, Brain, Shield, Activity, Puzzle, Zap, Crosshair
}

export default function HallOfFamePage() {
    const hallOfFame = useGameStore((state) => state.hallOfFame) || []
    const players = useGameStore((state) => state.players) || []
    const activelyPlayingLegendIds = useGameStore((state) => state.activelyPlayingLegendIds) || []

    const foundingLegendsUnsorted = hallOfFame.filter(l => l.category === "FOUNDING")
    // Sort: retired legends first, still-active legends at the bottom
    const foundingLegends = [...foundingLegendsUnsorted].sort((a, b) => {
        const aActive = activelyPlayingLegendIds.includes(a.id) ? 1 : 0
        const bActive = activelyPlayingLegendIds.includes(b.id) ? 1 : 0
        return aActive - bActive
    })
    const inductedLegends = hallOfFame.filter(l => l.category === "INDUCTED")

    // Get full player data for legends
    const getLegendPlayerData = (legendId: string) => {
        return players.find(p => p.id === legendId)
    }

    const isStillActive = (legendId: string) => activelyPlayingLegendIds.includes(legendId)

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
                    <div className="flex items-center gap-4">
                        <Award className="text-amber-400" size={20} />
                        <div>
                            <h2 className="text-xs font-normal uppercase tracking-widest text-white">Founding Legends</h2>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                                Players who shaped the early history of esports
                            </p>
                        </div>
                    </div>
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
                <div className="flex items-center gap-4">
                    <Trophy className="text-primary" size={20} />
                    <div>
                        <h2 className="text-xs font-normal uppercase tracking-widest text-white">Inducted Legends</h2>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                            Players inducted through your simulation
                        </p>
                    </div>
                </div>
                {inductedLegends.length === 0 ? (
                    <div className="glass-panel p-12 border-white/5 flex flex-col items-center text-center">
                        <Trophy size={48} className="text-white/10 mb-4" />
                        <h3 className="text-lg font-normal text-white uppercase tracking-tight">No Legends Yet</h3>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mt-2 max-w-md">
                            Players who achieve greatness through Major wins, MVP awards, and exceptional careers will be immortalized here upon retirement.
                        </p>
                    </div>
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
                <div className="flex items-center gap-6">
                    <div className="text-center">
                        <p className="text-[10px] font-normal uppercase tracking-widest text-muted-foreground">Founding</p>
                        <p className="text-sm font-bold text-amber-400">{foundingLegends.length}</p>
                    </div>
                    <div className="h-10 w-px bg-white/10" />
                    <div className="text-center">
                        <p className="text-[10px] font-normal uppercase tracking-widest text-muted-foreground">Inducted</p>
                        <p className="text-sm font-bold text-primary">{inductedLegends.length}</p>
                    </div>
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
        <Link href={`/player/${legend.id}`}>
            <div className={cn(
                "glass-panel p-4 border-white/5 hover:border-white/10 transition-all group relative overflow-hidden cursor-pointer",
                isActive
                    ? "opacity-50 grayscale-[40%] hover:opacity-70 hover:grayscale-0 border-white/10"
                    : isFounding && "border-amber-500/40 hover:border-amber-500/60 ring-2 ring-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.15)]"
            )}>
                {/* Gold corner accent for founding legends */}
                {isFounding && !isActive && (
                    <div className="absolute top-0 right-0 w-16 h-16 overflow-hidden">
                        <div className="absolute top-2 right-[-20px] w-[80px] bg-gradient-to-r from-amber-600 to-amber-400 text-[8px] font-normal text-black text-center py-0.5 rotate-45 shadow-lg">
                            LEGEND
                        </div>
                    </div>
                )}
                {isActive && (
                    <div className="absolute top-0 right-0 w-20 h-16 overflow-hidden">
                        <div className="absolute top-2 right-[-16px] w-[90px] bg-gradient-to-r from-zinc-600 to-zinc-400 text-[7px] font-bold text-black text-center py-0.5 rotate-45 shadow-lg">
                            STILL ACTIVE
                        </div>
                    </div>
                )}

                <div className="flex items-start gap-4">
                    {/* Portrait */}
                    <div className={cn(
                        "w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 group-hover:scale-105 transition-transform",
                        isActive
                            ? "border-zinc-500/50 ring-1 ring-zinc-400/20"
                            : isFounding && "border-amber-500/50 ring-2 ring-amber-400/30"
                    )}>
                        <PlayerPortrait
                            src={legend.portraitPath}
                            alt={legend.name}
                            size={56}
                        />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-white truncate">{legend.name}</span>
                            {playerData?.skill && (
                                <span className={cn(
                                    "text-sm font-normal",
                                    playerData.skill >= 95 ? "text-amber-400" :
                                        playerData.skill >= 90 ? "text-emerald-400" : "text-blue-400"
                                )}>
                                    {playerData.skill}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                            <CountryFlag country={legend.nationality} showName={false} size={12} />
                            <span className="uppercase font-bold">{legend.primaryRole}</span>
                            <span>•</span>
                            <span>{legend.eraStart}–{legend.eraEnd}</span>
                        </div>
                        {/* Career Stats */}
                        {playerData && (
                            <div className="flex items-center gap-3 mt-2 text-[9px] text-muted-foreground">
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
                            </div>
                        )}
                    </div>

                    {/* Link Arrow */}
                    <ChevronRight size={16} className="text-muted-foreground group-hover:text-white transition-colors shrink-0" />
                </div>

                {/* Achievement Badges */}
                <div className="flex flex-wrap gap-1.5 mt-3">
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
                                        : "bg-white/5 border-white/10 text-white/70"
                                )}
                            >
                                <Icon className="w-2.5 h-2.5 mr-1" />
                                {reason.label}
                            </Badge>
                        )
                    })}
                </div>
            </div>
        </Link>
    )
}

