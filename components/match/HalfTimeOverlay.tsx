"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useEffect, useState } from "react"
import { ArrowLeftRight } from "lucide-react"

/**
 * Half-time card. Renders for ~2.4s when the match crosses the 12th
 * round and the engine swaps sides. Mirrors the DefeatOverlay shape but
 * with a neutral broadcast palette so it reads as a "broadcast cue"
 * rather than an emotional moment. Honors prefers-reduced-motion.
 */
export function HalfTimeOverlay({ active }: { active: boolean }) {
    const [visible, setVisible] = useState(false)
    const reduceMotion = useReducedMotion()

    useEffect(() => {
        if (!active) return
        setVisible(true)
        const t = setTimeout(() => setVisible(false), reduceMotion ? 800 : 2400)
        return () => clearTimeout(t)
    }, [active, reduceMotion])

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduceMotion ? 0.1 : 0.3 }}
                    className="fixed inset-0 z-modal pointer-events-none flex items-center justify-center"
                    aria-hidden="true"
                >
                    {/* Soft dark vignette so the card pops */}
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

                    <motion.div
                        initial={{ scale: 0.96, opacity: 0, y: 12 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.98, opacity: 0, y: 8 }}
                        transition={{ duration: reduceMotion ? 0.1 : 0.35, ease: "easeOut" }}
                        className="relative z-10 px-10 py-8 rounded-2xl bg-white/[0.06] border border-white/15 backdrop-blur-xl shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)] text-center"
                    >
                        <ArrowLeftRight className="w-10 h-10 mx-auto mb-4 text-cyan-300/80" />
                        <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-cyan-300/80 mb-2">
                            Broadcast Pause
                        </p>
                        <h2 className="text-4xl font-black tracking-tight text-white drop-shadow-[0_2px_18px_rgba(56,189,248,0.25)]">
                            HALF TIME
                        </h2>
                        <p className="text-xs text-white/55 mt-3 uppercase tracking-widest">
                            Teams swapping sides
                        </p>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
