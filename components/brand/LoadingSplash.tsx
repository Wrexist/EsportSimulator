"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { useAppReducedMotion } from "@/lib/reduced-motion"
import { Logotype } from "./Logotype"
import styles from "./brand.module.css"

export interface LoadingSplashProps {
    /** Short status under the bar, e.g. "Preparing match". */
    label?: string
    className?: string
}

/**
 * Branded full-screen loading state: ink, the logotype and a thin gold shimmer.
 * Fades in after a beat so fast loads never flash it. Static under reduced motion.
 * Used by the route-level loading.tsx files of the full-screen routes.
 */
export function LoadingSplash({ label, className }: LoadingSplashProps) {
    const reducedMotion = useAppReducedMotion()
    // Static on the server and first client render; the shimmer starts after mount (hydration-safe).
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])
    const reduced = !mounted || reducedMotion
    return (
        <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            className={cn("relative flex min-h-dvh w-full flex-col items-center justify-center bg-ink", styles.splash, className)}
        >
            <Logotype size="hero" subtitle="FPS" height={112} decorative />
            <div className="mt-10 w-[220px]">
                <div className={styles.track}>
                    <div className={reduced ? styles.shimmerStatic : styles.shimmer} />
                </div>
            </div>
            <p aria-hidden="true" className="mt-4 h-4 text-xs font-medium uppercase tracking-[0.18em] text-ink-3">{label ?? ""}</p>
            <span className="sr-only">{label ?? "Loading"}</span>
        </div>
    )
}
