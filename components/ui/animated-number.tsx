"use client"

import { useEffect, useRef, useState } from "react"
import { isReducedMotionActive } from "@/lib/reduced-motion"

interface AnimatedNumberProps {
    /** Target value to animate to. */
    value: number
    /** Animation duration in ms (default 650). */
    duration?: number
    /** Format the (fractional, mid-tween) number for display. Defaults to
     *  rounded `toLocaleString()`. */
    format?: (n: number) => string
    className?: string
    /** Count up from `startValue` on first mount instead of snapping. Use for
     *  one-shot reveals (e.g. a championship prize) where the climb is the point. */
    animateOnMount?: boolean
    /** Where the count-up starts when `animateOnMount` is set (default 0). */
    startValue?: number
}

/**
 * Count-up / count-down display. Tweens from the previous value to the new one
 * with an ease-out curve so money/stat changes feel earned instead of snapping.
 *
 * - rAF-driven (one piece of state, cancelled on unmount/retarget) — cheap.
 * - Respects the in-game Reduced motion setting and `prefers-reduced-motion`
 *   (snaps straight to the final value, including `animateOnMount` reveals).
 * - First mount snaps (no count-up from 0) so a freshly-loaded screen isn't
 *   noisy; only subsequent value changes animate.
 */
export function AnimatedNumber({ value, duration = 650, format, className, animateOnMount = false, startValue = 0 }: AnimatedNumberProps) {
    // Initial state must match the server render; reduced motion snaps to the
    // final value in the first effect below (before any tween frame).
    const [display, setDisplay] = useState(animateOnMount ? startValue : value)
    const fromRef = useRef(animateOnMount ? startValue : value)
    const rafRef = useRef<number | undefined>(undefined)
    const mountedOnce = useRef(false)

    useEffect(() => {
        const isFirst = !mountedOnce.current
        mountedOnce.current = true
        const from = fromRef.current
        const to = value

        // Snap on first render (default) or when nothing changed. The one
        // exception is an animateOnMount reveal, which counts from `startValue`.
        if ((isFirst && !animateOnMount) || from === to || !Number.isFinite(from) || !Number.isFinite(to)) {
            fromRef.current = to
            setDisplay(to)
            return
        }

        // Honor reduced-motion: snap rather than animate.
        // Checks both the in-game setting and the OS preference.
        if (isReducedMotionActive()) {
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
        // eslint-disable-next-line react-hooks/exhaustive-deps -- animateOnMount only affects the first run; toggling it later must not restart/cancel a tween
    }, [value, duration])

    return (
        <span className={className}>
            {format ? format(display) : Math.round(display).toLocaleString()}
        </span>
    )
}
