"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useAppReducedMotion } from "@/lib/reduced-motion"

export interface MomentCalloutData {
    /** Stable per moment (round + player + kill count). */
    id: string
    playerName: string
    count: number
    side: "CT" | "T"
}

const SHOW_MS = 2200
const LABEL: Record<number, string> = { 3: "Triple kill", 4: "Quad kill", 5: "ACE" }

/**
 * Multi-kill callout over the top of the radar ("NAME · TRIPLE KILL"),
 * shown for ~2 s of wall time when a player gets a 3rd, 4th or 5th kill.
 */
export function MomentCallout({ callout }: { callout: MomentCalloutData | null }) {
    const reduceMotion = useAppReducedMotion()
    const [shown, setShown] = useState<MomentCalloutData | null>(null)
    useEffect(() => {
        if (!callout) return
        setShown(callout)
        const t = setTimeout(() => setShown(s => (s?.id === callout.id ? null : s)), SHOW_MS)
        return () => clearTimeout(t)
        // Re-arm only for a new moment.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [callout?.id])
    return (
        <div className="pointer-events-none absolute inset-x-0 top-14 z-20 flex justify-center" aria-live="polite">
            <AnimatePresence>
                {shown && (
                    <motion.div
                        key={shown.id}
                        initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className={cn("flex items-center gap-2 rounded-md border bg-panel/95 px-3 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.45)]", shown.count >= 5 ? "border-gold" : "border-line-strong")}
                        data-moment-callout=""
                    >
                        <span className={cn("text-sm font-semibold", shown.side === "CT" ? "text-side-ct" : "text-side-t")}>{shown.playerName}</span>
                        <span className={cn("font-display text-lg font-bold uppercase leading-none", shown.count >= 5 ? "text-gold" : "text-ink-1")}>{LABEL[Math.min(5, shown.count)] ?? `${shown.count} kills`}</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
