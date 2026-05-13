"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Trophy, TrendingUp, Crown, Users, DollarSign } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { TeamLogoImage } from "@/components/ui/asset-images"
import { PlayerCard } from "@/components/ui/PlayerCard"
import { StatTile } from "@/src/components/ui/StatTile"
import { panelTransition } from "@/lib/motion"

interface SeasonRecapModalProps {
    isOpen: boolean
    onClose: () => void
    year: number
    stats: {
        wins: number
        losses: number
        trophies: number
        budgetGrowth: number
        bestPlayer: {
            nickname: string
            portraitPath: string
            rating: number
        } | null
    }
}

export function SeasonRecapModal({ isOpen, onClose, year, stats }: SeasonRecapModalProps) {
    if (!isOpen) return null

    const winRate = stats.wins + stats.losses > 0
        ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100)
        : 0

    return (
        <AnimatePresence>
            <div className="fixed inset-0 top-16 z-modal flex items-center justify-center p-4 md:p-8">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/58 backdrop-blur-md"
                    onClick={onClose}
                />

                <motion.div
                    variants={panelTransition}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="modal-title-season-recap"
                    className="relative w-full max-w-4xl liquid-panel rounded-xl overflow-hidden"
                >
                    {/* Background Effects */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <div className="absolute inset-0 liquid-noise" />
                    </div>

                    {/* Content */}
                    <div className="relative z-10 p-8 md:p-12">
                        <div className="flex justify-between items-start mb-12">
                            <div>
                                <Badge variant="outline" className="text-primary border-primary/20 mb-4 px-4 py-1 rounded-full uppercase tracking-widest text-[10px] font-bold">
                                    Annual Report
                                </Badge>
                                <h1 id="modal-title-season-recap" className="text-5xl md:text-6xl font-normal text-white tracking-tighter uppercase italic">
                                    Season <span className="text-primary">{year}</span> Recap
                                </h1>
                                <p className="text-white/40 mt-2 text-lg">Celebrating your organization's journey through the last 52 weeks.</p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-lg hover:bg-white/10 text-white/50">
                                <X size={24} />
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            {/* Key Stats */}
                            <div className="md:col-span-2 grid grid-cols-2 gap-4">
                                <StatTile size="lg" label="Trophies Won" tone="warning" icon={Trophy} value={stats.trophies} />
                                <StatTile size="lg" label={`Win Rate (${stats.wins}-${stats.losses})`} tone="success" icon={TrendingUp} value={`${winRate}%`} />
                                <StatTile size="lg" label="Budget Growth" tone="brand" icon={DollarSign} value={`$${(stats.budgetGrowth / 1000).toFixed(0)}k`} />
                                <StatTile size="lg" label="Weeks Active" icon={Users} value={52} />
                            </div>

                            {/* MVP Spotlights */}
                            <div className="glass-card p-8 rounded-xl border-primary/20 flex flex-col items-center text-center">
                                <Crown className="text-primary mb-6" size={40} />
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-6">Season MVP</p>

                                {stats.bestPlayer ? (
                                    <>
                                        <PlayerCard
                                            player={{
                                                id: stats.bestPlayer.nickname,
                                                nickname: stats.bestPlayer.nickname,
                                                portraitPath: stats.bestPlayer.portraitPath,
                                            }}
                                            size="lg"
                                            variant="reveal"
                                            href={null}
                                            accent="brand"
                                            className="mb-6"
                                        >
                                            <div className="mt-3 inline-block bg-primary/90 text-[10px] font-black py-1 px-3 text-black rounded">
                                                {stats.bestPlayer.rating.toFixed(2)} RATING
                                            </div>
                                        </PlayerCard>
                                        <p className="text-sm text-white/40">The engine of your success this year.</p>
                                    </>
                                ) : (
                                    <div className="text-white/20 italic text-sm mt-12">No data available</div>
                                )}

                                <div className="mt-auto w-full pt-8">
                                    <Button onClick={onClose} className="w-full h-14 bg-white text-black hover:bg-white/90 rounded-lg font-bold uppercase tracking-widest text-xs">
                                        Continue Journey
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    )
}
