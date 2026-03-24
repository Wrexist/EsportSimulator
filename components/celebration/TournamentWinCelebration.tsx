"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Trophy, Star, TrendingUp, DollarSign, X, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import Image from "next/image"
import confetti from "canvas-confetti"

interface TournamentWinCelebrationProps {
    data: {
        tournamentName: string
        tier: string
        prize: number
        repGain: number
        fanGain: number
        logoPath?: string
        trophyPath?: string
    }
    onClose: () => void
}

export function TournamentWinCelebration({ data, onClose }: TournamentWinCelebrationProps) {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)

        // Trigger initial confetti
        const duration = 5 * 1000
        const animationEnd = Date.now() + duration
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 }

        const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min

        const interval: any = setInterval(function () {
            const timeLeft = animationEnd - Date.now()

            if (timeLeft <= 0) {
                return clearInterval(interval)
            }

            const particleCount = 50 * (timeLeft / duration)
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } })
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } })
        }, 250)

        return () => clearInterval(interval)
    }, [])

    if (!mounted) return null

    const tierColor = data.tier === "S_TIER" ? "text-amber-400" : data.tier === "A_TIER" ? "text-purple-400" : "text-blue-400"
    const tierBg = data.tier === "S_TIER" ? "from-amber-500/20" : data.tier === "A_TIER" ? "from-purple-500/20" : "from-blue-500/20"

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-overlay flex items-center justify-center p-4 md:p-8"
            >
                {/* Blurred Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 bg-[#080a0e]/95 backdrop-blur-[20px]"
                    onClick={onClose}
                />

                {/* Animated Background Gradients */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <motion.div
                        animate={{
                            scale: [1, 1.2, 1],
                            rotate: [0, 90, 0],
                            opacity: [0.1, 0.2, 0.1]
                        }}
                        transition={{ duration: 10, repeat: Infinity }}
                        className={cn("absolute -top-1/4 -right-1/4 w-[100vw] h-[100vw] rounded-full blur-[150px] bg-gradient-to-br", tierBg, "to-transparent")}
                    />
                    <motion.div
                        animate={{
                            scale: [1, 1.3, 1],
                            rotate: [0, -45, 0],
                            opacity: [0.05, 0.15, 0.05]
                        }}
                        transition={{ duration: 15, repeat: Infinity }}
                        className={cn("absolute -bottom-1/4 -left-1/4 w-[80vw] h-[80vw] rounded-full blur-[120px] bg-gradient-to-tr", tierBg, "to-transparent")}
                    />
                </div>

                {/* Celebration Card */}
                <motion.div
                    initial={{ scale: 0.8, opacity: 0, y: 50 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    transition={{ type: "spring", damping: 20, stiffness: 100 }}
                    className="relative w-full max-w-4xl glass-panel rounded-[40px] overflow-hidden border-white/5 shadow-[0_0_100px_rgba(0,0,0,0.5)]"
                >
                    <div className="absolute top-6 right-6 z-20">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onClose}
                            className="rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white"
                        >
                            <X className="w-5 h-5" />
                        </Button>
                    </div>

                    <div className="relative z-10 p-8 md:p-12 text-center">
                        {/* Trophy Animation */}
                        <div className="relative mb-12">
                            <motion.div
                                initial={{ scale: 0, rotate: -20 }}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={{ delay: 0.3, type: "spring", damping: 12 }}
                                className="relative z-10 w-48 h-48 mx-auto"
                            >
                                <div className="absolute inset-0 bg-primary/20 blur-[60px] rounded-full animate-pulse" />
                                {data.trophyPath ? (
                                    <Image
                                        src={data.trophyPath}
                                        alt="Trophy"
                                        width={192}
                                        height={192}
                                        className="relative z-10 object-contain drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
                                    />
                                ) : (
                                    <div className="w-full h-full rounded-full bg-gradient-to-b from-amber-400 to-amber-600 flex items-center justify-center p-10 shadow-2xl">
                                        <Trophy className="w-full h-full text-[#1a1a1a]" />
                                    </div>
                                )}
                            </motion.div>

                            {/* Orbiting Elements */}
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                            >
                                <Star className="absolute top-0 text-amber-500/40 w-6 h-6" />
                                <Star className="absolute right-0 text-purple-500/40 w-4 h-4" />
                                <Star className="absolute bottom-0 text-blue-500/40 w-5 h-5" />
                                <Star className="absolute left-0 text-emerald-500/40 w-3 h-3" />
                            </motion.div>
                        </div>

                        {/* Text Content */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.6 }}
                            className="space-y-4"
                        >
                            <h4 className={cn("text-xs font-normal uppercase tracking-[0.5em] mb-2", tierColor)}>
                                CHAMPIONS OF THE WORLD
                            </h4>
                            <h2 className="text-4xl md:text-6xl font-normal text-white tracking-tighter liquid-text mb-4">
                                {data.tournamentName}
                            </h2>
                            <div className="flex items-center justify-center gap-4 mb-10">
                                <div className="h-px w-12 bg-white/10" />
                                <span className="text-[10px] font-normal text-white/40 uppercase tracking-widest">{data.tier.replace('_', ' ')} VICTOR</span>
                                <div className="h-px w-12 bg-white/10" />
                            </div>
                        </motion.div>

                        {/* Rewards Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.8 }}
                                className="glass-card p-6 rounded-[24px] border-white/5 bg-white/[0.02] flex items-center gap-6"
                            >
                                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                                    <DollarSign className="w-8 h-8" />
                                </div>
                                <div className="text-left">
                                    <p className="text-[10px] font-normal text-white/30 uppercase tracking-widest mb-1">PRIZE MONEY</p>
                                    <p className="text-2xl font-normal text-white">${data.prize.toLocaleString()}</p>
                                </div>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.9 }}
                                className="glass-card p-6 rounded-[24px] border-white/5 bg-white/[0.02] flex items-center gap-6"
                            >
                                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400">
                                    <Users className="w-8 h-8" />
                                </div>
                                <div className="text-left">
                                    <p className="text-[10px] font-normal text-white/30 uppercase tracking-widest mb-1">NEW FOLLOWERS</p>
                                    <p className="text-2xl font-normal text-white">+{data.fanGain.toLocaleString()}</p>
                                </div>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 1 }}
                                className="glass-card p-6 rounded-[24px] border-white/5 bg-white/[0.02] flex items-center gap-6"
                            >
                                <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                                    <TrendingUp className="w-8 h-8" />
                                </div>
                                <div className="text-left">
                                    <p className="text-[10px] font-normal text-white/30 uppercase tracking-widest mb-1">REPUTATION</p>
                                    <p className="text-2xl font-normal text-white">+{data.repGain}</p>
                                </div>
                            </motion.div>
                        </div>

                        {/* Action Buttons */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 1.2 }}
                            className="mt-12"
                        >
                            <Button
                                size="lg"
                                onClick={onClose}
                                className="h-16 px-12 rounded-2xl bg-white text-black font-normal uppercase tracking-widest hover:bg-white/90 shadow-[0_20px_40px_rgba(255,255,255,0.1)] transition-all active:scale-95"
                            >
                                CLAIM VICTORY
                            </Button>
                        </motion.div>
                    </div>

                    {/* Decorative Bottom Pattern */}
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
