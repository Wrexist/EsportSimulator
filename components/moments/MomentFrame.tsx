"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { useFocusTrap } from "@/lib/accessibility"
import { useAppReducedMotion } from "@/lib/reduced-motion"
import { soundManager } from "@/lib/sound-manager"
import type { SoundType } from "@/lib/audio-feedback"
import { cn } from "@/lib/utils"
import { tokens } from "@/src/design/tokens"

export type MomentTone = "gold" | "positive" | "negative"

const EASE = [...tokens.motion.easeOutExpo] as [number, number, number, number]
/** Input is ignored this long after a moment opens, so the key or click that led here cannot close it. */
const ARM_MS = 650

/** A moment's cue plays once even if its view mounts twice (dev double effects, route change). */
const cuePlayed = new Set<string>()
export function playMomentCue(key: string, sound: SoundType | null): void {
    if (!sound || cuePlayed.has(key) || typeof window === "undefined") return
    cuePlayed.add(key)
    soundManager.play(sound)
}

/** Staged reveal: each block fades up after `delay` seconds (instant with reduced motion). */
export function useReveal() {
    const reduce = useAppReducedMotion()
    return (delay: number, y = 14) => ({
        initial: reduce ? false as const : { opacity: 0, y },
        animate: { opacity: 1, y: 0 },
        transition: { duration: reduce ? 0 : 0.45, delay: reduce ? 0 : delay, ease: EASE },
    })
}

const TONE_TEXT: Record<MomentTone, string> = { gold: "text-gold", positive: "text-positive", negative: "text-negative" }
const TONE_RULE: Record<MomentTone, string> = { gold: "bg-gold/60", positive: "bg-positive/60", negative: "bg-negative/60" }
const TONE_WASH: Record<MomentTone, string> = { gold: "from-gold/14", positive: "from-positive/12", negative: "from-negative/10" }

/** Small uppercase line above a headline. */
export function MomentOverline({ tone = "gold", children, className }: { tone?: MomentTone; children: ReactNode; className?: string }) {
    return <p className={cn("text-[13px] font-semibold uppercase tracking-[0.28em]", TONE_TEXT[tone], className)}>{children}</p>
}

/** The broadcast rule: a hairline that draws out from the centre. */
export function MomentRule({ tone = "gold", delay = 0.2, className }: { tone?: MomentTone; delay?: number; className?: string }) {
    const reduce = useAppReducedMotion()
    return (
        <motion.div
            aria-hidden="true"
            initial={reduce ? false : { scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : delay, ease: EASE }}
            className={cn("h-px w-full max-w-2xl origin-center", TONE_RULE[tone], className)}
        />
    )
}

export interface MomentFact {
    label: string
    value: ReactNode
    hint?: ReactNode
}

/** A row of facts, separated by hairlines (every value from the engine). */
export function MomentFacts({ facts, className }: { facts: MomentFact[]; className?: string }) {
    if (facts.length === 0) return null
    return (
        <dl className={cn("grid w-full divide-x divide-line overflow-hidden rounded-lg border border-line bg-panel", className)} style={{ gridTemplateColumns: `repeat(${facts.length}, minmax(0, 1fr))` }}>
            {facts.map(f => (
                <div key={f.label} className="min-w-0 px-6 py-4 text-left">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{f.label}</dt>
                    <dd className="mt-1.5 truncate font-display text-[34px] font-bold leading-none tabular-nums text-ink-1">{f.value}</dd>
                    {f.hint != null && <dd className="mt-1.5 text-xs text-ink-3">{f.hint}</dd>}
                </div>
            ))}
        </dl>
    )
}

export interface MomentFrameProps {
    momentKey: string
    /** id of the headline (dialog name). */
    labelledBy: string
    sound: SoundType | null
    tone?: MomentTone
    actionLabel?: string
    onDismiss: () => void
    children: ReactNode
    className?: string
}

/**
 * Full-screen frame of every moment: ink stage with one soft light from the
 * top in the moment's tone, the content, and one action. Enter, Space,
 * Escape or the button continue (after a short arm delay). Focus is trapped
 * while it is open; reduced motion shows everything at once.
 */
export function MomentFrame({ momentKey, labelledBy, sound, tone = "gold", actionLabel = "Continue", onDismiss, children, className }: MomentFrameProps) {
    const reduce = useAppReducedMotion()
    const [armed, setArmed] = useState(false)
    const armedRef = useRef(false)
    const dismissRef = useRef(onDismiss)
    dismissRef.current = onDismiss
    const buttonRef = useRef<HTMLButtonElement>(null)
    const closedRef = useRef(false)
    const close = () => {
        if (!armedRef.current || closedRef.current) return
        closedRef.current = true
        dismissRef.current()
    }
    const dialogRef = useFocusTrap(true, close)

    useEffect(() => {
        playMomentCue(momentKey, sound)
        const t = setTimeout(() => {
            armedRef.current = true
            setArmed(true)
            buttonRef.current?.focus({ preventScroll: true })
        }, reduce ? 150 : ARM_MS)
        return () => clearTimeout(t)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once per moment
    }, [momentKey])

    // Enter / Space continue from anywhere in the moment (the page underneath
    // never sees them: no Continue run, no live-match hotkeys).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Enter" && e.key !== " ") return
            const root = dialogRef.current
            const target = e.target as HTMLElement | null
            if (!root || (target && target !== document.body && !root.contains(target))) return
            if (target?.tagName === "BUTTON" && target !== buttonRef.current) return
            e.preventDefault()
            e.stopPropagation()
            if (!e.repeat) close()
        }
        window.addEventListener("keydown", onKey, true)
        return () => window.removeEventListener("keydown", onKey, true)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers read refs
    }, [])

    return (
        <motion.div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            data-moment={momentKey}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.25 }}
            className="fixed inset-0 z-celebration overflow-y-auto bg-ink outline-hidden"
        >
            <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 bg-radial-[ellipse_70%_55%_at_50%_0%] to-transparent", TONE_WASH[tone])} />
            <div aria-hidden="true" className={cn("pointer-events-none absolute inset-x-0 top-0 h-px", TONE_RULE[tone])} />
            <div className={cn("relative mx-auto flex min-h-full w-full max-w-6xl flex-col items-center justify-center px-10 py-12 text-center", className)}>
                {children}
                <motion.div
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: reduce ? 0 : 0.3, delay: reduce ? 0 : 0.9 }}
                    className="mt-10 flex flex-col items-center gap-2"
                >
                    <Button ref={buttonRef} onClick={close} disabled={!armed} className="h-12 min-w-[240px] px-10 text-base">
                        {actionLabel}
                    </Button>
                    <p className="text-xs text-ink-3">Enter or Space to continue</p>
                </motion.div>
            </div>
        </motion.div>
    )
}
