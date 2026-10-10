"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useAppReducedMotion } from "@/lib/reduced-motion"
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
    const reduceMotion = useAppReducedMotion()

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
                    transition={{ duration: reduceMotion ? 0.1 : 0.2 }}
                    className="fixed inset-0 z-modal pointer-events-none flex items-center justify-center"
                    aria-hidden="true"
                >
                    <div className="absolute inset-0 bg-ink/50" />

                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: reduceMotion ? 0.1 : 0.2, ease: "easeOut" }}
                        className="relative z-10 rounded-[10px] border border-line-strong bg-panel px-12 py-8 text-center"
                    >
                        <ArrowLeftRight className="mx-auto mb-3 h-8 w-8 text-ink-3" />
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Half time</p>
                        <h2 className="mt-1 font-display text-5xl font-bold uppercase leading-none text-ink-1">Switching sides</h2>
                        <p className="mt-3 flex items-center justify-center gap-3 text-sm font-semibold">
                            <span className="text-side-ct">CT</span>
                            <ArrowLeftRight className="h-4 w-4 text-ink-3" aria-hidden="true" />
                            <span className="text-side-t">T</span>
                        </p>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
