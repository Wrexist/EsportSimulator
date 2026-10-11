"use client"

import React, { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { Trophy, ChevronRight, Medal } from "lucide-react"
import { cn } from "@/lib/utils"
import { fireConfetti } from "@/lib/confetti-lazy"
import { soundManager } from "@/lib/sound-manager"
import { useFocusTrap } from "@/lib/accessibility"

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
    // Keyboard parity with click-to-dismiss: Escape (via the trap) and Enter/Space skip.
    const dialogRef = useFocusTrap(!!show, onComplete)

    // Keep the latest onComplete in a ref so it doesn't have to be an effect
    // dependency. The caller passes an inline arrow (fresh identity each render),
    // so including it below would tear down + recreate the timers on every
    // parent re-render while `show` is true — resetting `phase` to "intro" and
    // RE-FIRING confetti + the victory sound mid-sequence.
    const onCompleteRef = useRef(onComplete)
    useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

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
            // Sound + confetti land together with the celebrate phase.
            if (typeof window !== "undefined") {
                // The match result already played its victory cue (once per match).
                soundManager.play("tournamentAdvance")
            }
            // Fire confetti with better positioning (above fold)
            fireConfetti({
                particleCount: 80,
                spread: 100,
                origin: { x: 0.5, y: 0.35 },
                colors: isChampionship
                    ? ["#F2B53A", "#FFC85C", "#F2F4F7"]
                    : ["#3DD68C", "#F2B53A", "#F2F4F7"],
                gravity: 0.8,
                scalar: 1.2
            })
        }, 2600)

        const completeTimer = setTimeout(() => {
            onCompleteRef.current?.()
        }, 5000)

        return () => {
            clearTimeout(transitionTimer)
            clearTimeout(revealTimer)
            clearTimeout(celebrateTimer)
            clearTimeout(completeTimer)
        }
    }, [show, isChampionship])

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
                    className="fixed inset-0 z-modal flex cursor-pointer items-center justify-center bg-ink/95"
                    onClick={onComplete}
                    ref={dialogRef} tabIndex={-1}
                    role="dialog"
                    aria-modal="true"
                    aria-label={isChampionship ? `${teamName} are champions` : `${teamName} advance${toStage ? ` to ${toStage}` : ""}`}
                    aria-describedby="advancement-skip-hint"
                    onKeyDown={event => {
                        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onComplete?.() }
                    }}
                >
                    <span id="advancement-skip-hint" className="sr-only">Press Enter or Escape to continue.</span>
                    <div className="relative flex flex-col items-center gap-6 max-w-3xl px-8">
                        {/* Tournament Badge */}
                        {tournamentName && (
                            <motion.div
                                initial={{ opacity: 0, y: -30, scale: 0.9 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                                className={cn(
                                    "px-3 py-1 rounded-sm border ",
                                    isAdvancingToFinals || isChampionship
                                        ? "bg-gold/[0.06] border-gold/40"
                                        : "bg-positive/10 border-positive/40"
                                )}
                            >
                                <p className={cn(
                                    "text-sm font-bold uppercase tracking-[0.08em]",
                                    isAdvancingToFinals || isChampionship ? "text-gold" : "text-positive"
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
                                "relative w-24 h-24 rounded-lg flex items-center justify-center ",
                                isAdvancingToFinals || isChampionship
                                    ? "bg-raised border-2 border-gold/40"
                                    : "bg-raised border-2 border-positive/40"
                            )}
                        >
                            {teamLogo ? (
                                <Image src={teamLogo} alt={teamName} width={64} height={64} className="w-16 h-16 object-contain" unoptimized />
                            ) : (
                                <span className="text-3xl font-bold text-ink-1">{teamName?.[0] || "?"}</span>
                            )}
                        </motion.div>

                        {/* Team Name */}
                        <motion.h3
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3 }}
                            className="font-display text-3xl font-bold uppercase text-ink-1"
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
                                <p className="text-ink-3 text-[11px] font-bold uppercase tracking-[0.08em] mb-1">Completed</p>
                                <p className="text-ink-2 text-lg font-semibold">{formatStage(fromStage)}</p>
                            </motion.div>

                            {/* Arrow Path */}
                            <div className="relative w-32 flex items-center justify-center">
                                {/* Track */}
                                <div className="absolute w-full h-0.5 bg-hover rounded-full" />
                                {/* Progress */}
                                <motion.div
                                    className={cn(
                                        "absolute left-0 h-0.5 rounded-full",
                                        isAdvancingToFinals || isChampionship ? "bg-gold" : "bg-positive"
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
                                        isAdvancingToFinals || isChampionship ? "text-gold" : "text-positive"
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
                                    "text-[11px] font-bold uppercase tracking-[0.08em] mb-1",
                                    isAdvancingToFinals || isChampionship ? "text-gold/70" : "text-positive/70"
                                )}>Next Stage</p>
                                <p className={cn(
                                    "text-xl font-bold",
                                    isAdvancingToFinals || isChampionship ? "text-gold" : "text-positive"
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
                                    <Trophy className="w-8 h-8 text-gold" />
                                ) : (
                                    <Medal className="w-8 h-8 text-positive" />
                                )}
                                <h2 className={cn(
                                    "font-display text-5xl font-extrabold uppercase leading-none",
                                    isAdvancingToFinals || isChampionship ? "text-gold" : "text-ink-1"
                                )}>
                                    {isAdvancingToFinals || isChampionship ? "Into the final" : "Advancing"}
                                </h2>
                                {isAdvancingToFinals || isChampionship ? (
                                    <Trophy className="w-8 h-8 text-gold" />
                                ) : (
                                    <Medal className="w-8 h-8 text-positive" />
                                )}
                            </div>

                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.8 }}
                                className="mt-8 text-xs text-ink-3"
                            >
                                Click anywhere to continue
                            </motion.p>
                        </motion.div>

                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
