"use client"

import React, { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Trophy, ChevronRight, Sparkles, Star, Zap, Medal } from "lucide-react"
import { cn } from "@/lib/utils"
import confetti from "canvas-confetti"

interface AdvancementAnimationProps {
    show: boolean
    fromStage: string
    toStage: string
    teamName: string
    teamLogo?: string
    tournamentName?: string
    isChampionship?: boolean
    onComplete?: () => void
}

export function AdvancementAnimation({
    show,
    fromStage,
    toStage,
    teamName,
    teamLogo,
    tournamentName,
    isChampionship = false,
    onComplete
}: AdvancementAnimationProps) {
    const [phase, setPhase] = useState<"idle" | "intro" | "transition" | "reveal" | "celebrate">("idle")

    useEffect(() => {
        if (!show) {
            setPhase("idle")
            return
        }

        // Smoother animation sequence with better timing
        setPhase("intro")

        const transitionTimer = setTimeout(() => setPhase("transition"), 800)
        const revealTimer = setTimeout(() => setPhase("reveal"), 1800)
        const celebrateTimer = setTimeout(() => {
            setPhase("celebrate")
            // Fire confetti with better positioning (above fold)
            confetti({
                particleCount: 80,
                spread: 100,
                origin: { x: 0.5, y: 0.35 },
                colors: isChampionship
                    ? ["#f59e0b", "#fbbf24", "#fcd34d", "#ffffff"]
                    : ["#10b981", "#3b82f6", "#8b5cf6", "#ffffff"],
                gravity: 0.8,
                scalar: 1.2
            })
        }, 2600)

        const completeTimer = setTimeout(() => {
            onComplete?.()
        }, 5000)

        return () => {
            clearTimeout(transitionTimer)
            clearTimeout(revealTimer)
            clearTimeout(celebrateTimer)
            clearTimeout(completeTimer)
        }
    }, [show, isChampionship, onComplete])

    // Get display name for stage with cleaner formatting
    const formatStage = (stage: string) => {
        if (!stage) return "Next Round"
        const lower = stage.toLowerCase()
        if (lower.includes("grand final")) return "Grand Final"
        if (lower === "final" || lower === "finals") return "Finals"
        if (lower.includes("semi")) return "Semi-Finals"
        if (lower.includes("quarter")) return "Quarter-Finals"
        if (lower.includes("round of 16") || lower.includes("ro16")) return "Round of 16"
        if (lower.includes("round of 32") || lower.includes("ro32")) return "Round of 32"
        // Handle numbered stages like "Round 1", "Stage 2", etc.
        return stage.charAt(0).toUpperCase() + stage.slice(1)
    }

    // Determine if advancing to finals
    const isAdvancingToFinals = toStage?.toLowerCase().includes("final") &&
        !toStage?.toLowerCase().includes("semi") &&
        !toStage?.toLowerCase().includes("quarter")

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 top-16 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm cursor-pointer"
                    onClick={onComplete}
                >
                    {/* Animated Background */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        {/* Primary glow */}
                        <motion.div
                            className={cn(
                                "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[120px]",
                                isAdvancingToFinals || isChampionship ? "bg-amber-500/25" : "bg-emerald-500/15"
                            )}
                            animate={{
                                scale: [1, 1.2, 1],
                                opacity: [0.4, 0.6, 0.4]
                            }}
                            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                        />
                        {/* Secondary accent glow */}
                        <motion.div
                            className={cn(
                                "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full blur-[80px]",
                                isAdvancingToFinals || isChampionship ? "bg-yellow-400/20" : "bg-cyan-500/10"
                            )}
                            animate={{
                                scale: [1.2, 1, 1.2],
                                opacity: [0.3, 0.5, 0.3]
                            }}
                            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                        />
                    </div>

                    <div className="relative flex flex-col items-center gap-6 max-w-3xl px-8">
                        {/* Tournament Badge */}
                        {tournamentName && (
                            <motion.div
                                initial={{ opacity: 0, y: -30, scale: 0.9 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                                className={cn(
                                    "px-6 py-2 rounded-full border backdrop-blur-sm",
                                    isAdvancingToFinals || isChampionship
                                        ? "bg-amber-500/10 border-amber-500/30"
                                        : "bg-emerald-500/10 border-emerald-500/30"
                                )}
                            >
                                <p className={cn(
                                    "text-sm font-bold uppercase tracking-[0.2em]",
                                    isAdvancingToFinals || isChampionship ? "text-amber-400" : "text-emerald-400"
                                )}>
                                    {tournamentName}
                                </p>
                            </motion.div>
                        )}

                        {/* Team Logo - Center Focus */}
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{
                                scale: phase === "intro" ? 1 : phase === "transition" ? 1.1 : 1,
                                opacity: 1
                            }}
                            transition={{ duration: 0.5, type: "spring" }}
                            className={cn(
                                "relative w-24 h-24 rounded-2xl flex items-center justify-center shadow-2xl",
                                isAdvancingToFinals || isChampionship
                                    ? "bg-gradient-to-br from-amber-500/20 to-amber-600/20 border-2 border-amber-500/40"
                                    : "bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border-2 border-emerald-500/40"
                            )}
                        >
                            {teamLogo ? (
                                <img src={teamLogo} alt={teamName} className="w-16 h-16 object-contain" />
                            ) : (
                                <span className="text-3xl font-bold text-white">{teamName?.[0] || "?"}</span>
                            )}
                            {/* Pulse ring */}
                            <motion.div
                                className={cn(
                                    "absolute inset-0 rounded-2xl border-2",
                                    isAdvancingToFinals || isChampionship ? "border-amber-400" : "border-emerald-400"
                                )}
                                animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                                transition={{ duration: 2, repeat: Infinity }}
                            />
                        </motion.div>

                        {/* Team Name */}
                        <motion.h3
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3 }}
                            className="text-2xl font-bold text-white uppercase tracking-wide"
                        >
                            {teamName}
                        </motion.h3>

                        {/* Stage Progression - Cleaner Design */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                            className="flex items-center gap-6 mt-4"
                        >
                            {/* From Stage */}
                            <motion.div
                                animate={{
                                    opacity: phase === "transition" || phase === "reveal" || phase === "celebrate" ? 0.4 : 1,
                                    scale: phase === "transition" || phase === "reveal" || phase === "celebrate" ? 0.9 : 1
                                }}
                                transition={{ duration: 0.4 }}
                                className="text-center min-w-[140px]"
                            >
                                <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mb-1">Completed</p>
                                <p className="text-white/60 text-lg font-semibold">{formatStage(fromStage)}</p>
                            </motion.div>

                            {/* Arrow Path */}
                            <div className="relative w-32 flex items-center justify-center">
                                {/* Track */}
                                <div className="absolute w-full h-0.5 bg-white/10 rounded-full" />
                                {/* Progress */}
                                <motion.div
                                    className={cn(
                                        "absolute left-0 h-0.5 rounded-full",
                                        isAdvancingToFinals || isChampionship
                                            ? "bg-gradient-to-r from-amber-500 to-yellow-400"
                                            : "bg-gradient-to-r from-emerald-500 to-cyan-400"
                                    )}
                                    initial={{ width: "0%" }}
                                    animate={{
                                        width: phase === "transition" || phase === "reveal" || phase === "celebrate" ? "100%" : "0%"
                                    }}
                                    transition={{ duration: 0.8, ease: "easeInOut" }}
                                />
                                {/* Arrow */}
                                <motion.div
                                    initial={{ x: -60, opacity: 0 }}
                                    animate={{
                                        x: phase === "transition" || phase === "reveal" || phase === "celebrate" ? 60 : -60,
                                        opacity: phase === "intro" ? 0 : 1
                                    }}
                                    transition={{ duration: 0.8, ease: "easeInOut" }}
                                >
                                    <ChevronRight className={cn(
                                        "w-6 h-6",
                                        isAdvancingToFinals || isChampionship ? "text-amber-400" : "text-emerald-400"
                                    )} />
                                </motion.div>
                            </div>

                            {/* To Stage */}
                            <motion.div
                                animate={{
                                    opacity: phase === "reveal" || phase === "celebrate" ? 1 : 0.3,
                                    scale: phase === "reveal" || phase === "celebrate" ? 1 : 0.9,
                                    x: phase === "reveal" || phase === "celebrate" ? 0 : 10
                                }}
                                transition={{ duration: 0.5, type: "spring" }}
                                className="text-center min-w-[140px]"
                            >
                                <p className={cn(
                                    "text-[10px] font-bold uppercase tracking-[0.2em] mb-1",
                                    isAdvancingToFinals || isChampionship ? "text-amber-400/70" : "text-emerald-400/70"
                                )}>Next Stage</p>
                                <p className={cn(
                                    "text-xl font-bold",
                                    isAdvancingToFinals || isChampionship ? "text-amber-400" : "text-emerald-400"
                                )}>
                                    {formatStage(toStage)}
                                </p>
                            </motion.div>
                        </motion.div>

                        {/* Celebration Banner */}
                        <motion.div
                            initial={{ opacity: 0, y: 30, scale: 0.9 }}
                            animate={{
                                opacity: phase === "celebrate" ? 1 : 0,
                                y: phase === "celebrate" ? 0 : 30,
                                scale: phase === "celebrate" ? 1 : 0.9
                            }}
                            transition={{ duration: 0.6, type: "spring", stiffness: 150 }}
                            className="mt-8 text-center"
                        >
                            <div className="flex items-center justify-center gap-4 mb-3">
                                {isAdvancingToFinals || isChampionship ? (
                                    <Trophy className="w-8 h-8 text-amber-400" />
                                ) : (
                                    <Medal className="w-8 h-8 text-emerald-400" />
                                )}
                                <h2 className={cn(
                                    "text-4xl font-black uppercase tracking-tight",
                                    isAdvancingToFinals || isChampionship
                                        ? "bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-300 bg-clip-text text-transparent"
                                        : "bg-gradient-to-r from-emerald-300 via-cyan-200 to-emerald-300 bg-clip-text text-transparent"
                                )}>
                                    {isAdvancingToFinals || isChampionship ? "FINALS BOUND!" : "ADVANCING!"}
                                </h2>
                                {isAdvancingToFinals || isChampionship ? (
                                    <Trophy className="w-8 h-8 text-amber-400" />
                                ) : (
                                    <Medal className="w-8 h-8 text-emerald-400" />
                                )}
                            </div>

                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.8 }}
                                className="text-white/30 text-xs mt-8 uppercase tracking-widest"
                            >
                                Click anywhere to continue
                            </motion.p>
                        </motion.div>

                        {/* Decorative sparkles during celebration */}
                        {phase === "celebrate" && (
                            <>
                                {[...Array(6)].map((_, i) => (
                                    <motion.div
                                        key={i}
                                        className="absolute"
                                        style={{
                                            top: `${20 + ((i * 37 + 13) % 60)}%`,
                                            left: `${10 + ((i * 53 + 7) % 80)}%`
                                        }}
                                        initial={{ opacity: 0, scale: 0 }}
                                        animate={{ opacity: [0, 1, 0], scale: [0, 1, 0] }}
                                        transition={{
                                            duration: 1.5,
                                            delay: 0.2 + i * 0.15,
                                            repeat: Infinity,
                                            repeatDelay: 1
                                        }}
                                    >
                                        <Sparkles className={cn(
                                            "w-5 h-5",
                                            isAdvancingToFinals || isChampionship ? "text-amber-400/60" : "text-emerald-400/60"
                                        )} />
                                    </motion.div>
                                ))}
                            </>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
