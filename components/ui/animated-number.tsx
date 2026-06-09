"use client"

import { useEffect, useRef, useState } from "react"

interface AnimatedNumberProps {
    /** Target value to animate to. */
    value: number
    /** Animation duration in ms (default 650). */
    duration?: number
    /** Format the (fractional, mid-tween) number for display. Defaults to
     *  rounded `toLocaleString()`. */
    format?: (n: number) => string
    className?: string
}

/**
 * Count-up / count-down display. Tweens from the previous value to the new one
 * with an ease-out curve so money/stat changes feel earned instead of snapping.
 *
 * - rAF-driven (one piece of state, cancelled on unmount/retarget) — cheap.
 * - Respects `prefers-reduced-motion` (snaps instantly).
 * - First mount snaps (no count-up from 0) so a freshly-loaded screen isn't
 *   noisy; only subsequent value changes animate.
 */
export function AnimatedNumber({ value, duration = 650, format, className }: AnimatedNumberProps) {
    const [display, setDisplay] = useState(value)
    const fromRef = useRef(value)
    const rafRef = useRef<number | undefined>(undefined)
    const mountedOnce = useRef(false)

    useEffect(() => {
        const from = fromRef.current
        const to = value

        // First render or no change → snap.
        if (!mountedOnce.current || from === to || !Number.isFinite(from) || !Number.isFinite(to)) {
            mountedOnce.current = true
            fromRef.current = to
            setDisplay(to)
            return
        }

        // Honor reduced-motion: snap rather than animate.
        if (typeof window !== "undefined" &&
            window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
            fromRef.current = to
            setDisplay(to)
            return
        }

        let start = 0
        const tick = (ts: number) => {
            if (!start) start = ts
            const p = Math.min(1, (ts - start) / duration)
            const eased = 1 - Math.pow(1 - p, 3) // easeOutCubic
            setDisplay(from + (to - from) * eased)
            if (p < 1) {
                rafRef.current = requestAnimationFrame(tick)
            } else {
                fromRef.current = to
            }
        }
        rafRef.current = requestAnimationFrame(tick)

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
            // If interrupted mid-tween, treat the current display as the new
            // baseline so the next change animates from where we actually are.
            fromRef.current = value
        }
    }, [value, duration])

    return (
        <span className={className}>
            {format ? format(display) : Math.round(display).toLocaleString()}
        </span>
    )
}
