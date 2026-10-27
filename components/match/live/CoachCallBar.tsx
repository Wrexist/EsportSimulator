"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Megaphone } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAppReducedMotion } from "@/lib/reduced-motion"
import { COACH_CALL_HINT, COACH_CALL_LABEL, COACH_CALLS_PER_ROUND, coachCallBlocked, coachCallsFor, type CoachCallKind, type CoachCallRecord } from "@/engine/match/coach-calls"
import type { LiveTimeSource } from "@/lib/live-clock"

interface CoachCallBarProps {
    /** The managed team plays CT this round. */
    ct: boolean
    calls: readonly CoachCallRecord[]
    clock: LiveTimeSource
    planted: boolean
    /** Last round second (the round's end). */
    roundEnd: number
    onCall: (kind: CoachCallKind) => string | null
}

/**
 * R2: mid-round coach calls for the managed team, in the radar's overlay slot
 * while a round plays. Two calls per round, ten round seconds apart.
 */
export function CoachCallBar({ ct, calls, clock, planted, roundEnd, onCall }: CoachCallBarProps) {
    const [, setTick] = useState(0)
    const [note, setNote] = useState<string | null>(null)
    useEffect(() => {
        const id = setInterval(() => setTick(n => n + 1), 250)
        return () => clearInterval(id)
    }, [])
    useEffect(() => {
        if (!note) return
        const id = setTimeout(() => setNote(null), 2500)
        return () => clearTimeout(id)
    }, [note])
    const t = clock.now()
    const left = COACH_CALLS_PER_ROUND - calls.length
    const state = { t, ct, calls, planted, over: t >= roundEnd - 0.5 }
    const cooldown = calls.length && left > 0 ? coachCallBlocked(coachCallsFor(ct)[0], state) : null
    return (
        <div className="flex justify-center pb-2" data-testid="coach-call-bar">
            <div className="flex max-w-full flex-wrap items-center gap-1.5 rounded-md border border-line-strong bg-panel/95 px-2 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
                <span className="flex items-center gap-1 px-1 text-xs font-semibold uppercase tracking-wide text-ink-3">
                    <Megaphone size={14} aria-hidden="true" /> Call
                </span>
                {coachCallsFor(ct).map(kind => {
                    const blocked = coachCallBlocked(kind, state)
                    return (
                        <button
                            key={kind}
                            type="button"
                            title={blocked ?? COACH_CALL_HINT[kind]}
                            disabled={!!blocked}
                            onClick={() => setNote(onCall(kind))}
                            className={cn(
                                "flex h-7 items-center rounded border px-2 text-xs font-semibold transition-colors",
                                blocked ? "cursor-not-allowed border-line text-ink-3 opacity-50" : "border-line-strong bg-raised text-ink-1 hover:border-gold/60 hover:bg-hover",
                            )}
                            data-coach-call={kind}
                        >
                            {COACH_CALL_LABEL[kind]}
                        </button>
                    )
                })}
                <span className="px-1 text-xs text-ink-3" aria-live="polite">
                    {note ?? (left <= 0 ? "No calls left" : cooldown && /^Wait/.test(cooldown) ? cooldown : `${left} left`)}
                </span>
            </div>
        </div>
    )
}

/** The call just made, over the top of the radar for a few seconds ("COACH · ROTATE TO B"). */
export function CoachCallBanner({ call, ct }: { call: CoachCallRecord | null; ct: boolean }) {
    const reduceMotion = useAppReducedMotion()
    const [shown, setShown] = useState<CoachCallRecord | null>(null)
    useEffect(() => {
        if (!call) return
        setShown(call)
        const id = setTimeout(() => setShown(null), 3000)
        return () => clearTimeout(id)
    }, [call])
    return (
        <div className="pointer-events-none absolute inset-x-0 top-36 z-20 flex justify-center" aria-live="polite">
            <AnimatePresence>
                {shown && (
                    <motion.div
                        key={`${shown.kind}-${shown.t}`}
                        initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center gap-2 rounded-md border border-gold/60 bg-panel/95 px-3 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
                        data-coach-call-banner=""
                    >
                        <Megaphone size={16} className={ct ? "text-side-ct" : "text-side-t"} aria-hidden="true" />
                        <span className="font-display text-lg font-bold uppercase leading-none text-ink-1">{COACH_CALL_LABEL[shown.kind]}</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
