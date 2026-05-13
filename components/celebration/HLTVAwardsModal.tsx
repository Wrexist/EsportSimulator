"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Trophy, Star, Award, TrendingUp, Crown, Sparkles, Target, Crosshair, Users, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { PlayerPortrait, TeamLogoImage } from "@/components/ui/asset-images"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { AnnualAwards, Top20Player } from "@/engine/hltv-awards-engine"
import { panelTransition } from "@/lib/motion"

interface HLTVAwardsModalProps {
    isOpen: boolean
    onClose: () => void
    awards: AnnualAwards | null
}

export function HLTVAwardsModal({ isOpen, onClose, awards }: HLTVAwardsModalProps) {
    const [revealedCount, setRevealedCount] = useState(0)
    const [isRevealing, setIsRevealing] = useState(false)
    const [selectedPlayer, setSelectedPlayer] = useState<Top20Player | null>(null)

    // Reset reveal state when modal opens
    useEffect(() => {
        if (isOpen && awards) {
            setRevealedCount(0)
            setSelectedPlayer(null)
            setIsRevealing(true)

            // Auto-reveal players from #20 to #1 (one every 150ms)
            const interval = setInterval(() => {
                setRevealedCount(prev => {
                    if (prev >= 20) {
                        clearInterval(interval)
                        setIsRevealing(false)
                        return 20
                    }
                    return prev + 1
                })
            }, 150)

            return () => clearInterval(interval)
        }
    }, [isOpen, awards])

    if (!isOpen || !awards) return null

    const revealAll = () => {
        setRevealedCount(20)
        setIsRevealing(false)
    }

    // Get players to display (revealed from #20 up)
    const displayedPlayers = awards.top20
        .filter(p => (21 - p.rank) <= revealedCount)
        .sort((a, b) => a.rank - b.rank)

    // Get tier color based on rank
    const getTierColor = (rank: number) => {
        if (rank === 1) return "from-amber-400 via-yellow-500 to-amber-600"
        if (rank === 2) return "from-gray-300 via-gray-400 to-gray-500"
        if (rank === 3) return "from-amber-600 via-amber-700 to-amber-800"
        if (rank <= 5) return "from-violet-500/50 to-purple-600/50"
        if (rank <= 10) return "from-cyan-500/30 to-blue-500/30"
        return "from-white/10 to-white/5"
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 top-16 bg-black/58 backdrop-blur-md z-modal"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        variants={panelTransition}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="fixed inset-4 md:inset-8 lg:inset-12 top-20 z-modal flex items-center justify-center"
                    >
                        <div role="dialog" aria-modal="true" aria-labelledby="modal-title-hltv-awards" className="w-full max-w-5xl max-h-full liquid-panel rounded-xl overflow-hidden flex flex-col">

                            {/* Header */}
                            <div className="p-6 bg-white/[0.035] border-b border-white/10 relative overflow-hidden shrink-0">
                                {/* Sparkle Effects */}
                                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/40 to-transparent pointer-events-none" />

                                <div className="flex items-center justify-between relative z-10">
                                    <div className="flex items-center gap-4">
                                        <div className="w-16 h-16 rounded-lg bg-amber-300/14 border border-amber-200/25 flex items-center justify-center shadow-glass-soft">
                                            <Trophy size={32} className="text-amber-200" />
                                        </div>
                                        <div>
                                            <h1 id="modal-title-hltv-awards" className="text-3xl font-bold text-white">
                                                HLTV Top 20 Players
                                            </h1>
                                            <p className="text-amber-400/60 text-sm font-medium">
                                                {awards.year} Annual Rankings
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {isRevealing && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={revealAll}
                                            className="border-amber-500/30 text-amber-200 hover:bg-amber-500/10"
                                            >
                                                <Sparkles size={14} className="mr-2" />
                                                Reveal All
                                            </Button>
                                        )}
                                        <button
                                            onClick={onClose}
                                            className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                                        >
                                            <X size={20} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Content - Two Column Layout */}
                            <div className="flex-1 flex min-h-0 overflow-hidden">
                                {/* Left: Player List */}
                                <div className="flex-1 overflow-y-auto p-4 border-r border-white/5">
                                    <div className="space-y-1.5">
                                        {displayedPlayers.map((player, index) => (
                                            <motion.div
                                                key={player.playerId}
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: index * 0.03 }}
                                                onClick={() => setSelectedPlayer(player)}
                                                className={cn(
                                                    "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-[background-color,box-shadow] duration-100 ease-out select-none touch-manipulation will-change-transform active:scale-[0.99] active:duration-0",
                                                    selectedPlayer?.playerId === player.playerId
                                                        ? "bg-gradient-to-r " + getTierColor(player.rank) + " ring-1 ring-amber-500/50"
                                                        : player.rank <= 3
                                                            ? "bg-gradient-to-r " + getTierColor(player.rank) + " hover:ring-1 hover:ring-white/20"
                                                            : "bg-white/[0.03] hover:bg-white/[0.06] border border-white/5",
                                                    player.isPlayerTeam && "ring-2 ring-primary/50"
                                                )}
                                            >
                                                {/* Rank */}
                                                <div className={cn(
                                                    "w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg shrink-0",
                                                    player.rank === 1
                                                        ? "bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg"
                                                        : player.rank === 2
                                                            ? "bg-gradient-to-br from-gray-300 to-gray-500 text-gray-900"
                                                            : player.rank === 3
                                                                ? "bg-gradient-to-br from-amber-700 to-amber-900 text-amber-200"
                                                                : "bg-white/10 text-white/60"
                                                )}>
                                                    {player.rank === 1 ? <Crown size={20} /> : `#${player.rank}`}
                                                </div>

                                                {/* Player Portrait */}
                                                <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 overflow-hidden shrink-0">
                                                    <PlayerPortrait src={player.portraitPath} alt={player.nickname} size={40} variant="card" />
                                                </div>

                                                {/* Player Info */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-white truncate">{player.nickname}</span>
                                                        <CountryFlag country={player.nationality} size={12} />
                                                        {player.isPlayerTeam && (
                                                            <Badge className="text-[7px] px-1 py-0 bg-primary/20 text-primary border-primary/30">YOU</Badge>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-[10px] text-white/40">
                                                        <span className="truncate">{player.teamName}</span>
                                                    </div>
                                                </div>

                                                {/* Rating */}
                                                <div className="text-right shrink-0">
                                                    <p className={cn(
                                                        "text-lg font-bold",
                                                        player.hltvRating >= 1.20 ? "text-emerald-400" :
                                                            player.hltvRating >= 1.10 ? "text-amber-400" : "text-white/70"
                                                    )}>
                                                        {player.hltvRating.toFixed(2)}
                                                    </p>
                                                    <p className="text-[8px] text-white/30 uppercase">Rating</p>
                                                </div>
                                            </motion.div>
                                        ))}

                                        {/* Revealing indicator */}
                                        {isRevealing && revealedCount < 20 && (
                                            <motion.div
                                                className="flex items-center justify-center py-6 text-amber-400"
                                                animate={{ opacity: [0.5, 1, 0.5] }}
                                                transition={{ duration: 1, repeat: Infinity }}
                                            >
                                                <Sparkles size={18} className="mr-2" />
                                                <span className="text-sm font-bold uppercase tracking-widest">
                                                    Revealing #{21 - revealedCount - 1}...
                                                </span>
                                            </motion.div>
                                        )}
                                    </div>
                                </div>

                                {/* Right: Player Details */}
                                <div className="w-[360px] shrink-0 p-4 overflow-y-auto bg-black/20">
                                    {selectedPlayer ? (
                                        <motion.div
                                            key={selectedPlayer.playerId}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="space-y-4"
                                        >
                                            {/* Player Header */}
                                            <div className="text-center">
                                                <div className="w-24 h-24 rounded-xl bg-white/5 border border-white/10 overflow-hidden mx-auto mb-3">
                                                    <PlayerPortrait src={selectedPlayer.portraitPath} alt={selectedPlayer.nickname} size={96} variant="hero" />
                                                </div>
                                                <h2 className="text-2xl font-bold text-white">{selectedPlayer.nickname}</h2>
                                                <div className="flex items-center justify-center gap-2 mt-1">
                                                    <CountryFlag country={selectedPlayer.nationality} size={14} />
                                                    <span className="text-white/50 text-sm">{selectedPlayer.playerName}</span>
                                                </div>
                                                <div className="flex items-center justify-center gap-2 mt-2">
                                                    <div className="w-5 h-5 rounded bg-white/10 overflow-hidden">
                                                        <TeamLogoImage src={selectedPlayer.teamLogo} alt={selectedPlayer.teamName} size={20} />
                                                    </div>
                                                    <span className="text-white/60 text-sm">{selectedPlayer.teamName}</span>
                                                </div>
                                                <Badge className={cn(
                                                    "mt-3 text-xs",
                                                    selectedPlayer.rank === 1 ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                                                        selectedPlayer.rank <= 5 ? "bg-primary/20 text-primary border-primary/30" :
                                                            "bg-white/10 text-white/60 border-white/10"
                                                )}>
                                                    #{selectedPlayer.rank} in the World
                                                </Badge>
                                            </div>

                                            {/* Stats Grid */}
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="p-3 rounded-lg bg-white/5 text-center">
                                                    <p className="text-2xl font-bold text-emerald-400">{selectedPlayer.hltvRating.toFixed(2)}</p>
                                                    <p className="text-[9px] text-white/40 uppercase">HLTV Rating</p>
                                                </div>
                                                <div className="p-3 rounded-lg bg-white/5 text-center">
                                                    <p className="text-2xl font-bold text-cyan-400">{selectedPlayer.impactRating.toFixed(2)}</p>
                                                    <p className="text-[9px] text-white/40 uppercase">Impact</p>
                                                </div>
                                                <div className="p-3 rounded-lg bg-white/5 text-center">
                                                    <p className="text-xl font-bold text-white">{selectedPlayer.kast.toFixed(1)}%</p>
                                                    <p className="text-[9px] text-white/40 uppercase">KAST</p>
                                                </div>
                                                <div className="p-3 rounded-lg bg-white/5 text-center">
                                                    <p className="text-xl font-bold text-white">{selectedPlayer.adr.toFixed(1)}</p>
                                                    <p className="text-[9px] text-white/40 uppercase">ADR</p>
                                                </div>
                                            </div>

                                            {/* Achievements */}
                                            <div className="space-y-2">
                                                <h3 className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Achievements</h3>
                                                <div className="grid grid-cols-3 gap-2">
                                                    <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
                                                        <Trophy size={16} className="text-amber-400 mx-auto mb-1" />
                                                        <p className="text-lg font-bold text-amber-400">{selectedPlayer.mvpCount}</p>
                                                        <p className="text-[8px] text-amber-400/60 uppercase">MVPs</p>
                                                    </div>
                                                    <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20 text-center">
                                                        <Star size={16} className="text-violet-400 mx-auto mb-1" />
                                                        <p className="text-lg font-bold text-violet-400">{selectedPlayer.evpCount}</p>
                                                        <p className="text-[8px] text-violet-400/60 uppercase">EVPs</p>
                                                    </div>
                                                    <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-center">
                                                        <Target size={16} className="text-cyan-400 mx-auto mb-1" />
                                                        <p className="text-lg font-bold text-cyan-400">{selectedPlayer.bigEventWins}</p>
                                                        <p className="text-[8px] text-cyan-400/60 uppercase">Titles</p>
                                                    </div>
                                                </div>
                                                {selectedPlayer.majorWins > 0 && (
                                                    <div className="p-3 rounded-lg bg-gradient-to-r from-amber-500/20 to-orange-500/10 border border-amber-500/30 flex items-center gap-3">
                                                        <Crown size={24} className="text-amber-400" />
                                                        <div>
                                                            <p className="font-bold text-amber-300">{selectedPlayer.majorWins}x Major Champion</p>
                                                            {selectedPlayer.majorMvps > 0 && (
                                                                <p className="text-[10px] text-amber-400/60">{selectedPlayer.majorMvps} Major MVP</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Meta */}
                                            <div className="text-center text-[10px] text-white/30 space-y-1">
                                                <p>{selectedPlayer.mapsPlayed} maps played at Big Events</p>
                                                <p>{selectedPlayer.age} years old • {selectedPlayer.role}</p>
                                            </div>
                                        </motion.div>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-white/30 text-sm">
                                            <div className="text-center">
                                                <Users size={40} className="mx-auto mb-3 opacity-30" />
                                                <p>Select a player to view details</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Footer - Special Awards */}
                            <div className="p-4 bg-black/20 border-t border-white/10 shrink-0">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-6 text-sm">
                                        {awards.mvpOfTheYear && revealedCount >= 20 && (
                                            <div className="flex items-center gap-2">
                                                <Crown size={14} className="text-amber-400" />
                                                <span className="text-white/50">MVP:</span>
                                                <span className="text-amber-400 font-bold">{awards.mvpOfTheYear.nickname}</span>
                                            </div>
                                        )}
                                        {awards.rookieOfTheYear && revealedCount >= 20 && (
                                            <div className="flex items-center gap-2">
                                                <Star size={14} className="text-emerald-400" />
                                                <span className="text-white/50">Rookie:</span>
                                                <span className="text-emerald-400 font-bold">{awards.rookieOfTheYear.nickname}</span>
                                            </div>
                                        )}
                                        {awards.awperOfTheYear && revealedCount >= 20 && (
                                            <div className="flex items-center gap-2">
                                                <Crosshair size={14} className="text-cyan-400" />
                                                <span className="text-white/50">AWPer:</span>
                                                <span className="text-cyan-400 font-bold">{awards.awperOfTheYear.nickname}</span>
                                            </div>
                                        )}
                                    </div>
                                    <Button onClick={onClose} className="bg-white text-black hover:bg-white/90">
                                        Close
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
