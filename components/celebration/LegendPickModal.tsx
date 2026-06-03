"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Trophy, Star, Crown, Zap } from "lucide-react"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { formatRole } from "@/lib/utils-extended"
import { fireConfetti } from "@/lib/confetti-lazy"
import type { LegendPickData } from "@/engine/save-types"
import { panelTransition } from "@/lib/motion"

interface LegendPickModalProps {
    data: LegendPickData
    onSelect: (legendId: string) => void
}

export function LegendPickModal({ data, onSelect }: LegendPickModalProps) {
    const { players } = useGameStore(useShallow(state => ({
        players: state.players,
    })))
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [confirmed, setConfirmed] = useState(false)
    const [mounted, setMounted] = useState(false)

    const candidates = data.candidates
        .map(id => players.find(p => p.id === id))
        .filter(Boolean) as any[]

    useEffect(() => {
        setMounted(true)
        // Golden confetti for the Major win legend reward
        const burst = () => {
            fireConfetti({
                particleCount: 80,
                spread: 100,
                origin: { y: 0.3 },
                colors: ["#FFD700", "#FFA500", "#FF8C00", "#DAA520", "#B8860B"],
                ticks: 80,
            })
        }
        burst()
        const t = setTimeout(burst, 800)
        return () => clearTimeout(t)
    }, [])

    const handleConfirm = () => {
        if (!selectedId) return
        setConfirmed(true)
        // Big celebration confetti
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                fireConfetti({
                    particleCount: 120,
                    spread: 160,
                    origin: { x: 0.5, y: 0.4 },
                    colors: ["#FFD700", "#FFA500", "#FFFFFF", "#00FF88"],
                    ticks: 100,
                })
            }, i * 300)
        }
        setTimeout(() => onSelect(selectedId), 1500)
    }

    if (!mounted) return null

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-celebration flex items-center justify-center bg-black/58 backdrop-blur-md"
            >
                <div className="absolute inset-0 liquid-app-bg opacity-70 pointer-events-none" />
                <div className="absolute inset-0 liquid-noise pointer-events-none" />

                <motion.div
                    variants={panelTransition}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="modal-title-legend-pick"
                    className="relative z-10 w-full max-w-5xl mx-4"
                >
                    {/* Header */}
                    <motion.div
                        initial={{ y: -20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="text-center mb-8"
                    >
                        <div className="flex items-center justify-center gap-3 mb-3">
                            <Trophy className="text-amber-400" size={28} />
                            <h1 className="text-sm font-bold uppercase tracking-[0.3em] text-amber-400/80">
                                Major Champion Reward
                            </h1>
                            <Trophy className="text-amber-400" size={28} />
                        </div>
                        <h2 id="modal-title-legend-pick" className="text-4xl font-bold text-white uppercase tracking-tight">
                            Choose Your Legend
                        </h2>
                        <p className="text-white/40 mt-2 text-sm">
                            {data.tournamentName} — Select a legend to join your roster
                        </p>
                    </motion.div>

                    {/* Legend Cards */}
                    {!confirmed && (
                        <div className="grid grid-cols-3 gap-6 mb-8">
                            {candidates.map((legend, i) => (
                                <motion.div
                                    key={legend.id}
                                    initial={{ y: 60, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.4 + i * 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                                >
                                    <button
                                        onClick={() => setSelectedId(legend.id)}
                                        className={cn(
                                            "w-full text-left rounded-xl transition-[border-color,box-shadow] duration-100 ease-out overflow-hidden group relative glass-card active:scale-[0.99] active:duration-0",
                                            selectedId === legend.id
                                                ? "border-amber-300/40 shadow-glass-soft ring-1 ring-amber-300/25"
                                                : "border-white/10 hover:border-white/25"
                                        )}
                                    >
                                        {/* Card background glow on select */}
                                        {selectedId === legend.id && (
                                            <div className="absolute inset-0 bg-gradient-to-b from-amber-300/[0.08] to-transparent pointer-events-none" />
                                        )}

                                        {/* Portrait area */}
                                        <div className="relative h-48 bg-gradient-to-b from-white/[0.03] to-transparent flex items-center justify-center">
                                            <div className="w-28 h-28 rounded-xl bg-white/5 overflow-hidden shadow-2xl">
                                                <PlayerPortrait src={legend.portraitPath} alt={legend.nickname} size={112} variant="hero" />
                                            </div>
                                            {/* Skill badge */}
                                            <div className="absolute top-4 right-4">
                                                <div className={cn(
                                                    "w-12 h-12 rounded-lg flex items-center justify-center text-lg font-black",
                                                    legend.skill >= 96 ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
                                                    legend.skill >= 92 ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" :
                                                    "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                                                )}>
                                                    {legend.skill}
                                                </div>
                                            </div>
                                            {/* Legend crown */}
                                            <div className="absolute top-4 left-4">
                                                <Crown className="text-amber-400/60" size={20} />
                                            </div>
                                        </div>

                                        {/* Info area */}
                                        <div className="p-5 bg-black/20 relative z-10">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="text-xl font-bold text-white">{legend.nickname}</h3>
                                                <CountryFlag country={legend.nationality} />
                                            </div>
                                            <p className="text-white/40 text-xs mb-3">{legend.name}</p>

                                            <div className="flex items-center gap-2 mb-3">
                                                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
                                                    {formatRole(legend.role)}
                                                </Badge>
                                                <Badge className="bg-white/10 text-white/60 border-white/10 text-[10px]">
                                                    {legend.majorWins || 0}x Major
                                                </Badge>
                                            </div>

                                            {/* Achievements */}
                                            <div className="space-y-1.5">
                                                {(legend.legendaryAchievements || []).slice(0, 3).map((ach: string, j: number) => (
                                                    <div key={j} className="flex items-center gap-2 text-[11px] text-white/50">
                                                        <Star size={10} className="text-amber-400/60 shrink-0" />
                                                        <span className="truncate">{ach}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Key stats row */}
                                            <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-white/5">
                                                <div className="text-center">
                                                    <div className="text-[10px] text-white/30 uppercase">Matches</div>
                                                    <div className="text-sm font-bold text-white/80">{(legend.matchesPlayed || 0).toLocaleString()}</div>
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-[10px] text-white/30 uppercase">Rating</div>
                                                    <div className="text-sm font-bold text-amber-400">{(legend.avgRating || 0).toFixed(2)}</div>
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-[10px] text-white/30 uppercase">MVPs</div>
                                                    <div className="text-sm font-bold text-white/80">{legend.totalMVPs || 0}</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Selected indicator */}
                                        {selectedId === legend.id && (
                                            <motion.div
                                                initial={{ scaleX: 0 }}
                                                animate={{ scaleX: 1 }}
                                                className="h-1 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500"
                                            />
                                        )}
                                    </button>
                                </motion.div>
                            ))}
                        </div>
                    )}

                    {/* Confirmed state */}
                    {confirmed && selectedId && (
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="text-center py-16"
                        >
                            <div className="w-24 h-24 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto mb-6">
                                <Zap size={48} className="text-amber-400" />
                            </div>
                            <h2 className="text-3xl font-bold text-white mb-2">
                                {candidates.find(c => c.id === selectedId)?.nickname} joins your team!
                            </h2>
                            <p className="text-white/40">A legend returns to the stage...</p>
                        </motion.div>
                    )}

                    {/* Confirm button */}
                    {!confirmed && (
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.8 }}
                            className="text-center"
                        >
                            <button
                                onClick={handleConfirm}
                                disabled={!selectedId}
                                className={cn(
                                    "px-12 py-4 rounded-lg text-lg font-bold uppercase tracking-wider transition-colors duration-100 ease-out select-none touch-manipulation will-change-transform active:scale-[0.97] active:duration-0",
                                    selectedId
                                        ? "bg-amber-300 text-black hover:bg-amber-200 shadow-glass-soft"
                                        : "bg-white/5 text-white/40 cursor-not-allowed"
                                )}
                            >
                                {selectedId ? `Sign ${candidates.find(c => c.id === selectedId)?.nickname}` : "Select a Legend"}
                            </button>
                        </motion.div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
