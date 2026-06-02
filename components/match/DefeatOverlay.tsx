"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useEffect, useState } from "react"

/**
 * Tasteful, brief defeat moment that counterbalances the victory confetti
 * burst on the result screen. Renders a fading red vignette + a short
 * "DEFEATED" eyebrow that lingers for ~2 seconds before resolving. Honors
 * prefers-reduced-motion — flash only, no animation.
 */
export function DefeatOverlay({ active }: { active: boolean }) {
    const [visible, setVisible] = useState(false)
    const reduceMotion = useReducedMotion()

    useEffect(() => {
        if (!active) return
        setVisible(true)
        const t = setTimeout(() => setVisible(false), reduceMotion ? 600 : 1800)
        return () => clearTimeout(t)
    }, [active, reduceMotion])

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduceMotion ? 0.1 : 0.35 }}
                    className="fixed inset-0 z-modal pointer-events-none"
                    aria-hidden="true"
                >
                    {/* Red corner vignette — strongest at edges, transparent in the middle */}
                    <div
                        className="absolute inset-0"
                        style={{
                            background:
                                "radial-gradient(ellipse 90% 60% at center, transparent 30%, rgba(190, 18, 60, 0.18) 75%, rgba(127, 29, 29, 0.42) 100%)",
                        }}
                    />
                    {/* Top eyebrow */}
                    <motion.div
                        initial={{ y: -10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -10, opacity: 0 }}
                        transition={{ delay: reduceMotion ? 0 : 0.15, duration: reduceMotion ? 0.1 : 0.4 }}
                        className="absolute top-24 left-1/2 -translate-x-1/2 text-center"
                    >
                        <p className="text-[10px] font-bold tracking-[0.4em] text-red-300/80 uppercase mb-1">
                            Match Result
                        </p>
                        <h2 className="text-5xl font-black tracking-tight text-red-400 drop-shadow-[0_2px_18px_rgba(239,68,68,0.4)]">
                            DEFEATED
                        </h2>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
